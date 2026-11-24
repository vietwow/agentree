/** What the pages read beyond a task: the points of progress, the memory, the slots, the sessions, the tools and the documents. */
import type { Tool } from "./task.ts";

/** A point on the Progress page: an RFC or ADR accepted, or an epic done. */
export type Milestone = { at: Date; name: string; kind: "document" | "epic" };

/** A file of `work/memory/`: one fact, what it is about, and where it came from. */
export type Fact = {
  file: string;
  kind: "agreement" | "decision" | "pitfall" | "how-to";
  title: string;
  body: string;
  paths: string[];
  task?: string;
  by: Tool;
  state: "in-force" | "proposed" | "retired";
  at: Date;
};

/** A heavy run that holds a seat: a check or a command a worker ran through `agentree run`. */
type Run = {
  task: string;
  by: Tool;
  what: "check" | "command";
  command: string;
  since: Date;
  seat: number;
  ports: number[];
  /** What it was given, and what it takes now where that is measured. */
  cpu: { used?: number; given: number };
  memory: { used?: number; given: number };
  bound: number;
};

/** A run that waits for a seat, and why. */
export type Waiting = {
  task: string;
  by: Tool;
  what: Run["what"];
  command: string;
  since: Date;
  cost: { cpu: number; memory: number };
  why: "no room" | "its turn" | "sensitive to load";
  reason: string;
};

export type Slots = {
  cores: number;
  memory: number;
  runs: Run[];
  queue: Waiting[];
  /** A sample a minute over the last hour: the host's load and Docker's machine's, each over its processors. */
  load: { at: Date; host: number; vm: number }[];
  mark: number;
  free: { cpu: number; memory: number };
  bounds: { lowest: number; highest: number; margin: number; fixed: boolean };
  decisions: { at: Date; kind: "start" | "hold" | "stop" | "add" | "mark"; text: string; task?: string }[];
};

/** A session of a tool, as its hooks and its calls of the board report it, with the subagents it started. */
export type AgentSession = {
  id: string;
  tool: Tool;
  model: string;
  started: "owner" | "headless";
  by?: string;
  since: Date;
  beat: Date;
  ended?: Date;
  state: AgentState;
  task?: string;
  /** What it does when it holds no task: reading, planning, writing memory. */
  note?: string;
  subagents: { kind: "agentree-worker" | "agentree-reviewer"; task: string; state: AgentState; since: Date; ended?: Date }[];
};

export type AgentState = "working" | "checking" | "reviewing" | "asking" | "stale" | "ended";

/** What `init` set up in each tool, and the owner's switch for its own tasks. */
export type ToolSetup = {
  tool: Tool;
  hooks: string[];
  mcp: boolean;
  definitions: boolean;
  reportsUse: "full" | "model only" | "none";
  reviewsOwn: boolean;
};

/** An RFC or ADR of `main`, as the Documents page reads it. */
export type Doc = {
  id: string;
  kind: "RFC" | "ADR";
  number: string;
  title: string;
  status: "draft" | "accepted" | "superseded";
  date: string;
  path: string;
  supersedes?: string;
  supersededBy?: string;
  sections: { h: string; body: string[] }[];
};
