/** For the tests of the board: a repository with one commit and a board, in a temporary directory, and a clock that moves a second a reading. */
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../git.ts";
import type { Actor, Context } from "./actions.ts";
import { init } from "./init.ts";

export const OWNER: Actor = { worker: "person/owner", session: "", owner: true };
export const CODEX: Actor = { worker: "codex/gpt-5", session: "s-codex", owner: false };
export const CURSOR: Actor = { worker: "cursor/composer-2", session: "s-cursor", owner: false };

export type Project = { home: string; context: Context; advance: (ms: number) => void; remove: () => void };

export function project(): Project {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "agentree-")));
  const root = join(home, "project");
  git(home, "init", "--quiet", "--initial-branch=main", root);
  writeFileSync(join(root, "README.md"), "# A project\n");
  git(root, "add", "README.md");
  git(root, "commit", "--quiet", "-m", "Start");
  let clock = Date.parse("2026-11-24T10:00:00Z");
  return {
    home,
    context: { places: init(root, { firstCommit: false }).places, now: () => new Date((clock += 1000)) },
    advance: (ms) => void (clock += ms),
    remove: () => rmSync(home, { recursive: true, force: true }),
  };
}
