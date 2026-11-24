import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { Refusal } from "../errors.ts";
import { git, tryGit } from "../git.ts";
import { claim, create, log, type Actor, type Context, type NewTask } from "./actions.ts";
import { accept, check, commit, land, reject, review, scope, submit, waitingToLand } from "./lifecycle.ts";
import { setReviewOwnTasks } from "./options.ts";
import { checksOf, claimOf, reviewOf, submissionOf } from "./state.ts";
import { readBoard, taskOf } from "./store.ts";
import { CODEX, CURSOR, OWNER, project, type Project } from "./testing.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
});

afterEach(() => at.remove());

const refused = (run: () => unknown, words: RegExp) => assert.throws(run, (error) => error instanceof Refusal && words.test(error.message));
const statusOf = (id: string) => taskOf(readBoard(context.places), id).task.fields.status;
const lastEntry = (id: string) => taskOf(readBoard(context.places), id).task.log.at(-1)!;
const main = (...args: string[]) => git(context.places.root, ...args);

const build = (title: string, more: Partial<NewTask> = {}) =>
  create(context, OWNER, {
    title,
    kind: "build",
    priority: 2,
    context: "Why.",
    doneWhen: "- It works.",
    outOfScope: "The rest.",
    checks: ["test -f src/a.txt"],
    writes: ["src/"],
    ...more,
  });

/** Claims a task and commits files in its tree, with the holder's Log entry. */
function built(id: string, actor: Actor, files: Record<string, string>) {
  const { claim: hold } = claim(context, actor, id);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(hold.tree, file)), { recursive: true });
    writeFileSync(join(hold.tree, file), text);
  }
  commit(context, actor, id, `${id}: the change`);
  log(context, actor, id, "Did: the change.\nLeft: nothing.");
  return hold;
}

/** Takes a built task through its submit, its checks, and its acceptance by another tool. */
function accepted(id: string, builder: Actor, reviewer: Actor) {
  submit(context, builder, id);
  check(context, id);
  review(context, reviewer, id);
  accept(context, reviewer, id, "Read the diff; the checks pass again.");
}

test("a task goes from its claim to main: submitted, checked, reviewed by another tool, landed by a fast-forward", () => {
  build("The core");
  const hold = built("T-0001", CODEX, { "src/a.txt": "a\n" });
  const { submission } = submit(context, CODEX, "T-0001");
  assert.equal(statusOf("T-0001"), "checking");
  assert.ok(claimOf(context.places, "T-0001"), "its paths stay held while it is checked");
  assert.equal(check(context, "T-0001").fields.status, "review");
  assert.deepEqual(
    checksOf(context.places, "T-0001")!.runs.map((run) => [run.command, run.result]),
    [["test -f src/a.txt", "passed"]],
  );
  assert.match(lastEntry("T-0001").text, /^Status: checking -> review\.\n\nChecks, on [0-9a-f]{12}:\n\n- `test -f src\/a\.txt`: pass, \d+ s$/);
  assert.equal(claimOf(context.places, "T-0001"), undefined);
  review(context, CURSOR, "T-0001");
  assert.equal(accept(context, CURSOR, "T-0001", "Read the diff.").fields.status, "accepted");
  assert.equal(reviewOf(context.places, "T-0001"), undefined);
  assert.deepEqual(waitingToLand(context), ["T-0001"]);
  const landing = land(context, "T-0001");
  assert.equal(landing.landed, submission.commit);
  assert.equal(main("rev-parse", "HEAD"), submission.commit);
  assert.equal(readFileSync(join(context.places.root, "src/a.txt"), "utf8"), "a\n");
  assert.equal(statusOf("T-0001"), "done");
  assert.ok(!existsSync(hold.tree), "its tree is removed");
  assert.equal(tryGit(context.places.root, "rev-parse", "--verify", "--quiet", "refs/heads/task/T-0001").status, 1, "and its branch");
  assert.equal(submissionOf(context.places, "T-0001"), undefined);
});

test("a submit is refused before any check runs: no Log entry, a change not committed, a file outside the task's paths, or no change", () => {
  build("The core");
  const { claim: hold } = claim(context, CODEX, "T-0001");
  refused(() => submit(context, CODEX, "T-0001"), /no Log entry of yours since the claim/);
  log(context, CODEX, "T-0001", "Did: nothing yet.");
  refused(() => submit(context, CODEX, "T-0001"), /holds no change from/);
  mkdirSync(join(hold.tree, "src"));
  writeFileSync(join(hold.tree, "src/a.txt"), "a\n");
  writeFileSync(join(hold.tree, "NOTES.md"), "mine\n");
  assert.deepEqual(scope(context, "T-0001"), { mine: ["src/a.txt"], others: ["NOTES.md"] });
  refused(() => submit(context, CODEX, "T-0001"), /holds changes that are not committed/);
  commit(context, CODEX, "T-0001", "The change");
  refused(() => submit(context, CODEX, "T-0001"), /changed files outside its "writes" and "appends": NOTES\.md/);
  refused(() => submit(context, CURSOR, "T-0001"), /not held by cursor/);
  assert.equal(statusOf("T-0001"), "in-progress");
  assert.equal(checksOf(context.places, "T-0001"), undefined);
});

