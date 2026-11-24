import { Check, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.ts";
import { ic } from "./icon.tsx";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  /** Anything else drawn where the icon goes, such as a status mark. */
  lead?: ReactNode;
  /** The key that does the same, shown at the right; while the menu is open, that key presses the item. */
  keys?: string;
  /** The choice that is made, ticked at the right. */
  checked?: boolean;
  danger?: boolean;
};

/** A row of a menu in a Pop. A press on it closes the menu unless it carries data-keep. */
export function MenuItem({ icon, lead, keys, checked, danger, className, children, ...rest }: Props) {
  return (
    <button type="button" className={cx("mi", danger && "danger", className)} data-keys={keys?.toUpperCase()} {...rest}>
      {icon && ic(icon, 15)}
      {lead}
      {children}
      {keys && (
        <span className="r">
          <kbd>{keys}</kbd>
        </span>
      )}
      {checked && <span className="ck">{ic(Check, 14)}</span>}
    </button>
  );
}

/** A line between groups of a menu. */
export const MenuSeparator = () => <div className="msep" />;

/** The name of a group of a menu. */
export const MenuLabel = ({ children }: { children: ReactNode }) => <div className="mh">{children}</div>;
