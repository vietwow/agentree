import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Ellipsis,
  GripVertical,
  Link,
  ListChecks,
  MessageSquare,
  PanelRightOpen,
  Plus,
  Star,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toggleStar, useStars } from "../board/favorites.ts";
import { board, parentTitles } from "../board/daemon.ts";
import { openQuestions, partsOf } from "../board/summary.ts";
import { KIND_LABEL, STATUS_LABEL, TOOL_LABEL, type Status, type Task } from "../board/task.ts";
import { useTicks } from "../board/ticks.ts";
import { Button, IconButton } from "../design/components/Button.tsx";
import { Empty } from "../design/components/Empty.tsx";
import { GroupHeader } from "../design/components/GroupHeader.tsx";
import { ic } from "../design/components/icon.tsx";
import { MenuItem, MenuSeparator } from "../design/components/Menu.tsx";
import { Pop, usePop } from "../design/components/Pop.tsx";
import { copy, toast } from "../design/components/toast.ts";
import { style } from "../pages/parts.tsx";
import { KIND_COLOR } from "../ui/colors.ts";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { SubCheck } from "./SubCheck.tsx";
import { PERSON_MOVES } from "./TaskDrawer.tsx";
import { rfcLabel, type Group, type SortKey, type View } from "./view.ts";
import { optLabel } from "./ViewToolbar.tsx";

type Col = "status" | "assignee" | "priority" | "labels" | "parent";

const LCOLS: Record<Col, [string, string]> = {
  status: ["Status", "126px"],
  assignee: ["Assignee", "150px"],
  priority: ["Priority", "108px"],
  labels: ["Labels", "168px"],
  parent: ["Parent", "160px"],
};
const COLS: Col[] = ["status", "assignee", "priority", "labels", "parent"];

/** The groups a person adds a task to; the others fill as the daemon moves tasks. */
const ADDS = new Set<string>(PERSON_MOVES);

export function Labels({ task, max = 2 }: { task: Task; max?: number }) {
  const all = [
    <span key="k" className="lbl" style={style({ "--c": KIND_COLOR[task.kind] })}>
      <i />
      {KIND_LABEL[task.kind]}
    </span>,
    ...(task.rfc
      ? [
          <span key="r" className="lbl [--c:var(--gray)]">
            <i />
            {rfcLabel(task.rfc)}
          </span>,
        ]
      : []),
  ];
  return <>{all.slice(0, max)}</>;
}

type Props = {
  groups: Group[];
  view: View;
  onView: (next: View) => void;
  tasks: readonly Task[];
  selected?: string;
  onOpen: (id: string) => void;
  onMove: (ids: string[], status: Status) => void;
  onNewTask: () => void;
};

type PopKey = `status:${string}` | `more:${string}` | "bulk";

