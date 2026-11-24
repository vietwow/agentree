import type { Stats } from "../board/summary.ts";
import { SummaryCards, type Card } from "../design/components/SummaryCards.tsx";
import { plural } from "../design/format/text.ts";
import { timeAgo } from "../design/format/time.ts";

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
      unit: plural(stats.waitingForOwner, "question"),
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

export function StatCards({ stats, now }: { stats: Stats; now: Date }) {
  return <SummaryCards cards={cards(stats, now)} />;
}
