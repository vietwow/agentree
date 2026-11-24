import { PARENT_TITLES } from "../board/fixtures.ts";
import { KINDS, STATUSES, TOOLS, type Task } from "../board/task.ts";
import { DAY } from "../design/format/time.ts";

export type Mode = "list" | "board" | "table";
export type Field = "status" | "assignee" | "priority" | "labels" | "parent" | "created" | "updated";
type Filter = { f: Field; op: "is" | "not"; v: string[] };
export type SortKey = "manual" | "priority" | "title" | "status" | "assignee" | "created" | "updated";
export type GroupKey = "status" | "priority" | "assignee" | "parent" | "none";
export type Column = "title" | "status" | "priority" | "assignee" | "labels" | "deps" | "created" | "updated" | "parent";

export type View = {
  mode: Mode;
  filters: Filter[];
  sort: { f: SortKey; dir: 1 | -1 };
  group: GroupKey;
  q: string;
  hidden: Column[];
  colW: Partial<Record<Column, number>>;
};

const KEY = "agentree.tasks.view";

export const NEW_VIEW: View = {
  mode: "list",
  filters: [],
  sort: { f: "manual", dir: 1 },
  group: "status",
  q: "",
  hidden: ["created", "deps"],
  colW: {},
};

export function savedView(): View {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return typeof saved === "object" && saved !== null && !Array.isArray(saved) ? { ...NEW_VIEW, ...saved } : NEW_VIEW;
  } catch {
    return NEW_VIEW;
  }
}

export function saveView(view: View) {
  const { q: _q, ...kept } = view;
  localStorage.setItem(KEY, JSON.stringify(kept));
}

export const updatedAt = (t: Task) => Math.max(t.statusSince.getTime(), t.holder?.beat.getTime() ?? 0);
export const rfcLabel = (rfc: string) => `RFC ${rfc}`;

export const FIELD_NAME: Record<Field, string> = {
  status: "Status",
  assignee: "Assignee",
  priority: "Priority",
  labels: "Labels",
  parent: "Parent",
  created: "Created date",
  updated: "Updated date",
};

export type Opt = { id: string; name: string };

/** Each field's values to filter by, from the tasks there are. */
export function fieldOpts(f: Field, tasks: readonly Task[]): Opt[] {
  switch (f) {
    case "status":
      return STATUSES.map((s) => ({ id: s, name: s }));
    case "assignee":
      return [{ id: "none", name: "none" }, ...TOOLS.map((t) => ({ id: t, name: t }))];
    case "priority":
      return [...new Set(tasks.map((t) => t.priority))].sort().map((p) => ({ id: String(p), name: `P${p}` }));
    case "labels":
      return [
        ...KINDS.map((k) => ({ id: k, name: k })),
        ...[...new Set(tasks.flatMap((t) => (t.rfc ? [t.rfc] : [])))].sort().map((r) => ({ id: `rfc:${r}`, name: rfcLabel(r) })),
      ];
    case "parent":
      return [...Object.entries(PARENT_TITLES).map(([id, title]) => ({ id, name: title })), { id: "none", name: "No parent" }];
    case "created":
    case "updated":
      return [
        { id: "1", name: "Last 24 hours" },
        { id: "7", name: "Last 7 days" },
        { id: "30", name: "Last 30 days" },
      ];
  }
}

function matchF(t: Task, f: Filter, now: Date): boolean {
  if (!f.v.length) return true;
  let hit: boolean;
  if (f.f === "labels") hit = f.v.some((v) => v === t.kind || v === `rfc:${t.rfc}`);
  else if (f.f === "assignee") hit = f.v.includes(t.holder?.tool ?? "none");
  else if (f.f === "priority") hit = f.v.includes(String(t.priority));
  else if (f.f === "parent") hit = f.v.includes(t.parent ?? "none");
  else if (f.f === "created" || f.f === "updated") {
    const at = f.f === "created" ? t.createdAt.getTime() : updatedAt(t);
    hit = f.v.some((v) => now.getTime() - at <= Number(v) * DAY);
  } else hit = f.v.includes(t.status);
  return f.op === "not" ? !hit : hit;
}

export function applyView(tasks: readonly Task[], v: View, order: (t: Task) => number, now: Date): Task[] {
  let out = tasks.filter((t) => v.filters.every((f) => matchF(t, f, now)));
  if (v.q) {
    const q = v.q.toLowerCase();
    out = out.filter((t) => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
  }
  return sortTasks(out, v.sort, order);
}

function sortTasks(tasks: Task[], s: View["sort"], order: (t: Task) => number): Task[] {
  const key: (t: Task) => string | number = {
    manual: order,
    priority: (t: Task) => t.priority,
    title: (t: Task) => t.title.toLowerCase(),
    status: (t: Task) => STATUSES.indexOf(t.status),
    assignee: (t: Task) => t.holder?.tool ?? "zzz",
    created: (t: Task) => -t.createdAt.getTime(),
    updated: (t: Task) => -updatedAt(t),
  }[s.f];
  return [...tasks].sort((x, y) => {
    const p = key(x);
    const q = key(y);
    return (p > q ? 1 : p < q ? -1 : 0) * s.dir;
  });
}

export type Group = { key: string; tasks: Task[] };

/** Status and priority show every group, the others only those with tasks. */
export function groupTasks(tasks: Task[], g: GroupKey): Group[] {
  if (g === "none") return [{ key: "all", tasks }];
  const keys: string[] =
    g === "status"
      ? [...STATUSES]
      : g === "priority"
        ? [...new Set(tasks.map((t) => t.priority))].sort().map(String)
        : g === "assignee"
          ? [...TOOLS, "none"]
          : [...Object.keys(PARENT_TITLES), "none"];
  const of = (t: Task) =>
    g === "status" ? t.status : g === "priority" ? String(t.priority) : g === "assignee" ? (t.holder?.tool ?? "none") : (t.parent ?? "none");
  const groups = keys.map((key) => ({ key, tasks: tasks.filter((t) => of(t) === key) }));
  return g === "status" || g === "priority" ? groups : groups.filter((G) => G.tasks.length);
}
