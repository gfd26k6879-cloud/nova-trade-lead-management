import { describe, expect, it } from "vitest";
import { buildAuthCallbackUrl, resolveCanonicalAppUrl } from "@/lib/app-url";

describe("app URL helpers", () => {
  it("uses NEXT_PUBLIC_APP_URL before request origin", () => {
    expect(resolveCanonicalAppUrl("http://localhost:3000", {
      NEXT_PUBLIC_APP_URL: "https://lead-generation-orcin.vercel.app/",
      NODE_ENV: "production",
    })).toBe("https://lead-generation-orcin.vercel.app");
  });

  it("only falls back to request origin outside production", () => {
    expect(resolveCanonicalAppUrl("http://localhost:3000", {
      NEXT_PUBLIC_APP_URL: "",
      NODE_ENV: "development",
    })).toBe("http://localhost:3000");

    expect(resolveCanonicalAppUrl("https://preview.example", {
      NEXT_PUBLIC_APP_URL: "",
      NODE_ENV: "production",
    })).toBeNull();
  });

  it("builds encoded Supabase auth callback URLs", () => {
    expect(buildAuthCallbackUrl("/reset-password", "https://lead-generation-orcin.vercel.app"))
      .toBe("https://lead-generation-orcin.vercel.app/auth/callback?next=%2Freset-password");
    expect(buildAuthCallbackUrl("/reset-password", "https://example.com"))
      .toBe("https://example.com/auth/callback?next=%2Freset-password");
  });
});
