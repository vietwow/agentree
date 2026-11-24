/**
 * From a finished change to `main`: the submit, its checks, the review by
 * another worker, and the landing. A submit checks a commit; what was
 * checked and reviewed is what lands.
 */
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "../errors.ts";
import { git, patchId, tryGit } from "../git.ts";
import { CHECKED_KINDS, DAEMON, stamp, toolOf, type Task } from "../task/model.ts";
import { holding, isStale, moved, tasks, worker, type Actor, type Context } from "./actions.ts";
import { readOptions } from "./options.ts";
import type { Places } from "./places.ts";
import { dependenciesDone, inScope, isHeld } from "./rules.ts";
import { runInShell } from "./run.ts";
import {
  beat,
  claimOf,
  createReview,
  putChecks,
  putSubmission,
  removeClaim,
  removeReview,
  removeSetup,
  removeSubmission,
  reviewOf,
  submissionOf,
  type CheckRun,
  type Submission,
} from "./state.ts";
import { fromItsRead, readBoard, taskOf, writeTask, type Board, type Stored } from "./store.ts";

/** The files a tree changed from a commit: its diff against it, committed or not, and the files git does not know and does not ignore. */
export function changedFiles(tree: string, base: string): string[] {
  const lines = (text: string) => text.split("\n").filter(Boolean);
  return [...new Set([...lines(git(tree, "diff", "--name-only", base)), ...lines(git(tree, "ls-files", "--others", "--exclude-standard"))])].sort();
}

/** The last commit a task's branch shares with the main checkout's. */
const baseOf = (places: Places, branch: string) => git(places.root, "merge-base", "HEAD", branch);

/** The files a task's tree changed, by whose they are: the task's own under its `writes` and `appends`, and every other. */
export function scope(context: Context, id: string): { mine: string[]; others: string[] } {
  const { task } = taskOf(readBoard(context.places), id);
  const hold = claimOf(context.places, id) ?? submissionOf(context.places, id);
  if (!hold?.tree || !existsSync(hold.tree)) throw new Refusal(`${id} has no tree: it has one from its claim to its landing`);
  const files = changedFiles(hold.tree, baseOf(context.places, hold.branch));
  return { mine: files.filter((file) => inScope(task, file)), others: files.filter((file) => !inScope(task, file)) };
}

/** Commits what the holder's tree holds on the task's branch, for a session whose sandbox keeps it from committing. */
export function commit(context: Context, actor: Actor, id: string, message: string): string {
  const { claim } = holding(context, readBoard(context.places), id, actor);
  if (message.trim() === "") throw new Refusal("a commit has a message");
  git(claim.tree, "add", "--all");
  if (git(claim.tree, "status", "--porcelain") === "") throw new Refusal(`${id}'s tree holds no change to commit`);
  git(claim.tree, "commit", "--quiet", `--author=${claim.by} <agentree@localhost>`, "-m", message.trim());
  beat(context.places, "claims", id, stamp(context.now()));
  return git(claim.tree, "rev-parse", "HEAD");
}

/**
 * Submits the holder's change: its Log entry, a clean tree on its branch,
 * the scope check and the conflict check, all before any check runs. The
 * task is then `checking`, its paths still held, and its checks wait to run.
 */
