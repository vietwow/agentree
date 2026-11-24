import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { CloneConfig } from "../core/board/config.ts";
import { differenceOf, type Element, type PartRecord } from "../core/clone/record.ts";
import { comparePart, inPage } from "./compare.ts";

/** A small reference: a rail with two links, the first with a drawing; a link takes a ground under the pointer. */
const page = (marked: boolean, railWidth = 56) => {
  const id = (path: string) => (marked ? ` data-record="${path}"` : "");
  return `<!doctype html><style>
    body { margin: 0; font-family: Arial; }
    nav { width: ${railWidth}px; display: flex; flex-direction: column; gap: 4px; padding: 8px; }
    a { display: flex; height: 32px; border-radius: 6px; color: rgb(20, 20, 20); }
    a:hover { background-color: rgb(230, 230, 230); }
  </style><main id="part"${id("shell")}><nav aria-label="Pages"${id("shell/navigation[Pages]")}>
    <a href="/home?tab=1" aria-current="page"${id("shell/navigation[Pages]/link[Home]")}><svg viewBox="0 0 24 24" width="16" height="16"${id("shell/navigation[Pages]/link[Home]/icon")}><path d="M3 12l9-9 9 9"/></svg>Home</a>
    <a href="/tasks"${id("shell/navigation[Pages]/link[Tasks]")}>Tasks</a>
  </nav></main>`;
};
const address = (html: string) => `data:text/html,${encodeURIComponent(html)}`;
const VIEW = { viewport: { width: 800, height: 600 }, theme: "light" };
const HOVER = [{ hover: "a[href='/tasks']" }];

let root: string;
let available = true;
let base: Element[];

before(async () => {
  root = mkdtempSync(join(tmpdir(), "agentree-compare-"));
  mkdirSync(join(root, "parity/shell"), { recursive: true });
  const capture = "window.__agentree.capture(document.querySelector('#part'), 'shell')";
  try {
    base = await inPage<Element[]>({ url: address(page(false)), ...VIEW }, capture);
  } catch {
    available = false;
    return;
  }
  const hovered = await inPage<Element[]>({ url: address(page(false)), ...VIEW, steps: HOVER }, capture);
  const record = (state: string, more: Partial<PartRecord>): PartRecord => ({
    part: "shell",
    state,
    capturedAt: "2026-11-24T10:00:00Z",
    source: "https://reference.example.com/",
    ...VIEW,
    elements: base,
    notMeasured: [],
    ...more,
  });
  writeFileSync(join(root, "parity/shell/base.json"), JSON.stringify(record("base", {})));
  writeFileSync(
    join(root, "parity/shell/tasks-hover.json"),
    JSON.stringify(record("tasks-hover", { base: "base", elements: differenceOf(base, hovered) })),
  );
});

after(() => rmSync(root, { recursive: true, force: true }));

const config = (html: string): CloneConfig => ({
  records: "parity",
  url: address(html),
  colours: "reference",
  font: "reference",
  parts: { shell: { path: "", states: { "tasks-hover": HOVER } } },
});
const skip = () => (available ? false : "no browser of Playwright's is installed here");

test("the reader gives each element an id that is a path, its role, its name, its box, its style and its state", { skip: skip() }, () => {
  assert.deepEqual(
    base.map((element) => element.id),
    [
      "shell",
      "shell/navigation[Pages]",
      "shell/navigation[Pages]/link[Home]",
      "shell/navigation[Pages]/link[Home]/icon",
      "shell/navigation[Pages]/link[Tasks]",
    ],
  );
  const home = base[2]!;
  assert.deepEqual([home.tag, home.role, home.name, home.text, home.attrs], ["a", "link", "Home", "Home", { "aria-current": "page", href: "/home" }]);
  assert.deepEqual(home.box, { x: 8, y: 8, width: 56, height: 32 });
  assert.deepEqual([home.style["border-top-left-radius"], home.style.color, home.style.display], ["6px", "rgb(20, 20, 20)", "flex"]);
  assert.deepEqual(
    [base[3]!.icon?.inline, base[3]!.icon?.viewBox, base[3]!.icon?.shapes, typeof base[3]!.icon?.hash],
    [true, "0 0 24 24", 1, "string"],
  );
});

test("a page built as its reference matches its record wholly, at rest and in a state its steps show for real", { skip: skip() }, async () => {
  const rest = await comparePart(root, config(page(true)), "shell");
  assert.deepEqual([rest.comparison.differences, rest.comparison.missing], [[], []]);
  assert.match(rest.text, /^shell, base: (\d+) of \1 values match \(100%\)\.$/);
  const hover = await comparePart(root, config(page(true)), "shell", "tasks-hover");
  assert.deepEqual([hover.comparison.differences, hover.comparison.missing], [[], []]);
});

test("a page that differs is told each value that differs, and a state without its steps is refused", { skip: skip() }, async () => {
  const wider = await comparePart(root, config(page(true, 72)), "shell");
  assert.ok(
    wider.comparison.differences.some(
      (each) => each.id === "shell/navigation[Pages]" && each.what === "width" && each.expected === "56px" && each.actual === "72px",
    ),
  );
  assert.match(wider.text, /differs {2}shell\/navigation\[Pages\] {2}box\.width: 88, the record has 72/);
  const unmarked = await comparePart(root, config(page(false)), "shell");
  assert.equal(unmarked.comparison.missing.length, 5, "a page that marks nothing shows nothing to compare");
  await assert.rejects(
    comparePart(root, { ...config(page(true)), parts: { shell: { path: "" } } }, "shell", "tasks-hover"),
    /names no steps that show the state tasks-hover/,
  );
  await assert.rejects(comparePart(root, config(page(true)), "shell", "open"), /has no record of the state open/);
});
