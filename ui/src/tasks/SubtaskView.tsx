import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Folder, Trash2, User } from "lucide-react";
import { useEffect } from "react";
import { TOOL_LABEL, type Task } from "../board/task.ts";
import { ic } from "../ui/ic.tsx";
import { toast } from "../ui/toast.ts";
import { ToolMark } from "../ui/ToolMark.tsx";
import { SubCheck } from "./SubCheck.tsx";

const notBuilt = (what: string) => toast(`${what} is not built yet`, { kind: "info", ms: 2200 });

/** gr8r-studio's subtask view, in place of the task drawer's body. */
export function SubtaskView({
  task: t,
  id,
  popped,
  onOpen,
  onClose,
}: {
  task: Task;
  id: string;
  popped?: string;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const i = t.subtasks.findIndex((s) => s.id === id);
  const s = t.subtasks[i];

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    addEventListener("keydown", onKey, true);
    return () => removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (!s) return null;
  return (
    <div className="subview">
      <button type="button" className="pillbtn" onClick={onClose} style={{ margin: "-4px 0 14px -7px", fontSize: 12.5, color: "var(--ink-2)" }}>
        {ic(ArrowLeft, 14)}
        <span className="trunc" style={{ maxWidth: 420 }}>
          {t.title}
        </span>
      </button>
      <div className={`row ${popped === s.id ? "fx-done" : ""}`} style={{ gap: 10, alignItems: "flex-start" }}>
        <span style={{ marginTop: 9, display: "flex" }}>
          <SubCheck id={s.id} done={s.done} title={s.title} round />
        </span>
        <div className="ttl-edit" style={s.done ? { textDecoration: "line-through", color: "var(--ink-3)" } : undefined}>
          {s.title}
        </div>
      </div>
      <div className="faint" style={{ fontSize: 12, margin: "4px 0 0 26px" }}>
        Subtask {i + 1} of {t.subtasks.length} · {s.done ? "Done" : "Open"}
      </div>
      <dl className="kv" style={{ marginTop: 16 }}>
        <dt>{ic(User, 14)}Assignee</dt>
        <dd>
          <span className={`pillbtn ${t.holder ? "" : "empty"}`}>
            {t.holder ? (
              <>
                <ToolMark tool={t.holder.tool} size={20} />
                <span>
                  {TOOL_LABEL[t.holder.tool]} · {t.holder.model}
                </span>
              </>
            ) : (
              <span>Its task's worker</span>
            )}
          </span>
        </dd>
        <dt>{ic(Folder, 14)}Parent</dt>
        <dd>
          <button type="button" className="pillbtn" onClick={onClose}>
            <span className="mono faint" style={{ fontSize: 11 }}>
              {t.id}
            </span>
            {t.title}
          </button>
        </dd>
      </dl>
      <div className="dsec">
        <div className="dsec-h">
          <h3 id="s-note-l">Notes</h3>
        </div>
        <textarea
          className="textarea"
          rows={4}
          readOnly
          placeholder="No notes. The task's worker writes them in the task's file."
          aria-labelledby="s-note-l"
        />
      </div>
      <div className="dsec row" style={{ gap: 6, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => notBuilt("Converting a subtask to a task")}>
          {ic(ArrowUpRight, 13)}Convert to task
        </button>
        <span className="sp" />
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={i === 0}
          onClick={() => onOpen(t.subtasks[i - 1]!.id)}
          aria-label="Previous subtask"
        >
          {ic(ChevronLeft, 14)}Previous
        </button>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={i === t.subtasks.length - 1}
          onClick={() => onOpen(t.subtasks[i + 1]!.id)}
          aria-label="Next subtask"
        >
          Next{ic(ChevronRight, 14)}
        </button>
        <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => notBuilt("Deleting a subtask")}>
          {ic(Trash2, 13)}Delete
        </button>
      </div>
    </div>
  );
}
