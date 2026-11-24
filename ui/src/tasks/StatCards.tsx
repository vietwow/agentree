import { ArrowDownRight, ArrowUpRight, Triangle } from "lucide-react";
import type { ReactNode } from "react";
import type { Stats } from "../board/summary.ts";
import { timeAgo } from "../format/time.ts";

export type Card = {
  label: string;
  value: ReactNode;
  unit?: string;
  trend?: "up" | "down";
  lead?: string;
  note: string;
  tone: "good" | "warn" | "bad" | "neutral";
};

function cards(stats: Stats, now: Date): Card[] {
  const landedChange = stats.landedToday - stats.landedYesterday;
  return [
    {
      label: "In progress",
      value: stats.inProgress,
      unit: "tasks",
      lead: stats.stale > 0 ? `${stats.stale} stale` : undefined,
      note: stats.stale > 0 ? "no beat in 30 min" : "No stale claim",
      tone: stats.stale > 0 ? "warn" : "neutral",
    },
    {
      label: "In review",
      value: stats.inReview,
      unit: "tasks",
      lead: stats.reviewWaitingOverHour > 0 ? `${stats.reviewWaitingOverHour}` : undefined,
      note: stats.reviewWaitingOverHour > 0 ? "waiting over an hour" : "None waiting over an hour",
      tone: stats.reviewWaitingOverHour > 0 ? "warn" : "neutral",
    },
    {
      label: "Waiting for you",
      value: stats.waitingForOwner,
      unit: stats.waitingForOwner === 1 ? "question" : "questions",
      note: stats.oldestQuestion ? `Oldest asked ${timeAgo(stats.oldestQuestion, now)}` : "No open question",
      tone: stats.waitingForOwner > 0 ? "bad" : "neutral",
    },
    {
      label: "Landed today",
      value: stats.landedToday,
      trend: landedChange > 0 ? "up" : landedChange < 0 ? "down" : undefined,
      lead: landedChange === 0 ? undefined : `${landedChange > 0 ? "+" : ""}${landedChange}`,
      note: `vs ${stats.landedYesterday} yesterday`,
      tone: landedChange > 0 ? "good" : landedChange < 0 ? "bad" : "neutral",
    },
  ];
}

const LEAD_TONE = {
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-ink-2",
};

export function StatCards({ stats, now }: { stats: Stats; now: Date }) {
  return <SummaryCards cards={cards(stats, now)} />;
}

/** The summary cards at the head of a page: a label, a number and a line under it. */
export function SummaryCards({ cards }: { cards: Card[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 @xl:grid-cols-2 @4xl:grid-cols-4">
      {cards.map((card) => (
        <section key={card.label} className="flex min-w-0 flex-col rounded-xl border border-line bg-tray p-1">
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-float bg-lift px-3.5 pt-3 pb-3.5 shadow-lift">
            <h2 className="truncate text-2xs leading-4 font-semibold tracking-[0.06em] text-ink-2 uppercase">{card.label}</h2>
            <p className="flex items-baseline gap-1.5">
              <span className="text-[28px] leading-8 font-semibold tracking-tight tabular-nums">{card.value}</span>
              {card.trend === "up" && <ArrowUpRight size={16} aria-label="Up" className="self-start text-good" />}
              {card.trend === "down" && <ArrowDownRight size={16} aria-label="Down" className="self-start text-bad" />}
              {card.unit && <span className="text-xs leading-4 text-ink-4">{card.unit}</span>}
            </p>
          </div>
          <p className="flex min-w-0 items-center gap-1.5 px-2.5 pt-2 pb-1.5 text-xs leading-4 text-ink-4">
            {card.lead && (
              <span className={`inline-flex items-center gap-1 font-semibold ${LEAD_TONE[card.tone]}`}>
                {card.tone === "good" && <Triangle size={8} aria-hidden className="fill-current" />}
                {card.tone === "bad" && card.trend === "down" && <Triangle size={8} aria-hidden className="rotate-180 fill-current" />}
                {card.lead}
              </span>
            )}
            <span title={card.note} className={`truncate ${!card.lead && card.tone !== "neutral" ? LEAD_TONE[card.tone] : ""}`}>
              {card.note}
            </span>
          </p>
        </section>
      ))}
    </div>
  );
}
