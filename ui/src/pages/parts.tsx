import type { LucideIcon } from "lucide-react";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { PROJECT_STATUS, type Project, type ProjectStatus } from "../board/projects.ts";
import { ic } from "../ui/ic.tsx";

export const style = (vars: Record<string, string | number>) => vars as CSSProperties;

export function PIcon({ project, size = 15, className = "" }: { project: Project; size?: number; className?: string }) {
  return (
    <span className={`picon ${className}`} style={style({ "--c": project.color })}>
      {ic(project.icon, size)}
    </span>
  );
}

export function PStatus({ status }: { status: ProjectStatus }) {
  const s = PROJECT_STATUS[status];
  return (
    <span className="pstatus" style={style({ "--c": s.color })}>
      <i />
      {s.name}
    </span>
  );
}

export function ProgBar({ value, tone = "" }: { value: number; tone?: "" | "green" | "amber" | "red" }) {
  return (
    <span className={`prog ${tone}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <i style={style({ "--p": value / 100 })} />
    </span>
  );
}

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

/** Inline code of the Markdown, shown as text: nothing of the file runs. */
export function MdText({ s }: { s: string }) {
  return (
    <>
      {s.split("`").map((part, i) =>
        i % 2 ? (
          <code key={i} className="mono" style={{ fontSize: "0.92em", padding: "1px 4px", borderRadius: 4, background: "var(--surface-2)" }}>
            {part}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
