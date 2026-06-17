import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

import { BASE_URL, login, skipIfMissingAuth } from "./auth-fixtures";

const SCREENSHOT_ROOT = "test-results/launch-auth-screenshots";

const protectedRoutes = [
  "/dashboard",
  "/coverage",
  "/explore",
  "/leads",
  "/quality",
  "/team",
  "/statistics",
  "/users",
  "/scheduler",
] as const;

const viewports = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "mobile", width: 390, height: 900 },
] as const;

test.describe("Launch authenticated screenshot QA", () => {
  skipIfMissingAuth();
  test.setTimeout(180_000);

  test("captures protected desktop and mobile launch routes", async ({ page }, testInfo) => {
    const runtimeErrors = collectRuntimeErrors(page);

    for (const viewport of viewports) {
      await mkdir(testInfo.outputPath(SCREENSHOT_ROOT, viewport.name), { recursive: true });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await login(page);

      for (const route of protectedRoutes) {
        await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
        await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
        await expect(page.locator("body")).toBeVisible();
        await expect(page.locator("body")).not.toHaveText(/configuration error/i);
        expect(await hasHorizontalOverflow(page), `${viewport.name} ${route} should not overflow horizontally`).toBe(false);

        await page.screenshot({
          path: testInfo.outputPath(SCREENSHOT_ROOT, viewport.name, `${slugForRoute(route)}.png`),
          fullPage: true,
        });
      }

      const leadDetailPath = await findFirstLeadDetailPath(page);
      if (leadDetailPath) {
        await page.goto(`${BASE_URL}${leadDetailPath}`, { waitUntil: "networkidle", timeout: 45_000 });
        await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
        await expect(page.locator("body")).toBeVisible();
        expect(await hasHorizontalOverflow(page), `${viewport.name} ${leadDetailPath} should not overflow horizontally`).toBe(false);
        await page.screenshot({
          path: testInfo.outputPath(SCREENSHOT_ROOT, viewport.name, "lead-detail.png"),
          fullPage: true,
        });
      } else {
        testInfo.annotations.push({ type: "lead-detail", description: "No lead detail link found on /leads" });
      }
    }

    expect(runtimeErrors).toEqual([]);
  });
});

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`PageError: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (text.includes("Failed to load resource: the server responded with a status of 404")) return;
    errors.push(`Console: ${text}`);
  });
  return errors;
}

async function findFirstLeadDetailPath(page: Page): Promise<string | null> {
  await page.goto(`${BASE_URL}/leads`, { waitUntil: "networkidle", timeout: 45_000 });
  const href = await page
    .locator('a[href^="/leads/"]:not([href="/leads"])')
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")).find((value): value is string => Boolean(value)));
  return href ?? null;
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
    return scrollWidth > root.clientWidth + 2;
  });
}

function slugForRoute(route: string): string {
  return route.replace(/^\//, "").replaceAll("/", "-") || "root";
}
