/**
 * What `agentree init` writes into a project for the tools that will work
 * on it: the rules every tool reads, each tool's MCP entry and hooks, the
 * skills, and the worker's and reviewer's definitions. A second run
 * changes only what is not as it would write it, and nothing of the
 * project's own beside it.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CONFIG_FILE, DEFAULT_CONFIG } from "../board/config.ts";
import { Refusal } from "../errors.ts";
import { TOOLS, type Tool } from "../task/model.ts";
import { agentDefinition, RULES_END, RULES_START, skillFile, SKILLS, TAKING_WORK } from "./templates.ts";

/** The tools a project is set up for: every one but a person. */
export const AGENT_TOOLS = TOOLS.filter((tool): tool is Exclude<Tool, "person"> => tool !== "person");

const SERVER = "agentree";
/** The board's tools over standard input and output: the tool starts the command in the project, outside its session's sandbox. */
const MCP = { command: "agentree", args: ["mcp"] };
const hook = (tool: Tool, event: string) => `agentree hook ${tool} ${event}`;

/** The engineering standard a project starts with, as agentree keeps it. */
const STANDARD = join(import.meta.dirname, "../../../rfcs/0001-agentree/standard");

type Report = { did: string[]; byHand: string[] };

function writer(root: string, report: Report) {
  const read = (path: string) => (existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : undefined);
  /** Writes a file when it is not there or holds another text; says so. */
  const write = (path: string, text: string, what: string) => {
    if (read(path) === text) return;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
    report.did.push(`${path}: ${what}`);
  };
  /** Changes a JSON file by a function of what it holds, keeping every key that is the project's own. */
  const json = (path: string, change: (value: Record<string, any>) => void, what: string) => {
    const before = read(path);
    let value: Record<string, any>;
    try {
      value = before === undefined ? {} : (JSON.parse(before) as Record<string, any>);
    } catch {
      throw new Refusal(`${path} is not JSON; mend it and run init again`);
    }
    change(value);
    write(path, `${JSON.stringify(value, null, 2)}\n`, what);
  };
  return { read, write, json };
}

/** The hooks of a tool that reads the form `{ hooks: { Event: [{ matcher?, hooks: [{ type, command }] }] } }`, as Claude Code and Codex do. */
function matcherHooks(value: Record<string, any>, tool: Tool, events: string[]) {
  value.hooks ??= {};
  for (const event of events) {
    const others = ((value.hooks[event] ?? []) as { hooks?: { command?: string }[] }[]).filter(
      (group) => !group.hooks?.some((each) => each.command?.startsWith("agentree hook ")),
    );
    value.hooks[event] = [...others, { hooks: [{ type: "command", command: hook(tool, event) }] }];
  }
}

const SETUP: Record<Exclude<Tool, "person">, (files: ReturnType<typeof writer>, report: Report) => void> = {
  "claude-code"({ json, write }, report) {
    json(".mcp.json", (value) => ((value.mcpServers ??= {})[SERVER] = MCP), "the board's MCP server");
    json(
      ".claude/settings.json",
      (value) => matcherHooks(value, "claude-code", ["SessionStart", "PreToolUse", "Stop", "SessionEnd", "SubagentStart", "SubagentStop"]),
      "the hooks that follow a session and hold an edit to its task's paths",
    );
    for (const role of ["worker", "reviewer"] as const)
      write(`.claude/agents/agentree-${role}.md`, agentDefinition(role), `the ${role}'s definition`);
    report.byHand.push("Claude Code: run `claude` in the project once and approve the MCP server `agentree` of .mcp.json.");
  },
  "claude-desktop"({ json }, report) {
    json(".mcp.json", (value) => ((value.mcpServers ??= {})[SERVER] = MCP), "the board's MCP server");
    report.byHand.push("Claude Desktop: it reads the same files as Claude Code; it has no headless run, so a coordinator starts no worker in it.");
  },
  cursor({ json, write }) {
    json(".cursor/mcp.json", (value) => ((value.mcpServers ??= {})[SERVER] = { type: "stdio", ...MCP }), "the board's MCP server");
    json(
      ".cursor/hooks.json",
      (value) => {
        value.version ??= 1;
        value.hooks ??= {};
        for (const event of ["sessionStart", "preToolUse", "stop", "sessionEnd", "subagentStart", "subagentStop"]) {
          const others = ((value.hooks[event] ?? []) as { command?: string }[]).filter((each) => !each.command?.startsWith("agentree hook "));
          value.hooks[event] = [...others, { command: hook("cursor", event) }];
        }
      },
      "the hooks that follow a session and hold an edit to its task's paths",
    );
    for (const role of ["worker", "reviewer"] as const)
      write(`.claude/agents/agentree-${role}.md`, agentDefinition(role), `the ${role}'s definition, which Cursor reads there too`);
  },
  codex({ read, write, json }, report) {
    const config = read(".codex/config.toml") ?? "";
    if (!config.includes(`[mcp_servers.${SERVER}]`))
      write(
        ".codex/config.toml",
        `${config}${config && !config.endsWith("\n") ? "\n" : ""}${config ? "\n" : ""}[mcp_servers.${SERVER}]\ncommand = "${MCP.command}"\nargs = ["mcp"]\n`,
        "the board's MCP server",
      );
    json(
      ".codex/hooks.json",
      (value) => matcherHooks(value, "codex", ["SessionStart", "PreToolUse", "Stop", "SubagentStart", "SubagentStop"]),
      "the hooks that follow a session and hold an edit to its task's paths",
    );
    report.byHand.push("Codex: trust the project, so that it reads .codex/config.toml and .codex/hooks.json.");
    report.byHand.push("Codex: no worker's or reviewer's definition is written (.codex/agents/*.toml): its form was not read on Codex's own page.");
  },
  antigravity({ json }, report) {
    json(".agents/mcp_config.json", (value) => ((value.mcpServers ??= {})[SERVER] = MCP), "the board's MCP server");
    json(
      ".agents/hooks.json",
      (value) => {
        const command = (event: string) => ({ type: "command", command: hook("antigravity", event) });
        value[SERVER] = {
          SessionStart: [command("SessionStart")],
          PreToolUse: [{ matcher: ".*", hooks: [command("PreToolUse")] }],
          Stop: [command("Stop")],
        };
      },
      "the hooks that follow a session and hold an edit to its task's paths",
    );
    report.byHand.push(
      "Antigravity: no worker's or reviewer's definition is written (.agents/agents/*.md): its form was not read on Antigravity's own page.",
    );
  },
};

