import { ArrowDown, ArrowUp, Plus, SearchX } from "lucide-react";
import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { PARENT_TITLES } from "../board/fixtures.ts";
import { STATUS_LABEL, TOOL_LABEL, type Status, type Task } from "../board/task.ts";
import { Button } from "../design/components/Button.tsx";
import { Empty } from "../design/components/Empty.tsx";
import { ic } from "../design/components/icon.tsx";
import { MenuItem } from "../design/components/Menu.tsx";
import { Pop, usePop } from "../design/components/Pop.tsx";
import { shortDate } from "../design/format/time.ts";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { PERSON_MOVES } from "./TaskDrawer.tsx";
import { Labels } from "./TaskList.tsx";
import { groupTasks, updatedAt, type Column, type SortKey, type View } from "./view.ts";
import { COLUMNS, optLabel } from "./ViewToolbar.tsx";

type Props = {
  tasks: Task[];
  view: View;
  onView: (next: View) => void;
  deps: Map<string, string[]>;
  now: Date;
  selected?: string;
  onOpen: (id: string) => void;
  onMove: (ids: string[], status: Status) => void;
  onNotBuilt: (what: string) => void;
  onClear: () => void;
};

const SORTABLE: Partial<Record<Column, SortKey>> = {
  title: "title",
  status: "status",
  priority: "priority",
  assignee: "assignee",
  created: "created",
  updated: "updated",
};

