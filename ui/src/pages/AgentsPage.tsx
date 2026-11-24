import { Check, Clock, CornerDownRight, Minus, Network, Plug, Webhook } from "lucide-react";
import { useState } from "react";
import { board } from "../board/daemon.ts";
import type { AgentSession, AgentState } from "../board/model.ts";
import { TOOL_LABEL, TOOLS, type Task, type Tool } from "../board/task.ts";
import { Ago } from "../design/components/Ago.tsx";
import { Badge, type Tone } from "../design/components/Badge.tsx";
import { GroupHeader } from "../design/components/GroupHeader.tsx";
import { ic } from "../design/components/icon.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Panel } from "../design/components/Panel.tsx";
import { SummaryCards } from "../design/components/SummaryCards.tsx";
import { count, plural } from "../design/format/text.ts";
import { ToolMark } from "../ui/ToolMark.tsx";
import { style } from "./parts.tsx";

const COLS = "minmax(280px,1fr) 170px minmax(220px,1.2fr) 130px 110px 140px";
const ROW_INSET = 44;

const STATE: Record<AgentState, { label: string; tone: Tone }> = {
  working: { label: "Working", tone: "accent" },
  checking: { label: "Checks running", tone: "warn" },
  reviewing: { label: "Reviewing", tone: "accent" },
  asking: { label: "Asking you", tone: "violet" },
  stale: { label: "No beat", tone: "bad" },
  ended: { label: "Ended", tone: "neutral" },
};

type Props = {
  tasks: Task[];
  now: Date;
  onOpenTask: (id: string) => void;
  onNotBuilt: (what: string) => void;
};

