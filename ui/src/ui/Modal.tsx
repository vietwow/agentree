import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ic } from "./ic.tsx";

type Props = {
  title: string;
  sub?: ReactNode;
  size?: "" | "sm" | "lg";
  onClose: () => void;
  children: ReactNode;
  foot?: ReactNode;
};

export function Modal({ title, sub, size = "", onClose, children, foot }: Props) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>("[autofocus], .modal-b button, .modal-h button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    addEventListener("keydown", onKey, true);
    return () => {
      removeEventListener("keydown", onKey, true);
      opener?.focus();
    };
  }, [onClose]);

  return createPortal(
    <>
      <div className="scrim enter" style={{ zIndex: 60 }} onClick={onClose} />
      <div
        className="modal-wrap"
        style={{ zIndex: 61 }}
        onClick={(event) => event.target === event.currentTarget && onClose()}
      >
        <div ref={box} className={`modal enter ${size}`} role="dialog" aria-modal="true" aria-labelledby={id}>
          <div className="modal-h">
            <div>
              <h2 id={id}>{title}</h2>
              {sub && (
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                  {sub}
                </div>
              )}
            </div>
            <button type="button" className="ibtn ibtn-sm" onClick={onClose} aria-label="Close">
              {ic(X, 16)}
            </button>
          </div>
          {children}
          {foot && <div className="modal-f">{foot}</div>}
        </div>
      </div>
    </>,
    document.body,
  );
}
