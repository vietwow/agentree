/**
 * `agentree demo`: makes projects whose boards hold the sample content of
 * `sample.ts`, as real repositories: task files with their history,
 * trees with their changes, claims, checks, reviews, sessions, memory and
 * documents. Every time is counted back from the moment it is made.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Task as Row, Tool } from "../../ui/src/board/task.ts";
import { CONFIG_FILE } from "../core/board/config.ts";
import { init } from "../core/board/init.ts";
import { renderFact } from "../core/board/memory.ts";
import { setReviewOwnTasks } from "../core/board/options.ts";
import { TASK_BRANCH, treeOf, type Places } from "../core/board/places.ts";
import { putSession } from "../core/board/sessions.ts";
import { createReview, putChecks, putClaim, putSubmission, type CheckRun } from "../core/board/state.ts";
import { Refusal } from "../core/errors.ts";
import { git } from "../core/git.ts";
import { AGENT_TOOLS, setUp } from "../core/init/tools.ts";
import { editProject, machineHome, register } from "../core/machine/projects.ts";
import { fileName, renderTask } from "../core/task/file.ts";
import {
  DOCS,
  FILE_AREAS,
  fixtureAgents,
  fixtureDetail,
  fixtureFacts,
  fixtureSlots,
  fixtureTasks,
  type SampleDetail as TaskDetail,
} from "./sample.ts";
import { DAEMON, stamp, statusLine, type LogEntry, type Status, type Task } from "../core/task/model.ts";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const OWNER = "person/owner";
const LIFECYCLE: Status[] = ["backlog", "ready", "in-progress", "checking", "review", "accepted", "done"];
/** The model a reviewer of each tool runs on, on the sample board. */
const REVIEW_MODEL: Partial<Record<Tool, string>> = { codex: "gpt-5.6", "claude-code": "opus-5.5" };

const workerOf = (tool: Tool, model?: string) => (tool === "person" ? OWNER : `${tool}/${model ?? REVIEW_MODEL[tool] ?? "agent"}`);
const lines = (count: number, word: string) =>
  Array.from({ length: count }, (_, index) => `// ${word} ${index + 1}`).join("\n") + (count ? "\n" : "");
const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");

