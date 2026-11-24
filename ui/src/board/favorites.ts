import { useSyncExternalStore } from "react";

/** Stars on projects and tasks; they live in this browser only. */
const KEY = "agentree.favorites";
/** What the sample board stars until the browser keeps its own. */
const SEED: Starred[] = ["project:agentree", "task:T-0025"];

export type Starred = `project:${string}` | `task:${string}` | `doc:${string}`;

let stars: ReadonlySet<string> = read();
const listeners = new Set<() => void>();

function read(): ReadonlySet<string> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? JSON.stringify(SEED));
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export function toggleStar(key: Starred): boolean {
  const next = new Set(stars);
  const on = !next.has(key);
  if (on) next.add(key);
  else next.delete(key);
  stars = next;
  localStorage.setItem(KEY, JSON.stringify([...next]));
  for (const listener of listeners) listener();
  return on;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    stars = read();
    listener();
  };
  addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    removeEventListener("storage", onStorage);
  };
}

export function useStars(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => stars);
}
