import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { Refusal } from "../errors.ts";
import { claim, convertSubtask, create, removeSubtask, type Context } from "./actions.ts";
import { readBoard, taskOf } from "./store.ts";
import { CODEX, OWNER, project, type Project } from "./testing.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
  create(context, OWNER, { title: "The core", kind: "build", priority: 1 });
  create(context, OWNER, {
    title: "Parse a task file",
    kind: "build",
    priority: 2,
    parent: "T-0001",
    rfc: "0001",
    writes: ["src/"],
    checks: ["true"],
    context: "Why.",
    doneWhen: "- Done.",
    outOfScope: "Rest.",
    subtasks: ["Read the front matter", "Write it back", "Keep the body"],
  });
});
afterEach(() => at.remove());

const refused = (run: () => unknown, words: RegExp) => assert.throws(run, (error) => error instanceof Refusal && words.test(error.message));
const steps = () => taskOf(readBoard(context.places), "T-0002").task.subtasks.map((each) => each.title);

test("the owner makes a subtask a task of its own, beside its task, or takes it off, while no worker has the task", () => {
  refused(() => convertSubtask(context, CODEX, "T-0002", 2), /is the owner's|owner/);
  refused(() => convertSubtask(context, OWNER, "T-0002", 9), /has no subtask 9; it has 3/);
  const made = convertSubtask(context, OWNER, "T-0002", 2);
  assert.deepEqual(
    [made.fields.id, made.fields.title, made.fields.parent, made.fields.kind, made.fields.priority, made.fields.rfc, made.fields.status],
    ["T-0003", "Write it back", "T-0001", "build", 2, "0001", "backlog"],
  );
  assert.match(made.context, /A step of T-0002, "Parse a task file", made a task of its own\./);
  assert.deepEqual(steps(), ["Read the front matter", "Keep the body"]);
  removeSubtask(context, OWNER, "T-0002", 1);
  assert.deepEqual(steps(), ["Keep the body"]);

  claim(context, CODEX, "T-0002");
  refused(() => convertSubtask(context, OWNER, "T-0002", 1), /is in-progress: a subtask is made a task while no worker has its task/);
  refused(() => removeSubtask(context, OWNER, "T-0002", 1), /is in-progress: a subtask is removed while no worker has its task/);
  assert.deepEqual(steps(), ["Keep the body"]);
});
