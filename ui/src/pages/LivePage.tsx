import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ActivityEntry } from "../board/activity.ts";
import { fixtureAgents } from "../board/fixtures.ts";
import { liveBoard, saidBy, type Region, type Seat } from "../board/live.ts";
import type { Task } from "../board/task.ts";
import { timeAgo } from "../format/time.ts";
import { reducedMotion } from "../design/motion.ts";

const CW = 200;
const PITCH = 67;
const LABEL = 44;
/** Where a region sits around the project, the side columns first: they hold the longest stacks. */
const SLOTS = ["ul", "ur", "ll", "lr", "top", "bottom"] as const;
type Slot = (typeof SLOTS)[number];
const BELOW: ReadonlySet<Slot> = new Set(["ll", "lr", "bottom"]);
const OLD = [0.6, 0.4, 0.25, 0.15];

type Point = { x: number; y: number };
type Burst = { key: number; seat: string };

function layout(regions: Region[], w: number) {
  const placed = regions
    .map((r) => ({ r, n: r.seats.length }))
    .sort((a, b) => b.n - a.n)
    .map((x, i) => ({ ...x, slot: SLOTS[i]! }));
  const stack = (s: Slot) => {
    const p = placed.find((x) => x.slot === s);
    return p ? LABEL + p.n * PITCH : 0;
  };
  const column = (up: Slot, down: Slot) => stack(up) + stack(down) + (stack(up) && stack(down) ? 48 : 0);
  const h = Math.max(640, column("ul", "ll") + 64, column("ur", "lr") + 64, stack("top") + stack("bottom") + 300 + 64);
  const cx = w / 2;
  const cy = h / 2;
  const offset = Math.max(180, Math.min(416, cx - CW / 2 - 36));
  const pos = (slot: Slot, n: number): Point => {
    const s = LABEL + n * PITCH;
    const left = slot === "ul" || slot === "ll";
    const x = left ? cx - offset : slot === "ur" || slot === "lr" ? cx + offset : cx;
    if (slot === "top") return { x, y: 32 };
    if (slot === "bottom") return { x, y: h - 32 - s };
    const [up, down] = left ? (["ul", "ll"] as const) : (["ur", "lr"] as const);
    if (!stack(up) || !stack(down)) return { x, y: Math.min(h - 32 - s, Math.max(32, cy - s / 2 + (BELOW.has(slot) ? 90 : -90))) };
    const top = (h - column(up, down)) / 2;
    return { x, y: slot === up ? top : top + stack(up) + 48 };
  };
  return { h, cx, cy, regions: placed.map((p) => ({ ...p, at: pos(p.slot, p.n) })) };
}

