/**
 * The numbers of a project, read from its Logs and from what its checks
 * recorded: the time a task spends in each status, the share of reviews
 * that reject, the wait of a check for a slot, and the checks that fail
 * most. The checks are those of each task's last submission: an earlier
 * submission's are not kept.
 */
import { checksOf } from "../board/state.ts";
import type { Board } from "../board/store.ts";
import { statusChange, STATUSES, type Status } from "../task/model.ts";
import { timeIn } from "./tasks.ts";

export type NumbersView = {
  /** For each status a task has been in: how many tasks, and the middle and the longest time one spent there. */
  timeIn: { status: Status; tasks: number; medianMs: number; longestMs: number }[];
  reviews: { accepted: number; rejected: number; rejectedShare: number };
  /** How long a check waited for a slot of the machine. */
  wait: { runs: number; medianMs: number; longestMs: number };
  /** The commands that failed or ran out of time, the most often first. */
  failing: { command: string; runs: number; failed: number }[];
};

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)]! : 0;
};

export function numbersView(board: Board, now: Date): NumbersView {
  const spent = new Map<Status, number[]>();
  let accepted = 0;
  let rejected = 0;
  const waits: number[] = [];
  const commands = new Map<string, { runs: number; failed: number }>();
  for (const { task } of board.tasks) {
    for (const { status, ms } of timeIn(task, now)) spent.set(status, [...(spent.get(status) ?? []), ms]);
    for (const entry of task.log) {
      const change = statusChange(entry);
      if (change?.from !== "review") continue;
      if (change.to === "accepted") accepted++;
      if (change.to === "ready") rejected++;
    }
    for (const run of checksOf(board.places, task.fields.id)?.runs ?? []) {
      waits.push(run.waitedMs);
      const counted = commands.get(run.command) ?? { runs: 0, failed: 0 };
      commands.set(run.command, { runs: counted.runs + 1, failed: counted.failed + (run.result === "passed" ? 0 : 1) });
    }
  }
  return {
    timeIn: STATUSES.filter((status) => spent.has(status)).map((status) => {
      const times = spent.get(status)!;
      return { status, tasks: times.length, medianMs: median(times), longestMs: Math.max(...times) };
    }),
    reviews: { accepted, rejected, rejectedShare: accepted + rejected ? rejected / (accepted + rejected) : 0 },
    wait: { runs: waits.length, medianMs: median(waits), longestMs: waits.length ? Math.max(...waits) : 0 },
    failing: [...commands]
      .map(([command, counted]) => ({ command, ...counted }))
      .filter((each) => each.failed > 0)
      .sort((a, b) => b.failed - a.failed || a.command.localeCompare(b.command)),
  };
}
