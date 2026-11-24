import type { AgentSession, Doc, Fact, Slots, ToolSetup } from "../../ui/src/board/model.ts";
import type { CheckRun, Checks, Kind, Session, Status, Task, TaskDetail, Tool } from "../../ui/src/board/task.ts";

type LogEntry = TaskDetail["log"][number];

const MINUTE = 60_000;

/**
 * Sample tasks for the first page, until the daemon serves the board.
 * Times are minutes before the fixtures' clock, 15:00 of the current day,
 * so the page reads the same whenever it is opened.
 */

type Row = {
  id: string;
  title: string;
  status: Status;
  kind: Kind;
  priority: number;
  parent?: string;
  holder?: [Tool, string, number, number];
  checks?: Partial<Checks>;
  asked?: number[];
  answered?: number[];
  created: number;
  since: number;
  landed?: number;
};

const PARENTS = {
  "T-0031": "The seed's board, read as tasks",
  "T-0001": "The core split from the seed",
  "T-0002": "Trees and landing",
  "T-0003": "The daemon and the UI",
} as const;

const PARENT_TITLES: Record<string, string> = PARENTS;

const ROWS: Row[] = [
  { id: "T-0031", title: PARENTS["T-0031"], status: "done", kind: "build", priority: 1, created: 29600, since: 20300, landed: 20300 },
  { id: "T-0001", title: PARENTS["T-0001"], status: "in-progress", kind: "build", priority: 1, created: 25600, since: 23040 },
  { id: "T-0002", title: PARENTS["T-0002"], status: "ready", kind: "build", priority: 2, created: 19200, since: 16640 },
  { id: "T-0003", title: PARENTS["T-0003"], status: "backlog", kind: "build", priority: 3, created: 12800, since: 12800 },

  {
    id: "T-0032",
    title: "Read the seed's work folder as tasks",
    status: "done",
    kind: "build",
    priority: 1,
    parent: "T-0031",
    holder: ["claude-code", "opus-5.5", 29000, 24600],
    checks: { total: 5, passed: 5, state: "finished" },
    created: 29500,
    since: 24600,
    landed: 24600,
  },
  {
    id: "T-0033",
    title: "Map the seed's statuses to agentree's",
    status: "done",
    kind: "build",
    priority: 2,
    parent: "T-0031",
    holder: ["codex", "gpt-5.6", 21500, 20300],
    checks: { total: 4, passed: 4, state: "finished" },
    created: 28160,
    since: 20300,
    landed: 20300,
  },

  {
    id: "T-0004",
    title: "Parse and write a task file with its front matter",
    status: "done",
    kind: "build",
    priority: 1,
    parent: "T-0001",
    holder: ["claude-code", "opus-5.5", 21000, 16600],
    checks: { total: 6, passed: 6, state: "finished" },
    created: 24960,
    since: 16600,
    landed: 16600,
  },
  {
    id: "T-0005",
    title: "Refuse a write when the file changed since it was read",
    status: "done",
    kind: "build",
    priority: 1,
    parent: "T-0001",
    holder: ["codex", "gpt-5.6", 13600, 9200],
    checks: { total: 4, passed: 4, state: "finished" },
    created: 24960,
    since: 9200,
    landed: 9200,
  },
  {
    id: "T-0006",
    title: "Lint the schema of every task, with the new statuses",
    status: "done",
    kind: "build",
    priority: 1,
    parent: "T-0001",
    holder: ["antigravity", "gemini-4", 6200, 5000],
    checks: { total: 5, passed: 5, state: "finished" },
    created: 24320,
    since: 5000,
    landed: 5000,
  },
  {
    id: "T-0007",
    title: "Overlap of writes refused at the claim",
    status: "done",
    kind: "build",
    priority: 1,
    parent: "T-0001",
    holder: ["cursor", "sonnet-5.5", 9000, 4600],
    checks: { total: 7, passed: 7, state: "finished" },
    created: 23680,
    since: 4600,
    landed: 4600,
  },
  {
    id: "T-0008",
    title: "Claim, beat and release under the git common directory",
    status: "done",
    kind: "build",
    priority: 1,
    parent: "T-0001",
    holder: ["claude-code", "opus-5.5", 250, 95],
    checks: { total: 8, passed: 8, state: "finished" },
    created: 23680,
    since: 95,
    landed: 95,
  },
  {
    id: "T-0009",
    title: "Move the seed's tests of task.mjs with the core",
    status: "accepted",
    kind: "build",
    priority: 1,
    parent: "T-0001",
    holder: ["codex", "gpt-5.6", 1300, 40],
    checks: { total: 12, passed: 12, state: "finished" },
    created: 23040,
    since: 40,
  },
  {
    id: "T-0010",
    title: "The project's part as an interface: checks, narrowing, heavy commands",
    status: "review",
    kind: "build",
    priority: 1,
    parent: "T-0001",
    holder: ["claude-code", "opus-5.5", 1800, 6],
    checks: { total: 9, passed: 9, state: "finished" },
    created: 22400,
    since: 75,
  },
  {
    id: "T-0011",
    title: "Log entries written with the worker's tool and session",
    status: "review",
    kind: "build",
    priority: 2,
    parent: "T-0001",
    holder: ["cursor", "sonnet-5.5", 1600, 12],
    checks: { total: 6, passed: 6, state: "finished" },
    created: 21760,
    since: 24,
  },
  {
    id: "T-0012",
    title: "Slots: tickets, seats and the bound of a check",
    status: "checking",
    kind: "build",
    priority: 1,
    parent: "T-0001",
    holder: ["claude-code", "opus-5.5", 1400, 2],
    checks: { total: 10, passed: 6, state: "running" },
    created: 21120,
    since: 8,
  },
  {
    id: "T-0013",
    title: "Read the processes of the queue on Linux",
    status: "checking",
    kind: "research",
    priority: 2,
    parent: "T-0001",
    holder: ["antigravity", "gemini-4", 900, 3],
    checks: { total: 3, passed: 0, state: "queued", queuePlace: 2 },
    created: 20480,
    since: 5,
  },
  {
    id: "T-0014",
    title: "agentree ask and answer write the Questions section",
    status: "in-progress",
    kind: "build",
    priority: 2,
    parent: "T-0001",
    holder: ["claude-desktop", "opus-5.5", 2000, 4],
    asked: [38],
    created: 19200,
    since: 2000,
  },
  {
    id: "T-0015",
    title: "The parent of a breakdown is done when its parts are",
    status: "in-progress",
    kind: "build",
    priority: 3,
    parent: "T-0001",
    holder: ["codex", "gpt-5.6", 2200, 52],
    checks: { total: 4, passed: 1, failed: 1, state: "finished" },
    created: 19200,
    since: 2200,
  },

  {
    id: "T-0016",
    title: "git worktree add with relative paths at the claim",
    status: "in-progress",
    kind: "build",
    priority: 1,
    parent: "T-0002",
    holder: ["cursor", "gpt-5.6", 80, 1],
    created: 17920,
    since: 80,
  },
  {
    id: "T-0017",
    title: "Lock a tree at its claim and unlock it at its end",
    status: "ready",
    kind: "build",
    priority: 1,
    parent: "T-0002",
    created: 17280,
    since: 2000,
  },
  {
    id: "T-0018",
    title: "Scope by the base: git diff with the files git does not know",
    status: "ready",
    kind: "build",
    priority: 2,
    parent: "T-0002",
    created: 17280,
    since: 2000,
  },
  {
    id: "T-0019",
    title: "merge-tree at submit and again before landing",
    status: "ready",
    kind: "build",
    priority: 2,
    parent: "T-0002",
    created: 16640,
    since: 2000,
  },
  {
    id: "T-0020",
    title: "Rebase an accepted branch in a landing tree of its own",
    status: "backlog",
    kind: "build",
    priority: 3,
    parent: "T-0002",
    asked: [190],
    created: 16640,
    since: 16640,
  },
  {
    id: "T-0021",
    title: "Measure a tree's install into a volume of the container",
    status: "in-progress",
    kind: "measure",
    priority: 2,
    parent: "T-0002",
    holder: ["person", "owner", 1500, 30],
    created: 16000,
    since: 1500,
  },
  {
    id: "T-0022",
    title: "Decide the bound on trees kept per machine",
    status: "backlog",
    kind: "decision",
    priority: 4,
    parent: "T-0002",
    asked: [1300],
    answered: [1250],
    created: 16000,
    since: 16000,
  },

  {
    id: "T-0023",
    title: "Hono server with streamSSE for the board's events",
    status: "backlog",
    kind: "build",
    priority: 2,
    parent: "T-0003",
    created: 12160,
    since: 12160,
  },
  {
    id: "T-0024",
    title: "The token and Origin check on every request of the daemon",
    status: "backlog",
    kind: "build",
    priority: 1,
    parent: "T-0003",
    created: 12160,
    since: 12160,
  },
  {
    id: "T-0025",
    title: "The first page of the UI and its tokens, shown to the owner",
    status: "in-progress",
    kind: "build",
    priority: 1,
    parent: "T-0003",
    holder: ["cursor", "opus-5.5", 1700, 1],
    checks: { total: 5, passed: 5, state: "finished" },
    created: 11520,
    since: 1700,
  },
  {
    id: "T-0026",
    title: "Fix the sidebar's mark drawn below its current item",
    status: "done",
    kind: "fix",
    priority: 1,
    parent: "T-0003",
    holder: ["cursor", "opus-5.5", 12000, 10880],
    checks: { total: 3, passed: 3, state: "finished" },
    created: 14080,
    since: 10880,
    landed: 10880,
  },
  {
    id: "T-0027",
    title: "Review the compose file's published port on the loopback address",
    status: "review",
    kind: "review",
    priority: 2,
    parent: "T-0003",
    holder: ["claude-code", "sonnet-5.5", 1000, 150],
    checks: { total: 2, passed: 2, state: "finished" },
    created: 10240,
    since: 150,
  },
  {
    id: "T-0028",
    title: "Icons of the side bar for every page",
    status: "backlog",
    kind: "assets",
    priority: 5,
    parent: "T-0003",
    created: 9600,
    since: 9600,
  },
  {
    id: "T-0029",
    title: "The board as columns: a column a status, cards that drag",
    status: "backlog",
    kind: "build",
    priority: 3,
    parent: "T-0003",
    created: 8960,
    since: 8960,
  },
  {
    id: "T-0030",
    title: "Which Docker Desktop share a project's heavy runs need",
    status: "dropped",
    kind: "research",
    priority: 5,
    created: 26240,
    since: 16640,
  },
];

