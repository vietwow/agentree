#!/usr/bin/env node
/** `agentree <subcommand>`: the core on the command line. It holds no rule: each line below is one call of the core. */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { answer, ask, beat, claim, create, isStale, log, move, promote, release, tick, type Actor, type Context } from "../core/board/actions.ts";
import { init } from "../core/board/init.ts";
import { accept, check, commit, land, reject, review, scope, submit, waitingToLand } from "../core/board/lifecycle.ts";
import { setReviewOwnTasks } from "../core/board/options.ts";
import { boardOf } from "../core/board/places.ts";
import { lintProblems, obstacles, unwritten } from "../core/board/rules.ts";
import { claims, ownerToken } from "../core/board/state.ts";
import { readBoard, taskOf } from "../core/board/store.ts";
import { Refusal } from "../core/errors.ts";
import { projects, register } from "../core/machine/projects.ts";
import { startDaemon } from "../daemon/serve.ts";
import { demo } from "../demo/demo.ts";
import { renderTask } from "../core/task/file.ts";
import { KINDS, STATUSES, type Kind, type Need, type Tool } from "../core/task/model.ts";

const USAGE = `Usage: agentree <subcommand> [options]

  init [--first-commit]                 make this repository's board
  board                                 every task by status, and who holds it
  next                                  the ready tasks that can be claimed now, and why the others cannot
  show T-NNNN                           the task as its file holds it
  new --title <words> --kind <kind> --priority <n>
      [--parent T-NNNN] [--rfc NNNN] [--step <step>] [--backlog]
      [--context, --done-when, --out-of-scope: the words of each section]
      [--depends-on, --writes, --appends, --needs, --check, --subtask: each repeats]
  claim T-NNNN [--owner-told]           take a ready task; prints its tree
  beat T-NNNN                           say you are still there
  log T-NNNN < entry.md                 add an entry to its Log
  ask T-NNNN [--choice <words>]... < question.md
  answer T-NNNN [--question <n>] < answer.md       (the owner's)
  tick T-NNNN <n> [--undo]              mark subtask n done
  scope T-NNNN                          the files its tree changed, by whose they are
  commit T-NNNN -m <message>            commit its tree on its branch, for a session that cannot
  submit T-NNNN                         the scope check, then its checks; review when they pass
  release T-NNNN [--blocked] < why.md   give it back without finishing
  review T-NNNN [--drop]                mark it as under review by you
  accept T-NNNN < review.md             reviewed; it waits for its turn to land
  reject T-NNNN < findings.md           ready again, with the findings
  land [T-NNNN]                         land an accepted task on main, or each that waits, in turn
  option review-own-tasks <tool> on|off (the owner's)
  move T-NNNN backlog|ready|dropped     (the owner's)
  promote                               make ready every backlog task that waits for nothing (the owner's)
  lint                                  what is wrong on the board
  register [--name <words>] [--desc <words>]   add this repository to the machine's projects
  projects                              the projects of this machine
  serve [--port <n>]                    the daemon: the UI and its API, on 127.0.0.1 only
  demo <directory>                      make the sample projects there, and register them

Name yourself in AGENTREE_WORKER as <tool>/<model>; a session is told by
AGENTREE_SESSION, or by the id its tool gives. The owner's commands need
AGENTREE_OWNER_TOKEN.
`;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    "first-commit": { type: "boolean" },
    "owner-told": { type: "boolean" },
    backlog: { type: "boolean" },
    blocked: { type: "boolean" },
    undo: { type: "boolean" },
    drop: { type: "boolean" },
    message: { type: "string", short: "m" },
    name: { type: "string" },
    desc: { type: "string" },
    port: { type: "string" },
    title: { type: "string" },
    kind: { type: "string" },
    priority: { type: "string" },
    parent: { type: "string" },
    rfc: { type: "string" },
    step: { type: "string" },
    question: { type: "string" },
    context: { type: "string" },
    "done-when": { type: "string" },
    "out-of-scope": { type: "string" },
    "depends-on": { type: "string", multiple: true },
    writes: { type: "string", multiple: true },
    appends: { type: "string", multiple: true },
    needs: { type: "string", multiple: true },
    check: { type: "string", multiple: true },
    subtask: { type: "string", multiple: true },
    choice: { type: "string", multiple: true },
    help: { type: "boolean", short: "h" },
  },
});

const [subcommand, ...rest] = positionals;
const say = (text: string) => process.stdout.write(`${text}\n`);

/** A list option given several times, or once with commas. */
const list = (given: string[] | undefined) =>
  (given ?? [])
    .flatMap((each) => each.split(","))
    .map((item) => item.trim())
    .filter(Boolean);

function stdin(what: string): string {
  if (process.stdin.isTTY) throw new Refusal(`give ${what} on standard input, as: agentree ${subcommand} ... < file.md`);
  return readFileSync(0, "utf8");
}

function context(): Context {
  return { places: boardOf(process.cwd()), now: () => new Date() };
}

