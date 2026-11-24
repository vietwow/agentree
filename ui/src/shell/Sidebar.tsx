import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  ChevronsUpDown,
  Command,
  Ellipsis,
  Keyboard,
  Link,
  Lock,
  PanelLeft,
  Plus,
  Star,
  TreeDeciduous,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { setDropHandlers } from "../board/drag.ts";
import { toggleStar, useStars } from "../board/favorites.ts";
import { PROJECT_STATUS, type Project } from "../board/projects.ts";
import { IconButton } from "../design/components/Button.tsx";
import { ic } from "../design/components/icon.tsx";
import { MenuItem, MenuLabel, MenuSeparator } from "../design/components/Menu.tsx";
import { Pop, usePop } from "../design/components/Pop.tsx";
import { copy, toast } from "../design/components/toast.ts";
import { OwnerAvatar, OwnerMenu, type OwnerMenuProps } from "./OwnerMenu.tsx";
import { HEAD_PAGES, PAGES, PAGE_INFO, PROJECT_PAGES, type Page } from "./pages.ts";

type PageCount = { count: number; old: boolean };

type Props = {
  page: Page;
  onPage: (page: Page) => void;
  counts: Partial<Record<Page, PageCount>>;
  projects: Project[];
  project: string;
  /** Whether the page shown was opened from a project in the side bar. */
  inProject: boolean;
  onProject: (id: string, page: Page) => void;
  onReorder: (id: string, before: string) => void;
  onNewProject: () => void;
  onPalette: () => void;
  collapsed: boolean;
  onCollapse: () => void;
  questions: number;
  owner: OwnerMenuProps;
};

const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";

export function Sidebar(props: Props) {
  const { page, onPage, counts, collapsed, onCollapse, questions, owner, onPalette, inProject } = props;
  const scroll = useRef<HTMLDivElement>(null);
  const [mark, setMark] = useState<{ top: number; height: number; moved: boolean }>();
  const pop = usePop<"user" | "help">();

  useLayoutEffect(() => {
    const root = scroll.current;
    if (!root) return;
    const place = () => {
      const item = root.querySelector<HTMLElement>("[aria-current=page]");
      setMark((before) => (item ? { top: item.offsetTop, height: item.offsetHeight, moved: before !== undefined } : undefined));
    };
    place();
    const resized = new ResizeObserver(place);
    resized.observe(root);
    return () => resized.disconnect();
  }, [page, collapsed, inProject]);

  const tip = (label: string) => (collapsed ? { "data-tip": label, "data-tip-pos": "right" } : {});

  const item = (key: Page, ct?: ReactNode) => {
    const { label, icon } = PAGE_INFO[key];
    const on = key === page && !inProject;
    return (
      <button
        key={key}
        type="button"
        className={`sitem ${on && !mark ? "on" : ""} ${on ? "cur" : ""}`}
        aria-current={on ? "page" : undefined}
        onClick={() => onPage(key)}
        {...tip(label)}
      >
        {ic(icon, 16)}
        <span className="trunc">{label}</span>
        {ct}
      </button>
    );
  };

  const count = (key: Page) => {
    const c = counts[key];
    if (!c || c.count === 0) return undefined;
    return (
      <span className={`ct ${c.old ? "text-bad" : ""}`} title={c.old ? "Something here has waited long" : undefined}>
        {c.count}
      </span>
    );
  };

  return (
    <nav className="side" aria-label="Main">
      <div className="side-top">
        <div className="flex items-center gap-0.5">
          <div className="ws flex-1 min-w-0">
            <span className="ws-logo bg-ink text-ink-inv">{ic(TreeDeciduous, 13)}</span>
            <span className="ws-name trunc">agentree</span>
          </div>
          {!collapsed && (
            <IconButton label="Collapse sidebar" size="sm" className="hide-m" onClick={onCollapse} data-tip="Collapse sidebar  [">
              {ic(PanelLeft, 15)}
            </IconButton>
          )}
        </div>
      </div>

      <div className="side-scroll relative" ref={scroll}>
        {mark && (
          <span
            aria-hidden
            className={`side-mark ${mark.moved ? "moved" : ""}`}
            style={{ height: mark.height, transform: `translateY(${mark.top}px)` }}
          />
        )}
        {collapsed && (
          <button type="button" className="sitem" onClick={onCollapse} data-tip="Expand sidebar" data-tip-pos="right" aria-label="Expand sidebar">
            {ic(PanelLeft, 16)}
          </button>
        )}
        {HEAD_PAGES.map((key) => item(key, key === "inbox" && questions > 0 ? <span className="ct dotc">{questions}</span> : undefined))}
        <div className="sgroup">
          <div className="sgroup-h">Workspace</div>
          {PAGES.map((key) => item(key, count(key)))}
        </div>
        <Projects {...props} />
      </div>

      <div className="side-bot">
        <button type="button" className="sitem" onClick={pop.toggle("help")} {...tip("Help")}>
          {ic(PAGE_INFO.help.icon, 16)}
          <span>Help & resources</span>
        </button>
        {item("options")}
        <button
          type="button"
          className="sitem h-9"
          onClick={pop.toggle("user")}
          aria-haspopup="menu"
          aria-expanded={pop.open?.key === "user"}

          {...tip("Profile")}
        >
          <OwnerAvatar size="sm" presence />
          <span className="trunc text-ink font-medium">Owner</span>
          <span className="ct">{ic(ChevronsUpDown, 13)}</span>
        </button>
      </div>

      {pop.open?.key === "user" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close} width={260}>
          <OwnerMenu {...owner} />
        </Pop>
      )}
      {pop.open?.key === "help" && (
        <Pop anchor={pop.open.anchor} onClose={pop.close} width={260}>
          <MenuLabel>Help & resources</MenuLabel>
          <MenuItem icon={Keyboard} keys="?" onClick={owner.onShortcuts}>
            Keyboard shortcuts
          </MenuItem>
          <MenuItem icon={Command} keys={`${MOD}K`} onClick={onPalette}>
            Command menu
          </MenuItem>
          <MenuItem icon={BookOpen} onClick={() => onPage("help")}>
            Help & docs
          </MenuItem>
        </Pop>
      )}
    </nav>
  );
}