/** What each task waits for, its `depends-on`. */
const DEPENDS_ON: Record<string, string[]> = {
  "T-0033": ["T-0032"],
  "T-0005": ["T-0004"],
  "T-0006": ["T-0005"],
  "T-0008": ["T-0007"],
  "T-0017": ["T-0016"],
  "T-0019": ["T-0018"],
  "T-0020": ["T-0019"],
  "T-0024": ["T-0023"],
  "T-0029": ["T-0025"],
};

/** Each task's subtasks; a mark of 1 is done. An epic counts its tasks instead. */
const SUBTASKS: Record<string, [string, 0 | 1][]> = {
  "T-0032": [
    ["List the task files of work/", 1],
    ["Read each one's front matter", 1],
  ],
  "T-0033": [
    ["A table of the seed's statuses", 1],
    ["Map each to one of agentree's", 1],
    ["Refuse a status with no match", 1],
  ],
  "T-0004": [
    ["Read the front matter with its schema", 1],
    ["Write it back in the same key order", 1],
    ["Keep the body byte for byte", 1],
  ],
  "T-0005": [
    ["Hash the file at its read", 1],
    ["Refuse the write on a changed hash", 1],
  ],
  "T-0006": [
    ["The schema of every status", 1],
    ["A rule a field", 1],
    ["Lint the seed's tasks", 1],
  ],
  "T-0007": [
    ["Compare the writes of the claimed tasks", 1],
    ["Refuse with the overlapping paths", 1],
  ],
  "T-0008": [
    ["The claim file under the common directory", 1],
    ["A beat every minute", 1],
    ["Release at the end of a session", 1],
    ["Take back a claim gone stale", 1],
  ],
  "T-0009": [
    ["Move the tests beside the core", 1],
    ["Run them in the project's container", 1],
    ["Remove the seed's copy", 1],
  ],
  "T-0010": [
    ["The interface of a project's part", 1],
    ["Narrow the checks to the changed files", 1],
    ["Run the heavy commands in a container each", 1],
    ["Document the interface", 0],
  ],
  "T-0011": [
    ["Add the tool and the session to an entry", 1],
    ["Show them in the Log tab", 1],
    ["Write the entries of the seed again", 0],
  ],
  "T-0012": [
    ["A ticket a check", 1],
    ["Seats a machine", 1],
    ["The bound of a check", 0],
    ["The queue's place in the UI", 0],
  ],
  "T-0013": [
    ["Read /proc for the queue's processes", 0],
    ["Measure on two machines", 0],
  ],
  "T-0014": [
    ["agentree ask writes a question", 1],
    ["agentree answer writes its answer", 0],
    ["The Questions section in the drawer", 0],
  ],
  "T-0015": [
    ["Count a parent's parts", 1],
    ["Mark the parent done with its last part", 0],
    ["A parent with a dropped part", 0],
  ],
  "T-0016": [
    ["git worktree add at the claim", 1],
    ["Relative paths in the tree's .git", 0],
    ["Remove the tree at its end", 0],
  ],
  "T-0017": [
    ["Lock at the claim", 0],
    ["Unlock at the end", 0],
  ],
  "T-0018": [
    ["git diff against the base", 0],
    ["Add the files git does not know", 0],
    ["Refuse a file out of the task's writes", 0],
  ],
  "T-0019": [
    ["merge-tree at submit", 0],
    ["merge-tree again before landing", 0],
  ],
  "T-0020": [
    ["A landing tree of its own", 0],
    ["Rebase the accepted branch in it", 0],
    ["Check again after the rebase", 0],
  ],
  "T-0021": [
    ["Install in a volume", 1],
    ["Time it cold and warm", 0],
    ["Write the numbers in the task", 0],
  ],
  "T-0023": [
    ["A Hono server on the loopback", 0],
    ["streamSSE for the board's events", 0],
    ["Reconnect from the last event", 0],
  ],
  "T-0024": [
    ["A token a machine", 0],
    ["Check Origin on every request", 0],
  ],
  "T-0025": [
    ["The tokens of both themes", 1],
    ["The Tasks page", 1],
    ["The side bar", 1],
    ["Shown to the owner", 0],
  ],
  "T-0026": [
    ["Measure the mark against its item", 1],
    ["Move it with the item", 1],
  ],
  "T-0027": [
    ["Read the compose file", 1],
    ["Check the published port", 1],
    ["Write the review", 0],
  ],
  "T-0028": [
    ["An icon a page", 0],
    ["Both themes", 0],
  ],
  "T-0029": [
    ["A column a status", 0],
    ["Cards that drag between Backlog and Ready", 0],
    ["A card dropped elsewhere goes back", 0],
  ],
};

