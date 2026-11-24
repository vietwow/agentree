import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claim, create, type Context } from "../board/actions.ts";
import { configOf } from "../board/config.ts";
import { onHook } from "../board/hooks.ts";
import { claimOf } from "../board/state.ts";
import { CODEX, OWNER, project, type Project } from "../board/testing.ts";
import { git } from "../git.ts";
import { documentsView } from "../views/documents.ts";
import { agentsView } from "../views/project.ts";
import { toolsView } from "../views/tools.ts";
import { doctor } from "./doctor.ts";
import { AGENT_TOOLS, setUp } from "./tools.ts";

let at: Project;
let context: Context;
let root: string;

beforeEach(() => {
  at = project();
  ({ context } = at);
  root = context.places.root;
});

afterEach(() => at.remove());

const read = (path: string) => readFileSync(join(root, path), "utf8");
const json = (path: string) => JSON.parse(read(path)) as Record<string, any>;

test("init writes the rules, each tool's MCP entry and hooks, the skills and the definitions, and a second run writes nothing", () => {
  writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test", lint: "oxlint" } }));
  writeFileSync(join(root, "pnpm-lock.yaml"), "");
  const report = setUp(root, AGENT_TOOLS);
  assert.match(read("AGENTS.md"), /^# Working in this repository\n[\s\S]+<!-- agentree:start -->\n\n## Taking work\n[\s\S]+<!-- agentree:end -->\n$/);
  assert.equal(read("CLAUDE.md"), "@AGENTS.md\n");
  assert.deepEqual(json(".mcp.json").mcpServers.agentree, { command: "agentree", args: ["mcp"] });
  assert.deepEqual(json(".cursor/mcp.json").mcpServers.agentree, { type: "stdio", command: "agentree", args: ["mcp"] });
  assert.match(read(".codex/config.toml"), /^\[mcp_servers\.agentree\]\ncommand = "agentree"\nargs = \["mcp"\]\n$/);
  assert.deepEqual(json(".agents/mcp_config.json").mcpServers.agentree, { command: "agentree", args: ["mcp"] });
  assert.deepEqual(json(".claude/settings.json").hooks.PreToolUse, [
    { hooks: [{ type: "command", command: "agentree hook claude-code PreToolUse" }] },
  ]);
  assert.deepEqual(json(".cursor/hooks.json").hooks.preToolUse, [{ command: "agentree hook cursor preToolUse" }]);
  assert.deepEqual(json(".agents/hooks.json").agentree.PreToolUse, [
    { matcher: ".*", hooks: [{ type: "command", command: "agentree hook antigravity PreToolUse" }] },
  ]);
  assert.equal(read(".agents/skills/agentree-coordinate/SKILL.md"), read(".claude/skills/agentree-coordinate/SKILL.md"));
  assert.match(
    read(".claude/skills/agentree-coordinate/SKILL.md"),
    /^---\nname: agentree-coordinate\ndescription: .+\ndisable-model-invocation: true\n---\n/,
  );
  assert.match(
    read(".claude/agents/agentree-reviewer.md"),
    /^---\nname: agentree-reviewer\ndescription: .+\ndisallowedTools: Edit, Write, MultiEdit, NotebookEdit\n---\n/,
  );
  assert.ok(existsSync(join(root, "docs/engineering/code-standards.md")));
  assert.match(read("docs/adr/TEMPLATE.md"), /^---\nstatus: draft\n[\s\S]+## Options weighed/);
  assert.ok(existsSync(join(root, "rfcs/TEMPLATE.md")) && existsSync(join(root, "docs/engineering/system-conventions.md")));
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Set up");
  assert.deepEqual(documentsView(context.places), [], "a template is no document of the project");
  assert.deepEqual(configOf(context.places).checks, ["pnpm lint", "pnpm test"]);
  assert.ok(report.byHand.some((line) => line.startsWith("Codex: trust the project")));
  assert.deepEqual(setUp(root, AGENT_TOOLS).did, [], "a second run finds everything as it would write it");
  assert.deepEqual(
    toolsView(context.places).map((tool) => [tool.tool, tool.mcp, tool.hooks.length, tool.definitions, tool.reportsUse]),
    [
      ["claude-code", true, 6, true, "full"],
      ["claude-desktop", true, 0, false, "none"],
      ["cursor", true, 6, true, "model only"],
      ["codex", true, 5, false, "full"],
      ["antigravity", true, 3, false, "full"],
    ],
  );
});

test("init keeps what is the project's own: its rules, its settings, its other hooks and servers", () => {
  writeFileSync(join(root, "AGENTS.md"), "# Ours\n\nOur rules.\n");
  writeFileSync(join(root, "CLAUDE.md"), "Our own notes.\n");
  mkdirSync(join(root, ".claude"));
  writeFileSync(
    join(root, ".claude/settings.json"),
    JSON.stringify({
      permissions: { allow: ["Bash(ls)"] },
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "./ours.sh" }] }] },
    }),
  );
  writeFileSync(join(root, ".mcp.json"), JSON.stringify({ mcpServers: { ours: { command: "ours" } } }));
  const report = setUp(root, ["claude-code"]);
  assert.match(read("AGENTS.md"), /^# Ours\n\nOur rules\.\n\n<!-- agentree:start -->/);
  assert.equal(read("CLAUDE.md"), "Our own notes.\n");
  assert.ok(report.byHand.some((line) => line.startsWith("CLAUDE.md is the project's own")));
  const settings = json(".claude/settings.json");
  assert.deepEqual(settings.permissions, { allow: ["Bash(ls)"] });
  assert.deepEqual(
    settings.hooks.PreToolUse.map((group: { hooks: { command: string }[] }) => group.hooks[0]!.command),
    ["./ours.sh", "agentree hook claude-code PreToolUse"],
  );
  assert.deepEqual(Object.keys(json(".mcp.json").mcpServers), ["ours", "agentree"]);
  assert.ok(!existsSync(join(root, ".cursor")), "a tool that was not chosen gets nothing");
  writeFileSync(join(root, "AGENTS.md"), read("AGENTS.md").replace("## Taking work", "## Taking work, as it was"));
  setUp(root, ["claude-code"]);
  assert.equal(read("AGENTS.md").split("## Taking work").length, 2, "its section is replaced, not written twice");
});

