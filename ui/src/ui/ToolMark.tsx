import { User } from "lucide-react";
import { TOOL_LABEL, type Tool } from "../board/task.ts";

/** agentree's own marks of the tools: a letter in the tool's hue, never a tool's logo. */
const LETTER: Record<Tool, string> = {
  "claude-code": "CC",
  "claude-desktop": "CD",
  cursor: "Cu",
  codex: "Cx",
  antigravity: "Ag",
  person: "",
};

const SIZES = {
  32: "size-8 text-2xs",
  24: "size-6 text-(length:--text-3xs)",
  20: "size-5 text-(length:--text-4xs)",
};

export function ToolMark({ tool, size = 32 }: { tool?: Tool; size?: 20 | 24 | 32 }) {
  if (tool === undefined) {
    return (
      <span
        role="img"
        aria-label="Not held"
        className={`inline-flex shrink-0 rounded-full border border-dashed border-line-strong bg-tray dark:border-ink-4 ${SIZES[size]}`}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={TOOL_LABEL[tool]}
      title={TOOL_LABEL[tool]}
      data-tool={tool}
      className={`tool-mark inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold dark:rounded-sm ${SIZES[size]}`}
    >
      {tool === "person" ? <User size={size === 32 ? 16 : 12} aria-hidden /> : LETTER[tool]}
    </span>
  );
}

/** Marks of several tools, overlapped, as a group of who works. */
export function ToolStack({ tools }: { tools: Tool[] }) {
  return (
    <span className="inline-flex shrink-0 items-center -space-x-1.5">
      {tools.map((tool) => (
        <span key={tool} className="inline-flex rounded-full ring-2 ring-float dark:rounded-[7px]">
          <ToolMark tool={tool} size={20} />
        </span>
      ))}
    </span>
  );
}
