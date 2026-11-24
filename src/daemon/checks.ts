/**
 * The checks of a submit, run by the daemon after the submit returned: each
 * task that is `checking` and whose checks wait has them run through the
 * machine's queue, a heavy one in its turn, and is settled on the results.
 */
import type { Context } from "../core/board/actions.ts";
import { checksToRun, settleChecks } from "../core/board/lifecycle.ts";
import { checksOf, putChecks, setupOf, submissionOf, type CheckRun } from "../core/board/state.ts";
import { readBoard } from "../core/board/store.ts";
import { runnerRuns } from "../core/machine/runner.ts";
import { askFor } from "./asks.ts";
import type { Queue } from "./queue.ts";

/** The tasks whose checks run now, by project and id: a task's checks run once however often the daemon looks. */
const running = new Set<string>();

/**
 * Starts the checks that wait on a project's board; resolves when each task
 * it started is settled. Checks left running by a process that ended (a
 * daemon that stopped, a command that ran them itself and was killed) wait
 * again first, so that the task is settled and never stays `checking`.
 */
export function runWaitingChecks(project: string, context: Context, queue: Queue): Promise<void> {
  const tasks = readBoard(context.places).tasks.map((stored) => stored.task);
  for (const { fields } of tasks) {
    const checks = checksOf(context.places, fields.id);
    if (
      fields.status === "checking" &&
      checks?.state === "running" &&
      checks.runner &&
      !running.has(`${project} ${fields.id}`) &&
      !runnerRuns(checks.runner)
    )
      putChecks(context.places, fields.id, { commit: checks.commit, state: "queued", runs: [] });
  }
  const waiting = tasks.filter(
    (task) =>
      task.fields.status === "checking" &&
      checksOf(context.places, task.fields.id)?.state === "queued" &&
      !running.has(`${project} ${task.fields.id}`) &&
      // A check runs in a tree that is set up: one whose setup still runs waits for it.
      !["waiting", "running"].includes(setupOf(context.places, task.fields.id)?.state ?? ""),
  );
  return Promise.all(
    waiting.map(async ({ fields }) => {
      const key = `${project} ${fields.id}`;
      running.add(key);
      try {
        const { task, tree } = checksToRun(context, fields.id);
        const by = submissionOf(context.places, fields.id)?.by ?? "";
        const runs: CheckRun[] = [];
        for (const command of task.fields.checks) {
          const ran = await queue.run(askFor(context.places, { project, task: fields.id, by, what: "check", command, cwd: tree }));
          runs.push({ command, result: ran.result, tookMs: ran.tookMs, waitedMs: ran.waitedMs, output: ran.output });
        }
        settleChecks(context, fields.id, runs);
      } finally {
        running.delete(key);
      }
    }),
  ).then(() => undefined);
}
