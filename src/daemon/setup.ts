/**
 * A tree's setup, run by the daemon at its claim while the worker reads its
 * task: the commands the project's part names, in the tree, in the
 * project's container when it has one. The volumes of a tree that is gone
 * are removed after it.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { Context } from "../core/board/actions.ts";
import { configOf } from "../core/board/config.ts";
import { treeOf } from "../core/board/places.ts";
import { runnerRuns, thisRunner } from "../core/machine/runner.ts";
import { claims, putSetup, setupOf } from "../core/board/state.ts";
import { askFor, taskOfVolume, volumePrefix } from "./asks.ts";
import type { Queue } from "./queue.ts";

/** The trees whose setup runs now, by project and task. */
const running = new Set<string>();

/**
 * Starts the setups that wait on a project; resolves when each one it
 * started ended. A setup left running by a process that ended waits again
 * first, so that it runs to its end.
 */
export function runWaitingSetups(project: string, context: Context, queue: Queue): Promise<void> {
  const { places } = context;
  for (const [id] of claims(places)) {
    const setup = setupOf(places, id);
    if (setup?.state === "running" && setup.runner && !running.has(`${project} ${id}`) && !runnerRuns(setup.runner))
      putSetup(places, id, { state: "waiting", output: "" });
  }
  const waiting = [...claims(places)].filter(([id]) => setupOf(places, id)?.state === "waiting" && !running.has(`${project} ${id}`));
  return Promise.all(
    waiting.map(async ([id, hold]) => {
      const key = `${project} ${id}`;
      running.add(key);
      try {
        putSetup(places, id, { state: "running", output: "", runner: thisRunner("daemon") });
        let output = "";
        for (const command of configOf(places).setup) {
          // A setup is heavy: an install takes the processors and the disk a check would.
          const ran = await queue.run(
            askFor(places, { project, task: id, by: hold.by, what: "command", command, cwd: hold.tree, heavy: true, keepOutput: true }),
          );
          output = ran.output;
          if (ran.result !== "passed")
            return putSetup(places, id, {
              state: "failed",
              output: `\`${command}\` ${ran.result === "failed" ? "failed" : "ran into its bound"}:\n${ran.output}`,
            });
        }
        putSetup(places, id, { state: "done", output });
      } finally {
        running.delete(key);
      }
    }),
  ).then(() => undefined);
}

/** Removes the volumes of a project's trees that are no longer there; nothing where Docker does not answer. */
export function removeLeftVolumes(project: string, context: Context) {
  if (!configOf(context.places).image || !configOf(context.places).volumes.length) return;
  const listed = spawnSync("docker", ["volume", "ls", "--quiet", "--filter", `name=${volumePrefix(project)}`], { encoding: "utf8" });
  if (listed.status !== 0) return;
  for (const name of listed.stdout.split("\n").filter(Boolean)) {
    const task = taskOfVolume(project, name);
    if (task && !existsSync(treeOf(context.places, task))) spawnSync("docker", ["volume", "rm", name], { stdio: "ignore" });
  }
}
