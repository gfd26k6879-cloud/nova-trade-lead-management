import { describe, expect, it } from "vitest";

import { assertE2EAuth, assertMutationSafety, hasE2EAuth } from "../../../scripts/e2e-safety.mjs";

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
    expect(() => assertMutationSafety({
      E2E_ALLOW_MUTATIONS: "1",
      E2E_BASE_URL: "http://127.0.0.1:3000",
    })).not.toThrow();
  });

  it("requires a second explicit override for remote mutations", () => {
    const remote = {
      E2E_ALLOW_MUTATIONS: "1",
      E2E_BASE_URL: "https://staging.example.test",
    };
    expect(() => assertMutationSafety(remote)).toThrow(/Refusing mutating E2E against non-loopback host/);
    expect(() => assertMutationSafety({ ...remote, E2E_ALLOW_REMOTE_MUTATIONS: "1" })).not.toThrow();
  });
});