test("a failing check gives the task back to its worker, still held, with what failed", () => {
  build("The core", { checks: ["test -f src/a.txt", "echo no such thing && exit 3"] });
  built("T-0001", CODEX, { "src/a.txt": "a\n" });
  submit(context, CODEX, "T-0001");
  assert.equal(check(context, "T-0001").fields.status, "in-progress");
  assert.equal(claimOf(context.places, "T-0001")!.by, "codex/gpt-5");
  assert.deepEqual(
    checksOf(context.places, "T-0001")!.runs.map((run) => [run.result, run.output]),
    [
      ["passed", ""],
      ["failed", "no such thing"],
    ],
  );
  assert.match(lastEntry("T-0001").text, /`echo no such thing && exit 3`: FAIL/);
  refused(() => review(context, CURSOR, "T-0001"), /T-0001 is in-progress/);
});

test("a session never reviews its own task, and a tool reviews its own tasks only while the owner's switch is on", () => {
  build("The core");
  built("T-0001", CODEX, { "src/a.txt": "a\n" });
  submit(context, CODEX, "T-0001");
  check(context, "T-0001");
  const other: Actor = { ...CODEX, session: "another-session" };
  refused(() => review(context, CODEX, "T-0001"), /a session never reviews the task it built/);
  refused(() => accept(context, other, "T-0001", "Fine."), /codex reviews no task of its own while the owner's switch for it is off/);
  setReviewOwnTasks(context.places, "codex", true);
  review(context, other, "T-0001");
  refused(() => accept(context, CODEX, "T-0001", "Fine."), /a session never reviews the task it built/);
  refused(() => accept(context, CURSOR, "T-0001", "Fine."), /under review by codex\/gpt-5: the verdict is its reviewer's or the owner's/);
  assert.equal(accept(context, other, "T-0001", "Read as a new session.").fields.status, "accepted");
});

test("a rejection makes the task ready again with its findings, and its next claim works in the same tree", () => {
  build("The core");
  const hold = built("T-0001", CODEX, { "src/a.txt": "a\n" });
  submit(context, CODEX, "T-0001");
  check(context, "T-0001");
  assert.equal(reject(context, CURSOR, "T-0001", "- src/a.txt holds no newline at its end.").fields.status, "ready");
  assert.equal(lastEntry("T-0001").text, "Status: review -> ready.\n\n- src/a.txt holds no newline at its end.");
  const again = claim(context, CODEX, "T-0001").claim;
  assert.equal(again.tree, hold.tree);
  assert.equal(readFileSync(join(again.tree, "src/a.txt"), "utf8"), "a\n");
});

test("a decision, and a task that needs the owner, are accepted by the owner alone", () => {
  create(context, OWNER, {
    title: "Which port",
    kind: "decision",
    priority: 1,
    context: "Why.",
    doneWhen: "- Decided.",
    outOfScope: "None.",
    writes: ["docs/"],
  });
  built("T-0001", CODEX, { "docs/port.md": "4517\n" });
  submit(context, CODEX, "T-0001");
  check(context, "T-0001");
  refused(() => accept(context, CURSOR, "T-0001", "Fine."), /a decision: the owner alone decides it/);
  assert.equal(accept(context, OWNER, "T-0001", "Decided: 4517.").fields.status, "accepted");
});

test("a change main has moved past is rebased by the lander, checked, and landed when the rebase changed nothing of it", () => {
  build("One", { writes: ["src/a.txt"] });
  build("Two", { writes: ["src/b.txt"], checks: ["test -f src/a.txt && test -f src/b.txt"] });
  built("T-0001", CODEX, { "src/a.txt": "a\n" });
  const two = built("T-0002", CURSOR, { "src/b.txt": "b\n" });
  accepted("T-0001", CODEX, CURSOR);
  submit(context, CURSOR, "T-0002");
  land(context, "T-0001");
  refused(() => check(context, "T-9999"), /no task T-9999/);
  assert.equal(check(context, "T-0002").fields.status, "in-progress", "its check needs what landed: it fails in the tree as it was claimed");
  git(two.tree, "rebase", "--quiet", "main");
  log(context, CURSOR, "T-0002", "Did: rebased on main.");
  accepted("T-0002", CURSOR, CODEX);
  build("Three", { writes: ["src/c.txt"] });
  const three = built("T-0003", CODEX, { "src/c.txt": "c\n" });
  accepted("T-0003", CODEX, CURSOR);
  land(context, "T-0002");
  const before = submissionOf(context.places, "T-0003")!.commit;
  const landing = land(context, "T-0003");
  assert.notEqual(landing.landed, before, "it landed as a rebased commit");
  assert.match(landing.task.log.at(-1)!.text, /rebased from [0-9a-f]{12}; the rebase changed nothing of its diff\.$/);
  assert.deepEqual(main("ls-files", "src").split("\n"), ["src/a.txt", "src/b.txt", "src/c.txt"]);
  assert.equal(main("log", "--format=%p", "-1").includes(" "), false, "main holds no merge commit");
  assert.ok(!existsSync(three.tree));
  assert.ok(!existsSync(join(context.places.trees, "landing-T-0003")), "the lander's own tree is removed");
});

test("a change that conflicts with what landed is never landed over it: it goes back to a worker", () => {
  build("One", { writes: ["src/a.txt"] });
  built("T-0001", CODEX, { "src/a.txt": "from the task\n" });
  accepted("T-0001", CODEX, CURSOR);
  mkdirSync(join(context.places.root, "src"));
  writeFileSync(join(context.places.root, "src/a.txt"), "by hand, on main\n");
  main("add", "src/a.txt");
  main("commit", "--quiet", "-m", "By hand");
  const landing = land(context, "T-0001");
  assert.equal(landing.landed, undefined);
  assert.equal(landing.task.fields.status, "ready");
  assert.match(landing.why!, /it conflicts with what landed since its base, in src\/a\.txt/);
  assert.equal(readFileSync(join(context.places.root, "src/a.txt"), "utf8"), "by hand, on main\n");
  refused(() => land(context, "T-0001"), /T-0001 is ready; a task lands once it is accepted/);
});

test("a landing makes ready the task that waited for it, and done the parent whose parts are all done", () => {
  create(context, OWNER, { title: "The epic", kind: "build", priority: 1 });
  build("Part one", { parent: "T-0001", writes: ["src/a.txt"] });
  build("Part two", { parent: "T-0001", writes: ["src/b.txt"], dependsOn: ["T-0002"], checks: ["test -f src/b.txt"] });
  assert.equal(statusOf("T-0003"), "backlog");
  built("T-0002", CODEX, { "src/a.txt": "a\n" });
  accepted("T-0002", CODEX, CURSOR);
  land(context, "T-0002");
  assert.deepEqual([statusOf("T-0003"), statusOf("T-0001")], ["ready", "ready"]);
  built("T-0003", CURSOR, { "src/b.txt": "b\n" });
  accepted("T-0003", CURSOR, CODEX);
  land(context, "T-0003");
  assert.deepEqual([statusOf("T-0003"), statusOf("T-0001")], ["done", "done"]);
  assert.equal(lastEntry("T-0001").text, "Status: ready -> done.\n\nIts 2 parts are all done.");
});

test("a rebase that changed the task's own diff sends it back to review, with its tree at the rebased commit", () => {
  const lines = (changed: Record<number, string> = {}) =>
    Array.from({ length: 10 }, (_, index) => changed[index + 1] ?? `line ${index + 1}`).join("\n") + "\n";
  const file = join(context.places.root, "list.txt");
  writeFileSync(file, lines());
  main("add", "list.txt");
  main("commit", "--quiet", "-m", "A list");
  build("Change line nine", { writes: ["list.txt"], checks: ["grep -q nine list.txt"] });
  const hold = built("T-0001", CODEX, { "list.txt": lines({ 9: "nine" }) });
  accepted("T-0001", CODEX, CURSOR);
  writeFileSync(file, lines({ 7: "seven, by hand" }));
  main("commit", "--quiet", "-am", "Line seven by hand");
  const landing = land(context, "T-0001");
  assert.equal(landing.landed, undefined);
  assert.equal(landing.task.fields.status, "review");
  assert.match(landing.why!, /the rebase changed the task's own diff: it is reviewed again/);
  assert.equal(readFileSync(join(hold.tree, "list.txt"), "utf8"), lines({ 7: "seven, by hand", 9: "nine" }));
  assert.equal(submissionOf(context.places, "T-0001")!.commit, git(hold.tree, "rev-parse", "HEAD"));
  accept(context, CURSOR, "T-0001", "Read the rebased diff.");
  assert.equal(land(context, "T-0001").task.fields.status, "done");
  assert.equal(readFileSync(file, "utf8"), lines({ 7: "seven, by hand", 9: "nine" }));
});
