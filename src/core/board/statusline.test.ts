import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { git } from "../git.ts";
import { claim, create, type Context } from "./actions.ts";
import { sessions } from "./sessions.ts";
import { onStatusLine } from "./statusline.ts";
import { CODEX, OWNER, project, type Project } from "./testing.ts";
import { sessionsOf } from "./usage.ts";

let at: Project;
let context: Context;

beforeEach(() => {
  at = project();
  ({ context } = at);
  create(context, OWNER, { title: "The core", kind: "research", priority: 1, context: "Why.", doneWhen: "- Done.", outOfScope: "Rest." });
});
afterEach(() => at.remove());

const update = (more: object) => ({
  session_id: "s-claude",
  cwd: context.places.root,
  model: { id: "claude-opus-5-5" },
  cost: { total_cost_usd: 0.0123 },
  ...more,
});
const commits = () => git(context.places.board, "rev-list", "--count", "HEAD");

test("the status line follows the session, and writes its model and its estimated cost on the task it holds, a commit a cost that moved", () => {
  assert.equal(onStatusLine("/", {}, context.now()), "", "outside a board, or with no session, it says nothing");
  assert.equal(onStatusLine(context.places.root, update({}), context.now()), "agentree: no task held");
  assert.deepEqual(
    sessions(context.places).map((session) => [session.id, session.worker]),
    [["s-claude", "claude-code/claude-opus-5-5"]],
  );

  claim(context, { ...CODEX, worker: "claude-code/claude-opus-5-5", session: "s-claude" }, "T-0001");
  assert.equal(onStatusLine(context.places.root, update({}), context.now()), "agentree: T-0001, in-progress");
  const [used] = sessionsOf(context.places, "T-0001");
  assert.deepEqual(
    [used!.session, used!.role, used!.models, used!.costUsd, used!.tokens],
    ["s-claude", "build", ["claude-opus-5-5"], 0.01, undefined],
  );
  assert.match(used!.unknown ?? "", /its token fields are the context window's, not the session's use/);

  const before = commits();
  onStatusLine(context.places.root, update({ cost: { total_cost_usd: 0.0149 } }), context.now());
  assert.equal(commits(), before, "a cost that did not move by a cent writes nothing");
  onStatusLine(context.places.root, update({ cost: { total_cost_usd: 0.42 }, model: { id: "claude-sonnet-5-5" } }), context.now());
  const [after] = sessionsOf(context.places, "T-0001");
  assert.deepEqual([after!.costUsd, after!.models, sessionsOf(context.places, "T-0001").length], [0.42, ["claude-opus-5-5", "claude-sonnet-5-5"], 1]);
});
