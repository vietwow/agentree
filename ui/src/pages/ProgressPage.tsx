import { ChartGantt, Crosshair, Diamond } from "lucide-react";
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import { board, detail, parentTitles } from "../board/daemon.ts";
import { partsOf } from "../board/summary.ts";
import { KIND_LABEL, KINDS, STATUS_LABEL, type Task } from "../board/task.ts";
import { Button } from "../design/components/Button.tsx";
import { Empty } from "../design/components/Empty.tsx";
import { ic } from "../design/components/icon.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Segmented } from "../design/components/Segmented.tsx";
import { Select } from "../design/components/Select.tsx";
import { SummaryCards } from "../design/components/SummaryCards.tsx";
import { plural } from "../design/format/text.ts";
import { DAY, HOUR, monthName, shortDate } from "../design/format/time.ts";
import { NEW_VIEW, applyView, type View } from "../tasks/view.ts";
import { ViewToolbar } from "../tasks/ViewToolbar.tsx";
import { STATUS_COLOR } from "../ui/colors.ts";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { style } from "./parts.tsx";

type Zoom = "hour" | "week" | "month";
type Group = "status" | "assignee" | "parent" | "none";

const MONL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const RH = 36;

const ZOOMS: [Zoom, string][] = [
  ["hour", "Hours"],
  ["week", "Weeks"],
  ["month", "Months"],
];

const GROUPS: [Group, string][] = [
  ["status", "Group: Status"],
  ["assignee", "Group: Assignee"],
  ["parent", "Group: Parent"],
  ["none", "No grouping"],
];

/** Midnight of the Monday on or before a date, gr8r's start of week. */
function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

type Row = { type: "ms" } | { type: "g"; name: string; count: number; html?: React.ReactNode } | { type: "t"; t: Task };

type Props = { tasks: Task[]; now: Date; onOpenTask: (id: string) => void; selected?: string };

