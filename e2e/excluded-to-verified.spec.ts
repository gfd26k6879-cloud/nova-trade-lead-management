import { test, expect } from "@playwright/test";

import { BASE_URL, PASSWORD, USERNAME, skipIfMissingAuth } from "./auth-fixtures";

test("Excluded card to Verified column", async ({ page }) => {
  skipIfMissingAuth();
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/queue/, { timeout: 10000 });

  await page.goto(`${BASE_URL}/leads?view=kanban`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(500);

  const excludedCol = page.getByText("Excluded", { exact: true }).first().locator("../..");
  let excludedCard = excludedCol.locator('a[href^="/leads/"]').first().locator("../..");
  let cardCount = await excludedCard.count();
  if (cardCount === 0) {
    excludedCard = excludedCol.locator('div[style*="cursor: grab"]').first().locator("..");
    cardCount = await excludedCard.count();
  }

  if (cardCount === 0) {
    const colsToTry = [
      page.getByText("New", { exact: true }).first().locator("../.."),
      page.getByText("Verified", { exact: true }).first().locator("../.."),
    ];
    let newCard: ReturnType<typeof page.locator> | null = null;
    for (const col of colsToTry) {
      const card = col.locator('a[href^="/leads/"]').first().locator("../..");
      if ((await card.count()) > 0) {
        newCard = card;
        break;
      }
    }
    if (newCard) {
      await newCard.scrollIntoViewIfNeeded();
      await excludedCol.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const cBox = await newCard.boundingBox();
      const eBox = await excludedCol.boundingBox();
      if (cBox && eBox) {
        await page.mouse.move(cBox.x + cBox.width / 2, cBox.y + cBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(eBox.x + eBox.width / 2, eBox.y + 60, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(2500);
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(1000);
      }
    }
    excludedCard = excludedCol.locator('div[style*="cursor: grab"]').first().locator("..");
    cardCount = await excludedCard.count();
    if (cardCount === 0) {
      excludedCard = excludedCol.locator('a[href^="/leads/"]').first().locator("../..");
      cardCount = await excludedCard.count();
    }
  }

  if (cardCount === 0) {
    console.log("RESULT: SKIP - No cards in Excluded column (and none could be moved there)");
    test.skip(true, "No excluded cards");
    return;
  }

  const cardName = await excludedCard.locator('a[href^="/leads/"]').first().textContent().catch(() => "?");
  const cardHref = await excludedCard.locator('a[href^="/leads/"]').first().getAttribute("href").catch(() => "");

  const verifiedCol = page.getByText("Verified", { exact: true }).first().locator("../..");
  await verifiedCol.scrollIntoViewIfNeeded();
  await excludedCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const cardBox = await excludedCard.boundingBox();
  const targetBox = await verifiedCol.boundingBox();
  if (!cardBox || !targetBox) {
    console.log("RESULT: FAIL - Could not get bounding boxes");
    expect(false).toBeTruthy();
    return;
  }

  const targetX = targetBox.x + targetBox.width / 2;
  const targetY = targetBox.y + 120;
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 25 });
  await page.mouse.up();

  await page.waitForTimeout(2500);
  const toast = page.getByText(/restored|Lead restored|moved to verified|Moved to/i);
  const toastVisible = await toast.isVisible().catch(() => false);
  const toastText = toastVisible ? await toast.textContent().catch(() => "") : "";

  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(1000);

  const stillInExcluded = await excludedCol.locator(`a[href="${cardHref}"]`).count() > 0;
  const inVerified = await verifiedCol.locator(`a[href="${cardHref}"]`).count() > 0;

  const pass = (toastVisible || inVerified) && !stillInExcluded;
  console.log("\n=== RESULT:", pass ? "PASS" : "FAIL", "===");
  console.log("Card:", cardName);
  console.log("Toast visible:", toastVisible, "| Message:", toastText);
  console.log("Left Excluded:", !stillInExcluded);
  console.log("In Verified:", inVerified);

  expect(pass, `Toast: ${toastVisible}, Left Excluded: ${!stillInExcluded}, In Verified: ${inVerified}`).toBeTruthy();
});
