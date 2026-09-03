import { afterEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireTenantPermission: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requirePermission: authMocks.requirePermission,
}));
vi.mock("@/lib/tenancy/authorize", () => ({
  requireTenantPermission: authMocks.requireTenantPermission,
}));

import {
  authorizeInternalWorkerRequest,
  createTenantWorkerAuthorizationService,
  getConfiguredWorkerCronSecrets,
  hasValidWorkerCronSecret,
  INTERNAL_WORKER_ACTIONS,
  INTERNAL_WORKER_LEASE_INTEGRITY_VERSION,
  INTERNAL_WORKER_LEASE_RECORD_VERSION,
  INTERNAL_WORKER_SELECTOR_HEADER,
} from "@/lib/internal-worker-auth";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const JOB_A = "20000000-0000-4000-8000-000000000001";
const JOB_B = "20000000-0000-4000-8000-000000000002";
const RUN_A = "30000000-0000-4000-8000-000000000001";
const LEASE_A = "40000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-07-27T12:00:00.000Z");

function requestWithAuthorization(authorization: string | null, headers: Record<string, string> = {}): NextRequest {
  return {
    headers: {
      get(name: string) {
        if (name.toLowerCase() === "authorization") return authorization;
        return headers[name.toLowerCase()] ?? null;
      },
    },
  } as NextRequest;
}

