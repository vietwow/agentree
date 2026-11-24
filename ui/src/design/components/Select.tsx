import { useRef, useState } from "react";
import { cx } from "./cx.ts";
import { MenuItem } from "./Menu.tsx";
import { Pop } from "./Pop.tsx";

type Props<T extends string> = {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  label: string;
  /** sm is as high as a small button and as wide as its choice. */
  size?: "sm" | "md";
  /** Layout utilities only. */
  className?: string;
};

/** A select drawn by the design system: a button and a menu instead of the browser's own list. */
export function Select<T extends string>({ value, options, onChange, label, size = "md", className }: Props<T>) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const shown = options.find(([k]) => k === value)?.[1] ?? "";
  return (
    <>
      <button
        ref={btn}
        type="button"
        className={cx("select select-btn", size === "sm" && "select-sm", className)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="trunc">{shown}</span>
      </button>
      {open && btn.current && (
        <Pop
          anchor={btn.current}
          onClose={() => setOpen(false)}
          role="listbox"
          label={label}
          className="select-menu"
          style={{ minWidth: Math.max(btn.current.offsetWidth, 160) }}
        >
          {options.map(([k, n]) => (
            <MenuItem
              key={k}
              role="option"
              aria-selected={k === value}
              checked={k === value}
              onClick={() => {
                if (k !== value) onChange(k);
                btn.current?.focus({ preventScroll: true });
              }}
            >
              <span className="trunc grow">{n}</span>
            </MenuItem>
          ))}
        </Pop>
      )}
    </>
  );
}
