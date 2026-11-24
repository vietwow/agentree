import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { Refusal } from "../errors.ts";
import { git } from "../git.ts";
import { answer, ask, claim, create, log, type Context } from "../board/actions.ts";
import { accept, check, commit, land, review, submit } from "../board/lifecycle.ts";
import { acceptFact, editFact, factsFor, readMemory, recall, remember } from "../board/memory.ts";
import { readBoard, taskOf } from "../board/store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "../board/testing.ts";
import { reportUse } from "../board/usage.ts";
import { documentsView } from "./documents.ts";
import { activityView, taskDetailView, taskView, timeIn } from "./tasks.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
});

afterEach(() => at.remove());

const board = () => readBoard(context.places);
const view = (id: string) => taskView(context.places, taskOf(board(), id).task);
const detail = (id: string) => taskDetailView(board(), taskOf(board(), id).task, context.now());

function inProgress() {
  create(context, OWNER, { title: "The epic", kind: "build", priority: 1 });
  create(context, OWNER, {
    title: "The core",
    kind: "build",
    priority: 2,
    parent: "T-0001",
    rfc: "0001",
    writes: ["src/"],
    checks: ["test -f src/a.txt"],
    subtasks: ["Parse"],
    context: "Why.",
    doneWhen: "- It parses.\n- It writes.",
    outOfScope: "The daemon.\n\nThe UI.",
  });
  const { claim: hold } = claim(context, CODEX, "T-0002");
  mkdirSync(join(hold.tree, "src"));
  writeFileSync(join(hold.tree, "src/a.txt"), "a\nb\n");
  commit(context, CODEX, "T-0002", "Add a");
  return hold;
}

test("a task's row holds who holds it, its checks, its questions and its subtasks", () => {
  const hold = inProgress();
  ask(context, CODEX, "T-0002", "Which port?");
  assert.deepEqual(view("T-0002"), {
    id: "T-0002",
    title: "The core",
    status: "in-progress",
    kind: "build",
    priority: 2,
    parent: "T-0001",
    rfc: "0001",
    holder: { tool: "codex", model: "gpt-5", since: hold.since, beat: view("T-0002").holder!.beat },
    branch: "task/T-0002",
    checks: { total: 1, passed: 0, failed: 0, state: "none" },
    questions: [{ askedAt: view("T-0002").questions[0]!.askedAt }],
    subtasks: [{ id: "T-0002.1", title: "Parse", done: false }],
    createdAt: view("T-0002").createdAt,
    statusSince: hold.since,
  });
});

test("a card opened holds its sections as lists, its tree's diff, its checks, its review, its sessions and its time in each status", () => {
  const hold = inProgress();
  log(context, CODEX, "T-0002", "Did: a.");
  reportUse(context.places, "T-0002", {
    session: "s-codex",
    worker: "codex/gpt-5",
    role: "build",
    models: ["gpt-5"],
    startedAt: hold.since,
    unknown: "Codex reports no use of an interactive session",
  });
  submit(context, CODEX, "T-0002");
  check(context, "T-0002");
  review(context, CURSOR, "T-0002");
  const pending = detail("T-0002");
  assert.equal(pending.parentTitle, "The epic");
  assert.deepEqual(
    [pending.doneWhen, pending.outOfScope],
    [
      ["It parses.", "It writes."],
      ["The daemon.", "The UI."],
    ],
  );
  assert.deepEqual(pending.tree, { path: hold.tree, base: hold.base, diff: [{ path: "src/a.txt", added: 2, removed: 0 }] });
  assert.deepEqual(
    pending.checkRuns.map((run) => [run.name, run.result]),
    [["test -f src/a.txt", "passed"]],
  );
  assert.deepEqual(pending.review, { by: "cursor", verdict: "pending", findings: [] });
  assert.deepEqual(pending.sessions, [
    { role: "build", tool: "codex", models: ["gpt-5"], startedAt: hold.since, unknown: "Codex reports no use of an interactive session" },
  ]);
  accept(context, CURSOR, "T-0002", "- Read the diff.\n- The check passes again.");
  land(context, "T-0002");
  const done = detail("T-0002");
  assert.deepEqual([done.review?.verdict, done.review?.findings], ["accepted", ["Read the diff.", "The check passes again."]]);
  assert.deepEqual(
    done.timeIn.map((each) => each.status),
    ["ready", "in-progress", "checking", "review", "accepted", "done"],
  );
  assert.equal(done.tree, undefined, "its tree is gone with its landing");
  assert.equal(view("T-0002").landedAt, done.log.at(-1)!.at);
  assert.equal(done.log.at(-1)!.who, "daemon");
  assert.deepEqual(
    activityView(board())
      .filter((entry) => entry.task === "T-0002")
      .map((entry) => entry.text)
      .slice(0, 4),
    ["Landed it on main", "Accepted it", "Checks passed; it waits for a review", "Submitted it; its checks run"],
  );
});

