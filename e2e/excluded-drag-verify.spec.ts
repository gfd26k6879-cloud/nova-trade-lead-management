import { expect, test } from "@playwright/test";

import {
  excludeDisposableLead,
  login,
  openDisposableLeadKanban,
  requireDisposableLeadBaseline,
  requireE2EAuth,
  requireMutationOptIn,
  restoreDisposableLeadBaseline,
} from "./auth-fixtures";

test("Excluded drag behavior only", async ({ page }) => {
  requireE2EAuth();
  const fixture = requireMutationOptIn();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  await openDisposableLeadKanban(page, fixture);
  await requireDisposableLeadBaseline(page, fixture);

  try {
    await excludeDisposableLead(page, fixture);
    await page.reload({ waitUntil: "domcontentloaded" });
    const excluded = page.locator('[data-kanban-column="excluded"]');
    await expect(excluded.locator(`[data-lead-card-id="${fixture.id}"]`)).toBeVisible();
  } finally {
    await restoreDisposableLeadBaseline(page, fixture);
  }
});
