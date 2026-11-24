import { Activity, Hourglass, Pause, Play, Plus, ShieldAlert, Timer, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { fixtureSlots, type Slots, type Waiting } from "../board/fixtures.ts";
import { TOOL_LABEL, type Task, type Tool } from "../board/task.ts";
import { timeAgo } from "../format/time.ts";
import { ic } from "../ui/ic.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { ProgBar } from "./parts.tsx";
import { SummaryCards } from "../tasks/StatCards.tsx";

type Props = {
  tasks: Task[];
  now: Date;
  onOpenTask: (id: string) => void;
  onNotBuilt: (what: string) => void;
};

const WHY: Record<Waiting["why"], { label: string; tone: string }> = {
  "no room": { label: "No room", tone: "amber" },
  "its turn": { label: "Its turn", tone: "gray" },
  "sensitive to load": { label: "Sensitive to load", tone: "violet" },
};

const DECISION: Record<Slots["decisions"][number]["kind"], { icon: LucideIcon; color: string }> = {
  start: { icon: Play, color: "var(--good)" },
  hold: { icon: Pause, color: "var(--warn)" },
  stop: { icon: ShieldAlert, color: "var(--bad)" },
  add: { icon: Plus, color: "var(--accent)" },
  mark: { icon: Activity, color: "var(--violet)" },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const minutes = (from: Date, now: Date) => Math.max(1, Math.round((now.getTime() - from.getTime()) / 60000));

/** The heavy runs of the machine: what runs in each seat, what waits and why, and why the queue decided as it did. */
export function SlotsPage({ tasks, now, onOpenTask, onNotBuilt }: Props) {
  const s = useMemo(() => fixtureSlots(now), [now]);
  const title = (id: string) => tasks.find((t) => t.id === id)?.title ?? id;
  const last = s.load.at(-1)!;
  const longest = s.queue.reduce((m, w) => Math.max(m, minutes(w.since, now)), 0);

  const taskRef = (id: string) => (
    <span className="row" style={{ gap: 8, minWidth: 0 }}>
      <span className="key mono" style={{ fontSize: "var(--text-xs)", color: "var(--ink-3)" }}>
        {id}
      </span>
      <span className="obj trunc" data-opens-task onClick={() => onOpenTask(id)} style={{ fontWeight: 500, cursor: "pointer" }}>
        {title(id)}
      </span>
    </span>
  );

  const by = (tool: Tool) => (
    <span className="row" style={{ gap: 6 }}>
      <ToolMark tool={tool} size={20} />
      {tool === "person" ? "The owner" : TOOL_LABEL[tool]}
    </span>
  );

  return (
    <div className="page">
      <div className="ph">
        <div>
          <h1>Slots</h1>
          <p>
            The heavy runs of this machine. A run starts when its cost fits in what is free, with a margin kept; the number of seats is what fits.
          </p>
        </div>
      </div>

      <div className="@container" style={{ paddingBottom: 16 }}>
        <SummaryCards
          cards={[
            {
              label: "Running",
              value: s.runs.length,
              unit: s.runs.length === 1 ? "run" : "runs",
              note: `between ${s.bounds.lowest} and ${s.bounds.highest}, by what fits`,
              tone: "neutral",
            },
            {
              label: "Waiting",
              value: s.queue.length,
              unit: "in the queue",
              lead: `${longest} min`,
              note: "the longest wait",
              tone: longest > 0 ? "warn" : "neutral",
            },
            {
              label: "Host load",
              value: pct(last.host),
              note: `of ${s.cores} processors · Docker's machine ${pct(last.vm)}`,
              tone: last.host > s.mark ? "bad" : "neutral",
            },
            { label: "Free now", value: s.free.cpu, unit: "processors", note: `${s.free.memory} of ${s.memory} GB of memory`, tone: "neutral" },
          ]}
        />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h2>Load, the last hour</h2>
          <div className="acts" style={{ gap: 14, fontSize: "var(--text-xs)", color: "var(--ink-3)" }}>
            <Legend color="var(--accent)">Host</Legend>
            <Legend color="var(--ink-3)" dashed>
              Docker's machine
            </Legend>
            <Legend color="var(--bad)" dashed>
              Mark {pct(s.mark)}
            </Legend>
          </div>
        </div>
        <div className="panel-b">
          <LoadChart s={s} />
        </div>
      </div>

      <div className="grid2">
        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-h">
              <h2>Running</h2>
              <span className="cnt faint">{s.runs.length}</span>
            </div>
            {s.runs.map((r) => (
              <div key={r.task} className="nrow" style={{ cursor: "default" }}>
                <span className="badge accent mono" style={{ minWidth: 26, justifyContent: "center" }} title="Seat">
                  {r.seat}
                </span>
                <div className="grow" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {taskRef(r.task)}
                  <code className="mono trunc" style={{ fontSize: "var(--text-xs)", color: "var(--ink-2)" }}>
                    {r.command}
                  </code>
                  <span className="row faint" style={{ gap: 12, fontSize: "var(--text-xs)", flexWrap: "wrap" }}>
                    {by(r.by)}
                    <span>{r.what === "check" ? "A check" : "A command"}</span>
                    <span className="row" style={{ gap: 4 }}>
                      {ic(Timer, 12)}
                      {minutes(r.since, now)} of {r.bound} min
                    </span>
                    <span className="mono">ports {r.ports.join(", ")}</span>
                  </span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 2 }}>
                    <Use label="Processors" used={r.cpu.used} given={r.cpu.given} />
                    <Use label="Memory" used={r.memory.used} given={r.memory.given} unit=" GB" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="panel-h">
              <h2>Waiting</h2>
              <span className="cnt faint">{s.queue.length}</span>
              <span className="acts faint" style={{ fontSize: "var(--text-xs)" }}>
                in the order they asked
              </span>
            </div>
            {s.queue.map((w, i) => (
              <div key={w.task} className="nrow" style={{ cursor: "default" }}>
                <span className="badge mono" style={{ minWidth: 26, justifyContent: "center" }} title="Place in the queue">
                  {i + 1}
                </span>
                <div className="grow" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  {taskRef(w.task)}
                  <code className="mono trunc" style={{ fontSize: "var(--text-xs)", color: "var(--ink-2)" }}>
                    {w.command}
                  </code>
                  <span className="row faint" style={{ gap: 12, fontSize: "var(--text-xs)", flexWrap: "wrap" }}>
                    {by(w.by)}
                    <span>
                      costs {w.cost.cpu} {w.cost.cpu === 1 ? "processor" : "processors"}, {w.cost.memory} GB
                    </span>
                    <span className="row" style={{ gap: 4 }}>
                      {ic(Hourglass, 12)}
                      waiting {minutes(w.since, now)} min
                    </span>
                  </span>
                  <span className="row" style={{ gap: 8, fontSize: "var(--text-xs)" }}>
                    <span className={`badge ${WHY[w.why].tone}`}>
                      <span className="dot" />
                      {WHY[w.why].label}
                    </span>
                    <span className="muted">{w.reason}</span>
                  </span>
                </div>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => onNotBuilt("Moving a run first")}>
                  Move first
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-h">
              <h2>The bounds</h2>
              <span className="acts faint" style={{ fontSize: "var(--text-xs)" }}>
                this machine's, not the repository's
              </span>
            </div>
            <div className="panel-b" style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: "var(--text-sm)" }}>
              <Bound name="Lowest number of runs" value={String(s.bounds.lowest)} />
              <Bound name="Highest number of runs" value={String(s.bounds.highest)} />
              <Bound name="Margin kept free" value={pct(s.bounds.margin)} />
              <Bound name="Mark of the host's load" value={pct(s.mark)} />
              <label className="row" style={{ justifyContent: "space-between", cursor: "pointer" }}>
                <span className="muted">Hold the number fixed</span>
                <input type="checkbox" className="toggle" checked={s.bounds.fixed} onChange={() => onNotBuilt("Holding the number fixed")} />
              </label>
            </div>
          </div>

          <div className="panel">
            <div className="panel-h">
              <h2>What the queue decided</h2>
            </div>
            <div className="feed lined" style={{ padding: "0 14px 6px" }}>
              {s.decisions.map((d) => {
                const k = DECISION[d.kind];
                return (
                  <div key={`${d.kind}-${d.at.getTime()}`} className="fitem">
                    <span className="row" style={{ color: k.color, width: 20, justifyContent: "center" }}>
                      {ic(k.icon, 14)}
                    </span>
                    <div className="grow" style={{ minWidth: 0 }}>
                      {d.task && (
                        <span className="obj" data-opens-task onClick={() => onOpenTask(d.task!)}>
                          {d.task}
                        </span>
                      )}{" "}
                      <span className="muted">{d.text}</span>
                    </div>
                    <time dateTime={d.at.toISOString()}>{timeAgo(d.at, now)}</time>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, dashed, children }: { color: string; dashed?: boolean; children: string | string[] }) {
  return (
    <span className="row" style={{ gap: 6 }}>
      <svg width="16" height="6" aria-hidden>
        <line x1="0" y1="3" x2="16" y2="3" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "3 2" : undefined} />
      </svg>
      {children}
    </span>
  );
}

function Use({ label, used, given, unit = "" }: { label: string; used: number; given: number; unit?: string }) {
  const share = used / given;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
      <span className="row" style={{ justifyContent: "space-between" }}>
        <span>{label}</span>
        <span className="num">
          {used} of {given}
          {unit}
        </span>
      </span>
      <span style={{ display: "flex" }}>
        <ProgBar value={Math.round(share * 100)} tone={share > 0.85 ? "amber" : ""} />
      </span>
    </div>
  );
}

function Bound({ name, value }: { name: string; value: string }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <span className="muted">{name}</span>
      <span className="num" style={{ fontWeight: 500 }}>
        {value}
      </span>
    </div>
  );
}

const W = 600;
const H = 150;

function LoadChart({ s }: { s: Slots }) {
  const n = s.load.length - 1;
  const x = (i: number) => (i / n) * W;
  const y = (v: number) => H - v * H;
  const line = (key: "host" | "vm") => s.load.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const area = `${line("host")} L${W},${H} L0,${H} Z`;
  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height: H, display: "block", overflow: "visible" }}
        aria-label="Load over the last hour"
      >
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1="0" x2={W} y1={y(g)} y2={y(g)} stroke="var(--divider)" vectorEffect="non-scaling-stroke" />
        ))}
        <g className="fx-reveal">
          <path d={area} fill="color-mix(in srgb, var(--accent) 10%, transparent)" />
          <path d={line("vm")} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
          <path d={line("host")} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </g>
        <line x1="0" x2={W} y1={y(s.mark)} y2={y(s.mark)} stroke="var(--bad)" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="row faint" style={{ justifyContent: "space-between", fontSize: "var(--text-2xs)", marginTop: 6 }}>
        <span>60 min ago</span>
        <span>30 min ago</span>
        <span>now</span>
      </div>
    </div>
  );
}
