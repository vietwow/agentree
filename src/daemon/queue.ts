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
  inOrder,
  DEFAULT_BOUNDS,
  freeOf,
  MARK,
  withMeasure,
  type Bounds,
  type Cost,
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
  /** A landing's check: it waits before every run that is not marked first. */
  first?: boolean;
  /** The project's image, and the directory mounted into its container at the same path: the one that holds the repository and its trees. */
  container?: { image: string; mount: string; volumes?: { name: string; path: string }[] };
};
export type Ran = { result: "passed" | "failed" | "timed-out"; tookMs: number; waitedMs: number; output: string; took?: Cost };

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
    /** Its place in the order the runs asked. */
    n: number;
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
/** The line a run in a container ends with: its peak of memory in bytes and the time of the processors it used, in microseconds. */
const MEASURE = "__agentree_measure";
/** The least memory Docker gives a container. */
const MIN_MEMORY_MB = 64;
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

  /**
   * Runs a command as CI runs it and ends it at its bound: in a container
   * of the project's image when the project names one, held to what it is
   * given and measured by the system; in a process group of the daemon's
   * own system otherwise, where what it takes is not measured.
   */
  function execute(ask: Ask, environment: Record<string, string>, given: Cost): Promise<Omit<Ran, "waitedMs">> {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const variables = { CI: "true", ...environment };
      const name = `agentree-run-${process.pid}-${started}-${Math.round(Math.random() * 1e6)}`;
      const child = ask.container
        ? spawn(
            "docker",
            [
              "run",
              "--rm",
              "--name",
              name,
              "--cpus",
              String(given.cpu),
              "--memory",
              `${Math.max(MIN_MEMORY_MB, Math.round(given.memory * 1024))}m`,
              "--volume",
              `${ask.container.mount}:${ask.container.mount}`,
              ...(ask.container.volumes ?? []).flatMap((volume) => ["--volume", `${volume.name}:${volume.path}`]),
              "--workdir",
              ask.cwd,
              ...Object.entries(variables).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
              ask.container.image,
              "sh",
              "-c",
              `${ask.command}\ncode=$?\necho "${MEASURE} $(cat /sys/fs/cgroup/memory.peak) $(grep usage_usec /sys/fs/cgroup/cpu.stat | cut -d' ' -f2)" >&2\nexit $code`,
            ],
            { stdio: ["ignore", "pipe", "pipe"] },
          )
        : spawn("sh", ["-c", ask.command], {
            cwd: ask.cwd,
            env: { ...process.env, ...variables },
            stdio: ["ignore", "pipe", "pipe"],
            detached: true,
          });
      let output = "";
      let timedOut = false;
      const keep = (chunk: Buffer) => (output = (output + chunk.toString()).slice(ask.keepOutput ? -KEPT_OF_A_RUN : -KEPT));
      child.stdout.on("data", keep);
      child.stderr.on("data", keep);
      const signal = (how: NodeJS.Signals) => {
        try {
          if (ask.container) spawn("docker", ["kill", "--signal", how, name], { stdio: "ignore" });
          else process.kill(-child.pid!, how);
        } catch {
          // The run ended by itself between the bound and the signal.
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
        const tookMs = Date.now() - started;
        const measured = new RegExp(`^${MEASURE} (\\d+) (\\d+)$`, "m").exec(output);
        const said = output.replace(new RegExp(`^${MEASURE} .*\\n?`, "m"), "").trim();
        resolve({
          result: timedOut ? "timed-out" : code === 0 ? "passed" : "failed",
          tookMs,
          output: timedOut || code !== 0 || ask.keepOutput ? said : "",
          // The processors it used on average over its run, and its peak of memory.
          ...(measured ? { took: { cpu: Number(measured[2]) / 1000 / Math.max(tookMs, 1), memory: Number(measured[1]) / 2 ** 30 } } : {}),
        });
      });
    });
  }

  /** Keeps what a run took as its command's cost. */
  function measured(ask: Ask, ran: Omit<Ran, "waitedMs">) {
    if (!ran.took) return;
    Object.assign(costs, withMeasure(costs, ask.command, ran.took));
    save("costs.json", costs);
  }

  return {
    machine,
    /** Runs a command: a light one at once, a heavy one when the queue admits it. */
    run(ask: Ask): Promise<Ran> {
      if (!ask.heavy)
        return execute(ask, {}, costOf(costs, ask.command, machine)).then((ran) => {
          measured(ask, ran);
          return { ...ran, waitedMs: 0 };
        });
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
          ...(ask.first ? { first: true } : {}),
        };
        const start = (seat: number, workers: number) => {
          const [port, debug] = portsOf(seat);
          Object.assign(ticket, { startedAt: stamp(), seat });
          const waited = Date.now() - asked;
          execute(
            ask,
            { AGENTREE_SEAT: String(seat), AGENTREE_WORKERS: String(workers), AGENTREE_PORT: String(port), AGENTREE_DEBUG_PORT: String(debug) },
            ticket.cost,
          )
            .then((ran) => {
              measured(ask, ran);
              resolve({ ...ran, waitedMs: waited > 500 ? waited : 0 });
            }, reject)
            .finally(() => {
              tickets.delete(ticket.n);
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
    /** The owner moves a waiting run before every other that waits. */
    first(n: number) {
      const ticket = tickets.get(n);
      if (!ticket || ticket.startedAt) throw new Refusal("no such run waits in the queue");
      const waiting = [...tickets.values()].filter((each) => !each.startedAt).sort(inOrder);
      if (waiting[0] === ticket) return;
      tickets.delete(n);
      // A place before every ticket there is, running or waiting, so that it is no other's, among the runs marked first.
      ticket.n = Math.min(...tickets.keys(), n) - 1;
      ticket.first = true;
      tickets.set(ticket.n, ticket);
      held.delete(n);
      record("hold", "Moved first by the owner", ticket.task);
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
      const all = [...tickets.values()].sort(inOrder);
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
            return { n: t.n, task: t.task, by: t.by, what: t.what, command: t.command, since: t.askedAt, cost: t.cost, why, reason };
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
