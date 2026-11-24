import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CalendarPlus,
  Check,
  ChevronDown,
  CircleDot,
  Columns3,
  History,
  ListFilter,
  ListTree,
  Minus,
  Plus,
  Rows3,
  RotateCcw,
  Search,
  SignalHigh,
  Tag,
  Trash2,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { KIND_LABEL, STATUS_LABEL, TOOL_LABEL, type Kind, type Status, type Task, type Tool } from "../board/task.ts";
import { ic } from "../ui/ic.tsx";
import { KIND_COLOR } from "../ui/KindMark.tsx";
import { Pop, usePop } from "../ui/Pop.tsx";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { style } from "../pages/parts.tsx";
import { FIELD_NAME, fieldOpts, type Column, type Field, type GroupKey, type SortKey, type View } from "./view.ts";

const FIELD_ICON: Record<Field, LucideIcon> = {
  status: CircleDot,
  assignee: User,
  priority: SignalHigh,
  labels: Tag,
  parent: ListTree,
  created: CalendarPlus,
  updated: History,
};

const SORTS: [SortKey, string][] = [
  ["manual", "Manual"],
  ["priority", "Priority"],
  ["title", "Title"],
  ["status", "Status"],
  ["assignee", "Assignee"],
  ["created", "Created"],
  ["updated", "Last updated"],
];

const GROUPS: [GroupKey, string, LucideIcon][] = [
  ["status", "Status", CircleDot],
  ["priority", "Priority", SignalHigh],
  ["assignee", "Assignee", User],
  ["parent", "Parent", ListTree],
  ["none", "No grouping", Minus],
];

export const COLUMNS: [Column, string, number][] = [
  ["title", "Task", 314],
  ["status", "Status", 132],
  ["priority", "Priority", 112],
  ["assignee", "Assignee", 156],
  ["labels", "Labels", 180],
  ["deps", "Dependencies", 150],
  ["created", "Created", 112],
  ["updated", "Updated", 112],
  ["parent", "Parent", 200],
];

/** An option of a field as gr8r shows it: its mark, then its name. */
export function optLabel(f: Field, id: string, name: string): { html?: ReactNode; name: string } {
  switch (f) {
    case "status":
      return { html: <StatusIcon status={id as Status} />, name: STATUS_LABEL[id as Status] };
    case "assignee":
      return id === "none"
        ? { html: <ToolMark size={20} />, name: "Not held" }
        : { html: <ToolMark tool={id as Tool} size={20} />, name: TOOL_LABEL[id as Tool] };
    case "priority":
      return { html: <PriorityIcon priority={Number(id)} />, name };
    case "labels":
      return id.startsWith("rfc:")
        ? { html: <span className="pdot" style={style({ "--c": "var(--gray)" })} />, name }
        : { html: <span className="pdot" style={style({ "--c": KIND_COLOR[id as Kind] })} />, name: KIND_LABEL[id as Kind] };
    case "created":
    case "updated":
      return { html: ic(Calendar, 14), name };
    default:
      return { name };
  }
}

type Props = {
  view: View;
  onView: (next: View) => void;
  tasks: readonly Task[];
  group?: boolean;
  cols?: boolean;
  extra?: ReactNode;
  right?: ReactNode;
};

type PopKey = "filter" | "sort" | "group" | "cols" | `fvals:${number}`;

