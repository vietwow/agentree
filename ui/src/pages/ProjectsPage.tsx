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
import { ic } from "../ui/ic.tsx";
import { Pop, usePop } from "../ui/Pop.tsx";
import { copy, toast } from "../ui/toast.ts";
import { ToolStack } from "../ui/ToolMark.tsx";
import { ago, Empty, fmtDate, PIcon, ProgBar, PStatus } from "./parts.tsx";

type View = "grid" | "list" | "table";
type Sort = "recent" | "name" | "created" | "progress";

const VIEWS: [View, string, typeof List][] = [
  ["grid", "Grid", LayoutGrid],
  ["list", "List", List],
  ["table", "Table", Table2],
];
const SORTS: [Sort, string][] = [
  ["recent", "Recently active"],
  ["name", "Name"],
  ["created", "Created"],
  ["progress", "Progress"],
];

const tone = (p: Project) => (p.status === "complete" ? "green" : p.status === "risk" ? "red" : "");

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

  const more = (p: Project, extra?: React.CSSProperties) => (
    <button
      type="button"
      className="ibtn ibtn-sm more"
      aria-label="Project options"
      style={extra}
      onClick={(event) => {
        event.stopPropagation();
        menu.toggle(p.id)(event);
      }}
    >
      {ic(Ellipsis, 14)}
    </button>
  );

  let body;
  if (!projects.length)
    body = (
      <div className="panel">
        <Empty icon={FolderKanban} title="No projects yet" text="Register a repository to start organizing its work." />
      </div>
    );
  else if (!shown.length)
    body = (
      <div className="panel">
        <Empty icon={SearchX} title="No results found" text="No projects match your search or filters. Try a different term.">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setQ("");
              setStatus("all");
            }}
          >
            Clear filters
          </button>
        </Empty>
      </div>
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
      <div className="panel" style={{ overflow: "hidden" }}>
        {shown.map((p) => {
          const pr = progressOf(p);
          return (
            <div key={p.id} className="mini" style={{ minHeight: 52, gap: 12 }} role="link" tabIndex={0} onClick={() => onOpen(p.id)}>
              <PIcon project={p} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}>
                  <b style={{ fontWeight: 500 }}>{p.name}</b>
                  {p.private && ic(Lock, 12)}
                </div>
                <div className="trunc faint" style={{ fontSize: 12 }}>
                  {p.desc}
                </div>
              </div>
              <span className="hide-m">
                <PStatus status={p.status} />
              </span>
              <span className="row hide-m" style={{ width: 140 }}>
                <ProgBar value={pr} />
                <span className="num faint" style={{ fontSize: 11.5 }}>
                  {pr}%
                </span>
              </span>
              <span className="num muted hide-m" style={{ width: 70, fontSize: 12 }}>
                {fmtDate(p.createdAt, now)}
              </span>
              <ToolStack tools={p.tools.slice(0, 3)} />
              {more(p)}
            </div>
          );
        })}
      </div>
    );
  else
    body = (
      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="perm-t" style={{ minWidth: 860 }}>
          <thead>
            <tr>
              <th style={{ paddingLeft: 14 }}>Project</th>
              <th style={{ textAlign: "left" }}>Status</th>
              <th style={{ textAlign: "left" }}>Workers</th>
              <th style={{ textAlign: "left", width: "16%" }}>Progress</th>
              <th>Tasks</th>
              <th style={{ textAlign: "left" }}>Created</th>
              <th style={{ textAlign: "left" }}>Last activity</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const pr = progressOf(p);
              return (
                <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => onOpen(p.id)}>
                  <td style={{ paddingLeft: 14 }}>
                    <span className="row">
                      <PIcon project={p} size={14} />
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: "left" }}>
                    <PStatus status={p.status} />
                  </td>
                  <td style={{ textAlign: "left" }}>
                    <ToolStack tools={p.tools.slice(0, 4)} />
                  </td>
                  <td>
                    <span className="row">
                      <ProgBar value={pr} />
                      <span className="num faint" style={{ fontSize: 11.5 }}>
                        {pr}%
                      </span>
                    </span>
                  </td>
                  <td className="num">{p.total}</td>
                  <td style={{ textAlign: "left" }} className="num muted">
                    {fmtDate(p.createdAt, now)}
                  </td>
                  <td style={{ textAlign: "left" }} className="muted">
                    {ago(p.lastAt, now)}
                  </td>
                  <td>{more(p)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );

  const menuFor = menu.open && projects.find((p) => p.id === menu.open!.key);

  return (
    <div className="page wide">
      <div className="ph">
        <div>
          <h1>Projects</h1>
          <p>
            {active} active · {projects.length - active} completed
          </p>
        </div>
        <div className="acts">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => toast("Registering a project is not built yet", { kind: "info", ms: 2200 })}
          >
            {ic(Plus, 14)}New project
          </button>
        </div>
      </div>
      <div className="row" style={{ marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
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
        <select
          className="select"
          style={{ height: 26, width: "auto", fontSize: 12 }}
          value={status}
          onChange={(e) => setStatus(e.target.value as "all" | ProjectStatus)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {Object.entries(PROJECT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ height: 26, width: "auto", fontSize: 12 }}
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          aria-label="Sort"
        >
          {SORTS.map(([k, n]) => (
            <option key={k} value={k}>
              Sort: {n}
            </option>
          ))}
        </select>
        <span className="sp" />
        <div className="seg" role="tablist" aria-label="Layout">
          {VIEWS.map(([k, n, Icon]) => (
            <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => setView(k)} aria-label={n}>
              {ic(Icon, 13)}
              <span className="hide-m">{n}</span>
            </button>
          ))}
        </div>
      </div>
      {body}
      {menuFor && menu.open && (
        <Pop anchor={menu.open.anchor} onClose={menu.close}>
          <button type="button" className="mi" onClick={() => onOpen(menuFor.id)}>
            {ic(FolderKanban, 15)}Open
          </button>
          <button
            type="button"
            className="mi"
            onClick={() => toast(toggleStar(`project:${menuFor.id}`) ? "Added to favorites" : "Removed from favorites", { ms: 1800 })}
          >
            {ic(Star, 15)}
            {stars.has(`project:${menuFor.id}`) ? "Remove from favorites" : "Add to favorites"}
          </button>
          <button type="button" className="mi" onClick={() => copy(`${location.origin}/project/${menuFor.id}`)}>
            {ic(Link, 15)}Copy link
          </button>
        </Pop>
      )}
    </div>
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
  more: (p: Project, style?: React.CSSProperties) => React.ReactNode;
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
      <div className="row">
        <PIcon project={p} />
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <b className="trunc" style={{ fontWeight: 600, fontSize: 14 }}>
              {p.name}
            </b>
            {starred && <span style={{ color: "var(--warn)" }}>{ic(Star, 12)}</span>}
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
      <div className="row" style={{ gap: 10 }}>
        <ProgBar value={pr} tone={tone(p)} />
        <span className="num" style={{ fontSize: 12, fontWeight: 500 }}>
          {pr}%
        </span>
      </div>
      <div className="foot">
        <span className="row" style={{ gap: 4 }}>
          {ic(CircleCheck, 12)}
          {p.done}/{p.total}
        </span>
        <span className="row" style={{ gap: 4 }} title="Created">
          {ic(Calendar, 12)}
          {fmtDate(p.createdAt, now)}
        </span>
        <span className="row hide-m" style={{ gap: 4 }} title="Last activity">
          {ic(Clock, 12)}
          {ago(p.lastAt, now)}
        </span>
        <span className="sp" />
        <ToolStack tools={p.tools.slice(0, 3)} />
      </div>
      {more(p, { background: "var(--surface)", boxShadow: "0 0 0 1px var(--line)" })}
    </div>
  );
}
