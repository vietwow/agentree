import { List, Plus, SquareKanban, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { setDropHandlers } from "../board/drag.ts";
import { fixtureDetail } from "../board/fixtures.ts";
import { stats, totals } from "../board/summary.ts";
import type { Status, Task } from "../board/task.ts";
import { Button } from "../ui/Button.tsx";
import { ic } from "../ui/ic.tsx";
import { toast } from "../ui/toast.ts";
import { StatCards } from "./StatCards.tsx";
import { TaskBoard } from "./TaskBoard.tsx";
import { PERSON_MOVES } from "./TaskDrawer.tsx";
import { TaskGrid } from "./TaskGrid.tsx";
import { TaskList } from "./TaskList.tsx";
import { ViewToolbar } from "./ViewToolbar.tsx";
import { applyView, groupTasks, saveView, savedView, type Mode, type View } from "./view.ts";

const MODES: [Mode, string, typeof List][] = [
  ["list", "List", List],
  ["board", "Board", SquareKanban],
  ["table", "Table", Table2],
];

type Props = {
  tasks: Task[];
  now: Date;
  /** The view a project's Board opens on. */
  mode?: Mode;
  selected?: string;
  onOpen: (id: string) => void;
  onMove: (ids: string[], status: Status) => void;
  order: (t: Task) => number;
  onOrder: (id: string, order: number) => void;
  onNotBuilt: (what: string) => void;
};

export function TasksPage({ tasks, now, mode, selected, onOpen, onMove, order, onOrder, onNotBuilt }: Props) {
  const [view, setView] = useState<View>(() => ({ ...savedView(), ...(mode ? { mode } : {}) }));
  const [landed, setLanded] = useState<string>();
  const change = (next: View) => {
    setView(next);
    saveView(next);
  };

  const sum = totals(tasks);
  const shown = useMemo(() => applyView(tasks, view, order, now), [tasks, view, order, now]);
  const deps = useMemo(() => new Map(tasks.map((t) => [t.id, fixtureDetail(t, tasks, now).dependsOn.map((d) => d.id)])), [tasks, now]);
  const byOrder = (list: readonly Task[]) => [...list].sort((a, b) => order(a) - order(b));

  useEffect(() => {
    const movable = (s: string) => PERSON_MOVES.includes(s as Status);
    const groupOf = (t: Task) =>
      view.group === "status"
        ? t.status
        : view.group === "priority"
          ? String(t.priority)
          : view.group === "assignee"
            ? (t.holder?.tool ?? "none")
            : view.group === "parent"
              ? (t.parent ?? "none")
              : "all";
    const find = (id: string) => tasks.find((t) => t.id === id)!;
    setDropHandlers({
      cardAccepts: (id, col) => {
        const t = find(id);
        return col === t.status || (movable(col) && movable(t.status));
      },
      card: (id, col, before) => {
        const t = find(id);
        const colTs = byOrder(tasks.filter((x) => x.status === col && x.id !== id));
        let next: number;
        if (before) {
          const i = colTs.findIndex((x) => x.id === before);
          const prev = colTs[i - 1];
          const nx = colTs[i]!;
          next = prev ? (order(prev) + order(nx)) / 2 : order(nx) - 1;
        } else next = colTs.length ? order(colTs[colTs.length - 1]!) + 1 : order(t);
        setLanded(id);
        onOrder(id, next);
        if (t.status !== col) onMove([id], col as Status);
      },
      rowAccepts: (id, group) => {
        const t = find(id);
        if (view.group === "status") return group === t.status || (group !== undefined && movable(group) && movable(t.status));
        return group === groupOf(t);
      },
      row: (id, target, pos, group) => {
        const tg = find(target);
        const rest = byOrder(tasks.filter((x) => x.id !== id));
        const i = rest.findIndex((x) => x.id === tg.id);
        const nb = pos === "before" ? rest[i - 1] : rest[i + 1];
        onOrder(id, nb ? (order(tg) + order(nb)) / 2 : order(tg) + (pos === "before" ? -1 : 1));
        if (view.group === "status" && group && group !== find(id).status) onMove([id], group as Status);
        if (view.sort.f !== "manual") {
          change({ ...view, sort: { f: "manual", dir: 1 } });
          toast("Sorted manually to keep your order", { kind: "info", ms: 2200 });
        }
      },
    });
  });

  const seg = (
    <div className="seg">
      {MODES.map(([k, n, icon]) => (
        <button
          key={k}
          type="button"
          className={view.mode === k ? "on" : ""}
          onClick={() => change({ ...view, mode: k })}
          aria-pressed={view.mode === k}
        >
          {ic(icon, 13)}
          <span className="hide-m">{n}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="page flush">
      <div className="ph">
        <div>
          <h1>Tasks</h1>
          <p>
            {sum.open} open tasks · {sum.done} of {sum.all} landed
          </p>
        </div>
        <div className="acts">
          <Button tone="primary" icon={ic(Plus, 14)} onClick={() => onNotBuilt("Creating a task")}>
            New task
          </Button>
        </div>
      </div>
      <div className="@container" style={{ padding: "0 var(--gutter) 16px" }}>
        <StatCards stats={stats(tasks, now)} now={now} />
      </div>
      <ViewToolbar view={view} onView={change} tasks={tasks} group={view.mode !== "board"} cols={view.mode === "table"} right={seg} />
      {view.mode === "board" ? (
        <TaskBoard
          tasks={byOrder(shown)}
          all={tasks}
          now={now}
          selected={selected}
          onOpen={onOpen}
          landed={landed}
          onLanded={() => setLanded(undefined)}
          onNotBuilt={onNotBuilt}
        />
      ) : view.mode === "table" ? (
        <TaskGrid
          tasks={shown}
          view={view}
          onView={change}
          deps={deps}
          now={now}
          selected={selected}
          onOpen={onOpen}
          onMove={onMove}
          onNotBuilt={onNotBuilt}
          onClear={() => change({ ...view, filters: [], q: "" })}
        />
      ) : (
        <div className="list-wrap">
          <TaskList
            groups={groupTasks(shown, view.group)}
            view={view}
            onView={change}
            tasks={tasks}
            selected={selected}
            onOpen={onOpen}
            onMove={onMove}
            onNotBuilt={onNotBuilt}
          />
        </div>
      )}
    </div>
  );
}
