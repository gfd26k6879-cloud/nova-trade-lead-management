import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: supabaseMocks.getUser,
    },
  })),
}));

import { proxy } from "@/proxy";

beforeEach(() => {
  supabaseMocks.getUser.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy security headers", () => {
  it("adds a nonce-based script CSP without allowing inline scripts in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await proxy(new NextRequest("https://example.test/login"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";

    expect(csp).toMatch(/script-src[^;]*'nonce-[^']+'[^;]*'strict-dynamic'/);
    expect(csp).toMatch(/script-src-elem[^;]*'self'[^;]*'nonce-[^']+'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Cache-Control")).toBe("no-transform");
  });

  it("keeps protected redirects private and covered by security headers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await proxy(new NextRequest("https://example.test/queue"));

    expect(response.status).toBe(307);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0, must-revalidate, no-transform");
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it.each([
    "/dashboard",
    "/coverage",
    "/explore",
    "/scheduler",
    "/quality",
    "/leads",
    "/queue",
    "/statistics",
    "/settings",
    "/users",
    "/fulfillment",
    "/team",
  ])("routes %s through the protected session boundary", async (pathname) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await proxy(new NextRequest(`https://example.test${pathname}`));
    const redirect = new URL(response.headers.get("location") ?? "https://example.test/");

    expect(response.status).toBe(307);
    expect(redirect.pathname).toBe("/login");
    expect(redirect.searchParams.get("error")).toBe("missing_config");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0, must-revalidate, no-transform");
  });

  it("clears stale Supabase auth cookies without leaking auth errors from protected redirects", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    supabaseMocks.getUser.mockRejectedValue(Object.assign(new Error("Invalid Refresh Token: Refresh Token Not Found"), {
      code: "refresh_token_not_found",
    }));

    const response = await proxy(new NextRequest("https://example.test/queue", {
      headers: {
        cookie: "sb-project-auth-token=stale; unrelated=value",
      },
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.test/login");
    expect(response.headers.get("set-cookie")).toContain("sb-project-auth-token=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).not.toContain("unrelated=");
  });

  it("allows Google Maps assets without opening Places or geocoding APIs broadly", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await proxy(new NextRequest("https://example.test/login"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";

    expect(csp).toMatch(/script-src[^;]*https:\/\/maps\.googleapis\.com[^;]*https:\/\/maps\.gstatic\.com/);
    expect(csp).toMatch(/script-src-elem[^;]*https:\/\/maps\.googleapis\.com[^;]*https:\/\/maps\.gstatic\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/maps\.googleapis\.com[^;]*https:\/\/maps\.gstatic\.com/);
    expect(csp).toContain("img-src 'self' data: blob: https:");
    expect(csp).not.toContain("places.googleapis.com");
    expect(csp).not.toContain("geocoding.googleapis.com");
  });
});
