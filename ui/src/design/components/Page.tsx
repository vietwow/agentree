import type { ReactNode } from "react";
import { cx } from "./cx.ts";

type Props = {
  /**
   * How the page takes the width: centred to read (the default), narrow for
   * a single column, wide to the edges, or flush when it scrolls its own
   * parts and fills the height.
   */
  layout?: "default" | "narrow" | "wide" | "flush";
  /** A page with a look of its own names it here, as a class its CSS keys on. */
  theme?: string;
  /** Layout utilities only; the look comes from the layout and the theme. */
  className?: string;
  children: ReactNode;
};

/** The frame of a page in the content area. */
export function Page({ layout = "default", theme, className, children }: Props) {
  return <div className={cx("page", layout !== "default" && layout, theme, className)}>{children}</div>;
}

/** A page's head: its name, a line under it, and its actions at the right. */
export function PageHeader({ title, children, actions }: { title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="ph">
      <div>
        <h1>{title}</h1>
        {children !== undefined && <p>{children}</p>}
      </div>
      {actions !== undefined && <div className="acts">{actions}</div>}
    </div>
  );
}