/** The checks a project's manifest names: its scripts of these names, run by the package manager its lock file tells. */
function checksFound(root: string): string[] {
  if (!existsSync(join(root, "package.json"))) return [];
  let scripts: Record<string, string>;
  try {
    scripts = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
  } catch {
    return [];
  }
  const run = existsSync(join(root, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(root, "yarn.lock")) ? "yarn" : "npm run";
  return ["typecheck", "lint", "test"].filter((name) => name in scripts).map((name) => `${run} ${name}`);
}

/** Writes a project's part and each chosen tool's part into its main checkout; what it did, and what a person does by hand. */
export function setUp(root: string, tools: readonly Tool[]): Report {
  const report: Report = { did: [], byHand: [] };
  const files = writer(root, report);
  const chosen = AGENT_TOOLS.filter((tool) => tools.includes(tool));

  if (files.read(CONFIG_FILE) === undefined)
    files.write(
      CONFIG_FILE,
      `${JSON.stringify({ ...DEFAULT_CONFIG, checks: checksFound(root) }, null, 2)}\n`,
      "the project's part: its checks, which commands are heavy, a check's bound",
    );

  const rules = files.read("AGENTS.md");
  const from = rules?.indexOf(RULES_START) ?? -1;
  const to = rules?.indexOf(RULES_END) ?? -1;
  const section = TAKING_WORK.trimEnd();
  if (rules === undefined)
    files.write(
      "AGENTS.md",
      `# Working in this repository\n\nRules for every AI agent and person working here, whatever the tool.\n\n${section}\n`,
      'the rules, with "Taking work"',
    );
  else if (from >= 0 && to > from)
    files.write("AGENTS.md", `${rules.slice(0, from)}${section}${rules.slice(to + RULES_END.length)}`, 'the section "Taking work"');
  else files.write("AGENTS.md", `${rules.trimEnd()}\n\n${section}\n`, 'the section "Taking work", added at its end');

  if (chosen.some((tool) => tool.startsWith("claude"))) {
    const claude = files.read("CLAUDE.md");
    if (claude === undefined) files.write("CLAUDE.md", "@AGENTS.md\n", "the one line that makes Claude Code read AGENTS.md");
    else if (!claude.includes("@AGENTS.md"))
      report.byHand.push(
        "CLAUDE.md is the project's own and does not name AGENTS.md: add the line `@AGENTS.md` to it, or Claude Code reads no rule of the board.",
      );
  }

  for (const skill of SKILLS)
    for (const directory of [".agents/skills", ".claude/skills"])
      files.write(`${directory}/${skill.name}/SKILL.md`, skillFile(skill), `the skill ${skill.name}`);
  for (const name of existsSync(STANDARD) ? readdirSync(STANDARD) : []) {
    const path = `docs/engineering/${name}`;
    if (files.read(path) !== undefined) continue;
    mkdirSync(join(root, "docs/engineering"), { recursive: true });
    copyFileSync(join(STANDARD, name), join(root, path));
    report.did.push(`${path}: the engineering standard a project starts with`);
  }
  for (const tool of chosen) SETUP[tool](files, report);
  return report;
}
