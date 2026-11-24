/**
 * The sessions of the tools on a project, as their hooks and their calls
 * of the board report them: agentree starts none and follows each. A
 * session's record is the machine's, under the git common directory.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "../errors.ts";
import type { Places } from "./places.ts";

export type Subagent = {
  /** The subagent's id as its tool gives it. */
  id: string;
  /** The definition it was started from, as `agentree-worker`. */
  kind: string;
  /** The task it works on, or the empty string. */
  task: string;
  since: string;
  ended?: string;
};

export type SessionRecord = {
  /** The session's id as its tool gives it. */
  id: string;
  worker: string;
  /** Whether a person started it in its tool, or an agent started it headless through `agentree agent`. */
  started: "owner" | "headless";
  /** The session that started a headless one. */
  by?: string;
  since: string;
  beat: string;
  ended?: string;
  /** What it does while it holds no task. */
  note?: string;
  subagents: Subagent[];
};

const directory = (places: Places) => join(places.state, "sessions");
const fileOf = (places: Places, id: string) => join(directory(places), `${encodeURIComponent(id)}.json`);

export function sessions(places: Places): SessionRecord[] {
  if (!existsSync(directory(places))) return [];
  return readdirSync(directory(places))
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(directory(places), name), "utf8")) as SessionRecord)
    .sort((a, b) => a.since.localeCompare(b.since));
}

/** Writes a session's record whole. */
export function putSession(places: Places, record: SessionRecord) {
  mkdirSync(directory(places), { recursive: true });
  const draft = `${fileOf(places, record.id)}.${process.pid}.tmp`;
  writeFileSync(draft, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(draft, fileOf(places, record.id));
}

function known(places: Places, id: string): SessionRecord {
  const file = fileOf(places, id);
  if (!existsSync(file)) throw new Refusal(`no session "${id}" has reported to this board`);
  return JSON.parse(readFileSync(file, "utf8")) as SessionRecord;
}

export type Report = { id: string; worker: string; started?: SessionRecord["started"]; by?: string; note?: string };

/** A session says it is there: its first report starts its record, and each one after beats it. */
export function reportSession(places: Places, report: Report, at: string): SessionRecord {
  if (report.id === "") throw new Refusal("a session reports with the id its tool gives it");
  const file = fileOf(places, report.id);
  const before = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as SessionRecord) : undefined;
  const { ended: _, ...running } = before ?? {
    id: report.id,
    worker: report.worker,
    started: report.started ?? "owner",
    since: at,
    beat: at,
    subagents: [],
  };
  const record: SessionRecord = {
    ...running,
    worker: report.worker,
    beat: at,
    ...(report.by ? { by: report.by } : {}),
    ...(report.note === undefined ? {} : { note: report.note }),
  };
  putSession(places, record);
  return record;
}

/** A session ended; its subagents that still ran ended with it. */
export function endSession(places: Places, id: string, at: string): SessionRecord {
  const before = known(places, id);
  const record = { ...before, ended: at, subagents: before.subagents.map((sub) => (sub.ended ? sub : { ...sub, ended: at })) };
  putSession(places, record);
  return record;
}

/** A session started a subagent of its own tool. */
export function startSubagent(places: Places, session: string, subagent: Pick<Subagent, "id" | "kind" | "task">, at: string): SessionRecord {
  const before = known(places, session);
  const record = { ...before, beat: at, subagents: [...before.subagents.filter((sub) => sub.id !== subagent.id), { ...subagent, since: at }] };
  putSession(places, record);
  return record;
}

/** A subagent ended, or took a task: its record says which. */
export function updateSubagent(places: Places, session: string, id: string, change: { task?: string; ended?: string }, at: string): SessionRecord {
  const before = known(places, session);
  if (!before.subagents.some((sub) => sub.id === id)) throw new Refusal(`session "${session}" has no subagent "${id}"`);
  const record = { ...before, beat: at, subagents: before.subagents.map((sub) => (sub.id === id ? { ...sub, ...change } : sub)) };
  putSession(places, record);
  return record;
}
