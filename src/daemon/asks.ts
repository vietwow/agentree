/** A command of a project as the queue runs it: whether it is heavy, its bound, and the project's container when it has an image. */
import { dirname } from "node:path";
import { configOf, isHeavy } from "../core/board/config.ts";
import type { Places } from "../core/board/places.ts";
import type { Ask } from "./queue.ts";

export function askFor(places: Places, ask: Pick<Ask, "project" | "task" | "by" | "what" | "command" | "cwd"> & { keepOutput?: boolean }): Ask {
  const config = configOf(places);
  return {
    ...ask,
    heavy: isHeavy(config, ask.command),
    boundMinutes: config.boundMinutes,
    // The repository and its trees are side by side: their directory is the one both are seen in.
    ...(config.image ? { container: { image: config.image, mount: dirname(places.root) } } : {}),
  };
}
