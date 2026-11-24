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
        <span className="faint mono text-(length:--text-xs)">rfcs/ · docs/adr/</span>
      </div>

      <div className="grid grid-cols-[minmax(280px,360px)_minmax(0,1fr)] items-start gap-4 px-(--gutter) pt-3 pb-6">
        <Panel clip>
          {shown.length ? (
            shown.map((d) => (
              <div
                key={d.id}
                className={`nrow ${d.id === openId ? "bg-accent-soft" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => openDoc(d.id)}
                onKeyDown={(e) => e.key === "Enter" && openDoc(d.id)}
                aria-current={d.id === openId ? "true" : undefined}
              >
                <span className="row text-ink-3 mt-0.5">{ic(d.kind === "RFC" ? BookOpen : FileText, 15)}</span>
                <div className="grow min-w-0 flex flex-col gap-1">
                  <span className="row gap-2 min-w-0">
                    <span className="mono faint text-(length:--text-xs) whitespace-nowrap shrink-0">
                      {d.kind} {d.number}
                    </span>
                    <span className={`trunc font-medium ${d.status === "superseded" ? "text-ink-3 line-through" : ""}`}>{d.title}</span>
                  </span>
                  <span className="row faint gap-2 text-(length:--text-xs)">
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

        <article className="panel grid grid-cols-[minmax(0,1fr)_248px] items-start gap-6 px-6 pt-5 pb-6">
          <div className="min-w-0">
            <div className="row faint gap-2 text-(length:--text-xs) mb-1.5">
              <span className="mono">{doc.path}</span>
            </div>
            <h2 className="doc-title">
              {doc.kind} {doc.number}: {doc.title}
            </h2>
            <div className="row gap-2.5 text-(length:--text-xs) mb-4 flex-wrap">
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

            <div className="prose" key={doc.id}>
              {doc.sections.map((s) => (
                <section key={s.h} id={slug(s.h)} className="fx-stagger mb-4.5">
                  <h3>{s.h}</h3>
                  {s.body.map((p) => (
                    <p key={p}>
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
            <div className="doc-side-h mt-3.5">
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
              <span className="doc-side-i faint cursor-default">No task names it</span>
            )}
          </aside>
        </article>
      </div>
    </Page>
  );
}
