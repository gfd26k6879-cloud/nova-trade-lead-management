import { test } from "@playwright/test";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const USERNAME = process.env.NOSITE_ADMIN_USERNAME ?? "";
export const PASSWORD = process.env.NOSITE_ADMIN_PASSWORD ?? "";

export function skipIfMissingAuth(): void {
  test.skip(!USERNAME || !PASSWORD, "Set NOSITE_ADMIN_USERNAME and NOSITE_ADMIN_PASSWORD to run E2E auth tests");
}
