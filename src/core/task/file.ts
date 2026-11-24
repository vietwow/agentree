/**
 * A task file: frontmatter of plain YAML (scalars and block lists of
 * strings, nothing else of YAML), then its sections in one order. A file is
 * read into a Task and written back whole, so every file has one form.
 */
import { KINDS, NEEDS, STATUSES, type Fields, type LogEntry, type Question, type Subtask, type Task } from "./model.ts";

const SECTIONS = ["Context", "Done when", "Out of scope", "Subtasks", "Questions", "Log"] as const;
type Section = (typeof SECTIONS)[number];

/** What a section holds until it is written; a claim refuses a task that still says so. */
export const TO_BE_WRITTEN = "To be written.";
const NO_SUBTASK = "No subtask.";
const NO_QUESTION = "No question yet.";
const NO_ENTRY = "No entry yet.";

const LISTS = ["depends-on", "writes", "appends", "needs", "checks"] as const;
const SCALARS = ["id", "title", "status", "kind", "priority", "parent", "rfc", "step", "created"] as const;
const ORDER = ["id", "title", "status", "kind", "priority", "parent", "rfc", "step", "depends-on", "writes", "appends", "needs", "checks", "created"];

function scalar(raw: string): string {
  const value = raw.trim();
  const single = /^'((?:[^']|'')*)'$/.exec(value);
  if (single) return single[1]!.replaceAll("''", "'");
  if (/^"(?:[^"\\]|\\.)*"$/.test(value)) return JSON.parse(value) as string;
  return value;
}

/** A string as a YAML scalar in single quotes. */
export const quoted = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** The fields between the two lines of `---`: scalars as strings, block lists as lists. */
export function frontmatter(lines: string[]): Record<string, string | string[]> {
  const raw: Record<string, string | string[]> = {};
  let key: string | undefined;
  lines.forEach((line, index) => {
    if (line.trim() === "") return;
    const field = /^([a-z][a-z-]*):(?:\s+(.*))?$/.exec(line);
    const item = /^ {2}- (.*)$/.exec(line);
    if (field) {
      key = field[1]!;
      if (key in raw) throw new Error(`line ${index + 2}: the field "${key}" is there twice`);
      const value = (field[2] ?? "").trim();
      raw[key] = value === "[]" ? [] : value === "" ? "" : scalar(value);
    } else if (item && key !== undefined && (raw[key] === "" || Array.isArray(raw[key]))) {
      const before = raw[key];
      raw[key] = [...(Array.isArray(before) ? before : []), scalar(item[1]!)];
    } else {
      throw new Error(`line ${index + 2}: not a line of the task format`);
    }
  });
  return raw;
}

function fieldsOf(raw: Record<string, string | string[]>): Fields {
  for (const key of Object.keys(raw)) if (!ORDER.includes(key)) throw new Error(`the field "${key}" is not a task's`);
  const text = (key: (typeof SCALARS)[number]) => {
    const value = raw[key];
    if (typeof value !== "string") throw new Error(`the field "${key}" is missing or is a list`);
    return value;
  };
  const list = (key: (typeof LISTS)[number]) => {
    const value = raw[key];
    if (value === undefined) throw new Error(`the field "${key}" is missing`);
    return value === "" ? [] : typeof value === "string" ? [value] : value;
  };
  const among = <T extends string>(key: (typeof SCALARS)[number], values: readonly T[]) => {
    const value = text(key);
    if (!values.includes(value as T)) throw new Error(`"${key}" is "${value}"; it is one of ${values.join(", ")}`);
    return value as T;
  };
  const priority = Number(text("priority"));
  if (!Number.isInteger(priority) || priority < 1) throw new Error(`"priority" is "${text("priority")}"; it is a whole number from 1`);
  const needs = list("needs");
  for (const need of needs)
    if (!(NEEDS as readonly string[]).includes(need)) throw new Error(`"needs" holds "${need}"; it holds ${NEEDS.join(", ")}`);
  return {
    id: text("id"),
    title: text("title"),
    status: among("status", STATUSES),
    kind: among("kind", KINDS),
    priority,
    parent: text("parent"),
    rfc: text("rfc"),
    step: text("step"),
    dependsOn: list("depends-on"),
    writes: list("writes"),
    appends: list("appends"),
    needs: needs as Fields["needs"],
    checks: list("checks"),
    created: text("created"),
  };
}

/** The lines of each section, by its heading; a heading out of order or missing is refused. */
function sectionsOf(body: string[]): Record<Section, string[]> {
  const found = {} as Record<Section, string[]>;
  let next = 0;
  let current: string[] | undefined;
  for (const line of body) {
    const heading = SECTIONS[next];
    if (heading !== undefined && line === `## ${heading}`) {
      current = found[heading] = [];
      next++;
    } else if (current) {
      current.push(line);
    } else if (line.trim() !== "") {
      throw new Error(`"${line}" is above the first section, "## ${SECTIONS[0]}"`);
    }
  }
  if (next < SECTIONS.length)
    throw new Error(`the section "## ${SECTIONS[next]}" is missing, or is not after "## ${SECTIONS[next - 1] ?? "the frontmatter"}"`);
  return found;
}

const prose = (lines: string[]) => lines.join("\n").trim();

function subtasksOf(lines: string[]): Subtask[] {
  return lines.flatMap((line) => {
    const item = /^- \[([ x])\] (.+)$/.exec(line);
    if (item) return [{ done: item[1] === "x", title: item[2]!.trim() }];
    if (line.trim() === "" || line.trim() === NO_SUBTASK) return [];
    throw new Error(`"${line}" under "## Subtasks" is not "- [ ] a title" or "- [x] a title"`);
  });
}

