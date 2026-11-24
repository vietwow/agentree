import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { Refusal } from "../errors.ts";
import { git, tryGit } from "../git.ts";
import { answer, ask, beat, claim, create, log, move, promote, release, tick, type Context, type NewTask } from "./actions.ts";
import { init } from "./init.ts";
import { BOARD_BRANCH, boardOf } from "./places.ts";
import { lintProblems } from "./rules.ts";
import { claimOf, ownerToken } from "./state.ts";
import { readBoard, taskOf } from "./store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "./testing.ts";

let at: Project;
let home: string;
let context: Context;

beforeEach(() => {
  at = project();
  ({ home, context } = at);
});

afterEach(() => at.remove());

const written: Partial<NewTask> = { context: "Why.", doneWhen: "- It works.", outOfScope: "The rest.", checks: ["pnpm test"] };
const build = (title: string, more: Partial<NewTask> = {}) => create(context, OWNER, { title, kind: "build", priority: 2, ...written, ...more });
const statusOf = (id: string) => taskOf(readBoard(context.places), id).task.fields.status;
const refused = (run: () => unknown, words: RegExp) => assert.throws(run, (error) => error instanceof Refusal && words.test(error.message));

test("init makes the board on a branch of its own, beside the trees, and a second run changes nothing", () => {
  const { places } = context;
  assert.equal(git(places.board, "rev-parse", "--abbrev-ref", "HEAD"), BOARD_BRANCH);
  assert.equal(tryGit(places.root, "merge-base", "main", BOARD_BRANCH).status, 1, "the board shares no history with main");
  assert.ok(existsSync(join(places.board, "work/options.yaml")));
  assert.match(ownerToken(places), /^[0-9a-f]{48}$/);
  assert.deepEqual(init(places.root, { firstCommit: false }).did, []);
  assert.deepEqual(boardOf(places.board), places, "the board is found from any worktree of the repository");
});

test("init refuses a directory with no commit unless it is told to make the first", () => {
  const empty = join(home, "empty");
  git(home, "init", "--quiet", empty);
  refused(() => init(empty, { firstCommit: false }), /has no commit/);
  assert.deepEqual(init(empty, { firstCommit: true }).did.slice(0, 1), ["made its first commit"]);
});

test("a new task takes the next id, is ready when nothing keeps it, and is a commit of the board", () => {
  const first = build("The core");
  const second = build("The daemon", { dependsOn: [first.fields.id] });
  assert.deepEqual([first.fields.id, first.fields.status], ["T-0001", "ready"]);
  assert.deepEqual([second.fields.id, second.fields.status], ["T-0002", "backlog"]);
  assert.equal(git(context.places.board, "log", "-1", "--format=%s"), "T-0002: created");
  assert.equal(git(context.places.board, "status", "--porcelain"), "");
  assert.deepEqual(lintProblems(readBoard(context.places).tasks), []);
});

test("a claim makes the task's tree on its own branch, locks it, and records who holds it", () => {
  build("The core", { writes: ["src/core/"] });
  const { claim: hold, task } = claim(context, CODEX, "T-0001");
  assert.equal(task.fields.status, "in-progress");
  assert.equal(git(hold.tree, "rev-parse", "--abbrev-ref", "HEAD"), "task/T-0001");
  assert.equal(hold.base, git(context.places.root, "rev-parse", "main"));
  assert.match(git(context.places.root, "worktree", "list", "--porcelain"), /locked claimed by codex\/gpt-5/);
  assert.deepEqual(claimOf(context.places, "T-0001"), hold);
  assert.match(task.log.at(-1)!.text, /^Status: ready -> in-progress\.\n\nClaimed by codex\/gpt-5/);
  assert.equal(git(context.places.root, "status", "--porcelain"), "", "the main checkout holds no file of the board");
});

