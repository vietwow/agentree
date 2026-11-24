import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { beat, claim, create, releaseStale, STALE_AFTER_MS, type Context } from "./actions.ts";
import { readOptions, setReleaseStale, setReviewOwnTasks } from "./options.ts";
import { claimOf } from "./state.ts";
import { readBoard, taskOf } from "./store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "./testing.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
});
afterEach(() => at.remove());

test("a stale claim waits for the owner unless the project's option has the daemon release it; its tree and its Log stay", () => {
  for (const title of ["a", "b"])
    create(context, OWNER, { title, kind: "research", priority: 1, context: "Why.", doneWhen: "- Done.", outOfScope: "Rest." });
  const { claim: held } = claim(context, CODEX, "T-0001");
  claim(context, CURSOR, "T-0002");
  at.advance(STALE_AFTER_MS + 60_000);
  beat(context, CURSOR, "T-0002");

  assert.deepEqual(releaseStale(context), [], "the option is off: a stale claim is the owner's to release");
  assert.equal(readOptions(context.places).releaseStale, false);
  setReleaseStale(context.places, true);
  setReviewOwnTasks(context.places, "codex", true);
  assert.deepEqual(
    [readOptions(context.places).releaseStale, readOptions(context.places).reviewOwnTasks.codex],
    [true, true],
    "each option keeps the other",
  );

  assert.deepEqual(releaseStale(context), ["T-0001"], "a claim that was beaten is not stale");
  const task = taskOf(readBoard(context.places), "T-0001").task;
  assert.deepEqual([task.fields.status, task.log.at(-1)!.by, claimOf(context.places, "T-0001")], ["ready", "daemon", undefined]);
  assert.match(task.log.at(-1)!.text, /Released by the daemon: codex\/gpt-5 has not been heard from since /);
  assert.ok(readFileSync(join(held.tree, ".git"), "utf8"), "the tree stays for the next worker");
  assert.deepEqual(releaseStale(context), []);

  setReleaseStale(context.places, false);
  assert.equal(readOptions(context.places).releaseStale, false);
  assert.equal(readFileSync(join(context.places.board, "work/options.yaml"), "utf8").match(/release-stale/g)?.length, 1);
});
