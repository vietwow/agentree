import { ListChecks, Plus } from "lucide-react";
import { isClaimed, isStale, openQuestions, partsOf } from "../board/summary.ts";
import { STATUS_LABEL, TOOL_LABEL, type Status, type Task, type Tool } from "../board/task.ts";
import { fullTime, timeAgo } from "../format/time.ts";
import { ProgBar } from "../pages/parts.tsx";
import { Badge } from "../ui/Badge.tsx";
import { ic } from "../ui/ic.tsx";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark, ToolStack } from "../ui/ToolMark.tsx";
import { PERSON_MOVES } from "./TaskDrawer.tsx";

export const COLUMNS = [
  "backlog",
  "ready",
  "in-progress",
  "checking",
  "review",
  "accepted",
  "done",
] as const satisfies readonly Status[];

/** A person adds a task only where a task starts, and drags it only between those columns. */
const ADDS: ReadonlySet<Status> = new Set(PERSON_MOVES);

type Open = { selected?: string; onOpen: (id: string) => void };
type Props = Open & {
  tasks: Task[];
  all: readonly Task[];
  now: Date;
  /** The card just dropped, which lands with gr8r's motion. */
  landed?: string;
  onLanded: () => void;
  onNotBuilt: (what: string) => void;
};

export function TaskBoard({ tasks, all, now, selected, onOpen, landed, onLanded, onNotBuilt }: Props) {
  return (
    <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto" style={{ padding: "14px var(--gutter) 24px" }}>
      {COLUMNS.map((status, index) => (
        <Column
          key={status}
          index={index}
          status={status}
          tasks={tasks.filter((t) => t.status === status)}
          all={all}
          now={now}
          selected={selected}
          onOpen={onOpen}
          landed={landed}
          onLanded={onLanded}
          onNotBuilt={onNotBuilt}
        />
      ))}
    </div>
  );
}

