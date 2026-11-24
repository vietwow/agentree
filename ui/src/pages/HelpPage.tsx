import { STATUS_LABEL, type Status } from "../board/task.ts";
import { Page, PageHeader } from "../design/components/Page.tsx";
import { Panel, PanelBody } from "../design/components/Panel.tsx";
import { StatusIcon } from "../ui/StatusIcon.tsx";

/** A task's way, a status a line: what holds in it, and who moves it on. */
const WAY: [Status, string][] = [
  ["backlog", "Written, and not for taking yet. You make it ready, or every one whose dependencies are done at once."],
  ["ready", "A worker may claim it: the claim gives it a tree and a branch of its own, and no other task may write its paths meanwhile."],
  [
    "in-progress",
    "A worker holds it and builds in its tree. A claim not heard from for 30 minutes is stale: you release it, or the daemon does when you set so.",
  ],
  ["checking", "It was submitted. The daemon runs its checks, each heavy one in its turn of the machine's queue."],
  ["review", "Its checks passed. Another session reads its change, here on its card or in its tree, and accepts it or rejects it with findings."],
  ["accepted", "It waits for its turn to land. The daemon rebases it on main when main moved, checks it again, and lands it."],
  ["done", "Its change is on main, and its tree is removed."],
  ["blocked", "Its worker gave it back and said what it waits for."],
  ["dropped", "You set it aside. Its branch stays."],
];

/** What a session of a tool runs, by the command; each is an MCP tool of the same name too. */
const COMMANDS: [string, string][] = [
  ["agentree next", "The ready tasks that can be claimed now, and why the others cannot."],
  ["agentree claim T-0042", "Take a task: its tree, its branch, and the card to work from."],
  ["agentree log T-0042", "Add an entry to its Log: what was done, what is left, what was found."],
  ["agentree ask T-0042", "Ask you a question on its card; it shows in the Inbox."],
  ["agentree submit T-0042", "Hand it in: its checks run, and it goes to review when they pass."],
  ["agentree review T-0042", "Mark it as under review by this session, which did not build it."],
  ["agentree accept T-0042 / reject T-0042", "The verdict, with what was read or with findings."],
  ["agentree new --title … --kind … --priority …", "Write a card; it answers with what the card lacks of the board's form."],
  ["agentree doctor", "What of the project's setup is there, and what is missing."],
  ["agentree lint", "What is wrong on the board, and which cards lack of its form."],
];

const code = "font-mono text-xs leading-5 rounded-xs bg-surface-2 px-1 py-0.25";

/** How the board works, for its owner: a task's way, what is done here, and what a session of a tool runs. */
export function HelpPage() {
  return (
    <Page>
      <PageHeader title="Help & docs">How the board works: a task's way, what you do here, and what an agent's session runs.</PageHeader>
      <div className="grid2">
        <Panel title="A task's way" note="one status at a time">
          <PanelBody className="flex flex-col gap-2.5 text-sm">
            {WAY.map(([status, text]) => (
              <div key={status} className="flex items-start gap-2">
                <span className="mt-0.5">
                  <StatusIcon status={status} />
                </span>
                <span>
                  <b className="font-medium">{STATUS_LABEL[status]}.</b> <span className="muted">{text}</span>
                </span>
              </div>
            ))}
          </PanelBody>
        </Panel>

        <div className="stack gap-4">
          <Panel title="What you do here">
            <PanelBody className="flex flex-col gap-2 text-sm">
              <p className="muted">
                Write a card with <b className="font-medium">New</b>, and make it ready. Answer a question in the <b className="font-medium">Inbox</b>{" "}
                or on its card. Release a stale claim on its card. Read the change of a task in review on its card, comment its lines, and reject it
                with them. Set a tool's switch for its own tasks, the queue's bounds and the notices on <b className="font-medium">Options</b>.
              </p>
              <p className="muted">
                Everything else is an agent's: it claims, builds, submits, reviews and lands through the command or its MCP tools, and this page shows
                it as it happens.
              </p>
            </PanelBody>
          </Panel>
          <Panel title="Breaking a goal down">
            <PanelBody className="flex flex-col gap-2 text-sm">
              <p className="muted">
                <b className="font-medium">New</b>, then <b className="font-medium">Break a goal down</b>, writes the goal as a card and gives the
                line to tell a session of your tool, in the project's folder:
              </p>
              <p>
                <span className={code}>Use the skill agentree-plan to break T-0042 down.</span>
              </p>
              <p className="muted">
                The planner writes its parts as backlog cards under it, each in the board's form: a title that says what the change does, a Context, a
                Done when that can be checked, what is out of scope, its steps as subtasks and its checks.
              </p>
            </PanelBody>
          </Panel>
          <Panel title="What a session runs" note="each is an MCP tool too">
            <PanelBody className="flex flex-col gap-2 text-sm">
              {COMMANDS.map(([command, what]) => (
                <div key={command} className="flex flex-col gap-0.5">
                  <span>
                    <span className={code}>{command}</span>
                  </span>
                  <span className="muted">{what}</span>
                </div>
              ))}
              <p className="muted">
                A session names itself in <span className={code}>AGENTREE_WORKER</span> as tool/model. <span className={code}>agentree --help</span>{" "}
                lists every command.
              </p>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </Page>
  );
}
