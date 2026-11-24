/** Running a command of the project: a check of a submit, in the task's tree. */
import { spawnSync } from "node:child_process";

export type Ran = { ok: boolean; timedOut: boolean; tookMs: number; output: string };

/** How a command of the project is run in a directory; the daemon runs it in the project's container. */
export type Run = (command: string, cwd: string) => Ran;

/** No check runs longer than this. */
export const BOUND_MS = 90 * 60 * 1000;
/** How much of what a command said is kept with its result. */
const KEPT = 4000;

/**
 * Runs a command by the shell as CI runs it, so that a tool runs once and
 * exits: `CI=true`, and no input, so a command that reads its input reads
 * its end.
 */
export const runInShell: Run = (command, cwd) => {
  const started = Date.now();
  const done = spawnSync("sh", ["-c", command], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: BOUND_MS,
    killSignal: "SIGTERM",
    maxBuffer: 256 * 1024 * 1024,
  });
  const timedOut = (done.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
  if (done.error && !timedOut) throw done.error;
  return {
    ok: done.status === 0 && !timedOut,
    timedOut,
    tookMs: Date.now() - started,
    output: `${done.stdout ?? ""}${done.stderr ?? ""}`.slice(-KEPT).trim(),
  };
};
