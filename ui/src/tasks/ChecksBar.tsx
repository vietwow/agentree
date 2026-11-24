import type { Checks } from "../board/task.ts";

const ORDINAL = new Intl.PluralRules("en", { type: "ordinal" });
const SUFFIX: Partial<Record<Intl.LDMLPluralRule, string>> = { one: "st", two: "nd", few: "rd" };

function ordinal(place: number): string {
  return `${place}${SUFFIX[ORDINAL.select(place)] ?? "th"}`;
}

function caption(checks: Checks): string {
  if (checks.state === "queued") return `queued, ${ordinal(checks.queuePlace ?? 1)}`;
  if (checks.state === "running") return "running";
  if (checks.failed > 0) return `${checks.failed} failed`;
  return "passed";
}

const TONE = {
  good: { bar: "bg-teal", text: "text-ink" },
  warn: { bar: "bg-warn", text: "text-warn" },
  bad: { bar: "bg-bad", text: "text-bad" },
};

export function ChecksBar({ checks }: { checks: Checks }) {
  if (checks.state === "none" || checks.total === 0) {
    return <span className="text-xs leading-4 text-ink-4">Not run</span>;
  }
  const done = checks.passed + checks.failed;
  const tone = checks.failed > 0 ? TONE.bad : checks.state === "finished" ? TONE.good : TONE.warn;
  const label = `${checks.passed} of ${checks.total} checks passed, ${caption(checks)}`;

  return (
    <div className="flex min-w-0 items-center gap-2.5" title={label}>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={checks.total}
        aria-valuenow={checks.passed}
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-surface-3"
      >
        <span
          className={`block h-full origin-left rounded-full motion-safe:animate-[growX_0.8s_0.12s_var(--ease)_both] ${tone.bar}`}
          style={{ width: `${(done / checks.total) * 100}%` }}
        />
      </div>
      <span className={`text-[13px] leading-5 font-semibold whitespace-nowrap tabular-nums ${tone.text}`}>
        {checks.passed}
        <span className="font-normal text-ink-4"> / {checks.total}</span>
      </span>
    </div>
  );
}
