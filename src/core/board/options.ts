/** The options of the board, a file of its branch: for each tool, whether it may review a task the same tool built. */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "../errors.ts";
import { git } from "../git.ts";
import { TOOLS, type Tool } from "../task/model.ts";
import type { Places } from "./places.ts";

const FILE = "work/options.yaml";
const KEY = "review-own-tasks";

const STALE = "release-stale";

export type Options = {
  reviewOwnTasks: Record<Tool, boolean>;
  /** A claim that went stale is released by the daemon, in place of waiting for the owner. */
  releaseStale: boolean;
};

export function readOptions(places: Places): Options {
  const lines = readFileSync(join(places.board, FILE), "utf8").split("\n");
  const from = lines.indexOf(`${KEY}:`);
  const set = new Map<string, boolean>();
  for (const line of from < 0 ? [] : lines.slice(from + 1)) {
    const entry = /^ {2}([a-z-]+): (true|false)$/.exec(line);
    if (!entry) break;
    set.set(entry[1]!, entry[2] === "true");
  }
  return {
    reviewOwnTasks: Object.fromEntries(TOOLS.map((tool) => [tool, set.get(tool) ?? false])) as Record<Tool, boolean>,
    releaseStale: lines.includes(`${STALE}: true`),
  };
}

/** Sets whether the daemon releases a claim that went stale, as a commit of the board; the owner's. */
export function setReleaseStale(places: Places, on: boolean) {
  if (readOptions(places).releaseStale === on) return;
  const path = join(places.board, FILE);
  const kept = readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => !line.startsWith(`${STALE}:`))
    .join("\n")
    .trimEnd();
  writeFileSync(path, `${kept}\n${STALE}: ${on}\n`);
  git(places.board, "add", "--", FILE);
  git(places.board, "commit", "--quiet", "-m", `Options: a stale claim is ${on ? "released by the daemon" : "the owner's to release"}`, "--", FILE);
}

/** Sets whether a tool may review its own tasks, as a commit of the board; the owner's. */
export function setReviewOwnTasks(places: Places, tool: Tool, allowed: boolean) {
  if (!TOOLS.includes(tool) || tool === "person")
    throw new Refusal(`the switch is a tool's: ${TOOLS.filter((each) => each !== "person").join(", ")}`);
  const path = join(places.board, FILE);
  const text = readFileSync(path, "utf8");
  const next = text.replace(new RegExp(`^  ${tool}: (true|false)$`, "m"), `  ${tool}: ${allowed}`);
  if (next === text) return;
  writeFileSync(path, next);
  git(places.board, "add", "--", FILE);
  git(places.board, "commit", "--quiet", "-m", `Options: ${tool} ${allowed ? "may" : "may not"} review its own tasks`, "--", FILE);
}