function ago(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export function fixtureTasks(now: Date): Task[] {
  return ROWS.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    kind: row.kind,
    priority: row.priority,
    ...(row.parent ? { parent: row.parent } : {}),
    rfc: "0001",
    ...(row.holder ? { holder: { tool: row.holder[0], model: row.holder[1], since: ago(now, row.holder[2]), beat: ago(now, row.holder[3]) } } : {}),
    ...(row.holder && row.status !== "done" ? { branch: `task/${row.id}` } : {}),
    checks: { total: 0, passed: 0, failed: 0, state: "none", ...row.checks },
    questions: (row.asked ?? []).map((minutes, i) => ({
      askedAt: ago(now, minutes),
      ...(row.answered?.[i] === undefined ? {} : { answeredAt: ago(now, row.answered[i]!) }),
    })),
    subtasks: (SUBTASKS[row.id] ?? []).map(([title, done], i) => ({ id: `${row.id}-${i + 1}`, title, done: done === 1 })),
    createdAt: ago(now, row.created),
    statusSince: ago(now, row.since),
    ...(row.landed === undefined ? {} : { landedAt: ago(now, row.landed) }),
  }));
}

/** Where each breakdown's work is, so a task's paths follow its parent. */
const AREAS: Record<string, string> = {
  "T-0031": "src/seed",
  "T-0001": "src/core",
  "T-0002": "src/trees",
  "T-0003": "src/daemon",
};

/** A task whose work is outside its breakdown's area. */
const TASK_AREAS: Record<string, string> = {
  "T-0011": "src/log",
  "T-0012": "src/slots",
  "T-0014": "src/mcp",
  "T-0019": "src/landing",
  "T-0020": "src/landing",
  "T-0025": "ui/src",
  "T-0026": "ui/src",
  "T-0028": "ui/src",
  "T-0029": "ui/src",
};

