import { ArrowLeft, ArrowUpRight, ChevronLeft, ChevronRight, Folder, Trash2, User } from "lucide-react";
import { useEffect } from "react";
import { TOOL_LABEL, type Task } from "../board/task.ts";
import { Button } from "../design/components/Button.tsx";
import { ic } from "../design/components/icon.tsx";
import { KeyValues } from "../design/components/KeyValues.tsx";
import { toast } from "../design/components/toast.ts";
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
      <button type="button" className="pillbtn -mt-1 mr-0 mb-3.5 -ml-1.75 text-sm text-ink-2" onClick={onClose}>
        {ic(ArrowLeft, 14)}
        <span className="trunc max-w-105">{t.title}</span>
      </button>
      <div className={`flex items-center gap-2 ${popped === s.id ? "fx-done" : ""} gap-2.5 items-start`}>
        <span className="mt-2.25 flex">
          <SubCheck id={s.id} done={s.done} title={s.title} round />
        </span>
        <div className={`ttl-edit ${s.done ? "text-ink-3 line-through" : ""}`}>{s.title}</div>
      </div>
      <div className="faint text-(length:--text-xs) mt-1 mr-0 mb-0 ml-6.5">
        Subtask {i + 1} of {t.subtasks.length} · {s.done ? "Done" : "Open"}
      </div>
      <KeyValues className="mt-4">
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
            <span className="mono faint text-2xs">{t.id}</span>
            {t.title}
          </button>
        </dd>
      </KeyValues>
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
      <div className="dsec flex items-center gap-1.5 flex-wrap">
        <Button size="sm" onClick={() => notBuilt("Converting a subtask to a task")}>
          {ic(ArrowUpRight, 13)}Convert to task
        </Button>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => onOpen(t.subtasks[i - 1]!.id)} aria-label="Previous subtask">
          {ic(ChevronLeft, 14)}Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={i === t.subtasks.length - 1}
          onClick={() => onOpen(t.subtasks[i + 1]!.id)}
          aria-label="Next subtask"
        >
          Next{ic(ChevronRight, 14)}
        </Button>
        <Button variant="danger" size="sm" onClick={() => notBuilt("Deleting a subtask")}>
          {ic(Trash2, 13)}Delete
        </Button>
      </div>
    </div>
  );
}
