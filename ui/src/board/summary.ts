import type { Kind, Status, Task, Tool } from "./task.ts";

/** A claim whose last beat is older than this is shown as stale. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

/** A claim is held from the claim until the checks of its submit end. */
export function isClaimed(task: Task): boolean {
  return (
    task.holder !== undefined &&
    (task.status === "in-progress" || task.status === "checking")
  );
}

export function isStale(task: Task, now: Date): boolean {
  return (
    isClaimed(task) &&
    task.holder !== undefined &&
    now.getTime() - task.holder.beat.getTime() > STALE_AFTER_MS
  );
}

export function openQuestions(task: Task) {
  return task.questions.filter((q) => q.answeredAt === undefined);
}

export function startOfDay(at: Date): Date {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day;
}

export type Totals = {
  all: number;
  done: number;
  open: number;
};

export function totals(tasks: readonly Task[]): Totals {
  const counted = tasks.filter((t) => t.status !== "dropped");
  const done = counted.filter((t) => t.status === "done").length;
  return { all: counted.length, done, open: counted.length - done };
}

export type Stats = {
  inProgress: number;
  stale: number;
  inReview: number;
  reviewWaitingOverHour: number;
  waitingForOwner: number;
  oldestQuestion?: Date;
  landedToday: number;
  landedYesterday: number;
};

export function stats(tasks: readonly Task[], now: Date): Stats {
  const today = startOfDay(now).getTime();
  const yesterday = today - 24 * HOUR_MS;
  const working = tasks.filter((t) => t.status === "in-progress");
  const review = tasks.filter((t) => t.status === "review");
  const asked = tasks
    .flatMap(openQuestions)
    .map((q) => q.askedAt)
    .sort((a, b) => a.getTime() - b.getTime());
  const landed = tasks.flatMap((t) => (t.landedAt ? [t.landedAt.getTime()] : []));

  return {
    inProgress: working.length,
    stale: working.filter((t) => isStale(t, now)).length,
    inReview: review.length,
    reviewWaitingOverHour: review.filter(
      (t) => now.getTime() - t.statusSince.getTime() > HOUR_MS,
    ).length,
    waitingForOwner: tasks.filter((t) => openQuestions(t).length > 0).length,
    oldestQuestion: asked[0],
    landedToday: landed.filter((at) => at >= today).length,
    landedYesterday: landed.filter((at) => at >= yesterday && at < today).length,
  };
}

export const TABS = [
  "all",
  "backlog",
  "ready",
  "in-progress",
  "checking",
  "review",
  "accepted",
  "done",
] as const satisfies readonly ("all" | Status)[];
export type Tab = (typeof TABS)[number];

export function countByTab(tasks: readonly Task[]): Record<Tab, number> {
  const counts = Object.fromEntries(TABS.map((tab) => [tab, 0])) as Record<
    Tab,
    number
  >;
  for (const task of tasks) {
    if (task.status === "dropped") continue;
    counts.all += 1;
    if (task.status in counts) counts[task.status as Tab] += 1;
  }
  return counts;
}

export type Filter = {
  tab: Tab;
  search: string;
  tool: Tool | "any";
  kind: Kind | "any";
  parent: string | "any";
};

export function applyFilter(tasks: readonly Task[], filter: Filter): Task[] {
  const words = filter.search.trim().toLowerCase();
  return tasks.filter(
    (t) =>
      t.status !== "dropped" &&
      (filter.tab === "all" || t.status === filter.tab) &&
      (filter.tool === "any" || t.holder?.tool === filter.tool) &&
      (filter.kind === "any" || t.kind === filter.kind) &&
      (filter.parent === "any" || t.parent === filter.parent) &&
      (words === "" ||
        t.title.toLowerCase().includes(words) ||
        t.id.toLowerCase().includes(words)),
  );
}

/** By priority, then the latest to reach its status first. */
export function sortForList(tasks: readonly Task[]): Task[] {
  return [...tasks].sort(
    (a, b) =>
      a.priority - b.priority ||
      b.statusSince.getTime() - a.statusSince.getTime() ||
      a.id.localeCompare(b.id),
  );
}

export function page<T>(items: readonly T[], index: number, size: number) {
  const count = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(index, 0), count - 1);
  return {
    items: items.slice(current * size, current * size + size),
    current,
    count,
    from: items.length === 0 ? 0 : current * size + 1,
    to: Math.min(items.length, current * size + size),
  };
}

/** The parts a task counts: an epic's tasks, or a task's subtasks. */
export function partsOf(task: Task, tasks: readonly Task[]): { done: number; total: number } {
  const kids = tasks.filter((t) => t.parent === task.id);
  if (kids.length) return { done: kids.filter((t) => t.status === "done").length, total: kids.length };
  return { done: task.subtasks.filter((s) => s.done).length, total: task.subtasks.length };
}
