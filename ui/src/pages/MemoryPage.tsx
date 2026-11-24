import {
  Archive,
  BookMarked,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Handshake,
  Lightbulb,
  Pencil,
  Search,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { fixtureFacts, type Fact } from "../board/fixtures.ts";
import { TOOL_LABEL } from "../board/task.ts";
import { ic } from "../ui/ic.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { SummaryCards } from "../tasks/StatCards.tsx";
import { Empty, MdText, style } from "./parts.tsx";
import { Ago } from "../design/components/Ago.tsx";

const COLS = "minmax(300px,1fr) 220px 110px 170px 120px 96px";
const ROW_INSET = 44;

type Kind = Fact["kind"];
const KINDS: { kind: Kind; name: string; icon: LucideIcon }[] = [
  { kind: "agreement", name: "Agreements", icon: Handshake },
  { kind: "decision", name: "Decisions", icon: BookMarked },
  { kind: "pitfall", name: "Pitfalls", icon: TriangleAlert },
  { kind: "how-to", name: "How-tos", icon: Lightbulb },
];
const KIND_ICON = Object.fromEntries(KINDS.map((k) => [k.kind, k.icon])) as Record<Kind, LucideIcon>;

const STATE: Record<Fact["state"], { label: string; tone: string }> = {
  "in-force": { label: "In force", tone: "green" },
  proposed: { label: "Proposed", tone: "amber" },
  retired: { label: "Retired", tone: "gray" },
};

type Props = {
  /** What the search starts with. */
  query?: string;
  now: Date;
  onOpenTask: (id: string) => void;
  onNotBuilt: (what: string) => void;
};

/** The facts of `work/memory/`: what every session is told, and what it may recall. */
export function MemoryPage({ query = "", now, onOpenTask, onNotBuilt }: Props) {
  const facts = useMemo(() => fixtureFacts(now), [now]);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [q, setQ] = useState(query);
  const [open, setOpen] = useState<string | undefined>();
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const words = q.trim().toLowerCase();
  const shown = facts.filter(
    (f) =>
      (kind === "all" || f.kind === kind) && (!words || [f.title, f.body, ...f.paths, f.task ?? ""].some((s) => s.toLowerCase().includes(words))),
  );
  const live = facts.filter((f) => f.state !== "retired");
  const groups = [
    ...KINDS.map((k) => ({ key: k.kind, name: k.name, icon: k.icon, rows: shown.filter((f) => f.kind === k.kind && f.state !== "retired") })),
    { key: "retired", name: "Retired", icon: Archive, rows: shown.filter((f) => f.state === "retired") },
  ].filter((g) => g.rows.length);

  const row = (f: Fact) => {
    const state = STATE[f.state];
    const isOpen = open === f.file;
    return (
      <div key={f.file} className="contents">
        <div className={`trow ${isOpen ? "sel" : ""}`} style={{ ...style({ "--cols": COLS }), paddingLeft: ROW_INSET }}>
          <div className="ttl" onClick={() => setOpen(isOpen ? undefined : f.file)} aria-expanded={isOpen}>
            <span className="row" style={{ color: "var(--ink-3)" }}>
              {ic(KIND_ICON[f.kind], 14)}
            </span>
            <span className="tt">{f.title}</span>
          </div>
          <div className="c-meta" style={{ minWidth: 0, overflow: "hidden", gap: 4 }}>
            {f.paths.length ? (
              f.paths.map((p) => (
                <span key={p} className="lbl mono" style={{ fontSize: "var(--text-2xs)" }}>
                  {p}
                </span>
              ))
            ) : (
              <span className="faint">Every task</span>
            )}
          </div>
          <div className="c-meta">
            {f.task ? (
              <button type="button" className="key" data-opens-task onClick={() => onOpenTask(f.task!)}>
                {f.task}
              </button>
            ) : (
              <span className="faint">{f.by === "person" ? "The owner" : "No task"}</span>
            )}
          </div>
          <div className="c-meta" style={{ minWidth: 0, overflow: "hidden" }}>
            <span className="row" style={{ gap: 6, minWidth: 0 }}>
              <ToolMark tool={f.by} size={20} />
              <span className="trunc">{f.by === "person" ? "The owner" : TOOL_LABEL[f.by]}</span>
            </span>
          </div>
          <div className="c-meta">
            <span className={`badge ${state.tone}`}>
              <span className="dot" />
              {state.label}
            </span>
          </div>
          <div className="c-meta">
            <span className="row" style={{ gap: 5, whiteSpace: "nowrap", color: "var(--ink-3)" }}>
              {ic(Clock, 13)}
              <Ago at={f.at} now={now} />
            </span>
          </div>
        </div>
        {isOpen && (
          <div className="fx-stagger" style={{ padding: `6px 24px 14px ${ROW_INSET + 30}px`, borderBottom: "1px solid var(--divider)" }}>
            <div className="mem-file">
              <div className="mem-file-h">
                {ic(FileText, 13)}
                <span className="mono trunc">work/memory/{f.file}.md</span>
                <span className="sp" />
                {f.state === "proposed" ? (
                  <span style={{ paddingRight: 8, whiteSpace: "nowrap" }}>Accepted with {f.task}'s review</span>
                ) : (
                  f.state === "in-force" && (
                    <>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => onNotBuilt("Editing a fact")}>
                        {ic(Pencil, 13)}Edit
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => onNotBuilt("Retiring a fact")}>
                        {ic(Archive, 13)}Retire
                      </button>
                    </>
                  )
                )}
              </div>
              <div className="mem-file-b">
                <MdText s={f.body} />
              </div>
              <div className="mem-file-f">
                <span>
                  Kind <b>{f.kind[0]!.toUpperCase() + f.kind.slice(1)}</b>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  About
                  {f.paths.length ? (
                    f.paths.map((p) => (
                      <code
                        key={p}
                        className="mono"
                        style={{
                          fontSize: "var(--text-2xs)",
                          padding: "1px 5px",
                          borderRadius: 4,
                          background: "var(--surface-2)",
                          color: "var(--ink-2)",
                        }}
                      >
                        {p}
                      </code>
                    ))
                  ) : (
                    <b>Every task</b>
                  )}
                </span>
                <span>
                  From <b>{f.task ?? "no task"}</b>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page flush">
      <div className="ph">
        <div>
          <h1>Memory</h1>
          <p>
            What a session learns, kept as one Markdown file a fact in work/memory/. A claim's brief holds the agreements and the facts about the
            task's paths; the rest is found by recall.
          </p>
        </div>
      </div>
      <div className="@container" style={{ padding: "0 var(--gutter) 16px" }}>
        <SummaryCards
          cards={[
            {
              label: "Facts in force",
              value: facts.filter((f) => f.state === "in-force").length,
              note: `${live.filter((f) => f.paths.length).length} tied to paths`,
              tone: "neutral",
            },
            {
              label: "Agreements",
              value: facts.filter((f) => f.kind === "agreement" && f.state !== "retired").length,
              note: "written by the owner, in every brief",
              tone: "neutral",
            },
            {
              label: "Proposed",
              value: facts.filter((f) => f.state === "proposed").length,
              note: "accepted with their task's review",
              tone: facts.some((f) => f.state === "proposed") ? "warn" : "neutral",
            },
            {
              label: "Retired",
              value: facts.filter((f) => f.state === "retired").length,
              note: "kept in git, out of the briefs",
              tone: "neutral",
            },
          ]}
        />
      </div>
      <div className="toolbar" role="toolbar">
        <div className="inwrap">
          {ic(Search, 13)}
          <input className="input search-sm" placeholder="Recall" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the memory" />
        </div>
        <div className="seg">
          <button type="button" className={kind === "all" ? "on" : ""} onClick={() => setKind("all")} aria-pressed={kind === "all"}>
            All
          </button>
          {KINDS.map((k) => (
            <button key={k.kind} type="button" className={kind === k.kind ? "on" : ""} onClick={() => setKind(k.kind)} aria-pressed={kind === k.kind}>
              {ic(k.icon, 13)}
              <span className="hide-m">{k.name}</span>
            </button>
          ))}
        </div>
      </div>
      {groups.length ? (
        <div className="list-wrap">
          <div className="tlist" role="table" aria-label="Memory">
            <div className="thead" style={{ ...style({ "--cols": COLS }), paddingLeft: ROW_INSET }} role="row">
              <div>Fact</div>
              <div>About</div>
              <div>From</div>
              <div>Written by</div>
              <div>State</div>
              <div>Since</div>
            </div>
            {groups.map((g) => (
              <div key={g.key} className="contents">
                <div className="grp">
                  <button
                    type="button"
                    className="ibtn ibtn-xs"
                    onClick={() => setClosed((now) => ({ ...now, [g.key]: !now[g.key] }))}
                    aria-expanded={!closed[g.key]}
                    aria-label="Toggle group"
                  >
                    {ic(closed[g.key] ? ChevronRight : ChevronDown, 13)}
                  </button>
                  <span className="row" style={{ color: "var(--ink-2)" }}>
                    {ic(g.icon, 14)}
                  </span>
                  <span>{g.name}</span>
                  <span className="cnt">{g.rows.length}</span>
                </div>
                {!closed[g.key] && g.rows.map(row)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Empty icon={Brain} title="No fact found" text="Nothing in work/memory/ matches the search." />
      )}
    </div>
  );
}
