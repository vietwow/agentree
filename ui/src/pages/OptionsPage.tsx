import { useEffect, useState } from "react";
import { board, machine, send, slots, type Machine } from "../board/daemon.ts";
import { TOOL_LABEL } from "../board/task.ts";
import { Button } from "../design/components/Button.tsx";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Panel, PanelBody } from "../design/components/Panel.tsx";
import { ToolMark } from "../ui/ToolMark.tsx";

/** What the owner sets: each tool's switch for its own tasks, on the open project; the bounds of the queue and the directory of projects, on this machine. */
export function OptionsPage() {
  const { tools, project } = board();
  const { bounds } = slots();
  const [asked, setAsked] = useState<Machine>();
  const [lowest, setLowest] = useState(String(bounds.lowest));
  const [highest, setHighest] = useState(String(bounds.highest));
  const [margin, setMargin] = useState(String(Math.round(bounds.margin * 100)));
  useEffect(() => void machine().then(setAsked), []);
  const changed = Number(lowest) !== bounds.lowest || Number(highest) !== bounds.highest || Number(margin) !== Math.round(bounds.margin * 100);

  const number = (label: string, value: string, set: (value: string) => void, unit = "") => (
    <label className="flex items-center gap-2 justify-between">
      <span className="muted">{label}</span>
      <span className="flex items-center gap-1.5">
        <input
          className="input w-16 text-right num"
          inputMode="numeric"
          value={value}
          aria-label={label}
          onChange={(event) => set(event.target.value)}
        />
        <span className="faint w-3">{unit}</span>
      </span>
    </label>
  );

  return (
    <Page>
      <PageHeader title="Options">What you set: on {project.name}, and on this machine.</PageHeader>
      <div className="grid2">
        <Panel title="A tool's own tasks" note={`on ${project.name}`}>
          <PanelBody className="flex flex-col gap-2.5 text-sm">
            <p className="muted">
              Whether a tool may start a reviewer for a task the same tool built. A session never reviews the task it built, whatever is set here.
            </p>
            {tools.map((tool) => (
              <label key={tool.tool} className="flex items-center gap-2 justify-between cursor-pointer">
                <span className="flex items-center gap-2">
                  <ToolMark tool={tool.tool} size={20} />
                  {TOOL_LABEL[tool.tool]}
                </span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={tool.reviewsOwn}
                  onChange={() => void send(`/api/projects/${project.id}/options`, { tool: tool.tool, reviewOwnTasks: !tool.reviewsOwn })}
                  aria-label={`${TOOL_LABEL[tool.tool]} may review its own tasks`}
                />
              </label>
            ))}
          </PanelBody>
        </Panel>

        <div className="stack gap-4">
          <Panel title="The queue of heavy runs" note="this machine's">
            <PanelBody className="flex flex-col gap-2.5 text-sm">
              {number("Lowest number of runs", lowest, setLowest)}
              {number("Highest number of runs", highest, setHighest)}
              {number("Margin kept free", margin, setMargin, "%")}
              <label className="flex items-center gap-2 justify-between cursor-pointer">
                <span className="muted">Hold the number fixed</span>
                <input
                  type="checkbox"
                  className="toggle"
                  checked={bounds.fixed}
                  onChange={() => void send("/api/slots/bounds", { fixed: !bounds.fixed })}
                />
              </label>
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!changed}
                  onClick={() => void send("/api/slots/bounds", { lowest: Number(lowest), highest: Number(highest), margin: Number(margin) / 100 })}
                >
                  Save the bounds
                </Button>
              </div>
            </PanelBody>
          </Panel>
          <Panel title="The directory of projects" note="this machine's">
            <PanelBody className="flex flex-col gap-2 text-sm">
              <p className="muted">New projects are made under it, and nowhere else.</p>
              <code className="mono trunc">{asked ? (asked.projects ?? "Not named yet: “New project” asks for it once.") : ""}</code>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
