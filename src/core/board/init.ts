/** Making a repository's board: its branch, its checkout beside the trees, and the machine's state. */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Refusal } from "../errors.ts";
import { git, tryGit } from "../git.ts";
import { BOARD_BRANCH, placesOf, tasksDirectory, type Places } from "./places.ts";
import { ownerToken } from "./state.ts";

const OPTIONS = `# The options of the board, changed through "agentree option" with the owner's token.
# For each tool: whether it may start a reviewer for a task the same tool built.
review-own-tasks:
  claude-code: false
  claude-desktop: false
  cursor: false
  codex: false
  antigravity: false
`;

export type Init = {
  /** Make the directory a repository, and its first commit, when it has none: a tree is made only from a commit. */
  firstCommit: boolean;
};

/** Makes the board of the repository a directory is in, and says what it did; a second run changes nothing. */
export function init(directory: string, options: Init): { places: Places; did: string[] } {
  const did: string[] = [];
  if (tryGit(directory, "rev-parse", "--git-dir").status !== 0) {
    if (!options.firstCommit) throw new Refusal(`${directory} is not a git repository; run "agentree init --first-commit" to make it one`);
    git(directory, "init", "--quiet", "--initial-branch=main");
    did.push("made it a git repository");
  }
  if (tryGit(directory, "rev-parse", "--verify", "--quiet", "HEAD").status !== 0) {
    if (!options.firstCommit)
      throw new Refusal(`${directory} has no commit, and a tree is made only from one; run "agentree init --first-commit" to make the first`);
    git(directory, "commit", "--quiet", "--allow-empty", "-m", "Start the repository");
    did.push("made its first commit");
  }
  const places = placesOf(directory);
  if (!existsSync(places.board)) {
    mkdirSync(places.trees, { recursive: true });
    if (tryGit(places.root, "rev-parse", "--verify", "--quiet", `refs/heads/${BOARD_BRANCH}`).status === 0) {
      git(places.root, "worktree", "add", "--relative-paths", places.board, BOARD_BRANCH);
      did.push(`checked out ${BOARD_BRANCH} at ${places.board}`);
    } else {
      git(places.root, "worktree", "add", "--relative-paths", "--orphan", "-b", BOARD_BRANCH, places.board);
      did.push(`made the branch ${BOARD_BRANCH}, checked out at ${places.board}`);
    }
  }
  if (!existsSync(tasksDirectory(places))) {
    for (const part of ["work/tasks", "work/memory", "work/usage"]) {
      mkdirSync(join(places.board, part), { recursive: true });
      writeFileSync(join(places.board, part, ".gitkeep"), "");
    }
    writeFileSync(join(places.board, "work/options.yaml"), OPTIONS);
    git(places.board, "add", "--", "work");
    git(places.board, "commit", "--quiet", "-m", "Start the board");
    did.push("wrote the empty board: tasks, memory, usage and the options");
  }
  ownerToken(places);
  return { places, did };
}
