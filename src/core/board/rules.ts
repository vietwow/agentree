/** The rules of the board that need nothing but the tasks and who holds them: plain functions. */
import { TO_BE_WRITTEN } from "../task/file.ts";
import { CHECKED_KINDS, HELD_STATUSES, ID_PATTERN, isPath, type Task } from "../task/model.ts";

/** Two paths overlap when they are equal, or when one is a directory (ends in `/`) and the other is inside it. */
const pathsOverlap = (a: string, b: string) => a === b || (a.endsWith("/") && b.startsWith(a)) || (b.endsWith("/") && a.startsWith(b));

/** Where two tasks conflict: a `writes` of one against a `writes` or an `appends` of the other, in both directions. */
export function overlaps(a: Task, b: Task): string[] {
  const found: string[] = [];
  const compare = (mine: string[], theirs: string[]) => {
    for (const path of mine) for (const other of theirs) if (pathsOverlap(path, other)) found.push(path === other ? path : `${path} and ${other}`);
  };
  compare(a.fields.writes, [...b.fields.writes, ...b.fields.appends]);
  compare(a.fields.appends, b.fields.writes);
  return found;
}

/** Whether a file is one a task may change. */
export const inScope = (task: Task, file: string) =>
  [...task.fields.writes, ...task.fields.appends].some((path) => (path.endsWith("/") ? file.startsWith(path) : file === path));

export const isHeld = (task: Task) => HELD_STATUSES.includes(task.fields.status);

/** The sections a task still has to have written before it is worked on. */
export function unwritten(task: Task): string[] {
  const sections: [string, string][] = [
    ["Context", task.context],
    ["Done when", task.doneWhen],
    ["Out of scope", task.outOfScope],
  ];
  return sections.filter(([, text]) => text === "" || text === TO_BE_WRITTEN).map(([name]) => name);
}

/**
 * What a card lacks of the board's form, each in words; empty when it has
 * all of it. The form is what a worker with no other context can build
 * from: a title that says what the change does, a Context that says what is
 * there and what this adds, a Done when that can be checked line by line,
 * what is out of scope, its steps as subtasks, and the checks that pass.
 * A build or a fix that names no paths is a parent, counted by its parts:
 * it is held to its title and its Context alone.
 */
export function formNotes(task: Task): string[] {
  const notes: string[] = [];
  const { title, kind, writes, checks } = task.fields;
  const written = (text: string) => text !== "" && text !== TO_BE_WRITTEN;
  const words = title.trim().split(/\s+/).length;
  if (words < 3 || title.trim().length > 90) notes.push("its title says what the change does, in 3 words at least and 90 letters at most");
  if (/[.!:]$/.test(title.trim())) notes.push("its title is a line, with no period at its end");
  const sentences = task.context.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() !== "").length;
  if (!written(task.context) || sentences < 2)
    notes.push("its Context is two sentences at least: what is there now, and what this adds or must hold");
  const built = kind === "build" || kind === "fix";
  if (built && writes.length === 0) return notes;
  const lines = task.doneWhen.split("\n").filter((line) => line.trim() !== "");
  if (!written(task.doneWhen) || lines.length < 2 || lines.some((line) => !/^- \S/.test(line)))
    notes.push('its "Done when" is a list of two lines at least, each one a thing a reviewer can check');
  if (!written(task.outOfScope)) notes.push('its "Out of scope" names what a worker might do and must not, with where that belongs');
  if (built && (task.subtasks.length < 2 || task.subtasks.length > 6))
    notes.push("its steps are 2 to 6 subtasks, each a short line that begins with what is done");
  if (built && checks.length === 0) notes.push("it names a check: a command that passes when it is done");
  return notes;
}

