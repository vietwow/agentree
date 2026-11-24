/**
 * The task files of a board: reading them all, and writing one. A write
 * happens only while the file still holds the text its change read, under
 * a lock no second writer can take, and is a commit on the board's branch.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Changed, Refusal } from "../errors.ts";
import { git } from "../git.ts";
import { fileName, parseTask, renderTask } from "../task/file.ts";
import { ID_PATTERN, type Task } from "../task/model.ts";
import { tasksDirectory, type Places } from "./places.ts";

/** A task as it was read: its file's name under `work/tasks/` and the text it held. */
export type Stored = { file: string; text: string; task: Task };

export type Board = { places: Places; tasks: Stored[]; unreadable: string[] };

/** Every task file of the board; one that cannot be read is named, and the others still are. */
export function readBoard(places: Places): Board {
  const directory = tasksDirectory(places);
  const tasks: Stored[] = [];
  const unreadable: string[] = [];
  for (const file of readdirSync(directory).sort()) {
    if (!file.endsWith(".md")) continue;
    const text = readFileSync(join(directory, file), "utf8");
    try {
      tasks.push({ file, text, task: parseTask(text) });
    } catch (error) {
      unreadable.push(`${file}: ${(error as Error).message}`);
    }
  }
  return { places, tasks, unreadable };
}

export function taskOf(board: Board, id: string): Stored {
  if (!ID_PATTERN.test(id)) throw new Refusal("name the task by its id, as T-0042");
  const found = board.tasks.filter((stored) => stored.task.fields.id === id);
  if (found.length !== 1)
    throw new Refusal(found.length ? `${id} is in ${found.length} files: ${found.map((f) => f.file).join(", ")}` : `no task ${id} on the board`);
  return found[0]!;
}

const LOCK_WAIT_MS = 5000;
const LOCK_POLL_MS = 20;

/** Waits on the spot: a change of the board is synchronous from its read to its write. */
const pause = (milliseconds: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);

/** Runs a write while no other writes the board: the two exclude each other by a file only one can create. */
function whileNoOtherWrites<T>(places: Places, write: () => T): T {
  const lock = join(places.state, "board.lock");
  mkdirSync(places.state, { recursive: true });
  const since = Date.now();
  for (;;) {
    try {
      writeFileSync(lock, `${process.pid}\n`, { flag: "wx" });
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() - since > LOCK_WAIT_MS)
        throw new Refusal(
          `the board is not written: ${lock} is still there after ${LOCK_WAIT_MS / 1000} s. It is held only for the moment of a write; if nothing writes the board, remove it and run the command again`,
        );
      pause(LOCK_POLL_MS);
    }
  }
  try {
    return write();
  } finally {
    rmSync(lock, { force: true });
  }
}

/**
 * Writes a task and commits it on the board's branch. A task that was read
 * is written only while its file still holds the text that was read; a new
 * task only while no file has its id.
 */
export function writeTask(places: Places, was: Stored | undefined, task: Task, message: string): Stored {
  const directory = tasksDirectory(places);
  const file = was?.file ?? fileName(task.fields);
  const path = join(directory, file);
  const text = renderTask(task);
  return whileNoOtherWrites(places, () => {
    if (
      was
        ? readFileSync(path, "utf8") !== was.text
        : existsSync(path) || readdirSync(directory).some((name) => name.startsWith(`${task.fields.id}-`) || name === `${task.fields.id}.md`)
    )
      throw new Changed(was ? `${file} changed since it was read` : `${task.fields.id} was written by another`);
    if (was?.text !== text) {
      const draft = `${path}.${process.pid}.tmp`;
      writeFileSync(draft, text);
      renameSync(draft, path);
      git(places.board, "add", "--", `work/tasks/${file}`);
      git(places.board, "commit", "--quiet", "-m", `${task.fields.id}: ${message}`, "--", `work/tasks/${file}`);
    }
    return { file, text, task };
  });
}

const ATTEMPTS = 3;

/**
 * Runs a change of the board: its read, what it decides, and its writes.
 * When a task file changed between the read and the write, nothing is
 * written to it and the change runs again on the board as it is now.
 */
export function fromItsRead<T>(change: () => T): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return change();
    } catch (error) {
      if (!(error instanceof Changed)) throw error;
      if (attempt === ATTEMPTS) throw new Refusal(`${error.message}, ${ATTEMPTS} times over. Run the command again`);
    }
  }
}
