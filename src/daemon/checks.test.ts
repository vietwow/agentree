import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claim, create, log, type Context } from "../core/board/actions.ts";
import { CONFIG_FILE } from "../core/board/config.ts";
import { commit, submit } from "../core/board/lifecycle.ts";
import { checksOf, claimOf, putChecks } from "../core/board/state.ts";
import { readBoard, taskOf } from "../core/board/store.ts";
import { CODEX, OWNER, project, type Project } from "../core/board/testing.ts";
import { git } from "../core/git.ts";
import { thisRunner } from "../core/machine/runner.ts";
import { runWaitingChecks } from "./checks.ts";
import { createQueue } from "./queue.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
});

afterEach(() => at.remove());

const statusOf = (id: string) => taskOf(readBoard(context.places), id).task.fields.status;

function submitted(checks: string[]) {
  create(context, OWNER, {
    title: "The core",
    kind: "build",
    priority: 1,
    writes: ["src/"],
    checks,
    context: "Why.",
    doneWhen: "- Done.",
    outOfScope: "Rest.",
  });
  const { claim: hold } = claim(context, CODEX, "T-0001");
  mkdirSync(join(hold.tree, "src"));
  writeFileSync(join(hold.tree, "src/a.txt"), "a\n");
  commit(context, CODEX, "T-0001", "Add a");
  log(context, CODEX, "T-0001", "Did: a.");
  submit(context, CODEX, "T-0001");
}

test("the daemon runs the checks that wait, the heavy ones through the queue, and the task goes to review", async () => {
  writeFileSync(join(context.places.root, CONFIG_FILE), JSON.stringify({ heavy: ["^sleep"] }));
  git(context.places.root, "add", CONFIG_FILE);
  git(context.places.root, "commit", "--quiet", "-m", "The project's part");
  submitted(["test -f src/a.txt", 'sleep 0.1 && test "$AGENTREE_SEAT" = 1']);
  const queue = createQueue({ home: join(at.home, "machine"), machine: { cores: 4, memory: 8 }, loadAverage: () => 0.4 });
  queue.read(0.1);
  const first = runWaitingChecks("project", context, queue);
  await runWaitingChecks("project", context, queue);
  assert.equal(statusOf("T-0001"), "checking", "a second look starts nothing while the first runs");
  await first;
  assert.equal(statusOf("T-0001"), "review");
  assert.deepEqual(
    checksOf(context.places, "T-0001")!.runs.map((run) => run.result),
    ["passed", "passed"],
  );
  assert.deepEqual(
    queue
      .view()
      .decisions.filter((decision) => decision.kind === "start")
      .map((decision) => decision.task),
    ["T-0001"],
  );
});

test("checks left running by a process that ended run again, and the task is settled", async () => {
  submitted(["test -f src/a.txt"]);
  const { commit: checked } = checksOf(context.places, "T-0001")!;
  const ended = spawnSync("true").pid;
  putChecks(context.places, "T-0001", { commit: checked, state: "running", runs: [], runner: { pid: ended, since: new Date().toISOString() } });
  await runWaitingChecks("project", context, createQueue({ home: join(at.home, "machine") }));
  assert.equal(statusOf("T-0001"), "review");
  assert.deepEqual(
    checksOf(context.places, "T-0001")!.runs.map((run) => run.result),
    ["passed"],
  );
});

test("checks that run in a process that still runs are left to it", async () => {
  submitted(["test -f src/a.txt"]);
  const { commit: checked } = checksOf(context.places, "T-0001")!;
  putChecks(context.places, "T-0001", { commit: checked, state: "running", runs: [], runner: thisRunner() });
  await runWaitingChecks("project", context, createQueue({ home: join(at.home, "machine") }));
  assert.equal(statusOf("T-0001"), "checking");
  assert.equal(checksOf(context.places, "T-0001")!.state, "running");
});

test("a check that fails in the daemon's queue gives the task back to its worker", async () => {
  submitted(["echo broken && exit 1"]);
  await runWaitingChecks("project", context, createQueue({ home: join(at.home, "machine") }));
  assert.equal(statusOf("T-0001"), "in-progress");
  assert.equal(claimOf(context.places, "T-0001")!.by, "codex/gpt-5");
  assert.equal(checksOf(context.places, "T-0001")!.runs[0]!.output, "broken");
});
