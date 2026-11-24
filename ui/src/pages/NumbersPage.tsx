import { CalendarDays, ListTodo, Wrench } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { fixtureDetail } from "../board/fixtures.ts";
import { TOOL_LABEL, type Session, type Task, type Tokens, type Tool } from "../board/task.ts";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { ProgressBar } from "../design/components/ProgressBar.tsx";
import { Segmented } from "../design/components/Segmented.tsx";
import { SummaryCards } from "../design/components/SummaryCards.tsx";
import { shortDate } from "../design/format/time.ts";
import { ToolMark } from "../ui/ToolMark.tsx";

type By = "tool" | "task" | "day";

const BYS: [By, string, typeof Wrench][] = [
  ["tool", "By tool", Wrench],
  ["task", "By task", ListTodo],
  ["day", "By day", CalendarDays],
];

/** A sum of sessions: what was reported, and how many sessions reported nothing. */
type Sum = { sessions: number; tokens: Tokens; cost: number; build: number; review: number; unknown: number; why: Set<string> };

const zero = (): Sum => ({
  sessions: 0,
  tokens: { input: 0, cachedInput: 0, output: 0, reasoning: 0 },
  cost: 0,
  build: 0,
  review: 0,
  unknown: 0,
  why: new Set(),
});

function add(s: Sum, x: Session) {
  s.sessions++;
  if (!x.tokens) {
    s.unknown++;
    if (x.unknown) s.why.add(x.unknown);
    return;
  }
  s.tokens.input += x.tokens.input;
  s.tokens.cachedInput += x.tokens.cachedInput;
  s.tokens.output += x.tokens.output;
  s.tokens.reasoning += x.tokens.reasoning;
  const c = x.costUsd ?? 0;
  s.cost += c;
  s[x.role] += c;
}

const all = (t: Tokens) => t.input + t.cachedInput + t.output + t.reasoning;
const num = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const usd = (n: number) => `$${n.toFixed(2)}`;

type Props = { tasks: Task[]; now: Date; onOpenTask: (id: string) => void };

/** The tokens and cost the tools report, summed over tools, tasks and days; never estimated. */
export function NumbersPage({ tasks, now, onOpenTask }: Props) {
  const [by, setBy] = useState<By>("tool");
  const sessions = useMemo(() => tasks.flatMap((t) => fixtureDetail(t, tasks, now).sessions.map((s) => ({ t, s }))), [tasks, now]);

  const total = zero();
  sessions.forEach(({ s }) => add(total, s));

  const rows = useMemo(() => {
    const m = new Map<string, { key: string; tool?: Tool; task?: Task; day?: Date; sum: Sum }>();
    for (const { t, s } of sessions) {
      const day = new Date(s.startedAt.getFullYear(), s.startedAt.getMonth(), s.startedAt.getDate());
      const key = by === "tool" ? s.tool : by === "task" ? t.id : String(day.getTime());
      const r = m.get(key) ?? { key, tool: s.tool, task: t, day, sum: zero() };
      add(r.sum, s);
      m.set(key, r);
    }
    const list = [...m.values()];
    return by === "day" ? list.sort((a, b) => b.day!.getTime() - a.day!.getTime()) : list.sort((a, b) => b.sum.cost - a.sum.cost);
  }, [sessions, by]);
  const top = Math.max(...rows.map((r) => r.sum.cost), 0.01);

  const label = (r: (typeof rows)[number]) =>
    by === "tool" ? (
      <span className="flex items-center gap-2">
        <ToolMark tool={r.tool} size={20} />
        {TOOL_LABEL[r.tool!]}
      </span>
    ) : by === "task" ? (
      <span className="flex items-center gap-2 cursor-pointer" data-opens-task onClick={() => onOpenTask(r.task!.id)}>
        <span className="key mono faint">{r.task!.id}</span>
        <span className="trunc">{r.task!.title}</span>
      </span>
    ) : (
      shortDate(r.day!, now)
    );

  return (
    <Page layout="flush">
      <PageHeader title="Numbers">
        The tokens and cost each tool reports, summed over tools, tasks and days. What a tool does not report is not known, never estimated.
      </PageHeader>
      <div className="@container pt-0 px-(--gutter) pb-4">
        <SummaryCards
          cards={[
            {
              label: "Cost reported",
              value: usd(total.cost),
              note: `building ${usd(total.build)} · reviewing ${usd(total.review)}`,
              tone: "neutral",
            },
            {
              label: "Tokens reported",
              value: num(all(total.tokens)),
              note: `output ${num(total.tokens.output)} · reasoning ${num(total.tokens.reasoning)}`,
              tone: "neutral",
            },
            {
              label: "Sessions",
              value: total.sessions,
              note: `over ${new Set(sessions.map((x) => x.t.id)).size} tasks`,
              tone: "neutral",
            },
            {
              label: "Not known",
              value: total.unknown,
              unit: "sessions",
              note: "whose tool reports no use",
              tone: total.unknown ? "bad" : "neutral",
            },
          ]}
        />
      </div>
      <div className="toolbar" role="toolbar">
        <Segmented label="Sum by" value={by} onChange={setBy} collapse options={BYS.map(([value, label, icon]) => ({ value, label, icon }))} />
        <span className="flex-1" />
        <span className="faint text-(length:--text-xs)">Costs are the tools' own estimates, as they report them.</span>
      </div>
      <div className="tbl-wrap flex-initial">
        <table className="tbl w-full min-w-245" aria-label="Numbers">
          <thead>
            <tr>
              {[
                by === "tool" ? "Tool" : by === "task" ? "Task" : "Day",
                "Sessions",
                "Input",
                "Cached input",
                "Output",
                "Reasoning",
                "Cost",
                "",
                "Not known",
              ].map((h, i) => (
                <th key={i} className={i === 0 ? "sticky w-80" : i === 7 ? "w-35" : ""} scope="col">
                  <div className="thi">{h}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.key}>
                <tr>
                  <td className="sticky">{label(r)}</td>
                  <td className="num">{r.sum.sessions}</td>
                  {r.sum.unknown === r.sum.sessions ? (
                    <td colSpan={5} className="faint" title={[...r.sum.why].join(" · ")}>
                      Not known: {[...r.sum.why].join(" · ")}
                    </td>
                  ) : (
                    <>
                      <td className="num">{num(r.sum.tokens.input)}</td>
                      <td className="num">{num(r.sum.tokens.cachedInput)}</td>
                      <td className="num">{num(r.sum.tokens.output)}</td>
                      <td className="num">{num(r.sum.tokens.reasoning)}</td>
                      <td className="num font-medium">
                        {usd(r.sum.cost)}
                        {r.sum.unknown > 0 && <span className="faint"> + not known</span>}
                      </td>
                    </>
                  )}
                  <td>
                    {r.sum.unknown < r.sum.sessions && (
                      <div className="flex">
                        <ProgressBar value={Math.round((r.sum.cost / top) * 100)} />
                      </div>
                    )}
                  </td>
                  <td className={`num ${r.sum.unknown ? "text-warn" : "text-ink-3"}`} title={[...r.sum.why].join(" · ") || undefined}>
                    {r.sum.unknown ? `${r.sum.unknown} of ${r.sum.sessions}` : "None"}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {total.why.size > 0 && (
        <div className="pt-3 px-(--gutter) pb-6 text-(length:--text-xs) text-ink-3">
          {[...total.why].map((w) => (
            <p className="my-0.5 mx-0" key={w}>
              Not known: {w}
            </p>
          ))}
        </div>
      )}
    </Page>
  );
}
