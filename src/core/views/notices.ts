/**
 * What the owner is told of as it happens: a question asked, a check that
 * failed, a task that waits for a review. A notice is the difference of
 * two looks at a board; the first look tells nothing.
 */
import { checksOf } from "../board/state.ts";
import type { Board } from "../board/store.ts";
import type { Status } from "../task/model.ts";

export type Notice = { kind: "question" | "check-failed" | "review"; task: string; title: string; text: string };

/** What of each task a look keeps, to tell the next look from it. */
export type Look = Map<string, { status: Status; title: string; asked: number; question: string; failed: string; failedBy: string }>;

export function lookAt(board: Board): Look {
  return new Map(
    board.tasks.map(({ task }) => {
      const open = task.questions.filter((question) => !question.answeredAt);
      const checks = checksOf(board.places, task.fields.id);
      const failing = checks?.state === "finished" ? checks.runs.filter((run) => run.result !== "passed") : [];
      return [
        task.fields.id,
        {
          status: task.fields.status,
          title: task.fields.title,
          asked: task.questions.length,
          question: open.at(-1)?.text ?? "",
          // A failure is told once a submission: by the commit its checks ran on.
          failed: failing.length ? checks!.commit : "",
          failedBy: failing.map((run) => `${run.command} ${run.result === "timed-out" ? "ran out of time" : "failed"}`).join("; "),
        },
      ];
    }),
  );
}

export function noticesBetween(before: Look, after: Look): Notice[] {
  const notices: Notice[] = [];
  for (const [task, now] of after) {
    const was = before.get(task);
    const tell = (kind: Notice["kind"], text: string) => notices.push({ kind, task, title: now.title, text });
    if (now.asked > (was?.asked ?? 0) && now.question) tell("question", now.question);
    if (now.failed && now.failed !== was?.failed) tell("check-failed", now.failedBy);
    if (now.status === "review" && was?.status !== "review") tell("review", "It waits for a review.");
  }
  return notices;
}
