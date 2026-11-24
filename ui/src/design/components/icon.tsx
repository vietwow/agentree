import type { LucideIcon } from "lucide-react";

/** An icon drawn as the gr8r styles expect it: class `i`, a 1.8 stroke, hidden from readers. */
export function ic(Icon: LucideIcon, size = 16, className = "") {
  return <Icon size={size} strokeWidth={1.8} className={`i ${className}`} aria-hidden />;
}
