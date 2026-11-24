import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calendar,
  CalendarPlus,
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
import { Badge } from "../design/components/Badge.tsx";
import { Button, IconButton } from "../design/components/Button.tsx";
import { ic } from "../design/components/icon.tsx";
import { MenuItem, MenuLabel, MenuSeparator } from "../design/components/Menu.tsx";
import { Pop, usePop } from "../design/components/Pop.tsx";
import { Segmented } from "../design/components/Segmented.tsx";
import { style } from "../pages/parts.tsx";
import { KIND_COLOR } from "../ui/colors.ts";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
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
        ? { html: <span className="pdot [--c:var(--gray)]" />, name }
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
        <label key={o.id} className={`mi cursor-pointer ${boxed ? "min-h-7" : ""}`} data-keep>
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
        <Button variant="ghost" on={v.filters.length > 0} onClick={pop.toggle("filter")}>
          {ic(ListFilter, 14)}Filter
          {v.filters.length > 0 && (
            <>
              {" "}
              <Badge tone="accent" className="h-4 px-1.25">
                {v.filters.length}
              </Badge>
            </>
          )}
        </Button>
        <Button variant="ghost" onClick={pop.toggle("sort")}>
          {ic(ArrowUpDown, 14)}
          <span className="hide-m">Sort:</span> {sortName}
        </Button>
        {group && (
          <Button variant="ghost" onClick={pop.toggle("group")}>
            {ic(Rows3, 14)}
            <span className="hide-m">Group:</span> {groupName}
          </Button>
        )}
        {cols && (
          <Button variant="ghost" onClick={pop.toggle("cols")}>
            {ic(Columns3, 14)}Columns
          </Button>
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
                  <button className="inline-flex gap-1.25 items-center" type="button" onClick={pop.toggle(`fvals:${i}`)}>
                    {ic(FIELD_ICON[f.f], 12)}
                    <b>{FIELD_NAME[f.f]}</b> {f.op === "not" ? "is not" : "is"} <span>{val}</span>
                  </button>
                  <IconButton label="Remove filter" onClick={() => remove(i)}>
                    {ic(X, 12)}
                  </IconButton>
                </span>
              </span>
            );
          })}
          <Button variant="ghost" size="sm" onClick={pop.toggle("filter")}>
            {ic(Plus, 12)}Add
          </Button>
          <span className="sp" />
          <Button variant="ghost" size="sm" onClick={() => set({ filters: [] })}>
            Clear all
          </Button>
        </div>
      )}

      {pop.open?.key === "filter" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close} className="fbuild max-w-140">
          <div className="mh fb-h">
            Filter by
            {v.filters.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => set({ filters: [] })}>
                Clear all
              </Button>
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
                      <IconButton label="Remove filter" size="xs" onClick={() => remove(i)}>
                        {ic(Trash2, 13)}
                      </IconButton>
                    </div>
                    {edit === i && <div className="ml-12.5 max-h-50 overflow-auto rounded-md border border-line p-1">{valueList(i, true)}</div>}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="fb-empty">
              No filters applied. Combine filters to narrow the task list, e.g. Status is In progress and Assignee is Claude Code.
            </p>
          )}
          <MenuSeparator />
          <div className="fb-add">
            <span className="faint">Add filter:</span>
            {(Object.keys(FIELD_NAME) as Field[]).map((k) => (
              <button
                key={k}
                type="button"
                className="badge cursor-pointer"

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
              <MenuLabel>
                {FIELD_NAME[f.f]} {f.op === "not" ? "is not" : "is"}
              </MenuLabel>
              {valueList(i, false)}
            </Pop>
          );
        })()}

      {pop.open?.key === "sort" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close} width={240}>
          <MenuLabel>Sort by</MenuLabel>
          {SORTS.map(([k, n]) => (
            <MenuItem key={k} checked={v.sort.f === k} onClick={() => set({ sort: { ...v.sort, f: k } })}>
              {n}
            </MenuItem>
          ))}
          <MenuSeparator />
          <div className="py-1 px-1.5">
            <Segmented
              label="Direction"
              fill
              value={v.sort.dir > 0 ? "up" : "down"}
              onChange={(d) => set({ sort: { ...v.sort, dir: d === "up" ? 1 : -1 } })}
              options={[
                { value: "up", label: "Ascending", icon: ArrowUp },
                { value: "down", label: "Descending", icon: ArrowDown },
              ]}
            />
          </div>
        </Pop>
      )}

      {pop.open?.key === "group" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          <MenuLabel>Group by</MenuLabel>
          {GROUPS.map(([k, n, icon]) => (
            <MenuItem key={k} icon={icon} checked={v.group === k} onClick={() => set({ group: k })}>
              {n}
            </MenuItem>
          ))}
        </Pop>
      )}

      {pop.open?.key === "cols" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          <MenuLabel>Visible columns</MenuLabel>
          {COLUMNS.filter(([c]) => c !== "title").map(([c, n]) => (
            <label key={c} className="mi cursor-pointer" data-keep>
              <input
                type="checkbox"
                className="check"
                checked={!v.hidden.includes(c)}
                onChange={() => set({ hidden: v.hidden.includes(c) ? v.hidden.filter((x) => x !== c) : [...v.hidden, c] })}
              />
              {n}
            </label>
          ))}
          <MenuSeparator />
          <MenuItem onClick={() => set({ colW: {} })}>{ic(RotateCcw, 14)}Reset widths</MenuItem>
        </Pop>
      )}
    </>
  );
}
