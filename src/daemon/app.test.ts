import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claim, type Context } from "../core/board/actions.ts";
import { ask, log } from "../core/board/actions.ts";
import { check, commit, submit } from "../core/board/lifecycle.ts";
import { CODEX, project, type Project } from "../core/board/testing.ts";
import { register } from "../core/machine/projects.ts";
import { createApp, createEvents, type Change } from "./app.ts";
import { createQueue } from "./queue.ts";

const TOKEN = "t0ken";
const ORIGIN = "http://127.0.0.1:4517";

let at: Project;
let context: Context;
let app: ReturnType<typeof createApp>;
let changes: Change[];

beforeEach(() => {
  at = project();
  ({ context } = at);
  process.env.AGENTREE_HOME = join(at.home, "machine");
  register(context.places.root, context.now(), { desc: "A project." });
  const events = createEvents();
  changes = [];
  events.listen((change) => changes.push(change));
  app = createApp({ token: TOKEN, queue: createQueue({ home: process.env.AGENTREE_HOME }), events, now: context.now, origins: [ORIGIN] });
});

afterEach(() => at.remove());

const headers = { host: "127.0.0.1:4517", authorization: `Bearer ${TOKEN}`, origin: ORIGIN };
const get = async (path: string) => (await app.request(path, { headers })).json() as Promise<any>;
const post = (path: string, body: unknown = {}) =>
  app.request(path, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(body) });
const NEW = {
  title: "The core",
  kind: "build",
  priority: 2,
  writes: ["src/"],
  checks: ["true"],
  context: "Why.",
  doneWhen: "- Done.",
  outOfScope: "Rest.",
  subtasks: ["Parse"],
};

test("a request without the token, from another origin, or by another host's name is refused", async () => {
  assert.equal((await app.request("/api/projects", { headers: { host: "127.0.0.1:4517" } })).status, 401);
  assert.equal((await app.request("/api/projects", { headers: { ...headers, origin: "https://elsewhere.example" } })).status, 403);
  assert.equal((await app.request("/api/projects", { headers: { ...headers, host: "elsewhere.example" } })).status, 403);
  assert.equal((await app.request("/api/projects", { headers })).status, 200);
});

test("the address the daemon prints sets the token as a cookie the browser keeps for the daemon's address", async () => {
  const opened = await app.request(`/?token=${TOKEN}`, { headers: { host: "127.0.0.1:4517" } });
  assert.equal(opened.status, 302);
  assert.match(opened.headers.get("set-cookie")!, /^agentree=t0ken; Path=\/; HttpOnly; SameSite=Lax$/);
  assert.equal((await app.request("/api/projects", { headers: { host: "127.0.0.1:4517", cookie: "agentree=t0ken" } })).status, 200);
});

test("the owner's changes are calls of the core, each told to the browser, and the pages read what they made", async () => {
  assert.deepEqual((await (await post("/api/projects/project/tasks", NEW)).json()) as unknown, { id: "T-0001" });
  claim(context, CODEX, "T-0001");
  ask(context, CODEX, "T-0001", "Which port?");
  assert.equal((await post("/api/projects/project/tasks/T-0001/answer", { text: "4517." })).status, 200);
  assert.equal((await post("/api/projects/project/tasks/T-0001/tick", { subtask: 1 })).status, 200);
  const refused = await post("/api/projects/project/tasks/T-0001/move", { to: "backlog" });
  assert.deepEqual([refused.status, ((await refused.json()) as { error: string }).error.slice(0, 22)], [409, "T-0001 is in-progress:"]);
  assert.deepEqual(
    changes,
    Array.from({ length: 3 }, () => ({ project: "project", what: "board" })),
  );

  const board = await get("/api/projects/project/board");
  assert.deepEqual([board.project.status, board.project.total, board.tasks.length], ["active", 1, 1]);
  assert.deepEqual([board.tasks[0].holder.tool, board.tasks[0].subtasks[0].done, board.tasks[0].questions.length], ["codex", true, 1]);
  assert.equal(board.activity[0].text, "The owner answered: 4517.");
  const detail = await get("/api/projects/project/tasks/T-0001");
  assert.deepEqual([detail.doneWhen, detail.questions[0].answer, detail.tree.diff], [["Done."], "4517.", []]);
  assert.deepEqual(
    (await get("/api/projects")).map((each: { id: string; desc: string }) => [each.id, each.desc]),
    [["project", "A project."]],
  );
  assert.equal((await app.request("/api/projects/none/board", { headers })).status, 409);
  assert.equal((await app.request("/api/nothing", { headers })).status, 404);
});

