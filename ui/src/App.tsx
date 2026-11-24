import { ArrowLeftRight, CircleCheck, FolderPlus, Keyboard, LogOut, Moon, PanelLeft, Plus, Search, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { send, type Board } from "./board/daemon.ts";
import type { Project } from "./board/projects.ts";
import { isClaimed, openQuestions, stats } from "./board/summary.ts";
import { STATUS_LABEL, type Status, type Task } from "./board/task.ts";
import { settleTicks, useTicks, withTicks } from "./board/ticks.ts";
import { useEscape } from "./design/components/escape.ts";
import { ic } from "./design/components/icon.tsx";
import { toast } from "./design/components/toast.ts";
import { countUp, reducedMotion } from "./design/motion.ts";
import { ActivityPage } from "./pages/ActivityPage.tsx";
import { AgentsPage } from "./pages/AgentsPage.tsx";
import { DocumentsPage } from "./pages/DocumentsPage.tsx";
import { FavoritesPage } from "./pages/FavoritesPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { InboxPage } from "./pages/InboxPage.tsx";
import { LivePage } from "./pages/LivePage.tsx";
import { MemoryPage } from "./pages/MemoryPage.tsx";
import { NewProject } from "./pages/NewProject.tsx";
import { NumbersPage } from "./pages/NumbersPage.tsx";
import { OptionsPage } from "./pages/OptionsPage.tsx";
import { PIcon } from "./pages/parts.tsx";
import { ProgressPage } from "./pages/ProgressPage.tsx";
import { ProjectsPage } from "./pages/ProjectsPage.tsx";
import { ReviewPage } from "./pages/ReviewPage.tsx";
import { SlotsPage } from "./pages/SlotsPage.tsx";
import { GO, NAV_PAGES, PAGE_INFO, PROJECT_PAGES, type Page } from "./shell/pages.ts";
import { Palette, type PaletteItem } from "./shell/Palette.tsx";
import { Shortcuts } from "./shell/Shortcuts.tsx";
import { Sidebar } from "./shell/Sidebar.tsx";
import { useTheme } from "./shell/theme.ts";
import { TopBar, type Crumb } from "./shell/TopBar.tsx";
import { NewTask } from "./tasks/NewTask.tsx";
import { TaskDrawer } from "./tasks/TaskDrawer.tsx";
import { TasksPage } from "./tasks/TasksPage.tsx";
import { StatusIcon } from "./ui/StatusIcon.tsx";

const SIDE_KEY = "agentree.sidebar";
const ORDER_KEY = "agentree.projectOrder";

/** The order the owner dragged the projects into; nothing when the browser holds none or something unreadable. */
function savedOrder(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const notBuilt = (what: string) => toast(`${what} is not built yet`, { kind: "info", ms: 2200 });

type Props = {
  /** The machine's projects, and the board of the open one. */
  projects: Project[];
  board: Board;
  onProject: (id: string) => void;
};

export function App({ projects: listed, board, onProject }: Props) {
  const { now, tasks: sample, activity } = board;
  const project = board.project.id;
  const ticks = useTicks();
  useEffect(settleTicks, [sample]);
  const tasks = useMemo(() => withTicks(sample, ticks.done), [sample, ticks.done]);
  const [orders, setOrders] = useState<Record<string, number>>({});
  const taskOrder = useCallback((t: Task) => orders[t.id] ?? sample.findIndex((x) => x.id === t.id), [orders, sample]);
  const theme = useTheme();
  const [page, setPage] = useState<Page>("home");
  const [inProject, setInProject] = useState(false);
  const [order, setOrder] = useState(savedOrder);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDE_KEY) === "collapsed");
  const [menuOpen, setMenuOpen] = useState(false);
  const [palette, setPalette] = useState<"cmd" | "search">();
  const [shortcuts, setShortcuts] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [shownId, setShownId] = useState<string>();
  const [closing, setClosing] = useState(false);
  const [full, setFull] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const open = tasks.find((t) => t.id === shownId);
  const detail = open && board.details.get(open.id);
  const selected = closing ? undefined : shownId;

  const projects = useMemo(() => {
    const all = [...listed];
    const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length + all.findIndex((p) => p.id === id));
    return all.sort((a, b) => rank(a.id) - rank(b.id));
  }, [listed, order]);

  const go = useCallback((next: Page) => {
    setPage(next);
    setInProject(false);
    setMenuOpen(false);
  }, []);
  const openProject = useCallback(
    (id: string, next: Page) => {
      onProject(id);
      setPage(next);
      setInProject(true);
      setMenuOpen(false);
    },
    [onProject],
  );

  const toggleSide = useCallback(() => {
    setCollapsed((now) => {
      localStorage.setItem(SIDE_KEY, now ? "open" : "collapsed");
      return !now;
    });
  }, []);

  const reorder = useCallback(
    (id: string, before: string) => {
      const ids = projects.map((p) => p.id).filter((x) => x !== id);
      const at = before ? ids.indexOf(before) : ids.length;
      ids.splice(at < 0 ? ids.length : at, 0, id);
      localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
      setOrder(ids);
    },
    [projects],
  );

  /** Asks the daemon to move tasks; each shows in its place when the daemon tells of it. */
  const move = useCallback(
    (ids: string[], status: Status) => {
      const before = new Map(sample.filter((t) => ids.includes(t.id)).map((t) => [t.id, t.status]));
      const to = (id: string, where: Status) => send(`/api/projects/${project}/tasks/${id}/move`, { to: where });
      void Promise.all(ids.map((id) => to(id, status))).then((moved) => {
        if (!moved.every(Boolean)) return;
        const one = ids.length === 1 && sample.find((t) => t.id === ids[0]);
        toast(one ? `Moved “${one.title}” to ${STATUS_LABEL[status]}` : `Moved ${ids.length} tasks to ${STATUS_LABEL[status]}`, {
          ms: 5000,
          countdown: true,
          action: "Undo",
          onAction: () => void Promise.all(ids.map((id) => to(id, before.get(id)!))),
        });
      });
    },
    [sample, project],
  );

  const closePanel = useCallback(() => {
    if (reducedMotion()) {
      setShownId(undefined);
      setClosing(false);
      setFull(false);
    } else {
      setClosing(true);
    }
  }, []);

  const openTask = (id: string) => {
    if (id === shownId && !closing) {
      closePanel();
      return;
    }
    setShownId(id);
    setClosing(false);
  };

  useEffect(() => {
    if (!menuOpen && !selected) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!selected || panel.current?.contains(target) || target.closest("[data-opens-task], .pop, .modal-wrap, #toasts")) return;
      closePanel();
    };
    addEventListener("pointerdown", onPointer);
    return () => removeEventListener("pointerdown", onPointer);
  }, [menuOpen, selected, closePanel]);
  useEscape(() => (menuOpen ? setMenuOpen(false) : closePanel()), menuOpen || selected !== undefined);

  useEffect(() => {
    let pending = 0;
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && key === "k") {
        event.preventDefault();
        setPalette((now) => (now ? undefined : "cmd"));
        return;
      }
      if (mod && event.shiftKey && key === "l") {
        event.preventDefault();
        theme.toggle();
        return;
      }
      const target = event.target as Element;
      if (mod || event.altKey || palette || shortcuts) return;
      if (target.matches?.("input, textarea, select, [contenteditable='true']")) return;
      if (pending && Date.now() - pending < 1200 && GO[key]) {
        event.preventDefault();
        pending = 0;
        if (GO[key] === "board") openProject(project, "board");
        else go(GO[key]);
        return;
      }
      pending = 0;
      if (key === "g") pending = Date.now();
      else if (event.key === "/") {
        event.preventDefault();
        setPalette("search");
      } else if (event.key === "?") setShortcuts(true);
      else if (event.key === "[") toggleSide();
      else if (key === "n") setNewTask(true);
      else if (key === "p") setNewProject(true);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [palette, shortcuts, theme, go, openProject, project, toggleSide]);

  const summary = stats(tasks, now);
  const questions = tasks.reduce((n, t) => n + openQuestions(t).length, 0);
  const failedChecks = tasks.filter((t) => t.checks.failed > 0).length;
  const slots = tasks.filter((t) => t.checks.state === "running" || t.checks.state === "queued").length;
  const ready = tasks.filter((t) => t.status === "ready").length;
  const current = projects.find((p) => p.id === project) ?? projects[0]!;
  const isProjectPage = inProject && PROJECT_PAGES.some(([key]) => key === page);

  const owner = {
    theme: theme.choice,
    onTheme: theme.choose,
    onSettings: () => go("options"),
    onShortcuts: () => setShortcuts(true),
  };

  const crumbs: Crumb[] = isProjectPage
    ? [
        { label: "Projects", onClick: () => go("projects") },
        {
          label: current.name,
          icon: <PIcon project={current} size={11} className="sm" />,
          onClick: () => openProject(current.id, "board"),
        },
        { label: PAGE_INFO[page].label },
      ]
    : [{ label: PAGE_INFO[page].label }];

  const goItems: PaletteItem[] = NAV_PAGES.map((key) => {
    const { label, icon } = PAGE_INFO[key];
    const kbd = Object.entries(GO).find(([, p]) => p === key)?.[0];
    return { key: `go-${key}`, icon: ic(icon, 15), name: `Go to ${label}`, kbd: kbd ? `G ${kbd.toUpperCase()}` : undefined, run: () => go(key) };
  });
  const commands: PaletteItem[] = [
    { key: "c-task", icon: ic(Plus, 15), name: "Create task", kbd: "N", run: () => setNewTask(true) },
    { key: "c-proj", icon: ic(FolderPlus, 15), name: "Create project", kbd: "P", run: () => setNewProject(true) },
    { key: "c-search", icon: ic(Search, 15), name: "Search workspace", kbd: "/", run: () => setTimeout(() => setPalette("search")) },
    ...goItems,
    {
      key: "c-dark",
      icon: ic(theme.dark ? Sun : Moon, 15),
      name: theme.dark ? "Switch to light mode" : "Switch to dark mode",
      kbd: "⌘ ⇧ L",
      run: theme.toggle,
    },
    { key: "c-proj-switch", icon: ic(ArrowLeftRight, 15), name: "Switch project…", run: () => go("projects") },
    { key: "c-side", icon: ic(PanelLeft, 15), name: "Toggle sidebar", kbd: "[", run: toggleSide },
    { key: "c-keys", icon: ic(Keyboard, 15), name: "Keyboard shortcuts", kbd: "?", run: () => setShortcuts(true) },
    { key: "c-out", icon: ic(LogOut, 15), name: "Sign out", run: () => {} },
  ];
  const taskItems: PaletteItem[] = tasks.map((t) => ({
    key: t.id,
    icon: <StatusIcon status={t.status} />,
    name: t.title,
    sub: STATUS_LABEL[t.status],
    r: t.id,
    run: () => {
      go("tasks");
      openTask(t.id);
    },
  }));
  const projectItems: PaletteItem[] = projects.map((p) => ({
    key: `p-${p.id}`,
    icon: <span className="pdot" style={{ "--c": p.color } as React.CSSProperties} />,
    name: p.name,
    sub: p.status === "complete" ? "Completed" : undefined,
    run: () => openProject(p.id, "board"),
  }));
  const recent = tasks
    .filter(isClaimed)
    .sort((a, b) => b.holder!.beat.getTime() - a.holder!.beat.getTime())
    .slice(0, 4);

  const sidebar = (
    <Sidebar
      page={page}
      onPage={go}
      projects={projects}
      project={project}
      inProject={isProjectPage}
      onProject={openProject}
      onReorder={reorder}
      onNewProject={() => setNewProject(true)}
      onPalette={() => setPalette("cmd")}
      collapsed={collapsed && !menuOpen}
      onCollapse={toggleSide}
      questions={questions}
      counts={{
        tasks: { count: ready, old: false },
        slots: { count: slots, old: false },
        review: { count: summary.inReview, old: summary.reviewWaitingOverHour > 0 },
      }}
      owner={owner}
    />
  );

  const routeKey = `${page}:${inProject ? project : ""}`;
  const [fxKey, setFxKey] = useState(routeKey);
  const [fxRoute, setFxRoute] = useState(true);
  if (fxKey !== routeKey) {
    setFxKey(routeKey);
    setFxRoute(true);
  }
  useEffect(() => {
    countUp(document.querySelector(".fx-route") ?? undefined);
    const t = setTimeout(() => setFxRoute(false), 1000);
    return () => clearTimeout(t);
  }, [routeKey]);

  const body = () => {
    const render = views[page];
    return render ? render() : <NotBuilt page={page} />;
  };
  const tasksPage = () => (
    <TasksPage
      key={page}
      tasks={tasks}
      now={now}
      mode={page === "board" ? "board" : undefined}
      selected={selected}
      onOpen={openTask}
      onMove={move}
      order={taskOrder}
      onOrder={(id, n) => setOrders((now) => ({ ...now, [id]: n }))}
      onNewTask={() => setNewTask(true)}
    />
  );
  /** The pages built so far; any other shows that it is not built yet. */
  const views: Partial<Record<Page, () => ReactNode>> = {
    home: () => (
      <HomePage
        project={current.name}
        sample={current.sample === true}
        tasks={tasks}
        activity={activity}
        now={now}
        onOpenTask={openTask}
        onAgents={() => go("agents")}
      />
    ),
    projects: () => <ProjectsPage projects={projects} now={now} onOpen={(id) => openProject(id, "board")} onNew={() => setNewProject(true)} />,
    favorites: () => (
      <FavoritesPage
        projects={projects}
        tasks={tasks}
        now={now}
        onOpenProject={(id) => openProject(id, "board")}
        onOpenTask={openTask}
        onBrowse={() => go("projects")}
      />
    ),
    activity: () => <ActivityPage entries={activity} tasks={tasks} now={now} onOpenTask={openTask} />,
    progress: () => <ProgressPage tasks={tasks} now={now} onOpenTask={openTask} selected={selected} />,
    review: () => <ReviewPage tasks={tasks} now={now} selected={selected} onOpenTask={openTask} />,
    agents: () => <AgentsPage tasks={tasks} now={now} onOpenTask={openTask} />,
    live: () => (
      <LivePage tasks={tasks} activity={activity} now={now} projects={projects} project={project} onProject={onProject} onOpenTask={openTask} />
    ),
    documents: () => <DocumentsPage tasks={tasks} onOpenTask={openTask} />,
    slots: () => <SlotsPage tasks={tasks} now={now} onOpenTask={openTask} />,
    memory: () => <MemoryPage now={now} onOpenTask={openTask} />,
    numbers: () => <NumbersPage tasks={tasks} now={now} onOpenTask={openTask} />,
    inbox: () => <InboxPage tasks={tasks} now={now} onOpenTask={openTask} onMemory={() => go("memory")} />,
    options: () => <OptionsPage />,
    tasks: tasksPage,
    board: tasksPage,
  };

  return (
    <>
      <div className={`shell ${collapsed && !menuOpen ? "collapsed" : ""} ${menuOpen ? "mnav" : ""}`}>
        {sidebar}
        {menuOpen && <div className="side-scrim" onClick={() => setMenuOpen(false)} />}
        <main className="main" id="main">
          <TopBar
            crumbs={crumbs}
            unread={questions + failedChecks > 0}
            onMenu={() => setMenuOpen(true)}
            onSearch={() => setPalette("cmd")}
            onNotices={() => go("inbox")}
            onNewTask={() => setNewTask(true)}
            onNewProject={() => setNewProject(true)}
            onPlan={() => notBuilt("The planner")}
            owner={owner}
          />
          <div className={`content ${fxRoute ? "fx-route" : ""}`} id="main-content" tabIndex={-1}>
            {body()}
          </div>
        </main>
      </div>

      {open && detail && (
        <TaskDrawer
          panelRef={panel}
          task={open}
          detail={detail}
          tasks={tasks}
          project={current}
          now={now}
          full={full}
          closing={closing}
          onToggleFull={() => setFull((now) => !now)}
          onClose={closePanel}
          onOpen={(id) => setShownId(id)}
          onMove={(id, status) => move([id], status)}
          onAnimationEnd={() => {
            setShownId(undefined);
            setClosing(false);
            setFull(false);
          }}
        />
      )}

      {palette && (
        <Palette
          mode={palette}
          onClose={() => setPalette(undefined)}
          idle={[
            {
              name: "Suggestions",
              items: [commands[0]!, commands[1]!, commands[2]!, ...commands.filter((c) => c.key === "c-dark" || c.key === "c-proj-switch")],
            },
            {
              name: "Recent tasks",
              items: recent.map((t) => taskItems.find((i) => i.key === t.id)!),
            },
            { name: "Navigation", items: goItems },
          ]}
          commands={commands}
          tasks={taskItems}
          projects={projectItems}
          suggested={[
            { key: "s-review", icon: ic(CircleCheck, 15), name: "Tasks waiting for review", run: () => go("review") },
            { key: "s-questions", icon: ic(Search, 15), name: "Questions waiting for you", run: () => go("inbox") },
          ]}
        />
      )}
      {newTask && <NewTask onClose={() => setNewTask(false)} />}
      {newProject && <NewProject onClose={() => setNewProject(false)} onMade={(id) => openProject(id, "board")} />}
      {shortcuts && <Shortcuts onClose={() => setShortcuts(false)} />}
    </>
  );
}

function NotBuilt({ page, note }: { page: Page; note?: string }) {
  const { label, icon: Icon } = PAGE_INFO[page];
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
        <Icon size={20} aria-hidden />
      </span>
      <p className="text-md leading-5 font-medium">{label} is not built yet</p>
      <p className="max-w-sm text-xs leading-4 text-ink-4">
        {note ?? "These pages are built one at a time, on sample data, to settle the look of the UI."}
      </p>
    </div>
  );
}
