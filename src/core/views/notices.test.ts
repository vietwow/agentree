import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { answer, ask, claim, create, log, type Context } from "../board/actions.ts";
import { check, commit, submit } from "../board/lifecycle.ts";
import { readBoard } from "../board/store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "../board/testing.ts";
import { lookAt, noticesBetween } from "./notices.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
});
afterEach(() => at.remove());

const look = () => lookAt(readBoard(context.places));

/** Builds a task's one file and submits it; its checks run at once. */
function submitted(id: string, file: string) {
  const { claim: hold } = claim(context, CODEX, id);
  mkdirSync(join(hold.tree, "src"), { recursive: true });
  writeFileSync(join(hold.tree, "src", file), "x\n");
  commit(context, CODEX, id, "The change");
  log(context, CODEX, id, "Did: it.");
  submit(context, CODEX, id);
  check(context, id);
}

test("a notice is the difference of two looks: a question asked, a check that failed, a task that waits for a review, each told once", () => {
  const task = (title: string, checks: string[]) =>
    create(context, OWNER, {
      title,
      kind: "build",
      priority: 2,
      writes: [`src/${title}.txt`],
      context: "Why.",
      doneWhen: "- Done.",
      outOfScope: "Rest.",
      checks,
    });
  task("a", ["true"]);
  task("b", ["test -f src/missing.txt"]);
  task("c", ["true"]);
  const first = look();
  assert.deepEqual(noticesBetween(first, first), []);

  submitted("T-0001", "a.txt");
  submitted("T-0002", "b.txt");
  claim(context, CURSOR, "T-0003");
  ask(context, CURSOR, "T-0003", "Which port does the daemon take?", ["4517", "Another"]);
  const second = look();
  assert.deepEqual(noticesBetween(first, second), [
    { kind: "review", task: "T-0001", title: "a", text: "It waits for a review." },
    { kind: "check-failed", task: "T-0002", title: "b", text: "test -f src/missing.txt failed" },
    { kind: "question", task: "T-0003", title: "c", text: "Which port does the daemon take?" },
  ]);
  assert.deepEqual(noticesBetween(second, look()), [], "what was told is not told again");

  answer(context, OWNER, "T-0003", "4517.");
  assert.deepEqual(noticesBetween(second, look()), [], "an answer is no notice");
  assert.deepEqual(noticesBetween(new Map(), second).length, 3, "a task that is new to a look is told of as any other");
});
