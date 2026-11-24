import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claim, create, log, release, type Context } from "../core/board/actions.ts";
import { CONFIG_FILE } from "../core/board/config.ts";
import { commit, submit } from "../core/board/lifecycle.ts";
import { putSetup, setupOf } from "../core/board/state.ts";
import { readBoard, taskOf } from "../core/board/store.ts";
import { CODEX, OWNER, project, type Project } from "../core/board/testing.ts";
import { git } from "../core/git.ts";
import { volumePrefix } from "./asks.ts";
import { runWaitingChecks } from "./checks.ts";
import { createQueue, type Queue } from "./queue.ts";
import { removeLeftVolumes, runWaitingSetups } from "./setup.ts";

let at: Project;
let context: Context;
let queue: Queue;

beforeEach(() => {
  at = project();
  ({ context } = at);
  queue = createQueue({ home: join(at.home, "machine"), machine: { cores: 4, memory: 8 }, loadAverage: () => 0.4 });
  queue.read(0.1);
});

afterEach(() => at.remove());

function configured(config: Record<string, unknown>) {
  writeFileSync(join(context.places.root, CONFIG_FILE), JSON.stringify(config));
  git(context.places.root, "add", CONFIG_FILE);
  git(context.places.root, "commit", "--quiet", "-m", "The project's part");
  create(context, OWNER, {
    title: "The core",
    kind: "build",
    priority: 1,
    writes: ["src/"],
    checks: ["test -f .ready && test -f src/a.txt"],
    context: "Why.",
    doneWhen: "- Done.",
    outOfScope: "Rest.",
  });
}

test("a new tree is set up by the daemon after its claim, and a check waits for it; a tree a claim before left is not set up again", async () => {
  configured({ setup: ["sleep 0.2", "echo ready > .ready"] });
  const { claim: hold } = claim(context, CODEX, "T-0001");
  assert.deepEqual(setupOf(context.places, "T-0001"), { state: "waiting", output: "" });
  mkdirSync(join(hold.tree, "src"));
  writeFileSync(join(hold.tree, "src/a.txt"), "a\n");
  writeFileSync(join(hold.tree, ".gitignore"), ".ready\n.gitignore\n");
  commit(context, CODEX, "T-0001", "Add a");
  log(context, CODEX, "T-0001", "Did: a.");
  submit(context, CODEX, "T-0001");
  await runWaitingChecks("project", context, queue);
  assert.equal(taskOf(readBoard(context.places), "T-0001").task.fields.status, "checking", "its checks wait while its tree is not set up");
  await runWaitingSetups("project", context, queue);
  assert.equal(setupOf(context.places, "T-0001")!.state, "done");
  assert.equal(readFileSync(join(hold.tree, ".ready"), "utf8"), "ready\n");
  await runWaitingChecks("project", context, queue);
  assert.equal(taskOf(readBoard(context.places), "T-0001").task.fields.status, "review");
});

test("a setup left running by a process that ended runs again to its end", async () => {
  configured({ setup: ["echo ready > .ready"] });
  const { claim: hold } = claim(context, CODEX, "T-0001");
  const ended = spawnSync("true").pid;
  putSetup(context.places, "T-0001", { state: "running", output: "", runner: { pid: ended, since: new Date().toISOString() } });
  await runWaitingSetups("project", context, queue);
  assert.equal(setupOf(context.places, "T-0001")!.state, "done");
  assert.equal(readFileSync(join(hold.tree, ".ready"), "utf8"), "ready\n");
});

test("a setup that fails says which command failed and what it said", async () => {
  configured({ setup: ["echo no lock file >&2; exit 1", "echo never"] });
  claim(context, CODEX, "T-0001");
  await runWaitingSetups("project", context, queue);
  assert.deepEqual(setupOf(context.places, "T-0001"), { state: "failed", output: "`echo no lock file >&2; exit 1` failed:\nno lock file" });
  release(context, CODEX, "T-0001", "Its setup fails.");
  claim(context, CODEX, "T-0001");
  assert.equal(setupOf(context.places, "T-0001")!.state, "failed", "the tree that was left is not set up again by a claim");
});

const docker = spawnSync("docker", ["image", "inspect", "alpine:3"], { stdio: "ignore" }).status === 0;

test(
  "a tree's dependencies are in a volume of its container, not on the host, and the volume goes when the tree is gone",
  { skip: docker ? false : "Docker, or its image alpine:3, is not there" },
  async () => {
    configured({ image: "alpine:3", volumes: ["deps"], setup: ["echo installed > deps/installed"] });
    const { claim: hold } = claim(context, CODEX, "T-0001");
    await runWaitingSetups("project", context, queue);
    assert.equal(setupOf(context.places, "T-0001")!.state, "done");
    assert.ok(!existsSync(join(hold.tree, "deps/installed")), "the host's tree holds no file of the volume");
    const volumes = () =>
      spawnSync("docker", ["volume", "ls", "--quiet", "--filter", `name=${volumePrefix("project")}`], { encoding: "utf8" })
        .stdout.split("\n")
        .filter(Boolean);
    assert.deepEqual(volumes(), ["agentree-project-T-0001-deps"]);
    removeLeftVolumes("project", context);
    assert.deepEqual(volumes(), ["agentree-project-T-0001-deps"], "a tree that is there keeps its volume");
    git(context.places.root, "worktree", "unlock", hold.tree);
    git(context.places.root, "worktree", "remove", "--force", hold.tree);
    removeLeftVolumes("project", context);
    assert.deepEqual(volumes(), []);
  },
);
