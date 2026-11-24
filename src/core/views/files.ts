/** The files of a project by area, as the Home page draws them: how many each area holds on `main`, and the paths each task may change. */
import { configOf } from "../board/config.ts";
import { tryGit } from "../git.ts";
import type { Board } from "../board/store.ts";

export type FilesView = {
  areas: { path: string; name: string; files: number }[];
  /** For each task, its `writes`. */
  writes: Record<string, string[]>;
};

export function filesView(board: Board): FilesView {
  const listed = tryGit(board.places.root, "ls-tree", "-r", "--name-only", "HEAD");
  const files = listed.status === 0 ? listed.stdout.split("\n").filter(Boolean) : [];
  const named = configOf(board.places).areas;
  const tops = [...new Set(files.filter((file) => file.includes("/")).map((file) => file.split("/")[0]!))].sort();
  const areas = named.length ? named : tops.map((path) => ({ path, name: path.replace(/^\.?(.)/, (_, first: string) => first.toUpperCase()) }));
  return {
    areas: areas.map((area) => ({ ...area, files: files.filter((file) => file.startsWith(`${area.path}/`)).length })),
    writes: Object.fromEntries(board.tasks.map(({ task }) => [task.fields.id, task.fields.writes])),
  };
}