export function ProgressPage({ tasks, now, onOpenTask, selected }: Props) {
  const [zoom, setZoom] = useState<Zoom>("week");
  const [group, setGroup] = useState<Group>("parent");
  const [view, setView] = useState<View>(NEW_VIEW);
  const right = useRef<HTMLDivElement>(null);
  const left = useRef<HTMLDivElement>(null);

  const counted = tasks.filter((t) => t.status !== "dropped");
  const done = counted.filter((t) => t.status === "done").length;
  const share = counted.length ? Math.round((done / counted.length) * 100) : 0;
  const leaves = useMemo(() => tasks.filter((t) => !(t.id in parentTitles())), [tasks]);

  const deps = useMemo(() => new Map(tasks.map((t) => [t.id, detail(t).dependsOn.map((d) => d.id)])), [tasks]);
  /* As gr8r-studio's bar runs from a task's start to its due date, a bar here runs from its claim to its landing. */
  const shown = useMemo(() => applyView(leaves, view, () => 0, now).filter((t) => t.holder), [leaves, view, now]);
  const ms = board().milestones;
  const start = (t: Task) => t.holder?.since ?? t.createdAt;

  const end = (t: Task) => t.landedAt ?? (t.status === "dropped" ? t.statusSince : now);

  /* Hours run on the clock, from the first task to half a day ahead; Weeks and Months run on gr8r's days. */
  const unit = zoom === "hour" ? HOUR : DAY;
  const dw = zoom === "month" ? 11 : 32;
  const first = Math.min(...leaves.map((t) => start(t).getTime()), ...ms.map((m) => m.at.getTime()));
  const rs =
    zoom === "hour"
      ? Math.floor((first - 6 * HOUR) / HOUR) * HOUR
      : startOfWeek(new Date(now.getTime() - (zoom === "week" ? 21 : 56) * DAY)).getTime();
  const n = zoom === "hour" ? Math.ceil((now.getTime() + 12 * HOUR - rs) / HOUR) : 7 * (zoom === "week" ? 13 : 34);
  const W = n * dw;
  const slot = (at: Date) => Math.floor((at.getTime() - rs) / unit);
  const X = (at: Date) => (zoom === "hour" ? ((at.getTime() - rs) / HOUR) * dw : slot(at) * dw);
  const span = (t: Task) => {
    const x = X(start(t));
    if (zoom === "hour") return { x, w: Math.max(dw / 2, X(end(t)) - x) };
    return { x, w: Math.max(dw, (slot(end(t)) - slot(start(t)) + 1) * dw) };
  };
  const todayX = zoom === "hour" ? X(now) : slot(now) * dw;
  const lineX = zoom === "hour" ? todayX : todayX + dw / 2;

  const rows: Row[] = ms.length ? [{ type: "ms" }] : [];
  const keyOf = (t: Task): [string, string, React.ReactNode?] =>
    group === "parent"
      ? t.parent
        ? [t.parent, parentTitles()[t.parent] ?? t.parent]
        : ["none", "No parent"]
      : group === "status"
        ? [t.status, STATUS_LABEL[t.status], <StatusIcon key="s" status={t.status} />]
        : group === "assignee"
          ? t.holder
            ? [t.holder.tool, t.holder.tool, <ToolMark key="w" tool={t.holder.tool} size={20} />]
            : ["none", "Not held", <ToolMark key="w" size={20} />]
          : ["all", ""];
  const buckets = new Map<string, { name: string; html?: React.ReactNode; tasks: Task[] }>();
  for (const t of shown) {
    const [k, name, html] = keyOf(t);
    const b = buckets.get(k) ?? { name, html, tasks: [] };
    b.tasks.push(t);
    buckets.set(k, b);
  }
  for (const b of buckets.values()) {
    if (group !== "none") rows.push({ type: "g", name: b.name, count: b.tasks.length, html: b.html });
    b.tasks.sort((a, c) => start(a).getTime() - start(c).getTime()).forEach((t) => rows.push({ type: "t", t }));
  }
  const H = rows.length * RH;
  const rowY = new Map<string, number>();
  rows.forEach((r, i) => r.type === "t" && rowY.set(r.t.id, i * RH + RH / 2));

  const at = (i: number) => new Date(rs + i * unit);
  const top: { label: string; n: number }[] = [];
  for (let i = 0; i < n; i++) {
    const d = at(i);
    const label = zoom === "hour" ? `${monthName(d)} ${d.getDate()}` : `${MONL[d.getMonth()]} ${d.getFullYear()}`;
    if (top.at(-1)?.label === label) top.at(-1)!.n++;
    else top.push({ label, n: 1 });
  }
  const isNow = (d: Date) =>
    zoom === "hour" ? Math.floor(now.getTime() / HOUR) === Math.floor(d.getTime() / HOUR) : now.toDateString() === d.toDateString();

  useLayoutEffect(() => {
    const r = right.current;
    if (!r) return;
    r.scrollLeft = Math.max(0, todayX - r.clientWidth + 160);
    // Scrolls to today only when the zoom changes, not when time moves on.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const toToday = () => {
    const r = right.current;
    if (r) r.scrollTo({ left: Math.max(0, todayX - r.clientWidth + 160), behavior: "smooth" });
  };

  const progressOf = (t: Task) => {
    const p = partsOf(t, tasks);
    return p.total ? (p.done / p.total) * 100 : t.status === "done" ? 100 : 0;
  };

  /* gr8r-studio's milestone lane: one diamond a slot, same-slot milestones merged, each label cut at the next diamond. */
  const lane = (y: number) => {
    const bySlot = new Map<number, typeof ms>();
    for (const m of ms) {
      const k = zoom === "hour" ? Math.floor(m.at.getTime() / HOUR) : slot(m.at);
      bySlot.set(k, [...(bySlot.get(k) ?? []), m]);
    }
    const pts = [...bySlot.values()].map((list) => ({
      list,
      x: (zoom === "hour" ? X(list[0]!.at) : slot(list[0]!.at) * dw) + (zoom === "hour" ? 0 : dw / 2),
    }));
    pts.sort((a, b) => a.x - b.x);
    return pts.map((pt, i) => {
      const room = (pts[i + 1] ? pts[i + 1]!.x : Infinity) - pt.x - 24;
      const name = pt.list[0]!.name + (pt.list.length > 1 ? ` +${pt.list.length - 1}` : "");
      const tip = `${pt.list.map((m) => m.name).join(" · ")} · ${shortDate(pt.list[0]!.at, now)}`;
      return (
        <div key={i} className="ms-w" style={{ left: pt.x - 6, top: y + 9 }} data-tip={tip} tabIndex={0} aria-label={`Milestone: ${tip}`}>
          <span className="ms" />
          {room >= 28 && (
            <span className="ms-l" style={{ maxWidth: Number.isFinite(room) ? Math.round(room) : "none" }}>
              {name}
            </span>
          )}
        </div>
      );
    });
  };

  const kinds = KINDS.filter((k) => counted.some((t) => t.kind === k));

  const controls = (
    <>
      <Segmented label="Zoom" className="ml-1" value={zoom} onChange={setZoom} options={ZOOMS.map(([value, label]) => ({ value, label }))} />
      <Select value={group} options={GROUPS} onChange={setGroup} label="Group by" size="sm" className="ml-1" />
      <Button variant="ghost" onClick={toToday}>
        {ic(Crosshair, 14)}Today
      </Button>
    </>
  );

  return (
    <Page layout="flush">
      <PageHeader title="Progress">
        How far along the project is, read from the board: each task from its claim to its landing, and the milestones.
      </PageHeader>
      <div className="@container pt-0 px-(--gutter) pb-4">
        <SummaryCards
          cards={[
            {
              label: "Done over the whole",
              value: `${done}/${counted.length}`,
              unit: plural(counted.length, "task"),
              lead: `${share}%`,
              note: "landed on main",
              tone: "good",
            },
            {
              label: "Accepted",
              value: tasks.filter((t) => t.status === "accepted").length,
              unit: plural(tasks.filter((t) => t.status === "accepted").length, "task"),
              note: "beside done, not in it",
              tone: "neutral",
            },
            {
              label: "In review",
              value: tasks.filter((t) => t.status === "review").length,
              unit: plural(tasks.filter((t) => t.status === "review").length, "task"),
              note: "beside done, not in it",
              tone: "neutral",
            },
            {
              label: "Done by kind",
              value: kinds.length,
              unit: plural(kinds.length, "kind"),
              note: kinds
                .map((k) => {
                  const of = counted.filter((t) => t.kind === k);
                  return `${KIND_LABEL[k]} ${of.filter((t) => t.status === "done").length}/${of.length}`;
                })
                .join(" · "),
              tone: "neutral",
            },
          ]}
        />
      </div>
      <ViewToolbar view={view} onView={setView} tasks={leaves} group={false} extra={controls} />
      {rows.length ? (
        <div className="tl">
          <div className="tl-left">
            <div className="tl-head">Task</div>
            <div className="tl-rows" ref={left}>
              {rows.map((r, i) =>
                r.type === "ms" ? (
                  <div key="ms" className="tl-row g">
                    {ic(Diamond, 12)}Milestones
                    <span className="faint font-medium">{ms.length}</span>
                  </div>
                ) : r.type === "g" ? (
                  <div key={`g${i}`} className="tl-row g">
                    {r.html}
                    {r.name}
                    <span className="faint font-medium">{r.count}</span>
                  </div>
                ) : (
                  <div
                    key={r.t.id}
                    className={`tl-row ${selected === r.t.id ? "bg-surface-2" : ""}`}
                    data-opens-task
                    onClick={() => onOpenTask(r.t.id)}
                  >
                    <StatusIcon status={r.t.status} size={12} />
                    <span className={`trunc flex-1 min-w-0 ${r.t.status === "done" ? "text-ink-3" : ""}`}>{r.t.title}</span>
                    {r.t.subtasks.length > 0 && (
                      <span className="faint num text-2xs">
                        {r.t.subtasks.filter((s) => s.done).length}/{r.t.subtasks.length}
                      </span>
                    )}
                    <ToolMark tool={r.t.holder?.tool} size={20} />
                  </div>
                ),
              )}
              <div className="h-10" />
            </div>
          </div>
          <div
            className="tl-right"
            ref={right}
            onScroll={(e) => {
              if (left.current) left.current.scrollTop = e.currentTarget.scrollTop;
            }}
          >
            <div className="tl-head" style={{ width: W }}>
              <div className="tl-months">
                {top.map((m, i) => (
                  <div key={i} style={{ width: m.n * dw }}>
                    <span>{m.label}</span>
                  </div>
                ))}
              </div>
              <div className="tl-days">
                {zoom === "month"
                  ? Array.from({ length: n / 7 }, (_, i) => {
                      const d = at(i * 7);
                      return (
                        <div key={i} style={{ width: dw * 7 }}>
                          {monthName(d)} {d.getDate()}
                        </div>
                      );
                    })
                  : Array.from({ length: n }, (_, i) => {
                      const d = at(i);
                      return (
                        <div key={i} style={{ width: dw }} className={isNow(d) ? "today" : ""}>
                          {zoom === "hour" ? d.getHours() : d.getDate()}
                        </div>
                      );
                    })}
              </div>
            </div>
            <div className="tl-grid" style={{ width: W, height: H + 40 }}>
              {zoom === "week" &&
                Array.from({ length: n }, (_, i) => {
                  const day = at(i).getDay();
                  return day === 0 || day === 6 ? <div key={i} className="tl-we" style={{ left: i * dw, width: dw }} /> : null;
                })}
              {zoom === "hour" &&
                Array.from({ length: n }, (_, i) => {
                  const h = at(i).getHours();
                  return h < 8 || h >= 20 ? <div key={i} className="tl-we" style={{ left: i * dw, width: dw }} /> : null;
                })}
              {zoom === "hour"
                ? Array.from({ length: n }, (_, i) =>
                    at(i).getHours() === 0 ? <div key={`gl${i}`} className="tl-gl" style={{ left: i * dw }} /> : null,
                  )
                : Array.from({ length: n / 7 }, (_, i) => <div key={`gl${i}`} className="tl-gl" style={{ left: i * 7 * dw }} />)}
              <div className="tl-today" style={{ left: lineX }} title="Today" />
              {rows.map((r, i) => {
                const y = i * RH;
                if (r.type === "ms")
                  return (
                    <Fragment key="ms">
                      <div className="tl-rowbg" style={{ top: y }} />
                      {lane(y)}
                    </Fragment>
                  );
                if (r.type === "g") return <div key={`b${i}`} className="tl-rowbg g" style={{ top: y }} />;
                const t = r.t;
                const { x, w } = span(t);
                const c = group === "status" || group === "none" ? "var(--accent)" : STATUS_COLOR[t.status];
                const inside = w > 110;
                return (
                  <Fragment key={t.id}>
                    <div className="tl-rowbg" style={{ top: y }} />
                    <div
                      className={`bar cursor-pointer ${t.status === "done" ? "done" : ""}`}
                      style={{ ...style({ "--c": c }), left: x, top: y + 7, width: w }}
                      data-opens-task
                      onClick={() => onOpenTask(t.id)}
                      title={`${t.title} · ${start(t).toLocaleString()} → ${t.landedAt ? t.landedAt.toLocaleString() : STATUS_LABEL[t.status]}`}
                    >
                      <span className="pf" style={{ width: `${progressOf(t)}%` }} />
                      {inside && (
                        <>
                          <ToolMark tool={t.holder?.tool} size={20} />
                          <span className="trunc">{t.title}</span>
                        </>
                      )}
                    </div>
                    {!inside && (
                      <div className="bar-lbl" style={{ left: x + w + 8, top: y + 10 }}>
                        {t.title}
                      </div>
                    )}
                  </Fragment>
                );
              })}
              <svg className="tl-deps" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
                {shown.flatMap((t) =>
                  (deps.get(t.id) ?? [])
                    .filter((d) => rowY.has(d) && rowY.has(t.id))
                    .map((d) => {
                      const a = tasks.find((x) => x.id === d)!;
                      const sa = span(a);
                      const x1 = sa.x + sa.w;
                      const y1 = rowY.get(d)!;
                      const x2 = span(t).x;
                      const y2 = rowY.get(t.id)!;
                      const dy = y2 - y1;
                      const bend = Math.max(18, Math.min(56, Math.abs(dy) / 3));
                      const lead = x2 - 6;
                      // A bar too short for its title has the title beside it: the line leaves from its bottom or top edge, never across the title.
                      const beside = sa.w <= 110;
                      const sx = beside ? x1 - Math.min(10, sa.w / 2) : x1;
                      const sy = beside ? (dy < 0 ? y1 - 11 : y1 + 13) : y1;
                      const reach = Math.max(bend, (lead - sx) / 2);
                      const first = beside ? `${sx} ${sy + (dy < 0 ? -bend : bend)}` : `${sx + reach} ${sy}`;
                      const path = `M${sx} ${sy} C ${first}, ${lead - reach} ${y2}, ${lead} ${y2} L ${x2 - 1} ${y2}`;
                      return (
                        <Fragment key={`${d}-${t.id}`}>
                          <path d={path} fill="none" stroke="var(--ink-3)" strokeWidth="1.3" strokeDasharray={x2 < x1 ? "3 3" : undefined} />
                          <path
                            d={`M${x2 - 6} ${y2 - 3.5} L${x2 - 1} ${y2} L${x2 - 6} ${y2 + 3.5}`}
                            fill="none"
                            stroke="var(--ink-3)"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </Fragment>
                      );
                    }),
                )}
              </svg>
            </div>
          </div>
        </div>
      ) : (
        <Empty icon={ChartGantt} title="Nothing on the timeline" text="No task matches the filters." />
      )}
    </Page>
  );
}
