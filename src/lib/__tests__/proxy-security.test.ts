import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy security headers", () => {
  it("adds a nonce-based script CSP without allowing inline scripts in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await proxy(new NextRequest("https://example.test/login"));
    const csp = response.headers.get("Content-Security-Policy") ?? "";

    expect(csp).toMatch(/script-src[^;]*'nonce-[^']+'[^;]*'strict-dynamic'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-eval'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("keeps protected redirects private and covered by security headers", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");

    const response = await proxy(new NextRequest("https://example.test/queue"));

    expect(response.status).toBe(307);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0, must-revalidate");
    expect(response.headers.get("Content-Security-Policy")).toContain("script-src");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
