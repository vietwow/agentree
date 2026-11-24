/**
 * What a tool's hooks tell the board. Each tool runs `agentree hook <tool>
 * <event>` with its own JSON on standard input; this reads the few fields
 * the tools name alike or differently, follows the session, beats the
 * claim it holds, and refuses an edit outside its task's paths at the
 * moment of the edit, in the form that tool reads a refusal in.
 */
import { resolve, sep } from "node:path";
import { Refusal } from "../errors.ts";
import { modelOf, stamp, type Tool } from "../task/model.ts";
import { boardOf, type Places } from "./places.ts";
import { inScope } from "./rules.ts";
import { endSession, reportSession, sessions, startSubagent, updateSubagent } from "./sessions.ts";
import { beat, claims } from "./state.ts";
import { readBoard } from "./store.ts";

export type Hooked = { exit: number; stdout?: string; stderr?: string };

type Input = Record<string, any>;

const first = (...values: unknown[]) => values.find((value): value is string => typeof value === "string" && value !== "");

/** The files a tool call would change, as each tool names them: a path among its arguments, or the files a patch names. */
function edited(input: Input): string[] {
  const name = first(input.tool_name, input.toolCall?.name) ?? "";
  const args = (input.tool_input ?? input.toolCall?.args ?? {}) as Input;
  if (name === "apply_patch")
    return [...String(args.command ?? "").matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm)].map((match) => match[1]!.trim());
  if (!/edit|write|patch|replace|create|delete|notebook/i.test(name)) return [];
  return Object.entries(args).flatMap(([key, value]) =>
    typeof value === "string" && /^(file_?path|notebook_?path|path|target_?file|absolute_?path)$/i.test(key) ? [value] : [],
  );
}

/** Why an edit of a file is refused: it is in a task's tree and outside that task's paths, or it is a file of the board. */
function refusal(places: Places, cwd: string, file: string): string | undefined {
  const path = resolve(cwd, file);
  if (!path.startsWith(places.trees + sep)) return undefined;
  const [tree, ...rest] = path.slice(places.trees.length + 1).split(sep);
  if (tree === "board") return "The board's files are written only through `agentree` or its MCP tools, never by hand.";
  const task = readBoard(places).tasks.find((stored) => stored.task.fields.id === tree)?.task;
  const inTree = rest.join("/");
  if (!task || inScope(task, inTree)) return undefined;
  const paths = [...task.fields.writes, ...task.fields.appends];
  return `${inTree} is outside ${tree}'s "writes" and "appends" (${paths.join(", ") || "none"}). Change only its paths; what is wrong elsewhere goes into its Log under "Found".`;
}

/** The answer in the form each tool reads: a refusal stops the tool call, and anything else lets it go on. */
function answer(tool: Tool, event: string, why?: string): Hooked {
  const gate = event.toLowerCase() === "pretooluse";
  if (tool === "cursor")
    return gate
      ? { exit: 0, stdout: JSON.stringify(why ? { permission: "deny", user_message: why, agent_message: why } : { permission: "allow" }) }
      : { exit: 0 };
  if (tool === "antigravity")
    return gate ? { exit: 0, stdout: JSON.stringify(why ? { decision: "deny", reason: why } : { decision: "allow" }) } : { exit: 0 };
  return why ? { exit: 2, stderr: why } : { exit: 0 };
}

/** Acts on one hook of a tool, started in a directory, at a time. A hook never fails its tool: what is no session of a board is let through. */
export function onHook(directory: string, tool: Tool, event: string, input: Input, now: Date): Hooked {
  const cwd = first(input.cwd, input.workspace_roots?.[0], input.workspacePaths?.[0]) ?? directory;
  const id = first(input.session_id, input.conversation_id, input.conversationId);
  let places: Places;
  try {
    places = boardOf(cwd);
  } catch (error) {
    if (error instanceof Refusal) return answer(tool, event);
    throw error;
  }
  if (!id) return answer(tool, event);
  const at = stamp(now);
  const known = sessions(places).find((session) => session.id === id);
  const model = first(input.model, input.modelName)?.replace(/[^A-Za-z0-9._-]+/g, "-") ?? (known ? modelOf(known.worker) : "unknown");
  const kind = event.toLowerCase();
  if (kind === "sessionend") {
    if (known) endSession(places, id, at);
    return answer(tool, event);
  }
  reportSession(places, { id, worker: `${tool}/${model}` }, at);
  for (const [task, hold] of claims(places)) if (hold.session === id) beat(places, "claims", task, at);
  const subagent = first(input.agent_id, input.subagent_id);
  if (kind === "subagentstart" && subagent)
    startSubagent(places, id, { id: subagent, kind: first(input.agent_type, input.subagent_type) ?? "subagent", task: "" }, at);
  if (kind === "subagentstop" && subagent && known?.subagents.some((sub) => sub.id === subagent))
    updateSubagent(places, id, subagent, { ended: at }, at);
  if (kind !== "pretooluse") return answer(tool, event);
  return answer(
    tool,
    event,
    edited(input)
      .map((file) => refusal(places, cwd, file))
      .find(Boolean),
  );
}
