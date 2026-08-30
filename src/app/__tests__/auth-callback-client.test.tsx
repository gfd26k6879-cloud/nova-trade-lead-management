import { beforeEach, describe, expect, it, vi } from "vitest";

const reactMocks = vi.hoisted(() => ({
  useEffect: vi.fn((effect: () => void | (() => void)) => {
    effect();
  }),
  useState: vi.fn(<T,>(initial: T) => [initial, vi.fn()] as const),
}));

const supabaseMocks = vi.hoisted(() => ({
  createSupabaseBrowserClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: reactMocks.useEffect,
  useState: reactMocks.useState,
}));
vi.mock("@/lib/supabase/browser", () => supabaseMocks);

import { AuthCallbackClient } from "@/app/auth/callback/callback-client";

beforeEach(() => {
  vi.clearAllMocks();
  supabaseMocks.setSession.mockResolvedValue({ error: null });
  supabaseMocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  supabaseMocks.createSupabaseBrowserClient.mockReturnValue({
    auth: {
      exchangeCodeForSession: supabaseMocks.exchangeCodeForSession,
      setSession: supabaseMocks.setSession,
    },
  });
});

describe("AuthCallbackClient redirect sinks", () => {
  it.each([
    [
      "access-token",
      "https://app.example/auth/callback?next=%2F%5Cattacker.example%2Fcollect#access_token=access&refresh_token=refresh",
      "#access_token=access&refresh_token=refresh",
      supabaseMocks.setSession,
    ],
    [
      "PKCE code",
      "https://app.example/auth/callback?code=code-1&next=%2F%5Cattacker.example%2Fcollect",
      "",
      supabaseMocks.exchangeCodeForSession,
    ],
  ])("keeps a hostile %s continuation away from the external redirect sink", async (_label, href, hash, exchange) => {
    const browser = installWindow(href, hash);

    AuthCallbackClient();

    await vi.waitFor(() => expect(exchange).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(browser.locationReplace).toHaveBeenCalledWith("/reset-password"));
    expect(JSON.stringify(browser.locationReplace.mock.calls)).not.toContain("attacker.example");
  });

  it.each([
    [
      "access-token",
      "https://app.example/auth/callback?next=%2Fqueue%3Fview%3Dmine#access_token=access&refresh_token=refresh",
      "#access_token=access&refresh_token=refresh",
      supabaseMocks.setSession,
    ],
    [
      "PKCE code",
      "https://app.example/auth/callback?code=code-1&next=%2Fqueue%3Fview%3Dmine",
      "",
      supabaseMocks.exchangeCodeForSession,
    ],
  ])("preserves a legitimate local continuation after a successful %s exchange", async (_label, href, hash, exchange) => {
    const browser = installWindow(href, hash);

    AuthCallbackClient();

    await vi.waitFor(() => expect(exchange).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(browser.locationReplace).toHaveBeenCalledWith("/queue?view=mine"));
  });
});

function installWindow(href: string, hash: string) {
  const locationReplace = vi.fn();
  const historyReplaceState = vi.fn();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      history: { replaceState: historyReplaceState },
      location: { hash, href, replace: locationReplace },
    },
  });
  return { historyReplaceState, locationReplace };
}
