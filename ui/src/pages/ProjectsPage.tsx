import {
  Calendar,
  CircleCheck,
  Clock,
  Ellipsis,
  FolderKanban,
  LayoutGrid,
  Link,
  List,
  Lock,
  Plus,
  Search,
  SearchX,
  Star,
  Table2,
} from "lucide-react";
import { useState } from "react";
import { toggleStar, useStars } from "../board/favorites.ts";
import { PROJECT_STATUS, progressOf, type Project, type ProjectStatus } from "../board/projects.ts";
import { Ago } from "../design/components/Ago.tsx";
import { Button, IconButton } from "../design/components/Button.tsx";
import { Empty } from "../design/components/Empty.tsx";
import { ic } from "../design/components/icon.tsx";
import { MenuItem } from "../design/components/Menu.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Panel } from "../design/components/Panel.tsx";
import { Pop, usePop } from "../design/components/Pop.tsx";
import { ProgressBar } from "../design/components/ProgressBar.tsx";
import { Segmented } from "../design/components/Segmented.tsx";
import { Select } from "../design/components/Select.tsx";
import { copy, toast } from "../design/components/toast.ts";
import { shortDate } from "../design/format/time.ts";
import { ToolStack } from "../ui/ToolMark.tsx";
import { PIcon, PStatus } from "./parts.tsx";

type View = "grid" | "list" | "table";
type Sort = "recent" | "name" | "created" | "progress";

const VIEWS: [View, string, typeof List][] = [
  ["grid", "Grid", LayoutGrid],
  ["list", "List", List],
  ["table", "Table", Table2],
];
const SORT_OPTIONS: [Sort, string][] = [
  ["recent", "Sort: Recently active"],
  ["name", "Sort: Name"],
  ["created", "Sort: Created"],
  ["progress", "Sort: Progress"],
];
const STATUS_OPTIONS: ["all" | ProjectStatus, string][] = [
  ["all", "All statuses"],
  ...(Object.entries(PROJECT_STATUS) as [ProjectStatus, { name: string }][]).map(([k, v]): [ProjectStatus, string] => [k, v.name]),
];

const tone = (p: Project) => (p.status === "complete" ? "good" : p.status === "risk" ? "bad" : undefined);

type Props = { projects: Project[]; now: Date; onOpen: (id: string) => void };