/** The repository's areas and how many files each holds, as the Home page draws them. */
export const FILE_AREAS: { path: string; name: string; files: number }[] = [
  { path: "src/core", name: "Core", files: 44 },
  { path: "src/trees", name: "Trees", files: 33 },
  { path: "src/slots", name: "Slots", files: 31 },
  { path: "src/daemon", name: "Daemon", files: 40 },
  { path: "src/mcp", name: "MCP", files: 24 },
  { path: "src/landing", name: "Landing", files: 22 },
  { path: "src/log", name: "Log", files: 20 },
  { path: "src/seed", name: "Seed", files: 18 },
  { path: "ui/src", name: "UI", files: 46 },
  { path: "docs", name: "Documents", files: 27 },
];

const CONTEXTS: Record<string, string> = {
  "T-0012":
    "The daemon holds the queue of heavy runs. A ticket names the task, the worker, the command and the process; a seat gives a run its ports. A check that runs past its bound is ended and reported as such, never retried in silence.",
  "T-0014":
    "A worker that needs the owner writes a question into the task's Questions section and waits; the owner's answer is written under it, with its time, and the worker reads it through the command or MCP.",
  "T-0010":
    "The core asks a project for its checks, how a check is narrowed to a change and which commands are heavy. The part is an interface of the core, and a project implements it in agentree.config.ts.",
  "T-0025":
    "The UI's first page, on sample data, settles the tokens of the look before any other page is built. It follows the owner's pictures in structure and look, with agentree's content.",
};

const QUESTIONS: Record<string, string[]> = {
  "T-0014": ["Should an answer reopen a task that was dropped while it waited, or stay on the dropped task?"],
  "T-0020": ["Is a rebase that changes only the lock file of the task a change of the task, or does its review stand?"],
  "T-0022": ["How many trees may a machine keep before the oldest is removed?"],
};

const ANSWERS: Record<string, string[]> = {
  "T-0022": ["Eight, and never one whose task is held."],
};

const MEMORY: Record<string, string[]> = {
  "T-0001": [
    "A write refuses a file that changed since it was read; the reader reads it again.",
    "The seed's task.mjs is the reference for the front matter's order of fields.",
  ],
  "T-0002": [
    "Worktrees are made with --relative-paths, so a tree moves with its repository.",
    "merge-tree --write-tree touches no tree and exits 1 on a conflict.",
  ],
  "T-0003": ["The daemon listens on 127.0.0.1 only and asks every request for its token.", "Text an agent wrote is shown as text, never as markup."],
};

const CHECK_NAMES = [
  "typecheck",
  "lint",
  "unit: core",
  "unit: board",
  "schema of the board",
  "unit: queue",
  "e2e: claim and release",
  "e2e: submit",
  "unit: trees",
  "e2e: landing",
  "format",
  "unit: memory",
];

/** Tools whose headless runs report their use, as the RFC's table says. */
const REPORTS_USE: ReadonlySet<Tool> = new Set(["claude-code", "codex", "antigravity"]);

const UNKNOWN_USE: Partial<Record<Tool, string>> = {
  cursor: "Cursor documents no report of tokens or cost",
  "claude-desktop": "Claude Desktop reports no tokens or cost",
  person: "A person's session uses no model",
};

const LIFECYCLE: Status[] = ["backlog", "ready", "in-progress", "checking", "review", "accepted", "done"];

function seedOf(id: string): number {
  return Number(id.slice(2));
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(" ")
    .filter((w) => w.length > 3)
    .slice(0, 2)
    .join("-");
}

function hash(id: string): string {
  return ((seedOf(id) * 2654435761) >>> 0).toString(16).padStart(8, "0").slice(0, 7);
}

function doneWhen(kind: Kind): string[] {
  switch (kind) {
    case "research":
      return ["A note under docs/ answers the question, each claim with its source", "What was not verified is said plainly"];
    case "decision":
      return ["An ADR records the choice and the options weighed", "The owner accepted it"];
    case "measure":
      return ["The record holds every value measured, with the viewport and state", "What was not measured is listed with its reason"];
    case "review":
      return ["Each finding names its file and line", "The verdict is written in the Log"];
    default:
      return [
        "The checks named in the project's part pass",
        "The change has a test for each case named in Context",
        "No file outside writes and appends changed",
      ];
  }
}

function checkRuns(task: Task): CheckRun[] {
  const { total, passed, failed, state } = task.checks;
  const n = seedOf(task.id);
  return CHECK_NAMES.slice(0, total).map((name, i): CheckRun => {
    const waitedMs = ((n + i * 3) % 7) * 20_000;
    if (i < passed) return { name, result: "passed", tookMs: (8 + ((n * 7 + i * 13) % 50)) * 1000, waitedMs };
    if (i < passed + failed) return { name, result: "failed", tookMs: (20 + ((n + i) % 30)) * 1000, waitedMs };
    if (state === "running" && i === passed + failed) return { name, result: "running", waitedMs };
    return { name, result: "queued", waitedMs: waitedMs + MINUTE };
  });
}

