/**
 * The changes of the board, each one call: it reads the board, refuses what
 * the rules forbid, and writes. Every caller (the command, the daemon for
 * the UI and for MCP) goes through these and holds no rule of its own.
 */
import { existsSync } from "node:fs";
import { Refusal } from "../errors.ts";
import { git, tryGit } from "../git.ts";
import {
  CHECKED_KINDS,
  DAEMON,
  ID_PATTERN,
  isWorker,
  KINDS,
  NEEDS,
  stamp,
  statusLine,
  type Kind,
  type Need,
  type Status,
  type Task,
} from "../task/model.ts";
import { configOf } from "./config.ts";
import { TASK_BRANCH, treeOf, type Places } from "./places.ts";
import type { Run } from "./run.ts";
import { dependenciesDone, isHeld as held, nextId, obstacles, overlaps } from "./rules.ts";
import { beat as beatHold, claimOf, claims, createClaim, putClaim, removeClaim, reviewOf, type Claim } from "./state.ts";
import { fromItsRead, readBoard, taskOf, writeTask, type Board, type Stored } from "./store.ts";

/** A claim, or a review mark, not beaten for this long is stale: a tool's hooks beat it at each call. */
export const STALE_AFTER_MS = 30 * 60 * 1000;

/** Where a change runs and what time it is. */
export type Context = { places: Places; now: () => Date; run?: Run };

/** Who asks for a change: a worker by its name and its session, and whether it showed the owner's token. */
export type Actor = { worker: string; session: string; owner: boolean };

/** The actor's name, refused when it is no worker's. */
export function worker(actor: Actor): string {
  if (!isWorker(actor.worker))
    throw new Refusal(
      `"${actor.worker}" is no worker's name; it is <tool>/<model>, as codex/gpt-5 or person/owner, never a person's name or address`,
    );
  return actor.worker;
}

/** Refuses what is the owner's alone to an actor without the owner's token. */
export function owner(actor: Actor, what: string) {
  if (!actor.owner) throw new Refusal(`${what} is the owner's: it needs the owner's token`);
}

export const tasks = (board: Board) => board.tasks.map((stored) => stored.task);

/** A task with a Log entry more. */
const logged = (task: Task, by: string, at: string, text: string): Task => ({ ...task, log: [...task.log, { at, by, text: text.trim() }] });

/** A task in another status, with the Log entry that records the change and what is said of it. */
export function moved(task: Task, to: Status, by: string, at: string, note = ""): Task {
  const entry = [statusLine(task.fields.status, to), note.trim()].filter(Boolean).join("\n\n");
  return logged({ ...task, fields: { ...task.fields, status: to } }, by, at, entry);
}

/** The task and the claim of the worker that holds it; any other is refused. */
export function holding(context: Context, board: Board, id: string, actor: Actor): { stored: Stored; claim: Claim } {
  const stored = taskOf(board, id);
  const claim = claimOf(context.places, id);
  if (!held(stored.task) || !claim || claim.by !== actor.worker || claim.session !== actor.session)
    throw new Refusal(`${id} is not held by ${actor.worker}: it is ${stored.task.fields.status}${claim ? `, held by ${claim.by}` : ""}`);
  return { stored, claim };
}

export type NewTask = {
  title: string;
  kind: Kind;
  priority: number;
  parent?: string;
  rfc?: string;
  step?: string;
  dependsOn?: string[];
  writes?: string[];
  appends?: string[];
  needs?: Need[];
  checks?: string[];
  context?: string;
  doneWhen?: string;
  outOfScope?: string;
  subtasks?: string[];
  /** Written as backlog whatever its dependencies, for the owner to make ready. */
  backlog?: boolean;
};