function Ago({ at, prefix = "" }: { at: Date; prefix?: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(1, Math.round((Date.now() - at.getTime()) / 1000));
  return <>{prefix + (s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`)}</>;
}

export function LivePage({
  tasks,
  activity,
  now,
  projects,
  onOpenTask,
}: {
  tasks: readonly Task[];
  activity: readonly ActivityEntry[];
  now: Date;
  projects: readonly { id: string; name: string }[];
  onOpenTask: (id: string) => void;
}) {
  const [project, setProject] = useState(projects[0]?.id ?? "agentree");
  const name = projects.find((p) => p.id === project)?.name ?? project;
  const board = useMemo(() => {
    const sessions = project === "agentree" ? fixtureAgents(now).sessions : [];
    return liveBoard(sessions, project === "agentree" ? tasks : [], project === "agentree" ? activity : [], now);
  }, [project, tasks, activity, now]);
  const seats = useMemo(() => board.regions.flatMap((r) => r.seats), [board]);

  const graph = useRef<HTMLElement>(null);
  const [w, setW] = useState(1100);
  useLayoutEffect(() => {
    const el = graph.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const lay = useMemo(() => layout(board.regions, w), [board, w]);
  const narrow = w < 640;

  const [pts, setPts] = useState<Record<string, Point>>({});
  useLayoutEffect(() => {
    const next: Record<string, Point> = {};
    graph.current!.querySelectorAll<HTMLElement>(".seat-card").forEach((c) => {
      const r = c.offsetParent as HTMLElement;
      next[c.dataset.seat!] = { x: r.offsetLeft + c.offsetLeft + c.offsetWidth / 2, y: r.offsetTop + c.offsetTop + c.offsetHeight / 2 };
    });
    setPts(next);
  }, [lay]);

  const [open, setOpen] = useState<string>();
  useEffect(() => setOpen(undefined), [project]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element).closest(".seat-card, .org-pop")) setOpen(undefined);
    };
    addEventListener("keydown", close);
    addEventListener("pointerdown", close);
    return () => {
      removeEventListener("keydown", close);
      removeEventListener("pointerdown", close);
    };
  }, [open]);

  const [updated, setUpdated] = useState(() => new Date());
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    const busy = seats.filter((s) => !s.idle);
    if (!busy.length || reducedMotion()) return;
    let key = 0;
    let t: ReturnType<typeof setTimeout>;
    const fire = () => {
      const total = busy.reduce((n, s) => n + s.weight, 0);
      let pick = Math.random() * total;
      const seat = busy.find((s) => (pick -= s.weight) <= 0) ?? busy[0]!;
      setBursts((b) => [...b.slice(-5), { key: ++key, seat: seat.id }]);
      t = setTimeout(fire, 3200 + Math.random() * 2400);
    };
    t = setTimeout(fire, 1200);
    return () => clearTimeout(t);
  }, [seats]);

  const speaking = new Set(board.pulses[0] ? [board.pulses[0].from, board.pulses[0].to] : []);
  const on = (ids: string[]) => (open && ids.includes(open) ? "on" : undefined);
  const center = { x: lay.cx, y: lay.cy };
  const seat = seats.find((s) => s.id === open);
  const popAt = (() => {
    if (!seat) return undefined;
    const el = graph.current?.querySelector<HTMLElement>(`.seat-card[data-seat="${seat.id}"]`);
    if (!el) return undefined;
    const r = el.offsetParent as HTMLElement;
    const left = r.offsetLeft + el.offsetLeft;
    const top = r.offsetTop + el.offsetTop;
    if (narrow) return { left: 8, right: 8, top: top + el.offsetHeight + 8, width: "auto" };
    return { left: left + CW + 12 + 320 > w ? Math.max(8, left - 12 - 320) : left + CW + 12, top: Math.min(top, lay.h - 420) };
  })();

  return (
    <div className="page live">
      <div className="live-proj seg" role="group" aria-label="Project">
        {projects.map((p) => (
          <button key={p.id} type="button" className={p.id === project ? "on" : ""} aria-pressed={p.id === project} onClick={() => setProject(p.id)}>
            {p.name}
          </button>
        ))}
      </div>
      <div className="hub-head">
        <div className="title-line">
          <h1>Live fleet viewer</h1>
          <span className="live-pulse">
            <Ago at={updated} prefix="updated " />
          </span>
        </div>
        <div className="live-stats">
          <div>
            <b>{board.stats.sessions.toLocaleString()}</b>agent sessions so far
          </div>
          <div>
            <b>{board.stats.working}</b>agents working now
          </div>
          <div>
            <b>{board.stats.tools}</b>tools
          </div>
          <div>
            <b>{board.stats.today}</b>log entries today
          </div>
        </div>
      </div>

      <section
        ref={graph}
        className={`live-graph org full ${narrow ? "narrow" : ""}`}
        aria-label={`Agents at work around ${name}, by tool`}
        data-open={open}
        style={narrow ? undefined : { height: lay.h }}
      >
        <svg className="org-lines" aria-hidden="true" viewBox={`0 0 ${w} ${lay.h}`}>
          {seats.map((s) => {
            const p = pts[s.id];
            if (!p) return null;
            const path = `M${p.x.toFixed(1)} ${p.y.toFixed(1)}L${center.x.toFixed(1)} ${center.y.toFixed(1)}`;
            const len = Math.hypot(center.x - p.x, center.y - p.y);
            const n = s.idle ? 0 : Math.round(3 + s.weight * 5);
            const dur = len / (30 + s.weight * 25);
            return (
              <g key={s.id} data-tool={s.tool}>
                <line
                  x1={p.x}
                  y1={p.y}
                  x2={center.x}
                  y2={center.y}
                  className={on([s.id])}
                  strokeWidth={1 + s.weight * 3}
                  strokeOpacity={0.35 + s.weight * 0.25}
                  data-seat={s.id}
                />
                {!reducedMotion() &&
                  Array.from({ length: n }, (_, i) => (
                    <circle
                      key={i}
                      className={`flow ${on([s.id]) ?? ""}`}
                      r={1.6 + s.weight * 0.4}
                      fillOpacity={0.7 + s.weight * 0.2}
                      data-seat={s.id}
                    >
                      <animateMotion dur={`${dur.toFixed(2)}s`} begin={`-${((i * dur) / n).toFixed(2)}s`} repeatCount="indefinite" path={path} />
                    </circle>
                  ))}
              </g>
            );
          })}
          {board.pulses.slice(0, 1 + OLD.length).map((p, i) => {
            const a = pts[p.from];
            const b = pts[p.to];
            if (!a || !b) return null;
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            const nx = -(b.y - a.y) / (len || 1);
            const ny = (b.x - a.x) / (len || 1);
            const toward = (center.x - mid.x) * nx + (center.y - mid.y) * ny >= 0 ? 1 : -1;
            const c = { x: mid.x + toward * nx * len * 0.3, y: mid.y + toward * ny * len * 0.3 };
            const d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${c.x.toFixed(1)} ${c.y.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
            const tool = seats.find((s) => s.id === p.from)?.tool;
            return (
              <g key={`${p.from}-${p.to}`} data-tool={tool}>
                <path
                  className={`pulse ${i ? "old" : ""} ${on([p.from, p.to]) ?? ""}`}
                  d={d}
                  strokeOpacity={i ? OLD[i - 1] : 0.9}
                  data-seat={`${p.from} ${p.to}`}
                />
                {i === 0 && !reducedMotion() && (
                  <circle className={`run ${on([p.from, p.to]) ?? ""}`} r={4.5} data-seat={`${p.from} ${p.to}`}>
                    <animateMotion dur="2.6s" repeatCount="indefinite" path={d} />
                  </circle>
                )}
              </g>
            );
          })}
          {bursts.map((b) => {
            const s = seats.find((x) => x.id === b.seat);
            const p = pts[b.seat];
            if (!s || !p) return null;
            return (
              <BurstDots
                key={b.key}
                tool={s.tool}
                from={p}
                to={center}
                onArrive={() => {
                  setBursts((all) => all.filter((x) => x.key !== b.key));
                  setFlash((n) => n + 1);
                  setUpdated(new Date());
                }}
              />
            );
          })}
        </svg>

        {lay.regions.map(({ r, slot, at }) => (
          <section
            key={r.tool}
            className={`org-region ${BELOW.has(slot) ? "below" : ""}`}
            data-tool={r.tool}
            aria-label={r.label}
            style={narrow ? undefined : { left: at.x - CW / 2, top: at.y }}
          >
            <i className="org-wash" />
            <p className="org-label">
              <span>{r.label}</span>
              <span className="hardlink">{r.note}</span>
            </p>
            {r.seats.map((s) => (
              <SeatCard
                key={s.id}
                s={s}
                speaking={speaking.has(s.id)}
                open={open === s.id}
                onOpen={() => setOpen(open === s.id ? undefined : s.id)}
              />
            ))}
          </section>
        ))}

        <div
          key={flash}
          className={`judge-card ${flash ? "flash" : ""}`}
          aria-label={`The project ${name}`}
          style={{ ...(narrow ? {} : { left: center.x, top: center.y }), ["--core" as string]: `${Math.max(72, name.length * 9 + 18)}px` }}
        >
          <b className="gate-core">{name.toUpperCase()}</b>
          <span className="gate-pill">
            {board.landed ? (
              <>
                <span>landed {board.landed.id}</span> · <time dateTime={board.landed.at.toISOString()}>{timeAgo(board.landed.at, now)}</time>
              </>
            ) : seats.length ? (
              "nothing landed yet"
            ) : (
              "no agent at work"
            )}
          </span>
        </div>

        {seat && popAt && (
          <div className="org-pop" role="dialog" aria-label="Agent session" data-tool={seat.tool} style={popAt}>
            <p className="id">{seat.id}</p>
            <p className="pop-tool">
              {board.regions.find((r) => r.tool === seat.tool)?.label} · {seat.model}
            </p>
            <p className="now">
              <span className={`what doing ${seat.idle ? "is-idle" : ""}`}>
                {!seat.idle && <span className="live-dot on small" aria-hidden="true" />}
                {seat.doing}
              </span>
            </p>
            <p className="holds">
              {seat.started}
              {seat.task && (
                <>
                  {" · holds "}
                  <button type="button" className="lnk" onClick={() => onOpenTask(seat.task!)}>
                    {seat.task}
                  </button>
                </>
              )}
            </p>
            <p className="subs">{seat.subs ? `${seat.subs} subagent${seat.subs === 1 ? "" : "s"}` : "no subagent"}</p>
            <ol className="said">
              {saidBy(seat, board.pulses, activity).map((m) => (
                <li key={`${m.at.getTime()}-${m.who}`}>
                  <p className="who">
                    <span>{m.who}</span>
                    <time dateTime={m.at.toISOString()}>{timeAgo(m.at, now)}</time>
                  </p>
                  <q>{m.text}</q>
                </li>
              ))}
            </ol>
            {seat.task && (
              <button type="button" className="open" onClick={() => onOpenTask(seat.task!)}>
                Open task →
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function SeatCard({ s, speaking, open, onOpen }: { s: Seat; speaking: boolean; open: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={`seat-card ${s.idle ? "idle" : ""} ${speaking ? "speaking" : ""}`}
      data-seat={s.id}
      aria-expanded={open}
      onClick={onOpen}
    >
      <span className="id">
        <span className="trunc">{s.id}</span>
      </span>
      <span className="holds doing">
        {!s.idle && <span className="live-dot on small" aria-hidden="true" />}
        {s.doing}
      </span>
      <span className="subs">{s.idle ? "idle" : `${s.subs} sub`}</span>
    </button>
  );
}

/** A report of a seat running to the project: a dot and its two trails, then the core flashes. */
function BurstDots({ tool, from, to, onArrive }: { tool: string; from: Point; to: Point; onArrive: () => void }) {
  const ref = useRef<SVGGElement>(null);
  const path = `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${to.x.toFixed(1)} ${to.y.toFixed(1)}`;
  const dur = Math.hypot(to.x - from.x, to.y - from.y) / 140;
  const arrive = useRef(onArrive);
  arrive.current = onArrive;
  useEffect(() => {
    const timers = [...ref.current!.querySelectorAll("circle")].map((c, i) =>
      setTimeout(() => {
        c.setAttribute("visibility", "visible");
        c.querySelector<SVGAnimationElement>("animateMotion")!.beginElement();
      }, i * 70),
    );
    timers.push(setTimeout(() => arrive.current(), dur * 1000));
    return () => timers.forEach(clearTimeout);
  }, [dur]);
  return (
    <g ref={ref} data-tool={tool}>
      {[
        [5, 1, "burst"],
        [3.7, 0.45, "burst trail"],
        [2.4, 0.22, "burst trail"],
      ].map(([r, o, c]) => (
        <circle key={c + String(r)} className={c as string} r={r as number} fillOpacity={o as number} visibility="hidden">
          <animateMotion dur={`${dur.toFixed(2)}s`} begin="indefinite" fill="freeze" path={path} />
        </circle>
      ))}
    </g>
  );
}
