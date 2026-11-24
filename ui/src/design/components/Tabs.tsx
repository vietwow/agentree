import { cx } from "./cx.ts";

export type Tab<T extends string> = { value: T; label: string; count?: number };

type Props<T extends string> = {
  value: T;
  tabs: readonly Tab<T>[];
  onChange: (value: T) => void;
  label: string;
  /** Layout utilities only. */
  className?: string;
};

/** A row of tabs over a line, the open one underlined, each with an optional count. */
export function Tabs<T extends string>({ value, tabs, onChange, label, className }: Props<T>) {
  return (
    <div className={cx("tabs", className)} role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={t.value === value}
          className={cx("tab", t.value === value && "on")}
          onClick={() => onChange(t.value)}
        >
          {t.label}
          {t.count !== undefined && <span className="cnt">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
