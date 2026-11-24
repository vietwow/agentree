import { ArrowRight, BookOpen, ChevronDown, ChevronUp, FileText, Hash, ListChecks, ListTree, Search } from "lucide-react";
import { useState } from "react";
import { DOCS, type Doc } from "../board/fixtures.ts";
import type { Task } from "../board/task.ts";
import { Badge, type Tone } from "../design/components/Badge.tsx";
import { Empty } from "../design/components/Empty.tsx";
import { ic } from "../design/components/icon.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Panel } from "../design/components/Panel.tsx";
import { Segmented } from "../design/components/Segmented.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { MdText } from "./parts.tsx";

const STATUS: Record<Doc["status"], { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "warn" },
  accepted: { label: "Accepted", tone: "good" },
  superseded: { label: "Superseded", tone: "neutral" },
};

const KINDS = [
  ["all", "All"],
  ["RFC", "RFCs"],
  ["ADR", "ADRs"],
] as const;

type Props = { tasks: Task[]; onOpenTask: (id: string) => void };

const slug = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "-");

/** The project's RFCs and ADRs as they are on main; the page changes none. */
export function DocumentsPage({ tasks, onOpenTask }: Props) {
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(DOCS[0]!.id);
  const [allTasks, setAllTasks] = useState(false);
  const openDoc = (id: string) => {
    setOpenId(id);
    setAllTasks(false);
  };
  const words = q.trim().toLowerCase();
  const shown = DOCS.filter(
    (d) =>
      (kind === "all" || d.kind === kind) &&
      (!words || [d.title, d.number, ...d.sections.flatMap((s) => [s.h, ...s.body])].some((x) => x.toLowerCase().includes(words))),
  );
  const doc = DOCS.find((d) => d.id === openId)!;
  const named = doc.kind === "RFC" ? tasks.filter((t) => t.rfc === doc.number) : [];
  const link = (id?: string) => DOCS.find((d) => d.id === id);

  return (
    <Page layout="flush">
      <PageHeader title="Documents">The project's RFCs and ADRs, read from the files of main. The page changes none of them.</PageHeader>
      <div className="toolbar" role="toolbar">
        <div className="inwrap">
          {ic(Search, 13)}
          <input
            className="input search-sm"
            placeholder="Search documents"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search documents"
          />
        </div>
        <Segmented label="Kind" value={kind} onChange={setKind} options={KINDS.map(([value, label]) => ({ value, label }))} />
        <span className="sp" />
        <span className="faint mono" style={{ fontSize: "var(--text-xs)" }}>
          rfcs/ · docs/adr/
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)",
          gap: 16,
          padding: "12px var(--gutter) 24px",
          alignItems: "start",
        }}
      >
        <Panel clip>
          {shown.length ? (
            shown.map((d) => (
              <div
                key={d.id}
                className="nrow"
                role="button"
                tabIndex={0}
                onClick={() => openDoc(d.id)}
                onKeyDown={(e) => e.key === "Enter" && openDoc(d.id)}
                style={d.id === openId ? { background: "var(--accent-soft)" } : undefined}
                aria-current={d.id === openId ? "true" : undefined}
              >
                <span className="row" style={{ color: "var(--ink-3)", marginTop: 2 }}>
                  {ic(d.kind === "RFC" ? BookOpen : FileText, 15)}
                </span>
                <div className="grow" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span className="mono faint" style={{ fontSize: "var(--text-xs)", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {d.kind} {d.number}
                    </span>
                    <span
                      className="trunc"
                      style={{
                        fontWeight: 500,
                        textDecoration: d.status === "superseded" ? "line-through" : undefined,
                        color: d.status === "superseded" ? "var(--ink-3)" : undefined,
                      }}
                    >
                      {d.title}
                    </span>
                  </span>
                  <span className="row faint" style={{ gap: 8, fontSize: "var(--text-xs)" }}>
                    <Badge tone={STATUS[d.status].tone} dot>
                      {STATUS[d.status].label}
                    </Badge>
                    <span className="num">{d.date}</span>
                  </span>
                </div>
              </div>
            ))
          ) : (
            <Empty icon={BookOpen} title="No document found" text="Nothing in rfcs/ or docs/adr/ matches the search." />
          )}
        </Panel>

        <article
          className="panel"
          style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 248px", gap: 24, alignItems: "start", padding: "20px 24px 24px" }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="row faint" style={{ gap: 8, fontSize: "var(--text-xs)", marginBottom: 6 }}>
              <span className="mono">{doc.path}</span>
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em" }}>
              {doc.kind} {doc.number}: {doc.title}
            </h2>
            <div className="row" style={{ gap: 10, fontSize: "var(--text-xs)", marginBottom: 16, flexWrap: "wrap" }}>
              <Badge tone={STATUS[doc.status].tone} dot>
                {STATUS[doc.status].label}
              </Badge>
              <span className="faint num">{doc.date}</span>
              {link(doc.supersedes) && (
                <button type="button" className="pillbtn" onClick={() => openDoc(doc.supersedes!)}>
                  Supersedes {link(doc.supersedes)!.kind} {link(doc.supersedes)!.number}
                  {ic(ArrowRight, 12)}
                </button>
              )}
              {link(doc.supersededBy) && (
                <button type="button" className="pillbtn" onClick={() => openDoc(doc.supersededBy!)}>
                  Superseded by {link(doc.supersededBy)!.kind} {link(doc.supersededBy)!.number}
                  {ic(ArrowRight, 12)}
                </button>
              )}
            </div>

            <div key={doc.id} style={{ fontSize: "var(--text-base)", lineHeight: 1.65 }}>
              {doc.sections.map((s) => (
                <section key={s.h} id={slug(s.h)} className="fx-stagger" style={{ marginBottom: 18 }}>
                  <h3 style={{ fontSize: 15, lineHeight: "26px", fontWeight: 600, margin: "0 0 2px" }}>{s.h}</h3>
                  {s.body.map((p) => (
                    <p key={p} style={{ margin: "0 0 6px", color: "var(--ink-2)" }}>
                      <MdText s={p} />
                    </p>
                  ))}
                </section>
              ))}
            </div>
          </div>
          <aside className="doc-side">
            <div className="doc-side-h">
              {ic(ListTree, 13)}
              <span>Contents</span>
            </div>
            {doc.sections.map((sec) => (
              <a
                key={sec.h}
                href={`#${slug(sec.h)}`}
                className="doc-side-i"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(slug(sec.h))?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                {ic(Hash, 12)}
                <span className="trunc">{sec.h}</span>
              </a>
            ))}
            <div className="doc-side-h" style={{ marginTop: 14 }}>
              {ic(ListChecks, 13)}
              <span>Tasks naming it</span>
              {named.length > 0 && <span className="num faint">{named.length}</span>}
            </div>
            {named.length ? (
              <>
                {(allTasks ? named : named.slice(0, 8)).map((t) => (
                  <button key={t.id} type="button" className="doc-side-i" data-opens-task onClick={() => onOpenTask(t.id)} title={t.title}>
                    <StatusIcon status={t.status} />
                    <span className="mono faint key-id">{t.id}</span>
                    <span className="trunc">{t.title}</span>
                  </button>
                ))}
                {named.length > 8 && (
                  <button type="button" className="doc-side-i faint" onClick={() => setAllTasks(!allTasks)}>
                    {ic(allTasks ? ChevronUp : ChevronDown, 12)}
                    {allTasks ? "Show fewer" : `${named.length - 8} more`}
                  </button>
                )}
              </>
            ) : (
              <span className="doc-side-i faint" style={{ cursor: "default" }}>
                No task names it
              </span>
            )}
          </aside>
        </article>
      </div>
    </Page>
  );
}
