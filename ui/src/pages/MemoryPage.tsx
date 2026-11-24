import {
  Archive,
  BookMarked,
  Brain,
  Check,
  Clock,
  FileText,
  Handshake,
  Lightbulb,
  Pencil,
  Search,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { board, send } from "../board/daemon.ts";
import type { Fact } from "../board/model.ts";
import { EditFact } from "./EditFact.tsx";
import { TOOL_LABEL } from "../board/task.ts";
import { Ago } from "../design/components/Ago.tsx";
import { Badge, type Tone } from "../design/components/Badge.tsx";
import { Button } from "../design/components/Button.tsx";
import { Empty } from "../design/components/Empty.tsx";
import { GroupHeader } from "../design/components/GroupHeader.tsx";
import { ic } from "../design/components/icon.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Segmented } from "../design/components/Segmented.tsx";
import { SummaryCards } from "../design/components/SummaryCards.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { MdText, style } from "./parts.tsx";

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

const STATE: Record<Fact["state"], { label: string; tone: Tone }> = {
  "in-force": { label: "In force", tone: "good" },
  proposed: { label: "Proposed", tone: "warn" },
  retired: { label: "Retired", tone: "neutral" },
};

type Props = {
  /** What the search starts with. */
  query?: string;
  now: Date;
  onOpenTask: (id: string) => void;
};

/** The facts of `work/memory/`: what every session is told, and what it may recall. */
export function MemoryPage({ query = "", now, onOpenTask }: Props) {
  const [editing, setEditing] = useState<Fact>();
  const { facts } = board();
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
            <span className="flex items-center gap-2 text-ink-3">{ic(KIND_ICON[f.kind], 14)}</span>
            <span className="tt">{f.title}</span>
          </div>
          <div className="c-meta min-w-0 overflow-hidden gap-1">
            {f.paths.length ? (
              f.paths.map((p) => (
                <span key={p} className="lbl mono text-2xs">
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
          <div className="c-meta min-w-0 overflow-hidden">
            <span className="flex items-center gap-1.5 min-w-0">
              <ToolMark tool={f.by} size={20} />
              <span className="trunc">{f.by === "person" ? "The owner" : TOOL_LABEL[f.by]}</span>
            </span>
          </div>
          <div className="c-meta">
            <Badge tone={state.tone} dot>
              {state.label}
            </Badge>
          </div>
          <div className="c-meta">
            <span className="flex items-center gap-1.25 whitespace-nowrap text-ink-3">
              {ic(Clock, 13)}
              <Ago at={f.at} now={now} />
            </span>
          </div>
        </div>
        {isOpen && (
          <div className="fx-stagger border-b border-divider pt-1.5 pr-6 pb-3.5" style={{ paddingLeft: ROW_INSET + 30 }}>
            <div className="mem-file">
              <div className="mem-file-h">
                {ic(FileText, 13)}
                <span className="mono trunc">work/memory/{f.file}.md</span>
                <span className="flex-1" />
                {f.state === "proposed" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void send(`/api/projects/${board().project.id}/memory/${f.file}`, { accept: true })}
                  >
                    {ic(Check, 13)}Put in force
                  </Button>
                ) : (
                  f.state === "in-force" && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(f)}>
                        {ic(Pencil, 13)}Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void send(`/api/projects/${board().project.id}/memory/${f.file}`, { retire: true })}
                      >
                        {ic(Archive, 13)}Retire
                      </Button>
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
                <span className="flex items-center gap-1.5">
                  About
                  {f.paths.length ? (
                    f.paths.map((p) => (
                      <code key={p} className="mono rounded-xs bg-surface-2 px-1.25 py-0.25 text-2xs text-ink-2">
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
    <Page layout="flush">
      <PageHeader title="Memory">
        What a session learns, kept as one Markdown file a fact in work/memory/. A claim's brief holds the agreements and the facts about the task's
        paths; the rest is found by recall.
      </PageHeader>
      <div className="@container pt-0 px-(--gutter) pb-4">
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
        <Segmented
          label="Kind"
          value={kind}
          onChange={setKind}
          collapse
          options={[{ value: "all", label: "All" }, ...KINDS.map((k) => ({ value: k.kind, label: k.name, icon: k.icon }))]}
        />
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
                <GroupHeader
                  name={g.name}
                  count={g.rows.length}
                  open={!closed[g.key]}
                  onToggle={() => setClosed((now) => ({ ...now, [g.key]: !now[g.key] }))}
                  lead={<span className="flex items-center gap-2 text-ink-2">{ic(g.icon, 14)}</span>}
                />
                {!closed[g.key] && g.rows.map(row)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Empty icon={Brain} title="No fact found" text="Nothing in work/memory/ matches the search." />
      )}
      {editing && <EditFact fact={editing} onClose={() => setEditing(undefined)} />}
    </Page>
  );
}
