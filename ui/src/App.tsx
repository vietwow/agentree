import { ArrowLeftRight, CircleCheck, FolderPlus, Keyboard, LogOut, Moon, PanelLeft, Plus, Search, Sun } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fixtureActivity } from "./board/activity.ts";
import { fixtureDetail, fixtureNow, fixtureTasks } from "./board/fixtures.ts";
import { fixtureProjects } from "./board/projects.ts";
import { isClaimed, openQuestions, stats } from "./board/summary.ts";
import { STATUS_LABEL, type Status, type Task } from "./board/task.ts";
import { ActivityPage } from "./pages/ActivityPage.tsx";
import { FavoritesPage } from "./pages/FavoritesPage.tsx";
import { AgentsPage } from "./pages/AgentsPage.tsx";
import { LivePage } from "./pages/LivePage.tsx";
import { DocumentsPage } from "./pages/DocumentsPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { MemoryPage } from "./pages/MemoryPage.tsx";
import { useTicks, withTicks } from "./board/ticks.ts";
import { countUp, reducedMotion } from "./design/motion.ts";
import { NumbersPage } from "./pages/NumbersPage.tsx";
import { SlotsPage } from "./pages/SlotsPage.tsx";
import { ProgressPage } from "./pages/ProgressPage.tsx";
import { ReviewPage } from "./pages/ReviewPage.tsx";
import { ProjectsPage } from "./pages/ProjectsPage.tsx";
import { Palette, type PaletteItem } from "./shell/Palette.tsx";
import { BUILT, PAGE_INFO, PAGES, PROJECT_PAGES, type Page } from "./shell/pages.ts";
import { Shortcuts } from "./shell/Shortcuts.tsx";
import { Sidebar } from "./shell/Sidebar.tsx";
import { useTheme } from "./shell/theme.ts";
import { TopBar, type Crumb } from "./shell/TopBar.tsx";
import { TaskDrawer } from "./tasks/TaskDrawer.tsx";
import { TasksPage } from "./tasks/TasksPage.tsx";
import { ic } from "./ui/ic.tsx";
import { StatusIcon } from "./ui/StatusIcon.tsx";
import { toast } from "./ui/toast.ts";

const SIDE_KEY = "agentree.sidebar";
const ORDER_KEY = "agentree.projectOrder";
/** Keys pressed after G, and the page each opens. */
const GO: Record<string, Page> = {
  h: "home",
  p: "projects",
  i: "inbox",
  t: "tasks",
  b: "board",
  a: "activity",
  f: "favorites",
  s: "options",
};

const notBuilt = (what: string) => toast(`${what} is not built yet`, { kind: "info", ms: 2200 });

