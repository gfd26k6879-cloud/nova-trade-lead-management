import { test } from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const EMAIL = process.env.E2E_SUPABASE_EMAIL ?? process.env.NOSITE_BOOTSTRAP_ADMIN_EMAIL ?? "";
export const PASSWORD = process.env.E2E_SUPABASE_PASSWORD ?? "";

export function skipIfMissingAuth(): void {
  test.skip(!EMAIL || !PASSWORD, "Set E2E_SUPABASE_EMAIL and E2E_SUPABASE_PASSWORD to run E2E auth tests");
}
