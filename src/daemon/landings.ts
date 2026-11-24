/**
 * The landings of accepted tasks, run by the daemon: one at a time a
 * project, in the order they were accepted, the setup and the checks of a
 * rebase through the machine's queue before every run that waits but
 * another landing's.
 */
import type { Context } from "../core/board/actions.ts";
import { configOf } from "../core/board/config.ts";
import { landBatchThrough, landThrough, waitingToLand } from "../core/board/lifecycle.ts";
import { submissionOf, type CheckRun } from "../core/board/state.ts";
import { Refusal } from "../core/errors.ts";
import { askFor } from "./asks.ts";
import type { Queue } from "./queue.ts";

/** Runs a landing's setup and checks in its tree through the machine's queue, before every run that waits but another landing's. */
async function inQueue(project: string, context: Context, queue: Queue, task: string, by: string, tree: string, setup: string[], checks: string[]) {
  const runs: CheckRun[] = [];
  // A setup is heavy, as at a claim: an install takes the processors and the disk a check would.
  for (const [command, heavy] of [...setup.map((each) => [each, true] as const), ...checks.map((each) => [each, undefined] as const)]) {
    const ran = await queue.run({
      ...askFor(context.places, { project, task, by, what: "check", command, cwd: tree, ...(heavy ? { heavy } : {}) }),
      first: true,
    });
    runs.push({ command, result: ran.result, tookMs: ran.tookMs, waitedMs: ran.waitedMs, output: ran.output });
  }
  return runs;
}

/** The projects whose landings run now: a project lands one task at a time however often the daemon looks. */
const landing = new Set<string>();

/** Lands the accepted tasks of a project that wait; resolves when each was tried once. */
export async function runWaitingLandings(project: string, context: Context, queue: Queue): Promise<void> {
  if (landing.has(project)) return;
  landing.add(project);
  try {
    // Several accepted tasks are checked and landed together when the project's part says so; what a batch does not land, lands singly below.
    const { landBatch } = configOf(context.places);
    if (landBatch >= 2) {
      const [first] = waitingToLand(context);
      const by = first ? (submissionOf(context.places, first)?.by ?? "") : "";
      await landBatchThrough(context, landBatch, ({ setup, checks, tree }) =>
        inQueue(project, context, queue, first!, by, tree, setup, checks),
      ).catch((error: unknown) => {
        if (!(error instanceof Refusal)) throw error;
        return [];
      });
    }
    for (const id of waitingToLand(context)) {
      const by = submissionOf(context.places, id)?.by ?? "";
      try {
        await landThrough(context, id, ({ setup, checks, tree }) => inQueue(project, context, queue, id, by, tree, setup, checks));
      } catch (error) {
        // Another lander held the lock, or main moved during each check: the task is still accepted, and a later look lands it.
        if (!(error instanceof Refusal)) throw error;
      }
    }
  } finally {
    landing.delete(project);
  }
}
