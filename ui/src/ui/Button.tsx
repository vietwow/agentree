import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary";
  icon?: ReactNode;
  trailing?: ReactNode;
};

/** A gr8r .btn: the primary is solid, the secondary outlined; both hold their icon bare. */
export function Button({ tone = "secondary", icon, trailing, className = "", children, ...rest }: Props) {
  const look = tone === "primary" ? "btn-primary primary-solid" : "btn-secondary";
  return (
    <button type="button" className={`btn ${look} ${className}`} {...rest}>
      {icon}
      <span>{children}</span>
      {trailing}
    </button>
  );
}

export function IconButton({ label, className = "", children, ...rest }: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`relative inline-flex size-9 shrink-0 items-center justify-center rounded-(--radius-sm) border border-line-strong bg-float text-ink-2 shadow-sm transition-colors hover:bg-(--hover) hover:text-ink ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