export function submit(context: Context, actor: Actor, id: string): { task: Task; submission: Submission } {
  return fromItsRead(() => {
    const { stored, claim } = holding(context, readBoard(context.places), id, actor);
    const { task } = stored;
    if (task.fields.status !== "in-progress") throw new Refusal(`${id} is ${task.fields.status}: its checks run, and it is submitted once`);
    if (!task.log.some((entry) => entry.by === actor.worker && entry.at >= claim.since && !entry.text.startsWith("Status: ")))
      throw new Refusal(`${id} has no Log entry of yours since the claim: log what was done, what is left and what was found, then submit`);
    if (git(claim.tree, "rev-parse", "--abbrev-ref", "HEAD") !== claim.branch)
      throw new Refusal(`${claim.tree} does not have ${claim.branch} out: a submit checks the task's branch`);
    const dirty = git(claim.tree, "status", "--porcelain");
    if (dirty !== "") throw new Refusal(`${claim.tree} holds changes that are not committed; a submit checks a commit:\n${dirty}`);
    const base = baseOf(context.places, claim.branch);
    const files = changedFiles(claim.tree, base);
    const others = files.filter((file) => !inScope(task, file));
    if (others.length) throw new Refusal(`${id} changed files outside its "writes" and "appends": ${others.join(", ")}`);
    if (CHECKED_KINDS.includes(task.fields.kind) && files.length === 0)
      throw new Refusal(`${id}'s tree ${claim.tree} holds no change from ${base.slice(0, 12)}: its checks would run on nothing`);
    const merged = tryGit(context.places.root, "merge-tree", "--write-tree", "--name-only", "HEAD", claim.branch);
    if (merged.status === 1)
      throw new Refusal(
        `${id} conflicts with what landed since its base, in ${merged.stdout.split("\n").slice(1).filter(Boolean).join(", ")}: rebase its branch in its tree, and submit again`,
      );
    const at = stamp(context.now());
    const submission: Submission = {
      by: actor.worker,
      session: actor.session,
      at,
      commit: git(claim.tree, "rev-parse", "HEAD"),
      base,
      tree: claim.tree,
      branch: claim.branch,
    };
    putSubmission(context.places, id, submission);
    putChecks(context.places, id, { commit: submission.commit, state: "queued", runs: [] });
    const note = `Submitted: committed as ${submission.commit.slice(0, 12)} on ${claim.branch}, from ${base.slice(0, 12)}.`;
    return { task: writeTask(context.places, stored, moved(task, "checking", actor.worker, at, note), "submitted").task, submission };
  });
}

const seconds = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);
const lineOf = (run: CheckRun) =>
  `- \`${run.command}\`: ${run.result === "passed" ? "pass" : run.result === "failed" ? "FAIL" : "FAIL (timed out)"}, ${seconds(run.tookMs)}`;

/** Runs commands in a directory, each whatever the one before did. */
function runAll(context: Context, commands: string[], cwd: string): CheckRun[] {
  return commands.map((command) => {
    const ran = (context.run ?? runInShell)(command, cwd);
    return {
      command,
      result: ran.ok ? "passed" : ran.timedOut ? "timed-out" : "failed",
      tookMs: ran.tookMs,
      waitedMs: 0,
      output: ran.ok ? "" : ran.output,
    };
  });
}

/**
 * Runs the checks of a task that is `checking`, in its tree, and settles
 * it: `review` when every one passes on the commit that was submitted, and
 * back to its worker, in progress, when one fails or the tree changed
 * during them.
 */
export function check(context: Context, id: string): Task {
  const { task, tree } = checksToRun(context, id);
  return settleChecks(context, id, runAll(context, task.fields.checks, tree));
}

/** The task whose checks are to run, and the tree they run in; its checks are marked as running. */
export function checksToRun(context: Context, id: string): { task: Task; tree: string } {
  const { task } = taskOf(readBoard(context.places), id);
  const submission = submissionOf(context.places, id);
  if (task.fields.status !== "checking" || !submission) throw new Refusal(`${id} is ${task.fields.status}; its checks run while it is checking`);
  putChecks(context.places, id, { commit: submission.commit, state: "running", runs: [] });
  return { task, tree: submission.tree };
}

