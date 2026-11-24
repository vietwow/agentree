/**
 * The daemon's HTTP: everything the UI's pages read, each change the owner
 * makes there, and the stream of events. It holds no rule: a read is a view
 * of the core, a write one call of it. It answers only its own origin, and
 * only a request that carries the machine's token.
 */
import { Hono, type Context as Request } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { answer, create, move, promote, release, tick, type Actor, type Context, type NewTask } from "../core/board/actions.ts";
import { acceptFact, editFact, readMemory, remember, type NewFact } from "../core/board/memory.ts";
import { readOptions, setReviewOwnTasks } from "../core/board/options.ts";
import { readBoard, taskOf } from "../core/board/store.ts";
import { Refusal } from "../core/errors.ts";
import { editProject, placesOfProject, projectOf, projects } from "../core/machine/projects.ts";
import type { Bounds } from "../core/machine/queue.ts";
import type { Tool } from "../core/task/model.ts";
import { documentsView } from "../core/views/documents.ts";
import { agentsView, milestonesView, projectView } from "../core/views/project.ts";
import { activityView, taskDetailView, taskView } from "../core/views/tasks.ts";
import type { Queue } from "./queue.ts";

/** What changed, for the browser to read again: a project's board, or the machine's queue. */
export type Change = { project?: string; what: "board" | "slots" | "projects" };

export type Events = { emit: (change: Change) => void; listen: (listener: (change: Change) => void) => () => void };

