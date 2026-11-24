export const STATUSES = ["backlog", "ready", "in-progress", "checking", "review", "accepted", "done", "blocked", "dropped"] as const;
export type Status = (typeof STATUSES)[number];

export const KINDS = ["build", "fix", "measure", "research", "review", "decision", "assets"] as const;
export type Kind = (typeof KINDS)[number];

export const TOOLS = ["claude-code", "claude-desktop", "cursor", "codex", "antigravity", "person"] as const;
export type Tool = (typeof TOOLS)[number];

type Holder = {
  tool: Tool;
  model: string;
  since: Date;
  beat: Date;
};

export type Checks = {
  total: number;
  passed: number;
  failed: number;
  state: "none" | "queued" | "running" | "finished";
  queuePlace?: number;
};

type Question = {
  askedAt: Date;
  answeredAt?: Date;
};

/** A step of a task, shown as gr8r-studio's: a title and a done mark. */
type Subtask = { id: string; title: string; done: boolean };

export type Task = {
  id: string;
  title: string;
  status: Status;
  kind: Kind;
  priority: number;
  parent?: string;
  rfc?: string;
  holder?: Holder;
  branch?: string;
  checks: Checks;
  questions: Question[];
  subtasks: Subtask[];
  createdAt: Date;
  statusSince: Date;
  landedAt?: Date;
};

export type CheckRun = {
  name: string;
  result: "passed" | "failed" | "running" | "queued";
  tookMs?: number;
  waitedMs: number;
};

export type Tokens = {
  input: number;
  cachedInput: number;
  output: number;
  reasoning: number;
};

export type Session = {
  role: "build" | "review";
  tool: Tool;
  models: string[];
  startedAt: Date;
  endedAt?: Date;
  tokens?: Tokens;
  costUsd?: number;
  /** Why the tokens and cost are not known, when they are not. */
  unknown?: string;
};

type LogEntry = {
  at: Date;
  who: Tool | "daemon";
  text: string;
};

/** What a card opened shows beyond its row. */
export type TaskDetail = {
  parentTitle?: string;
  dependsOn: { id: string; title: string; status: Status }[];
  writes: string[];
  appends: string[];
  context: string;
  doneWhen: string[];
  outOfScope: string[];
  questions: { askedAt: Date; text: string; answeredAt?: Date; answer?: string }[];
  tree?: { path: string; base: string; diff: { path: string; added: number; removed: number }[] };
  checkRuns: CheckRun[];
  review?: { by: Tool; verdict: "accepted" | "rejected" | "pending"; findings: string[]; at?: Date };
  memory: string[];
  sessions: Session[];
  timeIn: { status: Status; ms: number }[];
  log: LogEntry[];
};

export const STATUS_LABEL: Record<Status, string> = {
  backlog: "Backlog",
  ready: "Ready",
  "in-progress": "In progress",
  checking: "Checking",
  review: "Review",
  accepted: "Accepted",
  done: "Done",
  blocked: "Blocked",
  dropped: "Dropped",
};

export const KIND_LABEL: Record<Kind, string> = {
  build: "Build",
  fix: "Fix",
  measure: "Measure",
  research: "Research",
  review: "Review",
  decision: "Decision",
  assets: "Assets",
};

export const TOOL_LABEL: Record<Tool, string> = {
  "claude-code": "Claude Code",
  "claude-desktop": "Claude Desktop",
  cursor: "Cursor",
  codex: "Codex",
  antigravity: "Antigravity",
  person: "Person",
};