function sessions(task: Task, now: Date): Session[] {
  if (!task.holder) return [];
  const n = seedOf(task.id);
  const { tool, model, since } = task.holder;
  const working = task.status === "in-progress" || task.status === "checking";
  const usage = (scale: number): Pick<Session, "tokens" | "costUsd" | "unknown"> =>
    REPORTS_USE.has(tool)
      ? {
          tokens: {
            input: Math.round((180_000 + n * 9_100) * scale),
            cachedInput: Math.round((1_400_000 + n * 41_000) * scale),
            output: Math.round((24_000 + n * 1_300) * scale),
            reasoning: Math.round((31_000 + n * 2_200) * scale),
          },
          costUsd: Math.round((1.8 + n * 0.21) * scale * 100) / 100,
        }
      : { unknown: UNKNOWN_USE[tool] ?? "The tool reports no use" };

  const build: Session = {
    role: "build",
    tool,
    models: n % 4 === 0 && tool !== "person" ? [model, `${model}-mini`] : [model],
    startedAt: since,
    ...(working ? {} : { endedAt: new Date(Math.min(task.statusSince.getTime(), now.getTime())) }),
    ...usage(1),
  };
  if (!["review", "accepted", "done"].includes(task.status)) return [build];

  const reviewer: Tool = tool === "codex" ? "claude-code" : "codex";
  const reviewing = task.status === "review";
  const start = new Date(task.statusSince.getTime() + (reviewing ? 0 : -20 * MINUTE));
  return [
    build,
    {
      role: "review",
      tool: reviewer,
      models: [reviewer === "codex" ? "gpt-5.6" : "opus-5.5"],
      startedAt: reviewing ? new Date(now.getTime() - 4 * MINUTE) : start,
      ...(reviewing ? {} : { endedAt: new Date(start.getTime() + 12 * MINUTE) }),
      ...(REPORTS_USE.has(reviewer)
        ? {
            tokens: { input: 64_000 + n * 800, cachedInput: 310_000, output: 6_200, reasoning: 9_800 },
            costUsd: Math.round((0.42 + n * 0.03) * 100) / 100,
          }
        : { unknown: UNKNOWN_USE[reviewer] ?? "The tool reports no use" }),
    },
  ];
}

