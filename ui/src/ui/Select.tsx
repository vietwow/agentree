import { Check } from "lucide-react";
import { useRef, useState, type CSSProperties } from "react";
import { ic } from "./ic.tsx";
import { Pop } from "./Pop.tsx";

type Props<T extends string> = {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  label: string;
  style?: CSSProperties;
};

/** gr8r's design-system select: a trigger button and a .pop menu instead of the browser's own list. */
export function Select<T extends string>({ value, options, onChange, label, style }: Props<T>) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const shown = options.find(([k]) => k === value)?.[1] ?? "";
  return (
    <>
      <button
        ref={btn}
        type="button"
        className="select select-btn"
        style={style}
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
            <button
              key={k}
              type="button"
              className="mi"
              role="option"
              aria-selected={k === value}
              onClick={() => {
                if (k !== value) onChange(k);
                btn.current?.focus({ preventScroll: true });
              }}
            >
              <span className="trunc grow">{n}</span>
              {k === value && <span className="ck">{ic(Check, 14)}</span>}
            </button>
          ))}
        </Pop>
      )}
    </>
  );
}