/** The sessions of each tool and the subagents they started, as the tools' hooks and their calls of the board tell them. */
export function AgentsPage({ tasks, now, onOpenTask, onNotBuilt }: Props) {
  const { sessions, tools } = board();
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const title = (id: string) => tasks.find((t) => t.id === id)?.title ?? id;
  const live = sessions.filter((s) => s.state !== "ended");
  const subs = live.flatMap((s) => s.subagents.filter((a) => a.state !== "ended"));
  // Each tool's sessions: those that hold a task or started subagents first, then by their last beat.
  const busy = (s: AgentSession) => (s.task || s.subagents.length ? 0 : 1);
  const byTool = TOOLS.filter((tool) => sessions.some((s) => s.tool === tool)).map((tool) => ({
    tool,
    rows: sessions.filter((s) => s.tool === tool).sort((a, b) => busy(a) - busy(b) || b.beat.getTime() - a.beat.getTime()),
  }));

  const badge = (state: AgentState) => (
    <Badge tone={STATE[state].tone} dot>
      {STATE[state].label}
    </Badge>
  );
  const taskCell = (id?: string) =>
    id ? (
      <span className="flex items-center gap-2 min-w-0" data-opens-task onClick={() => onOpenTask(id)}>
        <span className="key mono">{id}</span>
        <span className="trunc obj cursor-pointer">{title(id)}</span>
      </span>
    ) : (
      <span className="faint">Coordinating</span>
    );

  const row = (s: AgentSession) => (
    <div key={s.id} className="contents">
      <div className={`trow ${s.state === "ended" ? "opacity-60" : ""}`} style={{ ...style({ "--cols": COLS }), paddingLeft: ROW_INSET }}>
        <div className="ttl cursor-default">
          <ToolMark tool={s.tool} size={20} />
          <span className="tt">
            {TOOL_LABEL[s.tool]} <span className="mono faint">{s.id}</span>
          </span>
          {s.subagents.length > 0 && (
            <span className="meta-mini">
              {ic(Network, 11)}
              {s.subagents.length}
            </span>
          )}
        </div>
        <div className="c-meta min-w-0 overflow-hidden">
          <span className="trunc" title={s.by ? `Started headless by ${s.by}` : undefined}>
            {s.started === "owner" ? "By you" : "Headless"}
            {s.by && <span className="faint"> · from {s.by.split(" ").at(-1)}</span>}
          </span>
        </div>
        <div className="c-meta min-w-0 overflow-hidden">{taskCell(s.task)}</div>
        <div className="c-meta">{badge(s.state)}</div>
        <div className="c-meta mono faint">{s.model}</div>
        <div className="c-meta">
          <span className={`flex items-center gap-1.25 whitespace-nowrap ${s.state === "stale" ? "text-bad" : "text-ink-3"}`}>
            {ic(Clock, 13)}
            <Ago at={s.ended ?? s.beat} now={now} />
          </span>
        </div>
      </div>
      {s.subagents.length > 0 && (
        <div className="subrows">
          {s.subagents.map((a) => (
            <div
              key={`${a.kind}-${a.task}`}
              className={`trow min-h-8 bg-transparent ${a.state === "ended" ? "opacity-60" : ""}`}
              style={{
                ...style({ "--cols": COLS }),
                paddingLeft: ROW_INSET + 30,
              }}
            >
              <div className="ttl cursor-default text-sm">
                <span className="flex items-center gap-2 faint">{ic(CornerDownRight, 13)}</span>
                <span className="mono text-(length:--text-xs)">{a.kind}</span>
              </div>
              <div className="c-meta faint">Subagent</div>
              <div className="c-meta min-w-0 overflow-hidden">{taskCell(a.task)}</div>
              <div className="c-meta">{badge(a.state)}</div>
              <div className="c-meta mono faint">{s.model}</div>
              <div className="c-meta">
                <span className="flex items-center faint gap-1.25 whitespace-nowrap">
                  {ic(Clock, 13)}
                  <Ago at={a.ended ?? a.since} now={now} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const mark = (on: boolean) => <span className={`flex ${on ? "text-good" : "text-ink-4"}`}>{ic(on ? Check : Minus, 14)}</span>;

  return (
    <Page layout="flush" className="overflow-y-auto">
      <PageHeader title="Agents">
        The sessions of each tool and the subagents they start. agentree starts none of them; it follows their calls of the board and the tools'
        hooks.
      </PageHeader>
      <div className="@container pt-0 px-(--gutter) pb-4 shrink-0">
        <SummaryCards
          cards={[
            {
              label: "Sessions",
              value: live.length,
              unit: plural(live.length, "session"),
              note: `over ${count(new Set(live.map((s) => s.tool)).size, "tool")}`,
              tone: "neutral",
            },
            {
              label: "Subagents",
              value: subs.length,
              note: `${count(subs.filter((a) => a.kind === "agentree-worker").length, "worker")} · ${count(subs.filter((a) => a.kind === "agentree-reviewer").length, "reviewer")}`,
              tone: "neutral",
            },
            {
              label: "No beat",
              value: live.filter((s) => s.state === "stale").length,
              unit: plural(live.filter((s) => s.state === "stale").length, "session"),
              note: "in over 30 minutes",
              tone: live.some((s) => s.state === "stale") ? "bad" : "neutral",
            },
            {
              label: "Review their own",
              value: tools.filter((t) => t.reviewsOwn).length,
              note: `of ${count(tools.length, "tool")}, by your switch`,
              tone: "neutral",
            },
          ]}
        />
      </div>

      <div className="list-wrap shrink-0 pb-0">
        <div className="tlist" role="table" aria-label="Sessions">
          <div className="thead" style={{ ...style({ "--cols": COLS }), paddingLeft: ROW_INSET }} role="row">
            <div>Session</div>
            <div>Started</div>
            <div>Task</div>
            <div>State</div>
            <div>Model</div>
            <div>Last beat</div>
          </div>
          {byTool.map((g) => (
            <div key={g.tool} className="contents">
              <GroupHeader
                name={TOOL_LABEL[g.tool]}
                count={g.rows.length}
                open={!closed[g.tool]}
                onToggle={() => setClosed((now) => ({ ...now, [g.tool]: !now[g.tool] }))}
                lead={<ToolMark tool={g.tool} size={20} />}
              />
              {!closed[g.tool] && g.rows.map(row)}
            </div>
          ))}
        </div>
      </div>

      <div className="pt-5 px-(--gutter) pb-8 shrink-0">
        <Panel title="The tools" note="set up by agentree init">
          <div className="tbl-wrap border-0">
            <table className="tbl w-full" aria-label="The tools">
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>
                    <span className="flex items-center gap-1.25">{ic(Webhook, 13)}Hooks</span>
                  </th>
                  <th>
                    <span className="flex items-center gap-1.25">{ic(Plug, 13)}MCP</span>
                  </th>
                  <th>Worker and reviewer</th>
                  <th>Reports its use</th>
                  <th>May review its own tasks</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.tool}>
                    <td>
                      <span className="flex items-center gap-2">
                        <ToolMark tool={t.tool as Tool} size={20} />
                        {TOOL_LABEL[t.tool]}
                      </span>
                    </td>
                    <td>
                      {t.hooks.length ? (
                        <span className="flex items-center gap-1 flex-wrap">
                          {t.hooks.map((h) => (
                            <span key={h} className="lbl mono text-2xs">
                              {h}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="faint">None</span>
                      )}
                    </td>
                    <td>{mark(t.mcp)}</td>
                    <td>{mark(t.definitions)}</td>
                    <td className={t.reportsUse === "full" ? "" : "faint"}>
                      {t.reportsUse === "full" ? "Tokens and cost" : t.reportsUse === "model only" ? "Its model only" : "Nothing"}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        className="toggle"
                        checked={t.reviewsOwn}
                        onChange={() => onNotBuilt("Changing a tool's switch")}
                        aria-label={`${TOOL_LABEL[t.tool]} may review its own tasks`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </Page>
  );
}
