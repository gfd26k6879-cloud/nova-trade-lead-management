import { test, expect } from "@playwright/test";

import { BASE_URL, PASSWORD, USERNAME, skipIfMissingAuth } from "./auth-fixtures";

test("Kanban exclusion prompt - explicit dialog handling", async ({ page }) => {
  skipIfMissingAuth();
  const results: { step: string; pass: boolean; note?: string }[] = [];

  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/queue/, { timeout: 10000 });

  await page.goto(`${BASE_URL}/leads?view=kanban`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(500);

  const newColumn = page.getByText("New", { exact: true }).first().locator("../..");
  const nonExcludedCard = newColumn.locator('a[href^="/leads/"]').first().locator("../..");
  const cardCount = await nonExcludedCard.count();
  const fallbackCard = page.locator('div[style*="cursor: grab"]').first().locator("..");
  const cardToUse = cardCount > 0 ? nonExcludedCard : fallbackCard;
  if ((await cardToUse.count()) === 0) {
    results.push({ step: "1-2. Pick card", pass: false, note: "No cards" });
    expect(false).toBeTruthy();
    return;
  }

  const cardName = await cardToUse.locator('a[href^="/leads/"]').first().textContent().catch(() => "?");
  const cardHref = await cardToUse.locator('a[href^="/leads/"]').first().getAttribute("href").catch(() => "") ?? "";

  results.push({ step: "1-2. Login and pick card", pass: true, note: String(cardName) });

  const excludedHeader = page.getByText("Excluded", { exact: true }).first();
  const excludedCol = excludedHeader.locator("../..");

  page.once("dialog", (dialog) => dialog.accept("already has website built"));

  await excludedHeader.scrollIntoViewIfNeeded();
  await cardToUse.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const cardBox = await cardToUse.boundingBox();
  const headerBox = await excludedHeader.boundingBox();
  const colBox = await excludedCol.boundingBox();
  if (!cardBox || !colBox) {
    results.push({ step: "3-5. Dialog + drag", pass: false, note: "Missing bounding boxes" });
  } else {
    const targetX = (headerBox?.x ?? colBox.x) + colBox.width / 2;
    const targetY = (headerBox?.y ?? colBox.y) + 60;
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 20 });
    await page.mouse.up();

    await page.waitForTimeout(2500);
    const toast = await page.getByText(/Lead moved to excluded|moved to excluded/i).isVisible().catch(() => false);
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(800);
    const inExcluded = await excludedCol.locator(`a[href="${cardHref}"]`).count() > 0;
    results.push({ step: "3-5. Dialog accept + drag + verify", pass: toast || inExcluded, note: `Toast: ${toast}, In Excluded: ${inExcluded}` });
  }

  await page.goto(`${BASE_URL}${cardHref}`, { waitUntil: "networkidle", timeout: 10000 });
  await page.waitForTimeout(500);
  const reasonVisible = (await page.content()).includes("already has website built");
  results.push({ step: "6. Lead detail - exclusion reason", pass: reasonVisible, note: `Contains 'already has website built': ${reasonVisible}` });

  await page.goto(`${BASE_URL}/leads?view=kanban`, { waitUntil: "networkidle", timeout: 10000 });
  await page.waitForTimeout(1000);
  const excludedCol2 = page.locator('[data-kanban-column="excluded"]');
  const verifiedCol2 = page.locator('[data-kanban-column="verified"]');
  await excludedCol2.scrollIntoViewIfNeeded();
  const leadId = (cardHref || "").replace(/^\/leads\//, "").replace(/\/$/, "").trim() || "";
  let excludedCard = excludedCol2.locator(`[data-lead-card-id="${leadId}"]`).first();
  if ((await excludedCard.count()) === 0) excludedCard = excludedCol2.locator('a[href^="/leads/"]').first().locator("../..");
  if ((await excludedCard.count()) === 0) excludedCard = excludedCol2.locator('div[style*="cursor: grab"]').first().locator("..");
  if ((await excludedCard.count()) > 0) {
    await verifiedCol2.scrollIntoViewIfNeeded();
    await excludedCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await excludedCard.dragTo(verifiedCol2, { force: true, targetPosition: { x: 90, y: 80 } });
    await page.waitForTimeout(2500);
  }
  const restoreToast = await page.getByText(/Moved to verified|moved to verified|restored|Lead restored/i).isVisible().catch(() => false);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(800);
  const refreshedVerifiedCol = page.locator('[data-kanban-column="verified"]');
  const refreshedExcludedCol = page.locator('[data-kanban-column="excluded"]');
  const inVerified = await refreshedVerifiedCol.locator(`a[href="${cardHref}"]`).count() > 0;
  const leftExcluded = (await refreshedExcludedCol.locator(`a[href="${cardHref}"]`).count()) === 0;
  let restoredFromDetail = false;
  if (!restoreToast && !inVerified) {
    await page.goto(`${BASE_URL}${cardHref}`, { waitUntil: "networkidle", timeout: 10000 });
    const restoreButton = page.getByRole("button", { name: "Restore Lead" });
    if (await restoreButton.isVisible().catch(() => false)) {
      await restoreButton.click();
      await page.waitForTimeout(1000);
      restoredFromDetail = !(await page.getByText("Excluded", { exact: true }).isVisible().catch(() => false));
    }
  }
  results.push({
    step: "7. Restore excluded lead",
    pass: restoreToast || (inVerified && leftExcluded) || restoredFromDetail,
    note: `Toast: ${restoreToast}, In Verified: ${inVerified}, Detail fallback: ${restoredFromDetail}`,
  });

  console.log("\n=== PASS/FAIL REPORT ===");
  results.forEach((r) => console.log(`${r.pass ? "PASS" : "FAIL"}: ${r.step}${r.note ? ` | ${r.note}` : ""}`));

  const allPass = results.every((r) => r.pass);
  expect(allPass, `Failed: ${results.filter((r) => !r.pass).map((r) => r.step).join(", ")}`).toBeTruthy();
});
