import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { Refusal } from "../errors.ts";
import { claim, create, log, type Context } from "./actions.ts";
import { comment, diffOf, uncomment } from "./comments.ts";
import { accept, check, commit, reject, review, submit } from "./lifecycle.ts";
import { commentsOf } from "./state.ts";
import { readBoard, taskOf } from "./store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "./testing.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
  create(context, OWNER, {
    title: "The core",
    kind: "build",
    priority: 1,
    writes: ["src/"],
    checks: ["true"],
    context: "Why.",
    doneWhen: "- Done.",
    outOfScope: "Rest.",
  });
  const { claim: hold } = claim(context, CODEX, "T-0001");
  mkdirSync(join(hold.tree, "src"), { recursive: true });
  writeFileSync(join(hold.tree, "src/a.ts"), "export const a = 1;\nexport const b = 2;\n");
  commit(context, CODEX, "T-0001", "The change");
  log(context, CODEX, "T-0001", "Did: it.");
});
afterEach(() => at.remove());

const refused = (run: () => unknown, words: RegExp) => assert.throws(run, (error) => error instanceof Refusal && words.test(error.message));
const ON = { file: "src/a.ts", line: 2, text: "b is never read." };

test("a task's diff is read, and commented, while it is in review: on a line the diff shows, by another session than its builder's", () => {
  refused(() => diffOf(context.places, "T-0001"), /is in-progress: its diff is read, and commented, while it is in review/);
  submit(context, CODEX, "T-0001");
  check(context, "T-0001");
  const [file] = diffOf(context.places, "T-0001");
  assert.deepEqual([file!.path, file!.patch.split("\n").slice(-2)], ["src/a.ts", ["+export const a = 1;", "+export const b = 2;"]]);

  refused(() => comment(context, CODEX, "T-0001", ON), /a session does not review the task it built/);
  refused(() => comment(context, CURSOR, "T-0001", { ...ON, file: "src/other.ts" }), /is not a file T-0001 changed/);
  refused(() => comment(context, CURSOR, "T-0001", { ...ON, line: 9 }), /line 9 of src\/a\.ts is not in the diff/);
  refused(() => comment(context, CURSOR, "T-0001", { ...ON, text: " " }), /it is empty/);
  comment(context, CURSOR, "T-0001", ON);
  assert.equal(comment(context, OWNER, "T-0001", { ...ON, line: 1, text: "Name it for what it is." }).length, 2);
  refused(() => uncomment(context, CURSOR, "T-0001", 1), /the comment is person\/owner's/);
  assert.deepEqual(
    uncomment(context, OWNER, "T-0001", 1).map((each) => [each.file, each.line, each.by]),
    [["src/a.ts", 2, "cursor/composer-2"]],
  );
});

test("a comment is a finding: a task with comments is not accepted, and its rejection writes each into the entry", () => {
  submit(context, CODEX, "T-0001");
  check(context, "T-0001");
  review(context, CURSOR, "T-0001");
  comment(context, CURSOR, "T-0001", ON);
  refused(() => accept(context, CURSOR, "T-0001", "Read."), /has 1 comment on its diff: reject it with them, or remove them/);
  const task = reject(context, CURSOR, "T-0001", "");
  assert.deepEqual([task.fields.status, commentsOf(context.places, "T-0001")], ["ready", []]);
  assert.ok(
    taskOf(readBoard(context.places), "T-0001").task.log.at(-1)!.text.endsWith("- `src/a.ts:2`: b is never read."),
    "the comments alone are findings enough",
  );
});