/** Settles a task that is `checking` on the results of its checks, however they were run. */
export function settleChecks(context: Context, id: string, runs: CheckRun[]): Task {
  const { places } = context;
  const submission = submissionOf(places, id);
  if (!submission) throw new Refusal(`${id} has no submission to settle`);
  putChecks(places, id, { commit: submission.commit, state: "finished", runs });
  const changed = git(submission.tree, "rev-parse", "HEAD") !== submission.commit || git(submission.tree, "status", "--porcelain") !== "";
  const passed = runs.every((run) => run.result === "passed") && !changed;
  return fromItsRead(() => {
    const stored = taskOf(readBoard(places), id);
    const at = stamp(context.now());
    const results = runs.length ? `Checks, on ${submission.commit.slice(0, 12)}:\n\n${runs.map(lineOf).join("\n")}` : "It has no checks.";
    if (passed) {
      const task = writeTask(places, stored, moved(stored.task, "review", DAEMON, at, results), "checking to review").task;
      removeClaim(places, id);
      return task;
    }
    const why = changed ? `${results}\n\nThe tree changed during the checks: what was checked is not what would land.` : results;
    beat(places, "claims", id, at);
    return writeTask(places, stored, moved(stored.task, "in-progress", DAEMON, at, why), "checking to in-progress").task;
  });
}

/** Whether a worker may review a task: never the session that built it, and its tool's own tasks only while the owner's switch allows. */
function mayReview(context: Context, actor: Actor, id: string, submission: Submission) {
  const by = worker(actor);
  if (submission.by === by && submission.session === actor.session)
    throw new Refusal(`${id} was built by this session: a session never reviews the task it built`);
  const tool = toolOf(by);
  if (tool !== "person" && tool === toolOf(submission.by) && !readOptions(context.places).reviewOwnTasks[tool])
    throw new Refusal(`${id} was built by ${submission.by}: ${tool} reviews no task of its own while the owner's switch for it is off`);
}

function inReview(context: Context, board: Board, id: string): { stored: Stored; submission: Submission } {
  const stored = taskOf(board, id);
  const submission = submissionOf(context.places, id);
  if (stored.task.fields.status !== "review" || !submission)
    throw new Refusal(`${id} is ${stored.task.fields.status}; a task is reviewed while it is in review`);
  return { stored, submission };
}

/** Marks a task as under review by a worker, so that no second reviewer starts the same review; `drop` gives the mark back. */
export function review(context: Context, actor: Actor, id: string, options: { drop?: boolean } = {}) {
  const { submission } = inReview(context, readBoard(context.places), id);
  const mark = reviewOf(context.places, id);
  const mine = mark?.by === actor.worker && mark.session === actor.session;
  if (options.drop) {
    if (!mine) throw new Refusal(`${id} is not under review by ${actor.worker}`);
    return removeReview(context.places, id);
  }
  mayReview(context, actor, id, submission);
  if (mine) return;
  const at = stamp(context.now());
  if (mark && !isStale(mark, context.now())) throw new Refusal(`${id} is under review by ${mark.by} since ${mark.since}`);
  removeReview(context.places, id);
  if (!createReview(context.places, id, { by: actor.worker, session: actor.session, since: at, beat: at }))
    throw new Refusal(`${id} was taken for review by another worker a moment ago`);
}

/** The reviewer of a task in review: the one whose mark holds, any other worker that may review while none does, or the owner. */
function deciding(context: Context, actor: Actor, id: string, board: Board): { stored: Stored; submission: Submission } {
  const found = inReview(context, board, id);
  const mark = reviewOf(context.places, id);
  const { fields } = found.stored.task;
  if ((fields.kind === "decision" || fields.needs.includes("owner")) && !actor.owner)
    throw new Refusal(`${id} is ${fields.kind === "decision" ? "a decision" : "a task that needs the owner"}: the owner alone decides it`);
  if (!actor.owner) mayReview(context, actor, id, found.submission);
  const theirs = mark && !(mark.by === actor.worker && mark.session === actor.session) && !isStale(mark, context.now());
  if (theirs && !actor.owner) throw new Refusal(`${id} is under review by ${mark.by}: the verdict is its reviewer's or the owner's`);
  return found;
}

