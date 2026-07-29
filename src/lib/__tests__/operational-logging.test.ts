import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  createPlatformAuditLog: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/queries", () => queryMocks);

import { recordOperationalEvent } from "@/lib/operational-logging";
import { getRuntimeLogContext } from "@/lib/runtime-log-context";
import { getTenantContext, runWithTenantContext } from "@/lib/tenancy/context";
import { runWithWorkerTenantContext, type WorkerTenantContext } from "@/lib/tenancy/worker-context";
import type { TenantWorkerAuthorization } from "@/lib/internal-worker-auth";
import type { TenantSession } from "@/lib/auth";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const ROLE_BINDING_A = "30000000-0000-4000-8000-000000000001";
const ACTOR_A = "50000000-0000-4000-8000-000000000001";

function session(overrides: Partial<TenantSession> = {}): TenantSession {
  return {
    userId: ACTOR_A,
    email: "actor@example.com",
    displayName: "Actor",
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    membershipId: MEMBERSHIP_A,
    role: "owner",
    roleBindingId: ROLE_BINDING_A,
    ...overrides,
  };
}

function workerAuthorization(tenantId: string, workspaceId: string | null, correlationId: string): TenantWorkerAuthorization {
  const context: WorkerTenantContext = {
    tenantId,
    workspaceId,
    jobId: "60000000-0000-4000-8000-000000000001",
    runId: "70000000-0000-4000-8000-000000000001",
    leaseId: "80000000-0000-4000-8000-000000000001",
    leaseGeneration: 2,
    workerName: "crawl",
    action: "crawl:process",
    sourcePrincipalKind: "cron",
    correlationId,
  };
  return { source: "cron", context };
}

function expectFixedRejection(errorSpy: ReturnType<typeof vi.spyOn>) {
  expect(errorSpy).toHaveBeenCalledTimes(1);
  expect(errorSpy).toHaveBeenCalledWith("operational_event", expect.objectContaining({
    action: "REJECTED_LOG_REDACTION",
    category: "server",
    severity: "error",
    entityType: "operational_log",
    metadata: expect.objectContaining({ reasonCode: "REJECTED_LOG_REDACTION", version: 1 }),
  }));
  const serialized = JSON.stringify(errorSpy.mock.calls[0]);
  expect(serialized).not.toContain("attacker");
  expect(serialized).not.toContain("secret");
}

