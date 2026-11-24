import { Eye, FlaskConical, Hammer, Image, Ruler, Scale, Wrench, type LucideIcon } from "lucide-react";
import { KIND_LABEL, type Kind } from "../board/task.ts";

/** A soft circle in the light theme; a filled tile of the same hue in the dark. */
const MARKS: Record<Kind, { icon: LucideIcon; className: string }> = {
  build: { icon: Hammer, className: "bg-[#e3ecfb] text-[#2f5fb3] dark:bg-[#5b7fe0] dark:text-white" },
  fix: { icon: Wrench, className: "bg-[#fde8e7] text-[#b23b3b] dark:bg-[#e0605a] dark:text-white" },
  measure: { icon: Ruler, className: "bg-[#fdf1dc] text-[#9a5b00] dark:bg-[#f0a060] dark:text-[#1a1206]" },
  research: { icon: FlaskConical, className: "bg-[#ede5fb] text-[#6740b3] dark:bg-[#9a7ff0] dark:text-white" },
  review: { icon: Eye, className: "bg-[#d8f0e8] text-[#1d6650] dark:bg-[#3fc1a5] dark:text-[#06201a]" },
  decision: { icon: Scale, className: "bg-[#e9e9e6] text-[#3d3d3a] dark:bg-[#3a3a3f] dark:text-white" },
  assets: { icon: Image, className: "bg-[#fbe4f0] text-[#a03a72] dark:bg-[#d46aa6] dark:text-white" },
};

/** Each kind's colour as its light mark draws it, for labels. */
export const KIND_COLOR: Record<Kind, string> = {
  build: "#2f5fb3",
  fix: "#b23b3b",
  measure: "#9a5b00",
  research: "#6740b3",
  review: "#1d6650",
  decision: "#3d3d3a",
  assets: "#a03a72",
};

export function KindMark({ kind }: { kind: Kind }) {
  const { icon: Icon, className } = MARKS[kind];
  return (
    <span
      role="img"
      aria-label={KIND_LABEL[kind]}
      title={KIND_LABEL[kind]}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full ring-1 ring-black/5 dark:rounded-control dark:ring-0 ${className}`}
    >
      <Icon size={16} aria-hidden />
    </span>
  );
}
