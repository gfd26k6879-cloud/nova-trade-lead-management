import { expect, test } from "@playwright/test";

import {
  excludeDisposableLead,
  login,
  moveDisposableLeadToColumn,
  openDisposableLeadKanban,
  requireDisposableLeadBaseline,
  requireE2EAuth,
  requireMutationOptIn,
  restoreDisposableLeadBaseline,
} from "./auth-fixtures";

test("Leads Kanban/Table view and Excluded column fixes", async ({ page }) => {
  requireE2EAuth();
  const fixture = requireMutationOptIn();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  await openDisposableLeadKanban(page, fixture);
  await requireDisposableLeadBaseline(page, fixture);

  try {
    await page.getByRole("button", { name: "Switch to Table" }).click();
    await expect(page.getByRole("button", { name: "Kanban View" })).toBeVisible();
    await expect(page).not.toHaveURL(/view=kanban/);
    await page.getByRole("button", { name: "Kanban View" }).click();
    await expect(page).toHaveURL(/view=kanban/);
    await requireDisposableLeadBaseline(page, fixture);

    await excludeDisposableLead(page, fixture);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-kanban-column="excluded"]')
      .locator(`[data-lead-card-id="${fixture.id}"]`)).toBeVisible();

    await moveDisposableLeadToColumn(page, fixture, "new");
    await page.reload({ waitUntil: "domcontentloaded" });
    await requireDisposableLeadBaseline(page, fixture);
    expect(pageErrors).toEqual([]);
  } finally {
    await restoreDisposableLeadBaseline(page, fixture);
  }
});
