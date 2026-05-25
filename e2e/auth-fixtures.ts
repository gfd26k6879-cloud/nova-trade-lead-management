import { type Page, test } from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const EMAIL = process.env.E2E_SUPABASE_EMAIL ?? process.env.NOSITE_BOOTSTRAP_ADMIN_EMAIL ?? "";
export const PASSWORD = process.env.E2E_SUPABASE_PASSWORD ?? "";

export function skipIfMissingAuth(): void {
  test.skip(!EMAIL || !PASSWORD, "Set E2E_SUPABASE_EMAIL and E2E_SUPABASE_PASSWORD to run E2E auth tests");
}

export async function openAdminPage(page: Page, label: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: /^Admin/ }).click();
  const name = typeof label === "string" ? new RegExp(`^${escapeRegExp(label)}(?:\\s|$)`) : label;
  await page.getByRole("link", { name }).click();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
