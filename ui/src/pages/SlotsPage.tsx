import { Activity, Hourglass, Pause, Play, Plus, ShieldAlert, Timer, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { fixtureSlots, type Slots, type Waiting } from "../board/fixtures.ts";
import { TOOL_LABEL, type Task, type Tool } from "../board/task.ts";
import { Ago } from "../design/components/Ago.tsx";
import { Badge, type Tone } from "../design/components/Badge.tsx";
import { Button } from "../design/components/Button.tsx";
import { ic } from "../design/components/icon.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Panel, PanelBody } from "../design/components/Panel.tsx";
import { ProgressBar } from "../design/components/ProgressBar.tsx";
import { SummaryCards } from "../design/components/SummaryCards.tsx";
import { plural } from "../design/format/text.ts";
import { MINUTE } from "../design/format/time.ts";
import { ToolMark } from "../ui/ToolMark.tsx";

type Props = {
  tasks: Task[];
  now: Date;
  onOpenTask: (id: string) => void;
  onNotBuilt: (what: string) => void;
};

const WHY: Record<Waiting["why"], { label: string; tone: Tone }> = {
  "no room": { label: "No room", tone: "warn" },
  "its turn": { label: "Its turn", tone: "neutral" },
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
const minutes = (from: Date, now: Date) => Math.max(1, Math.round((now.getTime() - from.getTime()) / MINUTE));

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
    <Page>
      <PageHeader title="Slots">
        The heavy runs of this machine. A run starts when its cost fits in what is free, with a margin kept; the number of seats is what fits.
      </PageHeader>

      <div className="@container" style={{ paddingBottom: 16 }}>
        <SummaryCards
          cards={[
            {
              label: "Running",
              value: s.runs.length,
              unit: plural(s.runs.length, "run"),
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

      <Panel
        title="Load, the last hour"
        note={
          <span className="flex gap-3.5">
            <Legend color="var(--accent)">Host</Legend>
            <Legend color="var(--ink-3)" dashed>
              Docker's machine
            </Legend>
            <Legend color="var(--bad)" dashed>
              Mark {pct(s.mark)}
            </Legend>
          </span>
        }
        className="mb-4"
      >
        <PanelBody>
          <LoadChart s={s} />
        </PanelBody>
      </Panel>

      <div className="grid2">
        <div className="stack" style={{ gap: 16 }}>
          <Panel title="Running" count={s.runs.length}>
            {s.runs.map((r) => (
              <div key={r.task} className="nrow" style={{ cursor: "default" }}>
                <Badge tone="accent" className="mono min-w-6.5 justify-center" title="Seat">
                  {r.seat}
                </Badge>
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
          </Panel>

          <Panel title="Waiting" count={s.queue.length} note="in the order they asked">
            {s.queue.map((w, i) => (
              <div key={w.task} className="nrow" style={{ cursor: "default" }}>
                <Badge className="mono min-w-6.5 justify-center" title="Place in the queue">
                  {i + 1}
                </Badge>
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
                    <Badge tone={WHY[w.why].tone} dot>
                      {WHY[w.why].label}
                    </Badge>
                    <span className="muted">{w.reason}</span>
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => onNotBuilt("Moving a run first")}>
                  Move first
                </Button>
              </div>
            ))}
          </Panel>
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Panel title="The bounds" note="this machine's, not the repository's">
            <PanelBody className="flex flex-col gap-2.5 text-sm">
              <Bound name="Lowest number of runs" value={String(s.bounds.lowest)} />
              <Bound name="Highest number of runs" value={String(s.bounds.highest)} />
              <Bound name="Margin kept free" value={pct(s.bounds.margin)} />
              <Bound name="Mark of the host's load" value={pct(s.mark)} />
              <label className="row" style={{ justifyContent: "space-between", cursor: "pointer" }}>
                <span className="muted">Hold the number fixed</span>
                <input type="checkbox" className="toggle" checked={s.bounds.fixed} onChange={() => onNotBuilt("Holding the number fixed")} />
              </label>
            </PanelBody>
          </Panel>

          <Panel title="What the queue decided">
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
                    <Ago at={d.at} now={now} />
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </Page>
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
        <ProgressBar value={Math.round(share * 100)} tone={share > 0.85 ? "warn" : undefined} />
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
