/**
 * What a session run headless says of itself in its tool's JSON output:
 * its id, its models, its tokens and its cost. Each tool's output is read
 * as its documentation gives it; what a tool does not say is not known,
 * with the reason, and is never estimated.
 */
import type { Tool } from "../task/model.ts";
import type { SessionUse, Tokens } from "./usage.ts";

export type Reported = Pick<SessionUse, "models"> & { session?: string; tokens?: Tokens; costUsd?: number; unknown?: string };

/** The tool a headless command starts, by the command's own name. */
export const TOOL_OF_COMMAND: Record<string, Exclude<Tool, "person" | "claude-desktop">> = {
  claude: "claude-code",
  codex: "codex",
  agent: "cursor",
  "cursor-agent": "cursor",
  agy: "antigravity",
};

/** What each tool is asked for, so that its output can be read. */
export const JSON_OUTPUT: Record<string, string> = {
  "claude-code": "--output-format json",
  codex: "--json",
  cursor: "--output-format json",
  antigravity: "--output-format json",
};

type Json = Record<string, any>;

/** Every JSON object of an output: one object, or one a line. */
function objects(output: string): Json[] {
  const found: Json[] = [];
  for (const text of [output.trim(), ...output.split("\n")]) {
    try {
      const value: unknown = JSON.parse(text);
      if (value && typeof value === "object" && !Array.isArray(value)) found.push(value as Json);
      if (found.length === 1 && text === output.trim()) return found;
    } catch {
      // A line that is no JSON is the tool's own words, not its report.
    }
  }
  return found;
}

const number = (value: unknown) => (typeof value === "number" ? value : 0);

const READERS: Record<Exclude<Tool, "person" | "claude-desktop">, (events: Json[]) => Reported> = {
  /** One object: `session_id`, `total_cost_usd`, `usage`, and its models as the keys of `modelUsage`. */
  "claude-code"(events) {
    const result = events.findLast((event) => "total_cost_usd" in event || event.type === "result");
    if (!result) return { models: [], unknown: "Claude Code's output held no result: run it with --output-format json" };
    const usage = result.usage as Json | undefined;
    return {
      models: Object.keys((result.modelUsage as Json | undefined) ?? {}),
      ...(typeof result.session_id === "string" ? { session: result.session_id } : {}),
      ...(usage
        ? {
            tokens: {
              input: number(usage.input_tokens),
              cachedInput: number(usage.cache_read_input_tokens),
              output: number(usage.output_tokens),
              reasoning: 0,
            },
          }
        : {}),
      ...(typeof result.total_cost_usd === "number" ? { costUsd: result.total_cost_usd } : {}),
      ...(usage ? {} : { unknown: "Claude Code's result held no usage" }),
    };
  },
  /** A line an event: `thread.started` names the session, and each `turn.completed` holds the turn's `usage`. No cost. */
  codex(events) {
    const turns = events.filter((event) => event.type === "turn.completed" && event.usage);
    const session = events.find((event) => event.type === "thread.started")?.thread_id as string | undefined;
    if (!turns.length) return { models: [], ...(session ? { session } : {}), unknown: "Codex's output held no turn.completed: run it with --json" };
    const sum = (key: string) => turns.reduce((all, turn) => all + number((turn.usage as Json)[key]), 0);
    return {
      models: [],
      ...(session ? { session } : {}),
      tokens: {
        input: sum("input_tokens"),
        cachedInput: sum("cached_input_tokens"),
        output: sum("output_tokens"),
        reasoning: sum("reasoning_output_tokens"),
      },
    };
  },
  cursor: () => ({ models: [], unknown: "Cursor's page of headless output documents no tokens" }),
  /** One object, or a last `result` event, with `usage` and `conversation_id`. No cost. */
  antigravity(events) {
    const result = events
      .map((event) => (event.event === "result" ? (event.result as Json) : event))
      .findLast((event) => event.usage && "total_tokens" in event.usage);
    if (!result) return { models: [], unknown: "Antigravity's output held no usage: run it with --output-format json" };
    const usage = result.usage as Json;
    return {
      models: [],
      ...(typeof result.conversation_id === "string" && result.conversation_id ? { session: result.conversation_id } : {}),
      tokens: {
        input: number(usage.input_tokens),
        cachedInput: number(usage.cache_read_tokens),
        output: number(usage.output_tokens),
        reasoning: number(usage.thinking_tokens),
      },
    };
  },
};

/** What a tool's headless output reports of the session it ran. */
export function reportedBy(tool: Exclude<Tool, "person" | "claude-desktop">, output: string): Reported {
  const reported = READERS[tool](objects(output));
  if (reported.tokens && reported.costUsd === undefined && !reported.unknown)
    return {
      ...reported,
      unknown:
        tool === "claude-code" ? "Claude Code's result held no cost" : `${tool === "codex" ? "Codex" : "Antigravity"} reports tokens and no cost`,
    };
  return reported;
}
