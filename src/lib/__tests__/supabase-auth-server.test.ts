import { describe, expect, it } from "vitest";

vi.mock("server-only", () => ({}));

import { getSupabaseAuthCookieNames, isStaleSupabaseAuthError } from "@/lib/supabase/server";
import { vi } from "vitest";

describe("Supabase server auth helpers", () => {
  it("detects stale refresh token auth errors", () => {
    expect(isStaleSupabaseAuthError({ code: "refresh_token_not_found", message: "Refresh Token Not Found" })).toBe(true);
    expect(isStaleSupabaseAuthError(new Error("Invalid Refresh Token: Refresh Token Not Found"))).toBe(true);
    expect(isStaleSupabaseAuthError(new Error("Auth session missing"))).toBe(true);
    expect(isStaleSupabaseAuthError(new Error("Invalid login credentials"))).toBe(false);
  });

  it("selects only Supabase auth-token cookies for cleanup", () => {
    expect(getSupabaseAuthCookieNames([
      { name: "sb-wbavqthrnnokylfzaiwv-auth-token" },
      { name: "sb-wbavqthrnnokylfzaiwv-auth-token.0" },
      { name: "sb-other-cookie" },
      { name: "next-router-state" },
    ])).toEqual([
      "sb-wbavqthrnnokylfzaiwv-auth-token",
      "sb-wbavqthrnnokylfzaiwv-auth-token.0",
    ]);
  });
});
