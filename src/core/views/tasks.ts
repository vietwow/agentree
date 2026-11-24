/**
 * The board as the UI reads it: a task's row, a card opened, and what
 * happened on the board. Each is read from the task files and the
 * machine's state and holds no rule; times are UTC, as ISO strings.
 */
import { existsSync } from "node:fs";
import { tryGit } from "../git.ts";
import { DAEMON, modelOf, statusChange, toolOf, type LogEntry, type Status, type Task, type Tool } from "../task/model.ts";
import { factsFor } from "../board/memory.ts";
import type { Places } from "../board/places.ts";
import { checksOf, claimOf, reviewOf, submissionOf, type Checks, type Claim, type Hold } from "../board/state.ts";
import { sessionsOf, type Tokens } from "../board/usage.ts";
import type { Board } from "../board/store.ts";

export type Who = Tool | typeof DAEMON;

export type TaskView = {
  id: string;
  title: string;
  status: Status;
  kind: Task["fields"]["kind"];
  priority: number;
  parent?: string;
  rfc?: string;
  /** Who holds it, or reviews it, and when it last said it was there. */
  holder?: { tool: Tool; model: string; since: string; beat: string };
  branch?: string;
  checks: { total: number; passed: number; failed: number; state: "none" | "queued" | "running" | "finished"; queuePlace?: number };
  questions: { askedAt: string; answeredAt?: string }[];
  subtasks: { id: string; title: string; done: boolean }[];
  createdAt: string;
  statusSince: string;
  landedAt?: string;
};

export type TaskDetailView = {
  parentTitle?: string;
  dependsOn: { id: string; title: string; status: Status }[];
  writes: string[];
  appends: string[];
  context: string;
  doneWhen: string[];
  outOfScope: string[];
  questions: { askedAt: string; text: string; choices: string[]; answeredAt?: string; answer?: string }[];
  tree?: { path: string; base: string; diff: { path: string; added: number; removed: number }[] };
  checkRuns: { name: string; result: "passed" | "failed" | "running" | "queued"; tookMs?: number; waitedMs: number }[];
  /** The titles of the facts of memory its claim's brief holds. */
  memory: string[];
  review?: { by: Tool; verdict: "accepted" | "rejected" | "pending"; findings: string[]; at?: string };
  sessions: {
    role: "build" | "review";
    tool: Tool;
    models: string[];
    startedAt: string;
    endedAt?: string;
    tokens?: Tokens;
    costUsd?: number;
    unknown?: string;
  }[];
  timeIn: { status: Status; ms: number }[];
  log: { at: string; who: Who; text: string }[];
};

export type ActivityView = { at: string; who: Who; text: string; kind: "status" | "question" | "check"; task: string };

const whoOf = (by: string): Who => (by === DAEMON ? DAEMON : toolOf(by));
const holderOf = (hold: Hold) => ({ tool: toolOf(hold.by), model: modelOf(hold.by), since: hold.since, beat: hold.beat });

function checksView(task: Task, checks: Checks | undefined): TaskView["checks"] {
  const total = task.fields.checks.length;
  if (!checks) return { total, passed: 0, failed: 0, state: "none" };
  const passed = checks.runs.filter((run) => run.result === "passed").length;
  return { total, passed, failed: checks.runs.length - passed, state: checks.state };
}

/** A task as a row of the list and a card of the board. */
export function taskView(places: Places, task: Task): TaskView {
  const { fields } = task;
  const claim: Claim | undefined = claimOf(places, fields.id);
  const hold = claim ?? reviewOf(places, fields.id);
  const changes = task.log.filter((entry) => statusChange(entry));
  const landed = changes.findLast((entry) => statusChange(entry)!.to === "done");
  const branch = claim?.branch ?? submissionOf(places, fields.id)?.branch;
  return {
    id: fields.id,
    title: fields.title,
    status: fields.status,
    kind: fields.kind,
    priority: fields.priority,
    ...(fields.parent ? { parent: fields.parent } : {}),
    ...(fields.rfc ? { rfc: fields.rfc } : {}),
    ...(hold ? { holder: holderOf(hold) } : {}),
    ...(branch ? { branch } : {}),
    checks: checksView(task, checksOf(places, fields.id)),
    questions: task.questions.map((q) => ({ askedAt: q.at, ...(q.answeredAt ? { answeredAt: q.answeredAt } : {}) })),
    subtasks: task.subtasks.map((sub, index) => ({ id: `${fields.id}.${index + 1}`, ...sub })),
    createdAt: fields.created,
    statusSince: changes.at(-1)?.at ?? fields.created,
    ...(fields.status === "done" && landed ? { landedAt: landed.at } : {}),
  };
}

/** The lines of a section as a list: its list items, or its paragraphs when it holds none. */
function items(text: string): string[] {
  const listed = text.split("\n").flatMap((line) => (/^[-*] (.+)$/.exec(line)?.[1] ? [/^[-*] (.+)$/.exec(line)![1]!.trim()] : []));
  return listed.length
    ? listed
    : text
        .split(/\n{2,}/)
        .map((part) => part.trim())
        .filter(Boolean);
}

/** How long a task was in each status it has been in, up to a time, read from its Log. */
export function timeIn(task: Task, now: Date): { status: Status; ms: number }[] {
  const spent = new Map<Status, number>();
  let status: Status = task.log.map(statusChange).find(Boolean)?.from ?? task.fields.status;
  let since = Date.parse(task.fields.created);
  const add = (until: number) => spent.set(status, (spent.get(status) ?? 0) + Math.max(0, until - since));
  for (const entry of task.log) {
    const change = statusChange(entry);
    if (!change) continue;
    add(Date.parse(entry.at));
    status = change.to;
    since = Date.parse(entry.at);
  }
  add(now.getTime());
  return [...spent].map(([each, ms]) => ({ status: each, ms }));
}

