import { Tabs } from "@base-ui/react/tabs";
import {
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  Lightbulb,
  LoaderCircle,
  Minus,
  Server,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isClaimed, isStale, openQuestions } from "../board/summary.ts";
import { KIND_LABEL, STATUS_LABEL, TOOL_LABEL, type CheckRun, type Session, type Status, type Task, type TaskDetail } from "../board/task.ts";
import { duration, fullTime, timeAgo } from "../format/time.ts";
import { Badge } from "../ui/Badge.tsx";
import { IconButton } from "../ui/Button.tsx";
import { KindMark } from "../ui/KindMark.tsx";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { ChecksBar } from "./ChecksBar.tsx";

type Props = {
  task: Task;
  detail: TaskDetail;
  now: Date;
  onClose: () => void;
  onOpen: (id: string) => void;
};

type Section = "overview" | "checks" | "sessions" | "log";

export function TaskPanel({ task, detail, now, onClose, onOpen }: Props) {
  const [section, setSection] = useState<Section>("overview");
  const close = useRef<HTMLButtonElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    body.current?.scrollTo({ top: 0 });
  }, [task.id]);

  const stale = isStale(task, now);
  const asking = openQuestions(task).length;

  return (
    <aside aria-label={`Task ${task.id}`} className="flex h-full min-h-0 w-full flex-col bg-surface">
      <header className="flex shrink-0 flex-col gap-3 border-b border-line px-5 pt-4 pb-4">
        <div className="flex h-8 items-center gap-2.5">
          <KindMark kind={task.kind} />
          <span className="flex min-w-0 flex-col">
            <span className="font-mono text-xs leading-4 text-ink-2">{task.id}</span>
            <span className="text-2xs leading-4 text-ink-4">{KIND_LABEL[task.kind]}</span>
          </span>
          <IconButton ref={close} label="Close the task" onClick={onClose} className="ml-auto size-8">
            <X size={16} aria-hidden />
          </IconButton>
        </div>
        <h2 className="text-lg leading-6 font-semibold tracking-tight">{task.title}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>
            <StatusIcon status={task.status} />
            {STATUS_LABEL[task.status]}
          </Chip>
          <Chip>
            <PriorityIcon priority={task.priority} />P{task.priority}
          </Chip>
          {asking > 0 && <Badge tone="bad">{asking === 1 ? "Question" : `${asking} questions`}</Badge>}
          {stale && <Badge tone="warn">Stale</Badge>}
        </div>
        {task.holder && (
          <div className="flex items-center gap-2.5 rounded-lg border border-line bg-tray px-2.5 py-2">
            <ToolMark tool={task.holder.tool} size={24} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] leading-5 font-medium">{TOOL_LABEL[task.holder.tool]}</span>
              <span className="truncate font-mono text-2xs leading-4 text-ink-4">{task.holder.model}</span>
            </span>
            <span className="flex shrink-0 flex-col items-end">
              <span className="text-2xs leading-4 text-ink-4">{isClaimed(task) ? "Last beat" : "Built it"}</span>
              <time
                dateTime={(isClaimed(task) ? task.holder.beat : task.holder.since).toISOString()}
                title={fullTime(isClaimed(task) ? task.holder.beat : task.holder.since)}
                className={`text-xs leading-4 ${stale ? "font-semibold text-warn" : "text-ink-2"}`}
              >
                {timeAgo(isClaimed(task) ? task.holder.beat : task.holder.since, now)}
              </time>
            </span>
          </div>
        )}
      </header>

      <Tabs.Root value={section} onValueChange={(next) => setSection(next as Section)} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 px-5 pt-3 pb-1">
          <Tabs.List aria-label="Sections" className="relative flex w-full gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5 dark:bg-tray">
            <PanelTab value="overview">Overview</PanelTab>
            <PanelTab value="checks" count={detail.checkRuns.length}>
              Checks
            </PanelTab>
            <PanelTab value="sessions" count={detail.sessions.length}>
              Sessions
            </PanelTab>
            <PanelTab value="log" count={detail.log.length}>
              Log
            </PanelTab>
            <Tabs.Indicator className="absolute top-(--active-tab-top) left-(--active-tab-left) h-(--active-tab-height) w-(--active-tab-width) rounded-sm bg-float shadow-sm transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:bg-surface-3" />
          </Tabs.List>
        </div>
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-6">
          <Tabs.Panel value="overview" className="flex flex-col gap-3 outline-none">
            <Overview task={task} detail={detail} now={now} onOpen={onOpen} />
          </Tabs.Panel>
          <Tabs.Panel value="checks" className="flex flex-col gap-3 outline-none">
            <ChecksSection task={task} runs={detail.checkRuns} />
          </Tabs.Panel>
          <Tabs.Panel value="sessions" className="flex flex-col gap-3 outline-none">
            <SessionsSection sessions={detail.sessions} now={now} />
          </Tabs.Panel>
          <Tabs.Panel value="log" className="outline-none">
            <LogSection key={task.id} detail={detail} now={now} />
          </Tabs.Panel>
        </div>
      </Tabs.Root>
    </aside>
  );
}

