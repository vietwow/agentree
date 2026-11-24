import { Star } from "lucide-react";
import { useStars } from "../board/favorites.ts";
import type { Project } from "../board/projects.ts";
import { STATUS_LABEL, type Task } from "../board/task.ts";
import { Button } from "../design/components/Button.tsx";
import { Empty } from "../design/components/Empty.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Panel } from "../design/components/Panel.tsx";
import { PriorityIcon } from "../ui/PriorityIcon.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";
import { style } from "./parts.tsx";
import { ProjectCard } from "./ProjectsPage.tsx";

type Props = {
  projects: Project[];
  tasks: Task[];
  now: Date;
  onOpenProject: (id: string) => void;
  onOpenTask: (id: string) => void;
  onBrowse: () => void;
};

export function FavoritesPage({ projects, tasks, now, onOpenProject, onOpenTask, onBrowse }: Props) {
  const stars = useStars();
  const ps = projects.filter((p) => stars.has(`project:${p.id}`));
  const ts = tasks.filter((t) => stars.has(`task:${t.id}`));
  const home = projects.find((p) => p.id === "agentree")!;

  return (
    <Page layout="wide">
      <PageHeader title="Favorites">Projects and tasks you've starred for quick access.</PageHeader>
      {!ps.length && !ts.length ? (
        <Panel>
          <Empty icon={Star} title="No favorites yet" text="Star a project or task to pin it here.">
            <Button size="sm" onClick={onBrowse}>
              Browse projects
            </Button>
          </Empty>
        </Panel>
      ) : (
        <>
          <h2 className="sec mb-2.5">
            Projects <span className="faint font-medium">{ps.length}</span>
          </h2>
          {ps.length ? (
            <div className="pgrid mb-7">
              {ps.map((p) => (
                <ProjectCard key={p.id} project={p} now={now} starred onOpen={onOpenProject} more={() => null} />
              ))}
            </div>
          ) : (
            <p className="faint mb-7">No favorite projects.</p>
          )}
          <h2 className="sec mb-1.5">
            Tasks <span className="faint font-medium">{ts.length}</span>
          </h2>
          {ts.length ? (
            <Panel clip>
              {ts.map((t) => (
                <div
                  key={t.id}
                  className={`mini ${t.status === "done" ? "done" : ""}`}
                  role="button"
                  tabIndex={0}
                  data-opens-task
                  onClick={() => onOpenTask(t.id)}
                  onKeyDown={(e) => e.key === "Enter" && onOpenTask(t.id)}
                >
                  <span data-tip={STATUS_LABEL[t.status]}>
                    <StatusIcon status={t.status} />
                  </span>
                  <span className="tt">{t.title}</span>
                  <span className="pj hide-m">
                    <span className="pdot" style={style({ "--c": home.color })} />
                    <span className="trunc">{home.name}</span>
                  </span>
                  <span data-tip={`Priority ${t.priority}`}>
                    <PriorityIcon priority={t.priority} />
                  </span>
                  <ToolMark tool={t.holder?.tool} size={20} />
                </div>
              ))}
            </Panel>
          ) : (
            <p className="faint">Open a task and click the star to add it here.</p>
          )}
        </>
      )}
    </Page>
  );
}
