/**
 * `agentree compare <part>`: the project's page read by the same reader the
 * record was made with, in a browser of agentree's own, and compared with
 * the record. It asks of a project only that it serves pages to a browser
 * and marks an element with its record's id in `data-record`.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CloneConfig, CloneStep } from "../core/board/config.ts";
import { compare, report, type Comparison, type Element } from "../core/clone/record.ts";
import { wholeOf } from "../core/clone/records.ts";
import { Refusal } from "../core/errors.ts";

const READER = join(import.meta.dirname, "reader.js");
/** How long the project's application is given to answer after it is started. */
const STARTS_WITHIN_MS = 120_000;
/** How long a page is given to settle after a step: its transitions end. */
const SETTLES_MS = 400;

type Reads = { url: string; viewport: { width: number; height: number }; theme: string; steps?: CloneStep[] };

/** A browser of agentree's own; a machine without one is told how to get it. */
async function browser() {
  try {
    const { chromium } = await import("playwright");
    return await chromium.launch();
  } catch (error) {
    throw new Refusal(`no browser to compare with: ${(error as Error).message.split("\n")[0]}. Install it with: npx playwright install chromium`);
  }
}

/** Opens a page at a record's viewport and theme, brings it to a state by its steps, and runs a reading of the reader in it. */
export async function inPage<T>(reads: Reads, reading: string): Promise<T> {
  const chromium = await browser();
  try {
    const page = await chromium.newPage({
      viewport: reads.viewport,
      colorScheme: reads.theme === "dark" ? "dark" : "light",
      reducedMotion: "reduce",
    });
    await page.goto(reads.url, { waitUntil: "load" });
    await page.mouse.move(0, 0);
    for (const step of reads.steps ?? []) {
      if ("click" in step) await page.click(step.click);
      else if ("hover" in step) await page.hover(step.hover);
      else if ("focus" in step) {
        // A focus by the keyboard: the element shows it only then.
        await page.keyboard.press("Tab");
        await page.focus(step.focus);
      } else await page.keyboard.press(step.press);
      await page.waitForTimeout(SETTLES_MS);
    }
    await page.addScriptTag({ content: readFileSync(READER, "utf8") });
    return (await page.evaluate(reading)) as T;
  } finally {
    await chromium.close();
  }
}

/** Starts the project's application when it does not answer, and waits for it; the process it started, to end after. */
async function served(config: CloneConfig, cwd: string): Promise<ChildProcess | undefined> {
  const answers = () =>
    fetch(config.url).then(
      () => true,
      () => false,
    );
  if (!/^https?:/.test(config.url) || (await answers())) return undefined;
  if (!config.serve) throw new Refusal(`${config.url} does not answer, and the project's part names no command to start it (clone.serve)`);
  const child = spawn("sh", ["-c", config.serve], { cwd, stdio: "ignore", detached: true });
  for (const since = Date.now(); Date.now() - since < STARTS_WITHIN_MS;) {
    if (await answers()) return child;
    await new Promise((wait) => setTimeout(wait, 500));
  }
  process.kill(-child.pid!, "SIGTERM");
  throw new Refusal(`${config.url} did not answer within ${STARTS_WITHIN_MS / 1000} s of \`${config.serve}\``);
}

/** Compares a part's page, in a state, with its record: the comparison and its report. */
export async function comparePart(
  root: string,
  config: CloneConfig,
  part: string,
  state = "base",
): Promise<{ comparison: Comparison; text: string }> {
  const place = config.parts[part];
  if (!place)
    throw new Refusal(`the project's part names no part "${part}" under clone.parts; it names ${Object.keys(config.parts).join(", ") || "none"}`);
  const { record, elements: expected } = wholeOf(root, config, part, state);
  const steps = place.states?.[state];
  if (state !== "base" && !steps)
    throw new Refusal(`the project's part names no steps that show the state ${state} of ${part} (clone.parts.${part}.states)`);
  const started = await served(config, root);
  try {
    const actual = await inPage<Element[]>(
      { url: `${config.url}${place.path}`, viewport: record.viewport, theme: record.theme, ...(steps ? { steps } : {}) },
      "window.__agentree.read()",
    );
    const comparison = compare(expected, actual, {
      colours: config.colours === "reference",
      font: config.font === "reference",
      ...(config.exceptions ? { exceptions: config.exceptions } : {}),
    });
    return { comparison, text: report(part, state, comparison) };
  } finally {
    if (started?.pid) process.kill(-started.pid, "SIGTERM");
  }
}
