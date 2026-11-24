/** A project's part: `agentree.config.json` at the root of its main checkout. What it does not say has agentree's default. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "../errors.ts";
import type { Places } from "./places.ts";

export const CONFIG_FILE = "agentree.config.json";

export type ProjectConfig = {
  /** A command is heavy, and waits for a slot of the machine, when one of these matches it; each is a regular expression. */
  heavy: string[];
  /** No check runs longer than this many minutes. */
  boundMinutes: number;
  /** The areas of the repository the Home page draws, each a directory; none named, they are its top directories. */
  areas: { path: string; name: string }[];
};

export const DEFAULT_CONFIG: ProjectConfig = { heavy: ["\\b(test|e2e|vitest|jest|playwright|build)\\b"], boundMinutes: 90, areas: [] };

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
