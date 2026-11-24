import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

/**
 * Visual checks: every page in both themes and two widths, compared pixel
 * by pixel with the shots taken on this machine (`pnpm test:visual:update`).
 */
export default defineConfig({
  testDir: "tests/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${PORT}`,
    reducedMotion: "reduce",
  },
  expect: {
    toHaveScreenshot: { animations: "disabled", caret: "hide", maxDiffPixels: 0 },
  },
  webServer: {
    command: `vite --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
  },
});