export function TaskList({ groups, view: v, onView, tasks, selected, onOpen, onMove, onNewTask }: Props) {
  const { popped } = useTicks();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [bulkIn, setBulkIn] = useState(false);
  const all = groups.flatMap((g) => g.tasks.map((t) => t.id));
  const nSel = all.filter((id) => sel.has(id)).length;
  const pop = usePop<PopKey>();
  const stars = useStars();
  const selAll = useRef<HTMLInputElement>(null);
  const tpl = `18px 30px minmax(220px,1fr) ${COLS.map((c) => LCOLS[c][1]).join(" ")} 40px`;
  const kids = (id: string) => tasks.filter((t) => t.parent === id);

  useEffect(() => {
    if (selAll.current) selAll.current.indeterminate = nSel > 0 && nSel < all.length;
  });

  const toggleSel = (id: string) =>
    setSel((now) => {
      const next = new Set(now);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (now.size === 0) setBulkIn(true);
      return next;
    });

  const sortBy = (f: SortKey) => onView({ ...v, sort: v.sort.f === f ? { f, dir: v.sort.dir > 0 ? -1 : 1 } : { f, dir: 1 } });
  const arrow = (f: SortKey) => (v.sort.f === f ? ic(v.sort.dir > 0 ? ArrowUp : ArrowDown, 11) : null);

  if (!all.length) return <Empty icon={ListChecks} title="No tasks here" text="No task matches the search and filters." />;

  const groupHead = (g: Group) => {
    const opt =
      v.group === "parent"
        ? { name: g.key === "none" ? "No parent" : (parentTitles()[g.key] ?? g.key) }
        : optLabel(v.group as never, g.key, `P${g.key}`);
    return { html: "html" in opt ? opt.html : undefined, name: opt.name };
  };

  const cell = (t: Task, c: Col) => {
    switch (c) {
      case "status": {
        const movable = PERSON_MOVES.includes(t.status);
        return (
          <button
            type="button"
            className={`pillbtn ${movable ? "" : "cursor-default"}`}
            onClick={movable ? pop.toggle(`status:${t.id}`) : undefined}
            aria-label={`Status: ${STATUS_LABEL[t.status]}`}
          >
            <StatusIcon status={t.status} />
            <span>{STATUS_LABEL[t.status]}</span>
          </button>
        );
      }
      case "assignee":
        return (
          <span className={`pillbtn ${t.holder ? "" : "empty"}`} aria-label="Assignee">
            <ToolMark tool={t.holder?.tool} size={20} />
            <span className="trunc">{t.holder ? TOOL_LABEL[t.holder.tool] : "Not held"}</span>
          </span>
        );
      case "priority":
        return (
          <span className="pillbtn" aria-label="Priority">
            <PriorityIcon priority={t.priority} />
            <span>P{t.priority}</span>
          </span>
        );
      case "labels":
        return (
          <span className="pillbtn gap-1 overflow-hidden" aria-label="Labels">
            <Labels task={t} />
          </span>
        );
      case "parent":
        return t.parent ? (
          <button type="button" className="pillbtn" aria-label="Parent" onClick={() => onOpen(t.parent!)} data-opens-task>
            <span className="trunc">{parentTitles()[t.parent] ?? t.parent}</span>
          </button>
        ) : (
          <span className="pillbtn empty">
            <span>None</span>
          </span>
        );
    }
  };

  const row = (t: Task, g: Group) => {
    const ch = kids(t.id);
    const parts = partsOf(t, tasks);
    const open = openRows[t.id];
    const q = openQuestions(t).length;
    return (
      <div key={t.id} className="contents">
        <div
          className={`trow ${t.status === "done" ? "done" : ""} ${sel.has(t.id) ? "sel" : ""} ${selected === t.id ? "bg-surface-2" : ""}`}
          style={style({ "--cols": tpl })}
          data-task-row={t.id}
          data-group={g.key}
        >
          <div className="handle" draggable data-drag-row={t.id} aria-hidden>
            {ic(GripVertical, 14)}
          </div>
          <div className="c-check">
            <input type="checkbox" className="check" checked={sel.has(t.id)} onChange={() => toggleSel(t.id)} aria-label={`Select ${t.title}`} />
          </div>
          <div className="ttl" data-opens-task onClick={() => onOpen(t.id)}>
            {parts.total ? (
              <button
                type="button"
                className="ibtn ibtn-xs -ml-1"
                aria-label={`${open ? "Hide" : "Show"} subtasks`}
                aria-expanded={!!open}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenRows((now) => ({ ...now, [t.id]: !now[t.id] }));
                }}
              >
                {ic(open ? ChevronDown : ChevronRight, 13)}
              </button>
            ) : (
              <span className="w-4.5 shrink-0" />
            )}
            <span className="key">{t.id}</span>
            <span className="tt">{t.title}</span>
            {parts.total > 0 && (
              <span className="meta-mini">
                {ic(ListChecks, 11)}
                {parts.done}/{parts.total}
              </span>
            )}
            {q > 0 && (
              <span className="meta-mini">
                {ic(MessageSquare, 11)}
                {q}
              </span>
            )}
          </div>
          {COLS.map((c) => (
            <div key={c} className={`c-meta c-${c === "labels" ? "lbl" : c}`}>
              {cell(t, c)}
            </div>
          ))}
          <div className="c-more">
            <IconButton label="More actions" size="sm" onClick={pop.toggle(`more:${t.id}`)}>
              {ic(Ellipsis, 15)}
            </IconButton>
          </div>
        </div>
        {open && (
          <div className="subrows">
            {ch.map((k) => (
              <div key={k.id} className={`subrow ${k.status === "done" ? "done" : ""}`}>
                <StatusIcon status={k.status} />
                <button type="button" className="cursor-pointer" data-opens-task onClick={() => onOpen(k.id)}>
                  {k.title}
                </button>
              </div>
            ))}
            {t.subtasks.map((st) => (
              <div key={st.id} className={`subrow ${st.done ? "done" : ""} ${popped === st.id ? "fx-done" : ""}`}>
                <SubCheck id={st.id} done={st.done} title={st.title} />
                <span>{st.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const popTask = pop.open && !pop.open.key.startsWith("bulk") ? tasks.find((t) => t.id === pop.open!.key.split(":")[1]) : undefined;
  const chosen = [...sel].map((id) => tasks.find((t) => t.id === id)!).filter(Boolean);

  return (
    <>
      <div className="tlist" role="table" aria-label="Tasks">
        <div className="thead" style={style({ "--cols": tpl })} role="row">
          <div />
          <div>
            <input
              ref={selAll}
              type="checkbox"
              className="check"
              checked={nSel > 0 && nSel === all.length}
              onChange={() => {
                if (nSel === all.length) setSel(new Set());
                else {
                  setBulkIn(sel.size === 0);
                  setSel(new Set(all));
                }
              }}
              aria-label="Select all"
            />
          </div>
          <div className="cursor-pointer" onClick={() => sortBy("title")}>
            Task {arrow("title")}
          </div>
          {COLS.map((c) => {
            const f: SortKey = c === "labels" || c === "parent" ? "manual" : c;
            return (
              <div className="cursor-pointer" key={c} onClick={() => sortBy(f)}>
                {LCOLS[c][0]} {v.sort.f === c ? arrow(c) : null}
              </div>
            );
          })}
          <div />
        </div>
        {groups.map((g) => {
          const head = groupHead(g);
          const gk = g.key;
          const coll = closed[gk] ?? false;
          const adds = v.group === "status" && ADDS.has(g.key);
          return (
            <div key={gk} className="contents">
              {(groups.length > 1 || g.key !== "all") && (
                <GroupHeader
                  name={head.name}
                  count={g.tasks.length}
                  open={!coll}
                  onToggle={() => setClosed((now) => ({ ...now, [gk]: !coll }))}
                  lead={head.html}
                  actions={
                    adds && (
                      <IconButton label={`Add task to ${head.name}`} size="xs" onClick={() => onNewTask()}>
                        {ic(Plus, 13)}
                      </IconButton>
                    )
                  }
                />
              )}
              {!coll && g.tasks.map((t) => row(t, g))}
              {!coll && adds && (
                <button type="button" className="addrow" onClick={() => onNewTask()}>
                  {ic(Plus, 14)}Add task
                </button>
              )}
            </div>
          );
        })}
      </div>

      {nSel > 0 && (
        <div className={`bulkbar ${bulkIn ? "enter" : ""}`} role="toolbar" aria-label="Bulk actions" onAnimationEnd={() => setBulkIn(false)}>
          <b className="font-semibold">{nSel} selected</b>
          <span className="sep" />
          <Button variant="inverse" size="sm" onClick={pop.toggle("bulk")}>
            {ic(CircleDot, 14)}Status
          </Button>
          <span className="sep" />
          <Button variant="inverse" size="sm" onClick={() => setSel(new Set())} aria-label="Clear selection">
            {ic(X, 14)}
          </Button>
        </div>
      )}

      {pop.open?.key === "bulk" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          {PERSON_MOVES.map((s) => {
            const ids = chosen.filter((t) => PERSON_MOVES.includes(t.status) && t.status !== s).map((t) => t.id);
            return (
              <MenuItem lead={<StatusIcon status={s} />} key={s} disabled={!ids.length} onClick={() => onMove(ids, s)}>
                {STATUS_LABEL[s]}
                {!ids.length && <span className="r faint">None to move</span>}
              </MenuItem>
            );
          })}
        </Pop>
      )}
      {popTask && pop.open?.key.startsWith("status:") && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          {PERSON_MOVES.map((s, i) => (
            <MenuItem
              key={s}
              role="menuitemradio"
              aria-checked={popTask.status === s}
              lead={<StatusIcon status={s} />}
              keys={String(i + 1)}
              checked={popTask.status === s}
              onClick={() => s !== popTask.status && onMove([popTask.id], s)}
            >
              <span className="trunc">{STATUS_LABEL[s]}</span>
            </MenuItem>
          ))}
        </Pop>
      )}
      {popTask && pop.open?.key.startsWith("more:") && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          <TaskMenu task={popTask} starred={stars.has(`task:${popTask.id}`)} onOpen={onOpen} onMove={(s) => onMove([popTask.id], s)} />
        </Pop>
      )}
    </>
  );
}

/** gr8r's task menu, with the actions agentree has: a person moves a task only between Backlog and Ready. */
function TaskMenu({
  task: t,
  starred,
  onOpen,
  onMove,
}: {
  task: Task;
  starred: boolean;
  onOpen?: (id: string) => void;
  onMove: (status: Status) => void;
}) {
  return (
    <>
      {onOpen && (
        <MenuItem icon={PanelRightOpen} onClick={() => onOpen(t.id)}>
          Open
        </MenuItem>
      )}
      {PERSON_MOVES.includes(t.status) && (
        <>
          {onOpen && <MenuSeparator />}
          {PERSON_MOVES.filter((s) => s !== t.status).map((s) => (
            <MenuItem icon={CircleDot} key={s} onClick={() => onMove(s)}>
              Move to {STATUS_LABEL[s]}
            </MenuItem>
          ))}
        </>
      )}
      <MenuSeparator />
      <MenuItem icon={Star} onClick={() => toast(toggleStar(`task:${t.id}`) ? "Added to favorites" : "Removed from favorites", { ms: 1800 })}>
        {starred ? "Remove from favorites" : "Add to favorites"}
      </MenuItem>
      <MenuItem icon={Link} onClick={() => copy(`${location.origin}/project/${board().project.id}/task/${t.id}`)}>
        Copy link
      </MenuItem>
    </>
  );
}
