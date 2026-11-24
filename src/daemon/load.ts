/** What an agent is told when it asks whether the machine takes another worker: a few lines, each a fact of the queue. */
import type { SlotsView } from "./queue.ts";

/** The processors a worker with its tool is counted to take. */
const WORKER_PROCESSORS = 2;

export function loadInWords(slots: SlotsView): string {
  const last = slots.load.at(-1);
  const share = (value?: number) => (value === undefined ? "not read" : `${Math.round(value * 100)}%`);
  const over = last === undefined || Math.max(last.host ?? 1, last.vm) > slots.mark;
  const more =
    slots.queue.length > 0 || over
      ? 0
      : Math.max(0, Math.min(slots.bounds.highest - slots.runs.length, Math.floor(slots.free.cpu / WORKER_PROCESSORS)));
  const why = slots.queue.length ? ": heavy runs wait" : over ? ": the machine is past its mark, or its load is not read" : "";
  return [
    `Load: host ${share(last?.host)}, Docker's machine ${share(last?.vm)} of ${slots.cores} processors; no run is added over ${share(slots.mark)}.`,
    `Heavy runs: ${slots.runs.length} running, ${slots.queue.length} waiting; between ${slots.bounds.lowest} and ${slots.bounds.highest} at once.`,
    `Free now, with the margin kept: ${Math.max(0, slots.free.cpu)} processors, ${Math.max(0, slots.free.memory)} GB.`,
    `Start no more than ${more} more ${more === 1 ? "worker" : "workers"} now${why}. Ask again before the next.`,
  ].join("\n");
}
