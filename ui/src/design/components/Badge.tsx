import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.ts";

export type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "accent" | "violet";

type Props = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  /** A dot of the tone's colour before the words. */
  dot?: boolean;
  icon?: ReactNode;
};

/** A short word of state on a wash of its tone. */
export function Badge({ tone = "neutral", dot, icon, className, children, ...rest }: Props) {
  return (
    <span className={cx("badge", tone !== "neutral" && tone, className)} {...rest}>
      {dot && <span className="dot" />}
      {icon}
      {children}
    </span>
  );
}
