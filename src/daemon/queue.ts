/**
 * The machine's queue as the daemon holds it: the runs that wait and the
 * runs that run, what the machine's load was, and each decision with its
 * reason. The decisions are the core's; this starts what they admit, ends
 * a run at its bound, and keeps the owner's bounds and each command's cost.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus, loadavg, totalmem } from "node:os";
import { join } from "node:path";
import {
  costOf,
  decide,
  DEFAULT_BOUNDS,
  freeOf,
  MARK,
  type Bounds,
  type Costs,
  type Machine,
  type Reading,
  type Ticket,
} from "../core/machine/queue.ts";
import { Refusal } from "../core/errors.ts";

export type Ask = {
  project: string;
  task: string;
  by: string;
  what: "check" | "command";
  command: string;
  cwd: string;
  heavy: boolean;
  boundMinutes: number;
  /** Keep what the command said when it passes too: a worker's own run, whose words it asked for. */
  keepOutput?: boolean;
};
export type Ran = { result: "passed" | "failed" | "timed-out"; tookMs: number; waitedMs: number; output: string };

type Decided = { at: string; kind: "start" | "hold" | "stop" | "add" | "mark"; text: string; task?: string };

export type SlotsView = {
  cores: number;
  memory: number;
  runs: {
    task: string;
    by: string;
    what: Ask["what"];
    command: string;
    since: string;
    seat: number;
    ports: number[];
    cpu: { given: number };
    memory: { given: number };
    bound: number;
  }[];
  queue: {
    task: string;
    by: string;
    what: Ask["what"];
    command: string;
    since: string;
    cost: { cpu: number; memory: number };
    why: string;
    reason: string;
  }[];
  load: Reading[];
  mark: number;
  free: { cpu: number; memory: number };
  bounds: Bounds;
  decisions: Decided[];
};

/** How much of what a command said is kept with its result. */
const KEPT = 4000;
/** How much of what a worker's own run said is given back to it. */
const KEPT_OF_A_RUN = 400_000;
/** How long a run is given to end after it is told to, before it is ended. */
const GRACE_MS = 10_000;
/** The samples of the load kept: one a minute over the last hour. */
const SAMPLES = 61;
const DECISIONS = 200;

/** The ports a seat's servers listen on, so that two runs' servers never meet. */
export const portsOf = (seat: number) => [5180 + seat, 9230 + seat];

export type Queue = ReturnType<typeof createQueue>;

