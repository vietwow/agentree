import { Bot, CircleCheck, CircleGauge, Clock, GitMerge, GitPullRequest, ListTodo, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ActivityEntry } from "../board/activity.ts";
import { fixtureAgents } from "../board/fixtures.ts";
import { fileAreas, forecast, markCounts, numbers, toolsLive, type FileArea, type FileCell, type FileMark, type Forecast } from "../board/home.ts";
import { STATUS_LABEL, TOOL_LABEL, type Task } from "../board/task.ts";
import { ic } from "../ui/ic.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { style } from "./parts.tsx";
import { duration } from "../design/format/time.ts";

type Props = {
  tasks: readonly Task[];
  activity: readonly ActivityEntry[];
  now: Date;
  onOpenTask: (id: string) => void;
  onAgents: () => void;
};

const MARKS: { mark: FileMark; name: string }[] = [
  { mark: "main", name: "On main" },
  { mark: "landed", name: "Landed" },
  { mark: "held", name: "Held" },
  { mark: "checking", name: "In checks" },
  { mark: "wanted", name: "Ready" },
];

/** A hover card above a point of the page, as GitHub's over a day of its contributions. */
type Tip = { x: number; y: number; body: ReactNode };

function TipCard({ tip }: { tip?: Tip }) {
  const ref = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState<number>();
  useLayoutEffect(() => {
    const w = ref.current?.offsetWidth ?? 0;
    if (tip) setLeft(Math.min(Math.max(tip.x, w / 2 + 8), innerWidth - w / 2 - 8));
  }, [tip]);
  if (!tip) return null;
  return createPortal(
    <div
      ref={ref}
      className="h-tip"
      role="tooltip"
      style={{ left: left ?? tip.x, top: tip.y, ...style({ "--tip-dx": `${tip.x - (left ?? tip.x)}px` }) }}
    >
      {tip.body}
    </div>,
    document.body,
  );
}

const above = (el: Element, body: ReactNode): Tip => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top, body };
};

function cellTip(area: FileArea, cell: FileCell): ReactNode {
  const t = cell.task;
  const what: Record<FileMark, string> = {
    main: "On main, free to claim",
    landed: `Landed with ${t?.id}`,
    held: `Held by ${t?.id}${t?.holder ? ` · ${TOOL_LABEL[t.holder.tool]}` : ""}`,
    checking: `${t?.id} ${t ? STATUS_LABEL[t.status].toLowerCase() : ""}`,
    wanted: `Wanted by ${t?.id}, ready`,
  };
  return (
    <>
      <b className="mono">{cell.path ?? `${area.path}/`}</b>
      <span>{what[cell.mark]}</span>
      {t && <span className="faint">{t.title}</span>}
    </>
  );
}

function clock(at: Date, short = false) {
  const h = at.getHours() % 12 || 12;
  const pm = at.getHours() >= 12;
  if (short) return `${h}${pm ? "p" : "a"}`;
  const m = at.getMinutes();
  return `${h}${m ? `:${String(m).padStart(2, "0")}` : ""} ${pm ? "PM" : "AM"}`;
}

function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`h-panel ${className}`}>{children}</section>;
}

