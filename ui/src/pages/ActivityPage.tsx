import { Activity, TreeDeciduous } from "lucide-react";
import { useState } from "react";
import type { ActivityEntry, ActivityKind } from "../board/activity.ts";
import { TOOL_LABEL, type Task, type Tool } from "../board/task.ts";
import { Ago } from "../design/components/Ago.tsx";
import { Empty } from "../design/components/Empty.tsx";
import { ic } from "../design/components/icon.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Segmented } from "../design/components/Segmented.tsx";
import { Select } from "../design/components/Select.tsx";
import { dayBucket } from "../design/format/time.ts";
import { ToolMark } from "../ui/ToolMark.tsx";
import { style } from "./parts.tsx";

type Who = ActivityEntry["who"];

const FILTERS: ["all" | ActivityKind, string][] = [
  ["all", "All"],
  ["status", "Status changes"],
  ["question", "Questions"],
  ["check", "Checks"],
];

const nameOf = (who: Who) => (who === "person" ? "You" : who === "daemon" ? "agentree" : TOOL_LABEL[who]);

function Avatar({ who }: { who: Who }) {
  if (who === "daemon")
    return (
      <span className="av sm [--c:var(--gray)]" aria-label="agentree">
        {ic(TreeDeciduous, 11)}
      </span>
    );
  return <ToolMark tool={who as Tool} size={20} />;
}

type Props = { entries: ActivityEntry[]; tasks: Task[]; now: Date; onOpenTask: (id: string) => void };

export function ActivityPage({ entries, tasks, now, onOpenTask }: Props) {
  const [filter, setFilter] = useState<"all" | ActivityKind>("all");
  const [who, setWho] = useState<"all" | Who>("all");
  const titles = new Map(tasks.map((t) => [t.id, t.title]));
  const people = [...new Set(entries.map((e) => e.who))];

  const shown = entries.filter((e) => (filter === "all" || e.kind === filter) && (who === "all" || e.who === who));
  const order = new Map(shown.map((e, i) => [e, i]));
  const days = new Map<string, ActivityEntry[]>();
  for (const e of shown) {
    const key = dayBucket(e.at, now);
    days.set(key, [...(days.get(key) ?? []), e]);
  }

  return (
    <Page layout="narrow">
      <PageHeader title="Activity">Everything that's changed across the board.</PageHeader>
      <div className="row gap-2 mb-1.5 flex-wrap">
        <Segmented label="Show" value={filter} onChange={setFilter} options={FILTERS.map(([value, label]) => ({ value, label }))} />
        <Select
          value={who}
          options={[["all", "Everyone"] as const, ...people.map((p) => [p, nameOf(p)] as const)]}
          onChange={setWho}
          label="Filter by worker"
          size="sm"
        />
      </div>
      {shown.length ? (
        [...days].map(([day, list]) => (
          <div key={`${filter}:${who}:${day}`}>
            <div className="day-h fx-stagger" style={style({ "--d": `${Math.min((order.get(list[0]!) ?? 0) * 30, 450)}ms` })}>
              {day}
            </div>
            <div className="feed lined">
              {list.map((e, i) => (
                <div
                  key={`${e.task}-${e.at.getTime()}-${i}`}
                  className="fitem fx-stagger"
                  style={style({ "--d": `${Math.min((order.get(e) ?? 0) * 30, 450)}ms` })}
                >
                  <Avatar who={e.who} />
                  <div className="grow">
                    <b>{nameOf(e.who)}</b> <span className="muted">{e.text.charAt(0).toLowerCase() + e.text.slice(1)}</span>{" "}
                    <span className="obj" data-opens-task onClick={() => onOpenTask(e.task)}>
                      {titles.get(e.task)}
                    </span>
                  </div>
                  <Ago at={e.at} now={now} />
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <Empty icon={Activity} title="No activity yet" text="Changes to tasks will appear here." />
      )}
    </Page>
  );
}
