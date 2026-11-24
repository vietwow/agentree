import {
  ChevronRight,
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
import { send } from "../board/daemon.ts";
import { toggleStar, useStars } from "../board/favorites.ts";
import type { Project } from "../board/projects.ts";
import { isStale, openQuestions, partsOf } from "../board/summary.ts";
import { KIND_LABEL, STATUS_LABEL, TOOL_LABEL, type Status, type Task, type TaskDetail } from "../board/task.ts";
import { useTicks } from "../board/ticks.ts";
import { Ago } from "../design/components/Ago.tsx";
import { Button, IconButton } from "../design/components/Button.tsx";
import { ic } from "../design/components/icon.tsx";
import { KeyValues } from "../design/components/KeyValues.tsx";
import { MenuItem, MenuSeparator } from "../design/components/Menu.tsx";
import { Pop, usePop } from "../design/components/Pop.tsx";
import { ProgressBar } from "../design/components/ProgressBar.tsx";
import { Tabs } from "../design/components/Tabs.tsx";
import { copy, toast } from "../design/components/toast.ts";
import { timeAgo } from "../design/format/time.ts";
import { reducedMotion } from "../design/motion.ts";
import { style } from "../pages/parts.tsx";
import { KIND_COLOR } from "../ui/colors.ts";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { DiffReview } from "./DiffReview.tsx";
import { ChecksSection, LogSection, None, SessionsSection, TimeBox, TreeBox } from "./DrawerSections.tsx";
import { SubCheck } from "./SubCheck.tsx";
import { SubtaskView } from "./SubtaskView.tsx";

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
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  }, [shown]);

  const closeSub = useCallback(() => setSub(undefined), []);
  const star = () => toast(toggleStar(`task:${t.id}`) ? "Added to favorites" : "Removed from favorites", { ms: 1800 });
  const link = () => copy(`${location.origin}/project/${project.id}/task/${t.id}`);
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
          <button type="button" className="pillbtn text-sm">
            <span className="pdot" style={style({ "--c": project.color })} />
            {project.name}
          </button>
          <span className="faint">/</span>
          <span className="mono faint px-1.5 py-0 text-(length:--text-xs)">{t.id}</span>
          <span className="flex-1" />
          <IconButton
            label="Favorite"
            size="sm"
            onClick={star}
            data-tip={starred ? "Unfavorite" : "Favorite"}
            aria-pressed={starred}
            className={starred ? "text-warn" : ""}
          >
            {ic(Star, 15)}
          </IconButton>
          <IconButton label="Copy link" size="sm" tip onClick={link}>
            {ic(Link, 15)}
          </IconButton>
          <IconButton label="Toggle full page" size="sm" className="hide-m" onClick={onToggleFull} data-tip={full ? "Side panel" : "Full page"}>
            {ic(full ? Minimize2 : Maximize2, 15)}
          </IconButton>
          <IconButton label="More" size="sm" onClick={pop.toggle("more")}>
            {ic(Ellipsis, 15)}
          </IconButton>
          <IconButton label="Close" size="sm" onClick={onClose} data-tip="Close  Esc">
            {ic(X, 16)}
          </IconButton>
        </div>

        <div className="drawer-b" ref={body} key={t.id}>
          {sub ? (
            <SubtaskView task={t} id={sub} popped={popped} onOpen={setSub} onClose={closeSub} />
          ) : (
            <>
              {t.status === "done" && t.landedAt ? (
                <div className="alert ok mb-3">
                  {ic(CircleCheck, 15)}
                  <span>Landed on main {timeAgo(t.landedAt, now)}.</span>
                </div>
              ) : stale ? (
                <div className="alert danger mb-3">
                  {ic(Clock, 15)}
                  <span className="flex-1">No beat from its worker in over 30 minutes.</span>
                  <Button
                    size="sm"
                    onClick={() =>
                      void send(`/api/projects/${project.id}/tasks/${t.id}/release`, {
                        why: "Released by the owner: no beat from its worker in over 30 minutes.",
                      })
                    }
                  >
                    Release it
                  </Button>
                </div>
              ) : asking > 0 ? (
                <div className="alert warn mb-3">
                  {ic(MessageCircleQuestion, 15)}
                  <span>{asking === 1 ? "A question waits for your answer." : `${asking} questions wait for your answer.`}</span>
                </div>
              ) : null}

              <div className="ttl-edit" role="heading" aria-level={3}>
                {t.title}
              </div>

              <KeyValues columns={full ? 2 : 1} className="mt-3">
                {prop(
                  ic(CircleDot, 14),
                  "Status",
                  <button
                    type="button"
                    className={`pillbtn ${movable ? "" : "cursor-default"}`}
                    onClick={movable ? pop.toggle("status") : undefined}
                    aria-label={`Status: ${STATUS_LABEL[t.status]}`}
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
                  <span className="pillbtn flex-wrap h-auto min-h-6.5 py-0.75 px-1.75">
                    <span className="lbl">
                      <i style={style({ "--c": KIND_COLOR[t.kind] })} />
                      {KIND_LABEL[t.kind]}
                    </span>
                    {t.rfc && (
                      <span className="lbl">
                        <i className="[--c:var(--gray)]" />
                        RFC {t.rfc}
                      </span>
                    )}
                  </span>,
                )}
                {prop(
                  ic(GitBranch, 14),
                  "Blocked by",
                  <span className={`pillbtn ${detail.dependsOn.length ? "" : "empty"} h-auto min-h-6.5 flex-wrap`}>
                    {detail.dependsOn.length ? (
                      detail.dependsOn.map((d) => (
                        <button key={d.id} type="button" className="flex items-center gap-1.5" onClick={() => onOpen(d.id)}>
                          <span className="depchip mono rounded-xs bg-surface-3 px-1.25 py-0.25 text-2xs">{d.id}</span>
                          <span className="trunc max-w-40">{d.title}</span>
                        </button>
                      ))
                    ) : (
                      <>{ic(GitBranch, 13)}None</>
                    )}
                  </span>,
                )}
              </KeyValues>

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

              {t.status === "review" && <DiffReview project={project.id} task={t.id} />}

              <div className="dsec">
                <div className="dsec-h">
                  <h3>{kids.length ? "Tasks" : "Subtasks"}</h3>
                  <span className="cnt num">
                    {parts.done}/{parts.total}
                  </span>
                  {parts.total > 0 && (
                    <span className="w-22.5 flex">
                      <ProgressBar value={Math.round((parts.done / parts.total) * 100)} tone={parts.done === parts.total ? "good" : undefined} />
                    </span>
                  )}
                </div>
                {parts.total === 0 && <p className="faint mx-0 my-1.5 text-(length:--text-base)">This task has no subtasks.</p>}
                {kids.map((k) => (
                  <div key={k.id} className={`subt ${k.status === "done" ? "done" : ""}`}>
                    <StatusIcon status={k.status} />
                    <button type="button" className="s" onClick={() => onOpen(k.id)}>
                      {k.title}
                    </button>
                    {k.holder && <ToolMark tool={k.holder.tool} size={20} />}
                    <IconButton label="Open the task" size="xs" className="x" onClick={() => onOpen(k.id)} tabIndex={-1}>
                      {ic(ChevronRight, 14)}
                    </IconButton>
                  </div>
                ))}
                {t.subtasks.map((s) => (
                  <div key={s.id} className={`subt ${s.done ? "done" : ""} ${popped === s.id ? "fx-done" : ""}`}>
                    <SubCheck id={s.id} done={s.done} title={s.title} />
                    <button type="button" className="s" onClick={() => setSub(s.id)}>
                      {s.title}
                    </button>
                    <IconButton label="Open subtask details" size="xs" className="x" onClick={() => setSub(s.id)} tabIndex={-1}>
                      {ic(ChevronRight, 14)}
                    </IconButton>
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
                          <Ago at={q.askedAt} now={now} />
                        </div>
                        <div className="txt">{q.text}</div>
                        {q.answer ? (
                          <div className="txt mt-1.5 text-ink-2">
                            <b>You</b> {q.answer}
                          </div>
                        ) : (
                          <Answer project={project.id} task={t.id} question={i + 1} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="dsec" ref={tabSec}>
                <Tabs
                  label="Task details"
                  className="mb-1.5"
                  value={tab}
                  onChange={(k) => {
                    setTab(k);
                    setTabbed(true);
                    setShown((n) => n + 1);
                  }}
                  tabs={[
                    { value: "log", label: "Log", count: detail.log.length },
                    { value: "checks", label: "Checks", count: detail.checkRuns.length },
                    { value: "sessions", label: "Sessions", count: detail.sessions.length },
                    { value: "files", label: "Files", count: detail.writes.length + detail.appends.length },
                    { value: "memory", label: "Memory", count: detail.memory.length },
                  ]}
                />
                <div className="flex flex-col gap-3 pt-2">
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
                      <KeyValues>
                        <dt>Writes</dt>
                        <dd className="flex flex-col items-start">
                          {detail.writes.map((p) => (
                            <span key={p} className="mono">
                              {p}
                            </span>
                          ))}
                        </dd>
                        <dt>Appends</dt>
                        <dd className="flex flex-col items-start">
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
                      </KeyValues>
                      <TreeBox task={t} detail={detail} />
                    </>
                  )}
                  {tab === "memory" &&
                    (detail.memory.length ? (
                      detail.memory.map((fact) => (
                        <div key={fact} className="act-line">
                          <span className="flex-1 min-w-0">{fact}</span>
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
            <MenuItem key={s} lead={<StatusIcon status={s} />} checked={s === t.status} onClick={() => s !== t.status && onMove(t.id, s)}>
              {STATUS_LABEL[s]}
            </MenuItem>
          ))}
        </Pop>
      )}
      {pop.open?.key === "more" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close}>
          <MenuItem icon={Star} onClick={star}>
            {starred ? "Remove from favorites" : "Add to favorites"}
          </MenuItem>
          <MenuItem icon={Link} onClick={link}>
            Copy link
          </MenuItem>
          {movable && (
            <>
              <MenuSeparator />
              <MenuItem icon={CircleDot} onClick={() => onMove(t.id, t.status === "backlog" ? "ready" : "backlog")}>
                Move to {t.status === "backlog" ? "Ready" : "Backlog"}
              </MenuItem>
            </>
          )}
        </Pop>
      )}
    </>
  );
}

/** The owner's answer to a question that waits: written under it on the card by the daemon. */
function Answer({ project, task, question }: { project: string; task: string; question: number }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const answer = async () => {
    setBusy(true);
    await send(`/api/projects/${project}/tasks/${task}/answer`, { question, text });
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-1.5 mt-1.5">
      <textarea
        className="textarea"
        value={text}
        placeholder="Your answer"
        aria-label={`Answer to question ${question}`}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex">
        <Button variant="primary" size="sm" disabled={busy || text.trim() === ""} onClick={() => void answer()}>
          Answer
        </Button>
      </div>
    </div>
  );
}
