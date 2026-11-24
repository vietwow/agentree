import assert from "node:assert/strict";
import { test } from "node:test";
import { reportedBy } from "./headless.ts";

test("Claude Code's one result gives its session, its models, its tokens and its estimated cost", () => {
  const output = JSON.stringify({
    type: "result",
    session_id: "abc",
    total_cost_usd: 0.42,
    usage: { input_tokens: 1200, cache_read_input_tokens: 9000, output_tokens: 300 },
    modelUsage: { "claude-opus-5-5": {}, "claude-haiku-5": {} },
  });
  assert.deepEqual(reportedBy("claude-code", output), {
    models: ["claude-opus-5-5", "claude-haiku-5"],
    session: "abc",
    tokens: { input: 1200, cachedInput: 9000, output: 300, reasoning: 0 },
    costUsd: 0.42,
  });
  assert.match(reportedBy("claude-code", "Done.\n").unknown!, /no result: run it with --output-format json/);
});

test("Codex's turns are summed, with no cost, which it does not report", () => {
  const output = [
    '{"type":"thread.started","thread_id":"0199a213"}',
    '{"type":"turn.started"}',
    '{"type":"turn.completed","usage":{"input_tokens":24763,"cached_input_tokens":24448,"output_tokens":122,"reasoning_output_tokens":10}}',
    "not json",
    '{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":0,"output_tokens":8,"reasoning_output_tokens":2}}',
  ].join("\n");
  assert.deepEqual(reportedBy("codex", output), {
    models: [],
    session: "0199a213",
    tokens: { input: 24863, cachedInput: 24448, output: 130, reasoning: 12 },
    unknown: "Codex reports tokens and no cost",
  });
});

test("Antigravity's result is read from one object or from the last event of a stream; Cursor's tokens are not known", () => {
  const usage = { input_tokens: 10522, output_tokens: 354, thinking_tokens: 329, cache_read_tokens: 8112, total_tokens: 10876 };
  const tokens = { input: 10522, cachedInput: 8112, output: 354, reasoning: 329 };
  assert.deepEqual(reportedBy("antigravity", JSON.stringify({ conversation_id: "c3b6", status: "SUCCESS", usage })).tokens, tokens);
  const stream = [
    `{"event":"step_update","step_update":{"usage":{"input_tokens":1}}}`,
    JSON.stringify({ event: "result", result: { conversation_id: "c3b6", usage } }),
  ].join("\n");
  assert.deepEqual(reportedBy("antigravity", stream), { models: [], session: "c3b6", tokens, unknown: "Antigravity reports tokens and no cost" });
  assert.deepEqual(reportedBy("cursor", "{}"), { models: [], unknown: "Cursor's page of headless output documents no tokens" });
});
