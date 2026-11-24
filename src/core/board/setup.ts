/** A tree's setup run where no daemon runs it: each command of the project's part, in the tree, by the shell. */
import { thisRunner } from "../machine/runner.ts";
import type { Context } from "./actions.ts";
import { configOf } from "./config.ts";
import { BOUND_MS, runInShell } from "./run.ts";
import { claimOf, putSetup, setupOf, type Setup } from "./state.ts";

/** Runs the setup that waits for a claimed task's tree, and says how it went; nothing when none waits. */
export function setUpTree(context: Context, id: string): Setup | undefined {
  const { places } = context;
  const hold = claimOf(places, id);
  if (!hold || setupOf(places, id)?.state !== "waiting") return setupOf(places, id);
  putSetup(places, id, { state: "running", output: "", runner: thisRunner("command", configOf(places).setup.length * BOUND_MS) });
  let said = "";
  for (const command of configOf(places).setup) {
    const ran = (context.run ?? runInShell)(command, hold.tree);
    said = ran.output;
    if (!ran.ok) {
      const failed: Setup = { state: "failed", output: `\`${command}\` ${ran.timedOut ? "ran into its bound" : "failed"}:\n${ran.output}` };
      putSetup(places, id, failed);
      return failed;
    }
  }
  const done: Setup = { state: "done", output: said };
  putSetup(places, id, done);
  return done;
}
