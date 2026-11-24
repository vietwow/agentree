/**
 * The core as MCP tools, for a session whose sandbox or tool keeps it from
 * running the command or from writing where the board is. Each tool is one
 * call of the core as the worker the session names; what is the owner's
 * alone (an answer, a move by hand, an option) has no tool.
 */
import { fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { ask, beat, claim, create, isStale, log, release, tick, type Actor, type Context } from "../core/board/actions.ts";
import { accept, commit, land, reject, review, scope, submit, waitingToLand } from "../core/board/lifecycle.ts";
import { acceptFact, FACT_KINDS, factsFor, recall, remember, type Fact, type FactKind } from "../core/board/memory.ts";
import { obstacles } from "../core/board/rules.ts";
import { reportSession } from "../core/board/sessions.ts";
import { claimOf, claims } from "../core/board/state.ts";
import { readBoard, taskOf } from "../core/board/store.ts";
import { Refusal } from "../core/errors.ts";
import { renderTask } from "../core/task/file.ts";
import { KINDS, NEEDS, stamp, STATUSES, type Kind, type Need } from "../core/task/model.ts";

/** What the tools need of where they run: the project's board, and the two things only the daemon does. */
export type Board = {
  context: Context;
  /** Runs a command of the project in a directory through the machine's queue, and gives back what it said. */
  run: (command: string, cwd: string, task: string, by: string) => Promise<{ result: string; waitedMs: number; output: string }>;
  /** The machine's load in the words of `agentree load`. */
  load: () => Promise<string>;
};

type Json = Record<string, unknown>;
type Shape = Record<string, Json>;

const text = (description: string): Json => ({ type: "string", description });
const list = (description: string): Json => ({ type: "array", items: { type: "string" }, description });
const TASK = text("The task's id, as T-0042.");
const WHO: Shape = {
  worker: text("Who you are: <tool>/<model>, as claude-code/opus-5.5 or codex/gpt-5.6. Never a person's name."),
  session: text("Your session's id as your tool gives it; the same in every call."),
};

const fact = (each: Fact) =>
  `- [${each.kind}] ${each.title} (${each.file}${each.paths.length ? `; ${each.paths.join(", ")}` : ""})\n  ${each.body.replaceAll("\n", "\n  ")}`;

/** A server with the board's tools, for one project. */
export function boardServer(board: Board): McpServer {
  const server = new McpServer({ name: "agentree", version: "0.1.0" });
  const { context } = board;
  const { places } = context;
  const all = () => readBoard(places);

  /** Registers a tool whose arguments are strings and lists of strings; a refusal of the board is the tool's answer, marked as an error. */
  const tool = (
    name: string,
    description: string,
    properties: Shape,
    required: string[],
    run: (args: Record<string, any>, actor: Actor) => string | Promise<string>,
  ) =>
    server.registerTool(
      name,
      { description, inputSchema: fromJsonSchema<Record<string, unknown>>({ type: "object", properties, required, additionalProperties: false }) },
      async (args) => {
        try {
          const actor: Actor = { worker: String(args.worker ?? ""), session: String(args.session ?? ""), owner: false };
          if (actor.session) reportSession(places, { id: actor.session, worker: actor.worker }, stamp(context.now()));
          return { content: [{ type: "text", text: await run(args, actor) }] };
        } catch (error) {
          if (!(error instanceof Refusal)) throw error;
          return { content: [{ type: "text", text: `Refused: ${error.message}` }], isError: true };
        }
      },
    );
  const acting = (more: Shape, required: string[]): [Shape, string[]] => [{ ...WHO, ...more }, ["worker", "session", ...required]];

  tool("board", "Every task by status, with who holds it.", {}, [], () => {
    const held = claims(places);
    return STATUSES.flatMap((status) => {
      const tasks = all()
        .tasks.map((stored) => stored.task)
        .filter((task) => task.fields.status === status);
      return tasks.length
        ? [
            `${status} (${tasks.length})`,
            ...tasks.map(
              (task) =>
                `  ${task.fields.id} P${task.fields.priority} ${task.fields.title}${held.get(task.fields.id) ? ` [held by ${held.get(task.fields.id)!.by}${isStale(held.get(task.fields.id)!, context.now()) ? ", stale" : ""}]` : ""}`,
            ),
          ]
        : [];
    }).join("\n");
  });
  tool("next", "The ready tasks, first priority first, each with what keeps it from being claimed now.", {}, [], () => {
    const tasks = all().tasks.map((stored) => stored.task);
    const ready = tasks
      .filter((task) => task.fields.status === "ready")
      .sort((a, b) => a.fields.priority - b.fields.priority || a.fields.id.localeCompare(b.fields.id));
    return ready.length
      ? ready
          .map((task) =>
            [`${task.fields.id} P${task.fields.priority} ${task.fields.title}`, ...obstacles(tasks, task).map((why) => `  not now: ${why}`)].join(
              "\n",
            ),
          )
          .join("\n")
      : "No task is ready.";
  });
  tool(
    "show",
    "A task as its file holds it: its fields, Context, Done when, Out of scope, subtasks, questions and Log.",
    { task: TASK },
    ["task"],
    (args) => renderTask(taskOf(all(), args.task).task),
  );
  tool("load", "The machine's load, its heavy runs, and how many more workers to start now. Ask before starting a worker.", {}, [], () =>
    board.load(),
  );
  tool(
    "recall",
    "The facts of the project's memory that hold every word given.",
    { words: list("The words to look for.") },
    ["words"],
    (args) => recall(places, args.words).map(fact).join("\n") || "The memory holds no such fact.",
  );

  tool(
    "claim",
    "Take a ready task. Answers with its tree (work only there, on its branch, under its paths), the task, and the facts of memory that bind it.",
    ...acting({ task: TASK, ownerTold: { type: "boolean", description: "The owner told you to take a task that needs the owner." } }, ["task"]),
    (args, actor) => {
      const { task, claim: hold } = claim(context, actor, args.task, { ownerTold: args.ownerTold === true });
      const facts = factsFor(places, task);
      return [
        `${task.fields.id} is yours. Its tree: ${hold.tree} (branch ${hold.branch}). Change files only there, under its "writes" and "appends".`,
        "",
        renderTask(task),
        ...(facts.length ? ["## What the project remembers for it", "", ...facts.map(fact)] : []),
      ].join("\n");
    },
  );
  tool(
    "beat",
    "Say you are still there, for the task you hold or review.",
    ...acting({ task: TASK }, ["task"]),
    (args, actor) => `beat at ${beat(context, actor, args.task)}`,
  );
  tool(
    "log",
    "Add an entry to the Log of the task you hold: Did, Checks, Left, Found, Files, Not verified.",
    ...acting({ task: TASK, entry: text("The entry, in Markdown.") }, ["task", "entry"]),
    (args, actor) => {
      log(context, actor, args.task, args.entry);
      return "The entry is in its Log.";
    },
  );
  tool(
    "ask",
    "Ask the owner a question on the card of the task you hold; the task stays yours. Read the answer with `answers`.",
    ...acting({ task: TASK, question: text("The question."), choices: list("The answers to choose from, if any.") }, ["task", "question"]),
    (args, actor) => {
      ask(context, actor, args.task, args.question, args.choices ?? []);
      return "The question waits for the owner on the task's card.";
    },
  );
  tool("answers", "The questions of a task, each with the owner's answer once it is given.", { task: TASK }, ["task"], (args) => {
    const { questions } = taskOf(all(), args.task).task;
    return (
      questions
        .map((q, index) => `${index + 1}. ${q.text}\n   ${q.answeredAt ? `Answered ${q.answeredAt}: ${q.answer}` : "No answer yet."}`)
        .join("\n") || "The task has no question."
    );
  });
  tool(
    "tick",
    "Mark a subtask of the task you hold done, or not done.",
    ...acting(
      { task: TASK, subtask: { type: "integer", description: "Its number, from 1." }, done: { type: "boolean", description: "False to unmark it." } },
      ["task", "subtask"],
    ),
    (args, actor) => {
      const task = tick(context, actor, args.task, Number(args.subtask), args.done !== false);
      return `${task.subtasks.filter((sub) => sub.done).length} of ${task.subtasks.length} subtasks done.`;
    },
  );
  tool("scope", "The files the task's tree changed, by whose they are.", { task: TASK }, ["task"], (args) => {
    const { mine, others } = scope(context, args.task);
    return [
      `Under its paths: ${mine.join(", ") || "none"}`,
      ...(others.length ? [`Outside its "writes" and "appends": ${others.join(", ")}`] : []),
    ].join("\n");
  });
  tool(
    "commit",
    "Commit what the tree of the task you hold holds, on its branch. For a session that cannot run git there.",
    ...acting({ task: TASK, message: text("The commit's message.") }, ["task", "message"]),
    (args, actor) => `Committed as ${commit(context, actor, args.task, args.message).slice(0, 12)}.`,
  );
  tool(
    "run",
    "Run a command of the project in the tree of the task you hold, as a check runs: a heavy one waits for its turn. Answers with what it said.",
    ...acting({ task: TASK, command: text("The command, as the shell reads it.") }, ["task", "command"]),
    async (args, actor) => {
      const hold = claimOf(places, args.task);
      if (!hold || hold.by !== actor.worker || hold.session !== actor.session) throw new Refusal(`${args.task} is not held by ${actor.worker}`);
      const ran = await board.run(args.command, hold.tree, args.task, actor.worker);
      return [
        `The command ${ran.result === "passed" ? "passed" : ran.result === "failed" ? "failed" : "ran into its bound and was ended"}${ran.waitedMs ? `, after ${Math.round(ran.waitedMs / 1000)} s of waiting for its turn` : ""}.`,
        ran.output,
      ]
        .filter(Boolean)
        .join("\n\n");
    },
  );
  tool(
    "submit",
    "Submit the task you hold: its Log entry, a clean tree, the scope check; its checks then run in the daemon's queue, and it goes to review when they pass. Take your next task meanwhile.",
    ...acting({ task: TASK }, ["task"]),
    (args, actor) => {
      const { submission } = submit(context, actor, args.task);
      return `Submitted at ${submission.commit.slice(0, 12)}. Its checks run in the daemon's queue; \`show\` tells how they went.`;
    },
  );
  tool(
    "release",
    "Give the task you hold back without finishing it; its tree and branch stay for the next worker.",
    ...acting(
      {
        task: TASK,
        why: text("What was done and what is left."),
        blocked: { type: "boolean", description: "It waits for a task or a decision the reason names." },
      },
      ["task", "why"],
    ),
    (args, actor) => `${args.task} is ${release(context, actor, args.task, args.why, { blocked: args.blocked === true }).fields.status}.`,
  );
  tool(
    "new",
    "Write a new task: ready when every task it depends on is done, backlog otherwise.",
    ...acting(
      {
        title: text("What it is."),
        kind: { type: "string", enum: [...KINDS] },
        priority: { type: "integer", description: "1 is taken first." },
        parent: TASK,
        rfc: text("The number of its RFC, four digits."),
        dependsOn: list("The ids of the tasks it waits for."),
        writes: list("The paths only it may change: files, or directories ending in /."),
        appends: list("The shared files it may add to."),
        needs: { type: "array", items: { type: "string", enum: [...NEEDS] } },
        checks: list("The commands that pass before it is submitted."),
        context: text("Why it is needed, and what it has to know."),
        doneWhen: text("What holds when it is done, as a list."),
        outOfScope: text("What it does not do."),
        subtasks: list("Its steps, a title each."),
        backlog: { type: "boolean", description: "Written as backlog whatever it waits for, for the owner to make ready." },
      },
      ["title", "kind", "priority"],
    ),
    (args, actor) => {
      const input = Object.fromEntries(Object.entries(args).filter(([key]) => !(key in WHO)));
      const task = create(context, actor, {
        ...input,
        kind: input.kind as Kind,
        priority: Number(input.priority),
        needs: (input.needs ?? []) as Need[],
      } as Parameters<typeof create>[2]);
      return `${task.fields.id} is ${task.fields.status}.`;
    },
  );

  tool(
    "review",
    "Mark a task in review as under review by you, or give your mark back. A session never reviews the task it built.",
    ...acting({ task: TASK, drop: { type: "boolean" } }, ["task"]),
    (args, actor) => {
      review(context, actor, args.task, { drop: args.drop === true });
      return args.drop === true
        ? "Your review mark is given back."
        : `${args.task} is under review by you: read its diff against its base in its tree, run its checks again, then accept or reject.`;
    },
  );
  tool(
    "accept",
    "Accept the task you reviewed, with what you read and which checks you ran again.",
    ...acting({ task: TASK, review: text("The review, in Markdown; its findings as a list.") }, ["task", "review"]),
    (args, actor) => {
      accept(context, actor, args.task, args.review);
      return `${args.task} is accepted; it lands in its turn.`;
    },
  );
  tool(
    "reject",
    "Reject the task you reviewed, with findings, each one checkable.",
    ...acting({ task: TASK, findings: text("The findings, as a list.") }, ["task", "findings"]),
    (args, actor) => {
      reject(context, actor, args.task, args.findings);
      return `${args.task} is ready again, with the findings in its Log.`;
    },
  );
  tool(
    "land",
    "Land the accepted tasks on main, each in its turn, by a fast-forward only.",
    {},
    [],
    () =>
      waitingToLand(context)
        .map((id) => {
          const landing = land(context, id);
          return landing.landed ? `${id} landed as ${landing.landed.slice(0, 12)}.` : `${id} is ${landing.task.fields.status}. ${landing.why}`;
        })
        .join("\n") || "No accepted task waits to land.",
  );

  tool(
    "remember",
    "Propose a fact the project should remember: a decision, a pitfall, a how-to. Another worker or the owner puts it in force.",
    ...acting(
      {
        kind: { type: "string", enum: FACT_KINDS.filter((kind) => kind !== "agreement") },
        title: text("The fact in a line."),
        body: text("What it is, and why."),
        paths: list("The paths it is about."),
        task: TASK,
      },
      ["kind", "title", "body"],
    ),
    (args, actor) => {
      const made = remember(context, actor, {
        kind: args.kind as FactKind,
        title: args.title,
        body: args.body,
        paths: args.paths ?? [],
        ...(args.task ? { task: args.task } : {}),
      });
      return `Proposed as "${made.file}".`;
    },
  );
  tool(
    "acceptFact",
    "Put a proposed fact of memory in force; not one you proposed.",
    ...acting({ fact: text("The fact's name, as `recall` gives it.") }, ["fact"]),
    (args, actor) => `"${acceptFact(context, actor, args.fact).title}" is in force.`,
  );
  return server;
}
