import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createQueue, type Ask } from "./queue.ts";

const home = () => mkdtempSync(join(tmpdir(), "agentree-queue-"));
const ask = (task: string, command: string, more: Partial<Ask> = {}): Ask => ({
  project: "p",
  task,
  by: "codex/gpt-5",
  what: "check",
  command,
  cwd: tmpdir(),
  heavy: true,
  boundMinutes: 1,
  ...more,
});

test("a light command runs at once and takes no seat; a failing one keeps what it said", async () => {
  const at = home();
  const queue = createQueue({ home: at });
  const passed = await queue.run(ask("T-0001", "true", { heavy: false }));
  assert.deepEqual([passed.result, passed.waitedMs, passed.output], ["passed", 0, ""]);
  const failed = await queue.run(ask("T-0001", "echo broken; exit 2", { heavy: false }));
  assert.deepEqual([failed.result, failed.output], ["failed", "broken"]);
  assert.deepEqual(queue.view().decisions, []);
  rmSync(at, { recursive: true });
});

test("heavy runs take seats while they fit, the next waits and starts when one ends, and each decision is kept", async () => {
  const at = home();
  const queue = createQueue({ home: at, machine: { cores: 4, memory: 8 }, loadAverage: () => 0.4 });
  queue.setBounds({ lowest: 1, highest: 1, margin: 0 });
  queue.read(0.1);
  const first = queue.run(ask("T-0001", 'sleep 0.8; echo "$AGENTREE_SEAT $AGENTREE_PORT $CI" >&2; exit 1'));
  const second = queue.run(ask("T-0002", "sleep 0.1"));
  const view = queue.view();
  assert.deepEqual(
    view.runs.map((run) => [run.task, run.seat, run.ports]),
    [["T-0001", 1, [5181, 9231]]],
  );
  assert.deepEqual(
    view.queue.map((wait) => [wait.task, wait.why, wait.reason]),
    [["T-0002", "no room", "1 heavy runs run, the most the owner allows"]],
  );
  assert.deepEqual([(await first).result, (await first).output], ["failed", "1 5181 true"]);
  const waited = await second;
  assert.ok(waited.waitedMs >= 600, `it waited for the seat: ${waited.waitedMs} ms`);
  assert.deepEqual(
    queue
      .view()
      .decisions.filter((decision) => decision.task)
      .map((decision) => [decision.kind, decision.task])
      .reverse(),
    [
      ["start", "T-0001"],
      ["hold", "T-0002"],
      ["start", "T-0002"],
    ],
  );
  assert.equal(createQueue({ home: at }).view().bounds.highest, 1, "the bounds are the machine's and stay");
  rmSync(at, { recursive: true });
});

test("a run is ended at its bound, with every process it started", async () => {
  const at = home();
  const queue = createQueue({ home: at });
  const ran = await queue.run(ask("T-0001", "sleep 30 & sleep 30", { heavy: false, boundMinutes: 0.005 }));
  assert.equal(ran.result, "timed-out");
  assert.ok(ran.tookMs < 5000);
  rmSync(at, { recursive: true });
});

test("bounds that make no sense are refused", () => {
  const at = home();
  const queue = createQueue({ home: at });
  assert.throws(() => queue.setBounds({ lowest: 3, highest: 2 }), /the highest no less than it/);
  assert.throws(() => queue.setBounds({ margin: 1 }), /a share of the machine/);
  rmSync(at, { recursive: true });
});

test("the owner moves a waiting run before the others that wait", async () => {
  const at = home();
  const queue = createQueue({ home: at, machine: { cores: 4, memory: 8 }, loadAverage: () => 0.4 });
  queue.setBounds({ lowest: 1, highest: 1, margin: 0 });
  queue.read(0.1);
  const order: string[] = [];
  const run = (task: string) => queue.run(ask(task, "sleep 0.3")).then(() => order.push(task));
  const all = [run("T-0001"), run("T-0002"), run("T-0003")];
  queue.first(queue.view().queue.find((wait) => wait.task === "T-0003")!.n);
  assert.deepEqual(
    queue.view().queue.map((wait) => wait.task),
    ["T-0003", "T-0002"],
  );
  assert.throws(() => queue.first(999), /no such run waits/);
  await Promise.all(all);
  assert.deepEqual(order, ["T-0001", "T-0003", "T-0002"]);
  rmSync(at, { recursive: true });
});
