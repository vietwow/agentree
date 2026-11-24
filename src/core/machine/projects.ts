/**
 * The projects of this machine: each a repository registered with the
 * daemon. The list is the user's, in the configuration directory; each
 * project's state stays in its own git common directory.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Refusal } from "../errors.ts";
import { boardOf, type Places } from "../board/places.ts";

export const PROJECT_COLORS = ["indigo", "blue", "violet", "teal", "rose", "amber", "green", "slate"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export type Registered = {
  /** Its name in an address: lower-case words. */
  id: string;
  name: string;
  /** The main checkout. */
  root: string;
  desc: string;
  color: ProjectColor;
  /** The name of the icon the UI draws it with. */
  icon: string;
  /** Its repository is not on a remote anyone else reads. */
  private: boolean;
  /** The owner set it aside: its state is "on hold" whatever its board says. */
  hold: boolean;
  /** It was made by `agentree demo`: its content is a sample, and the UI says so. */
  sample?: boolean;
  registeredAt: string;
};

/** Where the machine's list is: `AGENTREE_HOME`, or `agentree` under the user's configuration directory. */
export const machineHome = () => process.env.AGENTREE_HOME ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "agentree");

const listFile = () => join(machineHome(), "projects.json");

export function projects(): Registered[] {
  return existsSync(listFile()) ? (JSON.parse(readFileSync(listFile(), "utf8")) as Registered[]) : [];
}

function save(list: Registered[]) {
  mkdirSync(machineHome(), { recursive: true });
  const draft = `${listFile()}.${process.pid}.tmp`;
  writeFileSync(draft, `${JSON.stringify(list, null, 2)}\n`);
  renameSync(draft, listFile());
}

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Registers the repository a directory is in, which has a board; one registered already keeps its entry. */
export function register(
  directory: string,
  at: Date,
  more: Partial<Pick<Registered, "name" | "desc" | "color" | "icon" | "private" | "sample">> = {},
): Registered {
  const { root } = boardOf(directory);
  const list = projects();
  const known = list.find((project) => project.root === root);
  if (known) return known;
  const name = more.name ?? basename(root);
  const base = slug(name) || "project";
  let id = base;
  for (let n = 2; list.some((project) => project.id === id); n++) id = `${base}-${n}`;
  const project: Registered = {
    id,
    name,
    root,
    desc: more.desc ?? "",
    color: more.color ?? PROJECT_COLORS[list.length % PROJECT_COLORS.length]!,
    icon: more.icon ?? "folder",
    private: more.private ?? false,
    hold: false,
    ...(more.sample ? { sample: true } : {}),
    registeredAt: at.toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  save([...list, project]);
  return project;
}

export function projectOf(id: string): Registered {
  const project = projects().find((each) => each.id === id);
  if (!project) throw new Refusal(`no project "${id}" is registered on this machine`);
  return project;
}

/** Changes what the owner sets of a project: its name, its words, its look, and whether it is on hold. */
export function editProject(id: string, change: Partial<Pick<Registered, "name" | "desc" | "color" | "icon" | "private" | "hold">>): Registered {
  const project = { ...projectOf(id), ...change };
  save(projects().map((each) => (each.id === id ? project : each)));
  return project;
}

/** Takes a project off the machine's list; its repository and its board stay as they are. */
export function unregister(id: string) {
  projectOf(id);
  save(projects().filter((each) => each.id !== id));
}

/** The places of a registered project. */
export const placesOfProject = (id: string): Places => boardOf(projectOf(id).root);
