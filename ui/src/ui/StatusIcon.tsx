import type { CSSProperties } from "react";
import { STATUS_LABEL, type Status } from "../board/task.ts";

/**
 * A status as a ring that fills as the task moves on: dashed while in the
 * backlog, empty when ready, a share filled while it is worked, checked
 * and reviewed, and full with a tick once accepted or done. It draws
 * itself in when it appears.
 */
/** Each status's colour, for whatever else draws a status. */
export const STATUS_COLOR: Record<Status, string> = {
  backlog: "var(--ink-faint)",
  ready: "#8b6cd9",
  "in-progress": "#e07b39",
  checking: "var(--warn)",
  review: "var(--info)",
  accepted: "var(--teal)",
  done: "var(--good)",
  blocked: "var(--bad)",
  dropped: "var(--ink-faint)",
};

const LOOK: Record<Status, { share: number; dashed?: boolean; tick?: boolean }> = {
  backlog: { share: 0, dashed: true },
  ready: { share: 0 },
  "in-progress": { share: 0.5 },
  checking: { share: 0.625 },
  review: { share: 0.75 },
  accepted: { share: 1, tick: true },
  done: { share: 1, tick: true },
  blocked: { share: 0 },
  dropped: { share: 0, dashed: true },
};

export function StatusIcon({ status, size = 14 }: { status: Status; size?: 12 | 14 }) {
  const look = LOOK[status];
  const r = 3.5;
  const circumference = 2 * Math.PI * r;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      role="img"
      aria-label={STATUS_LABEL[status]}
      className="shrink-0"
      style={{ color: STATUS_COLOR[status] }}
    >
      <circle
        cx="7"
        cy="7"
        r="6"
        fill={look.tick ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={look.dashed ? "2 2" : undefined}
        className={`icon-part ${look.tick ? "ring-pop" : look.dashed ? "ring-spin" : ""}`}
      />
      {look.share > 0 && !look.tick && (
        <g transform="rotate(-90 7 7)">
          <circle
            cx="7"
            cy="7"
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={r * 2}
            strokeDasharray={`${circumference * look.share} ${circumference}`}
            style={{ "--ring-length": `${circumference}` } as CSSProperties}
            className="ring-fill"
          />
        </g>
      )}
      {look.tick && (
        <path
          d="M4.5 7.2 6.2 8.8 9.5 5.4"
          pathLength={1}
          fill="none"
          stroke="var(--sheet)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="tick-draw"
        />
      )}
    </svg>
  );
}
