import assert from "node:assert/strict";
import { test } from "node:test";
import { compare, differenceOf, elementsOf, report, type Element, type PartRecord } from "./record.ts";

const element = (id: string, more: Partial<Element> = {}): Element => ({
  id,
  tag: "div",
  role: "",
  name: "",
  text: "",
  box: { x: 0, y: 0, width: 100, height: 40 },
  style: { display: "flex", color: "rgb(0, 0, 0)", "font-family": "Inter" },
  attrs: {},
  ...more,
});
const base = [
  element("shell"),
  element("shell/rail", { box: { x: 0, y: 40, width: 56, height: 800 } }),
  element("shell/rail/link[Home]", { tag: "a", role: "link", name: "Home", attrs: { "aria-current": "page" } }),
];
const record = (more: Partial<PartRecord>): PartRecord => ({
  part: "shell",
  state: "base",
  capturedAt: "2026-11-24T10:00:00Z",
  source: "https://app.example.com/",
  viewport: { width: 1440, height: 900 },
  theme: "light",
  elements: base,
  notMeasured: [],
  ...more,
});
const OWN = { colours: false, font: false };

test("a state that is a difference holds only what differs: it is read as its base with its changes", () => {
  const hover = record({
    state: "rail-item-hover",
    base: "base",
    elements: [
      { change: "modified", id: "shell/rail/link[Home]", style: { "background-color": "rgb(240, 240, 240)" } },
      { change: "added", ...element("shell/overlay[rail-item-hover]/tooltip", { role: "tooltip", text: "Home" }) },
      { change: "removed", id: "shell/rail" },
    ],
  });
  const shown = elementsOf(hover, base);
  assert.deepEqual(
    shown.map((each) => each.id),
    ["shell", "shell/rail/link[Home]", "shell/overlay[rail-item-hover]/tooltip"],
  );
  assert.deepEqual(shown[1]!.style, { display: "flex", color: "rgb(0, 0, 0)", "font-family": "Inter", "background-color": "rgb(240, 240, 240)" });
  assert.deepEqual([shown[1]!.role, shown[1]!.attrs], ["link", { "aria-current": "page" }], "what a change does not name stays as in the base");
  assert.equal(elementsOf(record({})), base);
  assert.throws(() => elementsOf(hover), /is a difference from base, which was not given/);
});

test("a page that reads as its record matches wholly, wherever the part sits in the window", () => {
  const moved = base.map((each) => ({ ...each, box: { ...each.box!, x: each.box!.x + 300, y: each.box!.y + 64.4 } }));
  const comparison = compare(base, moved, OWN);
  assert.deepEqual([comparison.differences, comparison.missing, comparison.matched], [[], [], comparison.compared]);
  assert.equal(report("shell", "base", comparison), `shell, base: ${comparison.compared} of ${comparison.compared} values match (100%).`);
});

test("each value that differs is named with what the page has and what the record has; a missing element is no difference of values", () => {
  const built = [
    base[0]!,
    element("shell/rail", {
      box: { x: 0, y: 40, width: 64, height: 800 },
      style: { display: "grid", color: "rgb(9, 9, 9)", "font-family": "Geist" },
    }),
  ];
  const comparison = compare(base, built, OWN);
  assert.deepEqual(comparison.differences, [
    { id: "shell/rail", what: "box.width", expected: "56", actual: "64" },
    { id: "shell/rail", what: "display", expected: "flex", actual: "grid" },
  ]);
  assert.deepEqual(comparison.missing, ["shell/rail/link[Home]"]);
  assert.match(
    report("shell", "base", comparison),
    /^shell, base: 16 of 18 values match \(88\.8%\); 1 elements are not on the page\.\n {2}missing {2}shell\/rail\/link\[Home\]\n {2}differs {2}shell\/rail {2}box\.width: 64, the record has 56\n/,
  );
});

test("the colours and the font are compared only when they are the reference's too, and an exception is left out with its reason", () => {
  const built = base.map((each) => ({ ...each, style: { ...each.style, color: "rgb(9, 9, 9)", "font-family": "Geist" } }));
  assert.deepEqual(compare(base, built, OWN).differences, []);
  assert.deepEqual(
    compare(base, built, { colours: true, font: true }).differences.map((each) => each.what),
    ["color", "font-family", "color", "font-family", "color", "font-family"],
  );
  const excepted = compare(base, built, { colours: true, font: true, exceptions: { "shell/rail": "The rail is the project's own by ADR 0003." } });
  assert.deepEqual([...new Set(excepted.differences.map((each) => each.id))], ["shell", "shell/rail/link[Home]"]);
});

test("the difference of a state from its base, applied to the base, is the state", () => {
  const shown = [
    base[0]!,
    { ...base[2]!, style: { ...base[2]!.style, color: "rgb(1, 2, 3)" }, attrs: {} },
    element("shell/overlay[menu]/menu", { role: "menu" }),
  ];
  const difference = differenceOf(base, shown);
  assert.deepEqual(
    difference.map((each) => [each.change, each.id]),
    [
      ["modified", "shell/rail/link[Home]"],
      ["added", "shell/overlay[menu]/menu"],
      ["removed", "shell/rail"],
    ],
  );
  assert.deepEqual(difference[0], { change: "modified", id: "shell/rail/link[Home]", attrs: {}, style: { color: "rgb(1, 2, 3)" } });
  assert.deepEqual(elementsOf(record({ state: "menu", base: "base", elements: difference }), base), shown);
  assert.deepEqual(differenceOf(base, base), []);
});
