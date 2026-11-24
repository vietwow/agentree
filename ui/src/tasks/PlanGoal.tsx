import { useState } from "react";
import { post } from "../board/daemon.ts";
import { Button } from "../design/components/Button.tsx";
import { Modal } from "../design/components/Modal.tsx";
import { toast } from "../design/components/toast.ts";

/**
 * A goal for the planner. The planner is a session of the owner's tool, with
 * the skill agentree-plan: this writes the goal as a card, and gives the line
 * that tells a session to break it down.
 */
export function PlanGoal({ project, onClose, onOpenTask }: { project: string; onClose: () => void; onOpenTask: (id: string) => void }) {
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string>();
  const line = `Use the skill agentree-plan to break ${made} down.`;

  const write = async () => {
    setBusy(true);
    const [title] = goal.trim().split("\n");
    const card = await post<{ id: string }>(`/api/projects/${project}/tasks`, {
      title: title!.slice(0, 90),
      kind: "build",
      priority: 1,
      context: goal.trim(),
      backlog: true,
    });
    setBusy(false);
    if (card) setMade(card.id);
  };
  const copy = () => void navigator.clipboard.writeText(line).then(() => toast("Copied", { kind: "ok", ms: 1500 }));

  return (
    <Modal
      title="Plan a goal"
      sub="The goal becomes a card; a session of your tool breaks it down into tasks under it."
      onClose={onClose}
      foot={
        <>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            {made ? "Close" : "Cancel"}
          </Button>
          {made ? (
            <Button
              variant="primary"
              onClick={() => {
                onOpenTask(made);
                onClose();
              }}
            >
              Open {made}
            </Button>
          ) : (
            <Button variant="primary" disabled={busy || goal.trim() === ""} onClick={() => void write()}>
              Write the goal
            </Button>
          )}
        </>
      }
    >
      <div className="modal-b flex flex-col gap-3.5">
        {made ? (
          <>
            <p className="text-sm">
              The goal is <b className="font-medium">{made}</b>, in the backlog. Tell a session of your tool, in the project's folder:
            </p>
            <div className="flex items-center gap-2">
              <code className="mono flex-1 rounded-xs bg-surface-2 px-2 py-1.5 text-xs">{line}</code>
              <Button size="sm" onClick={copy}>
                Copy
              </Button>
            </div>
            <p className="faint text-(length:--text-xs)">
              Its parts appear here as backlog cards under {made}, for you to make ready. No session is started from this page.
            </p>
          </>
        ) : (
          <label className="field">
            <span className="label">The goal</span>
            <textarea
              className="textarea"
              autoFocus
              rows={6}
              value={goal}
              placeholder="In your words: its first line is the card's title, and all of it is what the planner works from"
              onChange={(event) => setGoal(event.target.value)}
            />
          </label>
        )}
      </div>
    </Modal>
  );
}
