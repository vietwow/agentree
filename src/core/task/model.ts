/** What a task is: its fields, its sections, and the words each may hold. */

export const STATUSES = ["backlog", "ready", "in-progress", "checking", "review", "accepted", "done", "blocked", "dropped"] as const;
export type Status = (typeof STATUSES)[number];

export const KINDS = ["build", "fix", "measure", "research", "review", "decision", "assets"] as const;
export type Kind = (typeof KINDS)[number];

export const TOOLS = ["claude-code", "claude-desktop", "cursor", "codex", "antigravity", "person"] as const;
export type Tool = (typeof TOOLS)[number];

export const NEEDS = ["owner", "browser", "docker", "network", "reference-app"] as const;
export type Need = (typeof NEEDS)[number];

/** The kinds whose claim and submit ask for at least one check. */
export const CHECKED_KINDS: readonly Kind[] = ["build", "fix"];

/** The statuses in which a worker holds the task and its paths. */
export const HELD_STATUSES: readonly Status[] = ["in-progress", "checking"];

/** The daemon's own name in a Log, where no worker acted. */
export const DAEMON = "daemon";

export const ID_PATTERN = /^T-\d{4}$/;
const WORKER_PATTERN = new RegExp(`^(${TOOLS.join("|")})/[A-Za-z0-9][A-Za-z0-9._-]*$`);
const PATH_PATTERN = /^[^/*?[\]{}\s][^*?[\]{}\s]*$/;

/** A worker is `<tool>/<model>[-suffix]`, never a person's name or address. */
export const isWorker = (name: string) => WORKER_PATTERN.test(name);
export const toolOf = (worker: string) => worker.split("/")[0] as Tool;
export const modelOf = (worker: string) => worker.split("/").slice(1).join("/");

/** A file, or a directory ending in `/`, from the repository's root, with no wildcard. */
export const isPath = (path: string) => PATH_PATTERN.test(path);

export type Fields = {
  id: string;
  title: string;
  status: Status;
  kind: Kind;
  /** 1 is taken first. */
  priority: number;
  /** The task this one is a part of, or the empty string. */
  parent: string;
  /** The number of the RFC it belongs to, or the empty string. */
  rfc: string;
  /** The step of the RFC it delivers, or the empty string. */
  step: string;
  dependsOn: string[];
  /** The paths only this task may change while it is held. */
  writes: string[];
  /** The shared files it may make small additions to. */
  appends: string[];
  needs: Need[];
  /** The commands that pass before the task is submitted. */
  checks: string[];
  /** UTC, to the second. */
  created: string;
};

export type Subtask = { title: string; done: boolean };

export type Question = {
  at: string;
  by: string;
  text: string;
  choices: string[];
  answeredAt?: string;
  answer?: string;
};

export type LogEntry = { at: string; by: string; text: string };

export type Task = {
  fields: Fields;
  context: string;
  doneWhen: string;
  outOfScope: string;
  subtasks: Subtask[];
  questions: Question[];
  log: LogEntry[];
};

/** UTC to the second, as `2026-11-24T10:00:00Z`. */
export const stamp = (at: Date) => at.toISOString().replace(/\.\d{3}Z$/, "Z");

/** The first line of the Log entry a change of status writes; the time in each status is read from these. */
export const statusLine = (from: Status, to: Status) => `Status: ${from} -> ${to}.`;

/** The change of status a Log entry records, when it records one. */
export function statusChange(entry: LogEntry): { from: Status; to: Status } | undefined {
  const match = /^Status: ([a-z-]+) -> ([a-z-]+)\.$/.exec(entry.text.split("\n")[0] ?? "");
  const [from, to] = [match?.[1], match?.[2]] as [Status | undefined, Status | undefined];
  return from && to && STATUSES.includes(from) && STATUSES.includes(to) ? { from, to } : undefined;
}
