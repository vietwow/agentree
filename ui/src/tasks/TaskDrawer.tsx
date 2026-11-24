import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Clock,
  Ellipsis,
  Folder,
  GitBranch,
  Link,
  Maximize2,
  MessageCircleQuestion,
  Minimize2,
  SignalHigh,
  Star,
  Tag,
  User,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toggleStar, useStars } from "../board/favorites.ts";
import { useTicks } from "../board/ticks.ts";
import type { Project } from "../board/projects.ts";
import { isStale, openQuestions, partsOf } from "../board/summary.ts";
import { KIND_LABEL, STATUS_LABEL, TOOL_LABEL, type Status, type Task, type TaskDetail } from "../board/task.ts";
import { timeAgo } from "../format/time.ts";
import { ProgBar, style } from "../pages/parts.tsx";
import { ic } from "../ui/ic.tsx";
import { KIND_COLOR } from "../ui/KindMark.tsx";
import { Pop, usePop } from "../ui/Pop.tsx";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { copy, toast } from "../ui/toast.ts";
import { ToolMark } from "../ui/ToolMark.tsx";
import { SubCheck } from "./SubCheck.tsx";
import { SubtaskView } from "./SubtaskView.tsx";
import { ChecksSection, LogSection, None, SessionsSection, TimeBox, TreeBox } from "./TaskPanel.tsx";

type Tab = "log" | "checks" | "sessions" | "files" | "memory";

/** The statuses a person moves a task between; every other move is the daemon's. */
export const PERSON_MOVES: readonly Status[] = ["backlog", "ready"];

type Props = {
  task: Task;
  detail: TaskDetail;
  tasks: readonly Task[];
  project: Project;
  now: Date;
  full: boolean;
  closing: boolean;
  onToggleFull: () => void;
  onClose: () => void;
  onOpen: (id: string) => void;
  onMove: (id: string, status: Status) => void;
  onAnimationEnd: () => void;
  panelRef: React.Ref<HTMLElement>;
};

