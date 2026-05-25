import { test, expect } from "@playwright/test";

import { BASE_URL, EMAIL, PASSWORD, skipIfMissingAuth } from "./auth-fixtures";

test.describe("UI Smoke Test", () => {
  skipIfMissingAuth();
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/queue/, { timeout: 10000 });
  });

  test("1. Open app and log in", async ({ page }) => {
  skipIfMissingAuth();
    expect(page.url()).toContain("/queue");
    await expect(page.getByRole("heading", { name: "Workbench", exact: true })).toBeVisible({ timeout: 5000 });
  });

  test("2. Protected navigation and Dashboard loads", async ({ page }) => {
  skipIfMissingAuth();
    await expect(page.getByRole("link", { name: "Workbench", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Revenue", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Fulfillment/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "All Leads", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Settings", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Revenue", exact: true }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Revenue Dashboard", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Team performance", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Latest activity", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Fulfillment Queue", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Operations", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Workbench", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Fulfillment", exact: true })).toBeVisible();
  });

  test("3. Dashboard cost breakdown / monthly cost intelligence", async ({ page }) => {
  skipIfMissingAuth();
    await page.getByRole("link", { name: "Revenue", exact: true }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await page.getByText("Expand operations", { exact: true }).click();
    const runCostText = page.getByText(/Run API:.*calls.*\$/);
    const apiCostSection = page.getByRole("heading", { name: "API Cost Intelligence" });
    const discoveryEnrichment = page.getByText(/Discovery:.*calls.*Enrichment:.*calls/);
    const monthlyCalls = page.getByText("Monthly Calls");
    const monthlyCost = page.getByText("Monthly Cost");
    const projectedMonthEnd = page.getByText("Projected Month-End");
    const atmosphereCalls = page.getByText("Atmosphere Calls");

    const runLevelVisible = await runCostText.isVisible().catch(() => false);
    const monthlySectionVisible = await apiCostSection.isVisible().catch(() => false);

    if (!runLevelVisible && !monthlySectionVisible) {
      test.info().annotations.push({ type: "note", description: "No cost sections visible (empty state)" });
    }

    if (runLevelVisible) {
      const text = await runCostText.textContent();
      expect(text).toMatch(/\d+.*calls/);
    }
    if (monthlySectionVisible) {
      await expect(apiCostSection).toBeVisible();
      const hasMonthly = (await monthlyCalls.isVisible()) || (await monthlyCost.isVisible());
      const hasProjected = await projectedMonthEnd.isVisible();
      const hasAtmosphere = await atmosphereCalls.isVisible();
      const hasSplit = await discoveryEnrichment.isVisible();
      expect(hasMonthly || hasProjected || hasAtmosphere || hasSplit).toBeTruthy();
    }
  });

  test("4. Settings controls present and interactable", async ({ page }) => {
  skipIfMissingAuth();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`PageError: ${e.message}`));

    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.waitForURL(/\/settings/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible({ timeout: 5000 });

    const cacheTtl = page.getByText("Cache TTL (days)").locator("..").locator("input");
    const stageBMinScore = page.getByText("Stage-B Min Score").locator("..").locator("input");
    const maxAtmosphere = page.getByText("Max Atmosphere / Run").locator("..").locator("input");
    const lockedAiModel = page.getByText("Locked Model").locator("..").locator("input");
    const aiBudget = page.getByText("Daily AI Budget ($)").locator("..").locator("input");
    const costEngineCheckbox = page.getByRole("checkbox", { name: /Enable pricing-accurate cost engine v2/i });
    const backfillBtn = page.getByRole("button", { name: "Backfill Canonical Places" });

    await expect(cacheTtl).toBeVisible();
    await expect(stageBMinScore).toBeVisible();
    await expect(maxAtmosphere).toBeVisible();
    await expect(lockedAiModel).toHaveValue("gpt-5.4-mini");
    await expect(aiBudget).toBeVisible();
    await expect(costEngineCheckbox).toBeVisible();
    await expect(backfillBtn).toBeVisible();

    const origCache = await cacheTtl.inputValue();
    const origStageB = await stageBMinScore.inputValue();
    const origAtmosphere = await maxAtmosphere.inputValue();

    await cacheTtl.fill("99");
    await expect(cacheTtl).toHaveValue("99");
    await cacheTtl.fill(origCache);

    await stageBMinScore.fill("4.5");
    await expect(stageBMinScore).toHaveValue("4.5");
    await stageBMinScore.fill(origStageB);

    await maxAtmosphere.fill("50");
    await expect(maxAtmosphere).toHaveValue("50");
    await maxAtmosphere.fill(origAtmosphere);

    const checked = await costEngineCheckbox.isChecked();
    await costEngineCheckbox.click();
    await expect(costEngineCheckbox).toBeChecked({ checked: !checked });
    await costEngineCheckbox.click();
    await expect(costEngineCheckbox).toBeChecked({ checked });

    await expect(backfillBtn).toBeEnabled();
    expect(errors).toHaveLength(0);
  });

  test("5. No permanent settings changes (revert)", async ({ page }) => {
  skipIfMissingAuth();
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.waitForURL(/\/settings/, { timeout: 5000 });

    const cacheTtl = page.getByText("Cache TTL (days)").locator("..").locator("input");
    const orig = await cacheTtl.inputValue();
    await cacheTtl.fill("999");
    await cacheTtl.fill(orig);
    await expect(cacheTtl).toHaveValue(orig);
  });

  test("6. Report runtime errors", async ({ page }) => {
  skipIfMissingAuth();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`PageError: ${e.message}`));

    await page.getByRole("link", { name: "Revenue", exact: true }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await page.getByRole("link", { name: "Settings", exact: true }).click();
    await page.waitForURL(/\/settings/, { timeout: 5000 });
    await page.getByRole("link", { name: "Revenue", exact: true }).click();

    expect(errors).toHaveLength(0);
  });

  test("7. Business type filter and Statistics page", async ({ page }) => {
  skipIfMissingAuth();
    await page.getByRole("link", { name: "All Leads", exact: true }).click();
    await page.waitForURL(/\/leads/, { timeout: 5000 });

    await page.getByLabel("Business type").selectOption("dental");
    await page.waitForURL(/businessType=dental/, { timeout: 5000 });
    await expect(page.getByLabel("Business type")).toHaveValue("dental");
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", /businessType=dental/);

    await page.getByRole("link", { name: "Statistics", exact: true }).click();
    await page.waitForURL(/\/statistics/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Statistics", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Business Type Breakdown", exact: true })).toBeVisible();

    await page.getByLabel("Statistics date range").selectOption("30d");
    await page.waitForURL(/range=30d/, { timeout: 5000 });
    await expect(page.getByLabel("Statistics date range")).toHaveValue("30d");
  });
});
