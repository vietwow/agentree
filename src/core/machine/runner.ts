/**
 * The process that runs a task's checks or its tree's setup, as its record
 * names it, so that a record left `running` by a process that ended (the
 * daemon stopped, the command that ran the checks itself was killed) can
 * be told from one whose run goes on.
 */
import { spawnSync } from "node:child_process";

/** A process by its id and the moment it started; the moment tells it from a later process given the same id. */
export type Runner = { pid: number; since: string };

/** How far apart two readings of one process's start may be: `ps` tells its elapsed time in whole seconds. */
const SAME_START_MS = 2000;

/** This process, as a record names its runner. */
export const thisRunner = (): Runner => ({ pid: process.pid, since: new Date(Date.now() - process.uptime() * 1000).toISOString() });

/** Seconds from the elapsed time `ps` prints, `[[dd-]hh:]mm:ss`. */
export function secondsOfElapsed(elapsed: string): number | undefined {
  const match = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(elapsed.trim());
  if (!match) return undefined;
  const [, days = "0", hours = "0", minutes, seconds] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes!)) * 60 + Number(seconds!);
}

/** When the process of an id started, by `ps`; undefined when no process has that id. */
function startOf(pid: number, now: number): number | undefined {
  const told = spawnSync("ps", ["-o", "etime=", "-p", String(pid)], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
  if (told.status !== 0) return undefined;
  const seconds = secondsOfElapsed(told.stdout);
  return seconds === undefined ? undefined : now - seconds * 1000;
}

/** Whether the process a record names still runs: a process has its id and started when the record says. */
export function runnerRuns(runner: Runner, now = Date.now()): boolean {
  const since = Date.parse(runner.since);
  if (!Number.isInteger(runner.pid) || runner.pid <= 0 || Number.isNaN(since)) return false;
  if (runner.pid === process.pid) return Math.abs(Date.parse(thisRunner().since) - since) <= SAME_START_MS;
  const started = startOf(runner.pid, now);
  return started !== undefined && Math.abs(started - since) <= SAME_START_MS;
}
