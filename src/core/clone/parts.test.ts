import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claim, create, log, type Context } from "../board/actions.ts";
import { CONFIG_FILE, type CloneConfig } from "../board/config.ts";
import { commit, submit } from "../board/lifecycle.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "../board/testing.ts";
import { Refusal } from "../errors.ts";
import { partsOf, sharedBy } from "./parts.ts";

const CLONE: CloneConfig = {
  records: "parity",
  url: "http://127.0.0.1:5173",
  colours: "own",
  font: "own",
  shared: ["src/design/", "src/app.tsx"],
  parts: {
    shell: { path: "/", files: ["src/shell/"] },
    tasks: { path: "/tasks", files: ["src/tasks/", "src/board/task.ts"] },
    memory: { path: "/memory" },
  },
};

test("a change can change the parts whose paths it touches, and every part when it touches what all share", () => {
  assert.deepEqual(partsOf(CLONE, ["src/shell/rail.tsx"]), ["shell"]);
  assert.deepEqual(partsOf(CLONE, ["src/board/task.ts", "src/shell/"]), ["shell", "tasks"]);
  assert.deepEqual(partsOf(CLONE, ["src/"]), ["shell", "tasks", "memory"], "a directory above what is shared holds it");
  assert.deepEqual(partsOf(CLONE, ["src/design/tokens.css"]), ["shell", "tasks", "memory"]);
  assert.deepEqual(partsOf(CLONE, ["docs/notes.md", "src/shellfish.ts"]), [], "a part that names no path is changed by no path alone");
  assert.deepEqual(sharedBy(CLONE, ["src/app.tsx", "src/shell/rail.tsx"]), ["src/app.tsx"]);
});

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
  writeFileSync(join(context.places.root, CONFIG_FILE), JSON.stringify({ clone: CLONE }));
});
afterEach(() => at.remove());

const build = (title: string, writes: string[]) =>
  create(context, OWNER, { title, kind: "build", priority: 1, writes, checks: ["true"], context: "Why.", doneWhen: "- Done.", outOfScope: "Rest." })
    .fields.id;

test("a submit adds the comparison of each part its change can change to the task's checks, once", () => {
  const id = build("The rail of the shell", ["src/shell/", "src/tasks/"]);
  const { claim: hold } = claim(context, CODEX, id);
  mkdirSync(dirname(join(hold.tree, "src/shell/rail.tsx")), { recursive: true });
  writeFileSync(join(hold.tree, "src/shell/rail.tsx"), "export const rail = 1;\n");
  commit(context, CODEX, id, "The rail");
  log(context, CODEX, id, "Did: the rail.");
  const { task } = submit(context, CODEX, id);
  assert.deepEqual(task.fields.checks, ["true", "agentree compare shell"], "the part its paths allow and its change did not touch is not compared");
  assert.match(task.log.at(-1)!.text, /Its change can change shell: its comparison is among its checks\.$/);
});

test("a task that writes what every part shares is claimed only on the owner's word", () => {
  const id = build("The tokens of the design", ["src/design/tokens.css"]);
  assert.throws(
    () => claim(context, CODEX, id),
    (error) =>
      error instanceof Refusal && /writes what every part shares \(src\/design\/tokens\.css\): its submit compares all 3 parts/.test(error.message),
  );
  assert.equal(claim(context, CURSOR, id, { ownerTold: true }).task.fields.status, "in-progress");
});
