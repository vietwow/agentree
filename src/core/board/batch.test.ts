import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { git } from "../git.ts";
import { claim, create, log, type Actor, type Context } from "./actions.ts";
import { accept, check, commit, land, landBatch, review, submit, waitingToLand } from "./lifecycle.ts";
import { readBoard, taskOf } from "./store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "./testing.ts";

let at: Project;
let context: Context;
let count: string;

beforeEach(() => {
  at = project();
  ({ context } = at);
  count = join(at.home, "runs.txt");
});
afterEach(() => at.remove());

const main = (...args: string[]) => git(context.places.root, ...args);
const task = (id: string) => taskOf(readBoard(context.places), id).task;
const runs = () => (existsSync(count) ? readFileSync(count, "utf8").trim().split("\n").length : 0);
const landingTrees = () => readdirSync(context.places.trees).filter((name) => name.startsWith("landing-"));

/** Writes a task of one file, builds it, and takes it to accepted; its check counts its runs, and fails once a file named `broken` is there. */
function accepted(file: string, builder: Actor, reviewer: Actor, text = `${file}\n`) {
  const made = create(context, OWNER, {
    title: `The file ${file}`,
    kind: "build",
    priority: 2,
    context: "Why.",
    doneWhen: "- It is there.",
    outOfScope: "The rest.",
    writes: [file],
    checks: [`echo run >> ${count} && test ! -f src/broken-with-b.txt -o ! -f src/b.txt`],
  });
  const { id } = made.fields;
  const { claim: hold } = claim(context, builder, id);
  mkdirSync(dirname(join(hold.tree, file)), { recursive: true });
  writeFileSync(join(hold.tree, file), text);
  commit(context, builder, id, `${id}: ${file}`);
  log(context, builder, id, "Did: the file.");
  submit(context, builder, id);
  check(context, id);
  review(context, reviewer, id);
  accept(context, reviewer, id, "Read.");
  return { id, tree: hold.tree };
}

test("accepted tasks are checked together and landed together: one run of their check, one fast-forward, each done with the others named", () => {
  accepted("src/a.txt", CODEX, CURSOR);
  accepted("src/b.txt", CURSOR, CODEX);
  const third = accepted("src/c.txt", CODEX, CURSOR);
  assert.deepEqual(landBatch(context, 1), [], "a batch of one is no batch");
  const before = runs();
  assert.deepEqual(landBatch(context, 3), ["T-0001", "T-0002", "T-0003"]);
  assert.equal(runs() - before, 1, "the members' one command ran once for all of them");
  assert.deepEqual(main("ls-files", "src").split("\n"), ["src/a.txt", "src/b.txt", "src/c.txt"]);
  assert.equal(
    main("log", "--format=%p")
      .split("\n")
      .some((parents) => parents.includes(" ")),
    false,
    "main holds no merge commit",
  );
  assert.deepEqual(
    ["T-0001", "T-0002", "T-0003"].map((id) => task(id).fields.status),
    ["done", "done", "done"],
  );
  assert.match(
    task("T-0001").log.at(-1)!.text,
    /Landed on main as [0-9a-f]{12}, in a batch with T-0002, T-0003\.$/,
    "the first is ahead of main: it lands as the commit that was reviewed",
  );
  assert.match(task("T-0002").log.at(-1)!.text, /in a batch with T-0001, T-0003, picked from [0-9a-f]{12}; the pick changed nothing of its diff\.$/);
  assert.deepEqual([existsSync(third.tree), landingTrees(), waitingToLand(context)], [false, [], []]);
});

test("a batch stops at its bound, and leaves out a task whose branch moved since its review", () => {
  accepted("src/a.txt", CODEX, CURSOR);
  const second = accepted("src/b.txt", CURSOR, CODEX);
  accepted("src/c.txt", CODEX, CURSOR);
  accepted("src/d.txt", CURSOR, CODEX);
  writeFileSync(join(second.tree, "src/b.txt"), "changed after the review\n");
  git(second.tree, "commit", "--quiet", "-am", "After the review");
  assert.deepEqual(landBatch(context, 2), ["T-0001", "T-0003"], "the second is left for its single landing, and the fourth is past the bound");
  assert.deepEqual(
    ["T-0002", "T-0004"].map((id) => task(id).fields.status),
    ["accepted", "accepted"],
  );
  assert.match(land(context, "T-0002").why ?? "", /is at [0-9a-f]{12}, not at the commit that was checked and reviewed/);
});

test("a batch whose check fails lands nothing, and its tasks land singly, each with its own checks", () => {
  accepted("src/broken-with-b.txt", CODEX, CURSOR);
  accepted("src/b.txt", CURSOR, CODEX);
  const head = main("rev-parse", "HEAD");
  assert.deepEqual(landBatch(context, 2), [], "the two pass alone and fail together");
  assert.deepEqual(
    [main("rev-parse", "HEAD"), task("T-0001").fields.status, task("T-0002").fields.status, landingTrees()],
    [head, "accepted", "accepted", []],
  );
  assert.equal(land(context, "T-0001").task.fields.status, "done");
  const second = land(context, "T-0002");
  assert.equal(second.task.fields.status, "ready");
  assert.match(second.why ?? "", /^Not landed: rebased on [0-9a-f]{12}, its checks fail:/);
});
