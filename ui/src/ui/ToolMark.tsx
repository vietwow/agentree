import { User } from "lucide-react";
import { TOOL_LABEL, type Tool } from "../board/task.ts";

/** agentree's own marks of the tools: a letter on a colour, never a tool's logo. */
const MARKS: Record<Tool, { letter: string; className: string }> = {
  "claude-code": { letter: "CC", className: "bg-[#f6e3d3] text-[#8a4a1f] dark:bg-[#3a2a1f] dark:text-[#e8b48c]" },
  "claude-desktop": { letter: "CD", className: "bg-[#f1e4d2] text-[#7a4b25] dark:bg-[#362a20] dark:text-[#dfb48e]" },
  cursor: { letter: "Cu", className: "bg-[#e6e6e3] text-[#2b2b29] dark:bg-[#30302e] dark:text-[#dcdcd8]" },
  codex: { letter: "Cx", className: "bg-[#d8f0e8] text-[#1d6650] dark:bg-[#1c3029] dark:text-[#8fd3bb]" },
  antigravity: { letter: "Ag", className: "bg-[#dfe7fb] text-[#2f4fa0] dark:bg-[#1f2840] dark:text-[#9fb6ef]" },
  person: { letter: "", className: "bg-[#fbe7c6] text-[#8a5a12] dark:bg-[#3a2d17] dark:text-[#e0b26a]" },
};

const SIZES = {
  32: "size-8 text-[11px]",
  24: "size-6 text-[9px]",
  20: "size-5 text-[8px]",
};

export function ToolMark({ tool, size = 32 }: { tool?: Tool; size?: 20 | 24 | 32 }) {
  if (tool === undefined) {
    return (
      <span
        role="img"
        aria-label="Not held"
        className={`inline-flex shrink-0 rounded-full border border-dashed border-line-strong bg-panel dark:border-ink-faint ${SIZES[size]}`}
      />
    );
  }
  const mark = MARKS[tool];
  return (
    <span
      role="img"
      aria-label={TOOL_LABEL[tool]}
      title={TOOL_LABEL[tool]}
      className={`inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold ring-1 ring-black/5 dark:rounded-[6px] dark:ring-line-strong ${SIZES[size]} ${mark.className}`}
    >
      {tool === "person" ? <User size={size === 32 ? 16 : 12} aria-hidden /> : mark.letter}
    </span>
  );
}

/** Marks of several tools, overlapped, as a group of who works. */
export function ToolStack({ tools }: { tools: Tool[] }) {
  return (
    <span className="inline-flex shrink-0 items-center -space-x-1.5">
      {tools.map((tool) => (
        <span key={tool} className="inline-flex rounded-full ring-2 ring-raised dark:rounded-[7px]">
          <ToolMark tool={tool} size={20} />
        </span>
      ))}
    </span>
  );
}
