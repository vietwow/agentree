import type { Kind, Status } from "../board/task.ts";

/** Each status's colour, from the board's tokens in themes/domain.css. */
export const STATUS_COLOR: Record<Status, string> = {
  backlog: "var(--status-backlog)",
  ready: "var(--status-ready)",
  "in-progress": "var(--status-in-progress)",
  checking: "var(--status-checking)",
  review: "var(--status-review)",
  accepted: "var(--status-accepted)",
  done: "var(--status-done)",
  blocked: "var(--status-blocked)",
  dropped: "var(--status-dropped)",
};

/** Each kind's colour, from the board's tokens in themes/domain.css. */
export const KIND_COLOR: Record<Kind, string> = {
  build: "var(--kind-build)",
  fix: "var(--kind-fix)",
  measure: "var(--kind-measure)",
  research: "var(--kind-research)",
  review: "var(--kind-review)",
  decision: "var(--kind-decision)",
  assets: "var(--kind-assets)",
};