function Spark({ values, tone }: { values: number[]; tone: "violet" | "red" | "green" }) {
  const top = Math.max(...values, 1);
  return (
    <span className="h-spark" aria-hidden>
      {values.map((v, i) => (
        <i
          key={i}
          className={i === values.length - 1 ? tone : ""}
          style={style({ "--h": `${Math.max(12, (v / top) * 100)}%`, "--d": `${i * 25}ms` })}
        />
      ))}
    </span>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  spark,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  spark: number[];
  tone: "violet" | "red" | "green";
}) {
  return (
    <div className="h-kpi">
      <div className="h-kpi-l">
        {ic(icon, 14)}
        {label}
      </div>
      <div className="h-kpi-b">
        <div>
          <div className="h-kpi-v" data-count>
            {value}
          </div>
          <div className="h-kpi-s">{sub}</div>
        </div>
        <Spark values={spark} tone={tone} />
      </div>
    </div>
  );
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const CH = 250;
const PAD = { l: 34, r: 18, t: 34, b: 34 };
const TOP = 30;

function Chart({ f, onTip }: { f: Forecast; onTip: (tip?: Tip) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [on, setOn] = useState<number>();
  const n = f.hours.length;
  const span = Math.max(0, w - PAD.l - PAD.r - 48);
  const x = (i: number) => PAD.l + 24 + (i * span) / (n - 1);
  const y = (v: number) => PAD.t + (1 - v / TOP) * (CH - PAD.t - PAD.b);
  const gaps = f.withAgents.map((v, i) => f.without[i]! - v);
  const most = gaps.reduce((best, g, i) => (g > gaps[best]! ? i : best), 0);
  const line = f.withAgents.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const base = y(0);
  const goal = y(f.goal);

  return (
    <div ref={ref} className="h-chart">
      {w > 0 && (
        <>
          <svg width={w} height={CH} role="img" aria-label="Open tasks over the next hours, with and without the agents">
            <defs>
              <linearGradient id="h-bar" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--h-bar-a)" />
                <stop offset="1" stopColor="var(--h-bar-b)" />
              </linearGradient>
            </defs>
            {[0, 10, 20, 30].map((v) => (
              <text key={v} x={PAD.l - 14} y={y(v) + 4} textAnchor="end" className="h-axis">
                {v}
              </text>
            ))}
            <rect className="h-band" x={PAD.l} y={goal} width={w - PAD.l - PAD.r} height={base - goal} />
            <line className="h-goal" x1={PAD.l} x2={w - PAD.r} y1={goal} y2={goal} />
            <text className="h-band-t" x={PAD.l + 10} y={goal + 19}>
              Goal zone, under {f.goal} open
            </text>
            {f.hours.map((_, i) =>
              i === 0 ? null : (
                <rect
                  key={i}
                  className={`h-bar ${on === i ? "on" : ""}`}
                  style={style({ "--d": `${120 + i * 45}ms` })}
                  x={x(i) - 6}
                  y={y(f.without[i]!)}
                  width={12}
                  height={Math.max(12, y(f.withAgents[i]!) - y(f.without[i]!))}
                  rx={6}
                  fill="url(#h-bar)"
                />
              ),
            )}
            <path className="h-line" d={line} pathLength={1} />
            {f.hours.map((_, i) =>
              i === 0 ? null : (
                <circle key={i} className="h-hollow" style={style({ "--d": `${300 + i * 45}ms` })} cx={x(i)} cy={y(f.without[i]!)} r={4.5} />
              ),
            )}
            {f.withAgents.map((v, i) => (
              <circle key={i} className={i ? "h-dot" : "h-now"} style={style({ "--d": `${400 + i * 45}ms` })} cx={x(i)} cy={y(v)} r={i ? 5.5 : 5} />
            ))}
            {on !== undefined && <line className="h-guide" x1={x(on)} x2={x(on)} y1={PAD.t - 6} y2={base} />}
            {f.hours.map((h, i) => {
              const step = n > 1 ? span / (n - 1) : span;
              const lands = f.lands[i] ?? [];
              const body = (
                <>
                  <b>{i ? clock(h) : `Now, ${clock(h)}`}</b>
                  <span>{f.withAgents[i]} open with the agents</span>
                  <span className="faint">{f.without[i]} without them</span>
                  {i > 0 && (
                    <span>
                      {lands.length
                        ? `Lands in this hour: ${lands
                            .slice(0, 3)
                            .map((t) => t.id)
                            .join(", ")}${lands.length > 3 ? ` and ${lands.length - 3} more` : ""}`
                        : "Nothing lands in this hour"}
                    </span>
                  )}
                </>
              );
              return (
                <rect
                  key={`hit${i}`}
                  className="h-hit"
                  x={x(i) - step / 2}
                  y={PAD.t - 10}
                  width={step}
                  height={base - PAD.t + 10}
                  onMouseEnter={(e) => {
                    setOn(i);
                    const r = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
                    onTip({ x: r.left + x(i), y: r.top + y(Math.max(f.withAgents[i]!, f.without[i]!)) - 8, body });
                  }}
                  onMouseLeave={() => {
                    setOn(undefined);
                    onTip(undefined);
                  }}
                />
              );
            })}
            {f.hours.map((h, i) => (
              <text key={i} x={x(i)} y={CH - 8} textAnchor="middle" className={`h-axis ${i ? "" : "first"}`}>
                {clock(h, true)}
              </text>
            ))}
          </svg>
          <span className="h-pill" style={{ left: x(0), top: y(f.withAgents[0]!) - 32 }}>
            Now {f.withAgents[0]}
          </span>
          {gaps[most]! > 0 && (
            <span className="h-pill v" style={{ left: x(most), top: y(f.without[most]!) - 30 }}>
              {gaps[most]} fewer open
            </span>
          )}
          {f.marks.length > 0 && (
            <div className="h-marks" style={{ paddingLeft: Math.max(0, x(f.marks[0]!.at) - 30) }}>
              {f.marks.map((m) => (
                <span key={m.at} className="h-pill v flat">
                  {ic(m.what === "claims" ? ListTodo : GitMerge, 13)}
                  {m.n} {m.what === "reviewed" ? "reviewed tasks land" : m.what === "claims" ? "claims finish" : "tasks land"}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function HomePage({ tasks, activity, now, onOpenTask, onAgents }: Props) {
  const [span, setSpan] = useState<12 | 24>(12);
  const [tip, setTip] = useState<Tip>();
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(undefined);
    addEventListener("scroll", hide, { capture: true, once: true });
    return () => removeEventListener("scroll", hide, { capture: true });
  }, [tip]);
  const areas = useMemo(() => fileAreas(tasks, now), [tasks, now]);
  const counts = markCounts(areas);
  const f = useMemo(() => forecast(tasks, now, span), [tasks, now, span]);
  const k = useMemo(() => numbers(tasks, activity, now), [tasks, activity, now]);
  const { sessions } = useMemo(() => fixtureAgents(now), [now]);
  const tools = useMemo(() => toolsLive(sessions, tasks), [sessions, tasks]);
  const live = sessions.filter((s) => !s.ended).length;

  const end = f.withAgents.length - 1;
  const under = f.withAgents.findIndex((v) => v < f.goal);
  const byAgents = f.without[end]! - f.withAgents[end]!;

  const [chartKey, setChartKey] = useState(0);
  useEffect(() => setChartKey((n) => n + 1), [span]);

  return (
    <div className="page wide home">
      <div className="h-grid">
        <div className="h-col">
          <header className="h-head">
            <div>
              <h1>Command center</h1>
              <p>
                {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {clock(now)} · Live from the daemon, updated
                1 min ago
              </p>
            </div>
            <span className="h-badge green">
              <i />
              Daemon live
            </span>
          </header>
          <Panel className="h-kpis">
            <Kpi
              icon={CircleCheck}
              label="Done"
              value={`${k.done.pct}%`}
              sub={`${k.done.landed} of ${k.done.all} landed`}
              spark={k.done.spark}
              tone="violet"
            />
            <Kpi
              icon={GitPullRequest}
              label="In review"
              value={String(k.review.n)}
              sub={k.review.oldest ? `Oldest ${duration(now.getTime() - k.review.oldest.getTime(), { short: true })}` : "None waits"}
              spark={k.review.spark}
              tone="red"
            />
            <Kpi
              icon={GitMerge}
              label="Landed this week"
              value={String(k.landed.week)}
              sub={`of ${k.landed.all} on main`}
              spark={k.landed.spark}
              tone="green"
            />
            <Kpi
              icon={ListTodo}
              label="Ready"
              value={String(k.ready.n)}
              sub={`${k.ready.waiting} wait on others`}
              spark={k.ready.spark}
              tone="green"
            />
            <Kpi
              icon={Bot}
              label="Agent actions"
              value={String(k.actions.day)}
              sub={`${k.actions.needYou} need you`}
              spark={k.actions.spark}
              tone="violet"
            />
          </Panel>

          <Panel>
            <div className="h-ph">
              <div>
                <h2>Live file board</h2>
                <p>Every file of the repository, by area. Violet files are held by a task's claim.</p>
              </div>
              <ul className="h-legend">
                {MARKS.map((m) => (
                  <li key={m.mark}>
                    <i className={`h-sq ${m.mark}`} />
                    {m.name}
                    <b>{counts[m.mark]}</b>
                  </li>
                ))}
              </ul>
            </div>
            <div className="h-areas">
              {areas.map((a, i) => (
                <div key={a.path} className="h-area fx-stagger" style={style({ "--d": `${i * 40}ms` })}>
                  <div className="h-area-h">
                    <span>{a.name}</span>
                    <b className={a.free < 90 ? "red" : a.free < 95 ? "amber" : ""}>{a.free}%</b>
                  </div>
                  <div className="h-sqs" onMouseLeave={() => setTip(undefined)}>
                    {a.cells.map((c, j) => (
                      <i
                        key={j}
                        className={`h-sq ${c.mark} ${c.task ? "link" : ""}`}
                        onMouseEnter={(e) => setTip(above(e.currentTarget, cellTip(a, c)))}
                        onClick={
                          c.task &&
                          (() => {
                            setTip(undefined);
                            onOpenTask(c.task!.id);
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <div className="h-ph">
              <div>
                <h2>Open tasks, next {span} hours</h2>
                <p>Each bar is the gap the {f.held} tasks the agents hold close</p>
              </div>
              <div className="h-chart-tools">
                <ul className="h-legend">
                  <li>
                    <i className="h-key dot" />
                    With the agents
                  </li>
                  <li>
                    <i className="h-key ring" />
                    Without them
                  </li>
                  <li>
                    <i className="h-key cap" />
                    Tasks closed
                  </li>
                  <li>
                    <i className="h-key zone" />
                    Goal zone
                  </li>
                </ul>
                <div className="h-seg" role="group" aria-label="Span">
                  {([12, 24] as const).map((s) => (
                    <button key={s} type="button" className={span === s ? "on" : ""} aria-pressed={span === s} onClick={() => setSpan(s)}>
                      {s}h
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="h-chart-b">
              <Chart key={chartKey} f={f} onTip={setTip} />
              <div className="h-stats">
                <div>
                  <div className="h-stat-l">
                    {ic(Clock, 14)}
                    Landed by agents
                  </div>
                  <div className="h-stat-v violet">
                    <b data-count>{byAgents}</b>
                    <span>next {span} hours</span>
                  </div>
                </div>
                <div>
                  <div className="h-stat-l">
                    {ic(CircleGauge, 14)}
                    Open at {clock(f.hours[end]!)}
                  </div>
                  <div className="h-stat-v">
                    <b data-count>{f.withAgents[end]}</b>
                    <span>vs {f.without[end]} without them</span>
                  </div>
                </div>
                <div>
                  <div className="h-stat-l">
                    {ic(CircleCheck, 14)}
                    Under goal from
                  </div>
                  <div className="h-stat-v green">
                    <b>{under < 0 ? "Never" : clock(f.hours[under]!)}</b>
                    <span>never without them</span>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="h-col">
          <Panel>
            <div className="h-ph">
              <h2>Agents live</h2>
              <span className="h-badge green">{live} active</span>
            </div>
            <div className="h-agents">
              {tools.map((t) => (
                <button key={t.tool} type="button" className="h-agent" onClick={onAgents}>
                  <ToolMark tool={t.tool} size={20} />
                  <b>{TOOL_LABEL[t.tool]}</b>
                  <span>{t.what}</span>
                  <em>{t.sessions}</em>
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
      <TipCard tip={tip} />
    </div>
  );
}