export function ProjectsPage({ projects, now, onOpen }: Props) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ProjectStatus>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [view, setView] = useState<View>("grid");
  const menu = usePop<string>();
  const stars = useStars();

  const query = q.toLowerCase();
  const sorter: Record<Sort, (p: Project) => number | string> = {
    recent: (p) => -p.lastAt.getTime(),
    name: (p) => p.name,
    created: (p) => p.createdAt.getTime(),
    progress: (p) => -progressOf(p),
  };
  const shown = projects
    .filter((p) => (status === "all" || p.status === status) && (!q || p.name.toLowerCase().includes(query) || p.desc.toLowerCase().includes(query)))
    .sort((a, b) => (sorter[sort](a) > sorter[sort](b) ? 1 : -1));
  const active = projects.filter((p) => p.status !== "complete").length;

  const more = (p: Project, extra = "") => (
    <IconButton
      label="Project options"
      size="sm"
      className={`more ${extra}`}
      onClick={(event) => {
        event.stopPropagation();
        menu.toggle(p.id)(event);
      }}
    >
      {ic(Ellipsis, 14)}
    </IconButton>
  );

  let body;
  if (!projects.length)
    body = (
      <Panel>
        <Empty icon={FolderKanban} title="No projects yet" text="Register a repository to start organizing its work." />
      </Panel>
    );
  else if (!shown.length)
    body = (
      <Panel>
        <Empty icon={SearchX} title="No results found" text="No projects match your search or filters. Try a different term.">
          <Button
            size="sm"
            onClick={() => {
              setQ("");
              setStatus("all");
            }}
          >
            Clear filters
          </Button>
        </Empty>
      </Panel>
    );
  else if (view === "grid")
    body = (
      <div className="pgrid">
        {shown.map((p) => (
          <ProjectCard key={p.id} project={p} now={now} starred={stars.has(`project:${p.id}`)} onOpen={onOpen} more={more} />
        ))}
      </div>
    );
  else if (view === "list")
    body = (
      <Panel clip>
        {shown.map((p) => {
          const pr = progressOf(p);
          return (
            <div key={p.id} className="mini min-h-13 gap-3" role="link" tabIndex={0} onClick={() => onOpen(p.id)}>
              <PIcon project={p} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <b className="font-medium">{p.name}</b>
                  {p.private && ic(Lock, 12)}
                </div>
                <div className="trunc faint text-(length:--text-xs)">{p.desc}</div>
              </div>
              <span className="hide-m">
                <PStatus status={p.status} />
              </span>
              <span className="flex items-center gap-2 hide-m w-35">
                <ProgressBar value={pr} />
                <span className="num faint text-(length:--text-xs)">{pr}%</span>
              </span>
              <span className="num muted hide-m w-17.5 text-(length:--text-xs)">{shortDate(p.createdAt, now)}</span>
              <ToolStack tools={p.tools.slice(0, 3)} />
              {more(p)}
            </div>
          );
        })}
      </Panel>
    );
  else
    body = (
      <Panel className="overflow-x-auto">
        <table className="tbl w-full min-w-240" aria-label="Projects">
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col" className="w-34">
                Status
              </th>
              <th scope="col" className="w-30">
                Workers
              </th>
              <th scope="col" className="w-50">
                Progress
              </th>
              <th scope="col" className="w-20 text-right">
                Tasks
              </th>
              <th scope="col" className="w-28">
                Created
              </th>
              <th scope="col" className="w-32">
                Last activity
              </th>
              <th scope="col" className="w-12">
                <span className="sr">Options</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const pr = progressOf(p);
              return (
                <tr className="cursor-pointer" key={p.id} onClick={() => onOpen(p.id)}>
                  <td>
                    <span className="flex items-center gap-2">
                      <PIcon project={p} size={14} />
                      <span className="trunc font-medium">{p.name}</span>
                    </span>
                  </td>
                  <td>
                    <PStatus status={p.status} />
                  </td>
                  <td>
                    <ToolStack tools={p.tools.slice(0, 4)} />
                  </td>
                  <td>
                    <span className="flex items-center gap-2">
                      <ProgressBar value={pr} />
                      <span className="num faint w-9 shrink-0 text-right text-(length:--text-xs)">{pr}%</span>
                    </span>
                  </td>
                  <td className="num text-right">{p.total}</td>
                  <td className="num muted">{shortDate(p.createdAt, now)}</td>
                  <td className="muted">
                    <Ago at={p.lastAt} now={now} />
                  </td>
                  <td className="text-center">{more(p)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    );

  const menuFor = menu.open && projects.find((p) => p.id === menu.open!.key);

  return (
    <Page layout="wide">
      <PageHeader
        title="Projects"
        actions={
          <>
            <Button variant="primary" onClick={() => toast("Registering a project is not built yet", { kind: "info", ms: 2200 })}>
              {ic(Plus, 14)}New project
            </Button>
          </>
        }
      >
        {active} active · {projects.length - active} completed
      </PageHeader>
      <div className="flex items-center mb-4 flex-wrap gap-2">
        <div className="inwrap">
          {ic(Search, 13)}
          <input
            className="input search-sm"
            placeholder="Search projects"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search projects"
          />
        </div>
        <Select value={status} options={STATUS_OPTIONS} onChange={setStatus} label="Filter by status" size="sm" />
        <Select value={sort} options={SORT_OPTIONS} onChange={setSort} label="Sort" size="sm" />
        <span className="flex-1" />
        <Segmented label="Layout" value={view} onChange={setView} collapse options={VIEWS.map(([value, label, icon]) => ({ value, label, icon }))} />
      </div>
      {body}
      {menuFor && menu.open && (
        <Pop anchor={menu.open.anchor} onClose={menu.close}>
          <MenuItem icon={FolderKanban} onClick={() => onOpen(menuFor.id)}>
            Open
          </MenuItem>
          <MenuItem
            icon={Star}
            onClick={() => toast(toggleStar(`project:${menuFor.id}`) ? "Added to favorites" : "Removed from favorites", { ms: 1800 })}
          >
            {stars.has(`project:${menuFor.id}`) ? "Remove from favorites" : "Add to favorites"}
          </MenuItem>
          <MenuItem icon={Link} onClick={() => copy(`${location.origin}/project/${menuFor.id}`)}>
            Copy link
          </MenuItem>
        </Pop>
      )}
    </Page>
  );
}

export function ProjectCard({
  project: p,
  now,
  starred,
  onOpen,
  more,
}: {
  project: Project;
  now: Date;
  starred: boolean;
  onOpen: (id: string) => void;
  more: (p: Project, className?: string) => React.ReactNode;
}) {
  const pr = progressOf(p);
  return (
    <div
      className="pcard"
      role="link"
      tabIndex={0}
      aria-label={p.name}
      onClick={() => onOpen(p.id)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}
    >
      <div className="flex items-center gap-2">
        <PIcon project={p} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <b className="trunc text-(length:--text-md) font-semibold">{p.name}</b>
            {starred && <span className="text-warn">{ic(Star, 12)}</span>}
            {p.private && (
              <span className="faint" data-tip="Private project">
                {ic(Lock, 12)}
              </span>
            )}
          </div>
        </div>
        <PStatus status={p.status} />
      </div>
      <div className="desc">{p.desc}</div>
      <div className="flex items-center gap-2.5">
        <ProgressBar value={pr} tone={tone(p)} />
        <span className="num text-(length:--text-xs) font-medium">{pr}%</span>
      </div>
      <div className="foot">
        <span className="flex items-center gap-1">
          {ic(CircleCheck, 12)}
          {p.done}/{p.total}
        </span>
        <span className="flex items-center gap-1" title="Created">
          {ic(Calendar, 12)}
          {shortDate(p.createdAt, now)}
        </span>
        <span className="flex items-center hide-m gap-1" title="Last activity">
          {ic(Clock, 12)}
          <Ago at={p.lastAt} now={now} />
        </span>
        <span className="flex-1" />
        <ToolStack tools={p.tools.slice(0, 3)} />
      </div>
      {more(p, "bg-surface ring-1 ring-line")}
    </div>
  );
}
