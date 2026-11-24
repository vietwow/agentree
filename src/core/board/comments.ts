/**
 * Review on the diff: what a task in review changed, file by file, and the
 * comments made on its lines. A comment is a finding: a rejection writes
 * each into its entry, and a task with comments is not accepted.
 */
import { Refusal } from "../errors.ts";
import { git } from "../git.ts";
import { stamp } from "../task/model.ts";
import type { Actor, Context } from "./actions.ts";
import type { Places } from "./places.ts";
import { commentsOf, putComments, submissionOf, type Comment, type Submission } from "./state.ts";
import { readBoard, taskOf } from "./store.ts";

/** The submission of a task that is in review; another task has no diff to read here. */
function reviewed(places: Places, id: string): Submission {
  const { status } = taskOf(readBoard(places), id).task.fields;
  const submission = submissionOf(places, id);
  if (status !== "review" || !submission) throw new Refusal(`${id} is ${status}: its diff is read, and commented, while it is in review`);
  return submission;
}

export type FileDiff = { path: string; patch: string };

/** What the submission changed from its base, a patch a file, as git gives it. */
export function diffOf(places: Places, id: string): FileDiff[] {
  const { base, commit } = reviewed(places, id);
  const paths = git(places.root, "diff", "--name-only", base, commit).split("\n").filter(Boolean);
  return paths.map((path) => ({ path, patch: git(places.root, "diff", "--no-color", "--unified=3", base, commit, "--", path) }));
}

/** The lines of the file after the change that a patch shows: those added, and those of its context. */
function shown(patch: string): Set<number> {
  const lines = new Set<number>();
  let at = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk) at = Number(hunk[1]);
    else if (at && (line.startsWith("+") || line.startsWith(" "))) lines.add(at++);
  }
  return lines;
}

/** Adds a comment on a line the diff shows. The owner comments, or a session that did not build the task. */
export function comment(context: Context, actor: Actor, id: string, on: { file: string; line: number; text: string }): Comment[] {
  const { places } = context;
  const submission = reviewed(places, id);
  if (!actor.owner && submission.session === actor.session)
    throw new Refusal(`${id} was built by this session: a session does not review the task it built`);
  if (on.text.trim() === "") throw new Refusal("a comment says what is wrong, so that the worker can check it; it is empty");
  const file = diffOf(places, id).find((each) => each.path === on.file);
  if (!file) throw new Refusal(`${on.file} is not a file ${id} changed`);
  if (!shown(file.patch).has(on.line))
    throw new Refusal(`line ${on.line} of ${on.file} is not in the diff: a comment is on a line the diff shows, added or beside one`);
  const comments = [...commentsOf(places, id), { file: on.file, line: on.line, text: on.text.trim(), by: actor.worker, at: stamp(context.now()) }];
  putComments(places, id, comments);
  return comments;
}

/** Removes a comment by its place in the list; its maker does, or the owner. */
export function uncomment(context: Context, actor: Actor, id: string, index: number): Comment[] {
  const comments = commentsOf(context.places, id);
  const one = comments[index];
  if (!one) throw new Refusal(`${id} has no comment ${index + 1}`);
  if (!actor.owner && one.by !== actor.worker) throw new Refusal(`the comment is ${one.by}'s: its maker removes it, or the owner`);
  const kept = comments.filter((_, each) => each !== index);
  putComments(context.places, id, kept);
  return kept;
}
