import { expect, type Locator, type Page } from "@playwright/test";
import { CANONICAL_TENANT_FIXTURE_CATALOG } from "../src/test/tenants";

import {
  assertE2EAuth,
  assertMutationSafety,
  buildDisposableLeadKanbanUrl,
  hasE2EAuth,
} from "../scripts/e2e-safety.mjs";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const EMAIL = process.env.E2E_SUPABASE_EMAIL ?? process.env.NOSITE_BOOTSTRAP_ADMIN_EMAIL ?? "";
export const PASSWORD = process.env.E2E_SUPABASE_PASSWORD ?? "";
export const STORAGE_STATE = process.env.E2E_STORAGE_STATE?.trim() ?? "";
export const HAS_E2E_AUTH = hasE2EAuth();
export interface DisposableLeadFixture {
  id: string;
  name: string;
  href: string;
  qualificationStatus: string;
  qualificationLabel: string;
}
const fixtureTenant = (key: "A" | "B") => CANONICAL_TENANT_FIXTURE_CATALOG.tenants.find((tenant) => tenant.key === key)!;
const fixtureWorkspace = (key: "A" | "A_SIBLING") => CANONICAL_TENANT_FIXTURE_CATALOG.workspaces.find((workspace) => workspace.key === key)!;

export const TENANT_FIXTURE_SELECTORS = Object.freeze({
  tenantA: fixtureTenant("A").slug,
  tenantB: fixtureTenant("B").slug,
  workspaceA: fixtureWorkspace("A").slug,
  siblingWorkspace: fixtureWorkspace("A_SIBLING").slug,
  tenantALookAlikeRecordId: CANONICAL_TENANT_FIXTURE_CATALOG.lookAlikeRecords[0].id,
  tenantBLookAlikeRecordId: CANONICAL_TENANT_FIXTURE_CATALOG.lookAlikeRecords[1].id,
});

export function requireE2EAuth(): void {
  assertE2EAuth();
}

