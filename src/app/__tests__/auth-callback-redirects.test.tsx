import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  }),
}));

const operationalLoggingMocks = vi.hoisted(() => ({
  recordOperationalEvent: vi.fn(),
}));

const routeTimingMocks = vi.hoisted(() => ({
  logRouteTiming: vi.fn(),
  startRouteTiming: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  isSupabaseAuthConfigured: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("next/navigation", () => navigationMocks);
vi.mock("@/lib/operational-logging", () => operationalLoggingMocks);
vi.mock("@/lib/route-timing", () => routeTimingMocks);
vi.mock("@/lib/supabase/server", () => supabaseMocks);

import { confirmRecoveryTokenAction } from "@/app/auth/callback/actions";
import AuthCallbackPage from "@/app/auth/callback/page";

beforeEach(() => {
  vi.clearAllMocks();
  navigationMocks.redirect.mockImplementation((location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  });
  operationalLoggingMocks.recordOperationalEvent.mockResolvedValue(undefined);
  routeTimingMocks.startRouteTiming.mockReturnValue(routeTimingMocks.logRouteTiming);
  supabaseMocks.isSupabaseAuthConfigured.mockReturnValue(true);
  supabaseMocks.verifyOtp.mockResolvedValue({ error: null });
  supabaseMocks.createSupabaseServerClient.mockResolvedValue({
    auth: { verifyOtp: supabaseMocks.verifyOtp },
  });
});

describe("auth callback redirect boundary", () => {
  it("does not carry a backslash authority into the token-hash continuation form", async () => {
    const node = await AuthCallbackPage({
      searchParams: Promise.resolve({
        token_hash: "token-hash-value-1234567890",
        type: "recovery",
        next: "/\\attacker.example/collect",
      }),
    });
    const html = renderToStaticMarkup(node as React.ReactElement);

    expect(html).toContain('name="next"');
    expect(html).toContain('value="/reset-password"');
    expect(html).not.toContain("attacker.example");
  });

  it("redirects a verified hostile continuation only to the local fallback", async () => {
    const formData = recoveryForm("/\\attacker.example/collect");

    await expect(confirmRecoveryTokenAction(formData)).rejects.toThrow("NEXT_REDIRECT:/reset-password");

    expect(supabaseMocks.verifyOtp).toHaveBeenCalledOnce();
    expect(navigationMocks.redirect).toHaveBeenCalledWith("/reset-password");
    expect(JSON.stringify(navigationMocks.redirect.mock.calls)).not.toContain("attacker.example");
  });

  it("preserves a verified legitimate application-local continuation", async () => {
    const formData = recoveryForm("/queue?view=mine#today");

    await expect(confirmRecoveryTokenAction(formData)).rejects.toThrow("NEXT_REDIRECT:/queue?view=mine#today");

    expect(navigationMocks.redirect).toHaveBeenCalledWith("/queue?view=mine#today");
  });
});

function recoveryForm(next: string): FormData {
  const formData = new FormData();
  formData.set("tokenHash", "token-hash-value-1234567890");
  formData.set("type", "recovery");
  formData.set("next", next);
  return formData;
}
