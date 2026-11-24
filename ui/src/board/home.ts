import type { ActivityEntry } from "./activity.ts";
import { FILE_AREAS, fixtureDetail, type AgentSession } from "./fixtures.ts";
import { isStale, openQuestions, startOfDay, totals } from "./summary.ts";
import type { Status, Task, Tool } from "./task.ts";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A file of an area as the board marks it; "main" is a file no task holds, checks, landed or wants. */
export type FileMark = "main" | "landed" | "held" | "checking" | "wanted";
/** A square of the board: a file the board knows by its path and task, or one of the area's other files, on main. */
export type FileCell = { mark: FileMark; path?: string; task?: Pick<Task, "id" | "title" | "status" | "holder"> };
export type FileArea = { name: string; path: string; cells: FileCell[]; free: number };

const MARK_OF: Partial<Record<Status, FileMark>> = {
  "in-progress": "held",
  checking: "checking",
  review: "checking",
  accepted: "checking",
  ready: "wanted",
};

/** Where in an area's grid a file sits: the same place on every render. */
function place(name: string, size: number, taken: Set<number>): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  let at = h % size;
  while (taken.has(at)) at = (at + 1) % size;
  taken.add(at);
  return at;
}

export function fileAreas(tasks: readonly Task[], now: Date): FileArea[] {
  const marks = new Map<string, FileCell>();
  for (const t of tasks) {
    if (t.parent === undefined) continue;
    const landedRecently = t.landedAt && now.getTime() - t.landedAt.getTime() < 10 * DAY;
    const mark = t.status === "done" ? (landedRecently ? "landed" : undefined) : MARK_OF[t.status];
    if (!mark) continue;
    for (const path of fixtureDetail(t, tasks, now).writes) marks.set(path, { mark, path, task: t });
  }
  return FILE_AREAS.map((area) => {
    const grid: FileCell[] = Array.from({ length: area.files }, () => ({ mark: "main" }));
    const taken = new Set<number>();
    for (const [path, cell] of marks) if (path.startsWith(`${area.path}/`)) grid[place(path, area.files, taken)] = cell;
    const busy = grid.filter((c) => c.mark === "held" || c.mark === "checking").length;
    return { name: area.name, path: area.path, cells: grid, free: Math.round(((area.files - busy) / area.files) * 100) };
  });
}

export function markCounts(areas: readonly FileArea[]): Record<FileMark, number> {
  const n: Record<FileMark, number> = { main: 0, landed: 0, held: 0, checking: 0, wanted: 0 };
  for (const a of areas) for (const c of a.cells) n[c.mark] += 1;
  return n;
}

/** The hours a held task is estimated to need before it lands, from where it is now. */
function hoursToLand(t: Task, now: Date): number | undefined {
  const open = t.subtasks.filter((s) => !s.done).length;
  switch (t.status) {
    case "accepted":
      return 1;
    case "review":
      return 2;
    case "checking":
      return t.checks.state === "queued" ? 4 : 3;
    case "in-progress":
      return 2 + 2 * open + (isStale(t, now) ? 4 : 0) + (t.holder?.tool === "person" ? 2 : 0);
    default:
      return undefined;
  }
}

export type Forecast = {
  hours: Date[];
  withAgents: number[];
  without: number[];
  goal: number;
  /** The tasks the agents hold; the people's own land with or without them. */
  held: number;
  /** The tasks estimated to land by each hour and after the one before it. */
  lands: Pick<Task, "id" | "title">[][];
  /** The two hours with most landings, and what lands then. */
  marks: { at: number; n: number; what: "reviewed" | "claims" | "tasks" }[];
};

export function forecast(tasks: readonly Task[], now: Date, span: 12 | 24): Forecast {
  const open = totals(tasks).open;
  const held = tasks.filter((t) => t.parent !== undefined && hoursToLand(t, now) !== undefined);
  const step = span === 12 ? 1 : 2;
  const hours = Array.from({ length: 13 }, (_, i) => new Date(now.getTime() + i * step * HOUR));
  const landed = (h: number, of = held) => of.filter((t) => hoursToLand(t, now)! <= h).length;
  const byPeople = held.filter((t) => t.holder?.tool === "person");
  const withAgents = hours.map((_, i) => open - landed(i * step));
  const without = hours.map((_, i) => open - landed(i * step, byPeople));
  const at = new Map<number, { n: number; reviewed: number }>();
  for (const t of held) {
    const h = Math.ceil(hoursToLand(t, now)! / step);
    const e = at.get(h) ?? { n: 0, reviewed: 0 };
    e.n += 1;
    if (t.status !== "in-progress") e.reviewed += 1;
    at.set(h, e);
  }
  const marks = [...at.entries()]
    .filter(([h]) => h > 0 && h <= 12)
    .sort((a, b) => b[1].n - a[1].n || a[0] - b[0])
    .slice(0, 2)
    .sort((a, b) => a[0] - b[0])
    .map(([h, e]) => ({
      at: h,
      n: e.n,
      what: e.reviewed === e.n ? ("reviewed" as const) : e.reviewed === 0 ? ("claims" as const) : ("tasks" as const),
    }));
  const lands = hours.map((_, i) => held.filter((t) => Math.ceil(hoursToLand(t, now)! / step) === i));
  return { hours, withAgents, without, held: held.length - byPeople.length, goal: 15, lands, marks };
}

