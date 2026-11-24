/** A project as the UI lists it, the sessions that work on it, and the points its progress has passed. */
import { isStale } from "../board/actions.ts";
import type { Places } from "../board/places.ts";
import { sessions, type SessionRecord } from "../board/sessions.ts";
import { claims, reviews } from "../board/state.ts";
import { readBoard, type Board } from "../board/store.ts";
import type { Registered } from "../machine/projects.ts";
import { modelOf, statusChange, TOOLS, toolOf, type Task, type Tool } from "../task/model.ts";
import { documentsView } from "./documents.ts";

export type ProjectView = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  color: string;
  status: "planning" | "active" | "risk" | "hold" | "complete";
  private: boolean;
  /** The tools that have worked on it. */
  tools: Tool[];
  createdAt: string;
  lastAt: string;
  total: number;
  done: number;
};

/**
 * A project's state, read from its board: complete when every task is
 * done, on hold when the owner set it aside, at risk while a claim is
 * stale or a task is blocked, planning until a task is first claimed.
 */
export function projectView(project: Registered, board: Board, now: Date): ProjectView {
  const all = board.tasks.map((stored) => stored.task).filter((task) => task.fields.status !== "dropped");
  const done = all.filter((task) => task.fields.status === "done").length;
  const entries = all.flatMap((task) => task.log);
  const stale = [...claims(board.places).values()].some((hold) => isStale(hold, now));
  const started = entries.some((entry) => statusChange(entry)?.to === "in-progress");
  const status = project.hold
    ? "hold"
    : all.length > 0 && done === all.length
      ? "complete"
      : stale || all.some((task) => task.fields.status === "blocked")
        ? "risk"
        : started
          ? "active"
          : "planning";
  const worked = new Set(
    entries
      .map((entry) => entry.by)
      .filter((by) => by.includes("/"))
      .map(toolOf),
  );
  return {
    id: project.id,
    name: project.name,
    desc: project.desc,
    icon: project.icon,
    color: project.color,
    status,
    private: project.private,
    tools: TOOLS.filter((tool) => tool !== "person" && worked.has(tool)),
    createdAt: project.registeredAt,
    lastAt: entries.reduce((latest, entry) => (entry.at > latest ? entry.at : latest), project.registeredAt),
    total: all.length,
    done,
  };
}

export type AgentState = "working" | "checking" | "reviewing" | "asking" | "stale" | "ended";

export type AgentSessionView = {
  id: string;
  tool: Tool;
  model: string;
  started: "owner" | "headless";
  by?: string;
  since: string;
  beat: string;
  ended?: string;
  state: AgentState;
  task?: string;
  note?: string;
  subagents: { kind: string; task: string; state: AgentState; since: string; ended?: string }[];
};

/** What a session, or a subagent, does on the task it works on. */
function stateOn(task: Task | undefined, reviewing: boolean): AgentState {
  if (reviewing) return "reviewing";
  if (task?.fields.status === "checking") return "checking";
  if (task?.questions.some((question) => !question.answeredAt)) return "asking";
  return "working";
}

/** The sessions of a project, each with the task it holds or reviews, what it does, and its subagents. */
export function agentsView(places: Places, now: Date): AgentSessionView[] {
  const byId = new Map(readBoard(places).tasks.map((stored) => [stored.task.fields.id, stored.task]));
  const held = [...claims(places)];
  const marked = [...reviews(places)];
  return sessions(places).map((session: SessionRecord): AgentSessionView => {
    const mine = (hold: { by: string; session: string }) => hold.by === session.worker && hold.session === session.id;
    const claim = held.find(([, hold]) => mine(hold));
    const mark = marked.find(([, hold]) => mine(hold));
    const task = claim?.[0] ?? mark?.[0];
    const beat = [session.beat, claim?.[1].beat, mark?.[1].beat]
      .filter((each): each is string => !!each)
      .sort()
      .at(-1)!;
    const state: AgentState = session.ended ? "ended" : isStale({ beat }, now) ? "stale" : stateOn(byId.get(task ?? ""), !claim && !!mark);
    return {
      id: session.id,
      tool: toolOf(session.worker),
      model: modelOf(session.worker),
      started: session.started,
      ...(session.by ? { by: session.by } : {}),
      since: session.since,
      beat,
      ...(session.ended ? { ended: session.ended } : {}),
      state,
      ...(task ? { task } : {}),
      ...(session.note && !task ? { note: session.note } : {}),
      subagents: session.subagents.map((sub) => ({
        kind: sub.kind,
        task: sub.task,
        state: sub.ended ? "ended" : stateOn(byId.get(sub.task), byId.get(sub.task)?.fields.status === "review"),
        since: sub.since,
        ...(sub.ended ? { ended: sub.ended } : {}),
      })),
    };
  });
}

export type MilestoneView = { at: string; name: string; kind: "document" | "epic" };

/** The points on the Progress page: each RFC or ADR accepted, on its date, and each epic done, when its last task landed. */
export function milestonesView(board: Board): MilestoneView[] {
  const all = board.tasks.map((stored) => stored.task);
  const documents = documentsView(board.places)
    .filter((doc) => doc.status === "accepted" && /^\d{4}-\d{2}-\d{2}/.test(doc.date))
    .map((doc): MilestoneView => ({ at: `${doc.date.slice(0, 10)}T00:00:00Z`, name: `${doc.kind} ${doc.number} ${doc.title}`, kind: "document" }));
  const epics = all.flatMap((epic): MilestoneView[] => {
    const parts = all.filter((task) => task.fields.parent === epic.fields.id && task.fields.status !== "dropped");
    const landed = parts.map((task) => task.log.findLast((entry) => statusChange(entry)?.to === "done")?.at);
    if (!parts.length || landed.some((at) => !at) || parts.some((task) => task.fields.status !== "done")) return [];
    return [{ at: (landed as string[]).sort().at(-1)!, name: `${epic.fields.title} done`, kind: "epic" }];
  });
  return [...documents, ...epics].sort((a, b) => a.at.localeCompare(b.at));
}
