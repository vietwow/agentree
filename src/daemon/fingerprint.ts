import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { git } from "../core/git.ts";
import { placesOfProject } from "../core/machine/projects.ts";

/** What tells a project's board apart from a moment ago: its branch's commit and the times of the machine's state. */
export function fingerprint(id: string): string {
  const places = placesOfProject(id);
  const times = (directory: string): string =>
    existsSync(directory)
      ? readdirSync(directory, { withFileTypes: true })
          .map((entry) =>
            entry.isDirectory() ? times(join(directory, entry.name)) : `${entry.name}:${statSync(join(directory, entry.name)).mtimeMs}`,
          )
          .join(",")
      : "";
  return `${git(places.board, "rev-parse", "HEAD")} ${git(places.root, "rev-parse", "HEAD")} ${times(places.state)}`;
}
