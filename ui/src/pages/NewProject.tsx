import { useEffect, useState } from "react";
import { machine, post, type Machine } from "../board/daemon.ts";
import { TOOL_LABEL, type Tool } from "../board/task.ts";
import { Button } from "../design/components/Button.tsx";
import { Modal } from "../design/components/Modal.tsx";
import { toast } from "../design/components/toast.ts";

/**
 * A new project: what the kickstart asks, in its order. The daemon makes the
 * folder under the directory of projects and sets it up; the page holds no
 * step of its own.
 */
export function NewProject({ onClose, onMade }: { onClose: () => void; onMade: (id: string) => void }) {
  const [asked, setAsked] = useState<Machine>();
  const [directory, setDirectory] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [tools, setTools] = useState<Tool[]>([]);
  const [goal, setGoal] = useState("");
  const [stack, setStack] = useState<Record<string, string>>({});
  const [reference, setReference] = useState("");
  const [own, setOwn] = useState({ colours: true, font: true });
  const [committed, setCommitted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void machine().then((given) => {
      setAsked(given);
      setTools(given.tools);
      setDirectory(given.projects ?? "");
    });
  }, []);

  const clone = reference.trim() && {
    reference: reference.trim(),
    colours: own.colours ? "own" : "reference",
    font: own.font ? "own" : "reference",
    drawings: committed ? "committed" : "machine",
  };

  const make = async () => {
    setBusy(true);
    const named = asked?.projects || (await post<{ projects: string }>("/api/machine", { projects: directory.trim() }));
    const made =
      named && (await post<{ id: string; byHand: string[] }>("/api/projects", { name, desc, tools, goal, stack, ...(clone ? { clone } : {}) }));
    setBusy(false);
    if (!made) return;
    toast(`Made “${name.trim()}”${made.byHand.length ? `; ${made.byHand.length} things are left to you, which \`agentree doctor\` lists` : ""}`, {
      kind: "ok",
      ms: 5000,
    });
    onMade(made.id);
    onClose();
  };

  const ready = name.trim() !== "" && tools.length > 0 && (asked?.projects || directory.trim() !== "");

  return (
    <Modal
      title="New project"
      sub="A folder under your directory of projects, set up so that agents of any tool start working in it."
      size="lg"
      onClose={onClose}
      foot={
        <>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !asked || !ready} onClick={() => void make()}>
            Make the project
          </Button>
        </>
      }
    >
      <div className="modal-b flex flex-col gap-3.5">
        {asked && !asked.projects && (
          <label className="field">
            <span className="label">The directory your projects are in</span>
            <input
              className="input mono"
              value={directory}
              placeholder="Its absolute path; named once for this machine"
              onChange={(event) => setDirectory(event.target.value)}
            />
          </label>
        )}
        <label className="field">
          <span className="label">Name</span>
          <input
            className="input"
            autoFocus
            value={name}
            placeholder="Its folder takes this name, in lower-case words"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="label">What it is</span>
          <input className="input" value={desc} placeholder="A line for the list of projects" onChange={(event) => setDesc(event.target.value)} />
        </label>
        <div className="field">
          <span className="label">The tools that will work on it</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(asked?.tools ?? []).map((tool) => (
              <label key={tool} className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="check"
                  checked={tools.includes(tool)}
                  onChange={() => setTools((now) => (now.includes(tool) ? now.filter((each) => each !== tool) : [...now, tool]))}
                />
                {TOOL_LABEL[tool]}
              </label>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="label">A first goal</span>
          <textarea
            className="textarea"
            value={goal}
            placeholder="In your words; it becomes the first card, for the planner to break down"
            onChange={(event) => setGoal(event.target.value)}
          />
        </label>
        <div className="field">
          <span className="label">The stack</span>
          <span className="faint text-(length:--text-xs)">
            Each is optional: what you leave empty, the planner decides in the project's first ADR.
          </span>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-2 mt-1">
            {(asked?.stack ?? []).map((question) => (
              <input
                key={question}
                className="input"
                aria-label={question}
                placeholder={question}
                value={stack[question] ?? ""}
                onChange={(event) => setStack((now) => ({ ...now, [question]: event.target.value }))}
              />
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">An interface it reproduces</span>
          <span className="faint text-(length:--text-xs)">
            Optional: the address of a site whose interface the project is built to match. It is read there and never changed.
          </span>
          <input
            className="input mono mt-1"
            aria-label="The reference's address"
            value={reference}
            placeholder="https://…"
            onChange={(event) => setReference(event.target.value)}
          />
          {reference.trim() !== "" && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
              {(["colours", "font"] as const).map((what) => (
                <label key={what} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" className="check" checked={own[what]} onChange={() => setOwn((now) => ({ ...now, [what]: !now[what] }))} />
                  {what === "colours" ? "Its colours are its own" : "Its font is its own"}
                </label>
              ))}
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="checkbox" className="check" checked={committed} onChange={() => setCommitted((now) => !now)} />
                Fetched drawings are committed
              </label>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
