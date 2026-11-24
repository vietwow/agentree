import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claim, create, move, release, type Context } from "./actions.ts";
import { CONFIG_FILE } from "./config.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "./testing.ts";
import { sweepTrees, treeIds, trees } from "./trees.ts";
import { Refusal } from "../errors.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
  for (const title of ["a", "b", "c"])
    create(context, OWNER, { title, kind: "research", priority: 1, context: "Why.", doneWhen: "- Done.", outOfScope: "Rest." });
});
afterEach(() => at.remove());

test("a project that names a bound keeps that many trees at most: one more claim is refused, and a tree that is there is claimed again", () => {
  writeFileSync(join(context.places.root, CONFIG_FILE), JSON.stringify({ maxTrees: 2 }));
  claim(context, CODEX, "T-0001");
  claim(context, CURSOR, "T-0002");
  release(context, CODEX, "T-0001", "Did: nothing. Left: all of it.");
  assert.throws(
    () => claim(context, CODEX, "T-0003"),
    (error) => error instanceof Refusal && /keeps 2 trees at most and has 2 \(T-0001, T-0002\)/.test(error.message),
  );
  assert.equal(claim(context, CODEX, "T-0001").task.fields.status, "in-progress", "its tree is there already");
  assert.deepEqual(treeIds(context.places), ["T-0001", "T-0002"]);
});

test("the trees of dropped tasks are removed, and one with a change no commit has stays", () => {
  const first = claim(context, CODEX, "T-0001").claim.tree;
  release(context, CODEX, "T-0001", "Did: nothing.");
  const second = claim(context, CODEX, "T-0002").claim.tree;
  writeFileSync(join(second, "note.txt"), "not committed\n");
  release(context, CODEX, "T-0002", "Did: a note, not committed.");
  claim(context, CODEX, "T-0003");
  move(context, OWNER, "T-0001", "dropped", "Not needed.");
  move(context, OWNER, "T-0002", "dropped", "Not needed.");

  assert.deepEqual(
    trees(context).map((tree) => [tree.id, tree.status, tree.held, tree.changed]),
    [
      ["T-0001", "dropped", false, false],
      ["T-0002", "dropped", false, true],
      ["T-0003", "in-progress", true, false],
    ],
  );
  assert.deepEqual(sweepTrees(context), { removed: ["T-0001"], stayed: [{ id: "T-0002", why: "it holds a change no commit has" }] });
  assert.deepEqual([existsSync(first), existsSync(second)], [false, true]);
  assert.deepEqual(sweepTrees(context).removed, []);
});
