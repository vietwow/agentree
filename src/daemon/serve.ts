/** `agentree serve`: the one daemon of a machine, for every project registered on it, on the loopback address only. */
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { machineHome, placesOfProject, projects } from "../core/machine/projects.ts";
import { createApp, createEvents, type Events } from "./app.ts";
import { fingerprint } from "./fingerprint.ts";
import { runWaitingChecks } from "./checks.ts";
import { runWaitingLandings } from "./landings.ts";
import { createQueue, type Queue } from "./queue.ts";
import { removeLeftVolumes, runWaitingSetups } from "./setup.ts";

export const DEFAULT_PORT = 4517;
/** How often the daemon looks for a change it did not make: a command's write, or an edit by hand. */
const LOOK_MS = 1500;
const SAMPLE_MS = 60_000;

/** The token every request carries; written once, readable by the user alone. `AGENTREE_TOKEN` names it instead, for a test. */
export function machineToken(): string {
  if (process.env.AGENTREE_TOKEN) return process.env.AGENTREE_TOKEN;
  const file = join(machineHome(), "token");
  if (!existsSync(file)) {
    mkdirSync(machineHome(), { recursive: true });
    writeFileSync(file, `${randomBytes(24).toString("hex")}\n`, { mode: 0o600 });
  }
  return readFileSync(file, "utf8").trim();
}

/** Tells the browser of each change the daemon did not make itself, by looking on a period: file events are not relied on. */
function watch(events: Events, queue: Queue, now: () => Date) {
  const seen = new Map<string, string>();
  let listed = "";
  return setInterval(() => {
    const all = projects();
    const ids = all.map((project) => project.id).join(",");
    if (ids !== listed && listed !== "") events.emit({ what: "projects" });
    listed = ids;
    for (const { id } of all) {
      try {
        // A task's checks run in the tree of its project, each heavy one in its turn of the machine's queue.
        runWaitingChecks(id, { places: placesOfProject(id), now }, queue).catch((error: unknown) => console.error(error));
        runWaitingSetups(id, { places: placesOfProject(id), now }, queue).catch((error: unknown) => console.error(error));
        runWaitingLandings(id, { places: placesOfProject(id), now }, queue).catch((error: unknown) => console.error(error));
        const print = fingerprint(id);
        if (seen.has(id) && seen.get(id) !== print) {
          events.emit({ project: id, what: "board" });
          removeLeftVolumes(id, { places: placesOfProject(id), now });
        }
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
  // `AGENTREE_NOW` holds the daemon's clock at one moment, for a test that compares pictures of its pages.
  const fixed = process.env.AGENTREE_NOW ? new Date(process.env.AGENTREE_NOW) : undefined;
  const app = createApp({ token, queue, events, now: () => fixed ?? new Date(), origins });
  if (options.ui && existsSync(options.ui)) {
    const root = relative(process.cwd(), options.ui) || ".";
    app.use("*", serveStatic({ root }));
    app.get("*", serveStatic({ root, path: "index.html" }));
  }
  // A held clock holds the load too: no reading is taken, so the pages show the same at every run.
  if (!fixed) queue.read();
  const timers = [watch(events, queue, () => fixed ?? new Date()), ...(fixed ? [] : [setInterval(() => queue.read(), SAMPLE_MS)])];
  // In its container the daemon listens on every address of the container, whose port is published on the host's loopback only.
  const server = serve({ fetch: app.fetch, hostname: process.env.AGENTREE_HOST ?? "127.0.0.1", port });
  return {
    address: `http://127.0.0.1:${port}/?token=${token}`,
    close: () => {
      timers.forEach(clearInterval);
      server.close();
    },
  };
}
