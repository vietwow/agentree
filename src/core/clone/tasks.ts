/**
 * The two tasks of a part of a cloned interface, each from one template:
 * a task that measures the part on the reference, and a task that builds
 * it, which waits for the measure and whose check is the comparison.
 */
import { create, type Actor, type Context } from "../board/actions.ts";
import { CONFIG_FILE, configOf } from "../board/config.ts";
import { Refusal } from "../errors.ts";
import type { Task } from "../task/model.ts";

export type PartTasks = {
  part: string;
  priority: number;
  parent?: string;
  /** The paths the build task writes: the part's own files in the project. */
  writes?: string[];
};

export function partTasks(context: Context, actor: Actor, input: PartTasks): { measure: Task; build: Task } {
  const config = configOf(context.places).clone;
  if (!config) throw new Refusal(`the project's part (${CONFIG_FILE}) has no "clone": this project reproduces no interface`);
  const { part } = input;
  if (!/^[a-z0-9][a-z0-9-]*$/.test(part))
    throw new Refusal(`a part's name is small letters, digits and "-", as it names a directory; "${part}" is not`);
  const records = `${config.records.replace(/\/$/, "")}/${part}/`;
  const shared = { priority: input.priority, ...(input.parent ? { parent: input.parent } : {}) };
  const measure = create(context, actor, {
    ...shared,
    title: `Measure the ${part} of the reference`,
    kind: "measure",
    needs: ["browser", "reference-app"],
    writes: [records],
    context: `The project reproduces the ${part} of its reference. This task reads it there, in one session, into \`${records}\`: the skill agentree-measure holds the way, the record's form and the agreements about the reference, which is read-only.`,
    doneWhen: [
      `- \`${records}inventory.md\` lists every sub-part of the ${part} down to the leaves, and every state that appears only on interaction (pointed at, focused, pressed, open, selected, disabled, empty, loading, an error), each with the file that records it or the reason it is not recorded.`,
      `- \`${records}base.json\` holds the part at rest, and a file a state holds what differs from its base; each was written by \`agentree record\` from the reader's reading, none by hand.`,
      "- Every state was produced for real: a hover with the pointer, an open with a click, a close with Escape, a focus with a key press.",
      "- What was not read is listed as not measured, with its reason, and is filled in nowhere.",
      "- No record holds the owner's name, their organization, or what identifies a session.",
    ].join("\n"),
    outOfScope: "Building anything of the part. Saving, creating or deleting anything on the reference. A value taken from any other product.",
  });
  const build = create(context, actor, {
    ...shared,
    title: `Build the ${part} as its record`,
    kind: "build",
    dependsOn: [measure.fields.id],
    writes: input.writes ?? [],
    checks: [`agentree compare ${part}`],
    context: `The record of the ${part} is in \`${records}\`. Build the part so that its page reads as its record: each element the record holds is marked with its id in \`data-record\`, and \`${CONFIG_FILE}\` names the part's page and the steps that show each state (\`clone.parts.${part}\`).${config.colours === "own" || config.font === "own" ? ` ${[config.colours === "own" ? "The colours" : "", config.font === "own" ? "the font family" : ""].filter(Boolean).join(" and ").replace(/^t/, "T")} of this project are its own: the comparison leaves them out.` : ""}`,
    doneWhen: [
      `- \`agentree compare ${part}\` matches 100% at rest, and with \`--state\` for every state its record holds.`,
      `- A difference that stays is an exception under \`clone.exceptions\` with its stated reason; what is only not built yet is no exception.`,
      "- No value was measured again or taken from another product: a value the record lacks is asked for, as a question on this card.",
    ].join("\n"),
    outOfScope: `Changing a record under \`${records}\`. Any other part.`,
  });
  return { measure, build };
}
