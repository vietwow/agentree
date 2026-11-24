import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.ts";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** inverse sits on an ink ground, as in a bar of bulk actions. */
  variant?: "primary" | "secondary" | "ghost" | "danger" | "inverse";
  size?: "sm" | "md";
  icon?: ReactNode;
  trailing?: ReactNode;
  /** Held down: a ghost button whose menu is open or whose choice is made. */
  on?: boolean;
};

const VARIANT = { primary: "btn-primary", secondary: "btn-secondary", ghost: "btn-ghost", danger: "btn-danger-ghost", inverse: "btn-inverse" };

/** A button with a word on it: the primary is solid, the secondary outlined, the ghost bare until hovered. */
export function Button({ variant = "secondary", size = "md", icon, trailing, on, className, children, ...rest }: Props) {
  return (
    <button type="button" className={cx("btn", VARIANT[variant], size === "sm" && "btn-sm", on && "on", className)} {...rest}>
      {icon}
      {children}
      {trailing}
    </button>
  );
}

type IconProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** What the button does, for readers and as its tooltip. */
  label: string;
  size?: "xs" | "sm" | "md";
  on?: boolean;
  /** Show the label as a tooltip on hover. */
  tip?: boolean;
};

/** A button that is only an icon; its label is read out and, with tip, shown on hover. */
export function IconButton({ label, size = "md", on, tip = false, className, children, ...rest }: IconProps) {
  return (
    <button
      type="button"
      className={cx("ibtn", size !== "md" && `ibtn-${size}`, on && "on", className)}
      aria-label={label}
      data-tip={tip ? label : undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
