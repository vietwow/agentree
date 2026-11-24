import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { tellBy } from "./notices.ts";

test("the project's command is given a notice in its environment, never in its own text", async () => {
  const home = mkdtempSync(join(tmpdir(), "agentree-notice-"));
  const notice = { kind: "question" as const, task: "T-0003", title: "c", text: 'Which port? $(touch harm); `touch harm`; "' };
  const ended = await tellBy(
    'printf "%s|%s|%s|%s" "$AGENTREE_NOTICE_KIND" "$AGENTREE_NOTICE_TASK" "$AGENTREE_NOTICE_PROJECT" "$AGENTREE_NOTICE_TEXT" > told.txt',
    home,
    "project",
    notice,
  );
  assert.equal(ended, 0);
  assert.equal(readFileSync(join(home, "told.txt"), "utf8"), `question|T-0003|project|${notice.text}`);
  assert.equal(await tellBy("exit 3", home, "project", notice), 3, "a command that fails stops nothing");
  rmSync(home, { recursive: true, force: true });
});
