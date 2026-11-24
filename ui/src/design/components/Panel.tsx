import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.ts";

type Props = HTMLAttributes<HTMLDivElement> & {
  title?: ReactNode;
  /** A count after the title. */
  count?: number;
  /** A faint remark at the right of the head. */
  note?: ReactNode;
  /** Controls at the right of the head. */
  actions?: ReactNode;
  /** Cut what overflows the rounded corners, for rows that run to the edge. */
  clip?: boolean;
};

/** A card on the page: a head with a title, a count and controls, then what it holds. */
export function Panel({ title, count, note, actions, clip, className, children, ...rest }: Props) {
  return (
    <div className={cx("panel", clip && "clip", className)} {...rest}>
      {title !== undefined && (
        <div className="panel-h">
          <h2>{title}</h2>
          {count !== undefined && <span className="cnt faint">{count}</span>}
          {note !== undefined && <span className="panel-note">{note}</span>}
          {actions !== undefined && <div className="acts">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

/** A panel's body, set in from its edges. */
export function PanelBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("panel-b", className)} {...rest} />;
}