test("the time in each status adds up to the task's age", () => {
  inProgress();
  const { task } = taskOf(board(), "T-0002");
  const now = new Date(Date.parse(task.fields.created) + 3_600_000);
  assert.equal(
    timeIn(task, now).reduce((sum, each) => sum + each.ms, 0),
    3_600_000,
  );
});

test("a question and its answer are both things that happened on the board", () => {
  inProgress();
  ask(context, CODEX, "T-0002", "Which port?");
  answer(context, OWNER, "T-0002", "4517.");
  assert.deepEqual(
    activityView(board())
      .slice(0, 2)
      .map((entry) => [entry.who, entry.kind, entry.text]),
    [
      ["person", "question", "The owner answered: 4517."],
      ["codex", "question", "Asked the owner: Which port?"],
    ],
  );
});

test("a session proposes a fact, another accepts it, and a claim's brief holds the agreements and the facts of its paths", () => {
  create(context, OWNER, { title: "The daemon", kind: "build", priority: 1, writes: ["src/daemon/"] });
  const { task } = taskOf(board(), "T-0001");
  remember(context, OWNER, { kind: "agreement", title: "Reply in Vietnamese", body: "Replies to the owner are in Vietnamese." });
  const fact = remember(context, CODEX, {
    kind: "pitfall",
    title: "The daemon listens on loopback only",
    body: "Its port is published on 127.0.0.1.",
    paths: ["src/daemon/"],
    task: "T-0001",
  });
  remember(context, CODEX, { kind: "how-to", title: "Run the UI", body: "pnpm dev in ui/.", paths: ["ui/"] });
  assert.deepEqual([fact.file, fact.state], ["the-daemon-listens-on-loopback-only", "proposed"]);
  assert.throws(() => remember(context, CODEX, { kind: "agreement", title: "Mine", body: "Mine." }), Refusal);
  assert.throws(() => acceptFact(context, CODEX, fact.file), /another worker, or the owner, accepts it/);
  assert.deepEqual(
    factsFor(context.places, task).map((each) => each.title),
    ["Reply in Vietnamese"],
  );
  acceptFact(context, CURSOR, fact.file);
  assert.deepEqual(
    factsFor(context.places, task)
      .map((each) => each.title)
      .sort(),
    ["Reply in Vietnamese", "The daemon listens on loopback only"],
  );
  assert.deepEqual(
    recall(context.places, ["LOOPBACK", "daemon"]).map((each) => each.file),
    [fact.file],
  );
  editFact(context, OWNER, fact.file, { retire: true });
  assert.deepEqual(recall(context.places, ["loopback"]), []);
  assert.deepEqual(readMemory(context.places).unreadable, []);
  assert.equal(git(context.places.board, "status", "--porcelain"), "");
});

test("the documents are read from what has landed, with each one's state and sections", () => {
  const { root } = context.places;
  mkdirSync(join(root, "rfcs/0001-the-board"), { recursive: true });
  mkdirSync(join(root, "docs/adr"), { recursive: true });
  writeFileSync(
    join(root, "rfcs/0001-the-board/README.md"),
    "---\nstatus: accepted\ndate: 2026-11-20\n---\n\n# RFC 0001: The board\n\nIntro.\n\n## The problem\n\nOne.\n\nTwo\nlines.\n\n## The parts\n\n```\n## not a heading\n```\n",
  );
  writeFileSync(join(root, "docs/adr/0002-trees-only.md"), "---\nstatus: superseded\nsuperseded-by: adr-0003\n---\n\n# ADR 0002: Trees only\n");
  writeFileSync(join(root, "docs/adr/0009-not-landed.md"), "# ADR 0009: Not landed\n");
  git(root, "add", "rfcs", "docs/adr/0002-trees-only.md");
  git(root, "commit", "--quiet", "-m", "Documents");
  const documents = documentsView(context.places);
  assert.deepEqual(
    documents.map((doc) => [doc.id, doc.title, doc.status, doc.date, doc.path]),
    [
      ["rfc-0001", "The board", "accepted", "2026-11-20", "rfcs/0001-the-board/README.md"],
      ["adr-0002", "Trees only", "superseded", "", "docs/adr/0002-trees-only.md"],
    ],
  );
  assert.deepEqual(documents[0]!.sections, [
    { h: "The problem", body: ["One.", "Two\nlines."] },
    { h: "The parts", body: ["```\n## not a heading\n```"] },
  ]);
  assert.equal(documents[1]!.supersededBy, "adr-0003");
});
