import {
  ArrowDown,
  ArrowUp,
  Check,
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
import { PARENT_TITLES } from "../board/fixtures.ts";
import { toggleStar, useStars } from "../board/favorites.ts";
import { partsOf } from "../board/summary.ts";
import { useTicks } from "../board/ticks.ts";
import { KIND_LABEL, STATUS_LABEL, TOOL_LABEL, type Status, type Task } from "../board/task.ts";
import { Empty, style } from "../pages/parts.tsx";
import { ic } from "../ui/ic.tsx";
import { KIND_COLOR } from "../ui/KindMark.tsx";
import { Pop, usePop } from "../ui/Pop.tsx";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { copy, toast } from "../ui/toast.ts";
import { ToolMark } from "../ui/ToolMark.tsx";
import { SubCheck } from "./SubCheck.tsx";
import { PERSON_MOVES } from "./TaskDrawer.tsx";
import { optLabel } from "./ViewToolbar.tsx";
import { rfcLabel, type Group, type SortKey, type View } from "./view.ts";

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
          <span key="r" className="lbl" style={style({ "--c": "var(--gray)" })}>
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
  onNotBuilt: (what: string) => void;
};

type PopKey = `status:${string}` | `more:${string}` | "bulk";

export function TaskList({ groups, view: v, onView, tasks, selected, onOpen, onMove, onNotBuilt }: Props) {
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

  const sortBy = (f: SortKey) =>
    onView({ ...v, sort: v.sort.f === f ? { f, dir: v.sort.dir > 0 ? -1 : 1 } : { f, dir: 1 } });
  const arrow = (f: SortKey) => (v.sort.f === f ? ic(v.sort.dir > 0 ? ArrowUp : ArrowDown, 11) : null);

  if (!all.length)
    return <Empty icon={ListChecks} title="No tasks here" text="No task matches the search and filters." />;

  const groupHead = (g: Group) => {
    const opt = v.group === "parent" ? { name: g.key === "none" ? "No parent" : (PARENT_TITLES[g.key] ?? g.key) } : optLabel(v.group as never, g.key, `P${g.key}`);
    return { html: "html" in opt ? opt.html : undefined, name: opt.name };
  };

  const cell = (t: Task, c: Col) => {
    switch (c) {
      case "status": {
        const movable = PERSON_MOVES.includes(t.status);
        return (
          <button
            type="button"
            className="pillbtn"
            onClick={movable ? pop.toggle(`status:${t.id}`) : undefined}
            style={movable ? undefined : { cursor: "default" }}
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
          <span className="pillbtn" aria-label="Labels" style={{ gap: 4, overflow: "hidden" }}>
            <Labels task={t} />
          </span>
        );
      case "parent":
        return t.parent ? (
          <button type="button" className="pillbtn" aria-label="Parent" onClick={() => onOpen(t.parent!)} data-opens-task>
            <span className="trunc">{PARENT_TITLES[t.parent] ?? t.parent}</span>
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
    const q = t.questions.length;
    return (
      <div key={t.id} className="contents">
        <div
          className={`trow ${t.status === "done" ? "done" : ""} ${sel.has(t.id) ? "sel" : ""}`}
          style={{ ...style({ "--cols": tpl }), ...(selected === t.id ? { background: "var(--surface-2)" } : {}) }}
          data-task-row={t.id}
          data-group={g.key}
        >
          <div className="handle" draggable data-drag-row={t.id} aria-hidden>
            {ic(GripVertical, 14)}
          </div>
          <div className="c-check">
            <input
              type="checkbox"
              className="check"
              checked={sel.has(t.id)}
              onChange={() => toggleSel(t.id)}
              aria-label={`Select ${t.title}`}
            />
          </div>
          <div className="ttl" data-opens-task onClick={() => onOpen(t.id)}>
            {parts.total ? (
              <span
                className="ibtn ibtn-xs"
                role="button"
                aria-label={`${open ? "Hide" : "Show"} subtasks`}
                aria-expanded={!!open}
                style={{ marginLeft: -4 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenRows((now) => ({ ...now, [t.id]: !now[t.id] }));
                }}
              >
                {ic(open ? ChevronDown : ChevronRight, 13)}
              </span>
            ) : (
              <span style={{ width: 18, flexShrink: 0 }} />
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
            <button type="button" className="ibtn ibtn-sm" onClick={pop.toggle(`more:${t.id}`)} aria-label="More actions">
              {ic(Ellipsis, 15)}
            </button>
          </div>
        </div>
        {open && (
          <div className="subrows">
            {ch.map((k) => (
              <div key={k.id} className={`subrow ${k.status === "done" ? "done" : ""}`}>
                <StatusIcon status={k.status} />
                <span role="button" tabIndex={0} style={{ cursor: "pointer" }} data-opens-task onClick={() => onOpen(k.id)}>
                  {k.title}
                </span>
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
          <div onClick={() => sortBy("title")} style={{ cursor: "pointer" }}>
            Task {arrow("title")}
          </div>
          {COLS.map((c) => {
            const f: SortKey = c === "labels" || c === "parent" ? "manual" : c;
            return (
              <div key={c} onClick={() => sortBy(f)} style={{ cursor: "pointer" }}>
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
                <div className="grp">
                  <button
                    type="button"
                    className="ibtn ibtn-xs"
                    onClick={() => setClosed((now) => ({ ...now, [gk]: !coll }))}
                    aria-expanded={!coll}
                    aria-label="Toggle group"
                  >
                    {ic(coll ? ChevronRight : ChevronDown, 13)}
                  </button>
                  {head.html}
                  <span>{head.name}</span>
                  <span className="cnt">{g.tasks.length}</span>
                  {adds && (
                    <button
                      type="button"
                      className="ibtn ibtn-xs"
                      onClick={() => onNotBuilt("Creating a task")}
                      aria-label={`Add task to ${head.name}`}
                    >
                      {ic(Plus, 13)}
                    </button>
                  )}
                </div>
              )}
              {!coll && g.tasks.map((t) => row(t, g))}
              {!coll && adds && (
                <button type="button" className="addrow" onClick={() => onNotBuilt("Creating a task")}>
                  {ic(Plus, 14)}Add task
                </button>
              )}
            </div>
          );
        })}
      </div>

      {nSel > 0 && (
        <div className={`bulkbar ${bulkIn ? "enter" : ""}`} role="toolbar" aria-label="Bulk actions" onAnimationEnd={() => setBulkIn(false)}>
          <b style={{ fontWeight: 600 }}>{nSel} selected</b>
          <span className="sep" />
          <button type="button" className="btn btn-sm" onClick={pop.toggle("bulk")}>
            {ic(CircleDot, 14)}Status
          </button>
          <span className="sep" />
          <button type="button" className="btn btn-sm" onClick={() => setSel(new Set())} aria-label="Clear selection">
            {ic(X, 14)}
          </button>
        </div>
      )}

      {pop.open?.key === "bulk" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          {PERSON_MOVES.map((s) => {
            const ids = chosen.filter((t) => PERSON_MOVES.includes(t.status) && t.status !== s).map((t) => t.id);
            return (
              <button key={s} type="button" className="mi" disabled={!ids.length} onClick={() => onMove(ids, s)}>
                <StatusIcon status={s} />
                {STATUS_LABEL[s]}
                {!ids.length && <span className="r faint">None to move</span>}
              </button>
            );
          })}
        </Pop>
      )}
      {popTask && pop.open?.key.startsWith("status:") && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          {PERSON_MOVES.map((s, i) => (
            <button
              key={s}
              type="button"
              className="mi"
              role="menuitemradio"
              aria-checked={popTask.status === s}
              onClick={() => s !== popTask.status && onMove([popTask.id], s)}
            >
              <StatusIcon status={s} />
              <span className="trunc">{STATUS_LABEL[s]}</span>
              <span className="r">
                <kbd>{i + 1}</kbd>
              </span>
              {popTask.status === s && <span className="ck">{ic(Check, 14)}</span>}
            </button>
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
export function TaskMenu({
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
        <button type="button" className="mi" onClick={() => onOpen(t.id)}>
          {ic(PanelRightOpen, 15)}Open
        </button>
      )}
      {PERSON_MOVES.includes(t.status) && (
        <>
          {onOpen && <div className="msep" />}
          {PERSON_MOVES.filter((s) => s !== t.status).map((s) => (
            <button key={s} type="button" className="mi" onClick={() => onMove(s)}>
              {ic(CircleDot, 15)}Move to {STATUS_LABEL[s]}
            </button>
          ))}
        </>
      )}
      <div className="msep" />
      <button
        type="button"
        className="mi"
        onClick={() => toast(toggleStar(`task:${t.id}`) ? "Added to favorites" : "Removed from favorites", { ms: 1800 })}
      >
        {ic(Star, 15)}
        {starred ? "Remove from favorites" : "Add to favorites"}
      </button>
      <button type="button" className="mi" onClick={() => copy(`${location.origin}/task/${t.id}`)}>
        {ic(Link, 15)}Copy link
      </button>
    </>
  );
}
