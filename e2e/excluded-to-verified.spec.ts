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

test("Excluded card to Verified column", async ({ page }) => {
  requireE2EAuth();
  const fixture = requireMutationOptIn();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  await openDisposableLeadKanban(page, fixture);
  await requireDisposableLeadBaseline(page, fixture);

  try {
    await excludeDisposableLead(page, fixture);
    await moveDisposableLeadToColumn(page, fixture, "verified");
    await page.reload({ waitUntil: "domcontentloaded" });
    const verified = page.locator('[data-kanban-column="verified"]');
    await expect(verified.locator(`[data-lead-card-id="${fixture.id}"]`)).toBeVisible();
    await expect(page.locator('[data-kanban-column="excluded"]')
      .locator(`[data-lead-card-id="${fixture.id}"]`)).toHaveCount(0);
  } finally {
    await restoreDisposableLeadBaseline(page, fixture);
  }
});