/** The last fourteen days of a number, oldest first. */
export type Spark = number[];

function days(now: Date, n = 14): number[] {
  const end = startOfDay(now).getTime() + DAY;
  return Array.from({ length: n }, (_, i) => end - (n - 1 - i) * DAY);
}

export type Numbers = {
  done: { pct: number; landed: number; all: number; spark: Spark };
  review: { n: number; oldest?: Date; spark: Spark };
  landed: { week: number; all: number; spark: Spark };
  ready: { n: number; waiting: number; spark: Spark };
  actions: { day: number; needYou: number; spark: Spark };
};

export function numbers(tasks: readonly Task[], activity: readonly ActivityEntry[], now: Date): Numbers {
  const counted = tasks.filter((t) => t.status !== "dropped" && t.parent !== undefined);
  const landed = counted.filter((t) => t.landedAt);
  const ends = days(now);
  const review = tasks.filter((t) => t.status === "review");
  const ready = tasks.filter((t) => t.status === "ready" && t.parent !== undefined);
  const agents = activity.filter((e) => e.who !== "daemon" && e.who !== "person");
  return {
    done: {
      pct: Math.round((landed.length / counted.length) * 100),
      landed: landed.length,
      all: counted.length,
      spark: ends.map((end) => landed.filter((t) => t.landedAt!.getTime() < end).length),
    },
    review: {
      n: review.length,
      oldest: review.map((t) => t.statusSince).sort((a, b) => a.getTime() - b.getTime())[0],
      spark: [1, 2, 1, 0, 1, 2, 2, 3, 2, 1, 2, 3, 2, review.length],
    },
    landed: {
      week: landed.filter((t) => now.getTime() - t.landedAt!.getTime() < 7 * DAY).length,
      all: landed.length,
      spark: ends.map((end) => landed.filter((t) => t.landedAt!.getTime() < end && t.landedAt!.getTime() >= end - DAY).length),
    },
    ready: {
      n: ready.length,
      waiting: ready.filter((t) => fixtureDetail(t, tasks, now).dependsOn.some((d) => d.status !== "done")).length,
      spark: [2, 3, 3, 4, 3, 5, 4, 4, 3, 3, 4, 3, 2, ready.length],
    },
    actions: {
      day: agents.filter((e) => now.getTime() - e.at.getTime() < DAY).length,
      needYou: tasks.reduce((n, t) => n + openQuestions(t).length, 0),
      spark: ends.map((end) => agents.filter((e) => e.at.getTime() < end && e.at.getTime() >= end - DAY).length),
    },
  };
}

export type ToolLive = { tool: Tool; sessions: number; worked: number; what: string };

export function toolsLive(sessions: readonly AgentSession[], tasks: readonly Task[]): ToolLive[] {
  const tools = [...new Set(sessions.filter((s) => !s.ended).map((s) => s.tool))];
  return tools.map((tool) => {
    const live = sessions.filter((s) => s.tool === tool && !s.ended);
    const subs = live.flatMap((s) => s.subagents.filter((a) => !a.ended));
    const reviews = subs.filter((a) => a.kind === "agentree-reviewer").length;
    const workers = subs.filter((a) => a.kind === "agentree-worker").length;
    const asking = live.find((s) => s.state === "asking");
    const what = asking
      ? `Asking you on ${asking.task}`
      : reviews
        ? `Reviewing ${reviews} task${reviews === 1 ? "" : "s"}`
        : [
            `${live.length} session${live.length === 1 ? "" : "s"}`,
            workers && `${workers} worker${workers === 1 ? "" : "s"}`,
            live.some((s) => s.state === "stale") && "1 stale",
          ]
            .filter(Boolean)
            .join(", ");
    return { tool, sessions: live.length, worked: tasks.filter((t) => t.holder?.tool === tool).length, what };
  });
}

export const HOUR_MS = HOUR;
