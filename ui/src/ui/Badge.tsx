import type { ReactNode } from "react";

const TONES = {
  neutral: "bg-fill text-ink-soft dark:ring-1 dark:ring-line-strong",
  good: "bg-good-soft text-good dark:ring-1 dark:ring-good/30",
  warn: "bg-warn-soft text-warn dark:ring-1 dark:ring-warn/30",
  bad: "bg-bad-soft text-bad dark:ring-1 dark:ring-bad/30",
  info: "bg-info-soft text-info dark:ring-1 dark:ring-info/30",
};

export type Tone = keyof typeof TONES;

export function Badge({
  tone = "neutral",
  icon,
  children,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[11px] leading-4 font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}
