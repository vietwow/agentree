import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type { Context } from "../board/actions.ts";
import { readBoard } from "../board/store.ts";
import { CODEX, project, type Project } from "../board/testing.ts";
import { Refusal } from "../errors.ts";
import { git } from "../git.ts";
import { prepareIconRun, takeIconSet, type IconRequest } from "./icons.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
  process.env.AGENTREE_HOME = join(at.home, "machine");
});

afterEach(() => at.remove());

const REQUEST: IconRequest = {
  page: "https://app.example.com/catalog",
  where: "Press + Blueprint, then the Icon field to open the picker",
  set: "picker",
};
const refused = (run: () => unknown, words: RegExp) => assert.throws(run, (error) => error instanceof Refusal && words.test(error.message));

test("a run's folder holds the owner's template filled as its only rules, the script, and nothing of the project; its request is a card", () => {
  const { folder, task } = prepareIconRun(context, CODEX, { ...REQUEST, colour: "keep currentColor" });
  assert.equal(folder, join(at.home, "machine/icon-runs/project-picker"));
  const rules = readFileSync(join(folder, "AGENTS.md"), "utf8");
  assert.match(rules, /^- Trang: https:\/\/app\.example\.com\/catalog$/m);
  assert.match(rules, /^- Icon nằm ở đâu: Press \+ Blueprint, then the Icon field to open the picker$/m);
  assert.match(rules, /^- Tên bộ: `picker`$/m);
  assert.match(rules, /^- Phạm vi:$/m, "a line left empty takes the template's own default");
  assert.match(rules, /^- Màu: keep currentColor$/m);
  assert.ok(rules.includes(`- Thư mục dự án: ${folder}`));
  assert.ok(rules.includes("## Quy trình"), "the template's own steps are kept as written");
  assert.ok(
    rules.trimEnd().endsWith(readFileSync(join(import.meta.dirname, "../../../seed/icon-grab/usage-and-rights.md"), "utf8").trim()),
    "the statement of rights follows the seven lines' template",
  );
  assert.equal(readFileSync(join(folder, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
  assert.ok(existsSync(join(folder, "tools/split_icons.py")));
  assert.ok(!existsSync(join(folder, ".mcp.json")) && !folder.startsWith(context.places.root));
  assert.deepEqual(
    [task.fields.kind, task.fields.status, task.fields.needs, task.fields.title],
    ["assets", "backlog", ["browser", "owner"], "Fetch the icons of the set picker"],
  );
  assert.ok(task.context.includes(`The folder of the run: ${folder}`));
  assert.equal(readBoard(context.places).tasks.length, 1);
});

test("a run is refused that would write into a set again, read a rules file above it, or send a statement of rights that does not hold", () => {
  prepareIconRun(context, CODEX, REQUEST);
  refused(() => prepareIconRun(context, CODEX, REQUEST), /a set is never written into again/);
  refused(() => prepareIconRun(context, CODEX, { ...REQUEST, set: "Side Bar" }), /a set's name is short/);
  refused(() => prepareIconRun(context, CODEX, { ...REQUEST, set: "sidebar", page: "app.example.com" }), /the page is an address/);
  git(context.places.root, "remote", "add", "origin", "https://example.com/repo.git");
  refused(() => prepareIconRun(context, CODEX, { ...REQUEST, set: "sidebar", committed: true }), /say which of the two holds/);
  writeFileSync(join(at.home, "machine/AGENTS.md"), "Rules of something else.\n");
  refused(() => prepareIconRun(context, CODEX, { ...REQUEST, set: "sidebar" }), /AGENTS\.md is above the folder of the run/);
  assert.equal(readBoard(context.places).tasks.length, 1, "a refused run writes no card");
});

test("a set that came back is copied into a checkout as data: clean drawings only, none written over", () => {
  const { folder } = prepareIconRun(context, CODEX, REQUEST);
  const tree = at.context.places.root;
  refused(() => takeIconSet(tree, tree, "picker", "src/icons"), /has not come back/);
  mkdirSync(join(folder, "icons-picker"));
  mkdirSync(join(folder, "raw-picker"));
  refused(() => takeIconSet(tree, tree, "picker", "src/icons"), /holds no drawing/);
  writeFileSync(join(folder, "icons-picker/home.svg"), '<svg viewBox="0 0 24 24"><path d="M3 12l9-9 9 9"/></svg>');
  writeFileSync(join(folder, "icons-picker/user.svg"), '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/></svg>');
  writeFileSync(join(folder, "icons-picker/notes.md"), "Not a drawing.");
  writeFileSync(join(folder, "raw-picker/source.txt"), "https://app.example.com/catalog, 2026-11-24");
  for (const to of ["", "/tmp/icons", "../outside", "src/../../outside"])
    refused(() => takeIconSet(tree, tree, "picker", to), /is no directory of the tree/);

  const taken = takeIconSet(tree, tree, "picker", "src/icons");
  assert.deepEqual([taken.copied, taken.into], [["home.svg", "user.svg"], "src/icons"]);
  assert.deepEqual(readdirSync(join(tree, "src/icons")).sort(), ["home.svg", "source-picker.txt", "user.svg"]);
  refused(() => takeIconSet(tree, tree, "picker", "src/icons"), /src\/icons\/home\.svg is there already/);

  writeFileSync(join(folder, "icons-picker/bell.svg"), '<svg onload="alert(1)"><path d="M0 0"/></svg>');
  refused(() => takeIconSet(tree, tree, "picker", "src/other"), /bell\.svg of the set holds what would run in a page/);
  assert.equal(existsSync(join(tree, "src/other")), false, "nothing of a set that is not clean is copied");
});