export function TaskDrawer(props: Props) {
  const { task: t, detail, tasks, project, now, full, closing, onToggleFull, onClose, onOpen, onMove } = props;
  const [tab, setTab] = useState<Tab>("log");
  const [tabbed, setTabbed] = useState(false);
  const [entering, setEntering] = useState(true);
  const [sub, setSub] = useState<string | undefined>();
  const { popped } = useTicks();
  const body = useRef<HTMLDivElement>(null);
  const tabSec = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  const pop = usePop<"status" | "more">();
  const stars = useStars();
  const starred = stars.has(`task:${t.id}`);
  const kids = tasks.filter((k) => k.parent === t.id);
  const parts = partsOf(t, tasks);
  const stale = isStale(t, now);
  const asking = openQuestions(t).length;
  const movable = PERSON_MOVES.includes(t.status);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
    setEntering(true);
    setSub(undefined);
  }, [t.id]);

  useEffect(() => {
    const box = body.current;
    const sec = tabSec.current;
    if (!shown || !box || !sec) return;
    const view = box.getBoundingClientRect();
    const part = sec.getBoundingClientRect();
    const below = part.bottom + 16 - view.bottom;
    if (below <= 0) return;
    // The tabs stay in sight: a long section scrolls only until its tabs reach the top.
    box.scrollBy({
      top: Math.min(below, part.top - view.top - 8),
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [shown]);

  const closeSub = useCallback(() => setSub(undefined), []);
  const star = () => toast(toggleStar(`task:${t.id}`) ? "Added to favorites" : "Removed from favorites", { ms: 1800 });
  const link = () => copy(`${location.origin}/task/${t.id}`);
  const prop = (icon: ReactNode, label: string, value: ReactNode) => (
    <>
      <dt>
        {icon}
        {label}
      </dt>
      <dd>{value}</dd>
    </>
  );

  return (
    <>
      {full && <div className={`drawer-scrim full ${closing ? "leaving" : entering ? "enter" : ""}`} onClick={onClose} />}
      <aside
        ref={props.panelRef}
        className={`drawer ${full ? "full" : ""} ${closing ? "leaving" : entering ? "enter" : ""} ${tabbed ? "fx-tabs" : ""}`}
        role="dialog"
        aria-modal={full}
        aria-labelledby="d-h"
        tabIndex={-1}
        onAnimationEnd={(event) => {
          if (event.target !== event.currentTarget) return;
          if (closing) props.onAnimationEnd();
          else setEntering(false);
        }}
      >
        <h2 className="sr" id="d-h">
          {sub ? `Subtask: ${t.subtasks.find((x) => x.id === sub)?.title ?? ""}` : `Task: ${t.title}`}
        </h2>
        <div className="drawer-h">
          <button type="button" className="pillbtn" style={{ fontSize: 12.5 }}>
            <span className="pdot" style={style({ "--c": project.color })} />
            {project.name}
          </button>
          <span className="faint">/</span>
          <span className="mono faint" style={{ fontSize: 11.5, padding: "0 6px" }}>
            {t.id}
          </span>
          <span className="sp" />
          <button
            type="button"
            className="ibtn ibtn-sm"
            onClick={star}
            data-tip={starred ? "Unfavorite" : "Favorite"}
            aria-pressed={starred}
            aria-label="Favorite"
            style={starred ? { color: "var(--warn)" } : undefined}
          >
            {ic(Star, 15)}
          </button>
          <button type="button" className="ibtn ibtn-sm" onClick={link} data-tip="Copy link" aria-label="Copy link">
            {ic(Link, 15)}
          </button>
          <button
            type="button"
            className="ibtn ibtn-sm hide-m"
            onClick={onToggleFull}
            data-tip={full ? "Side panel" : "Full page"}
            aria-label="Toggle full page"
          >
            {ic(full ? Minimize2 : Maximize2, 15)}
          </button>
          <button type="button" className="ibtn ibtn-sm" onClick={pop.toggle("more")} aria-label="More">
            {ic(Ellipsis, 15)}
          </button>
          <button type="button" className="ibtn ibtn-sm" onClick={onClose} data-tip="Close  Esc" aria-label="Close">
            {ic(X, 16)}
          </button>
        </div>

        <div className="drawer-b" ref={body} key={t.id}>
          {sub ? (
            <SubtaskView task={t} id={sub} popped={popped} onOpen={setSub} onClose={closeSub} />
          ) : (
            <>
              {t.status === "done" && t.landedAt ? (
                <div className="alert ok" style={{ marginBottom: 12 }}>
                  {ic(CircleCheck, 15)}
                  <span>Landed on main {timeAgo(t.landedAt, now)}.</span>
                </div>
              ) : stale ? (
                <div className="alert danger" style={{ marginBottom: 12 }}>
                  {ic(Clock, 15)}
                  <span>No beat from its worker in over 30 minutes.</span>
                </div>
              ) : asking > 0 ? (
                <div className="alert warn" style={{ marginBottom: 12 }}>
                  {ic(MessageCircleQuestion, 15)}
                  <span>{asking === 1 ? "A question waits for your answer." : `${asking} questions wait for your answer.`}</span>
                </div>
              ) : null}

              <div className="ttl-edit" role="heading" aria-level={3}>
                {t.title}
              </div>

              <dl
                className="kv"
                style={{
                  marginTop: 12,
                  ...(full
                    ? {
                        gridTemplateColumns: "112px minmax(0,1fr) 112px minmax(0,1fr)",
                      }
                    : {}),
                }}
              >
                {prop(
                  ic(CircleDot, 14),
                  "Status",
                  <button
                    type="button"
                    className="pillbtn"
                    onClick={movable ? pop.toggle("status") : undefined}
                    aria-label={`Status: ${STATUS_LABEL[t.status]}`}
                    style={movable ? undefined : { cursor: "default" }}
                  >
                    <StatusIcon status={t.status} />
                    <span>{STATUS_LABEL[t.status]}</span>
                  </button>,
                )}
                {prop(
                  ic(SignalHigh, 14),
                  "Priority",
                  <span className="pillbtn">
                    <PriorityIcon priority={t.priority} />
                    <span>P{t.priority}</span>
                  </span>,
                )}
                {prop(
                  ic(User, 14),
                  "Assignee",
                  <span className={`pillbtn ${t.holder ? "" : "empty"}`}>
                    <ToolMark tool={t.holder?.tool} size={20} />
                    <span className="trunc">{t.holder ? `${TOOL_LABEL[t.holder.tool]} · ${t.holder.model}` : "Not held"}</span>
                  </span>,
                )}
                {prop(
                  ic(Folder, 14),
                  "Project",
                  <span className="pillbtn">
                    <span className="pdot" style={style({ "--c": project.color })} />
                    <span className="trunc">{project.name}</span>
                  </span>,
                )}
                {prop(
                  ic(Tag, 14),
                  "Labels",
                  <span
                    className="pillbtn"
                    style={{
                      flexWrap: "wrap",
                      height: "auto",
                      minHeight: 26,
                      padding: "3px 7px",
                    }}
                  >
                    <span className="lbl">
                      <i style={style({ "--c": KIND_COLOR[t.kind] })} />
                      {KIND_LABEL[t.kind]}
                    </span>
                    {t.rfc && (
                      <span className="lbl">
                        <i style={style({ "--c": "var(--gray)" })} />
                        RFC {t.rfc}
                      </span>
                    )}
                  </span>,
                )}
                {prop(
                  ic(GitBranch, 14),
                  "Blocked by",
                  <span className={`pillbtn ${detail.dependsOn.length ? "" : "empty"}`} style={{ height: "auto", minHeight: 26, flexWrap: "wrap" }}>
                    {detail.dependsOn.length ? (
                      detail.dependsOn.map((d) => (
                        <button key={d.id} type="button" className="row" style={{ gap: 6 }} onClick={() => onOpen(d.id)}>
                          <span
                            className="depchip mono"
                            style={{
                              fontSize: 11,
                              padding: "1px 5px",
                              borderRadius: 4,
                              background: "var(--surface-3)",
                            }}
                          >
                            {d.id}
                          </span>
                          <span className="trunc" style={{ maxWidth: 160 }}>
                            {d.title}
                          </span>
                        </button>
                      ))
                    ) : (
                      <>{ic(GitBranch, 13)}None</>
                    )}
                  </span>,
                )}
              </dl>

              <div className="dsec">
                <div className="dsec-h">
                  <h3 id="d-desc-l">Description</h3>
                </div>
                <div className="rte">
                  <div className="rte-body" role="textbox" aria-readonly aria-multiline aria-labelledby="d-desc-l">
                    <p>{detail.context}</p>
                    <h4>Done when</h4>
                    <ul>
                      {detail.doneWhen.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <h4>Out of scope</h4>
                    <ul>
                      {detail.outOfScope.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="dsec">
                <div className="dsec-h">
                  <h3>{kids.length ? "Tasks" : "Subtasks"}</h3>
                  <span className="cnt num">
                    {parts.done}/{parts.total}
                  </span>
                  {parts.total > 0 && (
                    <span style={{ width: 90, display: "flex" }}>
                      <ProgBar value={Math.round((parts.done / parts.total) * 100)} tone={parts.done === parts.total ? "green" : ""} />
                    </span>
                  )}
                </div>
                {parts.total === 0 && (
                  <p className="faint" style={{ fontSize: 13, margin: "6px 0" }}>
                    This task has no subtasks.
                  </p>
                )}
                {kids.map((k) => (
                  <div key={k.id} className={`subt ${k.status === "done" ? "done" : ""}`}>
                    <StatusIcon status={k.status} />
                    <button type="button" className="s" onClick={() => onOpen(k.id)}>
                      {k.title}
                    </button>
                    {k.holder && <ToolMark tool={k.holder.tool} size={20} />}
                    <button type="button" className="ibtn ibtn-xs x" onClick={() => onOpen(k.id)} aria-label="Open the task" tabIndex={-1}>
                      {ic(ChevronRight, 14)}
                    </button>
                  </div>
                ))}
                {t.subtasks.map((s) => (
                  <div key={s.id} className={`subt ${s.done ? "done" : ""} ${popped === s.id ? "fx-done" : ""}`}>
                    <SubCheck id={s.id} done={s.done} title={s.title} />
                    <button type="button" className="s" onClick={() => setSub(s.id)}>
                      {s.title}
                    </button>
                    <button type="button" className="ibtn ibtn-xs x" onClick={() => setSub(s.id)} aria-label="Open subtask details" tabIndex={-1}>
                      {ic(ChevronRight, 14)}
                    </button>
                  </div>
                ))}
              </div>

              {detail.questions.length > 0 && (
                <div className="dsec">
                  <div className="dsec-h">
                    <h3>Questions</h3>
                    <span className="cnt">{detail.questions.length}</span>
                  </div>
                  {detail.questions.map((q, i) => (
                    <div key={i} className="cmt">
                      <ToolMark tool={t.holder?.tool ?? "person"} size={24} />
                      <div className="body">
                        <div className="who">
                          <b>{t.holder ? TOOL_LABEL[t.holder.tool] : "Person"}</b>
                          <time>{timeAgo(q.askedAt, now)}</time>
                        </div>
                        <div className="txt">{q.text}</div>
                        {q.answer ? (
                          <div className="txt" style={{ marginTop: 6, color: "var(--ink-2)" }}>
                            <b>You</b> {q.answer}
                          </div>
                        ) : (
                          <span className="badge red" style={{ marginTop: 6 }}>
                            {ic(CircleAlert, 12)}Waiting for you
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="dsec" ref={tabSec}>
                <div className="tabs" style={{ marginBottom: 6 }} role="tablist">
                  {(
                    [
                      ["log", "Log", detail.log.length],
                      ["checks", "Checks", detail.checkRuns.length],
                      ["sessions", "Sessions", detail.sessions.length],
                      ["files", "Files", detail.writes.length + detail.appends.length],
                      ["memory", "Memory", detail.memory.length],
                    ] as [Tab, string, number][]
                  ).map(([k, n, c]) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={tab === k}
                      className={`tab ${tab === k ? "on" : ""}`}
                      onClick={() => {
                        setTab(k);
                        setTabbed(true);
                        setShown((n) => n + 1);
                      }}
                    >
                      {n}
                      <span className="cnt">{c}</span>
                    </button>
                  ))}
                </div>
                <div style={{ paddingTop: 8 }} className="flex flex-col gap-3">
                  {tab === "log" && <LogSection key={t.id} detail={detail} now={now} />}
                  {tab === "checks" && <ChecksSection task={t} runs={detail.checkRuns} />}
                  {tab === "sessions" && (
                    <>
                      <SessionsSection sessions={detail.sessions} now={now} />
                      <TimeBox timeIn={detail.timeIn} />
                    </>
                  )}
                  {tab === "files" && (
                    <>
                      <div className="kv" style={{ gridTemplateColumns: "112px minmax(0,1fr)" }}>
                        <dt>Writes</dt>
                        <dd className="col" style={{ alignItems: "flex-start" }}>
                          {detail.writes.map((p) => (
                            <span key={p} className="mono">
                              {p}
                            </span>
                          ))}
                        </dd>
                        <dt>Appends</dt>
                        <dd className="col" style={{ alignItems: "flex-start" }}>
                          {detail.appends.length ? (
                            detail.appends.map((p) => (
                              <span key={p} className="mono">
                                {p}
                              </span>
                            ))
                          ) : (
                            <span className="faint">Nothing</span>
                          )}
                        </dd>
                      </div>
                      <TreeBox task={t} detail={detail} />
                    </>
                  )}
                  {tab === "memory" &&
                    (detail.memory.length ? (
                      detail.memory.map((fact) => (
                        <div key={fact} className="act-line">
                          <span className="grow">{fact}</span>
                        </div>
                      ))
                    ) : (
                      <None>No fact of memory</None>
                    ))}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {pop.open?.key === "status" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          {PERSON_MOVES.map((s) => (
            <button key={s} type="button" className="mi" onClick={() => s !== t.status && onMove(t.id, s)}>
              <StatusIcon status={s} />
              {STATUS_LABEL[s]}
              {s === t.status && <span className="ck">{ic(CircleCheck, 14)}</span>}
            </button>
          ))}
        </Pop>
      )}
      {pop.open?.key === "more" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          <button type="button" className="mi" onClick={star}>
            {ic(Star, 15)}
            {starred ? "Remove from favorites" : "Add to favorites"}
          </button>
          <button type="button" className="mi" onClick={link}>
            {ic(Link, 15)}Copy link
          </button>
          {movable && (
            <>
              <div className="msep" />
              <button type="button" className="mi" onClick={() => onMove(t.id, t.status === "backlog" ? "ready" : "backlog")}>
                {ic(CircleDot, 15)}Move to {t.status === "backlog" ? "Ready" : "Backlog"}
              </button>
            </>
          )}
        </Pop>
      )}
    </>
  );
}
