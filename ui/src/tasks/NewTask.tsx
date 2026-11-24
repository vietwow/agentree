import { useState } from "react";
import { board, parentTitles, send } from "../board/daemon.ts";
import { KIND_LABEL, KINDS, type Kind } from "../board/task.ts";
import { Button } from "../design/components/Button.tsx";
import { Modal } from "../design/components/Modal.tsx";
import { Select } from "../design/components/Select.tsx";
import { toast } from "../design/components/toast.ts";

const PRIORITIES = ["1", "2", "3", "4", "5"] as const;
const NONE = "none";

/** The entries of a field a line each, or with commas between them. */
const entries = (text: string) =>
  text
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

/** A new task of the open project, written by the daemon: ready when it waits for nothing, backlog otherwise. */
export function NewTask({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<Kind>("build");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("3");
  const [parent, setParent] = useState(NONE);
  const [context, setContext] = useState("");
  const [doneWhen, setDoneWhen] = useState("");
  const [outOfScope, setOutOfScope] = useState("");
  const [writes, setWrites] = useState("");
  const [checks, setChecks] = useState("");
  const [busy, setBusy] = useState(false);
  const parents = Object.entries(parentTitles());

  const create = async () => {
    setBusy(true);
    const written = await send(`/api/projects/${board().project.id}/tasks`, {
      title,
      kind,
      priority: Number(priority),
      ...(parent === NONE ? {} : { parent }),
      context,
      doneWhen,
      outOfScope,
      writes: entries(writes),
      checks: checks
        .split("\n")
        .map((check) => check.trim())
        .filter(Boolean),
    });
    setBusy(false);
    if (!written) return;
    toast(`Created “${title.trim()}”`, { kind: "ok", ms: 2600 });
    onClose();
  };

  const area = (label: string, value: string, set: (value: string) => void, hint: string) => (
    <label className="field">
      <span className="label">{label}</span>
      <textarea className="textarea" value={value} placeholder={hint} onChange={(event) => set(event.target.value)} />
    </label>
  );

  return (
    <Modal
      title="New task"
      sub="A task is claimed once its Context, Done when and Out of scope are written."
      size="lg"
      onClose={onClose}
      foot={
        <>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || title.trim() === ""} onClick={() => void create()}>
            Create task
          </Button>
        </>
      }
    >
      <div className="modal-b flex flex-col gap-3.5">
        <label className="field">
          <span className="label">Title</span>
          <input className="input" autoFocus value={title} placeholder="What it is" onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="flex gap-3 flex-wrap">
          <div className="field">
            <span className="label">Kind</span>
            <Select value={kind} options={KINDS.map((each) => [each, KIND_LABEL[each]] as const)} onChange={setKind} label="Kind" />
          </div>
          <div className="field">
            <span className="label">Priority</span>
            <Select value={priority} options={PRIORITIES.map((each) => [each, `P${each}`] as const)} onChange={setPriority} label="Priority" />
          </div>
          <div className="field flex-1 min-w-50">
            <span className="label">Parent</span>
            <Select
              value={parent}
              options={[[NONE, "No parent"] as const, ...parents.map(([id, name]) => [id, name] as const)]}
              onChange={setParent}
              label="Parent"
            />
          </div>
        </div>
        {area("Context", context, setContext, "Why it is needed, and what its worker has to know")}
        {area("Done when", doneWhen, setDoneWhen, "- What holds when it is done, a line each")}
        {area("Out of scope", outOfScope, setOutOfScope, "What it does not do")}
        {area("Writes", writes, setWrites, "The paths only it may change: files, or directories ending in /")}
        {area("Checks", checks, setChecks, "The commands that pass before it is submitted, a line each")}
      </div>
    </Modal>
  );
}
