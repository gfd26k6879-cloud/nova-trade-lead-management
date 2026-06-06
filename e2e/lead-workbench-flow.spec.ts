import { expect, test } from "@playwright/test";

import { BASE_URL, login, skipIfMissingAuth } from "./auth-fixtures";

test.describe("Lead workbench manual flow", () => {
  skipIfMissingAuth();
  test.setTimeout(90_000);

  test("creates a manual lead, logs a preset call outcome, and archives it", async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/leads`, { waitUntil: "networkidle", timeout: 30000 });

    const addLead = page.getByRole("button", { name: "Add Lead" }).first();
    if (!(await addLead.isVisible().catch(() => false))) {
      test.skip(true, "Manual lead creation is admin-only in this environment");
      return;
    }

    await addLead.click();
    const uniqueName = `Codex Workbench E2E ${Date.now()}`;
    await page.getByLabel("Business name").fill(uniqueName);
    await page.getByLabel("Phone").fill("303-555-0199");
    await page.getByLabel("Address").fill("200 E Colfax Ave, Denver, CO");
    await page.getByLabel("Maps URL").fill("https://maps.google.com/?q=200+E+Colfax+Ave+Denver+CO");
    await page.getByLabel("Lead source").fill("Codex E2E flow");
    await page.getByLabel("Contact person").fill("Jamie Owner");
    await page.getByLabel("Notes").fill("Synthetic lead for workbench flow verification. Safe to archive.");
    await page.getByRole("button", { name: "Create lead" }).click();

    await page.waitForURL(/\/leads\/[^/]+$/, { timeout: 15000 });
    await expect(page.getByRole("tab", { name: "Work" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Lead workbench")).toBeVisible();
    await expect(page.getByText("Call presets")).toBeVisible();

    await page.getByRole("button", { name: "Spoke to owner" }).click();
    await expect(page.getByLabel("Channel")).toHaveValue("call");
    await expect(page.getByLabel("Outcome")).toHaveValue("decision_maker_reached");
    await expect(page.getByLabel("Next step")).toHaveValue(/preview|quote/i);
    await expect(page.getByLabel("Note")).toHaveValue(/Spoke with the owner/i);

    await page.getByRole("button", { name: "Log outcome" }).click();
    await expect(page.getByText(/Spoke with the owner/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/decision maker reached/i)).toBeVisible();

    await page.getByRole("tab", { name: "Admin" }).click();
    await page.getByLabel("Archive reason").fill("E2E cleanup after workbench verification");
    await page.getByRole("button", { name: "Archive active lead" }).click();
    await expect(page.getByRole("dialog", { name: "Archive lead?" })).toBeVisible();
    await page.getByRole("button", { name: "Archive lead", exact: true }).click();
    await expect(page.getByText(/Archived on:/)).toBeVisible({ timeout: 10000 });
  });
});