function lease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    selector: "opaque-lease-a",
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    jobId: JOB_A,
    runId: RUN_A,
    leaseId: LEASE_A,
    leaseGeneration: 3,
    workerName: "crawl",
    action: INTERNAL_WORKER_ACTIONS.crawl,
    status: "active",
    notBefore: "2026-07-27T11:00:00.000Z",
    expiresAt: "2026-07-27T13:00:00.000Z",
    correlationId: "corr-worker-a",
    recordVersion: INTERNAL_WORKER_LEASE_RECORD_VERSION,
    integrityVersion: INTERNAL_WORKER_LEASE_INTEGRITY_VERSION,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  authMocks.requirePermission.mockReset();
  authMocks.requireTenantPermission.mockReset();
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

  it("requires a valid cron secret and a matching durable lease before granting tenant scope", async () => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
    const service = createTenantWorkerAuthorizationService({
      resolveLease: vi.fn(async (selector) => lease({ selector })),
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });

    await expect(service.authorize(
      requestWithAuthorization("Bearer worker-secret", { [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a" }),
      "crawl",
    )).resolves.toMatchObject({
      source: "cron",
      context: {
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        jobId: JOB_A,
        runId: RUN_A,
        leaseId: LEASE_A,
        leaseGeneration: 3,
        workerName: "crawl",
        action: INTERNAL_WORKER_ACTIONS.crawl,
        sourcePrincipalKind: "cron",
        correlationId: "corr-worker-a",
      },
    });
    expect(authMocks.requireTenantPermission).not.toHaveBeenCalled();
  });

  it("rejects a caller-supplied action that is not the fixed action for the worker", async () => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
    const resolveLease = vi.fn(async (selector: string) => lease({ selector }));
    const service = createTenantWorkerAuthorizationService({
      resolveLease,
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });

    await expect(service.authorize(
      requestWithAuthorization("Bearer worker-secret", { [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a" }),
      "crawl",
      INTERNAL_WORKER_ACTIONS.enrichment,
    )).rejects.toMatchObject({ code: "WORKER_AUTHORIZATION_FAILED" });
    expect(resolveLease).not.toHaveBeenCalled();
  });

  it("rejects a durable row whose action is not the fixed action for the worker", async () => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
    const service = createTenantWorkerAuthorizationService({
      resolveLease: async (selector) => lease({ selector, action: INTERNAL_WORKER_ACTIONS.enrichment }),
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });

    await expect(service.authorize(
      requestWithAuthorization("Bearer worker-secret", { [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a" }),
      "crawl",
    )).rejects.toMatchObject({ code: "WORKER_AUTHORIZATION_FAILED" });
  });

  it("uses T-013 tenant permission for session fallback and never treats a legacy role as tenant authority", async () => {
    authMocks.requireTenantPermission.mockResolvedValue({ tenantId: TENANT_A, workspaceId: WORKSPACE_A });
    const service = createTenantWorkerAuthorizationService({
      resolveLease: async (selector) => lease({ selector }),
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });

    await expect(service.authorize(
      requestWithAuthorization(null, { [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a" }),
      "crawl",
    )).resolves.toMatchObject({ source: "session", context: { tenantId: TENANT_A, workspaceId: WORKSPACE_A } });
    expect(authMocks.requireTenantPermission).toHaveBeenCalledWith(
      { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
      "queue:operate",
      { sessionBoundary: undefined },
    );
    expect(authMocks.requirePermission).not.toHaveBeenCalled();
  });

  it.each([
    ["no resolver row", undefined],
    ["wrong selector in resolver row", lease({ selector: "another-selector" })],
    ["wrong worker", lease({ workerName: "enrichment", action: INTERNAL_WORKER_ACTIONS.enrichment })],
    ["expired lease", lease({ expiresAt: "2026-07-27T11:59:59.999Z" })],
    ["not-before lease", lease({ notBefore: "2026-07-27T12:00:00.001Z" })],
    ["canceled lease", lease({ status: "canceled" })],
    ["completed lease", lease({ status: "completed" })],
    ["unknown extra key", lease({ unexpected: "must-deny" })],
    ["malformed result", { selector: "opaque-lease-a", tenantId: TENANT_A }],
    ["ambiguous result", [lease(), lease({ jobId: JOB_B })]],
  ])("denies %s with a stable non-sensitive error", async (_name, result) => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
    const service = createTenantWorkerAuthorizationService({
      resolveLease: async () => result,
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });

    await expect(service.authorize(
      requestWithAuthorization("Bearer worker-secret", { [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a" }),
      "crawl",
    )).rejects.toMatchObject({ status: 401, code: "WORKER_AUTHORIZATION_FAILED", message: "Worker authorization failed" });
  });

  it("rejects a valid-looking record with a custom prototype and inherited extra key", async () => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
    const inherited = Object.create({ inheritedExtra: "must-deny" }) as Record<string, unknown>;
    Object.assign(inherited, lease());
    const service = createTenantWorkerAuthorizationService({
      resolveLease: async () => inherited,
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });

    await expect(service.authorize(
      requestWithAuthorization("Bearer worker-secret", { [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a" }),
      "crawl",
    )).rejects.toMatchObject({ code: "WORKER_AUTHORIZATION_FAILED" });
  });

  it("denies a resolver throw without exposing its message or the tenant record", async () => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
    const service = createTenantWorkerAuthorizationService({
      resolveLease: async () => { throw new Error("DATABASE_URL=secret raw row"); },
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });

    await expect(service.authorize(
      requestWithAuthorization("Bearer worker-secret", { [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a" }),
      "crawl",
    )).rejects.toMatchObject({ message: "Worker authorization failed" });
  });

  it("ignores forged tenant, workspace, and role headers", async () => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
    const service = createTenantWorkerAuthorizationService({
      resolveLease: async (selector) => lease({ selector }),
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });

    const result = await service.authorize(requestWithAuthorization("Bearer worker-secret", {
      [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a",
      "x-tenant-id": TENANT_B,
      "x-workspace-id": WORKSPACE_B,
      "x-role": "owner",
    }), "crawl");
    expect(result.context.tenantId).toBe(TENANT_A);
    expect(result.context.workspaceId).toBe(WORKSPACE_A);
  });

  it("rejects a session whose tenant or workspace differs from the durable record", async () => {
    authMocks.requireTenantPermission.mockResolvedValue({ tenantId: TENANT_B, workspaceId: WORKSPACE_B });
    const service = createTenantWorkerAuthorizationService({
      resolveLease: async (selector) => lease({ selector }),
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });

    await expect(service.authorize(requestWithAuthorization(null, {
      [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a",
    }), "crawl")).rejects.toMatchObject({ code: "WORKER_AUTHORIZATION_FAILED" });
  });

  it("uses only the trusted construction-time clock and rejects malformed bearer parsing", async () => {
    vi.stubEnv("WORKER_CRON_SECRET", "worker-secret");
    expect(hasValidWorkerCronSecret(requestWithAuthorization("Bearer worker-secret extra"))).toBe(false);
    expect(hasValidWorkerCronSecret(requestWithAuthorization("Basic worker-secret"))).toBe(false);

    const service = createTenantWorkerAuthorizationService({
      resolveLease: async (selector) => lease({ selector, expiresAt: "2026-07-27T12:00:00.001Z" }),
      sessionPermission: "queue:operate",
      clock: () => NOW,
    });
    const result = await service.authorize(requestWithAuthorization("Bearer worker-secret", {
      [INTERNAL_WORKER_SELECTOR_HEADER]: "opaque-lease-a",
      "x-now": "2099-01-01T00:00:00.000Z",
    }), "crawl");
    expect(result.context.tenantId).toBe(TENANT_A);
  });
});
