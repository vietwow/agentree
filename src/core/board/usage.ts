/**
 * What each session used on a task, as its tool reports it: a file of the
 * board's branch beside the tasks, `work/usage/T-NNNN.jsonl`, a session a
 * line. A value a tool did not report is absent, with the reason, and is
 * never estimated.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git } from "../git.ts";
import type { Places } from "./places.ts";

export type Tokens = { input: number; cachedInput: number; output: number; reasoning: number };

export type SessionUse = {
  /** The session's id as its tool gives it. */
  session: string;
  worker: string;
  role: "build" | "review";
  /** Each model the session ran on, in the order it changed to them. */
  models: string[];
  startedAt: string;
  endedAt?: string;
  tokens?: Tokens;
  costUsd?: number;
  /** Why the tokens and the cost are not known, when they are not. */
  unknown?: string;
};

const fileOf = (id: string) => `work/usage/${id}.jsonl`;

/** The sessions that worked on a task, in the order they started. */
export function sessionsOf(places: Places, id: string): SessionUse[] {
  const path = join(places.board, fileOf(id));
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionUse);
}

/** Writes what a session reports of itself, in place of what it reported before, as a commit of the board. */
export function reportUse(places: Places, id: string, use: SessionUse) {
  const sessions = sessionsOf(places, id);
  const at = sessions.findIndex((each) => each.session === use.session && each.role === use.role);
  const next = at < 0 ? [...sessions, use] : sessions.with(at, { ...sessions[at], ...use });
  const text = `${next.map((each) => JSON.stringify(each)).join("\n")}\n`;
  const path = join(places.board, fileOf(id));
  if (existsSync(path) && readFileSync(path, "utf8") === text) return;
  writeFileSync(path, text);
  git(places.board, "add", "--", fileOf(id));
  git(places.board, "commit", "--quiet", "-m", `${id}: what ${use.worker} used`, "--", fileOf(id));
}
