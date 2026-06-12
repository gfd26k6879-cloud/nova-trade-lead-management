import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/runtime-log-context", () => ({
  getRuntimeLogContext: () => ({
    vercelEnv: "preview",
    vercelUrl: "example.vercel.app",
    gitRef: "codex/test",
    gitSha: "abc123",
  }),
}));

import { recordOperationalEvent } from "@/lib/operational-logging";

describe("recordOperationalEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMocks.createAuditLog.mockResolvedValue(undefined);
  });

  it("redacts sensitive console metadata and preserves an explicit null audit actor", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await recordOperationalEvent({
      action: "auth_login_failed",
      category: "auth",
      actor: null,
      metadata: {
        email: "User@Example.com",
        resetToken: "secret-token",
      },
    });

    expect(infoSpy).toHaveBeenCalledWith(
      "operational_event",
      expect.objectContaining({
        actorEmail: null,
        metadata: expect.objectContaining({
          email: expect.objectContaining({
            domain: "example.com",
            hash: expect.any(String),
          }),
          resetToken: "[redacted]",
        }),
      }),
    );
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "auth_login_failed",
      "auth",
      undefined,
      expect.objectContaining({
        email: "User@Example.com",
        resetToken: "[redacted]",
      }),
      { actor: null },
    );

    infoSpy.mockRestore();
  });
});