function timeIn(task: Task, now: Date): { status: Status; ms: number }[] {
  const end = task.landedAt ?? now;
  const reached = LIFECYCLE.indexOf(task.status);
  if (reached < 0) return [{ status: task.status, ms: end.getTime() - task.statusSince.getTime() }];
  const before = LIFECYCLE.slice(0, reached);
  const spent = task.statusSince.getTime() - task.createdAt.getTime();
  const weights = before.map((status) => (status === "in-progress" ? 5 : status === "backlog" ? 3 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const rows = before.map((status, i) => ({ status, ms: Math.round((spent * (weights[i] ?? 0)) / Math.max(sum, 1)) }));
  if (task.status !== "done") rows.push({ status: task.status, ms: end.getTime() - task.statusSince.getTime() });
  return rows;
}

function fixtureLog(task: Task, now: Date): LogEntry[] {
  const entries: LogEntry[] = [{ at: task.createdAt, who: "person", text: "Created in backlog" }];
  task.questions.forEach((q, i) => {
    entries.push({ at: q.askedAt, who: task.holder?.tool ?? "person", text: `Asked the owner: ${QUESTIONS[task.id]?.[i] ?? "a question"}` });
    if (q.answeredAt) entries.push({ at: q.answeredAt, who: "person", text: "The owner answered" });
  });
  if (task.holder) {
    entries.push({ at: task.holder.since, who: task.holder.tool, text: `Claimed with ${task.holder.model}; tree made from main` });
    if (task.status !== "in-progress") {
      const submitted = task.status === "checking" ? task.statusSince : new Date(task.statusSince.getTime() - 10 * MINUTE);
      entries.push({ at: submitted, who: task.holder.tool, text: `Submitted ${task.checks.total} checks` });
    }
    if (["review", "accepted", "done"].includes(task.status)) {
      entries.push({
        at: new Date(task.statusSince.getTime() - (task.status === "review" ? 0 : 20 * MINUTE)),
        who: "daemon",
        text: "Checks passed; waiting for review",
      });
    }
    if (task.status === "accepted" || task.status === "done") {
      entries.push({
        at: new Date(task.statusSince.getTime() - (task.status === "done" ? 5 * MINUTE : 0)),
        who: "codex",
        text: "Accepted with no finding",
      });
    }
    if (task.landedAt) entries.push({ at: task.landedAt, who: "daemon", text: `Landed on main as a fast-forward` });
  }
  if (task.checks.failed > 0 && task.holder) {
    entries.push({
      at: new Date(task.holder.beat.getTime() - MINUTE),
      who: "daemon",
      text: `${task.checks.failed} check failed; back to its worker`,
    });
  }
  return entries.filter((e) => e.at <= now).sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** A card opened on the sample board; what a task lacks is said as undefined. */
export type SampleDetail = Omit<TaskDetail, "parentTitle" | "tree" | "review"> & {
  parentTitle: string | undefined;
  tree: TaskDetail["tree"] | undefined;
  review: TaskDetail["review"] | undefined;
};

export function fixtureDetail(task: Task, tasks: readonly Task[], now: Date): SampleDetail {
  const area = TASK_AREAS[task.id] ?? (task.parent ? (AREAS[task.parent] ?? "work") : "work");
  const name = slug(task.title);
  const writes =
    task.kind === "research" || task.kind === "decision"
      ? [`docs/${task.kind === "decision" ? "adr" : "notes"}/${name}.md`]
      : [`${area}/${name}.ts`, `${area}/${name}.test.ts`];
  const deps = (DEPENDS_ON[task.id] ?? []).map((id) => tasks.find((t) => t.id === id)).filter((t) => t !== undefined);
  const n = seedOf(task.id);

  return {
    parentTitle: task.parent ? PARENT_TITLES[task.parent] : undefined,
    dependsOn: deps.map((t) => ({ id: t.id, title: t.title, status: t.status })),
    writes,
    appends: task.kind === "build" || task.kind === "fix" ? ["CHANGELOG.md"] : [],
    context:
      CONTEXTS[task.id] ??
      `${task.kind[0]!.toUpperCase()}${task.kind.slice(1)} task of ${task.parent ? `"${PARENT_TITLES[task.parent]}"` : "no breakdown"}, from RFC ${task.rfc ?? "none"}. ${task.title}.`,
    doneWhen: doneWhen(task.kind),
    outOfScope: ["The UI's view of it, which is a task of T-0003", "Any change to main outside a landing"],
    questions: task.questions.map((q, i) => ({
      askedAt: q.askedAt,
      text: QUESTIONS[task.id]?.[i] ?? "A question",
      ...(q.answeredAt ? { answeredAt: q.answeredAt } : {}),
      ...(ANSWERS[task.id]?.[i] ? { answer: ANSWERS[task.id]![i]! } : {}),
    })),
    tree:
      task.branch || task.landedAt
        ? {
            path: `trees/${task.id}`,
            base: hash(task.id),
            diff: writes.map((path, i) => ({ path, added: 20 + ((n * 17 + i * 31) % 180), removed: (n * 5 + i * 7) % 40 })),
          }
        : undefined,
    checkRuns: checkRuns(task),
    review: REJECTED[task.id]
      ? {
          by: task.holder?.tool === "codex" ? "claude-code" : "codex",
          verdict: "rejected",
          findings: REJECTED[task.id]!.findings,
          at: ago(now, REJECTED[task.id]!.at),
        }
      : task.status === "review"
        ? { by: task.holder?.tool === "codex" ? "claude-code" : "codex", verdict: "pending", findings: [] }
        : task.status === "accepted" || task.status === "done"
          ? {
              by: task.holder?.tool === "codex" ? "claude-code" : "codex",
              verdict: "accepted",
              findings: n % 3 === 0 ? ["A test names its case in the title; two do not"] : [],
            }
          : undefined,
    memory: task.parent ? (MEMORY[task.parent] ?? []) : [],
    sessions: sessions(task, now),
    timeIn: timeIn(task, now),
    log: fixtureLog(task, now),
  };
}

/** The tasks the reviewer sent back to their worker, with when and why. */
const REJECTED: Record<string, { at: number; findings: string[] }> = {
  "T-0025": {
    at: 300,
    findings: ["The dark theme's tokens are not in the page's CSS", "The sidebar's icons are drawn at 18px where the design has 16px"],
  },
};

const FACTS: [Omit<Fact, "at">, number][] = [
  [
    {
      file: "reply-in-vietnamese",
      kind: "agreement",
      title: "Reply to the owner in Vietnamese",
      body: "Replies to the owner are in Vietnamese. Code, documents and commit messages are in English.",
      paths: [],
      by: "person",
      state: "in-force",
    },
    30000,
  ],
  [
    {
      file: "nothing-pushed",
      kind: "agreement",
      title: "Nothing is pushed until the owner says so",
      body: "No remote is pushed to or fetched from without the owner's word. The remote may be public.",
      paths: [],
      by: "person",
      state: "in-force",
    },
    29500,
  ],
  [
    {
      file: "latest-releases",
      kind: "agreement",
      title: "Every library and tool is on its latest release",
      body: "A dependency is added at its latest release, checked against its registry, and kept there.",
      paths: ["package.json"],
      by: "person",
      state: "in-force",
    },
    29000,
  ],
  [
    {
      file: "trees-only",
      kind: "decision",
      title: "Trees only, no shared checkout",
      body: "Every task works in a worktree of its own, made from main at its claim. ADR 0001.",
      paths: ["src/trees/"],
      task: "T-0016",
      by: "claude-code",
      state: "in-force",
    },
    1500,
  ],
  [
    {
      file: "memory-in-markdown",
      kind: "decision",
      title: "The memory is Markdown files in work/memory/",
      body: "One file a fact, reviewed in git like any change. An index made from the files is never the source. ADR 0002.",
      paths: ["work/memory/"],
      by: "claude-code",
      state: "in-force",
    },
    1480,
  ],
  [
    {
      file: "daemon-on-loopback",
      kind: "decision",
      title: "The daemon listens on 127.0.0.1 only",
      body: "The compose file publishes the daemon's port on the loopback address, and every request carries the token.",
      paths: ["src/daemon/", "compose.yaml"],
      task: "T-0027",
      by: "claude-code",
      state: "proposed",
    },
    150,
  ],
  [
    {
      file: "relative-worktrees",
      kind: "pitfall",
      title: "A tree made with absolute paths breaks when the repository moves",
      body: "Make trees with `git worktree add --relative-paths`, so a tree still finds its repository after both are moved.",
      paths: ["src/trees/"],
      task: "T-0016",
      by: "cursor",
      state: "proposed",
    },
    60,
  ],
  [
    {
      file: "claim-reads-writes",
      kind: "pitfall",
      title: "The claim reads the held tasks' writes again, never from a cache",
      body: "A claim made in another tree is missed by a cached list, and two tasks then write the same file.",
      paths: ["src/core/claim.ts"],
      task: "T-0007",
      by: "cursor",
      state: "in-force",
    },
    4600,
  ],
  [
    {
      file: "front-matter-order",
      kind: "pitfall",
      title: "A write keeps the order of the front matter's fields",
      body: "The seed's task.mjs is the reference for the order; a write that reorders the fields makes every diff noisy.",
      paths: ["src/core/task-file.ts"],
      task: "T-0004",
      by: "claude-code",
      state: "in-force",
    },
    16600,
  ],
  [
    {
      file: "one-test-file",
      kind: "how-to",
      title: "Run one test file of the core",
      body: "`pnpm vitest run src/core/claim.test.ts` runs it alone; the whole suite runs in the task's checks.",
      paths: ["src/core/"],
      task: "T-0008",
      by: "claude-code",
      state: "in-force",
    },
    95,
  ],
  [
    {
      file: "queue-processes-linux",
      kind: "how-to",
      title: "Read the queue's processes on Linux from /proc",
      body: "A run's process and its children are read from /proc/<pid>/task/*/children, with no tool to install.",
      paths: ["src/daemon/queue/"],
      task: "T-0013",
      by: "antigravity",
      state: "proposed",
    },
    5,
  ],
  [
    {
      file: "shared-checkout",
      kind: "decision",
      title: "Tasks are built in one shared checkout",
      body: "Retired by ADR 0001: every task has a tree of its own.",
      paths: ["src/trees/"],
      by: "person",
      state: "retired",
    },
    1500,
  ],
];

export function fixtureFacts(now: Date): Fact[] {
  return FACTS.map(([fact, minutes]) => ({ ...fact, at: ago(now, minutes) }));
}

export function fixtureSlots(now: Date): Slots {
  const load = Array.from({ length: 61 }, (_, i) => {
    const m = 60 - i;
    const wave = Math.sin(i / 6) * 0.08 + Math.sin(i / 2.3) * 0.03;
    const busy = m >= 7 && m <= 10 ? 0.36 : m <= 6 ? 0.2 : m >= 38 && m <= 48 ? 0.16 : 0;
    const host = Math.min(0.97, 0.48 + wave + busy);
    return { at: ago(now, m), host, vm: host * 0.55 + 0.04 };
  });
  return {
    cores: 14,
    memory: 36,
    mark: 0.8,
    free: { cpu: 1.9, memory: 9.8 },
    bounds: { lowest: 1, highest: 6, margin: 0.15, fixed: false },
    runs: [],
    queue: [],
    decisions: [
      { at: ago(now, 1), kind: "start", task: "T-0016", text: "Started in seat 2: its cost, 4 processors and 4 GB, fit in what was free" },
      { at: ago(now, 2), kind: "hold", task: "T-0013", text: "Held behind T-0015: it fits now, and would delay a run that asked first" },
      { at: ago(now, 3), kind: "hold", task: "T-0015", text: "Held: needs 3 processors, 1.9 free with the margin kept" },
      { at: ago(now, 4), kind: "start", task: "T-0012", text: "Started in seat 1, told it may start 3 workers" },
      { at: ago(now, 9), kind: "stop", text: "Stopped adding: the host went over its mark, 82% of 14 processors" },
      { at: ago(now, 24), kind: "add", text: "Added a seat: the host stayed under its mark for 5 minutes" },
      { at: ago(now, 41), kind: "mark", task: "T-0021", text: "Marked sensitive to load: failed beside T-0011's check, passed alone" },
    ],
    load,
  };
}

/** Claude Code's other sessions: id, model, minutes since its beat, what it does, started headless by 7f3a21, minutes since its start. */
const CLAUDE_FLEET: [string, string, number, string, boolean, number][] = [
  ["3b9e02", "opus-5.5", 1, "reading T-0017 before its claim", false, 320],
  ["5c1d7a", "opus-5.5", 2, "drafting the breakdown of T-0023", true, 210],
  ["61af3c", "sonnet-5.5", 1, "comparing merge-tree runs for T-0019", true, 95],
  ["8d20b6", "opus-5.5", 3, "writing a memory file on paths", false, 460],
  ["92c4e1", "sonnet-5.5", 1, "reading RFC 0001's open questions", false, 140],
  ["a07f5d", "opus-5.5", 2, "tracing T-0015's failed check", true, 60],
  ["b3e8a9", "sonnet-5.5", 44, "planning T-0024's token check", false, 900],
  ["c51d02", "opus-5.5", 1, "measuring the queue's longest wait", false, 75],
  ["d6a3f7", "sonnet-5.5", 2, "reading the seed's tests of task.mjs", false, 380],
  ["e29b40", "opus-5.5", 5, "listing files T-0018 touches", true, 40],
  ["f4c816", "sonnet-5.5", 61, "drafting icons for T-0028", false, 1200],
  ["0a7e93", "opus-5.5", 1, "searching the log for stale claims", false, 30],
  ["17bd5c", "sonnet-5.5", 3, "reviewing its own notes on slots", false, 510],
  ["2e60fa", "opus-5.5", 2, "writing the Context of T-0029", true, 120],
  ["4f91c8", "sonnet-5.5", 38, "reading the board's events", false, 700],
  ["6b35d1", "opus-5.5", 1, "summing tokens of the day", false, 15],
];

export function fixtureAgents(now: Date): { sessions: AgentSession[]; tools: ToolSetup[] } {
  const at = (m: number) => ago(now, m);
  return {
    sessions: [
      {
        id: "7f3a21",
        tool: "claude-code",
        model: "opus-5.5",
        started: "owner",
        since: at(1500),
        beat: at(1),
        state: "working",
        subagents: [
          { kind: "agentree-worker", task: "T-0012", state: "checking", since: at(1400) },
          { kind: "agentree-worker", task: "T-0027", state: "ended", since: at(1000), ended: at(150) },
          { kind: "agentree-worker", task: "T-0008", state: "ended", since: at(250), ended: at(95) },
        ],
      },
      {
        id: "c0d3e9",
        tool: "codex",
        model: "gpt-5.6",
        started: "headless",
        by: "Claude Code 7f3a21",
        since: at(140),
        beat: at(2),
        state: "reviewing",
        subagents: [
          { kind: "agentree-reviewer", task: "T-0027", state: "reviewing", since: at(140) },
          { kind: "agentree-reviewer", task: "T-0010", state: "reviewing", since: at(70) },
          { kind: "agentree-reviewer", task: "T-0011", state: "reviewing", since: at(20) },
        ],
      },
      ...CLAUDE_FLEET.map(([id, model, beat, note, by, since]) => ({
        id,
        tool: "claude-code" as const,
        model,
        started: by ? ("headless" as const) : ("owner" as const),
        ...(by ? { by: "Claude Code 7f3a21" } : {}),
        since: at(since),
        beat: at(beat),
        state: beat > 30 ? ("stale" as const) : ("working" as const),
        note,
        subagents: [],
      })),
      {
        id: "b81f04",
        tool: "codex",
        model: "gpt-5.6",
        started: "owner",
        since: at(2200),
        beat: at(52),
        state: "stale",
        task: "T-0015",
        subagents: [],
      },
      {
        id: "e4aa90",
        tool: "cursor",
        model: "gpt-5.6",
        started: "owner",
        since: at(80),
        beat: at(1),
        state: "working",
        task: "T-0016",
        subagents: [],
      },
      {
        id: "e4ab17",
        tool: "cursor",
        model: "opus-5.5",
        started: "owner",
        since: at(1700),
        beat: at(1),
        state: "working",
        task: "T-0025",
        subagents: [],
      },
      {
        id: "d2c6f8",
        tool: "claude-desktop",
        model: "opus-5.5",
        started: "owner",
        since: at(2000),
        beat: at(4),
        state: "asking",
        task: "T-0014",
        subagents: [],
      },
      {
        id: "a9e1c3",
        tool: "antigravity",
        model: "gemini-4",
        started: "headless",
        by: "Claude Code 7f3a21",
        since: at(900),
        beat: at(3),
        state: "checking",
        task: "T-0013",
        subagents: [],
      },
      {
        id: "f61b2d",
        tool: "cursor",
        model: "sonnet-5.5",
        started: "owner",
        since: at(9000),
        beat: at(4600),
        ended: at(4600),
        state: "ended",
        task: "T-0007",
        subagents: [],
      },
    ],
    tools: [
      {
        tool: "claude-code",
        hooks: ["SubagentStart", "SubagentStop", "statusLine"],
        mcp: true,
        definitions: true,
        reportsUse: "full",
        reviewsOwn: false,
      },
      { tool: "codex", hooks: ["SubagentStart", "SubagentStop"], mcp: true, definitions: true, reportsUse: "full", reviewsOwn: false },
      { tool: "cursor", hooks: ["subagentStart", "subagentStop"], mcp: true, definitions: true, reportsUse: "model only", reviewsOwn: false },
      { tool: "claude-desktop", hooks: [], mcp: true, definitions: false, reportsUse: "none", reviewsOwn: false },
      { tool: "antigravity", hooks: ["PreInvocation", "PostInvocation"], mcp: true, definitions: true, reportsUse: "full", reviewsOwn: true },
    ],
  };
}

export const DOCS: Doc[] = [
  {
    id: "rfc-0001",
    kind: "RFC",
    number: "0001",
    title: "agentree",
    status: "draft",
    date: "2026-11-23",
    path: "rfcs/0001-agentree/README.md",
    sections: [
      {
        h: "Summary",
        body: [
          "A board of tasks in the repository, read and written by any coding agent through one command and one MCP server, with a worktree for each task and a daemon that holds the queue of the machine.",
        ],
      },
      {
        h: "The life of a task",
        body: ["backlog → ready → in-progress → checking → review → accepted → done.", "`done` means its change is on `main`."],
      },
      {
        h: "A worktree a task, and what git is used for",
        body: [
          "A worktree is made from `main` at the claim and locked until its end.",
          "`git merge-tree --write-tree` finds a conflict before landing, and touches no tree.",
        ],
      },
      {
        h: "The memory of a project",
        body: ["One Markdown file a fact in `work/memory/`, with its kind, the paths it is about, and the task it came from."],
      },
      {
        h: "Following the machine's load",
        body: ["A heavy run starts when its cost fits in what is free, with a margin kept free; the number of slots is what fits."],
      },
    ],
  },
  {
    id: "rfc-0002",
    kind: "RFC",
    number: "0002",
    title: "The daemon's events and the UI's live board",
    status: "draft",
    date: "2026-11-21",
    path: "rfcs/0002-live-board/README.md",
    sections: [
      { h: "Summary", body: ["The daemon keeps the parsed board in memory and sends each change to the browser as a server-sent event."] },
      { h: "Questions for the owner", body: ["Is a write by the UI shown before the event of it comes back, or only after?"] },
    ],
  },
  {
    id: "adr-0000",
    kind: "ADR",
    number: "0000",
    title: "One shared checkout for every worker",
    status: "superseded",
    date: "2026-11-08",
    path: "docs/adr/0000-shared-checkout.md",
    supersededBy: "adr-0001",
    sections: [
      { h: "Decision", body: ["Workers share the main checkout and declare the paths they write."] },
      { h: "Superseded", body: ["By ADR 0001: a declared path does not foresee what a change touches."] },
    ],
  },
  {
    id: "adr-0001",
    kind: "ADR",
    number: "0001",
    title: "Trees only, no shared checkout",
    status: "accepted",
    date: "2026-11-22",
    path: "docs/adr/0001-trees-only.md",
    supersedes: "adr-0000",
    sections: [
      { h: "Context", body: ["The origin's board, without trees, has 187 of 553 submitted tasks submitted more than once."] },
      { h: "Decision", body: ["Every task works in a worktree of its own, made from `main` at its claim. There is no shared checkout to work in."] },
      { h: "Consequences", body: ["Each tree has an install of its own.", "The lander rebases a stale branch in a landing tree of its own."] },
    ],
  },
  {
    id: "adr-0002",
    kind: "ADR",
    number: "0002",
    title: "The memory in Markdown",
    status: "accepted",
    date: "2026-11-22",
    path: "docs/adr/0002-memory-in-markdown.md",
    sections: [
      { h: "Context", body: ["A tool's own memory is read by that tool alone."] },
      { h: "Decision", body: ["The memory is plain Markdown files and a search of their text. An index made from them is never the source."] },
    ],
  },
];
