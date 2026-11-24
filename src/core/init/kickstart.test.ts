import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { configOf } from "../board/config.ts";
import { readMemory } from "../board/memory.ts";
import { boardOf } from "../board/places.ts";
import { readBoard } from "../board/store.ts";
import { Refusal } from "../errors.ts";
import { git } from "../git.ts";
import { projects } from "../machine/projects.ts";
import { toolsView } from "../views/tools.ts";
import { kickstart, newProject, projectsDirectory, setProjectsDirectory } from "./kickstart.ts";

let home: string;

beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), "agentree-kick-")));
  process.env.AGENTREE_HOME = join(home, "machine");
  delete process.env.AGENTREE_PROJECTS;
});

afterEach(() => rmSync(home, { recursive: true, force: true }));

const now = () => new Date("2026-11-24T10:00:00Z");

test("a new project is a folder under the directory of projects, set up by the kickstart alone, with its first goal as its first card", () => {
  assert.throws(() => newProject("Notes sync", {}, now), /no directory of projects is named/);
  assert.throws(() => setProjectsDirectory("relative/path"), Refusal);
  mkdirSync(join(home, "projects"));
  setProjectsDirectory(join(home, "projects"));
  assert.equal(projectsDirectory(), join(home, "projects"));
  const made = newProject(
    "Notes sync",
    {
      tools: ["claude-code", "codex"],
      desc: "Mirrors notes.",
      goal: "Mirror a folder of notes between two machines\nwithout losing an edit.",
      stack: { "The language and runtime": "TypeScript on Node", "The data": " " },
    },
    now,
  );
  const root = join(home, "projects/notes-sync");
  assert.deepEqual([made.project.id, made.project.name, made.project.root, made.project.desc], ["notes-sync", "Notes sync", root, "Mirrors notes."]);
  assert.equal(git(root, "status", "--porcelain"), "", "what the kickstart wrote is committed: the repository is its own");
  assert.deepEqual(git(root, "log", "--format=%s").split("\n"), ["Set the project up for agentree", "Start the repository"]);
  assert.deepEqual(
    toolsView(boardOf(root))
      .filter((tool) => tool.mcp)
      .map((tool) => tool.tool),
    ["claude-code", "claude-desktop", "codex"],
  );
  assert.ok(!existsSync(join(root, ".cursor")));
  const [card] = readBoard(boardOf(root)).tasks;
  assert.deepEqual(
    [card!.task.fields.id, card!.task.fields.title, card!.task.fields.status],
    ["T-0001", "Mirror a folder of notes between two machines", "backlog"],
  );
  assert.equal(
    card!.task.context,
    "Mirror a folder of notes between two machines\nwithout losing an edit.\n\nThe stack, as the owner gave it; no agent changes these:\n\n- The language and runtime: TypeScript on Node",
  );
  assert.deepEqual(
    projects().map((project) => project.id),
    ["notes-sync"],
  );
  assert.throws(() => newProject("Notes sync", {}, now), /is there already and is not empty/);
  assert.throws(() => newProject("!!!", {}, now), /a name of letters or digits/);
});

test("the kickstart in a repository of the owner's changes nothing of it by a commit, and a second run does nothing", () => {
  const root = join(home, "theirs");
  git(home, "init", "--quiet", "--initial-branch=main", root);
  git(root, "commit", "--quiet", "--allow-empty", "-m", "Theirs");
  const made = kickstart(root, { tools: ["cursor"] }, now);
  assert.ok(made.did.some((line) => line.startsWith("AGENTS.md")));
  assert.equal(git(root, "log", "--format=%s"), "Theirs", "what was written waits for the owner to commit it");
  assert.match(git(root, "status", "--porcelain"), /AGENTS\.md/);
  assert.deepEqual(kickstart(root, { tools: ["cursor"] }, now).did, []);
  assert.throws(() => kickstart(root, { tools: ["person"] }, now), /no tool agentree sets a project up for/);
});

test("a project that reproduces an interface declares its reference in its part, and holds the agreements about it as the owner's", () => {
  const root = join(home, "clone");
  git(home, "init", "--quiet", "--initial-branch=main", root);
  const made = kickstart(
    root,
    {
      tools: ["cursor"],
      firstCommit: true,
      clone: { reference: "https://app.example.com", viewport: "1280x800", font: "reference", drawings: "committed" },
    },
    now,
  );
  assert.ok(made.did.includes("declared the reference in agentree.config.json"));
  assert.deepEqual(configOf(boardOf(root)).clone, {
    reference: "https://app.example.com",
    viewport: { width: 1280, height: 800 },
    theme: "light",
    colours: "own",
    font: "reference",
    drawings: "committed",
    records: "parity",
    url: "http://127.0.0.1:5173",
    parts: {},
  });
  assert.equal(git(root, "status", "--porcelain"), "", "the project's part is committed with the rest of what the kickstart wrote");
  const [fact] = readMemory(boardOf(root)).facts;
  assert.deepEqual([fact!.kind, fact!.state, fact!.title, fact!.paths], ["agreement", "in-force", "The reference is read-only", ["parity/"]]);
  assert.match(fact!.body, /The project reproduces the interface at https:\/\/app\.example\.com\./);
  assert.deepEqual(
    kickstart(root, { tools: ["cursor"], clone: { reference: "https://other.example.com" } }, now).did,
    [],
    "a reference that is declared is not declared again",
  );
  assert.equal(configOf(boardOf(root)).clone?.reference, "https://app.example.com");
  const other = join(home, "other");
  git(home, "init", "--quiet", "--initial-branch=main", other);
  assert.throws(() => kickstart(other, { firstCommit: true, clone: { reference: "the app" } }, now), /named by its address/);
  assert.throws(
    () => kickstart(other, { firstCommit: true, clone: { reference: "https://a.example.com", viewport: "wide" } }, now),
    /a viewport is a width and a height/,
  );
  assert.throws(
    () => kickstart(other, { firstCommit: true, clone: { reference: "https://a.example.com", colours: "blue" as "own" } }, now),
    /"own" or the "reference"'s/,
  );
});