export function ViewToolbar({ view: v, onView, tasks, group = true, cols = false, extra, right }: Props) {
  const pop = usePop<PopKey>();
  const [edit, setEdit] = useState<number>();
  const set = (patch: Partial<View>) => onView({ ...v, ...patch });
  const setFilter = (i: number, patch: Partial<View["filters"][number]>) =>
    set({ filters: v.filters.map((f, j) => (j === i ? { ...f, ...patch } : f)) });
  const toggleVal = (i: number, id: string) => {
    const f = v.filters[i]!;
    setFilter(i, { v: f.v.includes(id) ? f.v.filter((x) => x !== id) : [...f.v, id] });
  };
  const remove = (i: number) => {
    set({ filters: v.filters.filter((_, j) => j !== i) });
    setEdit(undefined);
  };
  const names = (f: View["filters"][number]) => {
    const opts = fieldOpts(f.f, tasks);
    return f.v.map((id) => optLabel(f.f, id, opts.find((o) => o.id === id)?.name ?? id).name);
  };
  const sortName = SORTS.find(([k]) => k === v.sort.f)![1];
  const groupName = { status: "Status", priority: "Priority", assignee: "Assignee", parent: "Parent", none: "None" }[v.group];

  const valueList = (i: number, boxed: boolean) => {
    const f = v.filters[i]!;
    return fieldOpts(f.f, tasks).map((o) => {
      const l = optLabel(f.f, o.id, o.name);
      return (
        <label key={o.id} className="mi" data-keep style={{ cursor: "pointer", ...(boxed ? { minHeight: 28 } : {}) }}>
          <input type="checkbox" className="check" checked={f.v.includes(o.id)} onChange={() => toggleVal(i, o.id)} />
          {l.html}
          {l.name}
        </label>
      );
    });
  };

  return (
    <>
      <div className="toolbar" role="toolbar">
        <div className="inwrap">
          {ic(Search, 13)}
          <input
            className="input search-sm"
            placeholder="Search tasks"
            value={v.q}
            onChange={(e) => set({ q: e.target.value })}
            aria-label="Search tasks"
          />
        </div>
        <button type="button" className={`btn btn-ghost ${v.filters.length ? "on" : ""}`} onClick={pop.toggle("filter")}>
          {ic(ListFilter, 14)}Filter
          {v.filters.length > 0 && (
            <>
              {" "}
              <span className="badge accent" style={{ height: 16, padding: "0 5px" }}>
                {v.filters.length}
              </span>
            </>
          )}
        </button>
        <button type="button" className="btn btn-ghost" onClick={pop.toggle("sort")}>
          {ic(ArrowUpDown, 14)}
          <span className="hide-m">Sort:</span> {sortName}
        </button>
        {group && (
          <button type="button" className="btn btn-ghost" onClick={pop.toggle("group")}>
            {ic(Rows3, 14)}
            <span className="hide-m">Group:</span> {groupName}
          </button>
        )}
        {cols && (
          <button type="button" className="btn btn-ghost" onClick={pop.toggle("cols")}>
            {ic(Columns3, 14)}Columns
          </button>
        )}
        {extra}
        <span className="sp" />
        {right}
      </div>

      {v.filters.length > 0 && (
        <div className="chipsbar">
          {ic(ListFilter, 13)}
          {v.filters.map((f, i) => {
            const n = names(f);
            const val = n.length ? (n.length > 2 ? `${n.length} selected` : n.join(", ")) : "any";
            return (
              <span key={i} className="contents">
                {i > 0 && <span>and</span>}
                <span className="chip">
                  <button type="button" onClick={pop.toggle(`fvals:${i}`)} style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                    {ic(FIELD_ICON[f.f], 12)}
                    <b>{FIELD_NAME[f.f]}</b> {f.op === "not" ? "is not" : "is"} <span>{val}</span>
                  </button>
                  <button type="button" className="ibtn" onClick={() => remove(i)} aria-label="Remove filter">
                    {ic(X, 12)}
                  </button>
                </span>
              </span>
            );
          })}
          <button type="button" className="btn btn-sm btn-ghost" onClick={pop.toggle("filter")}>
            {ic(Plus, 12)}Add
          </button>
          <span className="sp" />
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ filters: [] })}>
            Clear all
          </button>
        </div>
      )}

      {pop.open?.key === "filter" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close} className="fbuild" style={{ maxWidth: 560 }}>
          <div className="mh fb-h">
            Filter by
            {v.filters.length > 0 && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => set({ filters: [] })}>
                Clear all
              </button>
            )}
          </div>
          {v.filters.length ? (
            <div className="fb-rows">
              {v.filters.map((f, i) => {
                const n = names(f);
                return (
                  <div key={i}>
                    <div className="frow">
                      <span className="conj">{i ? "and" : "Where"}</span>
                      <select className="select" value={f.f} onChange={(e) => setFilter(i, { f: e.target.value as Field, v: [] })} aria-label="Field">
                        {(Object.keys(FIELD_NAME) as Field[]).map((k) => (
                          <option key={k} value={k}>
                            {FIELD_NAME[k]}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select"
                        value={f.op}
                        onChange={(e) => setFilter(i, { op: e.target.value as "is" | "not" })}
                        aria-label="Operator"
                      >
                        <option value="is">is</option>
                        <option value="not">is not</option>
                      </select>
                      <button type="button" className="valbtn" onClick={() => setEdit(edit === i ? undefined : i)} aria-expanded={edit === i}>
                        <span className="trunc grow">{n.length ? n.join(", ") : <span className="faint">Select…</span>}</span>
                        {ic(ChevronDown, 12)}
                      </button>
                      <button type="button" className="ibtn ibtn-xs" onClick={() => remove(i)} aria-label="Remove filter">
                        {ic(Trash2, 13)}
                      </button>
                    </div>
                    {edit === i && (
                      <div
                        style={{
                          marginLeft: 50,
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-md)",
                          padding: 4,
                          maxHeight: 200,
                          overflow: "auto",
                        }}
                      >
                        {valueList(i, true)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="fb-empty">
              No filters applied. Combine filters to narrow the task list, e.g. Status is In progress and Assignee is Claude Code.
            </p>
          )}
          <div className="msep" />
          <div className="fb-add">
            <span className="faint">Add filter:</span>
            {(Object.keys(FIELD_NAME) as Field[]).map((k) => (
              <button
                key={k}
                type="button"
                className="badge"
                style={{ cursor: "pointer" }}
                onClick={() => {
                  set({ filters: [...v.filters, { f: k, op: "is", v: [] }] });
                  setEdit(v.filters.length);
                }}
              >
                {ic(FIELD_ICON[k], 11)}
                {FIELD_NAME[k]}
              </button>
            ))}
          </div>
        </Pop>
      )}

      {pop.open?.key.startsWith("fvals:") &&
        (() => {
          const i = Number(pop.open.key.slice(6));
          const f = v.filters[i];
          if (!f) return null;
          return (
            <Pop anchor={pop.open.anchor} onClose={pop.close}>
              <div className="mh">
                {FIELD_NAME[f.f]} {f.op === "not" ? "is not" : "is"}
              </div>
              {valueList(i, false)}
            </Pop>
          );
        })()}

      {pop.open?.key === "sort" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close} width={240}>
          <div className="mh">Sort by</div>
          {SORTS.map(([k, n]) => (
            <button key={k} type="button" className="mi" onClick={() => set({ sort: { ...v.sort, f: k } })}>
              {n}
              {v.sort.f === k && <span className="ck">{ic(Check, 14)}</span>}
            </button>
          ))}
          <div className="msep" />
          <div style={{ padding: "4px 6px" }}>
            <div className="seg" style={{ width: "100%" }}>
              <button
                type="button"
                className={v.sort.dir > 0 ? "on" : ""}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => set({ sort: { ...v.sort, dir: 1 } })}
              >
                {ic(ArrowUp, 12)}Ascending
              </button>
              <button
                type="button"
                className={v.sort.dir < 0 ? "on" : ""}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => set({ sort: { ...v.sort, dir: -1 } })}
              >
                {ic(ArrowDown, 12)}Descending
              </button>
            </div>
          </div>
        </Pop>
      )}

      {pop.open?.key === "group" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          <div className="mh">Group by</div>
          {GROUPS.map(([k, n, icon]) => (
            <button key={k} type="button" className="mi" onClick={() => set({ group: k })}>
              {ic(icon, 15)}
              {n}
              {v.group === k && <span className="ck">{ic(Check, 14)}</span>}
            </button>
          ))}
        </Pop>
      )}

      {pop.open?.key === "cols" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          <div className="mh">Visible columns</div>
          {COLUMNS.filter(([c]) => c !== "title").map(([c, n]) => (
            <label key={c} className="mi" data-keep style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                className="check"
                checked={!v.hidden.includes(c)}
                onChange={() => set({ hidden: v.hidden.includes(c) ? v.hidden.filter((x) => x !== c) : [...v.hidden, c] })}
              />
              {n}
            </label>
          ))}
          <div className="msep" />
          <button type="button" className="mi" onClick={() => set({ colW: {} })}>
            {ic(RotateCcw, 14)}Reset widths
          </button>
        </Pop>
      )}
    </>
  );
}
