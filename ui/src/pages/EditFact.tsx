import { useState } from "react";
import { board, send } from "../board/daemon.ts";
import type { Fact } from "../board/model.ts";
import { Button } from "../design/components/Button.tsx";
import { Modal } from "../design/components/Modal.tsx";

/** The owner changes a fact's line and its words; the daemon writes them into its file. */
export function EditFact({ fact, onClose }: { fact: Fact; onClose: () => void }) {
  const [title, setTitle] = useState(fact.title);
  const [body, setBody] = useState(fact.body);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const written = await send(`/api/projects/${board().project.id}/memory/${fact.file}`, { title: title.trim(), body: body.trim() });
    setBusy(false);
    if (written) onClose();
  };
  return (
    <Modal
      title="Edit a fact"
      sub={<span className="mono">work/memory/{fact.file}.md</span>}
      onClose={onClose}
      foot={
        <>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || title.trim() === "" || body.trim() === ""} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="modal-b flex flex-col gap-3.5">
        <label className="field">
          <span className="label">The fact in a line</span>
          <input className="input" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="field">
          <span className="label">What it is, and why</span>
          <textarea className="textarea min-h-40" value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
      </div>
    </Modal>
  );
}
