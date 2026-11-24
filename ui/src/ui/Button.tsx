import type { ButtonHTMLAttributes, ReactNode } from "react";

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
