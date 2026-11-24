const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const absolute = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

export function timeAgo(at: Date, now: Date): string {
  const elapsed = now.getTime() - at.getTime();
  for (const [unit, size] of STEPS) {
    if (elapsed >= size) return relative.format(-Math.floor(elapsed / size), unit);
  }
  return relative.format(0, "minute");
}

export function fullTime(at: Date): string {
  return absolute.format(at);
}

/** A span as its two largest units: "2 d 4 h", "3 h 12 min", "45 s". */
export function duration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}
