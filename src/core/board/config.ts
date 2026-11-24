/** A project's part: `agentree.config.json` at the root of its main checkout. What it does not say has agentree's default. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "../errors.ts";
import type { Places } from "./places.ts";

export const CONFIG_FILE = "agentree.config.json";

export type ProjectConfig = {
  /** A command is heavy, and waits for a slot of the machine, when one of these matches it; each is a regular expression. */
  heavy: string[];
  /** The image with the project's toolchain: its commands run in a container of it, each held to what it is given. None named, they run on the daemon's own system. */
  image: string;
  /** The commands that make a new tree runnable, run in it at its claim: an install, a copy of what git ignores. */
  setup: string[];
  /** The directories of a tree kept in a volume of the project's container and not on the host: its dependencies, its caches. */
  volumes: string[];
  /** No check runs longer than this many minutes. */
  boundMinutes: number;
  /** The checks a new build or fix task is given when it names none. */
  checks: string[];
  /** How many open tasks at most the owner aims to have; the Home page draws it as the goal. 0 is no goal. */
  goal: number;
  /** The most accepted tasks the daemon checks and lands together; 0 or 1, each lands singly. */
  landBatch: number;
  /** The most trees the project keeps beside its main checkout; a claim that needs one more is refused. 0 is no bound. */
  maxTrees: number;
  /** The command that tells the owner of a notice outside the browser (a question, a failed check, a review that waits); the notice is in its environment. None named, none runs. */
  notify: string;
  /** The interface the project reproduces, when it clones one: where its records are and how its pages are compared with them. */
  clone?: CloneConfig;
  /** The areas of the repository the Home page draws, each a directory; none named, they are its top directories. */
  areas: { path: string; name: string }[];
};

/** A step that brings a page to a state for real: a press of the pointer, the pointer over an element, the focus by a key, a key. */
export type CloneStep = { click: string } | { hover: string } | { focus: string } | { press: string };

export type CloneConfig = {
  /** The reference, declared: the address of the interface that is reproduced, the viewport and the theme it is read at. */
  reference?: string;
  viewport?: { width: number; height: number };
  theme?: string;
  /** Whether the drawings fetched for the project stay on the machine or are committed with it. */
  drawings?: "machine" | "committed";
  /** The directory of the records, a directory a part, from the repository's root. */
  records: string;
  /** The address the project's own application answers at while it is compared. */
  url: string;
  /** The command that starts the application when it does not answer yet. */
  serve?: string;
  /** Whether the colours and the font family are the project's own, or the reference's and compared too. */
  colours: "own" | "reference";
  font: "own" | "reference";
  /** For each part: where its page is, and the steps that show each of its states. */
  parts: Record<string, { path: string; states?: Record<string, CloneStep[]> }>;
  /** The ids whose differences are exceptions, each with its stated reason; what is only not built yet is none. */
  exceptions?: Record<string, string>;
};

export const DEFAULT_CONFIG: ProjectConfig = {
  heavy: ["\\b(test|e2e|vitest|jest|playwright|build)\\b"],
  image: "",
  setup: [],
  volumes: [],
  boundMinutes: 90,
  checks: [],
  notify: "",
  maxTrees: 0,
  landBatch: 0,
  goal: 0,
  areas: [],
};

export function configOf(places: Places): ProjectConfig {
  const file = join(places.root, CONFIG_FILE);
  if (!existsSync(file)) return DEFAULT_CONFIG;
  let given: Partial<ProjectConfig>;
  try {
    given = JSON.parse(readFileSync(file, "utf8")) as Partial<ProjectConfig>;
  } catch (error) {
    throw new Refusal(`${file} is not JSON: ${(error as Error).message}`);
  }
  return { ...DEFAULT_CONFIG, ...given };
}

/** Whether a command takes a slot of the machine. */
export const isHeavy = (config: ProjectConfig, command: string) => config.heavy.some((pattern) => new RegExp(pattern).test(command));