/** The files a tree changed from its base, each with its lines added and removed. */
function diffOf(tree: string, base: string): { path: string; added: number; removed: number }[] {
  const stat = tryGit(tree, "diff", "--numstat", base);
  if (stat.status !== 0) return [];
  return stat.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"))
    .map(([added, removed, path]) => ({ path: path!, added: Number(added) || 0, removed: Number(removed) || 0 }));
}

function reviewView(places: Places, task: Task): TaskDetailView["review"] {
  const mark = reviewOf(places, task.fields.id);
  if (task.fields.status === "review" && mark) return { by: toolOf(mark.by), verdict: "pending", findings: [] };
  const verdict = task.log.findLast((entry) => entry.by !== DAEMON && statusChange(entry)?.from === "review");
  if (!verdict) return undefined;
  const findings = items(verdict.text.split("\n").slice(1).join("\n").trim());
  return { by: toolOf(verdict.by), verdict: statusChange(verdict)!.to === "accepted" ? "accepted" : "rejected", findings, at: verdict.at };
}

/** What a card opened shows beyond its row. */
export function taskDetailView(board: Board, task: Task, now: Date): TaskDetailView {
  const { places } = board;
  const { fields } = task;
  const byId = new Map(board.tasks.map((stored) => [stored.task.fields.id, stored.task]));
  const hold = claimOf(places, fields.id) ?? submissionOf(places, fields.id);
  const checks = checksOf(places, fields.id);
  const ran = new Map(checks?.runs.map((run) => [run.command, run]));
  const review = reviewView(places, task);
  const parent = byId.get(fields.parent);
  return {
    ...(parent ? { parentTitle: parent.fields.title } : {}),
    dependsOn: fields.dependsOn.flatMap((id) =>
      byId.get(id) ? [{ id, title: byId.get(id)!.fields.title, status: byId.get(id)!.fields.status }] : [],
    ),
    writes: fields.writes,
    appends: fields.appends,
    context: task.context,
    doneWhen: items(task.doneWhen),
    outOfScope: items(task.outOfScope),
    questions: task.questions.map((q) => ({
      askedAt: q.at,
      text: q.text,
      choices: q.choices,
      ...(q.answeredAt ? { answeredAt: q.answeredAt, answer: q.answer ?? "" } : {}),
    })),
    ...(hold?.tree && existsSync(hold.tree) ? { tree: { path: hold.tree, base: hold.base, diff: diffOf(hold.tree, hold.base) } } : {}),
    checkRuns: checks
      ? fields.checks.map((name) => {
          const run = ran.get(name);
          if (!run) return { name, result: checks.state === "queued" ? ("queued" as const) : ("running" as const), waitedMs: 0 };
          return { name, result: run.result === "passed" ? ("passed" as const) : ("failed" as const), tookMs: run.tookMs, waitedMs: run.waitedMs };
        })
      : [],
    memory: factsFor(places, task).map((fact) => fact.title),
    ...(review ? { review } : {}),
    sessions: sessionsOf(places, fields.id).map(({ session: _, worker, ...use }) => ({ ...use, tool: toolOf(worker) })),
    timeIn: timeIn(task, now),
    log: task.log.map((entry) => ({ at: entry.at, who: whoOf(entry.by), text: entry.text })),
  };
}

const MOVES: Partial<Record<`${Status}>${Status}`, string>> = {
  "ready>in-progress": "Claimed it",
  "in-progress>checking": "Submitted it; its checks run",
  "checking>review": "Checks passed; it waits for a review",
  "checking>in-progress": "A check failed; it is back with its worker",
  "review>accepted": "Accepted it",
  "review>ready": "Rejected it with findings",
  "accepted>done": "Landed it on main",
  "accepted>ready": "Sent it back from its landing",
  "accepted>review": "Rebased it; it is reviewed again",
  "backlog>ready": "Made it ready",
  "in-progress>ready": "Released it",
  "in-progress>blocked": "Released it, blocked",
};

function activityOf(entry: LogEntry): Pick<ActivityView, "text" | "kind"> {
  const change = statusChange(entry);
  if (!change) return { text: entry.text.split("\n")[0]!, kind: "status" };
  const text = MOVES[`${change.from}>${change.to}`] ?? `Moved it from ${change.from} to ${change.to}`;
  return { text, kind: change.from === "checking" || change.to === "checking" ? "check" : "status" };
}

/** What happened on the board, latest first: every Log entry, every question and every answer. */
export function activityView(board: Board): ActivityView[] {
  const entries = board.tasks.flatMap(({ task }) => [
    ...task.log.map((entry): ActivityView => ({ at: entry.at, who: whoOf(entry.by), task: task.fields.id, ...activityOf(entry) })),
    ...task.questions.flatMap((q): ActivityView[] => [
      { at: q.at, who: whoOf(q.by), task: task.fields.id, kind: "question", text: `Asked the owner: ${q.text.split("\n")[0]}` },
      ...(q.answeredAt
        ? [
            {
              at: q.answeredAt,
              who: "person" as const,
              task: task.fields.id,
              kind: "question" as const,
              text: `The owner answered: ${(q.answer ?? "").split("\n")[0]}`,
            },
          ]
        : []),
    ]),
  ]);
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