export function App() {
  const now = useMemo(fixtureNow, []);
  const sample = useMemo(() => fixtureTasks(now), [now]);
  const [moved, setMoved] = useState<Record<string, Status>>({});
  const ticks = useTicks();
  const tasks = useMemo(
    () =>
      withTicks(
        sample.map((t) => (moved[t.id] ? { ...t, status: moved[t.id]! } : t)),
        ticks.done,
      ),
    [sample, moved, ticks.done],
  );
  const [orders, setOrders] = useState<Record<string, number>>({});
  const taskOrder = useCallback((t: Task) => orders[t.id] ?? sample.findIndex((x) => x.id === t.id), [orders, sample]);
  const activity = useMemo(() => fixtureActivity(tasks, now), [tasks, now]);
  const theme = useTheme();
  const [page, setPage] = useState<Page>("home");
  const [project, setProject] = useState("agentree");
  const [inProject, setInProject] = useState(false);
  const [order, setOrder] = useState<string[]>(() => JSON.parse(localStorage.getItem(ORDER_KEY) ?? "[]"));
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDE_KEY) === "collapsed");
  const [menuOpen, setMenuOpen] = useState(false);
  const [palette, setPalette] = useState<"cmd" | "search">();
  const [shortcuts, setShortcuts] = useState(false);
  const [shownId, setShownId] = useState<string>();
  const [closing, setClosing] = useState(false);
  const [full, setFull] = useState(false);
  const panel = useRef<HTMLElement>(null);
  const open = tasks.find((t) => t.id === shownId);
  const detail = useMemo(() => open && fixtureDetail(open, tasks, now), [open, tasks, now]);
  const selected = closing ? undefined : shownId;

  const projects = useMemo(() => {
    const all = fixtureProjects(tasks, now);
    const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length + all.findIndex((p) => p.id === id));
    return all.sort((a, b) => rank(a.id) - rank(b.id));
  }, [tasks, now, order]);

  const go = useCallback((next: Page) => {
    setPage(next);
    setInProject(false);
    setMenuOpen(false);
  }, []);
  const openProject = useCallback((id: string, next: Page) => {
    setProject(id);
    setPage(next);
    setInProject(true);
    setMenuOpen(false);
  }, []);

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

  const move = useCallback(
    (ids: string[], status: Status) => {
      let before: Partial<Record<string, Status>> = {};
      setMoved((now) => {
        before = Object.fromEntries(ids.map((id) => [id, now[id]]));
        return { ...now, ...Object.fromEntries(ids.map((id) => [id, status])) };
      });
      const one = ids.length === 1 && sample.find((t) => t.id === ids[0]);
      toast(one ? `Moved “${one.title}” to ${STATUS_LABEL[status]}` : `Moved ${ids.length} tasks to ${STATUS_LABEL[status]}`, {
        ms: 5000,
        countdown: true,
        action: "Undo",
        onAction: () =>
          setMoved((now) => {
            const next = { ...now };
            for (const id of ids) {
              const was = before[id];
              if (was === undefined) delete next[id];
              else next[id] = was;
            }
            return next;
          }),
      });
    },
    [sample],
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
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || palette || shortcuts) return;
      if (menuOpen) setMenuOpen(false);
      else closePanel();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element;
      if (!selected || panel.current?.contains(target) || target.closest("[data-opens-task], .pop, .modal-wrap, #toasts")) return;
      closePanel();
    };
    addEventListener("keydown", onKey);
    addEventListener("pointerdown", onPointer);
    return () => {
      removeEventListener("keydown", onKey);
      removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen, selected, closePanel, palette, shortcuts]);

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
      else if (key === "n") notBuilt("Creating a task");
      else if (key === "p") notBuilt("Creating a project");
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
  const fixtureProject = current.id === "agentree";

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
          icon: (
            <span
              className="pico"
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                display: "grid",
                placeItems: "center",
                color: current.color,
                background: `color-mix(in srgb, ${current.color} 16%, transparent)`,
              }}
            >
              {ic(current.icon, 11)}
            </span>
          ),
          onClick: () => openProject(current.id, "board"),
        },
        { label: PAGE_INFO[page].label },
      ]
    : [{ label: PAGE_INFO[page].label }];

  const goItems: PaletteItem[] = PAGES.map((key) => {
    const { label, icon } = PAGE_INFO[key];
    const kbd = Object.entries(GO).find(([, p]) => p === key)?.[0];
    return { key: `go-${key}`, icon: ic(icon, 15), name: `Go to ${label}`, kbd: kbd ? `G ${kbd.toUpperCase()}` : undefined, run: () => go(key) };
  });
  const commands: PaletteItem[] = [
    { key: "c-task", icon: ic(Plus, 15), name: "Create task", kbd: "N", run: () => notBuilt("Creating a task") },
    { key: "c-proj", icon: ic(FolderPlus, 15), name: "Create project", kbd: "P", run: () => notBuilt("Creating a project") },
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
      onNewProject={() => notBuilt("Creating a project")}
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
    if (isProjectPage && !fixtureProject)
      return <NotBuilt page={page} note={`The sample data holds only agentree's board, not ${current.name}'s.`} />;
    if (!BUILT.has(page)) return <NotBuilt page={page} />;
    switch (page) {
      case "home":
        return <HomePage tasks={tasks} activity={activity} now={now} onOpenTask={openTask} onAgents={() => go("agents")} />;
      case "projects":
        return <ProjectsPage projects={projects} now={now} onOpen={(id) => openProject(id, "board")} />;
      case "favorites":
        return (
          <FavoritesPage
            projects={projects}
            tasks={tasks}
            now={now}
            onOpenProject={(id) => openProject(id, "board")}
            onOpenTask={openTask}
            onBrowse={() => go("projects")}
          />
        );
      case "activity":
        return <ActivityPage entries={activity} tasks={tasks} now={now} onOpenTask={openTask} />;
      case "progress":
        return <ProgressPage tasks={tasks} now={now} onOpenTask={openTask} selected={selected} />;
      case "review":
        return <ReviewPage tasks={tasks} now={now} selected={selected} onOpenTask={openTask} />;
      case "agents":
        return <AgentsPage tasks={tasks} now={now} onOpenTask={openTask} onNotBuilt={notBuilt} />;
      case "live":
        return <LivePage tasks={tasks} activity={activity} now={now} projects={projects} onOpenTask={openTask} />;
      case "documents":
        return <DocumentsPage tasks={tasks} onOpenTask={openTask} />;
      case "slots":
        return <SlotsPage tasks={tasks} now={now} onOpenTask={openTask} onNotBuilt={notBuilt} />;
      case "memory":
        return <MemoryPage now={now} onOpenTask={openTask} onNotBuilt={notBuilt} />;
      case "numbers":
        return <NumbersPage tasks={tasks} now={now} onOpenTask={openTask} />;
      default:
        return (
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
            onNotBuilt={notBuilt}
          />
        );
    }
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
            onNewTask={() => notBuilt("Creating a task")}
            onNewProject={() => notBuilt("Creating a project")}
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
          project={projects.find((p) => p.id === "agentree")!}
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
