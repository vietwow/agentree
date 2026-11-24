import { fixtureLog } from "./fixtures.ts";
import type { Task, Tool } from "./task.ts";

export type ActivityKind = "status" | "question" | "check";

/** One change on the board: who made it, what it was, and on which task. */
export type ActivityEntry = {
  at: Date;
  who: Tool | "daemon";
  text: string;
  kind: ActivityKind;
  task: string;
};

function kindOf(text: string): ActivityKind {
  if (/^Asked|answered/.test(text)) return "question";
  if (/check/i.test(text) && !/^Checks passed/.test(text)) return "check";
  return "status";
}

export function fixtureActivity(tasks: readonly Task[], now: Date): ActivityEntry[] {
  return tasks
    .flatMap((task) => fixtureLog(task, now).map((e) => ({ ...e, kind: kindOf(e.text), task: task.id })))
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}
