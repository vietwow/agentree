/**
 * The kickstart: one call sets a repository up so that agents of any tool
 * start working on it. It makes the board, writes the project's part and
 * each tool's, registers the project on the machine, and writes the first
 * goal as the first card. The UI asks what this takes and holds no step of
 * its own.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { create, type Context } from "../board/actions.ts";
import { init } from "../board/init.ts";
import { Refusal } from "../errors.ts";
import { git } from "../git.ts";
import { machineHome, register, type Registered } from "../machine/projects.ts";
import type { Tool } from "../task/model.ts";
import { AGENT_TOOLS, setUp } from "./tools.ts";

/** What the kickstart asks of the stack, every answer optional: what is left empty is the planner's to decide in the project's first ADR. */
export const STACK_QUESTIONS = [
  "The language and runtime",
  "The frontend",
  "Frontend and backend",
  "The backend's shape",
  "The data",
  "Where it runs",
  "Sign-in",
  "The tests and CI",
] as const;

export type Kickstart = {
  tools?: readonly Tool[];
  /** Make the repository's first commit when it has none. */
  firstCommit?: boolean;
  name?: string;
  desc?: string;
  /** The first goal, in words: it becomes the first card. */
  goal?: string;
  /** The owner's answers about the stack, by the question. */
  stack?: Record<string, string>;
};

export type Kickstarted = { project: Registered; did: string[]; byHand: string[] };

/** Sets up the repository a directory is, or is in. */
export function kickstart(directory: string, options: Kickstart, now: () => Date = () => new Date()): Kickstarted {
  const tools = options.tools ?? AGENT_TOOLS;
  for (const tool of tools)
    if (!(AGENT_TOOLS as readonly string[]).includes(tool))
      throw new Refusal(`"${tool}" is no tool agentree sets a project up for: ${AGENT_TOOLS.join(", ")}`);
  const made = init(directory, { firstCommit: options.firstCommit ?? false });
  const { places } = made;
  const report = setUp(places.root, tools);
  const did = [...made.did, ...report.did];
  // A repository the kickstart began holds nothing of anyone's yet: what was written is its second commit.
  if (made.did.includes("made its first commit") && report.did.length) {
    git(places.root, "add", "--all");
    git(places.root, "commit", "--quiet", "-m", "Set the project up for agentree");
    did.push("committed what was written on main");
  }
  const project = register(places.root, now(), { ...(options.name ? { name: options.name } : {}), ...(options.desc ? { desc: options.desc } : {}) });
  const goal = options.goal?.trim();
  if (goal) {
    const given = Object.entries(options.stack ?? {}).filter(([, answer]) => answer.trim() !== "");
    const stack = given.length
      ? `\n\nThe stack, as the owner gave it; no agent changes these:\n\n${given.map(([question, answer]) => `- ${question}: ${answer.trim()}`).join("\n")}`
      : "";
    const context: Context = { places, now };
    const [title] = goal.split("\n");
    const card = create(
      context,
      { worker: "person/owner", session: "", owner: true },
      { title: title!.slice(0, 120), kind: "build", priority: 1, context: `${goal}${stack}`, backlog: true },
    );
    did.push(`wrote the first goal as ${card.fields.id}, for the planner to break down`);
  }
  return { project, did, byHand: report.byHand };
}

const settingsFile = () => join(machineHome(), "settings.json");

/** The one directory of the host new projects are made in: `AGENTREE_PROJECTS`, or what the owner named once. */
export function projectsDirectory(): string | undefined {
  if (process.env.AGENTREE_PROJECTS) return process.env.AGENTREE_PROJECTS;
  if (!existsSync(settingsFile())) return undefined;
  return (JSON.parse(readFileSync(settingsFile(), "utf8")) as { projects?: string }).projects;
}

/** Names the directory new projects are made in. */
export function setProjectsDirectory(directory: string) {
  if (!isAbsolute(directory) || !existsSync(directory)) throw new Refusal(`"${directory}" is no directory that is there, by its absolute path`);
  mkdirSync(machineHome(), { recursive: true });
  writeFileSync(`${settingsFile()}.tmp`, `${JSON.stringify({ projects: directory }, null, 2)}\n`);
  renameSync(`${settingsFile()}.tmp`, settingsFile());
}

/** Makes a new project's folder under the directory of projects and kickstarts it there; no folder is made elsewhere. */
export function newProject(name: string, options: Omit<Kickstart, "firstCommit" | "name">, now?: () => Date): Kickstarted {
  const parent = projectsDirectory();
  if (!parent) throw new Refusal("no directory of projects is named on this machine: name it once, and new projects are made there");
  const folder = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!folder) throw new Refusal("a project has a name of letters or digits");
  const directory = join(parent, folder);
  if (existsSync(directory) && readdirSync(directory).length)
    throw new Refusal(`${directory} is there already and is not empty: choose another name, or run "agentree init" in it`);
  mkdirSync(directory, { recursive: true });
  return kickstart(directory, { ...options, name: name.trim(), firstCommit: true }, now);
}
