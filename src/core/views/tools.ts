/** What each tool has of agentree in a project: the files `init` writes for it, read from the main checkout, and the owner's switch. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readOptions } from "../board/options.ts";
import type { Places } from "../board/places.ts";
import { TOOLS, type Tool } from "../task/model.ts";

export type ToolSetupView = {
  tool: Tool;
  /** The hooks set to agentree's script, by the names the tool gives them. */
  hooks: string[];
  mcp: boolean;
  /** Whether the worker's and the reviewer's definitions are there. */
  definitions: boolean;
  reportsUse: "full" | "model only" | "none";
  reviewsOwn: boolean;
};

type Files = { mcp: string; hooks?: string; definitions?: string; reportsUse: ToolSetupView["reportsUse"] };

/** Where each tool reads its MCP entry, its hooks and its agents in a project, and what it reports of a session's use. */
export const TOOL_FILES: Record<Exclude<Tool, "person">, Files> = {
  "claude-code": { mcp: ".mcp.json", hooks: ".claude/settings.json", definitions: ".claude/agents/agentree-worker.md", reportsUse: "full" },
  "claude-desktop": { mcp: ".mcp.json", reportsUse: "none" },
  cursor: { mcp: ".cursor/mcp.json", hooks: ".cursor/hooks.json", definitions: ".cursor/agents/agentree-worker.md", reportsUse: "model only" },
  codex: { mcp: ".codex/config.toml", hooks: ".codex/hooks.json", definitions: ".codex/agents/agentree-worker.toml", reportsUse: "full" },
  antigravity: { mcp: ".agents/mcp_config.json", hooks: ".agents/hooks.json", definitions: ".agents/agents/agentree-worker.md", reportsUse: "full" },
};

/** The names of the hooks a tool's file sets to agentree: the keys of its `hooks` object whose text names agentree. */
function hooksIn(file: string): string[] {
  try {
    const hooks = (JSON.parse(readFileSync(file, "utf8")) as { hooks?: Record<string, unknown> }).hooks ?? {};
    return Object.keys(hooks).filter((name) => JSON.stringify(hooks[name]).includes("agentree"));
  } catch {
    return [];
  }
}

export function toolsView(places: Places): ToolSetupView[] {
  const { reviewOwnTasks } = readOptions(places);
  const has = (path: string | undefined, word = "agentree") =>
    !!path && existsSync(join(places.root, path)) && readFileSync(join(places.root, path), "utf8").includes(word);
  return TOOLS.filter((tool) => tool !== "person").map((tool) => {
    const files = TOOL_FILES[tool];
    return {
      tool,
      hooks: files.hooks ? hooksIn(join(places.root, files.hooks)) : [],
      mcp: has(files.mcp),
      definitions: has(files.definitions),
      reportsUse: files.reportsUse,
      reviewsOwn: reviewOwnTasks[tool],
    };
  });
}
