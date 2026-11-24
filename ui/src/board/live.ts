import type { ActivityEntry } from "./activity.ts";
import type { AgentSession } from "./fixtures.ts";
import { TOOL_LABEL, type Task, type Tool } from "./task.ts";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** A live session of a tool, drawn as a card around the project. */
export type Seat = {
  id: string;
  tool: Tool;
  model: string;
  doing: string;
  /** The task the card opens. */
  task?: string;
  tasks: string[];
  subs: number;
  idle: boolean;
  started: string;
  /** Its share of the board's last day of activity, from 0 to 1. */
  weight: number;
};

export type Region = { tool: Tool; label: string; note: string; seats: Seat[] };

/** One seat reaching another: a session started headless, or a task handed to its reviewer. */
export type Pulse = { from: string; to: string; at: Date; text: string };

export type Said = { at: Date; who: string; text: string };

export type LiveBoard = {
  regions: Region[];
  pulses: Pulse[];
  landed?: { id: string; at: Date };
  stats: { sessions: number; working: number; tools: number; today: number };
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function doing(s: AgentSession, now: Date): string {
  const live = s.subagents.filter((a) => !a.ended);
  const reviews = live.filter((a) => a.kind === "agentree-reviewer").length;
  const workers = live.filter((a) => a.kind === "agentree-worker").length;
  if (s.state === "asking") return `asking you on ${s.task}`;
  if (s.state === "stale") return `no beat for ${Math.round((now.getTime() - s.beat.getTime()) / MINUTE)} min`;
  if (reviews) return `reviewing ${plural(reviews, "task")}`;
  if (workers) return `directing ${plural(workers, "worker")}`;
  if (s.state === "checking") return `checking ${s.task}`;
  if (s.state === "reviewing") return `reviewing ${s.task}`;
  return s.task ? `building ${s.task}` : (s.note ?? "working");
}

export function liveBoard(sessions: readonly AgentSession[], tasks: readonly Task[], activity: readonly ActivityEntry[], now: Date): LiveBoard {
  const live = sessions.filter((s) => !s.ended);
  const recent = activity.filter((e) => now.getTime() - e.at.getTime() < DAY);
  const raw = live.map((s) => {
    const own = [s.task, ...s.subagents.filter((a) => !a.ended).map((a) => a.task)].filter((t): t is string => !!t);
    const fresh = now.getTime() - s.beat.getTime() < 5 * MINUTE ? 2 : 0;
    return { s, own, n: recent.filter((e) => own.includes(e.task)).length + 1 + fresh + (s.id.charCodeAt(0) % 3) };
  });
  const most = Math.max(1, ...raw.map((r) => r.n));
  const seats: Seat[] = raw.map(({ s, own, n }) => ({
    id: s.id,
    tool: s.tool,
    model: s.model,
    doing: doing(s, now),
    task: s.task ?? own[0],
    tasks: own,
    subs: s.subagents.filter((a) => !a.ended).length,
    idle: s.state === "stale",
    started: s.started === "owner" ? "started by you" : `headless, started by ${s.by}`,
    weight: n / most,
  }));

  const tools = [...new Set(seats.map((s) => s.tool))];
  const regions = tools.map((tool) => {
    const of = seats.filter((s) => s.tool === tool);
    return {
      tool,
      label: TOOL_LABEL[tool],
      note: `${[...new Set(of.map((s) => s.model))].join(" · ")} · ${plural(of.length, "session")}`,
      seats: of,
    };
  });

  const pulses: Pulse[] = [];
  for (const s of live) {
    const by = s.by?.split(" ").at(-1);
    if (by && seats.some((x) => x.id === by)) pulses.push({ from: by, to: s.id, at: s.since, text: `Started it headless; it is ${doing(s, now)}` });
    for (const a of s.subagents) {
      if (a.kind !== "agentree-reviewer" || a.ended) continue;
      const builder = sessions.find(
        (b) => b.id !== s.id && (b.task === a.task || b.subagents.some((w) => w.kind === "agentree-worker" && w.task === a.task)),
      );
      if (builder && seats.some((x) => x.id === builder.id))
        pulses.push({ from: builder.id, to: s.id, at: a.since, text: `Handed ${a.task} to its reviewer` });
    }
  }
  pulses.sort((a, b) => b.at.getTime() - a.at.getTime());

  const last = tasks.filter((t) => t.landedAt).sort((a, b) => b.landedAt!.getTime() - a.landedAt!.getTime())[0];
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return {
    regions,
    pulses,
    landed: last && { id: last.id, at: last.landedAt! },
    stats: {
      sessions: sessions.length + sessions.reduce((n, s) => n + s.subagents.length, 0),
      working: live.length + live.reduce((n, s) => n + s.subagents.filter((a) => !a.ended).length, 0),
      tools: regions.length,
      today: activity.filter((e) => e.at >= midnight && e.at <= now).length,
    },
  };
}

/** What a seat said and heard last: its pulses, then the log of its tasks. */
export function saidBy(seat: Seat, pulses: readonly Pulse[], activity: readonly ActivityEntry[]): Said[] {
  const heard = pulses
    .filter((p) => p.from === seat.id || p.to === seat.id)
    .map((p) => ({ at: p.at, who: p.from === seat.id ? `→ ${p.to}` : `← ${p.from}`, text: p.text }));
  const logged = activity.filter((e) => seat.tasks.includes(e.task)).map((e) => ({ at: e.at, who: e.task, text: e.text }));
  return [...heard, ...logged].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 3);
}