function actor(from: Context): Actor {
  const token = process.env.AGENTREE_OWNER_TOKEN;
  if (token !== undefined && token !== ownerToken(from.places)) throw new Refusal("AGENTREE_OWNER_TOKEN is not this board's token");
  return {
    worker: process.env.AGENTREE_WORKER ?? (token ? "person/owner" : ""),
    session: process.env.AGENTREE_SESSION ?? process.env.CLAUDE_CODE_SESSION_ID ?? "",
    owner: token !== undefined,
  };
}

function id(): string {
  if (!rest[0]) throw new Refusal("name the task by its id, as T-0042");
  return rest[0];
}

const COMMANDS: Record<string, () => unknown> = {
  init() {
    const { places, did } = init(process.cwd(), { firstCommit: values["first-commit"] ?? false });
    say(did.length ? did.map((line) => `- ${line}`).join("\n") : "the board is there already; nothing changed");
    say(`The board: ${places.board}\nThe owner's token: ${places.state}/owner-token`);
  },
  board() {
    const at = context();
    const board = readBoard(at.places);
    const held = claims(at.places);
    for (const problem of board.unreadable) process.stderr.write(`agentree: skipped ${problem}\n`);
    for (const status of STATUSES) {
      const tasks = board.tasks.map((stored) => stored.task).filter((task) => task.fields.status === status);
      if (!tasks.length) continue;
      say(`${status} (${tasks.length})`);
      for (const { fields, questions } of tasks.sort((a, b) => a.fields.priority - b.fields.priority || a.fields.id.localeCompare(b.fields.id))) {
        const hold = held.get(fields.id);
        const marks = [
          hold && `held by ${hold.by}${isStale(hold, at.now()) ? ", stale" : ""}`,
          questions.some((q) => !q.answeredAt) && "asks the owner",
        ].filter(Boolean);
        say(`  ${fields.id}  P${fields.priority}  ${fields.kind.padEnd(8)}  ${fields.title}${marks.length ? `  [${marks.join("; ")}]` : ""}`);
      }
    }
  },
  next() {
    const board = readBoard(context().places);
    const all = board.tasks.map((stored) => stored.task);
    const ready = all
      .filter((task) => task.fields.status === "ready")
      .sort((a, b) => a.fields.priority - b.fields.priority || a.fields.id.localeCompare(b.fields.id));
    if (!ready.length) return say("No task is ready.");
    for (const task of ready) {
      const against = obstacles(all, task);
      say(
        `${task.fields.id}  P${task.fields.priority}  ${task.fields.title}${task.fields.needs.length ? `  (needs ${task.fields.needs.join(", ")})` : ""}`,
      );
      for (const reason of against) say(`    not now: ${reason}`);
    }
  },
  show() {
    process.stdout.write(renderTask(taskOf(readBoard(context().places), id()).task));
  },
  new() {
    const at = context();
    if (!values.title || !values.kind || !values.priority) throw new Refusal("a new task has --title, --kind and --priority");
    if (!(KINDS as readonly string[]).includes(values.kind)) throw new Refusal(`--kind is one of ${KINDS.join(", ")}`);
    const task = create(at, actor(at), {
      title: values.title,
      kind: values.kind as Kind,
      priority: Number(values.priority),
      ...(values.parent ? { parent: values.parent } : {}),
      ...(values.rfc ? { rfc: values.rfc } : {}),
      ...(values.step ? { step: values.step } : {}),
      ...(values.context ? { context: values.context } : {}),
      ...(values["done-when"] ? { doneWhen: values["done-when"] } : {}),
      ...(values["out-of-scope"] ? { outOfScope: values["out-of-scope"] } : {}),
      dependsOn: list(values["depends-on"]),
      writes: list(values.writes),
      appends: list(values.appends),
      needs: list(values.needs) as Need[],
      checks: values.check ?? [],
      subtasks: values.subtask ?? [],
      backlog: values.backlog ?? false,
    });
    const blank = unwritten(task);
    say(`${task.fields.id} is ${task.fields.status}.${blank.length ? ` Write its ${blank.join(", ")} before it is claimed.` : ""}`);
  },
  claim() {
    const at = context();
    const { task, claim: hold } = claim(at, actor(at), id(), { ownerTold: values["owner-told"] ?? false });
    say(`${task.fields.id} is yours. Work in its tree, on its branch, and change only its paths:\n  ${hold.tree}  (${hold.branch})\n`);
    process.stdout.write(renderTask(task));
  },
  beat() {
    const at = context();
    say(`beat at ${beat(at, actor(at), id())}`);
  },
  log() {
    const at = context();
    log(at, actor(at), id(), stdin("the Log entry"));
    say(`${id()}: the entry is in its Log`);
  },
  ask() {
    const at = context();
    ask(at, actor(at), id(), stdin("the question"), values.choice ?? []);
    say(`${id()}: the question waits for the owner on its card; the task stays yours`);
  },
  answer() {
    const at = context();
    answer(at, actor(at), id(), stdin("the answer"), values.question ? Number(values.question) : undefined);
    say(`${id()}: answered`);
  },
  tick() {
    const at = context();
    const task = tick(at, actor(at), id(), Number(rest[1]), !values.undo);
    say(`${id()}: ${task.subtasks.filter((sub) => sub.done).length} of ${task.subtasks.length} subtasks done`);
  },
  release() {
    const at = context();
    const task = release(at, actor(at), id(), stdin("what was done and what is left"), { blocked: values.blocked ?? false });
    say(`${id()} is ${task.fields.status}; its tree and branch stay for the next worker`);
  },
  scope() {
    const { mine, others } = scope(context(), id());
    say(mine.length ? `Yours:\n${mine.map((file) => `  ${file}`).join("\n")}` : "Its tree changed no file of its paths.");
    if (others.length) {
      say(`Outside its "writes" and "appends":\n${others.map((file) => `  ${file}`).join("\n")}`);
      process.exitCode = 1;
    }
  },
  commit() {
    const at = context();
    say(`${id()}: committed as ${commit(at, actor(at), id(), values.message ?? "").slice(0, 12)}`);
  },
  submit() {
    const at = context();
    const { submission } = submit(at, actor(at), id());
    say(`${id()}: submitted at ${submission.commit.slice(0, 12)}; its checks run in ${submission.tree}`);
    const task = check(at, id());
    say(task.log.at(-1)!.text);
    if (task.fields.status !== "review") process.exitCode = 1;
  },
  review() {
    const at = context();
    review(at, actor(at), id(), { drop: values.drop ?? false });
    say(values.drop ? `${id()}: your review mark is given back` : `${id()} is under review by you; accept or reject it`);
  },
  accept() {
    const at = context();
    accept(at, actor(at), id(), stdin("the review"));
    say(`${id()} is accepted; it waits for its turn to land`);
  },
  reject() {
    const at = context();
    reject(at, actor(at), id(), stdin("the findings"));
    say(`${id()} is ready again, with the findings in its Log`);
  },
  land() {
    const at = context();
    for (const each of rest[0] ? [rest[0]] : waitingToLand(at)) {
      const landing = land(at, each);
      say(landing.landed ? `${each} landed on main as ${landing.landed.slice(0, 12)}` : `${each} is ${landing.task.fields.status}. ${landing.why}`);
    }
  },
  option() {
    const at = context();
    const [name, tool, to] = rest;
    if (name !== "review-own-tasks" || (to !== "on" && to !== "off")) throw new Refusal("the option is: review-own-tasks <tool> on|off");
    if (!actor(at).owner) throw new Refusal("changing an option is the owner's: it needs the owner's token");
    setReviewOwnTasks(at.places, tool as Tool, to === "on");
    say(`${tool} ${to === "on" ? "may" : "may not"} review its own tasks`);
  },
  move() {
    const at = context();
    const to = rest[1];
    if (to !== "backlog" && to !== "ready" && to !== "dropped") throw new Refusal("a person moves a task to backlog, ready or dropped");
    say(`${id()} is ${move(at, actor(at), id(), to).fields.status}`);
  },
  promote() {
    const at = context();
    const moved = promote(at, actor(at));
    say(moved.length ? `ready now: ${moved.join(", ")}` : "no backlog task waits for nothing");
  },
  register() {
    const project = register(process.cwd(), new Date(), {
      ...(values.name ? { name: values.name } : {}),
      ...(values.desc ? { desc: values.desc } : {}),
    });
    say(`${project.name} is the project "${project.id}" of this machine: ${project.root}`);
  },
  projects() {
    for (const project of projects()) say(`${project.id.padEnd(20)} ${project.root}`);
  },
  serve() {
    const daemon = startDaemon({ ...(values.port ? { port: Number(values.port) } : {}), ui: join(import.meta.dirname, "../../ui/dist") });
    say(`agentree serves ${projects().length} ${projects().length === 1 ? "project" : "projects"}. Open:\n  ${daemon.address}`);
  },
  async demo() {
    if (!rest[0]) throw new Refusal("name the directory the sample projects are made in");
    const made = await demo(resolve(rest[0]), new Date());
    say(`The sample projects are in ${resolve(rest[0])}: ${made.join(", ")}. Run "agentree serve" to see them.`);
  },
  lint() {
    const board = readBoard(context().places);
    const problems = [...board.unreadable, ...lintProblems(board.tasks)];
    for (const problem of problems) say(problem);
    if (problems.length) process.exitCode = 1;
    else say(`${board.tasks.length} tasks, nothing wrong`);
  },
};

try {
  const run = subcommand === undefined || values.help ? undefined : COMMANDS[subcommand];
  if (run) await run();
  else {
    process.stdout.write(USAGE);
    if (subcommand !== undefined && !values.help) throw new Refusal(`"${subcommand}" is no subcommand`);
  }
} catch (error) {
  if (!(error instanceof Refusal)) throw error;
  process.stderr.write(`agentree: ${error.message}\n`);
  process.exitCode = 1;
}
