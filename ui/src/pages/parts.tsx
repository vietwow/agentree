import type { LucideIcon } from "lucide-react";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { PROJECT_STATUS, type Project, type ProjectStatus } from "../board/projects.ts";
import { ic } from "../ui/ic.tsx";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 24 * 60 * 60 * 1000;

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const diffDays = (a: Date, b: Date) => Math.round((midnight(a) - midnight(b)) / DAY);

export function fmtDate(d: Date, now: Date, long = false) {
  return `${MON[d.getMonth()]} ${d.getDate()}${long || d.getFullYear() !== now.getFullYear() ? `, ${d.getFullYear()}` : ""}`;
}

export function ago(at: Date, now: Date) {
  const m = Math.round((now.getTime() - at.getTime()) / 6e4);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return fmtDate(at, now);
}

export function dayBucket(at: Date, now: Date) {
  const n = diffDays(at, now);
  if (n === 0) return "Today";
  if (n === -1) return "Yesterday";
  if (n > -7) return "This week";
  return "Earlier";
}

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