test("the memory, the options and the slots' bounds are read and changed the same way", async () => {
  const fact = (await (await post("/api/projects/project/memory", { kind: "agreement", title: "Reply in Vietnamese", body: "Always." })).json()) as {
    file: string;
    state: string;
  };
  assert.deepEqual([fact.file, fact.state], ["reply-in-vietnamese", "in-force"]);
  await post("/api/projects/project/memory/reply-in-vietnamese", { retire: true });
  assert.equal((await get("/api/projects/project/memory"))[0].state, "retired");
  assert.equal(
    ((await (await post("/api/projects/project/options", { tool: "codex", reviewOwnTasks: true })).json()) as any).reviewOwnTasks.codex,
    true,
  );
  assert.equal((await get("/api/projects/project/agents")).options.reviewOwnTasks.codex, true);
  assert.equal(((await (await post("/api/slots/bounds", { highest: 3 })).json()) as { highest: number }).highest, 3);
  assert.equal((await post("/api/slots/bounds", { highest: 0 })).status, 409);
  assert.deepEqual((await get("/api/slots")).runs, []);
  assert.deepEqual(await get("/api/projects/project/documents"), []);
});

test("the board's tools are served as MCP at a project's address: a session claims, logs and is refused in the board's words", async () => {
  await post("/api/projects/project/tasks", NEW);
  const call = async (method: string, params: unknown) => {
    const response = await app.request("/mcp/project", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const sent = (await response.text()).split("\n").find((line) => line.startsWith("data: "))!;
    return (JSON.parse(sent.slice(6)) as { result: any }).result;
  };
  const tool = (name: string, args: Record<string, unknown>) =>
    call("tools/call", { name, arguments: { worker: "codex/gpt-5", session: "s-1", ...args } });
  const listed = (await call("tools/list", {})).tools.map((each: { name: string }) => each.name);
  assert.deepEqual(listed.slice(0, 6), ["board", "next", "show", "load", "recall", "claim"]);
  assert.ok(!listed.includes("answer") && !listed.includes("move"), "what is the owner's alone has no tool");
  assert.match(
    (await tool("claim", { task: "T-0001" })).content[0].text,
    /^T-0001 is yours\. Its tree: .+\/project-trees\/T-0001 \(branch task\/T-0001\)/,
  );
  assert.equal((await tool("log", { task: "T-0001", entry: "Did: nothing yet." })).content[0].text, "The entry is in its Log.");
  const refused = await call("tools/call", {
    name: "log",
    arguments: { worker: "cursor/composer-2", session: "s-2", task: "T-0001", entry: "Mine." },
  });
  assert.deepEqual(
    [refused.isError, refused.content[0].text],
    [true, "Refused: T-0001 is not held by cursor/composer-2: it is in-progress, held by codex/gpt-5"],
  );
  const noClone = await tool("part", { part: "shell", priority: 2 });
  assert.deepEqual([noClone.isError, /has no "clone"/.test(noClone.content[0].text)], [true, true]);
  writeFileSync(
    join(context.places.root, "agentree.config.json"),
    JSON.stringify({ clone: { records: "parity", url: "http://127.0.0.1:1", colours: "own", font: "own", parts: {} } }),
  );
  assert.equal(
    (await tool("part", { part: "shell", priority: 2 })).content[0].text,
    "T-0002 measures the shell and is ready; T-0003 builds it once that is done.",
  );
  const reading = {
    task: "T-0001",
    part: "shell",
    source: "https://app.example.com/",
    viewport: "1440x900",
    elements: JSON.stringify([{ id: "shell", tag: "div", role: "", name: "", text: "", style: {}, attrs: {} }]),
  };
  assert.equal((await tool("record", reading)).content[0].text, "shell, base: 1 elements recorded.");
  assert.ok(existsSync(join(context.places.trees, "T-0001/parity/shell/base.json")));
  assert.match((await tool("record", { ...reading, task: "T-0002" })).content[0].text, /^Refused: T-0002 is not held by this session/);
  assert.match((await tool("run", { task: "T-0001", command: "pwd" })).content[0].text, /^The command passed\.\n\n.+\/project-trees\/T-0001$/);
  assert.equal((await app.request("/mcp/project", { method: "POST", headers: { host: "127.0.0.1:4517" } })).status, 401);
  assert.deepEqual(
    (await get("/api/projects/project/agents")).sessions.map((session: { id: string; task?: string }) => [session.id, session.task]),
    [
      ["s-1", "T-0001"],
      ["s-2", undefined],
    ],
  );
});

test("a reading carried out of the page is written as a record in the tree of the task that measures, and nowhere else", async () => {
  const reading = {
    part: "shell",
    state: "base",
    source: "https://app.example.com/home?session=abc",
    viewport: { width: 1440, height: 900 },
    theme: "light",
    elements: [{ id: "shell", tag: "div", role: "", name: "", text: "", style: { display: "flex" }, attrs: {} }],
  };
  await post("/api/projects/project/tasks", NEW);
  const { claim: held } = claim(context, CODEX, "T-0001");
  assert.match(
    ((await (await post("/api/projects/project/records", { ...reading, task: "T-0001" })).json()) as { error: string }).error,
    /has no "clone"/,
  );
  writeFileSync(
    join(context.places.root, "agentree.config.json"),
    JSON.stringify({ clone: { records: "parity", url: "http://127.0.0.1:5173", colours: "own", font: "own", parts: {} } }),
  );
  const written = await post("/api/projects/project/records", { ...reading, task: "T-0001" });
  assert.deepEqual([written.status, await written.json()], [201, { part: "shell", state: "base", elements: 1 }]);
  const record = JSON.parse(readFileSync(join(held.tree, "parity/shell/base.json"), "utf8")) as { source: string };
  assert.equal(record.source, "https://app.example.com/home", "the address is kept without its query string");
  assert.equal(existsSync(join(context.places.root, "parity")), false);
  assert.equal((await post("/api/projects/project/records", { ...reading, task: "T-0001" })).status, 409, "a record is written once");
  for (const task of [undefined, "T-0009", "../project"])
    assert.equal((await post("/api/projects/project/records", { ...reading, state: "other", task })).status, 409);
});

test("a browser's extension is let through for a record alone, and only with the token in its request", async () => {
  const from = (path: string, token: string | undefined, method = "POST") =>
    app.request(path, {
      method,
      headers: {
        host: "127.0.0.1:4517",
        origin: "chrome-extension://abcdefghijklmnop",
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
  assert.equal(
    (await from("/api/projects/project/records", TOKEN)).status,
    409,
    "it reaches the route, which refuses a project that reproduces no interface",
  );
  assert.equal((await from("/api/projects/project/records", "another")).status, 403);
  assert.equal((await from("/api/projects/project/records", undefined)).status, 403);
  assert.equal((await from("/api/projects/project/tasks", TOKEN)).status, 403);
  assert.equal((await from("/api/projects/project/board", TOKEN, "GET")).status, 403);
});

test("the owner reads the diff of a task in review, comments its lines, and rejects it with them as findings", async () => {
  await post("/api/projects/project/tasks", NEW);
  const { claim: held } = claim(context, CODEX, "T-0001");
  mkdirSync(join(held.tree, "src"), { recursive: true });
  writeFileSync(join(held.tree, "src/a.ts"), "export const a = 1;\n");
  commit(context, CODEX, "T-0001", "The change");
  log(context, CODEX, "T-0001", "Did: it.");
  assert.equal(
    (await app.request("/api/projects/project/tasks/T-0001/diff", { headers })).status,
    409,
    "a task that is not in review has no diff to read here",
  );
  submit(context, CODEX, "T-0001");
  check(context, "T-0001");
  assert.equal(
    (await post("/api/projects/project/tasks/T-0001/comment", { file: "src/a.ts", line: 1, text: "Name it for what it is." })).status,
    200,
  );
  assert.equal((await post("/api/projects/project/tasks/T-0001/comment", { file: "src/a.ts", line: 7, text: "No such line." })).status, 409);
  const read = await get("/api/projects/project/tasks/T-0001/diff");
  assert.deepEqual(
    [read.files.map((file: { path: string }) => file.path), read.comments.map((each: { line: number; by: string }) => [each.line, each.by])],
    [["src/a.ts"], [[1, "person/owner"]]],
  );
  assert.equal((await post("/api/projects/project/tasks/T-0001/reject", {})).status, 200);
  const detail = await get("/api/projects/project/tasks/T-0001");
  assert.equal(detail.status ?? (await get("/api/projects/project/board")).tasks[0].status, "ready");
});