/** Writes a new task with the next free id: ready when every task it depends on is done, backlog otherwise. */
export function create(context: Context, actor: Actor, input: NewTask): Task {
  const by = worker(actor);
  if (input.title.trim() === "") throw new Refusal("a task has a title");
  if (!KINDS.includes(input.kind)) throw new Refusal(`a task's kind is one of ${KINDS.join(", ")}`);
  if (!Number.isInteger(input.priority) || input.priority < 1) throw new Refusal("a task's priority is a whole number from 1; 1 is taken first");
  for (const need of input.needs ?? []) if (!NEEDS.includes(need)) throw new Refusal(`"needs" holds ${NEEDS.join(", ")}`);
  return fromItsRead(() => {
    const board = readBoard(context.places);
    const all = tasks(board);
    for (const id of [...(input.dependsOn ?? []), ...(input.parent ? [input.parent] : [])]) taskOf(board, id);
    const draft: Task = {
      fields: {
        id: nextId(all),
        title: input.title.trim(),
        status: "backlog",
        kind: input.kind,
        priority: input.priority,
        parent: input.parent ?? "",
        rfc: input.rfc ?? "",
        step: input.step ?? "",
        dependsOn: input.dependsOn ?? [],
        writes: input.writes ?? [],
        appends: input.appends ?? [],
        needs: input.needs ?? [],
        checks: input.checks?.length || !CHECKED_KINDS.includes(input.kind) ? (input.checks ?? []) : configOf(context.places).checks,
        created: stamp(context.now()),
      },
      context: input.context?.trim() ?? "",
      doneWhen: input.doneWhen?.trim() ?? "",
      outOfScope: input.outOfScope?.trim() ?? "",
      subtasks: (input.subtasks ?? []).map((title) => ({ title: title.trim(), done: false })),
      questions: [],
      log: [],
    };
    const task: Task = input.backlog || !dependenciesDone(all, draft) ? draft : { ...draft, fields: { ...draft.fields, status: "ready" } };
    return writeTask(context.places, undefined, logged(task, by, task.fields.created, `Created as ${task.fields.status}.`), "created").task;
  });
}

/** The owner moves a task between backlog and ready, or drops it. */
export function move(context: Context, actor: Actor, id: string, to: "backlog" | "ready" | "dropped", why = ""): Task {
  owner(actor, "moving a task by hand");
  return fromItsRead(() => {
    const board = readBoard(context.places);
    const stored = taskOf(board, id);
    const from = stored.task.fields.status;
    if (from === to) return stored.task;
    if (to === "dropped" ? held(stored.task) || from === "done" : !(from === "backlog" || from === "ready" || from === "blocked"))
      throw new Refusal(`${id} is ${from}: a person moves a task between backlog and ready, and drops one that is not held or done`);
    if (to === "ready" && !dependenciesDone(tasks(board), stored.task))
      throw new Refusal(`${id} waits for ${stored.task.fields.dependsOn.join(", ")}: it is ready when they are done`);
    return writeTask(context.places, stored, moved(stored.task, to, worker(actor), stamp(context.now()), why), `${from} to ${to}`).task;
  });
}

/** Makes ready every backlog task whose dependencies are all done; the ids it moved. */
export function promote(context: Context, actor: Actor): string[] {
  owner(actor, "making the backlog ready");
  return fromItsRead(() => {
    const board = readBoard(context.places);
    const waiting = board.tasks.filter((stored) => stored.task.fields.status === "backlog" && dependenciesDone(tasks(board), stored.task));
    for (const stored of waiting)
      writeTask(context.places, stored, moved(stored.task, "ready", worker(actor), stamp(context.now())), "backlog to ready");
    return waiting.map((stored) => stored.task.fields.id);
  });
}

/** The task's tree: made from the head of the main checkout on a branch of its own, or the one a claim before left. */
function treeFor(places: Places, id: string, by: string): { tree: string; branch: string; base: string } {
  const tree = treeOf(places, id);
  const branch = TASK_BRANCH(id);
  const exists = tryGit(places.root, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).status === 0;
  if (!existsSync(tree))
    git(places.root, "worktree", "add", "--quiet", "--relative-paths", ...(exists ? [tree, branch] : ["-b", branch, tree, "HEAD"]));
  else if (!exists) throw new Refusal(`${tree} is there and the branch ${branch} is not: it is no tree of this task. Remove it and claim again`);
  tryGit(places.root, "worktree", "unlock", tree);
  git(places.root, "worktree", "lock", "--reason", `claimed by ${by}`, tree);
  return { tree, branch, base: git(places.root, "merge-base", "HEAD", branch) };
}