const TIME = String.raw`(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})`;
const ENTRY = new RegExp(`^### ${TIME}, (\\S+)$`);
const ANSWER = new RegExp(`^#### Answered ${TIME}$`);
const iso = (day: string, time: string) => `${day}T${time}Z`;
const heading = (at: string) => `${at.slice(0, 10)} ${at.slice(11, 19)}`;

/** The entries under headings of the form `### YYYY-MM-DD HH:MM:SS, <worker>`, the time in UTC. */
function entriesOf(lines: string[], section: Section, none: string): { at: string; by: string; lines: string[] }[] {
  const entries: { at: string; by: string; lines: string[] }[] = [];
  for (const line of lines) {
    const match = ENTRY.exec(line);
    if (match) entries.push({ at: iso(match[1]!, match[2]!), by: match[3]!, lines: [] });
    else if (entries.length) entries.at(-1)!.lines.push(line);
    else if (line.trim() !== "" && line.trim() !== none)
      throw new Error(`"${line}" under "## ${section}" is above its first entry; an entry starts with "### YYYY-MM-DD HH:MM:SS, <worker>"`);
  }
  return entries;
}

function questionsOf(lines: string[]): Question[] {
  return entriesOf(lines, "Questions", NO_QUESTION).map((entry) => {
    const at = entry.lines.findIndex((line) => ANSWER.test(line));
    const asked = at < 0 ? entry.lines : entry.lines.slice(0, at);
    const from = asked.findIndex((line) => line === "Choices:");
    const question: Question = {
      at: entry.at,
      by: entry.by,
      text: prose(from < 0 ? asked : asked.slice(0, from)),
      choices: from < 0 ? [] : asked.slice(from + 1).flatMap((line) => (/^- (.+)$/.exec(line)?.[1] ? [/^- (.+)$/.exec(line)![1]!.trim()] : [])),
    };
    if (at >= 0) {
      const answered = ANSWER.exec(entry.lines[at]!)!;
      question.answeredAt = iso(answered[1]!, answered[2]!);
      question.answer = prose(entry.lines.slice(at + 1));
    }
    return question;
  });
}

/** Reads a task file; throws an Error that says what is wrong with it. */
export function parseTask(text: string): Task {
  const lines = text.split("\n");
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end < 0) throw new Error("no frontmatter between two lines of ---");
  const sections = sectionsOf(lines.slice(end + 1));
  return {
    fields: fieldsOf(frontmatter(lines.slice(1, end))),
    context: prose(sections.Context),
    doneWhen: prose(sections["Done when"]),
    outOfScope: prose(sections["Out of scope"]),
    subtasks: subtasksOf(sections.Subtasks),
    questions: questionsOf(sections.Questions),
    log: entriesOf(sections.Log, "Log", NO_ENTRY).map((entry): LogEntry => ({ at: entry.at, by: entry.by, text: prose(entry.lines) })),
  };
}

const PLAIN = /^[A-Za-z0-9][A-Za-z0-9._/@:+ -]*$/;
const written = (value: string) => (PLAIN.test(value) && !/^\d+$/.test(value) && !value.endsWith(" ") ? value : quoted(value));

function renderFields(fields: Fields): string[] {
  const list = (key: string, items: string[]) => (items.length ? [`${key}:`, ...items.map((item) => `  - ${quoted(item)}`)] : [`${key}: []`]);
  const text = (key: string, value: string) => (value === "" ? `${key}:` : `${key}: ${written(value)}`);
  return [
    `id: ${fields.id}`,
    `title: ${quoted(fields.title)}`,
    `status: ${fields.status}`,
    `kind: ${fields.kind}`,
    `priority: ${fields.priority}`,
    text("parent", fields.parent),
    fields.rfc === "" ? "rfc:" : `rfc: ${quoted(fields.rfc)}`,
    text("step", fields.step),
    ...list("depends-on", fields.dependsOn),
    ...list("writes", fields.writes),
    ...list("appends", fields.appends),
    ...list("needs", fields.needs),
    ...list("checks", fields.checks),
    `created: ${fields.created}`,
  ];
}

/** Writes a task as its file's text, in the one form every task file has. */
export function renderTask(task: Task): string {
  const section = (name: Section, body: string) => [`## ${name}`, "", body, ""];
  const subtasks = task.subtasks.map((sub) => `- [${sub.done ? "x" : " "}] ${sub.title}`).join("\n");
  const questions = task.questions
    .map((q) =>
      [
        `### ${heading(q.at)}, ${q.by}`,
        "",
        q.text,
        ...(q.choices.length ? ["", "Choices:", "", ...q.choices.map((choice) => `- ${choice}`)] : []),
        ...(q.answeredAt ? ["", `#### Answered ${heading(q.answeredAt)}`, "", q.answer ?? ""] : []),
      ].join("\n"),
    )
    .join("\n\n");
  const log = task.log.map((entry) => `### ${heading(entry.at)}, ${entry.by}\n\n${entry.text}`).join("\n\n");
  return [
    "---",
    ...renderFields(task.fields),
    "---",
    "",
    ...section("Context", task.context || TO_BE_WRITTEN),
    ...section("Done when", task.doneWhen || TO_BE_WRITTEN),
    ...section("Out of scope", task.outOfScope || TO_BE_WRITTEN),
    ...section("Subtasks", subtasks || NO_SUBTASK),
    ...section("Questions", questions || NO_QUESTION),
    ...section("Log", log || NO_ENTRY),
  ]
    .join("\n")
    .replace(/\n+$/, "\n");
}

/** The name of a task's file: its id and its title in lower-case words. */
export function fileName(fields: Pick<Fields, "id" | "title">): string {
  const words = fields.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
  return `${fields.id}${words ? `-${words}` : ""}.md`;
}