describe("recordOperationalEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMocks.createAuditLog.mockResolvedValue(undefined);
    queryMocks.createPlatformAuditLog.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("captures one sanitized event and preserves explicit null actor compatibility", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const metadata = {
      email: "User@Example.com",
      resetToken: "secret-token",
      authorization: "Bearer very-secret-token",
      prompt_body: "private prompt body",
      customer_list: "private customer rows",
      source_url: "https://example.test/path?token=secret&next=/safe",
      next: "/reset-password?token=private#x",
      error: "provider response contains private customer rows",
      reason: "invalid_credentials",
      count: 3,
    };
    const before = structuredClone(metadata);

    await recordOperationalEvent({
      action: "auth_login_failed",
      category: "auth",
      actor: null,
      metadata,
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [, event] = infoSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toMatchObject({
      action: "auth_login_failed",
      category: "auth",
      actorUserId: null,
      actorEmail: null,
      runtime: expect.objectContaining({ scopeKind: "legacy_unscoped" }),
      metadata: expect.objectContaining({
        email: { domain: "example.com", hash: expect.any(String) },
        resetToken: "[redacted]",
        authorization: "[redacted]",
        prompt_body: "[redacted]",
        customer_list: "[redacted]",
        source_url: "https://example.test/path",
        next: "/reset-password",
        error: "[redacted]",
        reason: "invalid_credentials",
        count: 3,
      }),
    });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("Bearer very-secret-token");
    expect(serialized).not.toContain("private customer rows");
    expect(serialized).not.toContain("?token=");
    expect(metadata).toEqual(before);
    expect(queryMocks.createAuditLog).toHaveBeenCalledWith(
      "auth_login_failed",
      "auth",
      undefined,
      expect.objectContaining({
        email: { domain: "example.com", hash: expect.any(String) },
        resetToken: "[redacted]",
      }),
      { actor: null },
    );
  });

  it.each([
    ["absolute token path", "https://example.test/token/signed-private", "[redacted]"],
    ["relative token path", "/token/signed-private", "[redacted]"],
    ["percent-encoded secret path", "/safe/%73ecret%3Dprivate", "[redacted]"],
    ["userinfo", "https://user:private@example.test/path", "https://example.test/path"],
    ["arbitrary relative prose", "private locator prose", "[redacted]"],
    ["malformed input", "/safe/%E0%A4%A", "[redacted]"],
    ["scheme-relative host", "//example.test/path", "[redacted]"],
    ["ordinary root-relative path", "/reset-password", "/reset-password"],
    ["ordinary absolute path", "https://example.test/path", "https://example.test/path"],
    ["high-entropy signed path", "/signed/aB3dE7fG9hJ2kL5mN8pQ1rS4tU6vW0xY", "[redacted]"],
  ])("sanitizes locator boundaries for %s", async (_name, locator, expected) => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    await recordOperationalEvent({ action: "locator_fixture", category: "server", metadata: { next: locator } });
    const [, event] = infoSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toMatchObject({ next: expected });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("signed-private");
    expect(serialized).not.toContain("private");
  });

  it("derives member context and refuses forged metadata selectors", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    await runWithTenantContext(session(), "corr-member-a", async () => {
      await recordOperationalEvent({
        action: "lead_reviewed",
        category: "lead",
        metadata: {
          tenant_id: TENANT_B,
          workspaceId: WORKSPACE_B,
          correlationId: "forged",
          runId: "forged-run",
          status: "reviewed",
        },
      });
    });

    const [, event] = infoSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(event.runtime).toMatchObject({ scopeKind: "tenant", tenantId: TENANT_A, workspaceId: WORKSPACE_A, correlationId: "corr-member-a" });
    expect(event.metadata).toMatchObject({ status: "reviewed", runtime: expect.objectContaining({ tenantId: TENANT_A, correlationId: "corr-member-a" }) });
    expect(event.metadata).not.toHaveProperty("tenant_id");
    expect(event.metadata).not.toHaveProperty("workspaceId");
    expect(event.metadata).not.toHaveProperty("correlationId");
    expect(getTenantContext()).toBeNull();
  });

  it("derives worker tenant, run, and lease context without trusting metadata", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    await runWithWorkerTenantContext(workerAuthorization(TENANT_A, WORKSPACE_A, "corr-worker-a"), async () => {
      await recordOperationalEvent({
        action: "crawl_completed",
        category: "worker",
        metadata: { tenantId: TENANT_B, jobId: "forged-job", result: "ok" },
      });
    });

    const [, event] = infoSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(event.runtime).toMatchObject({
      scopeKind: "worker",
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      correlationId: "corr-worker-a",
      jobId: "60000000-0000-4000-8000-000000000001",
      runId: "70000000-0000-4000-8000-000000000001",
      leaseId: "80000000-0000-4000-8000-000000000001",
      leaseGeneration: 2,
    });
    expect(event.metadata).toMatchObject({ result: "ok" });
    expect(event.metadata).not.toHaveProperty("tenantId");
    expect(event.metadata).not.toHaveProperty("jobId");
  });

  it("requires explicit platform scope and preserves explicit legacy scope", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    await recordOperationalEvent({ action: "platform_health_checked", category: "server", scope: "platform", persist: true });
    await recordOperationalEvent({ action: "legacy_health_checked", category: "server", scope: "legacy_unscoped", persist: false });

    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(infoSpy.mock.calls[0]?.[1]).toMatchObject({ runtime: { scopeKind: "platform" } });
    expect(infoSpy.mock.calls[1]?.[1]).toMatchObject({ runtime: { scopeKind: "legacy_unscoped" } });
    expect(queryMocks.createPlatformAuditLog).toHaveBeenCalledWith(
      "platform_health_checked",
      "server",
      undefined,
      expect.objectContaining({ runtime: expect.objectContaining({ scopeKind: "platform" }) }),
      { scope: "platform", actor: { layer: "system" } },
    );
  });

  it("rejects nested secrets, contact identifiers, prompt/source content, and credential patterns", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const metadata = {
      nested: {
        contactEmail: "person@example.test",
        phone_number: "+1 (303) 555-0123",
        notes: "a safe-looking field containing person@example.test",
        value: "eyJhbGciOiJIUzI1NiJ9.payload.signature",
        keyValue: "sk-test-secret-value",
      },
      model_input: "raw prompt body",
      raw_html: "<html>private source</html>",
      product_datasheet: "private chemistry details",
    };
    await recordOperationalEvent({ action: "safe_redaction_fixture", category: "server", metadata });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(infoSpy.mock.calls[0]);
    expect(serialized).not.toContain("person@example.test");
    expect(serialized).not.toContain("555-0123");
    expect(serialized).not.toContain("eyJhbGci");
    expect(serialized).not.toContain("sk-test-secret-value");
    expect(serialized).not.toContain("private chemistry details");
  });

  it.each([
    ["cycle", () => { const value: Record<string, unknown> = {}; value.self = value; return value; }],
    ["accessor", () => { const value: Record<string, unknown> = {}; Object.defineProperty(value, "secret", { enumerable: true, get: () => "attacker" }); return value; }],
    ["symbol", () => { const value: Record<string | symbol, unknown> = {}; value[Symbol("unsafe")] = "attacker"; return value; }],
    ["custom prototype", () => Object.create({ inherited: "attacker" }) as Record<string, unknown>],
    ["function", () => ({ value: () => "unsafe" })],
    ["bigint", () => ({ value: BigInt(1) })],
  ])("fails closed for %s values and emits one fixed incident", async (_name, createValue) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordOperationalEvent({ action: "unsafe_fixture", category: "server", metadata: createValue() as Record<string, unknown> }))
      .rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    expectFixedRejection(errorSpy);
    expect(queryMocks.createAuditLog).toHaveBeenCalledTimes(1);
    expect(queryMocks.createAuditLog.mock.calls[0]?.[0]).toBe("rejected_log_redaction");
  });

  it("fails closed at depth, entries, key, value, and total event-size boundaries", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const longToken = "x".repeat(127);
    let deep: Record<string, unknown> = { value: "end" };
    for (let index = 0; index < 7; index += 1) deep = { child: deep };
    const cases: Record<string, Record<string, unknown>> = {
      depth: deep,
      entries: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`field${index}`, index])),
      key: { [`${"a".repeat(65)}`]: "value" },
      value: { reason: "x".repeat(513) },
      eventSize: Object.fromEntries(Array.from({ length: 64 }, (_, index) => [`field${index}`, {
        reason: longToken,
        status: longToken,
        type: longToken,
        version: longToken,
        model: longToken,
        code: longToken,
      }])),
    };
    for (const metadata of Object.values(cases)) {
      await expect(recordOperationalEvent({ action: "boundary_fixture", category: "server", metadata }))
        .rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    }
    expect(errorSpy).toHaveBeenCalledTimes(Object.keys(cases).length);
    expect(queryMocks.createAuditLog).toHaveBeenCalledTimes(Object.keys(cases).length);
  });

  it("omits error stacks and keeps buildErrorMetadata content-free", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = new Error("failure for person@example.test");
    error.stack = "Error: failure\n at private/source.ts:1";
    await recordOperationalEvent({ action: "error_observed", category: "server", metadata: { error } });

    const [, event] = infoSpy.mock.calls[0] as [string, Record<string, unknown>];
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("private/source.ts");
    expect(serialized).not.toContain(" at ");
    expect(serialized).not.toContain("failure for person@example.test");
    expect(serialized).toContain('"errorMessage":"[redacted]"');
  });

  it("isolates concurrent tenant A/B events and cleans context after completion", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const results = await Promise.all([
      runWithTenantContext(session(), "corr-concurrent-a", async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        await recordOperationalEvent({ action: "tenant_a_event", category: "lead", persist: false });
        return getRuntimeLogContext();
      }),
      runWithTenantContext(session({
        userId: "50000000-0000-4000-8000-000000000002",
        tenantId: TENANT_B,
        workspaceId: WORKSPACE_B,
        membershipId: "20000000-0000-4000-8000-000000000002",
        roleBindingId: "30000000-0000-4000-8000-000000000002",
      }), "corr-concurrent-b", async () => {
        await Promise.resolve();
        await recordOperationalEvent({ action: "tenant_b_event", category: "lead", persist: false });
        return getRuntimeLogContext();
      }),
    ]);
    expect(results.map((result) => result.tenantId)).toEqual([TENANT_A, TENANT_B]);
    expect(results.map((result) => result.correlationId)).toEqual(["corr-concurrent-a", "corr-concurrent-b"]);
    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(getTenantContext()).toBeNull();
  });

  it("does not leak event or persistence errors when persistence fails, and handles console failure safely", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => { throw new Error("console-private-error"); });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    queryMocks.createAuditLog.mockRejectedValue(new Error("database-private-error"));

    await recordOperationalEvent({ action: "persistence_failed", category: "server", metadata: { safe: "ok" } });

    expect(errorSpy).toHaveBeenCalledWith("operational_event_emit_failed", { code: "OPERATIONAL_LOG_EMIT_FAILED", version: 1 });
    expect(warnSpy).toHaveBeenCalledWith("operational_event_persist_failed", { code: "OPERATIONAL_EVENT_PERSIST_FAILED", version: 1 });
    const serialized = JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls]);
    expect(serialized).not.toContain("console-private-error");
    expect(serialized).not.toContain("database-private-error");
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects explicit platform/legacy scope inside accepted tenant context", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await runWithTenantContext(session(), "corr-scope-conflict", async () => {
      await expect(recordOperationalEvent({ action: "scope_conflict", category: "server", scope: "platform" }))
        .rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    });
    expectFixedRejection(errorSpy);
    expect(getTenantContext()).toBeNull();
  });

  it("default-denies unknown prose while preserving only categorical operational fields", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    await recordOperationalEvent({
      action: "categorical_fixture",
      category: "server",
      metadata: {
        notes: "private product catalog and customer prompt prose",
        safeReason: "this key is intentionally not an allowlist entry",
        reason: "invalid_credentials",
        type: "recovery",
        status: "failed",
        version: "v1",
        model: "gpt-5.4-mini",
        code: "AUTH_FAILED",
        count: 2,
      },
    });
    const [, event] = infoSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(event.metadata).toMatchObject({
      notes: "[redacted]",
      safeReason: "[redacted]",
      reason: "invalid_credentials",
      type: "recovery",
      status: "failed",
      version: "v1",
      model: "gpt-5.4-mini",
      code: "AUTH_FAILED",
      count: 2,
    });
  });

  it("rejects top-level and actor accessors without executing them", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let eventGetterCalled = false;
    const event = {} as Record<string, unknown>;
    Object.defineProperty(event, "action", { enumerable: true, get: () => { eventGetterCalled = true; throw new Error("private-event"); } });
    await expect(recordOperationalEvent(event as never)).rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    expect(eventGetterCalled).toBe(false);
    expectFixedRejection(errorSpy);

    vi.restoreAllMocks();
    const actorErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let actorGetterCalled = false;
    const actor = {} as Record<string, unknown>;
    Object.defineProperty(actor, "userId", { enumerable: true, get: () => { actorGetterCalled = true; throw new Error("private-actor"); } });
    await expect(recordOperationalEvent({ action: "actor_accessor", category: "server", actor: actor as never }))
      .rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    expect(actorGetterCalled).toBe(false);
    expectFixedRejection(actorErrorSpy);
  });

  it("rejects metadata accessors, Error own accessors, and Error subclasses without leaking content", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const metadata = {} as Record<string, unknown>;
    Object.defineProperty(metadata, "notes", { enumerable: true, get: () => { throw new Error("private-metadata"); } });
    await expect(recordOperationalEvent({ action: "metadata_accessor", category: "server", metadata }))
      .rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    expectFixedRejection(errorSpy);

    vi.restoreAllMocks();
    const errorAccessorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    class PrivateError extends Error {}
    const privateError = new PrivateError("private-content");
    Object.defineProperty(privateError, "message", { enumerable: false, get: () => { throw new Error("private-error-getter"); } });
    await expect(recordOperationalEvent({ action: "error_accessor", category: "server", metadata: { error: privateError } }))
      .rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    expectFixedRejection(errorAccessorSpy);
    const serialized = JSON.stringify(errorAccessorSpy.mock.calls);
    expect(serialized).not.toContain("private-content");
    expect(serialized).not.toContain("private-error-getter");

    vi.restoreAllMocks();
    const subclassErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordOperationalEvent({
      action: "custom_error_subclass",
      category: "server",
      metadata: { error: new PrivateError("private-subclass-content") },
    })).rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    expectFixedRejection(subclassErrorSpy);
  });

  it.each([
    ["extra numeric-looking key", () => { const value = ["safe"]; Object.defineProperty(value, "01", { value: "private", enumerable: true }); return value; }],
    ["symbol key", () => { const value = ["safe"]; (value as unknown as Record<symbol, unknown>)[Symbol("private")] = "private"; return value; }],
    ["accessor index", () => { const value: unknown[] = []; Object.defineProperty(value, "0", { enumerable: true, get: () => "private" }); Object.defineProperty(value, "length", { value: 1 }); return value; }],
    ["non-enumerable extra key", () => { const value = ["safe"]; Object.defineProperty(value, "private", { value: "private", enumerable: false }); return value; }],
    ["sparse hole", () => new Array(1)],
    ["custom prototype", () => Object.setPrototypeOf(["safe"], { unsafe: true })],
  ])("rejects noncanonical arrays: %s", async (_name, createValue) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordOperationalEvent({ action: "array_fixture", category: "server", metadata: { values: createValue() } }))
      .rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    expectFixedRejection(errorSpy);
  });

  it("keeps canonical arrays safe and rejects a viewer actor role", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    await recordOperationalEvent({ action: "canonical_array", category: "server", metadata: { values: [1, true, "status"] } });
    expect(infoSpy).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(recordOperationalEvent({
      action: "viewer_actor",
      category: "server",
      actor: { userId: "user", role: "viewer" as never },
    })).rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    expectFixedRejection(errorSpy);
  });

  it("survives broken console methods while rejecting and while warning about persistence", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => { throw new Error("private-console-error"); });
    const invalid = {} as Record<string, unknown>;
    Object.defineProperty(invalid, "metadata", { enumerable: true, get: () => { throw new Error("private-input"); } });
    await expect(recordOperationalEvent(invalid as never)).rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    expect(errorSpy.mock.calls.length).toBeGreaterThan(0);

    vi.restoreAllMocks();
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const persistenceWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => { throw new Error("private-persistence-warning"); });
    queryMocks.createAuditLog.mockRejectedValue(new Error("private-db-error"));
    await recordOperationalEvent({ action: "warning_fixture", category: "server", metadata: { reason: "failure" } });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(persistenceWarnSpy).toHaveBeenCalledTimes(1);
  });

  it("does not misclassify worker events or worker redaction incidents as audit rows", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    queryMocks.createAuditLog.mockClear();
    queryMocks.createPlatformAuditLog.mockClear();
    await runWithWorkerTenantContext(workerAuthorization(TENANT_A, WORKSPACE_A, "corr-worker-persist"), async () => {
      await recordOperationalEvent({ action: "worker_persist_unavailable", category: "worker", metadata: { status: "ok" } });
      await expect(recordOperationalEvent({ action: "worker_bad", category: "worker", metadata: { notes: () => "private" } }))
        .rejects.toMatchObject({ code: "REJECTED_LOG_REDACTION" });
    });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith("operational_event_persist_unavailable", { code: "OPERATIONAL_EVENT_PERSIST_UNAVAILABLE", version: 1 });
    expect(errorSpy).toHaveBeenCalledWith("operational_event", expect.objectContaining({ action: "REJECTED_LOG_REDACTION" }));
    expect(queryMocks.createAuditLog).not.toHaveBeenCalled();
    expect(queryMocks.createPlatformAuditLog).not.toHaveBeenCalled();
  });
});