export function requireMutationOptIn(): DisposableLeadFixture {
  return assertMutationSafety();
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

export async function openDisposableLeadKanban(page: Page, fixture: DisposableLeadFixture): Promise<Locator> {
  await page.goto(buildDisposableLeadKanbanUrl(BASE_URL, fixture), { waitUntil: "networkidle", timeout: 15000 });
  await expect(page.getByRole("button", { name: "Switch to Table" })).toBeVisible({ timeout: 5000 });
  return requireDisposableLeadCard(page, fixture);
}

export async function requireDisposableLeadBaseline(page: Page, fixture: DisposableLeadFixture): Promise<Locator> {
  const card = await requireDisposableLeadCard(page, fixture);
  await expect(
    card.locator('xpath=ancestor::*[@data-kanban-column][1]'),
    `Disposable fixture ${fixture.id} must start unarchived, non-excluded, and in the New column`,
  ).toHaveAttribute("data-kanban-column", "new");

  await openDisposableLeadDetail(page, fixture);
  await requireDisposableLeadQualificationBaseline(page, fixture);

  return openDisposableLeadKanban(page, fixture);
}

export async function excludeDisposableLead(
  page: Page,
  fixture: DisposableLeadFixture,
  reason?: string,
): Promise<void> {
  const card = await requireDisposableLeadCard(page, fixture);
  const excluded = page.locator('[data-kanban-column="excluded"]');
  await card.dragTo(excluded, { force: true, targetPosition: { x: 90, y: 80 } });
  const dialog = page.getByRole("dialog", { name: "Exclude lead" });
  await expect(dialog).toBeVisible();
  if (reason) await dialog.getByLabel("Exclusion reason (optional)").fill(reason);
  await dialog.getByRole("button", { name: "Exclude lead" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10000 });
  await expect(disposableLeadCard(excluded, fixture)).toBeVisible({ timeout: 10000 });
}

export async function moveDisposableLeadToColumn(
  page: Page,
  fixture: DisposableLeadFixture,
  column: "new" | "verified",
): Promise<void> {
  const card = await requireDisposableLeadCard(page, fixture);
  const target = page.locator(`[data-kanban-column="${column}"]`);
  await card.dragTo(target, { force: true, targetPosition: { x: 90, y: 80 } });
  await expect(disposableLeadCard(target, fixture)).toBeVisible({ timeout: 10000 });
}

export async function restoreDisposableLeadBaseline(page: Page, fixture: DisposableLeadFixture): Promise<void> {
  await openDisposableLeadDetail(page, fixture);
  await page.getByRole("tab", { name: "Admin" }).click();
  const restoreExclusion = page.getByRole("button", { name: "Restore Lead" });
  await expect(restoreExclusion, `Disposable fixture ${fixture.id} must expose exclusion recovery controls`).toBeVisible();
  if (await restoreExclusion.isEnabled()) {
    await restoreExclusion.click();
    await expect(restoreExclusion).toBeDisabled({ timeout: 10000 });
  }

  await page.getByRole("tab", { name: "Work" }).click();
  const statusSection = page.getByRole("heading", { name: "Status and reminder" }).locator("..");
  const status = statusSection.locator("select").first();
  await expect(status, `Disposable fixture ${fixture.id} must expose status recovery controls`).toBeEnabled();
  if ((await status.inputValue()) !== "new") {
    await status.selectOption("new");
    await expect(page.getByText("Status updated", { exact: true })).toBeVisible({ timeout: 10000 });
  }

  await openDisposableLeadDetail(page, fixture);
  await requireDisposableLeadQualificationBaseline(page, fixture);
  await openDisposableLeadKanban(page, fixture);
  await requireDisposableLeadBaseline(page, fixture);
}

export async function restoreDisposableLeadArchiveState(page: Page, fixture: DisposableLeadFixture): Promise<void> {
  await page.goto(`${BASE_URL}${fixture.href}`, { waitUntil: "networkidle", timeout: 30000 });
  await expect(page.getByRole("heading", { name: fixture.name, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Admin" }).click();
  const restore = page.getByRole("button", { name: "Restore to active inventory" });
  await expect(restore, `Disposable fixture ${fixture.id} must expose archive recovery controls`).toBeVisible();
  if (await restore.isEnabled()) {
    await restore.click();
    await expect(restore).toBeDisabled({ timeout: 10000 });
  }
}

async function requireDisposableLeadCard(page: Page, fixture: DisposableLeadFixture): Promise<Locator> {
  const card = page.locator(`[data-lead-card-id="${fixture.id}"]`);
  await expect(card, `Approved disposable fixture ${fixture.id} must be visible exactly once on the Kanban board`).toHaveCount(1);
  await expect(
    card.getByRole("link", { name: fixture.name, exact: true }),
    `Disposable fixture ${fixture.id} must match E2E_DISPOSABLE_LEAD_NAME exactly`,
  ).toHaveAttribute("href", fixture.href);
  return card;
}

function disposableLeadCard(container: Locator, fixture: DisposableLeadFixture): Locator {
  return container.locator(`[data-lead-card-id="${fixture.id}"]`);
}

async function openDisposableLeadDetail(page: Page, fixture: DisposableLeadFixture): Promise<void> {
  await page.goto(`${BASE_URL}${fixture.href}`, { waitUntil: "networkidle", timeout: 15000 });
  await expect(page.getByRole("heading", { name: fixture.name, exact: true })).toBeVisible();
}

async function requireDisposableLeadQualificationBaseline(page: Page, fixture: DisposableLeadFixture): Promise<void> {
  const qualification = page.locator('[data-role="lead-qualification-status"]');
  await expect(qualification, `Disposable fixture ${fixture.id} must expose exactly one qualification status`).toHaveCount(1);
  await expect(
    qualification,
    `Disposable fixture ${fixture.id} must directly confirm qualification_status=${fixture.qualificationStatus}`,
  ).toHaveAttribute("data-qualification-status", fixture.qualificationStatus);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
