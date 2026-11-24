import type { LucideIcon } from "lucide-react";
import { cx } from "./cx.ts";
import { ic } from "./icon.tsx";

export type SegmentedOption<T extends string> = { value: T; label: string; icon?: LucideIcon };

type Props<T extends string> = {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  /** On a narrow screen the choices with an icon show the icon only. */
  collapse?: boolean;
  /** Take the whole width, the choices shared out evenly. */
  fill?: boolean;
  /** Layout utilities only. */
  className?: string;
};

/** A row of choices of which one is on, as a pressed button in a tray. */
export function Segmented<T extends string>({ value, options, onChange, label, collapse, fill, className }: Props<T>) {
  return (
    <div className={cx("seg", fill && "fill", className)} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? "on" : ""}
          aria-pressed={o.value === value}
          aria-label={collapse && o.icon ? o.label : undefined}
          onClick={() => onChange(o.value)}
        >
          {o.icon && ic(o.icon, 13)}
          {collapse && o.icon ? <span className="hide-m">{o.label}</span> : o.label}
        </button>
      ))}
    </div>
  );
}