/** What keeps a ready task from being claimed now, each in words; empty when nothing does. */
export function obstacles(all: readonly Task[], task: Task): string[] {
  const found: string[] = [];
  const blank = unwritten(task);
  if (blank.length) found.push(`its ${blank.map((name) => `"## ${name}"`).join(", ")} ${blank.length > 1 ? "are" : "is"} not written yet`);
  if (CHECKED_KINDS.includes(task.fields.kind) && task.fields.checks.length === 0)
    found.push(`a task of kind ${task.fields.kind} needs at least one command in "checks"`);
  for (const id of task.fields.dependsOn) {
    const on = all.find((other) => other.fields.id === id);
    if (on?.fields.status !== "done") found.push(`it depends on ${id}, which is ${on?.fields.status ?? "not on the board"}`);
  }
  for (const other of all) {
    if (other === task || !isHeld(other)) continue;
    const shared = overlaps(task, other);
    if (shared.length) found.push(`${other.fields.id} is ${other.fields.status} and holds ${shared.join(", ")}`);
  }
  return found;
}

/** The id after the highest on the board. */
export function nextId(all: readonly Task[]): string {
  const highest = Math.max(0, ...all.map((task) => Number(task.fields.id.slice(2))));
  return `T-${String(highest + 1).padStart(4, "0")}`;
}

/** Whether every task a task depends on is done. */
export const dependenciesDone = (all: readonly Task[], task: Task) =>
  task.fields.dependsOn.every((id) => all.find((other) => other.fields.id === id)?.fields.status === "done");

function cycleFrom(start: string, edges: Map<string, string[]>): string[] | undefined {
  const walk = (id: string, path: string[]): string[] | undefined => {
    for (const next of edges.get(id) ?? []) {
      if (next === start) return [...path, next];
      if (!path.includes(next)) {
        const found = walk(next, [...path, next]);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(start, [start]);
}

/** What is wrong on the board across its tasks, each problem in a line; a file that cannot be read is named by its reader. */
export function lintProblems(tasks: readonly { file: string; task: Task }[]): string[] {
  const problems: string[] = [];
  const all = tasks.map((stored) => stored.task);
  const ids = new Map<string, string[]>();
  for (const { file, task } of tasks) ids.set(task.fields.id, [...(ids.get(task.fields.id) ?? []), file]);
  for (const [id, files] of ids) if (files.length > 1) problems.push(`${id} is in ${files.length} files: ${files.join(", ")}`);
  const dependencies = new Map(all.map((task) => [task.fields.id, task.fields.dependsOn]));
  const parents = new Map(all.map((task) => [task.fields.id, task.fields.parent ? [task.fields.parent] : []]));
  for (const { file, task } of tasks) {
    const { fields } = task;
    const say = (problem: string) => problems.push(`${file}: ${problem}`);
    if (!ID_PATTERN.test(fields.id)) say(`its id is "${fields.id}"; an id is as T-0042`);
    if (file !== `${fields.id}.md` && !file.startsWith(`${fields.id}-`)) say(`it is not named by its id, ${fields.id}`);
    if (fields.title.trim() === "") say("it has no title");
    if (fields.rfc !== "" && !/^\d{4}$/.test(fields.rfc)) say(`"rfc" is "${fields.rfc}"; it is four digits or empty`);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(fields.created))
      say(`"created" is "${fields.created}"; it is UTC to the second, as 2026-11-24T10:00:00Z`);
    for (const path of [...fields.writes, ...fields.appends])
      if (!isPath(path)) say(`"${path}" is not a path: a file or a directory ending in /, from the repository's root, with no wildcard`);
    for (const [key, list] of [
      ["depends-on", fields.dependsOn],
      ["writes", fields.writes],
      ["appends", fields.appends],
    ] as const)
      if (new Set(list).size !== list.length) say(`"${key}" names an entry twice`);
    for (const id of fields.dependsOn) if (!ids.has(id)) say(`it depends on ${id}, which is not on the board`);
    if (fields.parent !== "" && !ids.has(fields.parent)) say(`its parent ${fields.parent} is not on the board`);
    const loop = cycleFrom(fields.id, dependencies) ?? cycleFrom(fields.id, parents);
    if (loop) say(`it leads back to itself: ${loop.join(" -> ")}`);
  }
  const held = all.filter(isHeld);
  held.forEach((a, index) => {
    for (const b of held.slice(index + 1)) {
      const shared = overlaps(a, b);
      if (shared.length) problems.push(`${a.fields.id} and ${b.fields.id} are both held and overlap: ${shared.join(", ")}`);
    }
  });
  return problems;
}
