import { expect, test } from "@playwright/test";

import {
  BASE_URL,
  excludeDisposableLead,
  login,
  openDisposableLeadKanban,
  requireDisposableLeadBaseline,
  requireE2EAuth,
  requireMutationOptIn,
  restoreDisposableLeadBaseline,
} from "./auth-fixtures";

test("Kanban exclusion prompt - accessible app dialog", async ({ page }) => {
  requireE2EAuth();
  const fixture = requireMutationOptIn();
  const reason = "E2E disposable fixture exclusion check";
  await page.setViewportSize({ width: 1920, height: 1080 });
  await login(page);
  await openDisposableLeadKanban(page, fixture);
  await requireDisposableLeadBaseline(page, fixture);

  try {
    await excludeDisposableLead(page, fixture, reason);
    await page.goto(`${BASE_URL}${fixture.href}`, { waitUntil: "networkidle", timeout: 10000 });
    await expect(page.getByRole("heading", { name: fixture.name, exact: true })).toBeVisible();
    await expect(page.getByText(reason, { exact: true })).toBeVisible();
  } finally {
    await restoreDisposableLeadBaseline(page, fixture);
  }
});
