/**
 * The memory of a project: one Markdown file a fact under `work/memory/`,
 * on the board's branch. A session proposes a fact; an agreement is the
 * owner's alone; the search reads the files.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "../errors.ts";
import { git } from "../git.ts";
import { frontmatter, quoted } from "../task/file.ts";
import { ID_PATTERN, isPath, stamp, type Task } from "../task/model.ts";
import { owner, worker, type Actor, type Context } from "./actions.ts";
import type { Places } from "./places.ts";

export const FACT_KINDS = ["agreement", "decision", "pitfall", "how-to"] as const;
export type FactKind = (typeof FACT_KINDS)[number];
const STATES = ["in-force", "proposed", "retired"] as const;
export type FactState = (typeof STATES)[number];

export type Fact = {
  /** Its file's name without `.md`. */
  file: string;
  kind: FactKind;
  title: string;
  body: string;
  /** The paths it is about; none for a fact of the whole project. */
  paths: string[];
  /** The task it came from, or the empty string. */
  task: string;
  by: string;
  state: FactState;
  at: string;
};

const directory = (places: Places) => join(places.board, "work/memory");

function parse(file: string, text: string): Fact {
  const lines = text.split("\n");
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end < 0) throw new Error("no frontmatter between two lines of ---");
  const raw = frontmatter(lines.slice(1, end));
  const text_ = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
  const among = <T extends string>(key: string, values: readonly T[]) => {
    if (!values.includes(text_(key) as T)) throw new Error(`"${key}" is "${text_(key)}"; it is one of ${values.join(", ")}`);
    return text_(key) as T;
  };
  return {
    file,
    kind: among("kind", FACT_KINDS),
    title: text_("title"),
    body: lines
      .slice(end + 1)
      .join("\n")
      .trim(),
    paths: Array.isArray(raw.paths) ? raw.paths : [],
    task: text_("task"),
    by: text_("by"),
    state: among("state", STATES),
    at: text_("at"),
  };
}

const render = (fact: Fact) =>
  [
    "---",
    `kind: ${fact.kind}`,
    `title: ${quoted(fact.title)}`,
    `state: ${fact.state}`,
    ...(fact.paths.length ? ["paths:", ...fact.paths.map((path) => `  - ${quoted(path)}`)] : ["paths: []"]),
    fact.task ? `task: ${fact.task}` : "task:",
    `by: ${fact.by}`,
    `at: ${fact.at}`,
    "---",
    "",
    fact.body,
    "",
  ].join("\n");

/** Every fact of the memory, latest first; a file that is no fact is named. */
export function readMemory(places: Places): { facts: Fact[]; unreadable: string[] } {
  const facts: Fact[] = [];
  const unreadable: string[] = [];
  for (const name of existsSync(directory(places)) ? readdirSync(directory(places)).sort() : []) {
    if (!name.endsWith(".md")) continue;
    try {
      facts.push(parse(name.slice(0, -3), readFileSync(join(directory(places), name), "utf8")));
    } catch (error) {
      unreadable.push(`${name}: ${(error as Error).message}`);
    }
  }
  return { facts: facts.sort((a, b) => b.at.localeCompare(a.at)), unreadable };
}

function write(places: Places, fact: Fact, message: string): Fact {
  const path = `work/memory/${fact.file}.md`;
  writeFileSync(join(places.board, path), render(fact));
  git(places.board, "add", "--", path);
  git(places.board, "commit", "--quiet", "-m", `Memory: ${message}`, "--", path);
  return fact;
}

function factOf(places: Places, file: string): Fact {
  const fact = readMemory(places).facts.find((each) => each.file === file);
  if (!fact) throw new Refusal(`the memory has no fact "${file}"`);
  return fact;
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");

export type NewFact = { kind: FactKind; title: string; body: string; paths?: string[]; task?: string };

/** Writes a fact a session learned, as proposed; an agreement is written by the owner only, and is in force at once. */
export function remember(context: Context, actor: Actor, input: NewFact): Fact {
  const by = worker(actor);
  if (!FACT_KINDS.includes(input.kind)) throw new Refusal(`a fact's kind is one of ${FACT_KINDS.join(", ")}`);
  if (input.kind === "agreement") owner(actor, "writing an agreement");
  if (input.title.trim() === "" || input.body.trim() === "") throw new Refusal("a fact has a title and says what it is");
  for (const path of input.paths ?? [])
    if (!isPath(path)) throw new Refusal(`"${path}" is not a path: a file or a directory ending in /, with no wildcard`);
  if (input.task && !ID_PATTERN.test(input.task)) throw new Refusal("the task a fact came from is named by its id, as T-0042");
  const file = slug(input.title);
  if (file === "" || existsSync(join(directory(context.places), `${file}.md`)))
    throw new Refusal(`the memory holds a fact named "${file}" already, or the title gives no name: choose another title`);
  const fact: Fact = {
    file,
    kind: input.kind,
    title: input.title.trim(),
    body: input.body.trim(),
    paths: input.paths ?? [],
    task: input.task ?? "",
    by,
    state: actor.owner ? "in-force" : "proposed",
    at: stamp(context.now()),
  };
  return write(context.places, fact, `${fact.state === "proposed" ? "proposed" : "wrote"} "${fact.title}"`);
}

/** Puts a proposed fact in force: the owner, or a worker other than the one that proposed it. */
export function acceptFact(context: Context, actor: Actor, file: string): Fact {
  const fact = factOf(context.places, file);
  if (fact.state !== "proposed") throw new Refusal(`"${file}" is ${fact.state}; a proposed fact is accepted`);
  if (!actor.owner && worker(actor) === fact.by) throw new Refusal(`"${file}" was proposed by ${fact.by}: another worker, or the owner, accepts it`);
  return write(context.places, { ...fact, state: "in-force" }, `accepted "${fact.title}"`);
}

/** The owner retires a fact, or changes its words and its paths. */
export function editFact(
  context: Context,
  actor: Actor,
  file: string,
  change: Partial<Pick<Fact, "title" | "body" | "paths">> & { retire?: boolean },
): Fact {
  owner(actor, "editing the memory");
  const fact = factOf(context.places, file);
  const { retire, ...words } = change;
  return write(context.places, { ...fact, ...words, state: retire ? "retired" : fact.state }, `${retire ? "retired" : "edited"} "${fact.title}"`);
}

const overlap = (a: string, b: string) => a === b || (a.endsWith("/") && b.startsWith(a)) || (b.endsWith("/") && a.startsWith(b));

/** The facts a claim's brief holds: the agreements, and the facts in force whose paths overlap the task's. */
export function factsFor(places: Places, task: Task): Fact[] {
  const mine = [...task.fields.writes, ...task.fields.appends];
  return readMemory(places).facts.filter(
    (fact) => fact.state === "in-force" && (fact.kind === "agreement" || fact.paths.some((path) => mine.some((each) => overlap(path, each)))),
  );
}

/** The facts not retired that hold every word asked for, in their title, their body or their paths. */
export function recall(places: Places, words: string[]): Fact[] {
  const asked = words.map((word) => word.toLowerCase()).filter(Boolean);
  return readMemory(places).facts.filter((fact) => {
    const text = `${fact.title}\n${fact.body}\n${fact.paths.join("\n")}`.toLowerCase();
    return fact.state !== "retired" && asked.every((word) => text.includes(word));
  });
}
