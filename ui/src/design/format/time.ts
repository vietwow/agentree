/*
 * Times as the UI writes them. A relative time has two forms, each with its
 * place: the short one (`ago`, "5m ago") in table cells, cards and compact
 * rows, the long one (`timeAgo`, "5 minutes ago") in sentences and in the
 * tooltip of a short one. `<Ago>` in design/components draws the short form
 * with the long one as its tooltip.
 */

const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const absolute = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", DAY],
  ["hour", HOUR],
  ["minute", MINUTE],
];

/**
 * The short form: "just now", "5m ago", "3h ago", "2d ago", then the date.
 * With `seconds`, under a minute reads "12s ago", for a clock that ticks.
 * Each unit counts whole units, as the long form does.
 */
export function ago(at: Date, now: Date, { seconds = false } = {}): string {
  const ms = now.getTime() - at.getTime();
  if (seconds && ms < MINUTE) return `${Math.max(1, Math.floor(ms / SECOND))}s ago`;
  const m = Math.floor(ms / MINUTE);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return shortDate(at, now);
}

/** The long form: "5 minutes ago", "yesterday", in the reader's language. */
export function timeAgo(at: Date, now: Date): string {
  const elapsed = now.getTime() - at.getTime();
  for (const [unit, size] of STEPS) {
    if (elapsed >= size) return relative.format(-Math.floor(elapsed / size), unit);
  }
  return relative.format(0, "minute");
}

/** A moment in full: "Nov 24, 2026, 3:00 PM". */
export function fullTime(at: Date): string {
  return absolute.format(at);
}

/** "Nov 24", with the year when it is not this year's or when asked. */
export function shortDate(d: Date, now: Date, withYear = false): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${withYear || d.getFullYear() !== now.getFullYear() ? `, ${d.getFullYear()}` : ""}`;
}

/** The month's short name, "Nov". */
export const monthName = (d: Date) => MONTHS[d.getMonth()]!;

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** The group a moment falls in: "Today", "Yesterday", "This week" or "Earlier". */
export function dayBucket(at: Date, now: Date): string {
  const n = Math.round((midnight(at) - midnight(now)) / DAY);
  if (n === 0) return "Today";
  if (n === -1) return "Yesterday";
  if (n > -7) return "This week";
  return "Earlier";
}

/**
 * A span as its two largest units. The long form ("2 d 4 h", "3 h 12 min",
 * "45 s") reads in prose and panels; the short one ("3h 12m", "45m") in
 * compact rows.
 */
export function duration(ms: number, { short = false } = {}): string {
  const s = Math.max(0, Math.round(ms / SECOND));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  const [D, H, M, S] = short ? ["d", "h", "m", "s"] : [" d", " h", " min", " s"];
  if (d > 0) return h > 0 ? `${d}${D} ${h}${H}` : `${d}${D}`;
  if (h > 0) return m > 0 ? `${h}${H} ${m}${M}` : `${h}${H}`;
  if (m > 0) return `${m}${M}`;
  return `${s}${S}`;
}
