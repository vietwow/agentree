import { CircleAlert, Clock, Inbox, Lightbulb, MessageCircleQuestion, type LucideIcon } from "lucide-react";
import { board, detail } from "../board/daemon.ts";
import { isStale, openQuestions } from "../board/summary.ts";
import type { Task } from "../board/task.ts";
import { Ago } from "../design/components/Ago.tsx";
import { Empty } from "../design/components/Empty.tsx";
import { ic } from "../design/components/icon.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Panel } from "../design/components/Panel.tsx";
import { count } from "../design/format/text.ts";

type Props = { tasks: readonly Task[]; now: Date; onOpenTask: (id: string) => void; onMemory: () => void };

type Waiting = { key: string; icon: LucideIcon; tone: string; task?: Task; text: string; at: Date; open: () => void };

/** What waits for the owner on the open project: questions, claims with no beat, checks that failed, and facts proposed for the memory. */
export function InboxPage({ tasks, now, onOpenTask, onMemory }: Props) {
  const questions = tasks.flatMap((task) =>
    detail(task)
      .questions.filter((question) => !question.answeredAt)
      .map((question, index): Waiting => ({
        key: `q-${task.id}-${index}`,
        icon: MessageCircleQuestion,
        tone: "text-warn",
        task,
        text: question.text,
        at: question.askedAt,
        open: () => onOpenTask(task.id),
      })),
  );
  const stale = tasks
    .filter((task) => isStale(task, now))
    .map((task): Waiting => ({
      key: `s-${task.id}`,
      icon: Clock,
      tone: "text-bad",
      task,
      text: "No beat from its worker in over 30 minutes; you may release it.",
      at: task.holder!.beat,
      open: () => onOpenTask(task.id),
    }));
  const failed = tasks
    .filter((task) => task.checks.failed > 0 && openQuestions(task).length === 0)
    .map((task): Waiting => ({
      key: `c-${task.id}`,
      icon: CircleAlert,
      tone: "text-bad",
      task,
      text: `${count(task.checks.failed, "check")} failed; it is back with its worker.`,
      at: task.statusSince,
      open: () => onOpenTask(task.id),
    }));
  const proposed = board()
    .facts.filter((fact) => fact.state === "proposed")
    .map((fact): Waiting => ({
      key: `f-${fact.file}`,
      icon: Lightbulb,
      tone: "text-ink-3",
      text: `Proposed for the memory: ${fact.title}`,
      at: fact.at,
      open: onMemory,
    }));
  const groups: [string, Waiting[]][] = [
    ["Questions for you", questions],
    ["Claims with no beat", stale],
    ["Checks that failed", failed],
    ["Facts proposed", proposed],
  ];
  const all = groups.flatMap(([, rows]) => rows);

  return (
    <Page>
      <PageHeader title="Inbox">
        {all.length ? `${count(all.length, "thing")} wait for you on ${board().project.name}.` : "What waits for you on the open project."}
      </PageHeader>
      {all.length === 0 && (
        <Empty icon={Inbox} title="Nothing waits for you" text="A question, a claim with no beat, a failed check or a proposed fact shows here." />
      )}
      <div className="stack gap-4">
        {groups
          .filter(([, rows]) => rows.length)
          .map(([name, rows]) => (
            <Panel key={name} title={name} count={rows.length} clip>
              {rows
                .sort((a, b) => b.at.getTime() - a.at.getTime())
                .map((row) => (
                  <button key={row.key} type="button" className="nrow w-full text-left" data-opens-task onClick={row.open}>
                    <span className={`flex items-center justify-center w-5 ${row.tone}`}>{ic(row.icon, 15)}</span>
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                      {row.task && (
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="key mono">{row.task.id}</span>
                          <span className="trunc font-medium">{row.task.title}</span>
                        </span>
                      )}
                      <span className="muted text-sm">{row.text}</span>
                    </span>
                    <Ago at={row.at} now={now} />
                  </button>
                ))}
            </Panel>
          ))}
      </div>
    </Page>
  );
}
