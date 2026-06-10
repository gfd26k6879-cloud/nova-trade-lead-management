import { test, expect } from "@playwright/test";

import { BASE_URL, login, openAdminPage, skipIfMissingAuth } from "./auth-fixtures";

test.describe("UI Smoke Test", () => {
  skipIfMissingAuth();
  test.setTimeout(60000);
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("1. Open app and log in", async ({ page }) => {
  skipIfMissingAuth();
    expect(page.url()).toContain("/queue");
    await expect(page.getByRole("heading", { name: "Workbench", exact: true })).toBeVisible({ timeout: 5000 });
  });

  test("2. Protected navigation and Dashboard loads", async ({ page }) => {
  skipIfMissingAuth();
    await expect(page.getByRole("link", { name: "Workbench", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "My Leads", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Team", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Admin/ })).toBeVisible();
    await openAdminPage(page, "Admin Home");
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Admin Command Center", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Lead Inventory", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start Discovery", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Run scope", exact: true })).toBeVisible();
    await expect(page.getByText("Test capped run", { exact: true })).toBeVisible();
  });

  test("2b. Theme toggle and desktop Admin menu work in both themes", async ({ page }) => {
  skipIfMissingAuth();
    await page.evaluate(() => localStorage.setItem("nosite-theme", "dark"));
    await page.reload({ waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "Switch to light theme" }).first()).toBeVisible();
    await page.getByRole("button", { name: /^Admin/ }).click();
    await expect(page.getByRole("link", { name: /^Settings(?:\s|$)/ })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /^Admin/ }).click();

    await page.getByRole("button", { name: "Switch to light theme" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: /^Admin/ }).click();
    await expect(page.getByRole("link", { name: /^Users(?:\s|$)/ })).toBeVisible({ timeout: 5000 });
  });

  test("2c. Mobile hamburger opens primary and Admin links", async ({ page }) => {
  skipIfMissingAuth();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => localStorage.setItem("nosite-theme", "dark"));
    await page.goto(`${BASE_URL}/queue`, { waitUntil: "networkidle" });

    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "Toggle menu" }).click();
    await expect(page.getByRole("link", { name: "Workbench", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Settings(?:\s|$)/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Users(?:\s|$)/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch to light theme" }).first()).toBeVisible();
  });

  test("3. Dashboard discovery preflight controls", async ({ page }) => {
  skipIfMissingAuth();
    await openAdminPage(page, "Admin Home");
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Run scope", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Max calls", { exact: true })).toBeVisible();
    await expect(page.getByText("Max raw places", { exact: true })).toBeVisible();
    await expect(page.getByText("Search radius", { exact: true })).toBeVisible();
    await expect(page.getByText("Estimated cost", { exact: true })).toBeVisible();
    await expect(page.getByText("Cap remaining", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dentists" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Auto repair" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Contractors" })).toBeVisible();
  });

  test("4. Settings controls present and interactable", async ({ page }) => {
  skipIfMissingAuth();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`PageError: ${e.message}`));

    await openAdminPage(page, "Settings");
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
    await openAdminPage(page, "Settings");
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

    await openAdminPage(page, "Admin Home");
    await page.waitForURL(/\/dashboard/, { timeout: 5000 });
    await openAdminPage(page, "Settings");
    await page.waitForURL(/\/settings/, { timeout: 5000 });
    await openAdminPage(page, "Admin Home");

    expect(errors).toHaveLength(0);
  });

  test("7. Business type filter and Statistics page", async ({ page }) => {
  skipIfMissingAuth();
    await openAdminPage(page, "All Leads");
    await page.waitForURL(/\/leads/, { timeout: 5000 });

    await page.getByLabel("Business type").selectOption("dental");
    await page.waitForURL(/businessType=dental/, { timeout: 5000 });
    await expect(page.getByLabel("Business type")).toHaveValue("dental");
    await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute("href", /businessType=dental/);

    await openAdminPage(page, "Statistics");
    await page.waitForURL(/\/statistics/, { timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Statistics", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("heading", { name: "Business Type Breakdown", exact: true })).toBeVisible();

    await page.getByLabel("Statistics date range").selectOption("30d");
    await page.waitForURL(/range=30d/, { timeout: 5000 });
    await expect(page.getByLabel("Statistics date range")).toHaveValue("30d");
  });
});
