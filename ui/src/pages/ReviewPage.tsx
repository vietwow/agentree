import { ChevronDown, ChevronRight, CircleAlert, Clock, FileDiff, GitMerge, ShieldCheck, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { fixtureDetail } from "../board/fixtures.ts";
import { TOOL_LABEL, type Status, type Task, type TaskDetail } from "../board/task.ts";
import { DAY, HOUR } from "../design/format/time.ts";
import { ic } from "../ui/ic.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { Empty, style } from "./parts.tsx";
import { SummaryCards } from "../tasks/StatCards.tsx";
import { plural } from "../design/format/text.ts";
import { Ago } from "../design/components/Ago.tsx";

const COLS = "minmax(260px,1fr) 190px 150px 112px 76px 130px 150px 140px";
/** The group header's chevron and gap put its status icon at 52px; a row's icon sits under it. */
const ROW_INSET = 44;
const MIN_W = ROW_INSET + [...COLS.matchAll(/(\d+)px/g)].reduce((n, m) => n + Number(m[1]), 0);

type Stage = "reviewing" | "accepted" | "rejected" | "landed";
type Row = { t: Task; d: TaskDetail; stage: Stage; at: Date };

type Props = {
  tasks: Task[];
  now: Date;
  selected?: string;
  onOpenTask: (id: string) => void;
};

const GROUPS: { stage: Stage; name: string; icon: Status }[] = [
  { stage: "reviewing", name: "Being reviewed", icon: "review" },
  { stage: "accepted", name: "Accepted, in the landing queue", icon: "accepted" },
  { stage: "rejected", name: "Rejected, back to its worker", icon: "in-progress" },
  { stage: "landed", name: "Landed today", icon: "done" },
];

const VERDICT: Record<Stage, { label: string; tone: string }> = {
  reviewing: { label: "Reviewing", tone: "accent" },
  accepted: { label: "Accepted", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  landed: { label: "Accepted", tone: "green" },
};

/** What the reviewing agents decided, and where each accepted task is on its way to main. */
export function ReviewPage({ tasks, now, selected, onOpenTask }: Props) {
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const t of tasks) {
      const d = fixtureDetail(t, tasks, now);
      if (d.review?.verdict === "rejected" && t.status === "in-progress") out.push({ t, d, stage: "rejected", at: d.review.at ?? t.statusSince });
      else if (t.status === "review") out.push({ t, d, stage: "reviewing", at: t.statusSince });
      else if (t.status === "accepted") out.push({ t, d, stage: "accepted", at: t.statusSince });
      else if (t.status === "done" && t.landedAt && now.getTime() - t.landedAt.getTime() < DAY) out.push({ t, d, stage: "landed", at: t.landedAt });
    }
    return out.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [tasks, now]);
  const of = (stage: Stage) => rows.filter((r) => r.stage === stage);
  const reviewing = of("reviewing");
  const queue = of("accepted");
  const old = reviewing.filter((r) => now.getTime() - r.at.getTime() > HOUR).length;
  const findings = rows.reduce((n, r) => n + (r.d.review?.findings.length ?? 0), 0);

  const landing = ({ t, stage }: Row) => {
    if (stage === "reviewing") return <span className="faint">After the review</span>;
    if (stage === "rejected")
      return (
        <span className="row" style={{ gap: 5, color: "var(--ink-2)" }}>
          {ic(Undo2, 13)}Back to its worker
        </span>
      );
    if (stage === "landed")
      return (
        <span className="row" style={{ gap: 5, color: "var(--good)" }}>
          {ic(GitMerge, 13)}On main
        </span>
      );
    const place = queue.findIndex((r) => r.t.id === t.id);
    return (
      <span className="row" style={{ gap: 5, color: place === 0 ? "var(--warn)" : "var(--ink-2)" }}>
        {ic(GitMerge, 13)}
        {place === 0 ? "Next to land" : `${place + 1} in the queue`}
      </span>
    );
  };

  const row = (r: Row) => {
    const { t, d, stage, at } = r;
    const diff = d.tree?.diff ?? [];
    const added = diff.reduce((n, f) => n + f.added, 0);
    const removed = diff.reduce((n, f) => n + f.removed, 0);
    const reviewer = d.review?.by;
    const late = stage === "reviewing" && now.getTime() - at.getTime() > HOUR;
    const verdict = VERDICT[stage];
    return (
      <div key={t.id} className="contents">
        <div className={`trow ${selected === t.id ? "sel" : ""}`} style={{ ...style({ "--cols": COLS }), paddingLeft: ROW_INSET }}>
          <div className="ttl" data-opens-task onClick={() => onOpenTask(t.id)}>
            <StatusIcon status={t.status} />
            <span className="key">{t.id}</span>
            <span className="tt">{t.title}</span>
          </div>
          <div className="c-meta" style={{ minWidth: 0, overflow: "hidden" }}>
            <span className="row" style={{ gap: 6, minWidth: 0 }}>
              <ToolMark tool={t.holder?.tool} size={20} />
              <span className="trunc">{t.holder ? `${TOOL_LABEL[t.holder.tool]} · ${t.holder.model}` : "Not held"}</span>
            </span>
          </div>
          <div className="c-meta" style={{ minWidth: 0, overflow: "hidden" }}>
            {reviewer ? (
              <span className="row" style={{ gap: 6, minWidth: 0 }}>
                <ToolMark tool={reviewer} size={20} />
                <span className="trunc">{TOOL_LABEL[reviewer]}</span>
              </span>
            ) : (
              <span className="faint">None yet</span>
            )}
          </div>
          <div className="c-meta">
            <span className={`badge ${verdict.tone}`}>
              <span className="dot" />
              {verdict.label}
            </span>
          </div>
          <div className="c-meta num">
            <span className="row" style={{ gap: 5, color: t.checks.failed ? "var(--bad)" : "var(--good)" }}>
              {ic(ShieldCheck, 13)}
              {t.checks.passed}/{t.checks.total}
            </span>
          </div>
          <div className="c-meta num">
            <span className="row" style={{ gap: 5 }}>
              {ic(FileDiff, 13)}
              <span>{diff.length}</span>
              <span style={{ color: "var(--good)" }}>+{added}</span>
              <span style={{ color: "var(--bad)" }}>−{removed}</span>
            </span>
          </div>
          <div className="c-meta" style={{ minWidth: 0, overflow: "hidden", whiteSpace: "nowrap" }}>
            {landing(r)}
          </div>
          <div className="c-meta" style={{ minWidth: 0, overflow: "hidden" }}>
            <span className="row" style={{ gap: 5, whiteSpace: "nowrap", color: late ? "var(--bad)" : "var(--ink-3)" }}>
              {ic(Clock, 13)}
              <Ago at={at} now={now} />
            </span>
          </div>
        </div>
        {d.review && d.review.findings.length > 0 && (
          <div className="subrows">
            {d.review.findings.map((f) => (
              <div key={f} className="subrow" style={{ paddingLeft: ROW_INSET + 30 }}>
                <span className="row" style={{ color: stage === "rejected" ? "var(--bad)" : "var(--warn)" }}>
                  {ic(CircleAlert, 13)}
                </span>
                <span>{f}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="page flush">
      <div className="ph">
        <div>
          <h1>Review</h1>
          <p>
            An agent reviews each task whose checks passed and accepts it, or rejects it with findings. The lander then puts the accepted tasks on
            main, one at a time.
          </p>
        </div>
      </div>
      <div className="@container" style={{ padding: "0 var(--gutter) 16px" }}>
        <SummaryCards
          cards={[
            {
              label: "Being reviewed",
              value: reviewing.length,
              unit: plural(reviewing.length, "task"),
              lead: old ? `${old}` : undefined,
              note: old ? "waiting over an hour" : "None waiting over an hour",
              tone: old ? "warn" : "neutral",
            },
            {
              label: "In the landing queue",
              value: queue.length,
              unit: plural(queue.length, "task"),
              note: "rebased by the lander when stale",
              tone: "neutral",
            },
            {
              label: "Findings",
              value: findings,
              lead: of("rejected").length ? `${of("rejected").length}` : undefined,
              note: "rejected",
              tone: of("rejected").length ? "bad" : "neutral",
            },
            {
              label: "Landed today",
              value: of("landed").length,
              unit: plural(of("landed").length, "task"),
              note: "on main",
              tone: of("landed").length ? "good" : "neutral",
            },
          ]}
        />
      </div>
      {rows.length ? (
        <div className="list-wrap">
          <div className="tlist" role="table" aria-label="Review" style={{ minWidth: MIN_W }}>
            <div className="thead" style={{ ...style({ "--cols": COLS }), paddingLeft: ROW_INSET }} role="row">
              <div>Task</div>
              <div>Built by</div>
              <div>Reviewed by</div>
              <div>Verdict</div>
              <div>Checks</div>
              <div>Diff</div>
              <div>Landing</div>
              <div>Since</div>
            </div>
            {GROUPS.map((g) => {
              const items = of(g.stage);
              if (!items.length) return null;
              return (
                <div key={g.stage} className="contents">
                  <div className="grp">
                    <button
                      type="button"
                      className="ibtn ibtn-xs"
                      onClick={() => setClosed((now) => ({ ...now, [g.stage]: !now[g.stage] }))}
                      aria-expanded={!closed[g.stage]}
                      aria-label="Toggle group"
                    >
                      {ic(closed[g.stage] ? ChevronRight : ChevronDown, 13)}
                    </button>
                    <StatusIcon status={g.icon} />
                    <span>{g.name}</span>
                    <span className="cnt">{items.length}</span>
                  </div>
                  {!closed[g.stage] && items.map(row)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <Empty icon={ShieldCheck} title="Nothing to review" text="A task shows here once its checks pass." />
      )}
    </div>
  );
}
