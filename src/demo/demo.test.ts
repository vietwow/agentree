import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { lintProblems } from "../core/board/rules.ts";
import { readMemory } from "../core/board/memory.ts";
import { readBoard, taskOf } from "../core/board/store.ts";
import { placesOfProject, projectOf } from "../core/machine/projects.ts";
import { documentsView } from "../core/views/documents.ts";
import { filesView } from "../core/views/files.ts";
import { agentsView, milestonesView, projectView } from "../core/views/project.ts";
import { taskDetailView, taskView } from "../core/views/tasks.ts";
import { demo } from "./demo.ts";

test("the demo makes four projects whose boards read as the sample the UI was built on", async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "agentree-demo-")));
  process.env.AGENTREE_HOME = join(home, "machine");
  const now = new Date("2026-11-24T15:00:00Z");
  const ids = await demo(join(home, "projects"), now);
  assert.deepEqual(ids, ["agentree", "aep", "icon-grab", "notes-sync"]);
  const views = ids.map((id) => projectView(projectOf(id), readBoard(placesOfProject(id))));
  assert.deepEqual(
    views.map((view) => [view.status, view.done, view.total, view.tools.length]),
    [
      ["active", 9, 32, 5],
      ["risk", 87, 128, 3],
      ["hold", 15, 18, 1],
      ["complete", 22, 22, 1],
    ],
  );

  const places = placesOfProject("agentree");
  const board = readBoard(places);
  assert.deepEqual([board.unreadable, lintProblems(board.tasks)], [[], []]);
  const row = (id: string) => taskView(places, taskOf(board, id).task);
  const detail = (id: string) => taskDetailView(board, taskOf(board, id).task, now);
  assert.deepEqual(
    [row("T-0012").status, row("T-0012").holder?.tool, row("T-0012").branch, row("T-0012").checks],
    ["checking", "claude-code", "task/T-0012", { total: 10, passed: 6, failed: 0, state: "running" }],
  );
  assert.deepEqual(detail("T-0012").tree?.diff, [
    { path: "src/slots/slots-tickets.test.ts", added: 75, removed: 27 },
    { path: "src/slots/slots-tickets.ts", added: 44, removed: 20 },
  ]);
  assert.deepEqual(
    detail("T-0012")
      .checkRuns.slice(5, 8)
      .map((run) => run.result),
    ["passed", "running", "queued"],
  );
  assert.deepEqual(
    [detail("T-0010").review?.verdict, detail("T-0009").review?.verdict, detail("T-0025").review?.verdict, detail("T-0025").review?.findings.length],
    ["pending", "accepted", "rejected", 2],
  );
  assert.equal(row("T-0032").landedAt, "2026-11-07T13:00:00Z");
  assert.equal(detail("T-0004").sessions.length, 2);

  assert.deepEqual([readMemory(places).facts.length, readMemory(places).unreadable], [12, []]);
  assert.deepEqual(
    documentsView(places).map((doc) => [doc.id, doc.status]),
    [
      ["rfc-0001", "draft"],
      ["rfc-0002", "draft"],
      ["adr-0000", "superseded"],
      ["adr-0001", "accepted"],
      ["adr-0002", "accepted"],
    ],
  );
  assert.deepEqual(
    milestonesView(board).map((milestone) => milestone.kind),
    ["epic", "document", "document"],
  );
  const areas = filesView(board).areas;
  assert.deepEqual([areas.length, areas[0]], [10, { path: "src/core", name: "Core", files: 44 }]);
  const sessions = agentsView(places, now);
  assert.deepEqual(
    [sessions.length, sessions.find((session) => session.id === "7f3a21")?.subagents.map((sub) => sub.state)],
    [24, ["checking", "ended", "ended"]],
  );
  rmSync(home, { recursive: true, force: true });
});
