import { Fragment, type CSSProperties } from "react";
import { PROJECT_STATUS, type Project, type ProjectStatus } from "../board/projects.ts";
import { ic } from "../design/components/icon.tsx";

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
