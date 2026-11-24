import { useSyncExternalStore } from "react";
import type { Task } from "./task.ts";

/** Subtasks marked or unmarked in this page, over the sample board; nothing is written. */
type State = { done: Readonly<Record<string, boolean>>; popped?: string };

let state: State = { done: {} };
const listeners = new Set<() => void>();
let clear: ReturnType<typeof setTimeout> | undefined;

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

export function toggleSub(id: string, done: boolean) {
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
