/** Running git: without the caller's git variables, and without a lock a worker's own git command would wait for. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "./errors.ts";

/** The name the board's own commits are made under; no person's. */
const IDENTITY = ["-c", "user.name=agentree", "-c", "user.email=agentree@localhost"];

/**
 * The caller's git variables are dropped, and the user's and the system's
 * configuration are not read: the board's git does the same on every
 * machine, whatever signing, hooks path or ignore file a person has set.
 */
function environment(): NodeJS.ProcessEnv {
  const kept = Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_"));
  return { ...Object.fromEntries(kept), LC_ALL: "C", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
}

let program: string | undefined;

/**
 * The git program itself, found once: the `git` of the path may be a
 * launcher that looks its program up on every call (macOS's is, at some
 * 200 ms a call against 10), and git says where its programs are.
 */
function gitProgram(): string {
  if (program === undefined) {
    const found = spawnSync("git", ["--exec-path"], { encoding: "utf8" });
    if (found.error || found.status !== 0) throw new Refusal("git is not installed: agentree needs git 2.48 or later");
    const direct = join(found.stdout.trim(), "git");
    program = existsSync(direct) ? direct : "git";
  }
  return program;
}

type Result = { status: number; stdout: string; stderr: string };

function run(cwd: string, args: string[], input?: string): Result {
  const done = spawnSync(gitProgram(), ["--no-optional-locks", ...IDENTITY, ...args], {
    cwd,
    encoding: "utf8",
    env: environment(),
    maxBuffer: 64 * 1024 * 1024,
    ...(input === undefined ? {} : { input }),
  });
  if (done.error) throw done.error;
  return { status: done.status ?? 1, stdout: done.stdout, stderr: done.stderr };
}

/** Runs git in a directory and returns what it said, whatever its exit. */
export const tryGit = (cwd: string, ...args: string[]): Result => run(cwd, args);

/** What identifies a change whatever its commit and its line numbers: git's patch id of the diff between two commits. */
export function patchId(cwd: string, from: string, to: string): string {
  const diff = git(cwd, "diff", "--no-color", from, to);
  return run(cwd, ["patch-id", "--stable"], `${diff}\n`).stdout.split(" ")[0] ?? "";
}

/** Runs git in a directory; a command that fails is refused with what git said, never read as no output. */
export function git(cwd: string, ...args: string[]): string {
  const done = tryGit(cwd, ...args);
  if (done.status !== 0) throw new Refusal(`git ${args.join(" ")} failed in ${cwd}: ${done.stderr.trim() || done.stdout.trim()}`);
  return done.stdout.trimEnd();
}
