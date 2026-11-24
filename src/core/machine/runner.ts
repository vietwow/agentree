/**
 * The process that runs a task's checks or its tree's setup, as its record
 * names it, so that a record left `running` by a process that ended (the
 * daemon stopped, the command that ran the checks itself was killed) can
 * be told from one whose run goes on.
 */
import { spawnSync } from "node:child_process";
import { hostname } from "node:os";

/**
 * A process by its id, the moment it started (which tells it from a later
 * process given the same id) and the host it runs on: the daemon in its
 * container and a command on the host around it do not see each other's
 * ids. A command runs its commands itself, each to its bound, so its run
 * ends by `until` at the latest.
 */
export type Runner = { pid: number; since: string; host?: string } & ({ role: "daemon" } | { role: "command"; until: string });

/** How far apart two readings of one process's start may be: `ps` tells its elapsed time in whole seconds. */
const SAME_START_MS = 2000;

const startOfThis = () => new Date(Date.now() - process.uptime() * 1000).toISOString();

/** This process as the runner of a record: the daemon, or a command whose run lasts at most `lastsAtMostMs`. */
export function thisRunner(role: "daemon"): Runner;
export function thisRunner(role: "command", lastsAtMostMs: number): Runner;
export function thisRunner(role: "daemon" | "command", lastsAtMostMs = 0): Runner {
  const self = { pid: process.pid, since: startOfThis(), host: hostname() };
  return role === "daemon" ? { ...self, role } : { ...self, role, until: new Date(Date.now() + lastsAtMostMs).toISOString() };
}

/** Seconds from the elapsed time `ps` prints, `[[dd-]hh:]mm:ss`. */
export function secondsOfElapsed(elapsed: string): number | undefined {
  const match = /^(?:(?:(\d+)-)?(\d+):)?(\d+):(\d+)$/.exec(elapsed.trim());
  if (!match) return undefined;
  const [, days = "0", hours = "0", minutes, seconds] = match;
  return ((Number(days) * 24 + Number(hours)) * 60 + Number(minutes!)) * 60 + Number(seconds!);
}

/**
 * When the process of an id started, by `ps`; undefined when no process
 * has that id. Every process is listed and the id looked up, since the
 * `ps` of BusyBox (the daemon's Alpine image) has no `-p`.
 */
function startOf(pid: number, now: number): number | undefined {
  const told = spawnSync("ps", ["-A", "-o", "pid=,etime="], { encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });
  if (told.status !== 0) return undefined;
  const line = told.stdout.split("\n").find((each) => each.trim().split(/\s+/)[0] === String(pid));
  const seconds = line === undefined ? undefined : secondsOfElapsed(line.trim().split(/\s+/)[1] ?? "");
  return seconds === undefined ? undefined : now - seconds * 1000;
}

/**
 * Whether the process a record names still runs. On this host: a process
 * has its id and started when the record says. On another host, whose ids
 * say nothing here: a command until its `until`, and never a daemon, since
 * a machine has one daemon and this process looks in its place.
 */
export function runnerRuns(runner: Runner, now = Date.now()): boolean {
  const since = Date.parse(runner.since);
  if (!Number.isInteger(runner.pid) || runner.pid <= 0 || Number.isNaN(since)) return false;
  if (runner.host !== undefined && runner.host !== hostname()) return runner.role === "command" && now < Date.parse(runner.until);
  if (runner.pid === process.pid) return Math.abs(Date.parse(startOfThis()) - since) <= SAME_START_MS;
  const started = startOf(runner.pid, now);
  return started !== undefined && Math.abs(started - since) <= SAME_START_MS;
}
