import { toggleSub } from "../board/ticks.ts";

/** gr8r-studio's subtask check; a mark pops as gr8r-studio's does. */
export function SubCheck({ id, done, title, round = false }: { id: string; done: boolean; title: string; round?: boolean }) {
  return (
    <input
      type="checkbox"
      className={`check ${round ? "round" : ""}`}
      checked={done}
      onChange={() => toggleSub(id, !done)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${done ? "Reopen" : "Complete"} subtask ${title}`}
    />
  );
}
