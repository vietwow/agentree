import type { ReactNode } from "react";
import { cx } from "./cx.ts";

/**
 * Names and values in a grid, written as dt and dd children: a name may
 * start with an icon, a value holds text or a control. Two columns set two
 * pairs to a row, for a wide panel.
 */
export function KeyValues({ columns = 1, className, children }: { columns?: 1 | 2; className?: string; children: ReactNode }) {
  return <dl className={cx("kv", columns === 2 && "two", className)}>{children}</dl>;
}