function PanelTab({ value, count, children }: { value: Section; count?: number; children: ReactNode }) {
  return (
    <Tabs.Tab
      value={value}
      className="inline-flex h-6.5 flex-1 items-center justify-center gap-1.5 rounded-sm px-2 text-[13px] leading-5 font-medium whitespace-nowrap text-ink-2 transition-colors outline-offset-[-2px] hover:text-ink relative z-10 data-[active]:text-ink"
    >
      {children}
      {count !== undefined && <span className="text-2xs leading-4 text-ink-4 tabular-nums">{count}</span>}
    </Tabs.Tab>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-line bg-float px-2 text-xs leading-4 font-medium text-ink-2 shadow-sm">
      {children}
    </span>
  );
}

export function Box({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-float shadow-sm">
      <header className="flex h-9 items-center gap-2 border-b border-line px-3">
        <h3 className="text-2xs leading-4 font-semibold tracking-[0.06em] text-ink-4 uppercase">{title}</h3>
        {aside && <span className="ml-auto flex items-center gap-1.5">{aside}</span>}
      </header>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

export function None({ children }: { children: ReactNode }) {
  return <p className="text-[13px] leading-5 text-ink-4">{children}</p>;
}

const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-xs leading-5 break-all text-ink">{children}</span>;

function Overview({ task, detail, now, onOpen }: { task: Task; detail: TaskDetail; now: Date; onOpen: (id: string) => void }) {
  const reached = task.status === "accepted" || task.status === "done";

  return (
    <>
      {detail.questions.length > 0 && (
        <Box title="Questions">
          <ul className="flex flex-col gap-2.5">
            {detail.questions.map((q, i) => (
              <li key={i} className="flex flex-col gap-1.5">
                <p className="text-[13px] leading-5 text-ink">{q.text}</p>
                <p className="text-xs leading-4 text-ink-4">
                  Asked {timeAgo(q.askedAt, now)}
                  {q.answeredAt ? ` · answered ${timeAgo(q.answeredAt, now)}` : ""}
                </p>
                {q.answer ? (
                  <p className="rounded-md border-l-2 border-teal bg-tray px-2.5 py-1.5 text-[13px] leading-5 text-ink-2">{q.answer}</p>
                ) : (
                  <span className="self-start">
                    <Badge tone="bad">Waiting for you</Badge>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Box>
      )}

      <Box title="Fields">
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px] leading-5">
          <Field term="Parent">
            {task.parent ? (
              <button type="button" onClick={() => onOpen(task.parent!)} className="w-full truncate text-left text-ink hover:underline">
                <span className="font-mono text-xs whitespace-nowrap text-ink-2">{task.parent}</span> {detail.parentTitle}
              </button>
            ) : (
              <span className="text-ink-4">None</span>
            )}
          </Field>
          <Field term="RFC">{task.rfc ? <Mono>rfcs/{task.rfc}</Mono> : <span className="text-ink-4">None</span>}</Field>
          <Field term="Depends on">
            {detail.dependsOn.length === 0 ? (
              <span className="text-ink-4">Nothing</span>
            ) : (
              <ul className="flex flex-col gap-1">
                {detail.dependsOn.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(d.id)}
                      title={d.title}
                      className="flex w-full min-w-0 items-center gap-1.5 text-left hover:underline"
                    >
                      <StatusIcon status={d.status} size={12} />
                      <span className="shrink-0 font-mono text-xs text-ink-2">{d.id}</span>
                      <span className="truncate text-ink">{d.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
          <Field term="Writes">
            <ul className="flex flex-col">
              {detail.writes.map((path) => (
                <li key={path}>
                  <Mono>{path}</Mono>
                </li>
              ))}
            </ul>
          </Field>
          <Field term="Appends">
            {detail.appends.length === 0 ? <span className="text-ink-4">Nothing</span> : detail.appends.map((path) => <Mono key={path}>{path}</Mono>)}
          </Field>
          <Field term="Checks">
            <ChecksBar checks={task.checks} />
          </Field>
          <Field term="Created">
            <time dateTime={task.createdAt.toISOString()} title={fullTime(task.createdAt)} className="text-ink-2">
              {timeAgo(task.createdAt, now)}
            </time>
          </Field>
        </dl>
      </Box>

      <Box title="Context">
        <p className="text-[13px] leading-5 text-ink-2">{detail.context}</p>
      </Box>

      <Box title="Done when">
        <ul className="flex flex-col gap-1.5">
          {detail.doneWhen.map((line) => (
            <li key={line} className="flex gap-2 text-[13px] leading-5 text-ink-2">
              {reached ? (
                <CircleCheck size={16} aria-label="Met" className="mt-0.5 shrink-0 text-teal" />
              ) : (
                <Circle size={16} aria-label="Not yet met" className="mt-0.5 shrink-0 text-ink-4" />
              )}
              {line}
            </li>
          ))}
        </ul>
      </Box>

      <Box title="Out of scope">
        <ul className="flex flex-col gap-1.5">
          {detail.outOfScope.map((line) => (
            <li key={line} className="flex gap-2 text-[13px] leading-5 text-ink-2">
              <Minus size={16} aria-hidden className="mt-0.5 shrink-0 text-ink-4" />
              {line}
            </li>
          ))}
        </ul>
      </Box>

      <TreeBox task={task} detail={detail} />

      {detail.review && (
        <Box
          title="Review"
          aside={
            <Badge tone={detail.review.verdict === "accepted" ? "good" : detail.review.verdict === "rejected" ? "bad" : "warn"}>
              {detail.review.verdict === "accepted" ? "Accepted" : detail.review.verdict === "rejected" ? "Rejected" : "In review"}
            </Badge>
          }
        >
          <div className="flex flex-col gap-2">
            <span className="flex items-center gap-2 text-[13px] leading-5 text-ink-2">
              <ToolMark tool={detail.review.by} size={20} />
              {TOOL_LABEL[detail.review.by]}, in a session of its own
            </span>
            {detail.review.findings.length === 0 ? (
              <None>{detail.review.verdict === "pending" ? "No finding yet" : "No finding"}</None>
            ) : (
              <ul className="flex flex-col gap-1">
                {detail.review.findings.map((f) => (
                  <li key={f} className="text-[13px] leading-5 text-ink-2">
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Box>
      )}

      <Box title="Memory it was given">
        {detail.memory.length === 0 ? (
          <None>No fact of memory</None>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {detail.memory.map((fact) => (
              <li key={fact} className="flex gap-2 text-[13px] leading-5 text-ink-2">
                <Lightbulb size={16} aria-hidden className="mt-0.5 shrink-0 text-warn" />
                {fact}
              </li>
            ))}
          </ul>
        )}
      </Box>

      <TimeBox timeIn={detail.timeIn} />
    </>
  );
}

function Field({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-ink-4">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

export function TreeBox({ task, detail }: { task: Task; detail: TaskDetail }) {
  if (!detail.tree) {
    return (
      <Box title="Tree and branch">
        <None>{task.status === "done" ? "Landed; its tree was removed" : "No tree until the task is claimed"}</None>
      </Box>
    );
  }
  const { path, base, diff } = detail.tree;
  const added = diff.reduce((n, f) => n + f.added, 0);
  const removed = diff.reduce((n, f) => n + f.removed, 0);

  return (
    <Box
      title="Tree and branch"
      aside={
        <span className="text-xs leading-4 tabular-nums">
          <span className="text-good">+{added}</span> <span className="text-bad">−{removed}</span>
        </span>
      }
    >
      <div className="flex flex-col gap-2.5">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          <dt>
            <FolderTree size={14} aria-label="Tree" className="text-ink-4" />
          </dt>
          <dd>
            <Mono>{path}</Mono>
          </dd>
          <dt>
            <GitBranch size={14} aria-label="Branch" className="text-ink-4" />
          </dt>
          <dd>
            <Mono>{task.branch}</Mono>
          </dd>
          <dt>
            <GitCommitHorizontal size={14} aria-label="Base" className="text-ink-4" />
          </dt>
          <dd>
            <Mono>main @ {base}</Mono>
          </dd>
        </dl>
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line">
          {diff.map((file) => (
            <li key={file.path} className="flex items-center gap-2 bg-tray px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate font-mono text-xs leading-4 text-ink" title={file.path}>
                {file.path}
              </span>
              <span className="shrink-0 text-xs leading-4 tabular-nums">
                <span className="text-good">+{file.added}</span> <span className="text-bad">−{file.removed}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Box>
  );
}

const STATUS_FILL: Record<Status, string> = {
  backlog: "bg-ink-faint",
  ready: "bg-[#8b6cd9]",
  "in-progress": "bg-[#e07b39]",
  checking: "bg-warn",
  review: "bg-info",
  accepted: "bg-teal",
  done: "bg-good",
  blocked: "bg-bad",
  dropped: "bg-ink-faint",
};

export function TimeBox({ timeIn }: { timeIn: TaskDetail["timeIn"] }) {
  const total = timeIn.reduce((n, t) => n + t.ms, 0);
  return (
    <Box title="Time in each status" aside={<span className="text-xs leading-4 text-ink-4">{duration(total)}</span>}>
      <div className="flex flex-col gap-2.5">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {timeIn.map((t) => (
            <span
              key={t.status}
              className={`origin-left motion-safe:animate-[growX_0.8s_0.12s_var(--ease)_both] ${STATUS_FILL[t.status]}`}
              style={{ flexGrow: Math.max(t.ms, total / 100) }}
            />
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {timeIn.map((t) => (
            <li key={t.status} className="flex items-center gap-2 text-xs leading-5">
              <span className={`size-2 shrink-0 rounded-full ${STATUS_FILL[t.status]}`} aria-hidden />
              <span className="flex-1 truncate text-ink-2">{STATUS_LABEL[t.status]}</span>
              <span className="text-ink tabular-nums">{duration(t.ms)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Box>
  );
}

const RESULT: Record<CheckRun["result"], { icon: ReactNode; label: string }> = {
  passed: { icon: <CircleCheck size={16} aria-hidden className="text-teal" />, label: "Passed" },
  failed: { icon: <CircleX size={16} aria-hidden className="text-bad" />, label: "Failed" },
  running: { icon: <LoaderCircle size={16} aria-hidden className="animate-spin text-warn" />, label: "Running" },
  queued: { icon: <Clock size={16} aria-hidden className="text-ink-4" />, label: "Queued" },
};

export function ChecksSection({ task, runs }: { task: Task; runs: CheckRun[] }) {
  if (runs.length === 0) {
    return (
      <Box title="Checks">
        <None>No check has run; they run at its submit</None>
      </Box>
    );
  }
  const waited = runs.reduce((n, r) => n + r.waitedMs, 0);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Result">
          <ChecksBar checks={task.checks} />
        </Stat>
        <Stat label={task.checks.queuePlace ? "Place in the queue" : "Waited for a slot"}>
          <span className="text-[13px] leading-5 font-semibold tabular-nums">
            {task.checks.queuePlace ? `#${task.checks.queuePlace}` : duration(waited)}
          </span>
        </Stat>
      </div>
      <Box title="Each check">
        <ul className="-my-1 flex flex-col divide-y divide-line">
          {runs.map((run) => (
            <li key={run.name} className="flex items-center gap-2.5 py-2">
              <span className="inline-flex" title={RESULT[run.result].label}>
                {RESULT[run.result].icon}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-ink">{run.name}</span>
              <span className="flex shrink-0 flex-col items-end">
                <span className="text-xs leading-4 text-ink-2 tabular-nums">
                  {run.tookMs === undefined ? RESULT[run.result].label : duration(run.tookMs)}
                </span>
                <span className="text-2xs leading-4 text-ink-4 tabular-nums">waited {duration(run.waitedMs)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Box>
    </>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-float px-3 py-2.5 shadow-sm">
      <span className="text-2xs leading-4 font-semibold tracking-[0.06em] text-ink-4 uppercase">{label}</span>
      {children}
    </div>
  );
}

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export function SessionsSection({ sessions, now }: { sessions: Session[]; now: Date }) {
  if (sessions.length === 0) {
    return (
      <Box title="Sessions">
        <None>No session has worked on it</None>
      </Box>
    );
  }
  const cost = (role: Session["role"]) => {
    const of = sessions.filter((s) => s.role === role);
    if (of.length === 0) return undefined;
    return of.some((s) => s.costUsd === undefined) ? null : of.reduce((n, s) => n + (s.costUsd ?? 0), 0);
  };
  const build = cost("build");
  const review = cost("review");
  const all = build === null || review === null ? null : (build ?? 0) + (review ?? 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Building">
          <Cost value={build} />
        </Stat>
        <Stat label="Reviewing">
          <Cost value={review} />
        </Stat>
        <Stat label="The task">
          <Cost value={all} />
        </Stat>
      </div>
      {sessions.map((s, i) => (
        <section key={i} className="flex flex-col gap-2.5 rounded-lg border border-line bg-float px-3 py-2.5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <ToolMark tool={s.tool} size={24} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] leading-5 font-medium">{TOOL_LABEL[s.tool]}</span>
              <span className="truncate font-mono text-2xs leading-4 text-ink-4" title={s.models.join(" then ")}>
                {s.models.join(" → ")}
              </span>
            </span>
            <Badge tone={s.role === "build" ? "info" : "neutral"}>{s.role === "build" ? "Builder" : "Reviewer"}</Badge>
          </div>
          <p className="text-xs leading-4 text-ink-2">
            Started {timeAgo(s.startedAt, now)} ·{" "}
            {s.endedAt
              ? `ran ${duration(s.endedAt.getTime() - s.startedAt.getTime())}`
              : `running for ${duration(now.getTime() - s.startedAt.getTime())}`}
          </p>
          {s.tokens ? (
            <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-md border border-line bg-line">
              {(
                [
                  ["Input", s.tokens.input],
                  ["Cached", s.tokens.cachedInput],
                  ["Output", s.tokens.output],
                  ["Reasoning", s.tokens.reasoning],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex flex-col bg-tray px-2 py-1.5">
                  <dt className="text-2xs leading-4 text-ink-4">{label}</dt>
                  <dd className="text-[13px] leading-5 font-semibold tabular-nums" title={value.toLocaleString()}>
                    {compact.format(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="rounded-md border border-dashed border-line-strong px-2.5 py-1.5 text-xs leading-4 text-ink-4">
              Tokens and cost not known: {s.unknown}
            </p>
          )}
          {s.costUsd !== undefined && (
            <p className="flex items-center justify-between text-xs leading-4">
              <span className="text-ink-4">Cost, as the tool reports it</span>
              <span className="font-semibold text-ink tabular-nums">{money.format(s.costUsd)}</span>
            </p>
          )}
        </section>
      ))}
    </>
  );
}

function Cost({ value }: { value: number | null | undefined }) {
  if (value === undefined) return <span className="text-[13px] leading-5 text-ink-4">None</span>;
  if (value === null)
    return (
      <span className="text-[13px] leading-5 text-ink-4" title="A session did not report its cost">
        Not known
      </span>
    );
  return <span className="text-[13px] leading-5 font-semibold tabular-nums">{money.format(value)}</span>;
}

/** The Log draws in from the top: a node, its text, then the rail down to the next. */
const LOG_STEP_MS = 420;
const LOG_NODE_MS = 200;

export function LogSection({ detail, now }: { detail: TaskDetail; now: Date }) {
  return (
    <ol className="flex flex-col">
      {detail.log.map((entry, i) => (
        <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
          {i < detail.log.length - 1 && (
            <span
              aria-hidden
              className="log-rail absolute top-6 bottom-0 left-2.5 w-px bg-line"
              style={{
                animationDelay: `${i * LOG_STEP_MS + LOG_NODE_MS}ms`,
                animationDuration: `${LOG_STEP_MS - LOG_NODE_MS}ms`,
              }}
            />
          )}
          <span className="log-node inline-flex shrink-0" style={{ animationDelay: `${i * LOG_STEP_MS}ms` }}>
            {entry.who === "daemon" ? (
              <span
                title="The daemon"
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-2 dark:rounded-sm"
              >
                <Server size={12} aria-hidden />
              </span>
            ) : (
              <ToolMark tool={entry.who} size={20} />
            )}
          </span>
          <span className="flex min-w-0 flex-col motion-safe:animate-appear" style={{ animationDelay: `${i * LOG_STEP_MS + 80}ms` }}>
            <span className="text-[13px] leading-5 text-ink">{entry.text}</span>
            <time dateTime={entry.at.toISOString()} title={fullTime(entry.at)} className="text-xs leading-4 text-ink-4">
              {entry.who === "daemon" ? "The daemon" : TOOL_LABEL[entry.who]} · {timeAgo(entry.at, now)}
            </time>
          </span>
        </li>
      ))}
    </ol>
  );
}