test("a tool's hooks follow its session, beat its claim, and refuse an edit outside its task's paths in the form that tool reads", () => {
  create(context, OWNER, {
    title: "The core",
    kind: "build",
    priority: 1,
    writes: ["src/core/"],
    checks: ["true"],
    context: "Why.",
    doneWhen: "- Done.",
    outOfScope: "Rest.",
  });
  const { claim: hold } = claim(context, CODEX, "T-0001");
  const hook = (tool: "claude-code" | "codex" | "cursor" | "antigravity", event: string, input: Record<string, unknown>) =>
    onHook(root, tool, event, input, context.now());
  assert.deepEqual(hook("codex", "SessionStart", { session_id: "s-codex", cwd: hold.tree, model: "gpt-5.6" }), { exit: 0 });
  const since = claimOf(context.places, "T-0001")!.beat;
  const patch = (file: string) => ({
    session_id: "s-codex",
    cwd: hold.tree,
    tool_name: "apply_patch",
    tool_input: { command: `*** Begin Patch\n*** Update File: ${file}\n@@\n+x\n*** End Patch` },
  });
  assert.deepEqual(hook("codex", "PreToolUse", patch("src/core/task.ts")), { exit: 0 });
  assert.ok(claimOf(context.places, "T-0001")!.beat > since, "each call beats the claim of its session");
  const refused = hook("codex", "PreToolUse", patch("README.md"));
  assert.deepEqual(
    [refused.exit, refused.stderr],
    [
      2,
      'README.md is outside T-0001\'s "writes" and "appends" (src/core/). Change only its paths; what is wrong elsewhere goes into its Log under "Found".',
    ],
  );
  assert.equal(
    hook("claude-code", "PreToolUse", {
      session_id: "s-claude",
      cwd: hold.tree,
      tool_name: "Edit",
      tool_input: { file_path: join(hold.tree, "README.md") },
    }).exit,
    2,
  );
  assert.equal(
    hook("claude-code", "PreToolUse", {
      session_id: "s-claude",
      cwd: hold.tree,
      tool_name: "Read",
      tool_input: { file_path: join(hold.tree, "README.md") },
    }).exit,
    0,
  );
  assert.equal(
    hook("claude-code", "PreToolUse", { session_id: "s-claude", cwd: root, tool_name: "Write", tool_input: { file_path: join(root, "README.md") } })
      .exit,
    0,
    "the main checkout is no task's tree",
  );
  assert.match(
    hook("claude-code", "PreToolUse", {
      session_id: "s-claude",
      cwd: root,
      tool_name: "Write",
      tool_input: { file_path: join(context.places.board, "work/tasks/T-0001-the-core.md") },
    }).stderr!,
    /^The board's files are written only through/,
  );
  assert.deepEqual(
    JSON.parse(
      hook("cursor", "preToolUse", {
        conversation_id: "s-cursor",
        workspace_roots: [hold.tree],
        tool_name: "Write",
        tool_input: { file_path: "README.md" },
      }).stdout!,
    ).permission,
    "deny",
  );
  assert.deepEqual(
    JSON.parse(
      hook("cursor", "preToolUse", { conversation_id: "s-cursor", workspace_roots: [hold.tree], tool_name: "Shell", tool_input: { command: "ls" } })
        .stdout!,
    ),
    { permission: "allow" },
  );
  assert.deepEqual(
    JSON.parse(
      hook("antigravity", "PreToolUse", {
        conversationId: "s-agy",
        workspacePaths: [hold.tree],
        modelName: "gemini-4",
        toolCall: { name: "write_to_file", args: { TargetFile: join(hold.tree, "README.md") } },
      }).stdout!,
    ).decision,
    "deny",
  );
  hook("claude-code", "SubagentStart", { session_id: "s-claude", cwd: root, agent_id: "a-1", agent_type: "agentree-worker" });
  hook("claude-code", "SubagentStop", { session_id: "s-claude", cwd: root, agent_id: "a-1" });
  hook("cursor", "sessionEnd", { conversation_id: "s-cursor", workspace_roots: [root] });
  assert.deepEqual(
    agentsView(context.places, context.now()).map((s) => [s.id, s.tool, s.model, s.state, s.task, s.subagents.map((sub) => [sub.kind, sub.state])]),
    [
      ["s-codex", "codex", "gpt-5.6", "working", "T-0001", []],
      ["s-claude", "claude-code", "unknown", "working", undefined, [["agentree-worker", "ended"]]],
      ["s-cursor", "cursor", "unknown", "ended", undefined, []],
      ["s-agy", "antigravity", "gemini-4", "working", undefined, []],
    ],
  );
  assert.deepEqual(
    onHook(at.home, "codex", "PreToolUse", { session_id: "x", cwd: at.home }, context.now()),
    { exit: 0 },
    "a directory with no board is let through",
  );
});

test("the doctor says what of a project's setup is there and what is missing", () => {
  const onPath = (finding: { what: string }) => finding.what.includes("on the path");
  const before = doctor(context.places).filter((finding) => !onPath(finding));
  assert.deepEqual(
    before.filter((finding) => !finding.ok).map((finding) => finding.what.split(":")[0]),
    [
      'AGENTS.md has no section "Taking work"',
      "the skill agentree-coordinate is missing in one of .agents/skills and .claude/skills, or the two differ",
      "the skill agentree-plan is missing in one of .agents/skills and .claude/skills, or the two differ",
      "the skill agentree-grab-icons is missing in one of .agents/skills and .claude/skills, or the two differ",
      "claude-code",
      "claude-desktop",
      "cursor",
      "codex",
      "antigravity",
    ],
  );
  setUp(root, AGENT_TOOLS);
  assert.deepEqual(
    doctor(context.places).filter((finding) => !finding.ok && !onPath(finding)),
    [],
  );
  writeFileSync(join(root, ".claude/skills/agentree-plan/SKILL.md"), "changed by hand\n");
  assert.deepEqual(doctor(context.places).filter((finding) => !finding.ok && !onPath(finding)).length, 1);
});
