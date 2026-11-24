import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { CONFIG_FILE, type CloneConfig } from "../board/config.ts";
import { readBoard } from "../board/store.ts";
import { CODEX, project, type Project } from "../board/testing.ts";
import { Refusal } from "../errors.ts";
import type { Element } from "./record.ts";
import { wholeOf, writeRecord, type Reading } from "./records.ts";
import { partTasks } from "./tasks.ts";

let at: Project;
let root: string;

beforeEach(() => {
  at = project();
  root = at.context.places.root;
});
afterEach(() => at.remove());

const CLONE: CloneConfig = { records: "parity", url: "http://127.0.0.1:5173", colours: "own", font: "reference", parts: { shell: { path: "/" } } };
const element = (id: string, more: Partial<Element> = {}): Element => ({
  id,
  tag: "div",
  role: "",
  name: "",
  text: "",
  box: { x: 0, y: 0, width: 10, height: 10 },
  style: { display: "flex" },
  attrs: {},
  ...more,
});
const REST = [element("shell"), element("shell/navigation"), element("shell/navigation/link[Home]", { tag: "a", role: "link", name: "Home" })];
const reading = (more: Partial<Reading> = {}): Reading => ({
  part: "shell",
  state: "base",
  source: "https://app.example.com/home?session=abc#top",
  viewport: { width: 1440, height: 900 },
  theme: "light",
  elements: REST,
  ...more,
});
const NOW = new Date("2026-11-24T10:00:00Z");
const refused = (run: () => unknown, words: RegExp) => assert.throws(run, (error) => error instanceof Refusal && words.test(error.message));

test("a reading at rest is written whole, and a state as what differs from its base; each reads back in full", () => {
  const { file, record } = writeRecord(root, CLONE, reading(), NOW);
  assert.equal(file, join(root, "parity/shell/base.json"));
  assert.deepEqual(
    [record.source, record.capturedAt, record.base, record.elements.length],
    ["https://app.example.com/home", "2026-11-24T10:00:00.000Z", undefined, 3],
  );
  const open = [...REST.slice(0, 2), { ...REST[2]!, attrs: { "aria-expanded": "true" } }, element("shell/menu", { role: "menu" })];
  const state = writeRecord(
    root,
    CLONE,
    reading({
      state: "menu-open",
      elements: open,
      notMeasured: [{ id: "shell/menu/menuitem[Admin]", reason: "It shows only for an administrator." }],
    }),
    NOW,
  );
  assert.deepEqual([state.record.base, state.record.elements.map((each) => each.id)], ["base", ["shell/navigation/link[Home]", "shell/menu"]]);
  const hover = [...open.slice(0, 3), element("shell/menu", { role: "menu", style: { display: "grid" } })];
  writeRecord(root, CLONE, reading({ state: "menu-hover", base: "menu-open", elements: hover }), NOW);
  assert.deepEqual(wholeOf(root, CLONE, "shell", "menu-hover").elements, hover, "a difference from a difference is read on the one before it");
  assert.equal((JSON.parse(readFileSync(join(root, "parity/shell/menu-open.json"), "utf8")) as { notMeasured: unknown[] }).notMeasured.length, 1);
});

test("a record is written once, and only from what the reader gave of its own part", () => {
  writeRecord(root, CLONE, reading(), NOW);
  refused(() => writeRecord(root, CLONE, reading(), NOW), /is there already: a value a record holds is not measured again/);
  refused(() => writeRecord(root, CLONE, reading({ state: "Open Menu" }), NOW), /a state's name is small letters/);
  refused(() => writeRecord(root, CLONE, reading({ part: "../shell" }), NOW), /a part's name is small letters/);
  refused(() => writeRecord(root, CLONE, reading({ state: "empty", elements: [] }), NOW), /holds none/);
  refused(() => writeRecord(root, CLONE, reading({ state: "other", elements: [element("page/header")] }), NOW), /is not of the part shell/);
  refused(() => writeRecord(root, CLONE, reading({ state: "twice", elements: [REST[0]!, REST[0]!] }), NOW), /two elements have the id shell/);
  refused(() => writeRecord(root, CLONE, reading({ state: "hand", elements: [{ id: "shell" } as Element] }), NOW), /write none by hand/);
  refused(() => writeRecord(root, CLONE, reading({ state: "far", base: "missing" }), NOW), /has no record of the state missing/);
  refused(() => writeRecord(root, CLONE, reading({ state: "nowhere", source: "" }), NOW), /names the address/);
  assert.equal(existsSync(join(root, "parity/shell/far.json")), false);
});

test("a part has two tasks from one template: its measure, and its build, which waits for it and is checked by the comparison", () => {
  refused(() => partTasks(at.context, CODEX, { part: "shell", priority: 2 }), /has no "clone"/);
  writeFileSync(join(root, CONFIG_FILE), JSON.stringify({ clone: CLONE }));
  const { measure, build } = partTasks(at.context, CODEX, { part: "shell", priority: 2, writes: ["src/shell/"] });
  assert.deepEqual(
    [measure.fields.kind, measure.fields.needs, measure.fields.writes, measure.fields.status],
    ["measure", ["browser", "reference-app"], ["parity/shell/"], "ready"],
  );
  assert.deepEqual(
    [build.fields.kind, build.fields.dependsOn, build.fields.checks, build.fields.writes, build.fields.status],
    ["build", [measure.fields.id], ["agentree compare shell"], ["src/shell/"], "backlog"],
  );
  assert.match(build.context, /The colours of this project are its own: the comparison leaves them out\./);
  assert.match(measure.doneWhen, /inventory\.md/);
  assert.equal(readBoard(at.context.places).tasks.length, 2);
  refused(() => partTasks(at.context, CODEX, { part: "Side Bar", priority: 2 }), /a part's name is small letters/);
});