export function createQueue(options: { home: string; now?: () => Date; machine?: Machine; onChange?: () => void; loadAverage?: () => number }) {
  const now = options.now ?? (() => new Date());
  const machine = options.machine ?? { cores: cpus().length, memory: Math.round(totalmem() / 2 ** 30) };
  const directory = join(options.home, "queue");
  const load = <T>(name: string, fallback: T): T =>
    existsSync(join(directory, name)) ? (JSON.parse(readFileSync(join(directory, name), "utf8")) as T) : fallback;
  const save = (name: string, value: unknown) => {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `${name}.tmp`), `${JSON.stringify(value, null, 2)}\n`);
    renameSync(join(directory, `${name}.tmp`), join(directory, name));
  };

  let bounds = load<Bounds>("bounds.json", DEFAULT_BOUNDS);
  const costs = load<Costs>("costs.json", {});
  let decisions = load<Decided[]>("decisions.json", []);
  let readings = load<Reading[]>("readings.json", []);
  let next = 1;
  const tickets = new Map<number, Ticket & { ask: Ask; start: (seat: number, workers: number) => void }>();
  const held = new Map<number, string>();
  let stopped: string | undefined;
  const stamp = () =>
    now()
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

  function record(kind: Decided["kind"], text: string, task?: string) {
    decisions = [{ at: stamp(), kind, text, ...(task ? { task } : {}) }, ...decisions].slice(0, DECISIONS);
    save("decisions.json", decisions);
  }

  /** Decides on the queue as it is now, starts what is admitted, and records what changed. */
  function turn() {
    const decision = decide(machine, bounds, [...tickets.values()], readings, now());
    if (decision.stopped !== stopped) {
      if (decision.stopped) record("stop", `Stopped adding: ${decision.stopped}`);
      else if (stopped) record("add", "Adds runs again: the load stayed under its mark");
      stopped = decision.stopped;
    }
    for (const wait of decision.waits) {
      const ticket = tickets.get(wait.n)!;
      if (held.get(wait.n) !== wait.reason) record("hold", `Held: ${wait.reason}`, ticket.task);
      held.set(wait.n, wait.reason);
    }
    for (const start of decision.starts) {
      const ticket = tickets.get(start.n)!;
      held.delete(start.n);
      record(
        "start",
        `Started in seat ${start.seat}, told it may start ${start.workers} ${start.workers === 1 ? "worker" : "workers"}: ${start.reason}`,
        ticket.task,
      );
      ticket.start(start.seat, start.workers);
    }
    options.onChange?.();
  }

  /** Runs a command in a process group of its own, as CI runs it, and ends it at its bound. */
  function execute(ask: Ask, environment: Record<string, string>): Promise<Omit<Ran, "waitedMs">> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const child = spawn("sh", ["-c", ask.command], {
        cwd: ask.cwd,
        env: { ...process.env, CI: "true", ...environment },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      let output = "";
      let timedOut = false;
      const keep = (chunk: Buffer) => (output = (output + chunk.toString()).slice(ask.keepOutput ? -KEPT_OF_A_RUN : -KEPT));
      child.stdout.on("data", keep);
      child.stderr.on("data", keep);
      const signal = (name: NodeJS.Signals) => {
        try {
          process.kill(-child.pid!, name);
        } catch {
          // The group ended by itself between the bound and the signal.
        }
      };
      const bound = setTimeout(() => {
        timedOut = true;
        signal("SIGTERM");
        setTimeout(() => signal("SIGKILL"), GRACE_MS).unref();
      }, ask.boundMinutes * 60_000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(bound);
        resolve({
          result: timedOut ? "timed-out" : code === 0 ? "passed" : "failed",
          tookMs: Date.now() - started,
          output: timedOut || code !== 0 || ask.keepOutput ? output.trim() : "",
        });
      });
    });
  }

  return {
    machine,
    /** Runs a command: a light one at once, a heavy one when the queue admits it. */
    run(ask: Ask): Promise<Ran> {
      if (!ask.heavy) return execute(ask, {}).then((ran) => ({ ...ran, waitedMs: 0 }));
      return new Promise((resolve, reject) => {
        const n = next++;
        const asked = Date.now();
        const ticket: Ticket = {
          n,
          project: ask.project,
          task: ask.task,
          by: ask.by,
          what: ask.what,
          command: ask.command,
          askedAt: stamp(),
          cost: costOf(costs, ask.command, machine),
          sensitive: false,
        };
        const start = (seat: number, workers: number) => {
          const [port, debug] = portsOf(seat);
          Object.assign(ticket, { startedAt: stamp(), seat });
          const waited = Date.now() - asked;
          execute(ask, {
            AGENTREE_SEAT: String(seat),
            AGENTREE_WORKERS: String(workers),
            AGENTREE_PORT: String(port),
            AGENTREE_DEBUG_PORT: String(debug),
          })
            .then((ran) => resolve({ ...ran, waitedMs: waited > 500 ? waited : 0 }), reject)
            .finally(() => {
              tickets.delete(n);
              turn();
            });
        };
        tickets.set(n, Object.assign(ticket, { ask, start }));
        turn();
      });
    },
    /** Takes a reading of the load: this system's, and the host's when its script sent one. */
    read(host?: number) {
      const own = (options.loadAverage ?? (() => loadavg()[0]!))() / machine.cores;
      const inContainer = existsSync("/.dockerenv");
      const reading: Reading = { at: stamp(), vm: own, ...(host === undefined ? (inContainer ? {} : { host: own }) : { host }) };
      readings = [...readings, reading].slice(-SAMPLES);
      save("readings.json", readings);
      turn();
    },
    setBounds(change: Partial<Bounds>) {
      const to = { ...bounds, ...change };
      if (!Number.isInteger(to.lowest) || !Number.isInteger(to.highest) || to.lowest < 1 || to.highest < to.lowest)
        throw new Refusal("the bounds are whole numbers: the lowest from 1, the highest no less than it");
      if (!(to.margin >= 0 && to.margin < 1)) throw new Refusal("the margin is a share of the machine, from 0 to under 1");
      bounds = to;
      save("bounds.json", bounds);
      turn();
    },
    view(): SlotsView {
      const all = [...tickets.values()].sort((a, b) => a.n - b.n);
      const running = all.filter((ticket) => ticket.startedAt);
      return {
        cores: machine.cores,
        memory: machine.memory,
        runs: running.map((t) => ({
          task: t.task,
          by: t.by,
          what: t.what,
          command: t.command,
          since: t.startedAt!,
          seat: t.seat!,
          ports: portsOf(t.seat!),
          cpu: { given: t.cost.cpu },
          memory: { given: t.cost.memory },
          bound: t.ask.boundMinutes,
        })),
        queue: all
          .filter((ticket) => !ticket.startedAt)
          .map((t) => {
            const reason = held.get(t.n) ?? "";
            const why = reason.startsWith("Fits, but")
              ? "its turn"
              : /sensitive to load|Failed beside/.test(reason)
                ? "sensitive to load"
                : "no room";
            return { task: t.task, by: t.by, what: t.what, command: t.command, since: t.askedAt, cost: t.cost, why, reason };
          }),
        load: readings,
        mark: MARK,
        free: freeOf(machine, bounds, running),
        bounds,
        decisions,
      };
    },
  };
}