function Projects({ projects, project, page, inProject, onProject, onReorder, onNewProject, collapsed }: Props) {
  const stars = useStars();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [project]: true });
  const menu = usePop<string>();
  const shown = projects.filter((p) => p.status !== "complete");

  useEffect(() => setDropHandlers({ proj: onReorder }), [onReorder]);

  const toggle = (id: string) => setExpanded((now) => ({ ...now, [id]: !now[id] }));
  const menuFor = menu.open && shown.find((p) => p.id === menu.open!.key);

  return (
    <div className="sgroup" id="side-projects">
      <div className="sgroup-h">
        <span>Projects</span>
        <span className="flex-1" />
        <IconButton label="New project" size="xs" onClick={onNewProject} data-tip="New project  P">
          {ic(Plus, 14)}
        </IconButton>
      </div>
      {shown.map((p) => {
        const open = !!expanded[p.id];
        const on = inProject && p.id === project;
        const status = PROJECT_STATUS[p.status];
        return (
          <div key={p.id} className="sproj" data-proj-drop={p.id}>
            <div
              className={`sitem ${on ? "on" : ""}`}
              draggable
              data-drag-proj={p.id}
              role="link"
              tabIndex={0}
              onClick={() => onProject(p.id, "board")}
              onKeyDown={(event) => {
                if (event.key === "Enter") onProject(p.id, "board");
              }}
              {...(collapsed ? { "data-tip": p.name, "data-tip-pos": "right" } : {})}
            >
              <span
                className="pico"
                style={{ "--c": p.color } as React.CSSProperties}
                onClick={(event) => {
                  event.stopPropagation();
                  toggle(p.id);
                }}
                aria-label="Toggle sub-pages"
              >
                {ic(p.icon, 12)}
              </span>
              <span className="trunc">{p.name}</span>
              {stars.has(`project:${p.id}`) && <span className="fav">{ic(Star, 11)}</span>}
              {p.private && <span className="faint ml-1">{ic(Lock, 11)}</span>}
              <span className="sdot" style={{ background: status.color }} title={status.name} />
              <span className="hov">
                <span
                  className="ibtn ibtn-xs"
                  role="button"
                  aria-label="Project options"
                  onClick={(event) => {
                    event.stopPropagation();
                    menu.toggle(p.id)(event);
                  }}
                >
                  {ic(Ellipsis, 14)}
                </span>
                <span
                  className="ibtn ibtn-xs"
                  role="button"
                  aria-label="Expand"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(p.id);
                  }}
                >
                  {ic(ChevronRight, 13, `chev ${open ? "open" : ""}`)}
                </span>
              </span>
            </div>
            <div className={`sub ${open && !collapsed ? "open" : ""}`}>
              {PROJECT_PAGES.map(([key, Icon]) => (
                <button key={key} type="button" className={`sitem ${on && page === key ? "on" : ""}`} onClick={() => onProject(p.id, key)}>
                  {ic(Icon, 14)}
                  <span>{PAGE_INFO[key].label}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {menuFor && menu.open && (
        <Pop anchor={menu.open.anchor} onClose={menu.close}>
          <MenuItem icon={ArrowUpRight} onClick={() => onProject(menuFor.id, "board")}>
            Open
          </MenuItem>
          <MenuItem
            icon={Star}
            onClick={() => {
              const on = toggleStar(`project:${menuFor.id}`);
              toast(on ? "Added to favorites" : "Removed from favorites", { ms: 1800 });
            }}
          >
            {stars.has(`project:${menuFor.id}`) ? "Remove from favorites" : "Add to favorites"}
          </MenuItem>
          <MenuItem icon={Link} onClick={() => copy(`${location.origin}/project/${menuFor.id}`)}>
            Copy link
          </MenuItem>
          <MenuSeparator />
          {shown.indexOf(menuFor) > 0 && (
            <MenuItem icon={ArrowUp} onClick={() => onReorder(menuFor.id, shown[shown.indexOf(menuFor) - 1]!.id)}>
              Move up in sidebar
            </MenuItem>
          )}
          {shown.indexOf(menuFor) < shown.length - 1 && (
            <MenuItem
              icon={ArrowDown}
              onClick={() => {
                const after = shown[shown.indexOf(menuFor) + 2];
                onReorder(menuFor.id, after ? after.id : "");
              }}
            >
              Move down in sidebar
            </MenuItem>
          )}
        </Pop>
      )}
    </div>
  );
}
