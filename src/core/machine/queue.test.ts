import assert from "node:assert/strict";
import { test } from "node:test";
import { costOf, decide, DEFAULT_BOUNDS, freeOf, withMeasure, type Bounds, type Reading, type Ticket } from "./queue.ts";

const MACHINE = { cores: 14, memory: 36 };
const NOW = new Date("2026-11-24T15:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const calm: Reading[] = [{ at: ago(1), host: 0.5, vm: 0.3 }];

let n = 0;
const ticket = (task: string, cpu: number, memory: number, more: Partial<Ticket> = {}): Ticket => ({
  n: ++n,
  project: "p",
  task,
  by: "codex/gpt-5",
  what: "check",
  command: `check ${task}`,
  askedAt: ago(3),
  cost: { cpu, memory },
  sensitive: false,
  ...more,
});
const running = (task: string, cpu: number, memory: number, seat: number) => ticket(task, cpu, memory, { startedAt: ago(4), seat });
const decideOn = (tickets: Ticket[], readings = calm, bounds: Bounds = DEFAULT_BOUNDS) => decide(MACHINE, bounds, tickets, readings, NOW);
const tasks = (tickets: Ticket[]) => new Map(tickets.map((each) => [each.n, each.task]));

test("what is free is the machine less what the runs were given, less the margin", () => {
  assert.deepEqual(freeOf(MACHINE, DEFAULT_BOUNDS, []), { cpu: 11.9, memory: 30.6 });
  assert.deepEqual(freeOf(MACHINE, DEFAULT_BOUNDS, [running("a", 4, 3, 1), running("b", 4, 4, 2)]), { cpu: 3.9, memory: 23.6 });
});

test("a run starts when its cost fits, in the lowest free seat, and is told how many workers it may start", () => {
  const tickets = [running("a", 4, 3, 2), ticket("b", 3, 2)];
  assert.deepEqual(decideOn(tickets).starts, [
    { n: tickets[1]!.n, seat: 1, workers: 3, reason: "its cost, 3 processors and 2 GB, fit in what was free" },
  ]);
});

test("a run that does not fit waits for room; one after it goes ahead only when it leaves room for it", () => {
  const tickets = [running("a", 4, 3, 1), running("b", 4, 4, 2), ticket("big", 9.5, 2), ticket("small", 1, 0.5), ticket("mid", 2.9, 1)];
  const decision = decideOn(tickets);
  const name = tasks(tickets);
  assert.deepEqual(
    decision.starts.map((start) => name.get(start.n)),
    ["small"],
  );
  assert.deepEqual(
    decision.waits.map((wait) => [name.get(wait.n), wait.why, wait.reason]),
    [
      ["big", "no room", "Needs 9.5 processors; 3.9 are free with the margin kept"],
      ["mid", "its turn", "Fits, but would delay big, which asked first"],
    ],
  );
});

test("a run that is sensitive to load runs with nothing heavy beside it, and nothing starts beside it", () => {
  const sensitive = ticket("flaky", 2, 1, { sensitive: true });
  assert.deepEqual(decideOn([running("a", 2, 1, 1), sensitive]).waits[0]!.why, "sensitive to load");
  const after = ticket("next", 1, 1);
  const alone = decideOn([sensitive, after]);
  assert.deepEqual(
    [alone.starts.map((start) => start.n), alone.waits.map((wait) => wait.reason)],
    [[sensitive.n], ["A run that is sensitive to load runs; nothing heavy runs beside it"]],
  );
});

test("no run is added while the load is over its mark, or came under it a moment ago, or the host gave no reading", () => {
  const tickets = () => [running("a", 2, 1, 1), ticket("b", 1, 1)];
  assert.match(
    decideOn(tickets(), [{ at: ago(1), host: 0.82, vm: 0.4 }]).waits[0]!.reason,
    /No run is added: the host is over its mark, 82% of 14 processors/,
  );
  assert.match(
    decideOn(tickets(), [
      { at: ago(1), host: 0.9, vm: 0.4 },
      { at: ago(0.5), host: 0.6, vm: 0.4 },
    ]).waits[0]!.reason,
    /came under its mark less than 2 minutes ago/,
  );
  assert.match(decideOn(tickets(), [{ at: ago(1), vm: 0.2 }]).waits[0]!.reason, /no reading of the host's load/);
  assert.match(decideOn(tickets(), [{ at: ago(30), host: 0.2, vm: 0.2 }]).waits[0]!.reason, /no reading of the host's load/);
  assert.equal(
    decideOn(tickets(), [
      { at: ago(4), host: 0.9, vm: 0.4 },
      { at: ago(1), host: 0.6, vm: 0.4 },
    ]).starts.length,
    1,
  );
});

test("the lowest number of runs is admitted whatever the load, and no more than the highest ever run", () => {
  const over: Reading[] = [{ at: ago(1), host: 0.95, vm: 0.9 }];
  assert.equal(decideOn([ticket("first", 20, 4)], over).starts[0]!.reason, "the lowest number of runs is admitted whatever the load");
  const two = { ...DEFAULT_BOUNDS, highest: 2 };
  assert.equal(
    decideOn([running("a", 1, 1, 1), running("b", 1, 1, 2), ticket("c", 1, 1)], calm, two).waits[0]!.reason,
    "2 heavy runs run, the most the owner allows",
  );
});

test("a number held fixed admits that many runs whatever is measured", () => {
  const fixed = { ...DEFAULT_BOUNDS, highest: 2, fixed: true };
  const decision = decideOn([running("a", 10, 10, 1), ticket("b", 10, 10), ticket("c", 1, 1)], [{ at: ago(1), host: 0.99, vm: 0.99 }], fixed);
  assert.deepEqual([decision.starts.map((start) => [start.seat, start.workers]), decision.waits.map((wait) => wait.why)], [[[2, 7]], ["no room"]]);
});

test("a command's cost is the most it was measured to take; one not yet seen is given the heaviest's", () => {
  assert.deepEqual(costOf({}, "pnpm test", MACHINE), { cpu: 3, memory: 9 });
  let costs = withMeasure({}, "pnpm test", { cpu: 2.44, memory: 1.52 });
  costs = withMeasure(costs, "pnpm test", { cpu: 1, memory: 1.9 });
  costs = withMeasure(costs, "pnpm lint", { cpu: 0.3, memory: 0.02 });
  assert.deepEqual(costs, { "pnpm test": { cpu: 2.5, memory: 1.9, runs: 2 }, "pnpm lint": { cpu: 0.3, memory: 0.1, runs: 1 } });
  assert.deepEqual(costOf(costs, "pnpm test:e2e", MACHINE), { cpu: 2.5, memory: 1.9 });
});
