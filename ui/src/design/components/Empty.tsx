import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ic } from "./icon.tsx";

/** What a list shows when it holds nothing: an icon, a title, a line, and a way on. */
export function Empty({ icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="glyph">{ic(icon, 20)}</div>
      <h2 className="es-h">{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
