import { expect, test } from "@playwright/test";

import {
  BASE_URL,
  login,
  openDisposableLeadKanban,
  requireDisposableLeadBaseline,
  requireE2EAuth,
  requireMutationOptIn,
  restoreDisposableLeadArchiveState,
  restoreDisposableLeadBaseline,
} from "./auth-fixtures";

test.describe("Lead workbench flow", () => {
  requireE2EAuth();
  const fixture = requireMutationOptIn();
  test.setTimeout(90_000);

  test("uses the disposable lead for call presets and reversible archive coverage", async ({ page }) => {
    await login(page);
    await openDisposableLeadKanban(page, fixture);
    await requireDisposableLeadBaseline(page, fixture);
    await page.goto(`${BASE_URL}${fixture.href}`, { waitUntil: "networkidle", timeout: 30000 });
    await expect(page.getByRole("heading", { name: fixture.name, exact: true })).toBeVisible();

    try {
      await expect(page.getByRole("tab", { name: "Work" })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText("Lead workbench")).toBeVisible();
      await expect(page.getByText("Call presets")).toBeVisible();

      await page.getByRole("button", { name: "Spoke to owner" }).click();
      await expect(page.getByLabel("Channel")).toHaveValue("call");
      await expect(page.getByLabel("Outcome")).toHaveValue("decision_maker_reached");
      await expect(page.getByLabel("Next step")).toHaveValue(/preview|quote/i);
      await expect(page.getByLabel("Note")).toHaveValue(/Spoke with the owner/i);

      await page.getByRole("tab", { name: "Admin" }).click();
      await expect(page.getByRole("button", { name: "Archive active lead" })).toBeVisible();
      await page.getByLabel("Archive reason").fill("E2E disposable fixture archive check");
      await page.getByRole("button", { name: "Archive active lead" }).click();
      await expect(page.getByRole("dialog", { name: "Archive lead?" })).toBeVisible();
      await page.getByRole("button", { name: "Archive lead", exact: true }).click();
      await expect(page.getByText(/Archived on:/)).toBeVisible({ timeout: 10000 });
    } finally {
      await restoreDisposableLeadArchiveState(page, fixture);
      await restoreDisposableLeadBaseline(page, fixture);
    }
  });
});
