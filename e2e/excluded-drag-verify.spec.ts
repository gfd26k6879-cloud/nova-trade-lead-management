import { test, expect } from "@playwright/test";

import { BASE_URL, login, requireE2EAuth, requireMutationOptIn } from "./auth-fixtures";

test("Excluded drag behavior only", async ({ page }) => {
  requireE2EAuth();
  requireMutationOptIn();
  const observations: string[] = [];
  await page.setViewportSize({ width: 1920, height: 1080 });

  await login(page);

  await page.goto(`${BASE_URL}/leads?view=kanban`, { waitUntil: "networkidle", timeout: 15000 });
  await expect(page.getByRole("button", { name: "Switch to Table" })).toBeVisible({ timeout: 5000 });

  const newColumn = page.getByText("New", { exact: true }).first().locator("../..");
  const nonExcludedCard = newColumn.locator('a[href^="/leads/"]').first().locator("../..");
  const cardCount = await nonExcludedCard.count();
  const fallbackCard = page.locator('div[style*="cursor: grab"]').first();
  const cardToUse = cardCount > 0 ? nonExcludedCard : fallbackCard;
  const finalCount = await cardToUse.count();
  if (finalCount === 0) {
    console.log("RESULT: SKIP - No non-excluded cards found");
    test.skip(true, "No non-excluded cards");
    return;
  }

  const cardName = await cardToUse.locator('a[href^="/leads/"]').first().textContent().catch(() => "?");
  const cardHref = await cardToUse.locator('a[href^="/leads/"]').first().getAttribute("href").catch(() => "");
  observations.push(`First non-excluded card: ${cardName} (${cardHref})`);

  const excludedHeader = page.getByText("Excluded", { exact: true }).first();
  const excludedCol = excludedHeader.locator("../..");
  await excludedHeader.scrollIntoViewIfNeeded();
  await cardToUse.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const draggableCard = cardToUse;
  const cardBox = await draggableCard.boundingBox();
  const headerBox = await excludedHeader.boundingBox();
  const colBox = await excludedCol.boundingBox();

  if (!cardBox || !colBox) {
    observations.push("Could not get bounding boxes for card or Excluded column");
    console.log("OBSERVATIONS:", observations.join("\n"));
    expect(false, "Missing bounding boxes").toBeTruthy();
    return;
  }

  const targetX = (headerBox?.x ?? colBox.x) + (colBox.width / 2);
  const targetY = (headerBox?.y ?? colBox.y) + 60;

  observations.push(`Attempt 1: mouse move/down/move/up to Excluded header area (${targetX.toFixed(0)}, ${targetY.toFixed(0)})`);

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 20 });
  await page.mouse.up();
  const firstDialog = page.getByRole("dialog", { name: "Exclude lead" });
  await expect(firstDialog).toBeVisible();
  await firstDialog.getByRole("button", { name: "Exclude lead" }).click();

  await page.waitForTimeout(2500);
  const toast1 = page.getByText(/moved to excluded|Lead moved to excluded/i);
  const toastVisible1 = await toast1.isVisible().catch(() => false);
  observations.push(`After attempt 1 - Toast visible: ${toastVisible1}`);

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);

  const excludedSection = page.getByText("Excluded", { exact: true }).locator("../..");
  const excludedLinks = excludedSection.locator(`a[href="${cardHref}"]`);
  const inExcludedAfter1 = await excludedLinks.count() > 0;
  observations.push(`After refresh - Card in Excluded column: ${inExcludedAfter1}`);

  if (inExcludedAfter1 || toastVisible1) {
    console.log("\n=== EXCLUDED DRAG: PASS ===");
    console.log("OBSERVATIONS:", observations.join("\n"));
    expect(true).toBeTruthy();
    return;
  }

  observations.push("Attempt 2: dragTo to Excluded column");
  await cardToUse.scrollIntoViewIfNeeded();
  await excludedCol.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await cardToUse.dragTo(excludedCol, { force: true, targetPosition: { x: 90, y: 50 } });
  const secondDialog = page.getByRole("dialog", { name: "Exclude lead" });
  await expect(secondDialog).toBeVisible();
  await secondDialog.getByRole("button", { name: "Exclude lead" }).click();
  await page.waitForTimeout(2500);
  const toast2 = page.getByText(/moved to excluded|Lead moved to excluded/i);
  const toastVisible2 = await toast2.isVisible().catch(() => false);
  observations.push(`After attempt 2 - Toast visible: ${toastVisible2}`);

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);
  const excludedLinks2 = page.getByText("Excluded", { exact: true }).locator("../..").locator(`a[href="${cardHref}"]`);
  const inExcludedAfter2 = await excludedLinks2.count() > 0;
  observations.push(`After refresh (attempt 2) - Card in Excluded column: ${inExcludedAfter2}`);

  const pass = inExcludedAfter2 || toastVisible2;
  console.log("\n=== EXCLUDED DRAG:", pass ? "PASS" : "FAIL", "===");
  console.log("OBSERVATIONS:", observations.join("\n"));
  expect(pass, `Drag did not succeed. ${observations.join("; ")}`).toBeTruthy();
});
