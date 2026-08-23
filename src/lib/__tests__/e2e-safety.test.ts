import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  assertDisposableLeadFixture,
  assertE2EAuth,
  assertMutationSafety,
  buildDisposableLeadKanbanUrl,
  hasE2EAuth,
} from "../../../scripts/e2e-safety.mjs";

describe("E2E suite safety", () => {
  it("requires a complete credential pair or a storage state", () => {
    expect(hasE2EAuth({})).toBe(false);
    expect(hasE2EAuth({ E2E_STORAGE_STATE: "   " })).toBe(false);
    expect(hasE2EAuth({ E2E_SUPABASE_EMAIL: "operator@example.test" })).toBe(false);
    expect(hasE2EAuth({
      E2E_SUPABASE_EMAIL: "operator@example.test",
      E2E_SUPABASE_PASSWORD: "test-password",
    })).toBe(true);
  });

  it("fails authenticated gates instead of silently skipping", () => {
    expect(() => assertE2EAuth({})).toThrow(/Authenticated E2E requires/);
    expect(() => assertE2EAuth({ E2E_STORAGE_STATE: "does-not-exist.json" })).toThrow(
      /E2E_STORAGE_STATE does not exist/,
    );
  });

  it("allows explicitly enabled mutations on loopback", () => {
    expect(assertMutationSafety({
      E2E_ALLOW_MUTATIONS: "1",
      E2E_BASE_URL: "http://127.0.0.1:3000",
      E2E_DISPOSABLE_LEAD_ID: "lead-e2e-1",
      E2E_DISPOSABLE_LEAD_NAME: "[E2E DISPOSABLE] Kanban lead",
    })).toEqual({
      id: "lead-e2e-1",
      name: "[E2E DISPOSABLE] Kanban lead",
      href: "/leads/lead-e2e-1",
      qualificationStatus: "needs_verification",
      qualificationLabel: "Needs Verification",
    });
  });

  it("requires the disposable fixture binding as part of mutation opt-in", () => {
    expect(() => assertMutationSafety({
      E2E_ALLOW_MUTATIONS: "1",
      E2E_BASE_URL: "http://127.0.0.1:3000",
    })).toThrow(/E2E_DISPOSABLE_LEAD_ID/);
  });

  it("requires a second explicit override for remote mutations", () => {
    const remote = {
      E2E_ALLOW_MUTATIONS: "1",
      E2E_BASE_URL: "https://staging.example.test",
      E2E_DISPOSABLE_LEAD_ID: "lead-e2e-1",
      E2E_DISPOSABLE_LEAD_NAME: "[E2E DISPOSABLE] Kanban lead",
    };
    expect(() => assertMutationSafety(remote)).toThrow(/Refusing mutating E2E against non-loopback host/);
    expect(() => assertMutationSafety({ ...remote, E2E_ALLOW_REMOTE_MUTATIONS: "1" })).not.toThrow();
  });

  it("requires an explicitly named disposable lead fixture", () => {
    expect(() => assertDisposableLeadFixture({})).toThrow(/E2E_DISPOSABLE_LEAD_ID/);
    expect(() => assertDisposableLeadFixture({
      E2E_DISPOSABLE_LEAD_ID: "lead-e2e-1",
    })).toThrow(/E2E_DISPOSABLE_LEAD_NAME/);
    expect(() => assertDisposableLeadFixture({
      E2E_DISPOSABLE_LEAD_ID: "lead-e2e-1",
      E2E_DISPOSABLE_LEAD_NAME: "Customer lead",
    })).toThrow(/\[E2E DISPOSABLE\]/);
  });

  it("rejects unsafe fixture identifiers and returns a normalized ownership binding", () => {
    expect(() => assertDisposableLeadFixture({
      E2E_DISPOSABLE_LEAD_ID: "../another-lead",
      E2E_DISPOSABLE_LEAD_NAME: "[E2E DISPOSABLE] Kanban lead",
    })).toThrow(/safe lead identifier/);

    expect(assertDisposableLeadFixture({
      E2E_DISPOSABLE_LEAD_ID: "  lead-e2e-1  ",
      E2E_DISPOSABLE_LEAD_NAME: "  [E2E DISPOSABLE] Kanban lead  ",
    })).toEqual({
      id: "lead-e2e-1",
      name: "[E2E DISPOSABLE] Kanban lead",
      href: "/leads/lead-e2e-1",
      qualificationStatus: "needs_verification",
      qualificationLabel: "Needs Verification",
    });
  });

  it("builds a Kanban URL constrained to the bound disposable fixture name", () => {
    expect(buildDisposableLeadKanbanUrl("http://127.0.0.1:3000/other", {
      id: "lead-e2e-1",
      name: "[E2E DISPOSABLE] Kanban lead",
      href: "/leads/lead-e2e-1",
      qualificationStatus: "needs_verification",
      qualificationLabel: "Needs Verification",
    })).toBe("http://127.0.0.1:3000/leads?view=kanban&search=%5BE2E+DISPOSABLE%5D+Kanban+lead");
  });

  it("keeps UI-only baseline and archive recovery wired into the mutating harness", () => {
    const fixturesSource = readFileSync("e2e/auth-fixtures.ts", "utf8");
    const workbenchSource = readFileSync("e2e/lead-workbench-flow.spec.ts", "utf8");
    const mutatingSpecs = [
      "e2e/excluded-drag-verify.spec.ts",
      "e2e/excluded-to-verified.spec.ts",
      "e2e/kanban-exclusion-prompt.spec.ts",
      "e2e/leads-fixes-verify.spec.ts",
      "e2e/lead-workbench-flow.spec.ts",
    ].map((path) => readFileSync(path, "utf8"));
    const archiveRecoverySource = fixturesSource.slice(
      fixturesSource.indexOf("export async function restoreDisposableLeadArchiveState"),
      fixturesSource.indexOf("async function requireDisposableLeadCard"),
    );
    const adminSelection = archiveRecoverySource.indexOf('getByRole("tab", { name: "Admin" }).click()');
    const archiveRestoreLookup = archiveRecoverySource.indexOf('getByRole("button", { name: "Restore to active inventory" })');

    expect(fixturesSource).toContain("buildDisposableLeadKanbanUrl(BASE_URL, fixture)");
    expect(fixturesSource).toContain('locator(\'[data-role="lead-qualification-status"]\')');
    expect(fixturesSource).toContain('toHaveAttribute("data-qualification-status", fixture.qualificationStatus)');
    expect(fixturesSource).toContain('getByRole("button", { name: "Restore Lead" })');
    expect(adminSelection).toBeGreaterThan(-1);
    expect(archiveRestoreLookup).toBeGreaterThan(adminSelection);
    expect(workbenchSource).toContain("restoreDisposableLeadArchiveState(page, fixture)");
    expect(workbenchSource).not.toContain("let archived");
    for (const source of mutatingSpecs) {
      expect(source).toContain("requireMutationOptIn()");
      expect(source).toContain("finally {");
      expect(source).not.toContain("test.skip");
      expect(source).not.toContain('a[href^="/leads/"]');
    }
    expect(workbenchSource).not.toContain('getByRole("button", { name: "Log outcome" })');
  });
});
