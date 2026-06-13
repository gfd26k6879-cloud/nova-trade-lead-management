import { describe, expect, it } from "vitest";
import { buildAuthCallbackUrl, buildWelcomeInviteUrl, CANONICAL_APP_URL, resolveCanonicalAppUrl } from "@/lib/app-url";

describe("app URL helpers", () => {
  it("uses NEXT_PUBLIC_APP_URL before request origin", () => {
    expect(resolveCanonicalAppUrl("http://localhost:3000", {
      NEXT_PUBLIC_APP_URL: `${CANONICAL_APP_URL}/`,
      NODE_ENV: "production",
    })).toBe(CANONICAL_APP_URL);
  });

  it("falls back to the current production domain when production env is missing or stale", () => {
    expect(resolveCanonicalAppUrl("https://preview.example", {
      NEXT_PUBLIC_APP_URL: "",
      NODE_ENV: "production",
    })).toBe(CANONICAL_APP_URL);

    expect(resolveCanonicalAppUrl("https://preview.example", {
      NEXT_PUBLIC_APP_URL: "https://lead-generation-orcin.vercel.app",
      NODE_ENV: "production",
    })).toBe(CANONICAL_APP_URL);
  });

  it("uses request origin outside production and canonical fallback in production", () => {
    expect(resolveCanonicalAppUrl("http://localhost:3000", {
      NEXT_PUBLIC_APP_URL: "",
      NODE_ENV: "development",
    })).toBe("http://localhost:3000");

    expect(resolveCanonicalAppUrl("https://preview.example", {
      NEXT_PUBLIC_APP_URL: "",
      NODE_ENV: "production",
    })).toBe(CANONICAL_APP_URL);
  });

  it("builds encoded Supabase auth callback URLs", () => {
    expect(buildAuthCallbackUrl("/reset-password", CANONICAL_APP_URL))
      .toBe(`${CANONICAL_APP_URL}/auth/callback?next=%2Freset-password`);
    expect(buildAuthCallbackUrl("/reset-password", "https://example.com"))
      .toBe("https://example.com/auth/callback?next=%2Freset-password");
    expect(buildWelcomeInviteUrl("reset-password", CANONICAL_APP_URL))
      .toBe(`${CANONICAL_APP_URL}/auth/callback?next=%2Freset-password`);
    expect(buildAuthCallbackUrl("/queue", CANONICAL_APP_URL))
      .toBe(`${CANONICAL_APP_URL}/auth/callback?next=%2Fqueue`);
  });
});