/** Accepts a reviewed task with the review's words; it then waits for its turn to land. */
export function accept(context: Context, actor: Actor, id: string, entry: string): Task {
  if (entry.trim() === "") throw new Refusal("an acceptance says what was read and which checks were run again; it is empty");
  return fromItsRead(() => {
    const { stored } = deciding(context, actor, id, readBoard(context.places));
    const task = writeTask(context.places, stored, moved(stored.task, "accepted", worker(actor), stamp(context.now()), entry), "accepted").task;
    removeReview(context.places, id);
    return task;
  });
}

/** Rejects a reviewed task with findings, each checkable; it is ready again, with its tree and branch kept. */
export function reject(context: Context, actor: Actor, id: string, findings: string): Task {
  if (findings.trim() === "") throw new Refusal("a rejection names its findings, each one checkable; it is empty");
  return fromItsRead(() => {
    const { stored, submission } = deciding(context, actor, id, readBoard(context.places));
    const task = writeTask(context.places, stored, moved(stored.task, "ready", worker(actor), stamp(context.now()), findings), "rejected").task;
    removeReview(context.places, id);
    removeSubmission(context.places, id);
    tryGit(context.places.root, "worktree", "unlock", submission.tree);
    return task;
  });
}

/** Runs a landing while no other runs: one at a time, in the main checkout. */
function whileNoOtherLands<T>(places: Places, landing: () => T): T {
  const lock = join(places.state, "landing.lock");
  try {
    writeFileSync(lock, `${process.pid}\n`, { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new Refusal(`another landing runs (${lock}); a landing takes its turn`);
  }
  try {
    return landing();
  } finally {
    rmSync(lock, { force: true });
  }
}

/** What a landing came to: the task on `main`, sent back to a worker, or back in review. */
export type Landing = { task: Task; landed?: string; why?: string };

/**
 * Lands an accepted task on the main checkout's branch, by a fast-forward
 * only. A change that `main` has moved past is rebased in a tree of the
 * lander's own and checked there: it lands when the rebase changed nothing
 * of the task's own diff, goes back to review when it did, and goes back to
 * a worker on a conflict or a failing check.
 */
export function land(context: Context, id: string): Landing {
  const { places } = context;
  return whileNoOtherLands(places, () => {
    const board = readBoard(places);
    const stored = taskOf(board, id);
    const submission = submissionOf(places, id);
    if (stored.task.fields.status !== "accepted" || !submission)
      throw new Refusal(`${id} is ${stored.task.fields.status}; a task lands once it is accepted`);
    const settle = (to: "ready" | "review", why: string): Landing => {
      const task = writeTask(places, stored, moved(stored.task, to, DAEMON, stamp(context.now()), why), `accepted to ${to}`).task;
      if (to === "ready") {
        removeSubmission(places, id);
        tryGit(places.root, "worktree", "unlock", submission.tree);
      }
      return { task, why };
    };
    const head = git(places.root, "rev-parse", "HEAD");
    const tip = git(places.root, "rev-parse", submission.branch);
    if (tip !== submission.commit)
      return settle(
        "ready",
        `Not landed: ${submission.branch} is at ${tip.slice(0, 12)}, not at the commit that was checked and reviewed, ${submission.commit.slice(0, 12)}.`,
      );
    const outside = changedFiles(submission.tree, baseOf(places, submission.branch)).filter((file) => !inScope(stored.task, file));
    if (outside.length) return settle("ready", `Not landed: its branch holds files outside its paths: ${outside.join(", ")}.`);

    let target = tip;
    if (tryGit(places.root, "merge-base", "--is-ancestor", head, tip).status !== 0) {
      const merged = tryGit(places.root, "merge-tree", "--write-tree", "--name-only", head, tip);
      if (merged.status !== 0)
        return settle(
          "ready",
          `Not landed: it conflicts with what landed since its base, in ${merged.stdout.split("\n").slice(1).filter(Boolean).join(", ")}. Rebase its branch in its tree, and submit again.`,
        );
      const tree = join(places.trees, `landing-${id}`);
      git(places.root, "worktree", "add", "--quiet", "--detach", tree, tip);
      try {
        if (tryGit(tree, "rebase", "--quiet", head).status !== 0)
          return settle("ready", "Not landed: its rebase on what landed since its base stopped. Rebase its branch in its tree, and submit again.");
        target = git(tree, "rev-parse", "HEAD");
        const runs = runAll(context, stored.task.fields.checks, tree);
        if (runs.some((run) => run.result !== "passed"))
          return settle("ready", `Not landed: rebased on ${head.slice(0, 12)}, its checks fail:\n\n${runs.map(lineOf).join("\n")}`);
        if (patchId(places.root, submission.base, tip) !== patchId(places.root, head, target)) {
          git(submission.tree, "reset", "--quiet", "--hard", target);
          putSubmission(places, id, { ...submission, commit: target, base: head });
          return settle(
            "review",
            `Rebased on ${head.slice(0, 12)} as ${target.slice(0, 12)}, and the rebase changed the task's own diff: it is reviewed again, as \`git diff ${head.slice(0, 12)} ${target.slice(0, 12)}\`.`,
          );
        }
      } finally {
        tryGit(places.root, "worktree", "remove", "--force", tree);
      }
    }
    git(places.root, "merge", "--quiet", "--ff-only", target);
    const landed = git(places.root, "rev-parse", "HEAD");
    const at = stamp(context.now());
    const note = `Landed on main as ${landed.slice(0, 12)}${target === tip ? "" : `, rebased from ${tip.slice(0, 12)}; the rebase changed nothing of its diff`}.`;
    const task = writeTask(places, stored, moved(stored.task, "done", DAEMON, at, note), "landed").task;
    removeSubmission(places, id);
    removeClaim(places, id);
    tryGit(places.root, "worktree", "unlock", submission.tree);
    tryGit(places.root, "worktree", "remove", submission.tree);
    tryGit(places.root, "branch", "--quiet", "-D", submission.branch);
    removeSetup(places, id);
    afterLanding(context, id, at);
    return { task, landed };
  });
}

/** What a landing sets off: a parent whose parts are all done is done, and a backlog task that waited for this one alone is ready. */
function afterLanding(context: Context, id: string, at: string) {
  const board = readBoard(context.places);
  const all = tasks(board);
  for (const stored of board.tasks) {
    const { fields } = stored.task;
    if (fields.status === "backlog" && fields.dependsOn.includes(id) && dependenciesDone(all, stored.task))
      writeTask(context.places, stored, moved(stored.task, "ready", DAEMON, at, `${id} landed: nothing it depends on is left.`), "backlog to ready");
  }
  const parent = all.find((task) => task.fields.id === all.find((each) => each.fields.id === id)?.fields.parent);
  const parts = parent ? all.filter((task) => task.fields.parent === parent.fields.id && task.fields.status !== "dropped") : [];
  if (parent && parent.fields.status !== "done" && !isHeld(parent) && parts.every((task) => task.fields.status === "done")) {
    const stored = taskOf(board, parent.fields.id);
    writeTask(context.places, stored, moved(stored.task, "done", DAEMON, at, `Its ${parts.length} parts are all done.`), "done with its parts");
  }
}

/** The accepted tasks, in the order they were accepted: the lander takes them in turn. */
export function waitingToLand(context: Context): string[] {
  const acceptedAt = (task: Task) => task.log.findLast((entry) => entry.text.startsWith("Status: review -> accepted."))?.at ?? "";
  return tasks(readBoard(context.places))
    .filter((task) => task.fields.status === "accepted")
    .sort((a, b) => acceptedAt(a).localeCompare(acceptedAt(b)))
    .map((task) => task.fields.id);
}