test("a claim is refused for a task that overlaps a held one, waits for another, or is not written", () => {
  build("The core", { writes: ["src/core/"] });
  build("The core's git", { writes: ["src/core/git.ts"] });
  build("After the core", { dependsOn: ["T-0001"], writes: ["src/daemon/"] });
  create(context, OWNER, { title: "Not written", kind: "build", priority: 1 });
  claim(context, CODEX, "T-0001");
  refused(() => claim(context, CURSOR, "T-0002"), /T-0001 is in-progress and holds src\/core\/git\.ts and src\/core\//);
  refused(() => claim(context, CURSOR, "T-0003"), /T-0003 is backlog/);
  refused(
    () => claim(context, CURSOR, "T-0004"),
    /"## Context", "## Done when", "## Out of scope" are not written yet; a task of kind build needs at least one command/,
  );
  refused(() => claim(context, CURSOR, "T-0001"), /T-0001 is in-progress/);
  refused(() => claim(context, { ...CURSOR, worker: "Jane Doe" }, "T-0002"), /no worker's name/);
});

test("a session holds one task at a time", () => {
  build("One", { writes: ["a/"] });
  build("Two", { writes: ["b/"] });
  claim(context, CODEX, "T-0001");
  refused(() => claim(context, CODEX, "T-0002"), /codex\/gpt-5 holds T-0001: a session holds one task at a time/);
  assert.equal(claim(context, { ...CODEX, session: "another" }, "T-0002").task.fields.status, "in-progress");
});

test("the holder logs, beats, asks and marks subtasks; no other worker does", () => {
  build("The core", { subtasks: ["Parse", "Write"] });
  claim(context, CODEX, "T-0001");
  refused(() => log(context, CURSOR, "T-0001", "Did: nothing."), /not held by cursor/);
  refused(() => tick(context, CURSOR, "T-0001", 1, true), /not held by cursor/);
  const since = claimOf(context.places, "T-0001")!.beat;
  assert.ok(beat(context, CODEX, "T-0001") > since);
  assert.equal(log(context, CODEX, "T-0001", "Did: the parser.\nLeft: the writer.").log.at(-1)!.text, "Did: the parser.\nLeft: the writer.");
  assert.deepEqual(tick(context, CODEX, "T-0001", 1, true).subtasks, [
    { title: "Parse", done: true },
    { title: "Write", done: false },
  ]);
  refused(() => tick(context, CODEX, "T-0001", 3, true), /has no subtask 3; it has 2/);
  assert.equal(tick(context, OWNER, "T-0001", 2, true).subtasks[1]!.done, true, "the owner marks one too");
});

test("a question waits on the card for the owner's answer, and the task stays held", () => {
  build("The core");
  claim(context, CODEX, "T-0001");
  ask(context, CODEX, "T-0001", "Which port?", ["4517", "another"]);
  refused(() => answer(context, CODEX, "T-0001", "4517."), /answering a question is the owner's/);
  const answered = answer(context, OWNER, "T-0001", "4517.").questions[0]!;
  assert.deepEqual([answered.text, answered.choices, answered.answer], ["Which port?", ["4517", "another"], "4517."]);
  assert.ok(answered.answeredAt! > answered.at);
  assert.equal(statusOf("T-0001"), "in-progress");
  refused(() => answer(context, OWNER, "T-0001", "Again."), /no question that waits/);
});

test("a release gives the task back with its tree kept; the owner releases only a stale claim", () => {
  build("The core");
  const { claim: hold } = claim(context, CODEX, "T-0001");
  refused(() => release(context, OWNER, "T-0001", "It stopped."), /its holder releases it, or the owner once its claim is stale/);
  at.advance(5 * 60 * 60 * 1000);
  const task = release(context, OWNER, "T-0001", "No beat for five hours.");
  assert.equal(task.fields.status, "ready");
  assert.equal(claimOf(context.places, "T-0001"), undefined);
  assert.ok(existsSync(hold.tree), "the tree stays for the next worker");
  const next = claim(context, CURSOR, "T-0001").claim;
  assert.deepEqual([next.tree, next.branch], [hold.tree, hold.branch], "the next claim works in the same tree");
  assert.equal(release(context, CURSOR, "T-0001", "Waits for a decision.", { blocked: true }).fields.status, "blocked");
});

test("the owner moves a task between backlog and ready, and makes the backlog ready at once", () => {
  build("One", { backlog: true });
  build("Two", { backlog: true });
  build("Three", { backlog: true, dependsOn: ["T-0001"] });
  refused(() => move(context, CODEX, "T-0001", "ready"), /the owner's/);
  assert.equal(move(context, OWNER, "T-0001", "ready").fields.status, "ready");
  refused(() => move(context, OWNER, "T-0003", "ready"), /waits for T-0001/);
  assert.deepEqual(promote(context, OWNER), ["T-0002"]);
  claim(context, CODEX, "T-0001");
  refused(() => move(context, OWNER, "T-0001", "backlog"), /T-0001 is in-progress/);
  assert.equal(move(context, OWNER, "T-0002", "dropped", "No longer wanted.").log.at(-1)!.text, "Status: ready -> dropped.\n\nNo longer wanted.");
});

test("a task file changed by hand is found: the lint names what is wrong, and an unreadable file is named apart", () => {
  build("One");
  build("Two", { dependsOn: ["T-0001"] });
  const directory = join(context.places.board, "work/tasks");
  const one = join(directory, "T-0001-one.md");
  writeFileSync(one, readFileSync(one, "utf8").replace("depends-on: []", "depends-on:\n  - 'T-0002'\n  - 'T-0009'"));
  writeFileSync(join(directory, "T-0003-broken.md"), "not a task\n");
  const board = readBoard(context.places);
  assert.deepEqual(board.unreadable, ["T-0003-broken.md: no frontmatter between two lines of ---"]);
  assert.deepEqual(lintProblems(board.tasks), [
    "T-0001-one.md: it depends on T-0009, which is not on the board",
    "T-0001-one.md: it leads back to itself: T-0001 -> T-0002 -> T-0001",
    "T-0002-two.md: it leads back to itself: T-0002 -> T-0001 -> T-0002",
  ]);
});
