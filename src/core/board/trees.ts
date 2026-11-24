/**
 * The trees of a project, kept few: how many there are, a bound on them,
 * and the removal of the trees of tasks that are done or dropped. A tree
 * that holds a change no commit has is never removed: it stays, and is
 * named with why.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "../errors.ts";
import { tryGit } from "../git.ts";
import { ID_PATTERN, type Status } from "../task/model.ts";
import type { Context } from "./actions.ts";
import { configOf } from "./config.ts";
import type { Places } from "./places.ts";
import { claimOf, reviewOf } from "./state.ts";
import { readBoard } from "./store.ts";

/** The ids of the tasks that have a tree beside the main checkout. */
export const treeIds = (places: Places): string[] =>
  existsSync(places.trees)
    ? readdirSync(places.trees, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && ID_PATTERN.test(entry.name))
        .map((entry) => entry.name)
        .sort()
    : [];

/** Refuses one more tree when the project's bound is reached; a project that names no bound has none. */
export function roomForATree(places: Places) {
  const { maxTrees } = configOf(places);
  const there = treeIds(places);
  if (maxTrees > 0 && there.length >= maxTrees)
    throw new Refusal(
      `the project keeps ${maxTrees} trees at most and has ${there.length} (${there.join(", ")}): land or drop a task, or run "agentree trees --sweep", before one more is claimed`,
    );
}

export type Tree = { id: string; path: string; status: Status | "no task"; held: boolean; changed: boolean };

/** Every tree, with its task's status, whether a worker or a reviewer holds it, and whether it holds a change no commit has. */
export function trees(context: Context): Tree[] {
  const { places } = context;
  const statuses = new Map(readBoard(places).tasks.map(({ task }) => [task.fields.id, task.fields.status]));
  return treeIds(places).map((id) => {
    const path = join(places.trees, id);
    return {
      id,
      path,
      status: statuses.get(id) ?? "no task",
      held: Boolean(claimOf(places, id) ?? reviewOf(places, id)),
      changed: tryGit(path, "status", "--porcelain").stdout.trim() !== "",
    };
  });
}

/** Removes the trees of the tasks that are done or dropped; what was removed, and what stays with why. */
export function sweepTrees(context: Context): { removed: string[]; stayed: { id: string; why: string }[] } {
  const { places } = context;
  const removed: string[] = [];
  const stayed: { id: string; why: string }[] = [];
  for (const tree of trees(context)) {
    if (tree.status !== "done" && tree.status !== "dropped") continue;
    if (tree.held) stayed.push({ id: tree.id, why: "it is held" });
    else if (tree.changed) stayed.push({ id: tree.id, why: "it holds a change no commit has" });
    else {
      tryGit(places.root, "worktree", "unlock", tree.path);
      const gone = tryGit(places.root, "worktree", "remove", tree.path);
      if (gone.status === 0) removed.push(tree.id);
      else stayed.push({ id: tree.id, why: gone.stderr.trim().split("\n")[0] ?? "git did not remove it" });
    }
  }
  return { removed, stayed };
}
