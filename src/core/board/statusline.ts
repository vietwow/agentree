/**
 * What Claude Code's status line tells the board. Claude Code runs the
 * status line's command with the session's data on standard input at each
 * update: its id, its model and the session's estimated cost. This follows
 * the session, writes the model and the cost as what it used on the task it
 * holds or reviews, and gives the line to show. Its token fields are the
 * context window's, not the session's use, and are not taken.
 */
import { Refusal } from "../errors.ts";
import { stamp } from "../task/model.ts";
import { boardOf, type Places } from "./places.ts";
import { reportSession } from "./sessions.ts";
import { claims, reviews } from "./state.ts";
import { readBoard } from "./store.ts";
import { reportUse, sessionsOf } from "./usage.ts";

type Input = {
  session_id?: unknown;
  cwd?: unknown;
  model?: { id?: unknown };
  workspace?: { current_dir?: unknown };
  cost?: { total_cost_usd?: unknown };
};

const NO_TOKENS = "Claude Code's status line gives the session's estimated cost; its token fields are the context window's, not the session's use";

/** Acts on one update of the status line, started in a directory; the line to show, empty where there is no board or no session. */
export function onStatusLine(directory: string, input: Input, now: Date): string {
  const text = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);
  const id = text(input.session_id);
  let places: Places;
  try {
    places = boardOf(text(input.workspace?.current_dir) ?? text(input.cwd) ?? directory);
  } catch (error) {
    if (error instanceof Refusal) return "";
    throw error;
  }
  if (!id) return "";
  const at = stamp(now);
  const model = (text(input.model?.id) ?? "unknown").replace(/[^A-Za-z0-9._-]+/g, "-");
  const worker = `claude-code/${model}`;
  reportSession(places, { id, worker }, at);
  const built = [...claims(places)].find(([, hold]) => hold.session === id)?.[0];
  const reviewed = built ? undefined : [...reviews(places)].find(([, hold]) => hold.session === id)?.[0];
  const task = built ?? reviewed;
  if (!task) return "agentree: no task held";
  const cost = input.cost?.total_cost_usd;
  if (typeof cost === "number" && Number.isFinite(cost)) {
    const role = built ? "build" : "review";
    const before = sessionsOf(places, task).find((each) => each.session === id && each.role === role);
    // To the cent: the line is updated at every message, and the board keeps a commit only for a cost that moved.
    const costUsd = Math.round(cost * 100) / 100;
    if (before?.costUsd !== costUsd || !before.models.includes(model))
      reportUse(places, task, {
        session: id,
        worker,
        role,
        models: before ? [...new Set([...before.models, model])] : [model],
        startedAt: before?.startedAt ?? at,
        costUsd,
        unknown: NO_TOKENS,
      });
  }
  const status = readBoard(places).tasks.find((stored) => stored.task.fields.id === task)?.task.fields.status;
  return `agentree: ${task}${status ? `, ${status}` : ""}${reviewed ? ", under your review" : ""}`;
}
