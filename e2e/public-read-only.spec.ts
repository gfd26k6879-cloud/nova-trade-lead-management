import { expect, test, type Page } from "@playwright/test";

const publicRoutes = [
  { path: "/privacy", heading: /How Nova Trade Lead Management handles business and workspace data/i },
  { path: "/terms", heading: /Terms for the invite-only Nova Trade Lead Management workspace/i },
  { path: "/support", heading: /Support for accounts, corrections, removals, and demos/i },
  { path: "/data-sources", heading: "Business discovery data comes from official sources" },
] as const;

const viewports = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
] as const;

test.describe("public read-only smoke", () => {
  test("trust pages render without runtime errors or horizontal overflow", async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of publicRoutes) {
        const response = await page.goto(route.path, { waitUntil: "networkidle" });
        expect(response?.status(), `${viewport.name} ${route.path} status`).toBe(200);
        await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Public trust pages" })).toBeVisible();
        expect(await hasHorizontalOverflow(page), `${viewport.name} ${route.path} overflow`).toBe(false);
      }
    }

    expect(runtimeErrors).toEqual([]);
  });

  test("login page renders without submitting credentials", async ({ page }) => {
    const runtimeErrors = collectRuntimeErrors(page);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const response = await page.goto("/login", { waitUntil: "networkidle" });
      expect(response?.status(), `${viewport.name} /login status`).toBe(200);
      await expect(page.getByRole("heading", { name: "Nova Trade Lead Management" })).toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
      await expect(page.getByLabel("Password")).toBeVisible();
      await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
      expect(await hasHorizontalOverflow(page), `${viewport.name} /login overflow`).toBe(false);
    }

    expect(runtimeErrors).toEqual([]);
  });
});

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`PageError: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`Console: ${message.text()}`);
  });
  return errors;
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return Math.max(root.scrollWidth, body.scrollWidth) > root.clientWidth + 2;
  });
}
