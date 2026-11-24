import type { Kind } from "../board/task.ts";

/** Each kind's colour as its light mark draws it, for labels. */
export const KIND_COLOR: Record<Kind, string> = {
  build: "#2f5fb3",
  fix: "#b23b3b",
  measure: "#9a5b00",
  research: "#6740b3",
  review: "#1d6650",
  decision: "#3d3d3a",
  assets: "#a03a72",
};
