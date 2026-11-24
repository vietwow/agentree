import type { Tool } from "./task.ts";

export type ActivityKind = "status" | "question" | "check";

/** One change on the board: who made it, what it was, and on which task. */
export type ActivityEntry = {
  at: Date;
  who: Tool | "daemon";
  text: string;
  kind: ActivityKind;
  task: string;
};