/** Takes a ready task: the claim one worker alone creates, its tree, and the brief to work from. */
export function claim(context: Context, actor: Actor, id: string, options: { ownerTold?: boolean } = {}): { task: Task; claim: Claim } {
  const by = worker(actor);
  if (!ID_PATTERN.test(id)) throw new Refusal("name the task by its id, as T-0042");
  return fromItsRead(() => {
    const board = readBoard(context.places);
    const stored = taskOf(board, id);
    const { task } = stored;
    if (task.fields.status !== "ready") throw new Refusal(`${id} is ${task.fields.status}; a task is claimed while it is ready`);
    if (task.fields.needs.includes("owner") && !options.ownerTold && !actor.owner)
      throw new Refusal(`${id} needs the owner: it is claimed when the owner has told you to take it (--owner-told)`);
    const against = obstacles(tasks(board), task);
    if (against.length) throw new Refusal(`${id} is not claimed: ${against.join("; ")}`);
    for (const [other, hold] of claims(context.places))
      if (hold.by === by && hold.session === actor.session)
        throw new Refusal(`${by} holds ${other}: a session holds one task at a time. Submit or release it first`);
    const at = stamp(context.now());
    const mine: Claim = { by, session: actor.session, since: at, beat: at, tree: "", branch: "", base: "" };
    if (!createClaim(context.places, id, mine))
      throw new Refusal(`${id} was claimed by ${claimOf(context.places, id)?.by ?? "another worker"} a moment ago`);
    try {
      // Two claims taken at once each see the other only now: of two that overlap, the higher id gives way.
      for (const [other] of claims(context.places)) {
        const theirs = board.tasks.find((each) => each.task.fields.id === other)?.task;
        if (theirs && other < id && overlaps(task, theirs).length)
          throw new Refusal(`${id} is not claimed: ${other} was claimed at the same moment and overlaps it`);
      }
      Object.assign(mine, treeFor(context.places, id, by));
      putClaim(context.places, id, mine);
      const note = [
        `Claimed by ${by}; tree ${mine.tree}, branch ${mine.branch}, from ${mine.base.slice(0, 12)}.`,
        options.ownerTold ? "The owner told this worker to take it." : "",
      ]
        .filter(Boolean)
        .join(" ");
      return { task: writeTask(context.places, stored, moved(task, "in-progress", by, at, note), "ready to in-progress").task, claim: mine };
    } catch (error) {
      removeClaim(context.places, id);
      throw error;
    }
  });
}

/** Says the holder, or the reviewer, is still there. It writes one small file and commits nothing. */
export function beat(context: Context, actor: Actor, id: string): string {
  const at = stamp(context.now());
  const hold = claimOf(context.places, id);
  const mark = reviewOf(context.places, id);
  const mine = (each?: { by: string; session: string }) => each?.by === actor.worker && each.session === actor.session;
  if (mine(hold)) beatHold(context.places, "claims", id, at);
  else if (mine(mark)) beatHold(context.places, "reviews", id, at);
  else throw new Refusal(`${id} is neither held nor under review by ${actor.worker}`);
  return at;
}

/** Adds the holder's entry to the task's Log, and beats its claim. */
export function log(context: Context, actor: Actor, id: string, entry: string): Task {
  if (entry.trim() === "") throw new Refusal("a Log entry says what was done, what is left and what was found; it is empty");
  return fromItsRead(() => {
    const { stored } = holding(context, readBoard(context.places), id, actor);
    const at = stamp(context.now());
    beatHold(context.places, "claims", id, at);
    return writeTask(context.places, stored, logged(stored.task, actor.worker, at, entry), "a Log entry").task;
  });
}

