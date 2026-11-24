/**
 * The records of a project on disk: a directory a part, with `base.json`
 * (every element at rest) and a file a state holding only what differs
 * from its base. A reading of the reference is written once: a value a
 * record holds is not measured again.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CloneConfig } from "../board/config.ts";
import { Refusal } from "../errors.ts";
import { differenceOf, elementsOf, type Element, type PartRecord } from "./record.ts";

/** A part's name and a state's: a file's name, in small letters. */
const NAME = /^[a-z0-9][a-z0-9-]*$/;

const fileOf = (root: string, config: CloneConfig, part: string, state: string) => join(root, config.records, part, `${state}.json`);

/** A record of a part's state as its file holds it. */
export function recordOf(root: string, config: CloneConfig, part: string, state: string): PartRecord {
  const file = fileOf(root, config, part, state);
  if (!existsSync(file)) throw new Refusal(`${file} is not there: the part ${part} has no record of the state ${state}`);
  return JSON.parse(readFileSync(file, "utf8")) as PartRecord;
}

/** The elements of a state in full. A difference names the state it differs from, which may be a difference itself: each is read on the one before it. */
export function wholeOf(root: string, config: CloneConfig, part: string, state: string): { record: PartRecord; elements: Element[] } {
  const record = recordOf(root, config, part, state);
  return { record, elements: elementsOf(record, record.base === undefined ? undefined : wholeOf(root, config, part, record.base).elements) };
}

/** What a session read of the reference: every element the state shows, as the reader gave them. */
export type Reading = {
  part: string;
  /** `base` for the part at rest. */
  state: string;
  /** The state this one differs from; `base` when it names none. */
  base?: string;
  /** The address it was read at. */
  source: string;
  viewport: { width: number; height: number };
  theme: string;
  elements: Element[];
  /** What was not read, each with its reason. */
  notMeasured?: { id: string; reason: string }[];
};

/**
 * Writes a reading as the record of its state, under a checkout's records:
 * the part at rest whole, any other state as its difference from its base.
 * The address is kept without its query string, which may hold what
 * identifies a session.
 */
export function writeRecord(root: string, config: CloneConfig, reading: Reading, now: Date): { file: string; record: PartRecord } {
  const { part, state } = reading;
  for (const [what, name] of [
    ["part", part],
    ["state", state],
  ] as const)
    if (!NAME.test(name ?? "")) throw new Refusal(`a ${what}'s name is small letters, digits and "-", as it names a file; "${name}" is not`);
  if (!Array.isArray(reading.elements) || reading.elements.length === 0)
    throw new Refusal("a reading holds the elements the reader gave, and this one holds none");
  const ids = new Set<string>();
  for (const element of reading.elements) {
    if (typeof element?.id !== "string" || typeof element.tag !== "string" || typeof element.style !== "object")
      throw new Refusal("an element of a reading is as the reader gives it: its id, its tag, its style; write none by hand");
    if (element.id !== part && !element.id.startsWith(`${part}/`))
      throw new Refusal(`the element ${element.id} is not of the part ${part}: an id is a path that starts with its part`);
    if (ids.has(element.id)) throw new Refusal(`two elements have the id ${element.id}: an id is unique within a part`);
    ids.add(element.id);
  }
  const { width, height } = reading.viewport ?? {};
  if (!Number.isInteger(width) || !Number.isInteger(height)) throw new Refusal("a reading names its viewport, as 1440x900");
  if (!/^https?:\/\//.test(reading.source ?? "")) throw new Refusal("a reading names the address it was read at");
  const file = fileOf(root, config, part, state);
  if (existsSync(file)) throw new Refusal(`${file} is there already: a value a record holds is not measured again`);
  const base = state === "base" ? undefined : (reading.base ?? "base");
  if (base === state) throw new Refusal(`the state ${state} cannot differ from itself`);
  const record: PartRecord = {
    part,
    state,
    ...(base === undefined ? {} : { base }),
    capturedAt: now.toISOString(),
    source: reading.source.split(/[?#]/)[0]!,
    viewport: { width, height },
    theme: reading.theme || "light",
    elements: base === undefined ? reading.elements : differenceOf(wholeOf(root, config, part, base).elements, reading.elements),
    notMeasured: reading.notMeasured ?? [],
  };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(record, null, 1)}\n`);
  return { file, record };
}