function write(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A repository with one commit holding what is given, and its board. */
function repository(directory: string, files: Record<string, string>): Places {
  if (existsSync(directory)) throw new Refusal(`${directory} is there already; a demo is made in a place of its own`);
  mkdirSync(directory, { recursive: true });
  git(directory, "init", "--quiet", "--initial-branch=main");
  for (const [path, text] of Object.entries(files)) write(directory, path, text);
  git(directory, "add", "--all");
  git(directory, "commit", "--quiet", "-m", "Start the project");
  return init(directory, { firstCommit: false }).places;
}

/** The status changes that take a sample task to where it is, each as its Log entry. */
function history(row: Row, detail: TaskDetail, now: Date): LogEntry[] {
  const builder = row.holder ? workerOf(row.holder.tool, row.holder.model) : OWNER;
  const reviewer = detail.review ? workerOf(detail.review.by) : "codex/gpt-5.6";
  const entries: LogEntry[] = [{ at: stamp(row.createdAt), by: OWNER, text: "Created as backlog." }];
  const change = (at: Date, by: string, from: Status, to: Status, note = "") =>
    entries.push({ at: stamp(at), by, text: [statusLine(from, to), note].filter(Boolean).join("\n\n") });
  // An epic is held by no worker: it moves as its parts do, by the daemon.
  const worker = row.holder ? builder : DAEMON;
  const authors: Partial<Record<Status, string>> = {
    ready: OWNER,
    "in-progress": worker,
    checking: worker,
    review: DAEMON,
    accepted: row.holder ? reviewer : DAEMON,
    done: DAEMON,
  };
  const notes: Partial<Record<Status, string>> = {
    "in-progress": `Claimed by ${builder}; tree ${row.id}, branch ${TASK_BRANCH(row.id)}.`,
    checking: `Submitted with ${row.checks.total} checks.`,
    review: "Its checks pass.",
    accepted: detail.review?.findings.length ? list(detail.review.findings) : "Read the diff; no finding.",
    done: "Landed on main as a fast-forward.",
  };
  const reached = LIFECYCLE.indexOf(row.status);
  if (reached < 0) {
    change(row.statusSince, OWNER, "backlog", row.status, "No longer wanted.");
    return entries;
  }
  const rejected = detail.review?.verdict === "rejected" ? detail.review : undefined;
  const failed = row.status === "in-progress" && row.checks.failed > 0 && !rejected;
  // A task sent back was once as far as its review, or its checks: its way there is spread over the time before.
  const path = rejected ? LIFECYCLE.slice(0, 5) : failed ? LIFECYCLE.slice(0, 4) : LIFECYCLE.slice(0, reached + 1);
  const end = rejected ? rejected.at!.getTime() - 20 * MINUTE : failed ? row.holder!.beat.getTime() - 3 * MINUTE : row.statusSince.getTime();
  const weights = path.slice(0, -1).map((status) => (status === "in-progress" ? 5 : status === "backlog" ? 3 : 1));
  const whole = weights.reduce((sum, weight) => sum + weight, 0);
  let at = row.createdAt.getTime();
  path.slice(1).forEach((to, index) => {
    at = index === path.length - 2 ? end : at + ((end - row.createdAt.getTime()) * weights[index]!) / whole;
    if (to === "in-progress" && row.holder && !rejected && !failed) at = Math.min(at, row.holder.since.getTime());
    if (to === "checking" && row.holder)
      entries.push({
        at: stamp(new Date(at - MINUTE)),
        by: builder,
        text: "Did: the change, with a test for each case of Context.\nLeft: nothing.\nFound: nothing outside its paths.",
      });
    change(new Date(at), authors[to]!, path[index]!, to, notes[to]);
  });
  if (rejected) {
    change(rejected.at!, reviewer, "review", "ready", list(rejected.findings));
    change(new Date(rejected.at!.getTime() + 5 * MINUTE), builder, "ready", "in-progress", `Claimed by ${builder} again, in the same tree.`);
  }
  if (failed)
    change(
      new Date(row.holder!.beat.getTime() - MINUTE),
      DAEMON,
      "checking",
      "in-progress",
      `${row.checks.failed} check failed; it is back with its worker.`,
    );
  return entries.filter((entry) => Date.parse(entry.at) <= now.getTime()).sort((a, b) => a.at.localeCompare(b.at));
}

function taskOf(row: Row, detail: TaskDetail, now: Date): Task {
  const asker = row.holder ? workerOf(row.holder.tool, row.holder.model) : OWNER;
  return {
    fields: {
      id: row.id,
      title: row.title,
      status: row.status,
      kind: row.kind,
      priority: row.priority,
      parent: row.parent ?? "",
      rfc: row.rfc ?? "",
      step: "",
      dependsOn: detail.dependsOn.map((on) => on.id),
      writes: row.parent ? detail.writes : [],
      appends: row.parent ? detail.appends : [],
      needs: [],
      checks: detail.checkRuns.map((run) => run.name),
      created: stamp(row.createdAt),
    },
    context: detail.context,
    doneWhen: list(detail.doneWhen),
    outOfScope: list(detail.outOfScope),
    subtasks: row.subtasks.map(({ title, done }) => ({ title, done })),
    questions: detail.questions.map((q) => ({
      at: stamp(q.askedAt),
      by: asker,
      text: q.text,
      choices: [],
      ...(q.answeredAt ? { answeredAt: stamp(q.answeredAt), answer: q.answer ?? "Answered." } : {}),
    })),
    log: history(row, detail, now),
  };
}

/** The machine's state of a sample task: its tree with its change, its claim, its submission, its checks and its review mark. */
function stateOf(places: Places, row: Row, detail: TaskDetail, now: Date, sessionOf: (task: string, tool: Tool) => string) {
  const { id } = row;
  if (detail.checkRuns.length && row.checks.state !== "none") {
    const runs = detail.checkRuns
      .filter((run) => run.result === "passed" || run.result === "failed")
      .map((run): CheckRun => ({
        command: run.name,
        result: run.result === "passed" ? "passed" : "failed",
        tookMs: run.tookMs ?? 0,
        waitedMs: run.waitedMs,
        output: "",
      }));
    // Checks that wait are the daemon's to run, and the sample's are names, not commands: they are written as running.
    putChecks(places, id, { commit: "", state: row.checks.state === "queued" ? "running" : row.checks.state, runs });
  }
  if (!row.holder || !row.parent || row.status === "done") return;
  const by = workerOf(row.holder.tool, row.holder.model);
  const tree = treeOf(places, id);
  const branch = TASK_BRANCH(id);
  const base = git(places.root, "rev-parse", "HEAD");
  git(places.root, "worktree", "add", "--quiet", "--relative-paths", "-b", branch, tree, base);
  for (const file of detail.tree?.diff ?? []) write(tree, file.path, lines(file.added, `${id} line`));
  git(tree, "add", "--all");
  git(tree, "commit", "--quiet", `--author=${by} <agentree@localhost>`, `--date=${stamp(row.holder.beat)}`, "-m", `${id}: ${row.title}`);
  git(places.root, "worktree", "lock", "--reason", `claimed by ${by}`, tree);
  const commit = git(tree, "rev-parse", "HEAD");
  const session = sessionOf(id, row.holder.tool);
  const held = row.status === "in-progress" || row.status === "checking";
  if (held) putClaim(places, id, { by, session, since: stamp(row.holder.since), beat: stamp(row.holder.beat), tree, branch, base });
  if (row.status !== "in-progress") putSubmission(places, id, { by, session, at: stamp(row.statusSince), commit, base, tree, branch });
  if (row.status === "review" && detail.review) {
    const since = stamp(new Date(now.getTime() - 4 * MINUTE));
    createReview(places, id, {
      by: workerOf(detail.review.by),
      session: sessionOf(id, detail.review.by),
      since,
      beat: stamp(new Date(now.getTime() - MINUTE)),
    });
  }
}

/** The files of `main` on the sample project: its documents, its areas each with its count of files, and what the open tasks change. */
function mainFiles(rows: Row[], details: Map<string, TaskDetail>): Record<string, string> {
  const files: Record<string, string> = {
    "CHANGELOG.md": "# Changelog\n",
    [CONFIG_FILE]: `${JSON.stringify({ goal: 15, areas: FILE_AREAS.map(({ path, name }) => ({ path, name })) }, null, 2)}\n`,
  };
  for (const doc of DOCS) {
    const front = [
      `status: ${doc.status}`,
      `date: ${doc.date}`,
      ...(doc.supersedes ? [`supersedes: ${doc.supersedes}`] : []),
      ...(doc.supersededBy ? [`superseded-by: ${doc.supersededBy}`] : []),
    ];
    const body = doc.sections.map((section) => `## ${section.h}\n\n${section.body.join("\n\n")}`).join("\n\n");
    files[doc.path] = `---\n${front.join("\n")}\n---\n\n# ${doc.kind} ${doc.number}: ${doc.title}\n\n${body}\n`;
  }
  for (const row of rows) {
    const detail = details.get(row.id)!;
    for (const file of row.parent ? (detail.tree?.diff ?? []) : []) {
      if (row.status === "done") files[file.path] = lines(file.added, `${row.id} line`);
      else if (file.removed > 0) files[file.path] = lines(file.removed, "before");
    }
  }
  for (const area of FILE_AREAS) {
    const there = Object.keys(files).filter((path) => path.startsWith(`${area.path}/`)).length;
    for (let n = 1; n <= area.files - there; n++) files[`${area.path}/module-${String(n).padStart(2, "0")}.ts`] = `export const module${n} = ${n};\n`;
  }
  return files;
}

/** The sample project: agentree's own board as the UI's pages were built on it. */
function sample(directory: string, now: Date): Places {
  const rows = fixtureTasks(now);
  const details = new Map(rows.map((row) => [row.id, fixtureDetail(row, rows, now)]));
  const places = repository(directory, mainFiles(rows, details));
  // The project is set up for every tool, as `agentree init` leaves one, before any tree is made from it.
  setUp(places.root, AGENT_TOOLS);
  git(places.root, "add", "--all");
  git(places.root, "commit", "--quiet", "-m", "Set the project up for the tools");
  const agents = fixtureAgents(now);

  for (const row of rows) {
    const task = taskOf(row, details.get(row.id)!, now);
    write(places.board, `work/tasks/${fileName(task.fields)}`, renderTask(task));
  }
  for (const row of rows) {
    const uses = details.get(row.id)!.sessions.map((use, index) => ({
      session: `${row.id}-${use.role}-${index + 1}`,
      worker: workerOf(use.tool, use.models[0]),
      role: use.role,
      models: use.models,
      startedAt: stamp(use.startedAt),
      ...(use.endedAt ? { endedAt: stamp(use.endedAt) } : {}),
      ...(use.tokens ? { tokens: use.tokens } : {}),
      ...(use.costUsd === undefined ? {} : { costUsd: use.costUsd }),
      ...(use.unknown ? { unknown: use.unknown } : {}),
    }));
    if (uses.length) write(places.board, `work/usage/${row.id}.jsonl`, `${uses.map((use) => JSON.stringify(use)).join("\n")}\n`);
  }
  for (const fact of fixtureFacts(now)) {
    write(places.board, `work/memory/${fact.file}.md`, renderFact({ ...fact, task: fact.task ?? "", by: workerOf(fact.by), at: stamp(fact.at) }));
  }
  git(places.board, "add", "--all");
  git(places.board, "commit", "--quiet", "-m", "The sample board");
  for (const tool of agents.tools) if (tool.reviewsOwn) setReviewOwnTasks(places, tool.tool, true);

  // A session that holds or reviews a sample task is the one whose subagent works on it, where the sample names one.
  const sessionOf = (task: string, tool: Tool) =>
    agents.sessions.find((session) => session.tool === tool && (session.task === task || session.subagents.some((sub) => sub.task === task)))?.id ??
    `${task}-${tool}`;
  for (const row of rows) stateOf(places, row, details.get(row.id)!, now, sessionOf);
  for (const session of agents.sessions) {
    putSession(places, {
      id: session.id,
      worker: workerOf(session.tool, session.model),
      started: session.started,
      ...(session.by ? { by: session.by.split(" ").at(-1)! } : {}),
      since: stamp(session.since),
      beat: stamp(session.beat),
      ...(session.ended ? { ended: stamp(session.ended) } : {}),
      ...(session.note ? { note: session.note } : {}),
      subagents: session.subagents.map((sub, index) => ({
        id: `${session.id}-${index + 1}`,
        kind: sub.kind,
        task: sub.task,
        since: stamp(sub.since),
        ...(sub.ended ? { ended: stamp(sub.ended) } : {}),
      })),
    });
  }
  return places;
}

/** Another project of the sample machine: a board of plain tasks, so many of them done, worked on by the tools named. */
function other(
  directory: string,
  now: Date,
  shape: { total: number; done: number; tools: Tool[]; created: number; last: number; blocked?: boolean },
): Places {
  const places = repository(directory, { "README.md": `# ${directory.split("/").at(-1)}\n` });
  const created = now.getTime() - shape.created * DAY;
  const last = now.getTime() - shape.last * DAY;
  for (let n = 1; n <= shape.total; n++) {
    const done = n <= shape.done;
    const by = workerOf(shape.tools[n % shape.tools.length]!, undefined);
    const at = (share: number) => stamp(new Date(created + (last - created) * share * (n / shape.total)));
    const status: Status = done ? "done" : shape.blocked && n === shape.done + 1 ? "blocked" : n % 3 ? "ready" : "backlog";
    const log: LogEntry[] = [{ at: at(0.2), by: OWNER, text: "Created as backlog." }];
    if (done)
      for (const [from, to, who, share] of [
        ["backlog", "ready", OWNER, 0.4],
        ["ready", "in-progress", by, 0.6],
        ["in-progress", "done", DAEMON, 1],
      ] as const)
        log.push({ at: at(share), by: who, text: statusLine(from, to) });
    else if (status !== "backlog") log.push({ at: at(0.5), by: status === "blocked" ? by : OWNER, text: statusLine("backlog", status) });
    const fields = {
      id: `T-${String(n).padStart(4, "0")}`,
      title: `Part ${n}`,
      status,
      kind: "build" as const,
      priority: 1 + (n % 4),
      parent: "",
      rfc: "",
      step: "",
      dependsOn: [],
      writes: [],
      appends: [],
      needs: [],
      checks: [],
      created: at(0.2),
    };
    write(
      places.board,
      `work/tasks/${fileName(fields)}`,
      renderTask({
        fields,
        context: `Part ${n} of the project.`,
        doneWhen: "- It is on main.",
        outOfScope: "The other parts.",
        subtasks: [],
        questions: [],
        log,
      }),
    );
  }
  git(places.board, "add", "--all");
  git(places.board, "commit", "--quiet", "-m", "The sample board");
  return places;
}

/** The machine's queue as the sample has it, where the machine has none yet: its bounds, the load of the last hour, and what it decided. */
function sampleQueue(now: Date) {
  const directory = join(machineHome(), "queue");
  if (existsSync(directory)) return;
  const slots = fixtureSlots(now);
  const file = (name: string, value: unknown) => write(directory, name, `${JSON.stringify(value, null, 2)}\n`);
  file("bounds.json", slots.bounds);
  file(
    "readings.json",
    slots.load.map((reading) => ({ at: stamp(reading.at), host: reading.host, vm: reading.vm })),
  );
  file(
    "decisions.json",
    slots.decisions.map((decision) => ({ ...decision, at: stamp(decision.at) })),
  );
}

/** Makes the sample projects under a directory and registers each on this machine; the ids they were given. */
export function demo(directory: string, now: Date): string[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const made = [
    register(sample(join(directory, "agentree"), now).root, ago(9), {
      desc: "Runs coding agents on one board: tasks, trees, checks, review and landing.",
      color: "indigo",
      icon: "layers",
      sample: true,
    }),
    register(
      other(join(directory, "aep"), now, { total: 128, done: 87, tools: ["claude-code", "cursor", "codex"], created: 64, last: 0.2, blocked: true })
        .root,
      ago(64),
      { desc: "The engineering platform the design of agentree comes from.", color: "amber", icon: "building-2", sample: true },
    ),
    register(other(join(directory, "icon-grab"), now, { total: 18, done: 15, tools: ["antigravity"], created: 31, last: 6 }).root, ago(31), {
      desc: "Fetches and normalises icon sets into one sprite.",
      color: "teal",
      icon: "palette",
      private: true,
      sample: true,
    }),
    register(other(join(directory, "notes-sync"), now, { total: 22, done: 22, tools: ["claude-code"], created: 120, last: 40 }).root, ago(120), {
      desc: "Mirrors a folder of notes between two machines.",
      color: "green",
      icon: "folder",
      sample: true,
    }),
  ];
  editProject(made[2]!.id, { hold: true });
  sampleQueue(now);
  return made.map((project) => project.id);
}
