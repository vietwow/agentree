import assert from "node:assert/strict";
import { test } from "node:test";
import { fileName, parseTask, renderTask, TO_BE_WRITTEN } from "./file.ts";
import { statusChange, statusLine, type Task } from "./model.ts";

const task: Task = {
  fields: {
    id: "T-0003",
    title: "The daemon's events: a board that isn't polled",
    status: "in-progress",
    kind: "build",
    priority: 2,
    parent: "T-0001",
    rfc: "0001",
    step: "3",
    dependsOn: ["T-0002"],
    writes: ["src/daemon/"],
    appends: ["package.json"],
    needs: ["docker"],
    checks: ["pnpm test # all of it", "node --test 'src/daemon/**'"],
    created: "2026-11-24T10:00:00Z",
  },
  context: "Why it is needed.\n\nA second paragraph, with a list:\n\n- one\n- two",
  doneWhen: "- The browser hears each change.",
  outOfScope: "Writes from the UI.",
  subtasks: [
    { title: "The event stream", done: true },
    { title: "One stream a tab", done: false },
  ],
  questions: [
    {
      at: "2026-11-24T10:05:00Z",
      by: "codex/gpt-5",
      text: "Which port?",
      choices: ["4517", "another"],
      answeredAt: "2026-11-24T10:20:00Z",
      answer: "4517.",
    },
    { at: "2026-11-24T11:00:00Z", by: "codex/gpt-5", text: "Keep the old path?", choices: [] },
  ],
  log: [
    { at: "2026-11-24T10:00:00Z", by: "person/owner", text: "Created as ready." },
    { at: "2026-11-24T10:01:00Z", by: "codex/gpt-5", text: `${statusLine("ready", "in-progress")}\n\nClaimed by codex/gpt-5.` },
  ],
};

test("a task written and read again is the same task", () => {
  assert.deepEqual(parseTask(renderTask(task)), task);
});

test("a task file has one form: writing what was read changes nothing", () => {
  const text = renderTask(task);
  assert.equal(renderTask(parseTask(text)), text);
});

test("an unwritten task says so in each section", () => {
  const blank: Task = { ...task, context: "", doneWhen: "", outOfScope: "", subtasks: [], questions: [], log: [] };
  const text = renderTask(blank);
  assert.match(text, /## Context\n\nTo be written\.\n/);
  assert.match(text, /## Subtasks\n\nNo subtask\.\n/);
  assert.match(text, /## Log\n\nNo entry yet\.\n$/);
  const read = parseTask(text);
  assert.equal(read.context, TO_BE_WRITTEN);
  assert.deepEqual([read.subtasks, read.questions, read.log], [[], [], []]);
});

test("a file that is no task says what is wrong with it", () => {
  const text = renderTask(task);
  assert.throws(() => parseTask("# A note\n"), /no frontmatter/);
  assert.throws(() => parseTask(text.replace("status: in-progress", "status: started")), /"status" is "started"/);
  assert.throws(() => parseTask(text.replace("priority: 2", "priority: soon")), /"priority" is "soon"/);
  assert.throws(() => parseTask(text.replace("kind: build\n", "kind: build\nclaim: someone\n")), /"claim" is not a task's/);
  assert.throws(() => parseTask(text.replace("## Done when", "## Finished when")), /"## Done when" is missing/);
  assert.throws(() => parseTask(text.replace("- [ ] One stream a tab", "* One stream a tab")), /under "## Subtasks"/);
  assert.throws(
    () => parseTask(text.replace("### 2026-11-24 10:00:00, person/owner", "Earlier:\n\n### 2026-11-24 10:00:00, person/owner")),
    /above its first entry/,
  );
});

test("a change of status is read back from its Log entry", () => {
  assert.deepEqual(statusChange(task.log[1]!), { from: "ready", to: "in-progress" });
  assert.equal(statusChange(task.log[0]!), undefined);
});

test("a task's file is named by its id and its title's words", () => {
  assert.equal(
    fileName({ id: "T-0003", title: "The daemon's events: a board that isn't polled" }),
    "T-0003-the-daemon-s-events-a-board-that-isn-t-polled.md",
  );
  assert.equal(fileName({ id: "T-0004", title: "…" }), "T-0004.md");
});
