import { test, expect } from "@playwright/test";

import { BASE_URL, login, requireE2EAuth, requireMutationOptIn } from "./auth-fixtures";

test("Leads Kanban/Table view and Excluded column fixes", async ({ page }) => {
  requireE2EAuth();
  requireMutationOptIn();
  await page.setViewportSize({ width: 1920, height: 1080 });
  const results: { step: string; pass: boolean; evidence?: string }[] = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`PageError: ${e.message}`));

  try {
    await login(page);

    await page.goto(`${BASE_URL}/leads?view=kanban`, { waitUntil: "networkidle", timeout: 15000 });
    await expect(page.getByRole("button", { name: "Switch to Table" })).toBeVisible({ timeout: 5000 });
    results.push({ step: "1. Login and open leads in Kanban view", pass: true, evidence: "Kanban loaded, Switch to Table visible" });

    await page.getByRole("button", { name: "Switch to Table" }).click();
    await page.waitForTimeout(500);
    const tableUrl = page.url();
    const hasViewKanban = tableUrl.includes("view=kanban");
    const kanbanViewBtn = await page.getByRole("button", { name: "Kanban View" }).isVisible().catch(() => false);
    results.push({
      step: "2. Switch to Table - URL/page switches",
      pass: !hasViewKanban && kanbanViewBtn,
      evidence: `URL: ${tableUrl}, Kanban View button: ${kanbanViewBtn}`,
    });

    await page.getByRole("button", { name: "Kanban View" }).click();
    await page.waitForURL(/view=kanban/, { timeout: 5000 });
    const kanbanUrl = page.url();
    const switchToTableVisible = await page.getByRole("button", { name: "Switch to Table" }).isVisible().catch(() => false);
    results.push({
      step: "3. Go back to Kanban view",
      pass: kanbanUrl.includes("view=kanban") && switchToTableVisible,
      evidence: `URL: ${kanbanUrl}`,
    });

    const nonExcludedCard = page.locator('div[style*="cursor: grab"]').first();
    const nonExcludedCount = await nonExcludedCard.count();
    const excludedCol = page.getByText("Excluded", { exact: true }).locator("../..");

    if (nonExcludedCount > 0) {
      const cardName = await nonExcludedCard.locator('a[href^="/leads/"]').first().textContent().catch(() => "?");
      const draggableCard = nonExcludedCard.locator("..");
      await draggableCard.scrollIntoViewIfNeeded();
      await excludedCol.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      const cardBox = await draggableCard.boundingBox();
      const targetBox = await excludedCol.boundingBox();
      if (cardBox && targetBox) {
        await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 80, { steps: 15 });
        await page.mouse.up();
      } else {
        await nonExcludedCard.dragTo(excludedCol, { force: true });
      }
      await page.waitForTimeout(2000);
      const toast = page.getByText(/moved to excluded|Lead moved to excluded/i);
      const toastVisible = await toast.isVisible().catch(() => false);
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(800);
      const excludedSection = page.getByText("Excluded", { exact: true }).locator("../..");
      const excludedNowHasCard = await excludedSection.locator('a[href^="/leads/"]').count() > 0;
      results.push({
        step: "4. Drag non-excluded card to Excluded",
        pass: toastVisible || excludedNowHasCard,
        evidence: `Card: ${cardName}, Toast: ${toastVisible}, In Excluded after reload: ${excludedNowHasCard}`,
      });
    } else {
      results.push({ step: "4. Drag non-excluded card to Excluded", pass: true, evidence: "SKIP: No non-excluded cards" });
    }

    const excludedColForCard = page.getByText("Excluded", { exact: true }).locator("../..");
    const excludedCard = excludedColForCard.locator('div[style*="cursor: grab"]').first();
    const excludedCardCount = await excludedCard.count();
    const newColumn = page.getByText("New", { exact: true }).first().locator("..").locator("..");
    if (excludedCardCount > 0) {
      const cardName = await excludedCard.locator('a[href^="/leads/"]').first().textContent().catch(() => "?");
      await excludedCard.dragTo(newColumn, { force: true });
      await page.waitForTimeout(1000);
      const toast = page.getByText(/moved to|restored|Moved to|Lead restored/i);
      const toastVisible = await toast.isVisible().catch(() => false);
      results.push({
        step: "5. Drag excluded card to normal column",
        pass: toastVisible,
        evidence: `Card: ${cardName}, Toast: ${toastVisible}`,
      });
    } else {
      results.push({ step: "5. Drag excluded card to normal column", pass: true, evidence: "SKIP: No excluded cards" });
    }

    results.push({ step: "No runtime errors", pass: errors.length === 0, evidence: errors.length ? errors.join("; ") : undefined });
  } catch (e) {
    results.push({ step: "Execution", pass: false, evidence: String(e) });
  }

  console.log("\n=== PASS/FAIL CHECKLIST ===");
  results.forEach((r) => console.log(`${r.pass ? "PASS" : "FAIL"}: ${r.step}${r.evidence ? ` | ${r.evidence}` : ""}`));
  if (errors.length) console.log("\nRuntime errors:", errors);

  const allPass = results.every((r) => r.pass);
  expect(allPass, `Failed: ${results.filter((r) => !r.pass).map((r) => r.step).join(", ")}`).toBeTruthy();
});
