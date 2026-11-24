/** A notice told outside the browser: through the command the project names, which is given the notice and nothing to answer. */
import { spawn } from "node:child_process";
import type { Notice } from "../core/views/notices.ts";

/** A command that tells is short: one that still runs after this long is ended. */
const TELLS_WITHIN_MS = 30_000;

/**
 * Runs the project's command for a notice, in the main checkout. The notice
 * is in its environment (`AGENTREE_NOTICE_KIND`, `_TASK`, `_TITLE`, `_TEXT`,
 * `_PROJECT`) and never in the command's own text: a question's words are
 * a worker's, and are not given to a shell to read as a command.
 */
export function tellBy(command: string, cwd: string, project: string, notice: Notice): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd,
      stdio: "ignore",
      timeout: TELLS_WITHIN_MS,
      env: {
        ...process.env,
        AGENTREE_NOTICE_KIND: notice.kind,
        AGENTREE_NOTICE_TASK: notice.task,
        AGENTREE_NOTICE_TITLE: notice.title,
        AGENTREE_NOTICE_TEXT: notice.text,
        AGENTREE_NOTICE_PROJECT: project,
      },
    });
    child.on("error", () => resolve(null));
    child.on("close", resolve);
  });
}
