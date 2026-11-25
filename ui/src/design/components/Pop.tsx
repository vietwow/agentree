import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "./escape.ts";

type Props = {
  anchor: HTMLElement;
  onClose: () => void;
  width?: number;
  role?: string;
  label?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
};

const GAP = 4;
const EDGE = 8;

/** The open pops, oldest first; a pop opened from inside another sits above it. */
const open: HTMLDivElement[] = [];

/** A menu or picker anchored on the control that opened it; Escape, a press outside, or an item's key closes it. */
export function Pop({ anchor, onClose, width, role = "menu", label, className = "", style, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<CSSProperties>({ visibility: "hidden" });

  // Re-measures after every render, since the content can change its size; setPlace bails out when the place holds.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = r.left;
    let top = r.bottom + GAP;
    if (left + w > innerWidth - EDGE) left = Math.max(EDGE, r.right - w);
    if (top + h > innerHeight - EDGE) top = Math.max(EDGE, r.top - GAP - h);
    setPlace((now) => (now.left === left && now.top === top ? now : { left, top }));
  });

  useEscape(() => {
    onClose();
    anchor.focus();
  });

  useLayoutEffect(() => {
    const el = box.current!;
    open.push(el);
    return () => void open.splice(open.indexOf(el), 1);
  }, []);

  useLayoutEffect(() => {
    const el = box.current!;
    const onKey = (event: KeyboardEvent) => {
      if (open.at(-1) !== el) return;
      const typing = (event.target as Element).matches?.("input, textarea, [contenteditable='true']");
      const shortcut = event.key.length === 1 && !typing && !event.metaKey && !event.ctrlKey && !event.altKey;
      const item = shortcut && box.current?.querySelector<HTMLElement>(`.mi[data-keys="${CSS.escape(event.key.toUpperCase())}"]:not(:disabled)`);
      if (item) {
        event.preventDefault();
        event.stopPropagation();
        item.click();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = [...(box.current?.querySelectorAll<HTMLElement>(".mi:not(:disabled)") ?? [])];
      if (!items.length) return;
      event.preventDefault();
      const i = items.indexOf(document.activeElement as HTMLElement);
      const n =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : event.key === "ArrowDown"
              ? (i + 1) % items.length
              : (i - 1 + items.length) % items.length;
      items[n]!.focus();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (el.contains(target) || anchor.contains(target)) return;
      if (open.slice(open.indexOf(el) + 1).some((above) => above.contains(target))) return;
      onClose();
    };
    addEventListener("keydown", onKey, true);
    addEventListener("pointerdown", onPointer, true);
    return () => {
      removeEventListener("keydown", onKey, true);
      removeEventListener("pointerdown", onPointer, true);
    };
  }, [anchor, onClose]);

  return createPortal(
    // The items of a menu are buttons of their own, each with its keys: this only closes the menu once one was pressed.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      ref={box}
      role={role}
      aria-label={label}
      className={`pop floating enter ${className}`}
      style={{ ...style, ...place, width }}
      onClick={(event) => {
        const target = event.target as Element;
        if (event.currentTarget.contains(target) && target.closest(".mi:not([data-keep])")) onClose();
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Which control has its menu open; one at a time. */
export function usePop<K extends string>() {
  const [open, setOpen] = useState<{ key: K; anchor: HTMLElement }>();
  const toggle = (key: K) => (event: { currentTarget: HTMLElement }) => {
    const anchor = event.currentTarget;
    setOpen((now) => (now?.key === key ? undefined : { key, anchor }));
  };
  const close = useRef(() => setOpen(undefined)).current;
  return { open, toggle, close };
}
