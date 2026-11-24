import { useSyncExternalStore } from "react";
import { board, send } from "./daemon.ts";
import type { Task } from "./task.ts";

/** Subtasks marked or unmarked in this page, shown at once while the daemon writes each and tells of it. */
type State = { done: Readonly<Record<string, boolean>>; popped?: string };

let state: State = { done: {} };
const listeners = new Set<() => void>();
let clear: ReturnType<typeof setTimeout> | undefined;

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

/** Marks a subtask, named as `T-NNNN.n`, done or not: on the page at once, and on the board by the daemon. */
export function toggleSub(id: string, done: boolean) {
  const [task, number] = id.split(".");
  void send(`/api/projects/${board().project.id}/tasks/${task}/tick`, { subtask: Number(number), done }).then((written) => {
    if (!written) settleTicks();
  });
  clearTimeout(clear);
  set({ done: { ...state.done, [id]: done }, popped: done ? id : undefined });
  if (done) clear = setTimeout(() => set({ ...state, popped: undefined }), 1000);
}

export function useTicks(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

export function withTicks(tasks: Task[], done: State["done"]): Task[] {
  if (!Object.keys(done).length) return tasks;
  return tasks.map((t) =>
    t.subtasks.some((s) => s.id in done) ? { ...t, subtasks: t.subtasks.map((s) => (s.id in done ? { ...s, done: done[s.id]! } : s)) } : t,
  );
}

/** Forgets what the page marked: the board as the daemon gave it is what shows. */
export function settleTicks() {
  if (Object.keys(state.done).length) set({ done: {}, popped: state.popped });
}
