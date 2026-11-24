import { ago, fullTime, timeAgo } from "../format/time.ts";

/** A relative time in its short form ("5m ago"), with the long form and the moment as its tooltip. */
export function Ago({ at, now, seconds = false, className }: { at: Date; now: Date; seconds?: boolean; className?: string }) {
  return (
    <time dateTime={at.toISOString()} className={className} title={`${timeAgo(at, now)} · ${fullTime(at)}`}>
      {ago(at, now, { seconds })}
    </time>
  );
}
