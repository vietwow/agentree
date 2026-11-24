/** `agentree doctor`: what of a project's setup is there and what is missing, each in a line a person can act on. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tryGit } from "../git.ts";
import { tasksDirectory, type Places } from "../board/places.ts";
import { toolsView } from "../views/tools.ts";
import { RULES_START, SKILLS } from "./templates.ts";

export type Finding = { ok: boolean; what: string };

/** The oldest git whose worktrees have relative links. */
const GIT = [2, 48] as const;

export function doctor(places: Places): Finding[] {
  const found: Finding[] = [];
  const say = (ok: boolean, good: string, bad: string) => found.push({ ok, what: ok ? good : bad });
  const read = (path: string) => (existsSync(join(places.root, path)) ? readFileSync(join(places.root, path), "utf8") : undefined);

  const version = /(\d+)\.(\d+)/.exec(tryGit(places.root, "--version").stdout);
  const [major, minor] = [Number(version?.[1]), Number(version?.[2])];
  say(
    major > GIT[0] || (major === GIT[0] && minor >= GIT[1]),
    `git ${major}.${minor}`,
    `git ${version?.[0] ?? "is not found"}: a tree's relative links need git ${GIT.join(".")} or later`,
  );
  say(
    spawnSync("sh", ["-c", "command -v agentree"], { encoding: "utf8" }).status === 0,
    "`agentree` is on the path: the hooks and the MCP entries find it",
    "`agentree` is not on the path: every hook and MCP entry runs it by that name. Link it from agentree's repository: pnpm link --global",
  );
  say(existsSync(tasksDirectory(places)), `the board is at ${places.board}`, 'the repository has no board: run "agentree init"');

  const rules = read("AGENTS.md");
  say(rules?.includes(RULES_START) ?? false, 'AGENTS.md holds "Taking work"', 'AGENTS.md has no section "Taking work": run "agentree init"');
  const claude = read("CLAUDE.md");
  if (claude !== undefined)
    say(
      claude.includes("@AGENTS.md"),
      "CLAUDE.md names AGENTS.md",
      "CLAUDE.md does not name AGENTS.md: add the line `@AGENTS.md`, or Claude Code reads no rule of the board",
    );
  for (const { name } of SKILLS) {
    const [open, claudes] = [read(`.agents/skills/${name}/SKILL.md`), read(`.claude/skills/${name}/SKILL.md`)];
    say(
      open !== undefined && open === claudes,
      `the skill ${name} is in .agents/skills and .claude/skills, the same`,
      `the skill ${name} is missing in one of .agents/skills and .claude/skills, or the two differ: run "agentree init"`,
    );
  }
  for (const tool of toolsView(places)) {
    const ways = [
      tool.mcp && "its MCP entry",
      tool.hooks.length > 0 && `${tool.hooks.length} hooks`,
      tool.definitions && "the worker's and reviewer's definitions",
    ].filter(Boolean);
    say(
      tool.mcp,
      `${tool.tool}: ${ways.join(", ")}`,
      `${tool.tool}: no MCP entry of agentree, so its session reaches the board only by the command: run "agentree init --tools ${tool.tool}"`,
    );
  }
  return found;
}