export function createEvents(): Events {
  const listeners = new Set<(change: Change) => void>();
  return {
    emit: (change) => listeners.forEach((listener) => listener(change)),
    listen: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

const COOKIE = "agentree";
/** The UI is the owner's: a change made there is made as the owner. */
const OWNER: Actor = { worker: "person/owner", session: "", owner: true };

export type Daemon = { token: string; queue: Queue; events: Events; now: () => Date; origins: string[] };

export function createApp(daemon: Daemon) {
  const app = new Hono();
  const contextOf = (request: Request): Context => ({ places: placesOfProject(request.req.param("project")!), now: daemon.now });
  const changed = (request: Request, what: Change["what"] = "board") => daemon.events.emit({ project: request.req.param("project")!, what });

  app.onError((error, request) => {
    if (error instanceof Refusal) return request.json({ error: error.message }, 409);
    if (error instanceof SyntaxError) return request.json({ error: "the request's body is not JSON" }, 400);
    console.error(error);
    return request.json({ error: "the daemon failed; its log says how" }, 500);
  });

  app.use("*", async (request, next) => {
    const origin = request.req.header("origin");
    if (origin !== undefined && !daemon.origins.includes(origin)) return request.json({ error: "this origin is not the daemon's own" }, 403);
    const host = request.req.header("host") ?? "";
    if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host))
      return request.json({ error: "the daemon answers on the loopback address only" }, 403);
    const given = request.req.query("token");
    if (given === daemon.token && request.req.method === "GET" && !request.req.path.startsWith("/api/")) {
      setCookie(request, COOKIE, daemon.token, { httpOnly: true, sameSite: "Strict", path: "/" });
      return request.redirect(request.req.path);
    }
    const bearer = request.req.header("authorization")?.replace(/^Bearer /, "");
    if (request.req.path.startsWith("/api/") && getCookie(request, COOKIE) !== daemon.token && bearer !== daemon.token)
      return request.json({ error: "this request carries no token of the daemon; open the address `agentree serve` printed" }, 401);
    return next();
  });

  // What the pages read.
  app.get("/api/projects", (request) =>
    request.json(projects().map((project) => projectView(project, readBoard(placesOfProject(project.id)), daemon.now()))),
  );
  app.get("/api/projects/:project/board", (request) => {
    const board = readBoard(contextOf(request).places);
    return request.json({
      now: daemon.now().toISOString(),
      project: projectView(projectOf(request.req.param("project")), board, daemon.now()),
      tasks: board.tasks.map((stored) => taskView(board.places, stored.task)),
      activity: activityView(board),
      milestones: milestonesView(board),
      unreadable: board.unreadable,
    });
  });
  app.get("/api/projects/:project/tasks/:task", (request) => {
    const board = readBoard(contextOf(request).places);
    return request.json(taskDetailView(board, taskOf(board, request.req.param("task")).task, daemon.now()));
  });
  app.get("/api/projects/:project/memory", (request) => request.json(readMemory(contextOf(request).places).facts));
  app.get("/api/projects/:project/documents", (request) => request.json(documentsView(contextOf(request).places)));
  app.get("/api/projects/:project/agents", (request) => {
    const { places } = contextOf(request);
    return request.json({ sessions: agentsView(places, daemon.now()), options: readOptions(places) });
  });
  app.get("/api/slots", (request) => request.json(daemon.queue.view()));

  app.get("/api/events", (request) =>
    streamSSE(request, async (stream) => {
      let open = true;
      const stop = daemon.events.listen((change) => void stream.writeSSE({ event: "change", data: JSON.stringify(change) }));
      stream.onAbort(() => {
        open = false;
        stop();
      });
      await stream.writeSSE({ event: "hello", data: "{}" });
      while (open) await stream.sleep(15_000).then(() => stream.writeSSE({ event: "beat", data: "{}" }));
    }),
  );

  // What the owner changes.
  app.post("/api/projects/:project/tasks", async (request) => {
    const task = create(contextOf(request), OWNER, (await request.req.json()) as NewTask);
    changed(request);
    return request.json({ id: task.fields.id }, 201);
  });
  app.post("/api/projects/:project/tasks/:task/:action", async (request) => {
    const context = contextOf(request);
    const id = request.req.param("task");
    const body = (await request.req.json().catch(() => ({}))) as Record<string, unknown>;
    const actions: Record<string, () => unknown> = {
      move: () => move(context, OWNER, id, body.to as "backlog" | "ready" | "dropped", String(body.why ?? "")),
      tick: () => tick(context, OWNER, id, Number(body.subtask), body.done !== false),
      answer: () => answer(context, OWNER, id, String(body.text ?? ""), body.question === undefined ? undefined : Number(body.question)),
      release: () => release(context, OWNER, id, String(body.why ?? ""), { blocked: body.blocked === true }),
    };
    const action = actions[request.req.param("action")];
    if (!action) return request.json({ error: `"${request.req.param("action")}" is nothing the owner does to a task here` }, 404);
    action();
    changed(request);
    return request.json({ ok: true });
  });
  app.post("/api/projects/:project/promote", (request) => {
    const moved = promote(contextOf(request), OWNER);
    changed(request);
    return request.json({ moved });
  });
  app.post("/api/projects/:project/memory", async (request) => {
    const fact = remember(contextOf(request), OWNER, (await request.req.json()) as NewFact);
    changed(request);
    return request.json(fact, 201);
  });
  app.post("/api/projects/:project/memory/:fact", async (request) => {
    const body = (await request.req.json()) as { accept?: boolean; retire?: boolean; title?: string; body?: string; paths?: string[] };
    const { accept: accepted, ...change } = body;
    const fact = accepted
      ? acceptFact(contextOf(request), OWNER, request.req.param("fact"))
      : editFact(contextOf(request), OWNER, request.req.param("fact"), change);
    changed(request);
    return request.json(fact);
  });
  app.post("/api/projects/:project/options", async (request) => {
    const body = (await request.req.json()) as { tool: Tool; reviewOwnTasks: boolean };
    setReviewOwnTasks(contextOf(request).places, body.tool, body.reviewOwnTasks === true);
    changed(request);
    return request.json(readOptions(contextOf(request).places));
  });
  app.post("/api/projects/:project", async (request) => {
    const body = (await request.req.json()) as { name?: string; desc?: string; hold?: boolean };
    const project = editProject(request.req.param("project"), {
      ...(body.name ? { name: body.name } : {}),
      ...(body.desc === undefined ? {} : { desc: body.desc }),
      ...(body.hold === undefined ? {} : { hold: body.hold }),
    });
    daemon.events.emit({ project: project.id, what: "projects" });
    return request.json(project);
  });
  app.post("/api/slots/bounds", async (request) => {
    daemon.queue.setBounds((await request.req.json()) as Partial<Bounds>);
    return request.json(daemon.queue.view().bounds);
  });

  app.all("/api/*", (request) => request.json({ error: "the daemon has no such address" }, 404));
  return app;
}