export function TaskGrid({ tasks, view: v, onView, deps, now, selected, onOpen, onMove, onNotBuilt, onClear }: Props) {
  const pop = usePop<string>();
  const justResized = useRef(false);
  const cols = COLUMNS.filter(([c]) => c === "title" || !v.hidden.includes(c));
  const w = (c: (typeof COLUMNS)[number]) => v.colW[c[0]] ?? c[2];
  const groups = groupTasks(tasks, v.group);
  const totalW = cols.reduce((a, c) => a + w(c), 0);
  const byId = (id: string) => tasks.find((t) => t.id === id);

  if (!tasks.length)
    return (
      <Empty icon={SearchX} title="No results found" text="No tasks match these filters.">
        <Button size="sm" onClick={onClear}>
          Clear filters
        </Button>
      </Empty>
    );

  const sortBy = (c: Column) => {
    if (justResized.current) return;
    const f = SORTABLE[c] ?? "manual";
    onView({ ...v, sort: v.sort.f === f ? { f, dir: v.sort.dir > 0 ? -1 : 1 } : { f, dir: 1 } });
  };

  const resize = (c: Column) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    const tbl = handle.closest("table")!;
    const col = tbl.querySelector<HTMLElement>(`col[data-col="${c}"]`)!;
    const w0 = col.getBoundingClientRect().width || parseFloat(col.style.width);
    const tw0 = tbl.getBoundingClientRect().width;
    const x0 = e.clientX;
    handle.classList.add("on");
    const mv = (ev: PointerEvent) => {
      const nw = Math.max(64, w0 + ev.clientX - x0);
      col.style.width = `${nw}px`;
      tbl.style.width = `${tw0 + nw - w0}px`;
    };
    const up = (ev: PointerEvent) => {
      removeEventListener("pointermove", mv);
      removeEventListener("pointerup", up);
      handle.classList.remove("on");
      justResized.current = true;
      setTimeout(() => (justResized.current = false), 60);
      onView({ ...v, colW: { ...v.colW, [c]: Math.max(64, Math.round(w0 + ev.clientX - x0)) } });
    };
    addEventListener("pointermove", mv);
    addEventListener("pointerup", up);
  };

  const cell = (t: Task, c: Column) => {
    switch (c) {
      case "title":
        return (
          <td key={c} className="sticky cellbtn" data-opens-task onClick={() => onOpen(t.id)}>
            <span className="flex items-center gap-2">
              <StatusIcon status={t.status} size={14} />
              <span className="trunc font-book">{t.title}</span>
              <span className="mono faint ml-auto text-2xs">{t.id}</span>
            </span>
          </td>
        );
      case "status": {
        const movable = PERSON_MOVES.includes(t.status);
        return (
          <td
            key={c}
            className={movable ? "cellbtn" : ""}
            onClick={movable ? (e) => pop.toggle(t.id)(e) : undefined}
            aria-haspopup={movable ? "menu" : undefined}
          >
            <span className="flex items-center gap-1.5">
              <StatusIcon status={t.status} />
              <span>{STATUS_LABEL[t.status]}</span>
            </span>
          </td>
        );
      }
      case "priority":
        return (
          <td key={c}>
            <span className="flex items-center gap-1.5">
              <PriorityIcon priority={t.priority} />
              <span>P{t.priority}</span>
            </span>
          </td>
        );
      case "assignee":
        return (
          <td key={c}>
            <span className="flex items-center gap-1.5">
              <ToolMark tool={t.holder?.tool} size={20} />
              <span className={`trunc ${t.holder ? "" : "faint"}`}>{t.holder ? TOOL_LABEL[t.holder.tool] : "Not held"}</span>
            </span>
          </td>
        );
      case "labels":
        return (
          <td key={c}>
            <span className="flex items-center gap-1">
              <Labels task={t} max={9} />
            </span>
          </td>
        );
      case "deps": {
        const d = deps.get(t.id) ?? [];
        return (
          <td key={c}>
            {d.length ? (
              d.map((id) => (
                <span key={id} className="depchip" title={byId(id)?.title}>
                  {id}
                </span>
              ))
            ) : (
              <span className="faint">—</span>
            )}
          </td>
        );
      }
      case "created":
        return (
          <td key={c} className="num muted">
            {shortDate(t.createdAt, now)}
          </td>
        );
      case "updated":
        return (
          <td key={c} className="num muted">
            {shortDate(new Date(updatedAt(t)), now)}
          </td>
        );
      case "parent":
        return (
          <td key={c} className={t.parent ? "cellbtn" : ""} onClick={t.parent ? () => onOpen(t.parent!) : undefined} data-opens-task>
            {t.parent ? <span className="trunc">{PARENT_TITLES[t.parent] ?? t.parent}</span> : <span className="faint">—</span>}
          </td>
        );
    }
  };

  const popTask = pop.open && byId(pop.open.key);

  return (
    <>
      <div className="tbl-wrap hide-m">
        <table className="tbl" style={{ width: totalW }} aria-label="Tasks table">
          <colgroup>
            {cols.map((c) => (
              <col key={c[0]} data-col={c[0]} style={{ width: w(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {cols.map((c) => {
                const f = SORTABLE[c[0]];
                return (
                  <th key={c[0]} className={c[0] === "title" ? "sticky" : ""} scope="col">
                    <div className="thi" onClick={() => sortBy(c[0])}>
                      {c[1]}
                      {f && v.sort.f === f && ic(v.sort.dir > 0 ? ArrowUp : ArrowDown, 11)}
                    </div>
                    <span className="rsz" aria-hidden onPointerDown={resize(c[0])} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => {
              const head =
                v.group === "parent"
                  ? { html: undefined, name: g.key === "none" ? "No parent" : (PARENT_TITLES[g.key] ?? g.key) }
                  : v.group === "none"
                    ? { html: undefined, name: "" }
                    : optLabel(v.group, g.key, `P${g.key}`);
              return (
                <GroupRows key={g.key}>
                  {v.group !== "none" && (
                    <tr className="grow-row">
                      <td className="sticky" colSpan={cols.length}>
                        <span className="flex items-center gap-1.5">
                          {head.html}
                          {head.name}
                          <span className="faint font-medium">{g.tasks.length}</span>
                        </span>
                      </td>
                    </tr>
                  )}
                  {g.tasks.map((t) => (
                    <tr key={t.id} className={selected === t.id ? "outline -outline-offset-1 outline-accent-line" : ""}>
                      {cols.map((c) => cell(t, c[0]))}
                    </tr>
                  ))}
                </GroupRows>
              );
            })}
            <tr>
              <td className="sticky cellbtn text-ink-3" colSpan={cols.length} onClick={() => onNotBuilt("Creating a task")}>
                <span className="flex items-center gap-1.5">{ic(Plus, 14)}New task</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="only-m pt-2 px-4 pb-22.5">
        {tasks.map((t) => (
          <div key={t.id} className="panel p-3 mb-2" data-opens-task onClick={() => onOpen(t.id)}>
            <div className="flex items-center gap-2 mb-2">
              <StatusIcon status={t.status} />
              <b className="flex-1 min-w-0 font-medium">{t.title}</b>
              <span className="mono faint text-2xs">{t.id}</span>
            </div>
            <div className="flex items-center muted flex-wrap gap-2.5 text-(length:--text-xs)">
              <PriorityIcon priority={t.priority} />
              <span>P{t.priority}</span>
              <ToolMark tool={t.holder?.tool} size={20} />
              <span className="muted">{t.holder ? TOOL_LABEL[t.holder.tool] : "Not held"}</span>
            </div>
          </div>
        ))}
      </div>

      {popTask && pop.open && (
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
    </>
  );
}

function GroupRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
