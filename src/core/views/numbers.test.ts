import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claim, create, log, type Context } from "../board/actions.ts";
import { accept, check, commit, reject, review, submit } from "../board/lifecycle.ts";
import { readBoard } from "../board/store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "../board/testing.ts";
import { numbersView } from "./numbers.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
});
afterEach(() => at.remove());

const MINUTE = 60_000;
const numbers = () => numbersView(readBoard(context.places), context.now());

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

test("a board with no task has no number, and none is made up", () => {
  assert.deepEqual(numbers(), {
    timeIn: [],
    reviews: { accepted: 0, rejected: 0, rejectedShare: 0 },
    wait: { runs: 0, medianMs: 0, longestMs: 0 },
    failing: [],
    history: { review: Array(14).fill(0), ready: Array(14).fill(0) },
  });
});

test("the numbers are read from the Logs and from what the checks recorded", () => {
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
  task("b", ["true"]);
  task("c", ["true", "test -f src/missing.txt"]);
  at.advance(10 * MINUTE);
  submitted("T-0001", "a.txt");
  submitted("T-0002", "b.txt");
  submitted("T-0003", "c.txt");
  at.advance(30 * MINUTE);
  review(context, CURSOR, "T-0001");
  accept(context, CURSOR, "T-0001", "Read.");
  review(context, CURSOR, "T-0002");
  reject(context, CURSOR, "T-0002", "- src/b.txt holds nothing of the task.");
  at.advance(20 * MINUTE);

  const read = numbers();
  assert.deepEqual(read.reviews, { accepted: 1, rejected: 1, rejectedShare: 0.5 });
  const ready = readBoard(context.places).tasks.filter(({ task }) => task.fields.status === "ready").length;
  assert.deepEqual(
    [read.history.review.at(-1), read.history.ready.at(-1), read.history.review.length],
    [0, ready, 14],
    "today's count is the board's own",
  );
  assert.deepEqual([read.history.review[0], read.history.ready[0]], [0, 0], "before a task was created it was in no status");
  assert.deepEqual(read.failing, [{ command: "test -f src/missing.txt", runs: 1, failed: 1 }], "a command that always passed is not listed");
  assert.equal(read.wait.runs, 4);
  // The board's clock moves a second with each act: the times are told to the minute.
  const minutes = (ms: number) => Math.round(ms / MINUTE);
  const time = Object.fromEntries(read.timeIn.map((each) => [each.status, [each.tasks, minutes(each.medianMs), minutes(each.longestMs)]]));
  assert.deepEqual(time.ready, [3, 10, 30], "the task sent back is ready again, and its two stays count as one time");
  assert.deepEqual(time.review, [2, 30, 30]);
  assert.deepEqual(time.accepted, [1, 20, 20]);
});
