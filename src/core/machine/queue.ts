/**
 * The machine's queue of heavy runs. A run starts when its command's cost
 * fits in what is free, with a margin kept; the number of runs is not a
 * setting but what fits, between the owner's bounds. Nothing running is
 * ever ended to make room. The decisions here are plain functions of what
 * is measured; the daemon measures, starts the runs and keeps the records.
 */

/** Processors, and memory in GB. */
export type Cost = { cpu: number; memory: number };

export type Bounds = {
  /** The heavy runs admitted whatever the load. */
  lowest: number;
  /** The most heavy runs at one moment. */
  highest: number;
  /** The share of the machine kept free. */
  margin: number;
  /** Hold the number of runs at `highest`, whatever is measured. */
  fixed: boolean;
};

export const DEFAULT_BOUNDS: Bounds = { lowest: 1, highest: 6, margin: 0.15, fixed: false };

/** The load, as a share of the processors, above which no run is added. */
export const MARK = 0.8;
/** How long the load stays under the mark before a run is added beyond the lowest bound. */
export const CALM_MS = 2 * 60 * 1000;
/** A reading of the host older than this is no reading. */
export const READING_AGE_MS = 5 * 60 * 1000;

export type Ticket = {
  /** Its place in the order the runs asked. */
  n: number;
  project: string;
  task: string;
  by: string;
  what: "check" | "command";
  command: string;
  askedAt: string;
  cost: Cost;
  /** It failed beside other runs and passed alone: it runs with nothing heavy beside it. */
  sensitive: boolean;
  /**
   * It goes before every waiting run that is not marked so: a landing's
   * check, since the accepted tasks behind its landing wait for it, or a
   * run the owner moved first.
   */
  first?: boolean;
  /** Set when it starts. */
  startedAt?: string;
  seat?: number;
};

/** The load of the host and of Docker's virtual machine at a moment, each over its processors. */
export type Reading = { at: string; host?: number; vm: number };

export type Machine = { cores: number; memory: number };

export type Waits = { n: number; why: "no room" | "its turn" | "sensitive to load"; reason: string };
export type Start = { n: number; seat: number; workers: number; reason: string };
export type Decision = { starts: Start[]; waits: Waits[]; stopped?: string };

const round = (value: number) => Math.round(value * 10) / 10;
const sum = (tickets: readonly Ticket[]): Cost =>
  tickets.reduce((all, each) => ({ cpu: all.cpu + each.cost.cpu, memory: all.memory + each.cost.memory }), { cpu: 0, memory: 0 });

/** What is free now: the machine less what the running runs were given, less the margin. */
export function freeOf(machine: Machine, bounds: Bounds, running: readonly Ticket[]): Cost {
  const used = sum(running);
  return { cpu: round(machine.cores * (1 - bounds.margin) - used.cpu), memory: round(machine.memory * (1 - bounds.margin) - used.memory) };
}

const fits = (cost: Cost, free: Cost) => cost.cpu <= free.cpu && cost.memory <= free.memory;

function shortOf(cost: Cost, free: Cost): string {
  const cpu = cost.cpu > free.cpu;
  return cpu
    ? `Needs ${cost.cpu} processors; ${Math.max(0, free.cpu)} are free with the margin kept`
    : `Needs ${cost.memory} GB; ${Math.max(0, free.memory)} are free with the margin kept`;
}

/** Why no run is added now beyond the lowest bound, when the load says so. */
function loadSays(machine: Machine, readings: readonly Reading[], now: Date): string | undefined {
  const fresh = readings.filter((reading) => now.getTime() - Date.parse(reading.at) <= READING_AGE_MS);
  const last = fresh.at(-1);
  if (!last || last.host === undefined) return "no reading of the host's load for a while";
  const over = (reading: Reading) => Math.max(reading.host ?? 0, reading.vm) > MARK;
  if (over(last))
    return `the ${(last.host ?? 0) >= last.vm ? "host" : "virtual machine"} is over its mark, ${Math.round(Math.max(last.host ?? 0, last.vm) * 100)}% of ${machine.cores} processors`;
  const calmSince = fresh.findLast(over);
  if (calmSince && now.getTime() - Date.parse(calmSince.at) < CALM_MS)
    return `the load came under its mark less than ${CALM_MS / 60_000} minutes ago`;
  return undefined;
}

