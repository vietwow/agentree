import assert from "node:assert/strict";
import { test } from "node:test";
import type { Task } from "../task/model.ts";
import { formNotes } from "./rules.ts";

test("a card is held to the board's form: what it lacks is said in words, and a card that has all of it gets no note", () => {
  const card = (more: Partial<Task["fields"]>, sections: Partial<Pick<Task, "context" | "doneWhen" | "outOfScope" | "subtasks">> = {}): Task => ({
    fields: {
      id: "T-0001",
      title: "Refuse a write when the file changed since it was read",
      status: "backlog",
      kind: "build",
      priority: 1,
      parent: "",
      rfc: "",
      step: "",
      dependsOn: [],
      writes: ["src/store.ts"],
      appends: [],
      needs: [],
      checks: ["pnpm test"],
      created: "2026-11-24T10:00:00Z",
      ...more,
    },
    context: "A task file is read and written back. A write that finds another text is refused.",
    doneWhen: "- A write after another write is refused.\n- pnpm test passes.",
    outOfScope: "Merging the two changes.",
    subtasks: [
      { title: "Keep the text at its read", done: false },
      { title: "Refuse on another text", done: false },
    ],
    questions: [],
    log: [],
    ...sections,
  });
  assert.deepEqual(formNotes(card({})), []);
  assert.deepEqual(
    formNotes(card({ title: "Store." }, { context: "Fix it.", doneWhen: "It works", outOfScope: "", subtasks: [] })).map(
      (note) => note.split(/[,:]/)[0],
    ),
    [
      "its title says what the change does",
      "its title is a line",
      "its Context is two sentences at least",
      'its "Done when" is a list of two lines at least',
      'its "Out of scope" names what a worker might do and must not',
      "its steps are 2 to 6 subtasks",
    ],
  );
  assert.deepEqual(formNotes(card({ checks: [] })), ["it names a check: a command that passes when it is done"]);
  assert.deepEqual(
    formNotes(card({ writes: [], title: "The core split from the seed" }, { doneWhen: "", outOfScope: "", subtasks: [] })),
    [],
    "a parent names no paths, and is held to its title and its Context",
  );
  assert.deepEqual(
    formNotes(card({ kind: "research", writes: ["docs/notes/queue.md"], checks: [] }, { subtasks: [] })),
    [],
    "a research task has no steps to tick and no check",
  );
});
