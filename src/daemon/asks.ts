/** A command of a project as the queue runs it: whether it is heavy, its bound, and the project's container when it has an image. */
import { basename, dirname, join, sep } from "node:path";
import { configOf, isHeavy } from "../core/board/config.ts";
import type { Places } from "../core/board/places.ts";
import type { Ask } from "./queue.ts";

/** The names of the volumes of a project's trees start so; a tree's own go on with its task's id. */
export const volumePrefix = (project: string) => `agentree-${project}-`;

/** The volume a directory of a tree is kept in: one a tree and a directory, so that two trees share none. */
const volumeOf = (project: string, tree: string, directory: string) =>
  `${volumePrefix(project)}${tree}-${directory.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

export function askFor(
  places: Places,
  ask: Pick<Ask, "project" | "task" | "by" | "what" | "command" | "cwd"> & { keepOutput?: boolean; heavy?: boolean },
): Ask {
  const config = configOf(places);
  // A command runs in a tree, or under it: the tree is the directory of that name beside the board's.
  const tree = ask.cwd.startsWith(places.trees + sep) ? ask.cwd.slice(places.trees.length + 1).split(sep)[0] : undefined;
  const volumes = tree
    ? config.volumes.map((directory) => ({ name: volumeOf(ask.project, tree, directory), path: join(places.trees, tree, directory) }))
    : [];
  return {
    ...ask,
    heavy: ask.heavy ?? isHeavy(config, ask.command),
    boundMinutes: config.boundMinutes,
    // The repository and its trees are side by side: their directory is the one both are seen in.
    ...(config.image ? { container: { image: config.image, mount: dirname(places.root), volumes } } : {}),
  };
}

/** The task a volume of a project's trees belongs to, by its name. */
export const taskOfVolume = (project: string, name: string) => /^T-\d{4}/.exec(basename(name).slice(volumePrefix(project).length))?.[0];
