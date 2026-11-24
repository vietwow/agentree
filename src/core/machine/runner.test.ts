import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { runnerRuns, secondsOfElapsed, thisRunner } from "./runner.ts";

const HOUR_MS = 3_600_000;

test("the elapsed time ps prints is read in each of its forms", () => {
  assert.equal(secondsOfElapsed("05:07"), 307);
  assert.equal(secondsOfElapsed(" 1:02:03\n"), 3723);
  assert.equal(secondsOfElapsed("2-01:00:00"), 176_400);
  assert.equal(secondsOfElapsed("soon"), undefined);
});

test("this process runs as it names itself, and not as a process that started an hour before with its id", () => {
  const runner = thisRunner();
  assert.equal(runnerRuns(runner), true);
  assert.equal(runnerRuns({ pid: runner.pid, since: new Date(Date.parse(runner.since) - HOUR_MS).toISOString() }), false);
});

test("a process that ended does not run, and one that runs does only with the start it had", async () => {
  const ended = spawnSync("true").pid;
  assert.equal(runnerRuns({ pid: ended, since: new Date().toISOString() }), false);
  const child = spawn("sleep", ["30"], { stdio: "ignore" });
  const since = new Date().toISOString();
  try {
    assert.equal(runnerRuns({ pid: child.pid!, since }), true);
    assert.equal(runnerRuns({ pid: child.pid!, since: new Date(Date.parse(since) - HOUR_MS).toISOString() }), false);
  } finally {
    child.kill();
    await once(child, "exit");
  }
  assert.equal(runnerRuns({ pid: child.pid!, since }), false);
});

test("a record whose runner is not a process does not run", () => {
  assert.equal(runnerRuns({ pid: 0, since: new Date().toISOString() }), false);
  assert.equal(runnerRuns({ pid: process.pid, since: "never" }), false);
});
