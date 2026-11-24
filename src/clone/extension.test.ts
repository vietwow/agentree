import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { serve } from "@hono/node-server";
import type { BrowserContext, Worker } from "playwright";
import { claim, create } from "../core/board/actions.ts";
import { CODEX, OWNER, project, type Project } from "../core/board/testing.ts";
import type { PartRecord } from "../core/clone/record.ts";
import { register } from "../core/machine/projects.ts";
import { createApp, createEvents } from "../daemon/app.ts";
import { createQueue } from "../daemon/queue.ts";

/** What of Chrome's extension API the test calls inside the extension's background script. */
declare const chrome: {
  storage: { local: { set(items: object): Promise<void> } };
  tabs: { query(asked: object): Promise<{ id?: number }[]> };
};

const EXTENSION = join(import.meta.dirname, "../../extension");
const TOKEN = "t0ken";
const PAGE = `<!doctype html><title>Reference</title><main id="app"><nav aria-label="Pages"><a href="/home">Home</a><a href="/tasks" id="tasks">Tasks</a></nav></main>`;

let at: Project;
let tree: string;
let daemon: ReturnType<typeof serve>;
let reference: Server;
let browser: BrowserContext | undefined;
let worker: Worker;
let profile: string;
let daemonAt: string;
let referenceAt: string;

const listening = (server: { address(): unknown; once(event: "listening", run: () => void): unknown }) =>
  new Promise<number>((resolve) => {
    const port = () => (server.address() as AddressInfo | null)?.port;
    if (port()) return resolve(port()!);
    server.once("listening", () => resolve(port()!));
  });

before(async () => {
  at = project();
  process.env.AGENTREE_HOME = join(at.home, "machine");
  const { context } = at;
  register(context.places.root, context.now(), {});
  writeFileSync(
    join(context.places.root, "agentree.config.json"),
    JSON.stringify({ clone: { records: "parity", url: "http://127.0.0.1:1", colours: "own", font: "own", parts: {} } }),
  );
  create(context, OWNER, {
    title: "Measure the shell",
    kind: "measure",
    priority: 1,
    writes: ["parity/shell/"],
    context: "Why.",
    doneWhen: "- Done.",
    outOfScope: "Rest.",
  });
  tree = claim(context, CODEX, "T-0001").claim.tree;
  const app = createApp({
    token: TOKEN,
    queue: createQueue({ home: process.env.AGENTREE_HOME }),
    events: createEvents(),
    now: context.now,
    origins: [],
  });
  daemon = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
  daemonAt = `http://127.0.0.1:${await listening(daemon as never)}`;
  reference = createServer((_, response) => response.setHeader("content-type", "text/html").end(PAGE)).listen(0, "127.0.0.1");
  referenceAt = `http://127.0.0.1:${await listening(reference)}`;
  profile = mkdtempSync(join(tmpdir(), "agentree-extension-"));
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      viewport: { width: 1000, height: 700 },
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    worker = browser.serviceWorkers()[0] ?? (await browser.waitForEvent("serviceworker", { timeout: 30_000 }));
  } catch {
    await browser?.close();
    browser = undefined;
  }
});

after(async () => {
  await browser?.close();
  daemon?.close();
  reference?.close();
  rmSync(profile, { recursive: true, force: true });
  at.remove();
});

/** Asks the page's window for a record, as a session that drives the page does, and gives the extension's answer. */
const ASK = (ask: object) => `new Promise((resolve) => {
  window.addEventListener("message", (event) => event.data?.agentree === "recorded" && resolve(event.data));
  window.postMessage({ agentree: "record", ...${JSON.stringify(ask)} }, location.origin);
})`;

test("the extension reads the tab it is pointed at and carries each record to the daemon, into the tree of the task that measures", async (t) => {
  if (!browser) return t.skip("no Chromium of Playwright's that loads an extension is installed here");
  const page = await browser.newPage();
  await page.goto(`${referenceAt}/home?session=abc`);
  const set = (settings: object) => worker.evaluate((given) => chrome.storage.local.set(given), settings);
  const attach = () =>
    worker.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await (globalThis as unknown as { agentree: { attach(id: number): Promise<void> } }).agentree.attach(tab!.id!);
    });

  await set({ address: daemonAt, token: TOKEN, project: "project", task: "T-0001", root: "#app" });
  await attach();
  assert.deepEqual(await page.evaluate(ASK({})), { agentree: "recorded", ok: false, text: "No part is named in the extension's popup." });
  assert.equal(
    await page.evaluate("typeof window.__agentree"),
    "undefined",
    "the reader is in the extension's own world: the page's scripts do not reach it",
  );

  await set({ part: "shell" });
  assert.deepEqual(await page.evaluate(ASK({})), { agentree: "recorded", ok: true, text: "shell, base: 4 elements recorded." });
  const base = JSON.parse(readFileSync(join(tree, "parity/shell/base.json"), "utf8")) as PartRecord;
  assert.deepEqual([base.source, base.viewport, base.theme], [`${referenceAt}/home`, { width: 1000, height: 700 }, "light"]);
  assert.deepEqual(
    base.elements.map((element) => element.id),
    ["shell", "shell/navigation[Pages]", "shell/navigation[Pages]/link[Home]", "shell/navigation[Pages]/link[Tasks]"],
  );

  await page.evaluate("document.querySelector('#tasks').setAttribute('aria-current', 'page')");
  assert.equal(
    (
      (await page.evaluate(ASK({ state: "tasks-current", notMeasured: [{ id: "shell/menu", reason: "It opens only for an administrator." }] }))) as {
        text: string;
      }
    ).text,
    "shell, tasks-current: 1 elements recorded.",
  );
  const state = JSON.parse(readFileSync(join(tree, "parity/shell/tasks-current.json"), "utf8")) as PartRecord;
  assert.deepEqual(
    [state.base, state.elements, state.notMeasured.length],
    ["base", [{ change: "modified", id: "shell/navigation[Pages]/link[Tasks]", attrs: { href: "/tasks", "aria-current": "page" } }], 1],
  );

  assert.match(
    ((await page.evaluate(ASK({}))) as { text: string }).text,
    /is there already: a value a record holds is not measured again/,
    "the daemon's refusal comes back to the page in its words",
  );
  await set({ address: "https://elsewhere.example.com" });
  assert.match(((await page.evaluate(ASK({ state: "sent-away" }))) as { text: string }).text, /on the loopback address only/);
  assert.equal(existsSync(join(tree, "parity/shell/sent-away.json")), false);
});
