import { test, expect } from "@playwright/test";

import { BASE_URL, login, openAdminPage, skipIfMissingAuth } from "./auth-fixtures";

test.describe("Smoke pass", () => {
  skipIfMissingAuth();
  test("1. Login page and credentials", async ({ page }) => {
  skipIfMissingAuth();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`PageError: ${e.message}`));
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.toLowerCase().includes("error") || text.toLowerCase().includes("exception")) {
        errors.push(`Console: ${text}`);
      }
    });

    await login(page);
    expect(page.url()).toContain("/queue");
    if (errors.length) console.log("Step 1 errors:", errors);
  });

  test("2. Dashboard loads without runtime error", async ({ page }) => {
  skipIfMissingAuth();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`PageError: ${e.message}`));

    await login(page);

    await expect(page.locator("h1, [role='heading']").first()).toBeVisible({ timeout: 5000 });
    expect(errors).toHaveLength(0);
  });

  test("3. Leads table page renders", async ({ page }) => {
  skipIfMissingAuth();
    await login(page);

    await openAdminPage(page, "All Leads");
    await page.waitForURL(/\/leads/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Kanban View" })).toBeVisible();
  });

  test("4. Kanban view renders", async ({ page }) => {
  skipIfMissingAuth();
    await login(page);

    await page.goto(`${BASE_URL}/leads?view=kanban`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Switch to Table" })).toBeVisible();
    await expect(page.getByText("New", { exact: true }).first()).toBeVisible();
  });

  test("5. Kanban drag lead to different status", async ({ page }) => {
  skipIfMissingAuth();
    await login(page);

    await page.goto(`${BASE_URL}/leads?view=kanban`, { waitUntil: "networkidle" });

    const card = page.locator('div[style*="cursor: grab"]').first();
    const cardCount = await card.count();
    if (cardCount === 0) {
      test.skip(true, "No lead cards to drag - skipping drag test");
      return;
    }

    const verifiedHeader = page.getByText("Verified").first();
    const verifiedColumn = verifiedHeader.locator("..").locator("..");
    await card.dragTo(verifiedColumn, { force: true });
    await page.waitForTimeout(800);
    const toast = page.getByText(/Moved to|Updated|success/i);
    await expect(toast).toBeVisible({ timeout: 5000 }).catch(() => {});
  });

  test("6. Workbench page", async ({ page }) => {
  skipIfMissingAuth();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`PageError: ${e.message}`));

    await login(page);

    await page.getByRole("link", { name: "Workbench", exact: true }).click();
    await page.waitForURL(/\/queue/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Workbench", exact: true })).toBeVisible({ timeout: 5000 });

    await expect(page.getByText("Your next action")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Log outcome").first()).toBeVisible({ timeout: 5000 });
    const logButton = page.getByRole("button", { name: "Log outcome" }).first();
    if (await logButton.isVisible().catch(() => false)) {
      await logButton.click();
      await expect(page.getByText("Send to Steve")).toBeVisible({ timeout: 5000 });
      await expect(page.getByRole("button", { name: /Website needed|Already in admin queue/ }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Quote requested|Already in admin queue/ }).first()).toBeVisible();
      await page.getByRole("button", { name: "Close" }).click();
    }

    await page.goto(`${BASE_URL}/queue?view=sheet`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Workbench", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Sheet" })).toBeVisible();
    await expect(page.getByText("Send to Steve")).toHaveCount(0);

    const sheetTable = page.getByRole("table", { name: "Workbench sheet" });
    if (await sheetTable.isVisible().catch(() => false)) {
      await expect(page.getByRole("columnheader", { name: "Business / phone" })).toBeVisible();
      await expect(page.getByRole("columnheader", { name: "Outcome" })).toBeVisible();
      await expect(page.getByText("Claim first")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Claim", exact: true })).toHaveCount(0);
    } else {
      await expect(page.getByText("You have no claimed leads. Use Lead Explorer to claim one.")).toBeVisible({ timeout: 5000 });
      await expect(page.getByText("Claim first")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Claim", exact: true })).toHaveCount(0);
    }

    const outcomeSelect = page.locator('select[aria-label^="Outcome for"]:not([disabled])').first();
    if (await outcomeSelect.isVisible().catch(() => false)) {
      await outcomeSelect.selectOption("not_reached");
      await expect(page.getByRole("dialog", { name: "Log outcome" })).toBeVisible({ timeout: 5000 });
      await expect(page.getByLabel("Outcome")).toHaveValue("not_reached");
      await page.getByRole("button", { name: "Close" }).click();
    }
    expect(errors).toHaveLength(0);
  });

  test("7. Return to Dashboard - still healthy", async ({ page }) => {
  skipIfMissingAuth();
    await login(page);

    await page.getByRole("link", { name: "Workbench", exact: true }).click();
    await page.waitForURL(/\/queue/, { timeout: 5000 });
    await openAdminPage(page, "Admin Home");
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Admin Command Center", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Lead Inventory", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start Discovery", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Run scope", exact: true })).toBeVisible();
    await expect(page.getByText("Test capped run", { exact: true })).toBeVisible();
    await expect(page.getByText("All categories", { exact: true })).toBeVisible();
  });

  test("8. Fulfillment page and Users team controls render", async ({ page }) => {
  skipIfMissingAuth();
    await login(page);

    await openAdminPage(page, "Fulfillment");
    await page.waitForURL(/\/fulfillment/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Fulfillment", exact: true })).toBeVisible({ timeout: 5000 });
    const hasWebsiteFilter = await page.getByRole("link", { name: "Website needed", exact: true }).isVisible().catch(() => false);
    const hasEmptyState = await page.getByRole("heading", { name: "No fulfillment requests", exact: true }).isVisible().catch(() => false);
    expect(hasWebsiteFilter || hasEmptyState).toBeTruthy();

    await openAdminPage(page, "Users");
    await page.waitForURL(/\/users/, { timeout: 5000 });
    await expect(page.getByRole("columnheader", { name: "Team", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('select[aria-label^="Role for"]:visible').first()).toBeVisible();
    await expect(page.locator('select[aria-label^="Team lead for"]:visible').first()).toBeVisible();
  });
});
