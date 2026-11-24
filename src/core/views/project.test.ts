import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { ask, claim, create, log, release, type Context } from "../board/actions.ts";
import { accept, check, commit, land, review, submit } from "../board/lifecycle.ts";
import { endSession, reportSession, startSubagent, updateSubagent } from "../board/sessions.ts";
import { readBoard } from "../board/store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "../board/testing.ts";
import { git } from "../git.ts";
import { editProject, projectOf, projects, register, unregister } from "../machine/projects.ts";
import { agentsView, milestonesView, projectView } from "./project.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
  process.env.AGENTREE_HOME = join(at.home, "machine");
});

afterEach(() => at.remove());

const stamp = () =>
  context
    .now()
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z");
const viewOf = (id: string) => projectView(projectOf(id), readBoard(context.places), context.now());
const task = (title: string, more = {}) =>
  create(context, OWNER, { title, kind: "build", priority: 2, context: "Why.", doneWhen: "- Done.", outOfScope: "Rest.", checks: ["true"], ...more });

/** Builds a claimed task's one file and takes it to main. */
function landed(id: string, file: string) {
  const { claim: hold } = claim(context, CODEX, id);
  mkdirSync(join(hold.tree, "src"), { recursive: true });
  writeFileSync(join(hold.tree, file), "x\n");
  commit(context, CODEX, id, "The change");
  log(context, CODEX, id, "Did: it.");
  submit(context, CODEX, id);
  check(context, id);
  review(context, CURSOR, id);
  accept(context, CURSOR, id, "Read.");
  land(context, id);
}

test("a repository is registered once, under a name of its own, and taken off the list without a change to it", () => {
  const first = register(context.places.root, context.now(), { desc: "A project." });
  assert.deepEqual([first.id, first.name, first.root, first.color], ["project", "project", context.places.root, "indigo"]);
  assert.deepEqual(register(context.places.board, context.now()), first, "any of its worktrees names the same project");
  assert.equal(projects().length, 1);
  assert.equal(editProject("project", { hold: true }).hold, true);
  unregister("project");
  assert.deepEqual(projects(), []);
  assert.throws(() => projectOf("project"), /no project "project" is registered/);
});

test("a project's state is read from its board: planning, in progress, at risk, on hold, complete", () => {
  register(context.places.root, context.now());
  task("One", { writes: ["src/a.txt"] });
  assert.deepEqual([viewOf("project").status, viewOf("project").total, viewOf("project").tools], ["planning", 1, []]);
  claim(context, CODEX, "T-0001");
  assert.deepEqual([viewOf("project").status, viewOf("project").tools], ["active", ["codex"]]);
  at.advance(45 * 60 * 1000);
  assert.equal(viewOf("project").status, "risk", "its claim is stale");
  release(context, OWNER, "T-0001", "No beat.");
  landed("T-0001", "src/a.txt");
  const done = viewOf("project");
  assert.deepEqual([done.status, done.done, done.total, done.tools], ["complete", 1, 1, ["cursor", "codex"]]);
  editProject("project", { hold: true });
  assert.equal(viewOf("project").status, "hold");
});

test("a session is followed by its reports: the task it holds, what it does, its subagents, and its end", () => {
  task("One", { writes: ["src/a.txt"] });
  task("Two", { writes: ["src/b.txt"] });
  reportSession(context.places, { id: "s-codex", worker: "codex/gpt-5", note: "reading the board" }, stamp());
  reportSession(context.places, { id: "s-head", worker: "cursor/composer-2", started: "headless", by: "s-codex" }, stamp());
  const idle = agentsView(context.places, context.now());
  assert.deepEqual(
    idle.map((s) => [s.id, s.tool, s.model, s.started, s.by, s.state, s.task, s.note]),
    [
      ["s-codex", "codex", "gpt-5", "owner", undefined, "working", undefined, "reading the board"],
      ["s-head", "cursor", "composer-2", "headless", "s-codex", "working", undefined, undefined],
    ],
  );
  claim(context, CODEX, "T-0001");
  ask(context, CODEX, "T-0001", "Which?");
  startSubagent(context.places, "s-codex", { id: "sub-1", kind: "agentree-worker", task: "T-0002" }, stamp());
  const [codex] = agentsView(context.places, context.now());
  assert.deepEqual(
    [codex!.state, codex!.task, codex!.note, codex!.subagents.map((sub) => [sub.kind, sub.task, sub.state])],
    ["asking", "T-0001", undefined, [["agentree-worker", "T-0002", "working"]]],
  );
  updateSubagent(context.places, "s-codex", "sub-1", { ended: stamp() }, stamp());
  at.advance(45 * 60 * 1000);
  assert.equal(agentsView(context.places, context.now())[0]!.state, "stale");
  endSession(context.places, "s-head", stamp());
  const after = agentsView(context.places, context.now());
  assert.deepEqual([after[0]!.subagents[0]!.state, after[1]!.state, !!after[1]!.ended], ["ended", "ended", true]);
});

test("the milestones are each document accepted and each epic whose parts have all landed", () => {
  const { root } = context.places;
  mkdirSync(join(root, "docs/adr"), { recursive: true });
  writeFileSync(join(root, "docs/adr/0001-trees-only.md"), "---\nstatus: accepted\ndate: 2026-11-20\n---\n\n# ADR 0001: Trees only\n");
  git(root, "add", "docs");
  git(root, "commit", "--quiet", "-m", "An ADR");
  create(context, OWNER, { title: "The core", kind: "build", priority: 1 });
  task("Part", { parent: "T-0001", writes: ["src/a.txt"] });
  assert.deepEqual(
    milestonesView(readBoard(context.places)).map((m) => m.name),
    ["ADR 0001 Trees only"],
  );
  landed("T-0002", "src/a.txt");
  assert.deepEqual(
    milestonesView(readBoard(context.places)).map((m) => [m.kind, m.name]),
    [
      ["document", "ADR 0001 Trees only"],
      ["epic", "The core done"],
    ],
  );
});
