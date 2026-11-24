import type { LucideIcon } from "lucide-react";
import type { Tool } from "./task.ts";

export type ProjectStatus = "planning" | "active" | "risk" | "hold" | "complete";

export const PROJECT_STATUS: Record<ProjectStatus, { name: string; color: string }> = {
  planning: { name: "Planning", color: "var(--gray)" },
  active: { name: "In Progress", color: "var(--info)" },
  risk: { name: "At Risk", color: "var(--bad)" },
  hold: { name: "On Hold", color: "var(--warn)" },
  complete: { name: "Completed", color: "var(--good)" },
};

/** A repository registered on this machine, with its board's counts. */
export type Project = {
  id: string;
  name: string;
  desc: string;
  icon: LucideIcon;
  color: string;
  status: ProjectStatus;
  /** Its repository is not on a remote anyone else reads. */
  private?: boolean;
  /** Its content is a sample, made by `agentree demo`. */
  sample?: boolean;
  tools: Tool[];
  createdAt: Date;
  lastAt: Date;
  total: number;
  done: number;
};

/** The owner's avatar colour. */
export const OWNER_COLOR = "#5A67D8";

/** The colours a project takes. */
export const PROJECT_COLORS = {
  indigo: "#5A67D8",
  blue: "#3B82C4",
  violet: "#8662C9",
  teal: "#23918A",
  rose: "#C54B78",
  amber: "#C48A1E",
  green: "#3D8E5F",
  slate: "#6B7280",
} as const;

export const progressOf = (p: Project) => (p.total ? Math.round((p.done / p.total) * 100) : 0);
