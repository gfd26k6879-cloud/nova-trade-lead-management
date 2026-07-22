import { expect, type Page } from "@playwright/test";

import { assertE2EAuth, assertMutationSafety, hasE2EAuth } from "../scripts/e2e-safety.mjs";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const EMAIL = process.env.E2E_SUPABASE_EMAIL ?? process.env.NOSITE_BOOTSTRAP_ADMIN_EMAIL ?? "";
export const PASSWORD = process.env.E2E_SUPABASE_PASSWORD ?? "";
export const STORAGE_STATE = process.env.E2E_STORAGE_STATE?.trim() ?? "";
export const HAS_E2E_AUTH = hasE2EAuth();

export function requireE2EAuth(): void {
  assertE2EAuth();
}

export function requireMutationOptIn(): void {
  assertMutationSafety();
}

export async function login(page: Page): Promise<void> {
  if (STORAGE_STATE) {
    await page.goto(`${BASE_URL}/queue`, { waitUntil: "networkidle", timeout: 30000 });
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 10000 });
    return;
  }

  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle", timeout: 30000 });
  await expect(page.locator("h1")).toContainText("NoSite Leads");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/queue/, { timeout: 10000 });
}

export async function openAdminPage(page: Page, label: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: "Admin menu" }).click();
  const name = typeof label === "string" ? new RegExp(`^${escapeRegExp(label)}(?:\\s|$)`) : label;
  const link = page.getByRole("link", { name });
  await expect(link).toBeVisible({ timeout: 5000 });
  await link.click();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
