import type { CSSProperties } from "react";

/** A thin bar filled to a share, out of 100, in the accent or a tone. */
export function ProgressBar({ value, tone }: { value: number; tone?: "good" | "warn" | "bad" }) {
  return (
    <span className={`prog ${tone ?? ""}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ "--p": value / 100 } as CSSProperties} />
    </span>
  );
}
