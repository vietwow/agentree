import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;
const DAEMON_PORT = 4599;
/** The sample projects of a run, made anew each time. */
const DEMO = ".demo";
/** The daemon's clock and the moment the sample is counted back from: 15:00 of the day the pages' clock is held at. */
const NOW = new Date("2026-11-24T15:00:00").toISOString();
const TOKEN = "visual";
const AGENTREE = "node ../src/command/main.ts";

/**
 * Visual checks: every page in both themes and two widths, compared pixel
 * by pixel with the shots taken on this machine (`pnpm test:visual:update`).
 */
export default defineConfig({
  testDir: "tests/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  fullyParallel: true,
  workers: 4,
  timeout: 120_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${PORT}`,
    reducedMotion: "reduce",
    extraHTTPHeaders: { authorization: `Bearer ${TOKEN}` },
  },
  expect: {
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: 0, threshold: 0 },
  },
  webServer: [
    {
      command: `rm -rf ${DEMO} && ${AGENTREE} demo ${DEMO}/projects && ${AGENTREE} serve --port ${DAEMON_PORT}`,
      env: { AGENTREE_HOME: `${DEMO}/machine`, AGENTREE_NOW: NOW, AGENTREE_TOKEN: TOKEN },
      url: `http://127.0.0.1:${DAEMON_PORT}/api/projects`,
      reuseExistingServer: false,
    },
    {
      command: `vite --port ${PORT} --strictPort`,
      env: { AGENTREE_DAEMON: `http://127.0.0.1:${DAEMON_PORT}` },
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: false,
    },
  ],
});
