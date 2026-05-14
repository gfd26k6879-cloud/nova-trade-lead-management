import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePermission: authMocks.requirePermission,
}));

import {
  authorizeInternalWorkerRequest,
  getConfiguredWorkerCronSecrets,
  hasValidWorkerCronSecret,
} from "@/lib/internal-worker-auth";

function requestWithAuthorization(authorization: string | null): NextRequest {
  return {
    headers: {
      get(name: string) {
        return name.toLowerCase() === "authorization" ? authorization : null;
      },
    },
  } as NextRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
  authMocks.requirePermission.mockReset();
});

describe("internal worker auth", () => {
  it("accepts WORKER_CRON_SECRET bearer auth without requiring a session", async () => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");

    const request = requestWithAuthorization("Bearer worker-secret");
    await expect(authorizeInternalWorkerRequest(request, "ai:verify")).resolves.toEqual({ source: "cron" });

    expect(hasValidWorkerCronSecret(request)).toBe(true);
    expect(authMocks.requirePermission).not.toHaveBeenCalled();
  });

  it("accepts CRON_SECRET as a legacy fallback", () => {
    vi.stubEnv("WORKER_CRON_SECRET", "");
    vi.stubEnv("CRON_SECRET", "legacy-secret");

    expect(getConfiguredWorkerCronSecrets()).toEqual(["legacy-secret"]);
    expect(hasValidWorkerCronSecret(requestWithAuthorization("Bearer legacy-secret"))).toBe(true);
  });

  it("falls back to permission auth when bearer auth is missing or wrong", async () => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
    authMocks.requirePermission.mockResolvedValue({ userId: "user-1" });

    await expect(authorizeInternalWorkerRequest(requestWithAuthorization("Bearer wrong-secret"), "crawl:manage")).resolves.toEqual({
      source: "session",
    });

    expect(authMocks.requirePermission).toHaveBeenCalledWith("crawl:manage");
  });
});