/** The order runs wait in: those marked first before the rest, and the first to ask first among each. */
export const inOrder = (a: Ticket, b: Ticket) => Number(b.first ?? false) - Number(a.first ?? false) || a.n - b.n;

/**
 * Which waiting runs start now, in which seat, and why each of the others
 * waits. The first to ask is the first to run (a landing's before every
 * other), but for a run that fits while one before it does not, and that
 * leaves room for that one.
 */
export function decide(machine: Machine, bounds: Bounds, tickets: readonly Ticket[], readings: readonly Reading[], now: Date): Decision {
  const running = tickets.filter((ticket) => ticket.startedAt).sort((a, b) => a.n - b.n);
  const waiting = tickets.filter((ticket) => !ticket.startedAt).sort(inOrder);
  const starts: Start[] = [];
  const waits: Waits[] = [];
  const stopped = bounds.fixed ? undefined : loadSays(machine, readings, now);
  const whole: Cost = { cpu: machine.cores * (1 - bounds.margin), memory: machine.memory * (1 - bounds.margin) };
  const seats = new Set(running.map((ticket) => ticket.seat));
  /** The runs that asked earlier and wait for room; a later run leaves room for each. */
  const before: Ticket[] = [];
  let alone = running.some((ticket) => ticket.sensitive);
  for (const ticket of waiting) {
    const now_ = [...running, ...waiting.filter((each) => starts.some((start) => start.n === each.n))];
    const free = freeOf(machine, bounds, now_);
    const wait = (why: Waits["why"], reason: string) => waits.push({ n: ticket.n, why, reason });
    const under = now_.length < bounds.lowest;
    if (ticket.sensitive && now_.length > 0)
      wait("sensitive to load", "Failed beside other runs and passed alone; runs with nothing heavy beside it");
    else if (alone) wait("sensitive to load", "A run that is sensitive to load runs; nothing heavy runs beside it");
    else if (now_.length >= bounds.highest) wait("no room", `${bounds.highest} heavy runs run, the most the owner allows`);
    else if (!under && !bounds.fixed && !fits(ticket.cost, free)) wait("no room", shortOf(ticket.cost, free));
    else if (!under && stopped) wait("no room", `No run is added: ${stopped}`);
    else {
      const delayed = before.find(
        (earlier) => !fits({ cpu: earlier.cost.cpu + ticket.cost.cpu, memory: earlier.cost.memory + ticket.cost.memory }, whole),
      );
      if (delayed && !under) wait("its turn", `Fits, but would delay ${delayed.task}, which asked first`);
      else {
        let seat = 1;
        while (seats.has(seat)) seat++;
        seats.add(seat);
        const workers = Math.max(1, Math.floor(bounds.fixed ? machine.cores / bounds.highest : Math.min(ticket.cost.cpu, Math.max(1, free.cpu))));
        starts.push({
          n: ticket.n,
          seat,
          workers,
          reason:
            under && !fits(ticket.cost, free)
              ? "the lowest number of runs is admitted whatever the load"
              : `its cost, ${ticket.cost.cpu} processors and ${ticket.cost.memory} GB, fit in what was free`,
        });
        alone ||= ticket.sensitive;
        continue;
      }
    }
    before.push(ticket);
  }
  return { starts, waits, ...(stopped ? { stopped } : {}) };
}

/** What a command took at its peak, kept as that command's cost; one not yet seen is given the heaviest's. */
export type Costs = Record<string, Cost & { runs: number }>;

export function costOf(costs: Costs, command: string, machine: Machine): Cost {
  const known = costs[command];
  if (known) return { cpu: known.cpu, memory: known.memory };
  const all = Object.values(costs);
  if (!all.length) return { cpu: Math.max(1, Math.floor(machine.cores / 4)), memory: Math.max(1, Math.floor(machine.memory / 4)) };
  return { cpu: Math.max(...all.map((each) => each.cpu)), memory: Math.max(...all.map((each) => each.memory)) };
}

/** A command's cost after a run of it: the most it has been measured to take, to a tenth, and never less than a tenth. */
export function withMeasure(costs: Costs, command: string, took: Cost): Costs {
  const known = costs[command];
  const most = (a: number, b: number) => Math.max(0.1, Math.ceil(Math.max(a, b) * 10) / 10);
  return {
    ...costs,
    [command]: { cpu: most(known?.cpu ?? 0, took.cpu), memory: most(known?.memory ?? 0, took.memory), runs: (known?.runs ?? 0) + 1 },
  };
}
