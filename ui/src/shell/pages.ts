import {
  Activity,
  BookOpen,
  Bot,
  Brain,
  ChartColumn,
  ChartGantt,
  CircleQuestionMark,
  Cpu,
  Eye,
  FolderKanban,
  House,
  Inbox,
  List,
  Radio,
  ListChecks,
  Paperclip,
  Settings,
  SquareKanban,
  Star,
  type LucideIcon,
} from "lucide-react";

export const PAGES = ["projects", "progress", "tasks", "slots", "review", "memory", "documents", "agents", "live", "numbers", "activity"] as const;

/** Above the pages: the board at a glance, the questions that wait for the owner, and what the owner starred. */
export const HEAD_PAGES = ["home", "inbox", "favorites"] as const;

/** At the foot of the side bar. */
const FOOT_PAGES = ["options", "help"] as const;

/** Pages only a project opened in the side bar lists. */
const PROJECT_ONLY = ["board"] as const;

export type Page = (typeof PAGES)[number] | (typeof HEAD_PAGES)[number] | (typeof FOOT_PAGES)[number] | (typeof PROJECT_ONLY)[number];

export const PAGE_INFO: Record<Page, { label: string; icon: LucideIcon }> = {
  home: { label: "Home", icon: House },
  inbox: { label: "Inbox", icon: Inbox },
  favorites: { label: "Favorites", icon: Star },
  projects: { label: "Projects", icon: FolderKanban },
  activity: { label: "Activity", icon: Activity },
  options: { label: "Options", icon: Settings },
  help: { label: "Help & docs", icon: CircleQuestionMark },
  board: { label: "Board", icon: SquareKanban },
  progress: { label: "Progress", icon: ChartGantt },
  tasks: { label: "Tasks", icon: ListChecks },
  slots: { label: "Slots", icon: Cpu },
  review: { label: "Review", icon: Eye },
  memory: { label: "Memory", icon: Brain },
  documents: { label: "Documents", icon: BookOpen },
  agents: { label: "Agents", icon: Bot },
  live: { label: "Live", icon: Radio },
  numbers: { label: "Numbers", icon: ChartColumn },
};

/** Every page the side bar opens outside a project, in its order there. */
export const NAV_PAGES: readonly Page[] = [...HEAD_PAGES, ...PAGES, "options"];

/** Keys pressed after G, and the page each opens. */
export const GO: Record<string, Page> = {
  h: "home",
  p: "projects",
  i: "inbox",
  t: "tasks",
  b: "board",
  a: "activity",
  f: "favorites",
  s: "options",
};

/** The pages a project opened in the side bar lists, with their icons there. */
export const PROJECT_PAGES = [
  ["board", SquareKanban],
  ["tasks", List],
  ["progress", ChartGantt],
  ["documents", Paperclip],
] as const satisfies readonly (readonly [Page, LucideIcon])[];
