import { CircleCheck, CircleX, Clock, FolderTree, GitBranch, GitCommitHorizontal, LoaderCircle, Server } from "lucide-react";
import type { ReactNode } from "react";
import { STATUS_LABEL, TOOL_LABEL, type CheckRun, type Session, type Task, type TaskDetail } from "../board/task.ts";
import { Badge } from "../design/components/Badge.tsx";
import { compact, money } from "../design/format/number.ts";
import { ago, duration, fullTime, timeAgo } from "../design/format/time.ts";
import { STATUS_COLOR } from "../ui/colors.ts";
import { ToolMark } from "../ui/ToolMark.tsx";
import { ChecksBar } from "./ChecksBar.tsx";

function Box({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
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

export function TimeBox({ timeIn }: { timeIn: TaskDetail["timeIn"] }) {
  const total = timeIn.reduce((n, t) => n + t.ms, 0);
  return (
    <Box title="Time in each status" aside={<span className="text-xs leading-4 text-ink-4">{duration(total)}</span>}>
      <div className="flex flex-col gap-2.5">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {timeIn.map((t) => (
            <span
              key={t.status}
              className="origin-left animate-[grow-x_0.8s_0.12s_var(--ease)_both]"
              style={{ flexGrow: Math.max(t.ms, total / 100), background: STATUS_COLOR[t.status] }}
            />
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
          {timeIn.map((t) => (
            <li key={t.status} className="flex items-center gap-2 text-xs leading-5">
              <span className="size-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR[t.status] }} aria-hidden />
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
                    {compact(value)}
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
              <span className="font-semibold text-ink tabular-nums">{money(s.costUsd)}</span>
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
  return <span className="text-[13px] leading-5 font-semibold tabular-nums">{money(value)}</span>;
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
          <span className="flex min-w-0 flex-col animate-appear" style={{ animationDelay: `${i * LOG_STEP_MS + 80}ms` }}>
            <span className="text-[13px] leading-5 text-ink">{entry.text}</span>
            <time
              dateTime={entry.at.toISOString()}
              title={`${timeAgo(entry.at, now)} · ${fullTime(entry.at)}`}
              className="text-xs leading-4 text-ink-4"
            >
              {entry.who === "daemon" ? "The daemon" : TOOL_LABEL[entry.who]} · {ago(entry.at, now)}
            </time>
          </span>
        </li>
      ))}
    </ol>
  );
}
