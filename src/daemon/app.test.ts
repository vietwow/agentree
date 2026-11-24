import assert from "node:assert/strict";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { claim, type Context } from "../core/board/actions.ts";
import { ask } from "../core/board/actions.ts";
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
