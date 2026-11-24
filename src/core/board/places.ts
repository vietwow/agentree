/**
 * Where a project's board is. What a task is lives on the branch
 * `agentree/board`, checked out once beside the task trees; what is true of
 * this machine now lives under the repository's git common directory, which
 * every worktree shares and no commit holds.
 */
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Refusal } from "../errors.ts";
import { git, tryGit } from "../git.ts";

export const BOARD_BRANCH = "agentree/board";
export const TASK_BRANCH = (id: string) => `task/${id}`;

export type Places = {
  /** The main checkout: the first worktree of the repository. */
  root: string;
  /** `<git-common-dir>/agentree/`: claims, beats, review marks, queues, the owner's token. */
  state: string;
  /** The directory beside the main checkout that holds the board's checkout and every task's tree. */
  trees: string;
  /** The checkout of the board's branch. */
  board: string;
};

/** The places of the repository a directory is in, whichever of its worktrees it is. */
export function placesOf(directory: string): Places {
  const listed = tryGit(directory, "worktree", "list", "--porcelain");
  const root = /^worktree (.+)$/m.exec(listed.stdout)?.[1];
  if (listed.status !== 0 || !root) throw new Refusal(`${directory} is not in a git repository; run "agentree init" in one`);
  const common = git(root, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const trees = join(dirname(root), `${basename(root)}-trees`);
  return { root, state: join(common, "agentree"), trees, board: join(trees, "board") };
}

export const tasksDirectory = (places: Places) => join(places.board, "work/tasks");
export const treeOf = (places: Places, id: string) => join(places.trees, id);

/** The places of a project that has a board; one without is told to run `init`. */
export function boardOf(directory: string): Places {
  const places = placesOf(directory);
  if (!existsSync(tasksDirectory(places))) throw new Refusal(`${places.root} has no board; run "agentree init" there`);
  return places;
}
