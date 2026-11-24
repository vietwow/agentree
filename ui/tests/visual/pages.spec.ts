import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  "Home",
  "Projects",
  "Progress",
  "Tasks",
  "Slots",
  "Review",
  "Memory",
  "Documents",
  "Agents",
  "Live",
  "Numbers",
  "Activity",
  "Favorites",
];
const THEMES = ["light", "dark"] as const;
const WIDTHS = [
  { name: "wide", width: 1440, height: 2200 },
  { name: "narrow", width: 465, height: 2600 },
];
/** The fixtures place every time before 15:00 of the clock's day. */
const CLOCK = new Date("2026-11-24T15:30:00");

async function open(page: Page, theme: (typeof THEMES)[number], name: string) {
  await page.clock.setFixedTime(CLOCK);
  await page.addInitScript((t) => localStorage.setItem("agentree.theme", t), theme);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  if (name !== "Home")
    await page
      .locator(".side .sitem", { has: page.locator(".trunc", { hasText: new RegExp(`^${name}$`) }) })
      .first()
      .click();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
}

for (const theme of THEMES) {
  for (const name of PAGES) {
    test(`${name} ${theme}`, async ({ page }) => {
      await open(page, theme, name);
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w.width, height: w.height });
        await page.waitForTimeout(300);
        await expect.soft(page).toHaveScreenshot(`${name}-${theme}-${w.name}.png`);
      }
    });
  }

  for (const mode of ["Board", "Table"]) {
    test(`Tasks ${mode} ${theme}`, async ({ page }) => {
      await open(page, theme, "Tasks");
      await page.locator(".seg button", { hasText: mode }).click();
      await page.waitForTimeout(800);
      for (const w of WIDTHS) {
        await page.setViewportSize({ width: w.width, height: w.height });
        await page.waitForTimeout(300);
        await expect.soft(page).toHaveScreenshot(`Tasks${mode}-${theme}-${w.name}.png`);
      }
    });
  }

  test(`Projects Table ${theme}`, async ({ page }) => {
    await open(page, theme, "Projects");
    await page.locator(".seg button", { hasText: "Table" }).click();
    await page.waitForTimeout(800);
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w.width, height: w.height });
      await page.waitForTimeout(300);
      await expect.soft(page).toHaveScreenshot(`ProjectsTable-${theme}-${w.name}.png`);
    }
  });

  test(`Task drawer ${theme}`, async ({ page }) => {
    await open(page, theme, "Tasks");
    await page.getByText("T-0002", { exact: true }).first().click();
    await page.waitForTimeout(800);
    await page.setViewportSize({ width: 1440, height: 1600 });
    await page.waitForTimeout(300);
    await expect.soft(page).toHaveScreenshot(`Drawer-${theme}-wide.png`);
  });
}
