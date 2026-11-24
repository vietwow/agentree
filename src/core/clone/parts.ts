/**
 * Which parts of a cloned interface a change can change: a part names the
 * paths it is built from, and the project names the paths every part
 * shares. A submit compares those parts, and a task that writes what every
 * part shares is claimed only on the owner's word.
 */
import type { CloneConfig } from "../board/config.ts";

/** Whether a path is a path of a list, or under one of its directories, or a directory one of them is under. */
const touches = (path: string, paths: string[]) =>
  paths.some((each) => each === path || (each.endsWith("/") && path.startsWith(each)) || (path.endsWith("/") && each.startsWith(path)));

/** Whether any of some paths is one every part shares. */
export const sharedBy = (clone: CloneConfig, paths: string[]) => paths.filter((path) => touches(path, clone.shared ?? []));

/** The parts a change of some paths can change, in the order the project names them: every part when one of the paths is shared. */
export function partsOf(clone: CloneConfig, paths: string[]): string[] {
  const all = Object.keys(clone.parts);
  if (sharedBy(clone, paths).length) return all;
  return all.filter((part) => paths.some((path) => touches(path, clone.parts[part]!.files ?? [])));
}

/** The check that compares a part. */
export const compareOf = (part: string) => `agentree compare ${part}`;
