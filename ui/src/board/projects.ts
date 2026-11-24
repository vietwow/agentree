import { Building2, Folder, Layers, Palette, type LucideIcon } from "lucide-react";
import { DAY } from "../design/format/time.ts";
import type { Task, Tool } from "./task.ts";

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
  tools: Tool[];
  createdAt: Date;
  lastAt: Date;
  total: number;
  done: number;
};

/** The colours a project takes. */
const PROJECT_COLORS = {
  indigo: "#5A67D8",
  blue: "#3B82C4",
  violet: "#8662C9",
  teal: "#23918A",
  rose: "#C54B78",
  amber: "#C48A1E",
  green: "#3D8E5F",
  slate: "#6B7280",
} as const;

export function fixtureProjects(tasks: readonly Task[], now: Date): Project[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const tools = [...new Set(tasks.flatMap((t) => (t.holder ? [t.holder.tool] : [])))];
  const last = tasks.reduce((at, t) => Math.max(at, (t.holder?.beat ?? t.statusSince).getTime()), 0);
  return [
    {
      id: "agentree",
      name: "agentree",
      desc: "Runs coding agents on one board: tasks, trees, checks, review and landing.",
      icon: Layers,
      color: PROJECT_COLORS.indigo,
      status: "active",
      tools,
      createdAt: ago(9),
      lastAt: new Date(last),
      total: tasks.length,
      done: tasks.filter((t) => t.status === "done").length,
    },
    {
      id: "aep",
      name: "aep",
      desc: "The engineering platform the design of agentree comes from.",
      icon: Building2,
      color: PROJECT_COLORS.amber,
      status: "risk",
      tools: ["claude-code", "cursor", "codex"],
      createdAt: ago(64),
      lastAt: ago(0.2),
      total: 128,
      done: 87,
    },
    {
      id: "icon-grab",
      name: "icon-grab",
      desc: "Fetches and normalises icon sets into one sprite.",
      icon: Palette,
      color: PROJECT_COLORS.teal,
      status: "hold",
      private: true,
      tools: ["antigravity"],
      createdAt: ago(31),
      lastAt: ago(6),
      total: 18,
      done: 15,
    },
    {
      id: "notes-sync",
      name: "notes-sync",
      desc: "Mirrors a folder of notes between two machines.",
      icon: Folder,
      color: PROJECT_COLORS.green,
      status: "complete",
      tools: ["claude-code"],
      createdAt: ago(120),
      lastAt: ago(40),
      total: 22,
      done: 22,
    },
  ];
}

export const progressOf = (p: Project) => (p.total ? Math.round((p.done / p.total) * 100) : 0);
