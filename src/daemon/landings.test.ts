import assert from "node:assert/strict";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claim, create, log, type Context } from "../core/board/actions.ts";
import { CONFIG_FILE } from "../core/board/config.ts";
import { accept, check, commit, review, submit } from "../core/board/lifecycle.ts";
import { setUpTree } from "../core/board/setup.ts";
import { readBoard, taskOf } from "../core/board/store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "../core/board/testing.ts";
import { git } from "../core/git.ts";
import { runWaitingLandings } from "./landings.ts";
import { createQueue, type Ask, type Queue } from "./queue.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
});

afterEach(() => at.remove());

const statusOf = (id: string) => taskOf(readBoard(context.places), id).task.fields.status;
const main = (...args: string[]) => git(context.places.root, ...args);

/** A task built, checked and accepted by another tool, whose change is one file. */
function accepted(file: string, checks: string[]) {
  const task = create(context, OWNER, {
    title: `Add ${file}`,
    kind: "build",
    priority: 1,
    writes: [file],
    checks,
    context: "Why.",
    doneWhen: "- Done.",
    outOfScope: "Rest.",
  });
  const id = task.fields.id;
  const { claim: hold } = claim(context, CODEX, id);
  setUpTree(context, id);
  mkdirSync(dirname(join(hold.tree, file)), { recursive: true });
  writeFileSync(join(hold.tree, file), `${file}\n`);
  commit(context, CODEX, id, `Add ${file}`);
  log(context, CODEX, id, `Did: ${file}.`);
  submit(context, CODEX, id);
  check(context, id);
  review(context, CURSOR, id);
  accept(context, CURSOR, id, "Read the diff.");
  return id;
}

/** A commit on main made by hand, so that what was accepted is stale. */
function byHand(file: string) {
  writeFileSync(join(context.places.root, file), `${file}\n`);
  main("add", file);
  main("commit", "--quiet", "-m", `${file} by hand`);
}

/** A queue that records what it is asked and runs each command at once, as a real one would in its turn. */
function recording(): { queue: Queue; asks: Ask[] } {
  const real = createQueue({ home: join(at.home, "machine") });
  const asks: Ask[] = [];
  return { queue: { ...real, run: (ask: Ask) => (asks.push(ask), real.run({ ...ask, heavy: false })) }, asks };
}

test("the daemon lands the accepted tasks in the order they were accepted, each rebase's checks first in the queue", async () => {
  const one = accepted("src/a.txt", ["test -f src/a.txt"]);
  const two = accepted("src/b.txt", ["test -f src/b.txt"]);
  byHand("hand.txt");
  const { queue, asks } = recording();
  await runWaitingLandings("project", context, queue);
  assert.deepEqual([statusOf(one), statusOf(two)], ["done", "done"]);
  assert.deepEqual(main("ls-files", "src").split("\n"), ["src/a.txt", "src/b.txt"]);
  assert.deepEqual(
    asks.map((ask) => [ask.task, ask.command, ask.what, ask.first]),
    [
      [one, "test -f src/a.txt", "check", true],
      [two, "test -f src/b.txt", "check", true],
    ],
  );
  assert.deepEqual(
    readdirSync(context.places.trees).filter((name) => name.startsWith("landing-")),
    [],
  );
});

test("a landing tree is set up before its checks, its setup a heavy run of the queue", async () => {
  writeFileSync(join(context.places.root, CONFIG_FILE), JSON.stringify({ setup: ["echo ready > .ready"] }));
  writeFileSync(join(context.places.root, ".gitignore"), ".ready\n");
  main("add", CONFIG_FILE, ".gitignore");
  main("commit", "--quiet", "-m", "The project's part");
  const id = accepted("src/a.txt", ["test -f .ready && test -f src/a.txt"]);
  byHand("hand.txt");
  const { queue, asks } = recording();
  await runWaitingLandings("project", context, queue);
  assert.equal(statusOf(id), "done");
  assert.deepEqual(
    asks.map((ask) => [ask.command, ask.first]),
    [
      ["echo ready > .ready", true],
      ["test -f .ready && test -f src/a.txt", true],
    ],
  );
  assert.equal(asks[0]!.heavy, true, "a setup is heavy whatever the project's part says of its command");
});

test("a look while a project's landings run starts none beside them", async () => {
  accepted("src/a.txt", ["test -f src/a.txt"]);
  byHand("hand.txt");
  const { queue, asks } = recording();
  const first = runWaitingLandings("project", context, queue);
  await runWaitingLandings("project", context, queue);
  await first;
  assert.equal(asks.length, 1);
});

test("with a batch named in the project's part, the daemon checks the accepted tasks together, each command once, and lands them together", async () => {
  writeFileSync(join(context.places.root, CONFIG_FILE), JSON.stringify({ landBatch: 3 }));
  const ids = [accepted("src/a.txt", ["test -f src/a.txt"]), accepted("src/b.txt", ["true"]), accepted("src/c.txt", ["true"])];
  byHand("hand.txt");
  const { queue, asks } = recording();
  await runWaitingLandings("project", context, queue);
  assert.deepEqual(ids.map(statusOf), ["done", "done", "done"]);
  assert.deepEqual(
    asks.map((ask) => [ask.command, ask.first, /landing-batch-\d+$/.test(ask.cwd)]),
    [
      ["test -f src/a.txt", true, true],
      ["true", true, true],
    ],
  );
  assert.deepEqual(
    main("ls-files")
      .split("\n")
      .filter((file) => file.startsWith("src/") || file === "hand.txt"),
    ["hand.txt", "src/a.txt", "src/b.txt", "src/c.txt"],
  );
  assert.match(taskOf(readBoard(context.places), ids[1]!).task.log.at(-1)!.text, /in a batch with T-0001, T-0003, picked from/);
});

test("a batch that fails is split: the daemon lands what passes alone and sends the other back with its own failure", async () => {
  writeFileSync(join(context.places.root, CONFIG_FILE), JSON.stringify({ landBatch: 2 }));
  const one = accepted("src/a.txt", ["test -f src/a.txt"]);
  const two = accepted("src/b.txt", ["test ! -f src/a.txt"]);
  const { queue } = recording();
  await runWaitingLandings("project", context, queue);
  assert.deepEqual([statusOf(one), statusOf(two)], ["done", "ready"]);
  assert.match(taskOf(readBoard(context.places), two).task.log.at(-1)!.text, /Not landed: rebased on [0-9a-f]{12}, its checks fail/);
});
