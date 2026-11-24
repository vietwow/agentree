/** `agentree serve`: the one daemon of a machine, for every project registered on it, on the loopback address only. */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { git } from "../core/git.ts";
import { machineHome, placesOfProject, projects } from "../core/machine/projects.ts";
import { createApp, createEvents, type Events } from "./app.ts";
import { createQueue } from "./queue.ts";

export const DEFAULT_PORT = 4517;
/** How often the daemon looks for a change it did not make: a command's write, or an edit by hand. */
const LOOK_MS = 1500;
const SAMPLE_MS = 60_000;

/** The token every request carries; written once, readable by the user alone. */
export function machineToken(): string {
  const file = join(machineHome(), "token");
  if (!existsSync(file)) {
    mkdirSync(machineHome(), { recursive: true });
    writeFileSync(file, `${randomBytes(24).toString("hex")}\n`, { mode: 0o600 });
  }
  return readFileSync(file, "utf8").trim();
}

/** What tells a project's board apart from a moment ago: its branch's commit and the times of the machine's state. */
function fingerprint(id: string): string {
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

/** Tells the browser of each change the daemon did not make itself, by looking on a period: file events are not relied on. */
function watch(events: Events) {
  const seen = new Map<string, string>();
  let listed = "";
  return setInterval(() => {
    const all = projects();
    const now = all.map((project) => project.id).join(",");
    if (now !== listed && listed !== "") events.emit({ what: "projects" });
    listed = now;
    for (const { id } of all) {
      try {
        const print = fingerprint(id);
        if (seen.has(id) && seen.get(id) !== print) events.emit({ project: id, what: "board" });
        seen.set(id, print);
      } catch {
        // A project whose repository is gone or mid-change is looked at again on the next period.
      }
    }
  }, LOOK_MS);
}

export function startDaemon(options: { port?: number; ui?: string } = {}) {
  const port = options.port ?? DEFAULT_PORT;
  const token = machineToken();
  const events = createEvents();
  const queue = createQueue({ home: machineHome(), onChange: () => events.emit({ what: "slots" }) });
  const origins = [`http://127.0.0.1:${port}`, `http://localhost:${port}`, ...(process.env.AGENTREE_DEV_ORIGIN?.split(",") ?? [])];
  const app = createApp({ token, queue, events, now: () => new Date(), origins });
  if (options.ui && existsSync(options.ui)) {
    const root = relative(process.cwd(), options.ui) || ".";
    app.use("*", serveStatic({ root }));
    app.get("*", serveStatic({ root, path: "index.html" }));
  }
  queue.read();
  const timers = [watch(events), setInterval(() => queue.read(), SAMPLE_MS)];
  const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port });
  return {
    address: `http://127.0.0.1:${port}/?token=${token}`,
    close: () => {
      timers.forEach(clearInterval);
      server.close();
    },
  };
}