function Column({
  index,
  status,
  tasks,
  all,
  now,
  selected,
  onOpen,
  landed,
  onLanded,
  onNotBuilt,
}: Omit<Props, "tasks"> & { index: number; status: Status; tasks: Task[] }) {
  const working = [...new Set(tasks.filter(isClaimed).map((t) => t.holder!.tool))] as Tool[];

  return (
    <section
      aria-label={STATUS_LABEL[status]}
      data-drop-col={status}
      className="flex max-h-full w-72 shrink-0 flex-col gap-2 rounded-card bg-panel p-2 transition-[background-color,box-shadow]"
    >
      <header className="flex h-8 items-center gap-2 pr-0.5 pl-1.5">
        <StatusIcon status={status} />
        <h3 className="truncate text-[13px] leading-5 font-semibold">{STATUS_LABEL[status]}</h3>
        <span className="text-xs leading-4 text-ink-faint tabular-nums">{tasks.length}</span>
        <span className="ml-auto flex items-center gap-1">
          {working.length > 0 && (
            <span
              title={working.map((tool) => TOOL_LABEL[tool]).join(", ")}
              className="inline-flex h-7 items-center gap-1.5 rounded-control border border-line bg-raised pr-2 pl-1 text-xs leading-4 font-medium text-ink-soft shadow-card"
            >
              <ToolStack tools={working} />
              {working.length === 1 ? TOOL_LABEL[working[0]!] : `${working.length} tools`}
            </span>
          )}
          {ADDS.has(status) && (
            <button
              type="button"
              aria-label={`New task in ${STATUS_LABEL[status]}`}
              title={`New task in ${STATUS_LABEL[status]}`}
              onClick={() => onNotBuilt("Creating a task")}
              className="inline-flex size-7 items-center justify-center rounded-control text-ink-faint transition-colors hover:bg-fill-strong hover:text-ink"
            >
              <Plus size={16} aria-hidden />
            </button>
          )}
        </span>
      </header>
      <div data-col-body={status} className="-mx-2 -mt-1 -mb-2 flex min-h-15 flex-col gap-2 overflow-y-auto px-2 pt-1 pb-2">
        {tasks.length === 0 ? (
          <p className="flex h-20 items-center justify-center rounded-inner border border-dashed border-line-strong text-xs leading-4 text-ink-faint">
            No task
          </p>
        ) : (
          tasks.map((task, i) => (
            <Card
              key={task.id}
              task={task}
              parts={partsOf(task, all)}
              now={now}
              delay={Math.min(index * 50 + i * 40, 600)}
              open={task.id === selected}
              landing={task.id === landed}
              onLanded={onLanded}
              onOpen={() => onOpen(task.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

/** A click settles the card and lifts it again, as gr8r's board does when it renders the card anew. */
function relift(card: HTMLElement) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  card.animate([{ translate: "0 0", boxShadow: "var(--shadow-lift)", borderColor: "var(--color-line)" }, {}], {
    duration: 180,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
  });
}

type CardProps = {
  task: Task;
  parts: { done: number; total: number };
  now: Date;
  delay: number;
  open: boolean;
  landing: boolean;
  onLanded: () => void;
  onOpen: () => void;
};

function Card({ task, parts, now, delay, open, landing, onLanded, onOpen }: CardProps) {
  const claimed = isClaimed(task);
  const stale = isStale(task, now);
  const asking = openQuestions(task).length > 0;
  const at = claimed && task.holder ? task.holder.beat : task.statusSince;
  const movable = PERSON_MOVES.includes(task.status);
  const { done, total } = parts;

  return (
    <div
      role="button"
      tabIndex={0}
      data-opens-task
      draggable={movable}
      data-drag-card={movable ? task.id : undefined}
      onClick={(event) => {
        relift(event.currentTarget);
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      onAnimationEnd={(event) => event.animationName === "land" && onLanded()}
      aria-current={open ? "true" : undefined}
      aria-label={task.title}
      style={landing ? undefined : { animationDelay: `${delay}ms` }}
      className={`flex w-full shrink-0 cursor-pointer flex-col gap-1.5 rounded-inner border bg-raised bg-lift px-3 py-2.5 text-left border-line shadow-lift transition-[border-color,box-shadow,translate] duration-180 ease-(--ease) hover:-translate-y-px hover:border-line-strong hover:shadow-lift-hover ${landing ? "fx-moved" : "motion-safe:animate-appear"}`}
    >
      <span className="flex h-5 w-full items-center gap-2">
        <PriorityIcon priority={task.priority} />
        <span className="font-mono text-xs leading-4 text-ink-faint">{task.id}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {asking && <Badge tone="bad">Question</Badge>}
          {stale && <Badge tone="warn">Stale</Badge>}
          {claimed && !stale && task.holder && (
            <span className="inline-flex items-center gap-1.5 text-[11px] leading-4 text-ink-faint">
              <ToolMark tool={task.holder.tool} size={20} />
              Working
            </span>
          )}
        </span>
      </span>
      <span className="line-clamp-2 text-[13px] leading-5 font-medium" title={task.title}>
        {task.title}
      </span>
      {total > 0 && (
        <span className="subp">
          {ic(ListChecks, 12)}
          <span className="num">
            {done}/{total}
          </span>
          <ProgBar value={Math.round((done / total) * 100)} tone={done === total ? "green" : ""} />
        </span>
      )}
      <span className="flex h-5 w-full items-center gap-2">
        {task.holder ? (
          <>
            <ToolMark tool={task.holder.tool} size={20} />
            <span className="truncate text-xs leading-4 text-ink-soft">{TOOL_LABEL[task.holder.tool]}</span>
          </>
        ) : (
          <span className="text-xs leading-4 text-ink-faint">Not held</span>
        )}
        <time
          dateTime={at.toISOString()}
          title={fullTime(at)}
          className={`ml-auto shrink-0 text-xs leading-4 ${stale ? "text-warn" : "text-ink-faint"}`}
        >
          {timeAgo(at, now)}
        </time>
      </span>
    </div>
  );
}