/** Writes the holder's question for the owner into the task; its claim and its paths stay held. */
export function ask(context: Context, actor: Actor, id: string, text: string, choices: string[] = []): Task {
  if (text.trim() === "") throw new Refusal("a question for the owner has words");
  return fromItsRead(() => {
    const { stored } = holding(context, readBoard(context.places), id, actor);
    const question = {
      at: stamp(context.now()),
      by: actor.worker,
      text: text.trim(),
      choices: choices.map((choice) => choice.trim()).filter(Boolean),
    };
    return writeTask(context.places, stored, { ...stored.task, questions: [...stored.task.questions, question] }, "a question for the owner").task;
  });
}

/** Writes the owner's answer under the oldest question that has none, or under the one named by its number from 1. */
export function answer(context: Context, actor: Actor, id: string, text: string, number?: number): Task {
  owner(actor, "answering a question");
  if (text.trim() === "") throw new Refusal("an answer has words");
  return fromItsRead(() => {
    const stored = taskOf(readBoard(context.places), id);
    const { questions } = stored.task;
    const index = number === undefined ? questions.findIndex((question) => !question.answeredAt) : number - 1;
    const question = questions[index];
    if (!question)
      throw new Refusal(
        number === undefined ? `${id} has no question that waits for an answer` : `${id} has no question ${number}; it has ${questions.length}`,
      );
    if (question.answeredAt) throw new Refusal(`question ${index + 1} of ${id} was answered on ${question.answeredAt}`);
    const answered = { ...question, answeredAt: stamp(context.now()), answer: text.trim() };
    return writeTask(context.places, stored, { ...stored.task, questions: questions.with(index, answered) }, "the owner's answer").task;
  });
}

/** Marks a subtask, by its number from 1, done or not: the task's holder does, or the owner. */
export function tick(context: Context, actor: Actor, id: string, number: number, done: boolean): Task {
  return fromItsRead(() => {
    const board = readBoard(context.places);
    const stored = actor.owner ? taskOf(board, id) : holding(context, board, id, actor).stored;
    const subtask = stored.task.subtasks[number - 1];
    if (!subtask) throw new Refusal(`${id} has no subtask ${number}; it has ${stored.task.subtasks.length}`);
    if (subtask.done === done) return stored.task;
    return writeTask(
      context.places,
      stored,
      { ...stored.task, subtasks: stored.task.subtasks.with(number - 1, { ...subtask, done }) },
      `subtask ${number} ${done ? "done" : "not done"}`,
    ).task;
  });
}

/** Whether a claim or a review mark was not beaten for too long. */
export const isStale = (hold: { beat: string }, now: Date) => now.getTime() - Date.parse(hold.beat) > STALE_AFTER_MS;

/**
 * Gives a task back without finishing it: ready again, or blocked. Its
 * holder does, with what was done and what is left; the owner does for a
 * claim that is stale. The tree, its commits and the Log stay for the next worker.
 */
export function release(context: Context, actor: Actor, id: string, why: string, options: { blocked?: boolean } = {}): Task {
  if (why.trim() === "") throw new Refusal("a release says what was done and what is left; it is empty");
  return fromItsRead(() => {
    const board = readBoard(context.places);
    const stored = taskOf(board, id);
    const hold = claimOf(context.places, id);
    if (stored.task.fields.status !== "in-progress" || !hold)
      throw new Refusal(`${id} is ${stored.task.fields.status}; a task is released while it is in progress`);
    const mine = hold.by === actor.worker && hold.session === actor.session;
    if (!mine && !(actor.owner && isStale(hold, context.now())))
      throw new Refusal(`${id} is held by ${hold.by}: its holder releases it, or the owner once its claim is stale`);
    const by = mine ? worker(actor) : actor.owner && isWorker(actor.worker) ? actor.worker : DAEMON;
    const task = writeTask(
      context.places,
      stored,
      moved(stored.task, options.blocked ? "blocked" : "ready", by, stamp(context.now()), why),
      "released",
    ).task;
    if (hold.tree) tryGit(context.places.root, "worktree", "unlock", hold.tree);
    removeClaim(context.places, id);
    return task;
  });
}
