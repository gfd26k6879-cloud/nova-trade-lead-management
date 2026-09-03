import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const postgresMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  unsafe: vi.fn(),
  end: vi.fn(),
}));
vi.mock("postgres", () => ({ default: postgresMocks.connect }));

import type { DbClient } from "@/lib/db";
import {
  createFailClosedWorkerLeaseResolverRuntime,
  createWorkerLeaseIssuerRuntime,
  createWorkerLeaseResolverRuntime,
} from "@/lib/tenancy/worker-lease-runtime";

const TENANT = "00000000-0000-4000-8000-0000000000a1";
const JOB = "20000000-0000-4000-8000-0000000000a1";
const RUN = "30000000-0000-4000-8000-0000000000a1";
const LEASE = "40000000-0000-4000-8000-0000000000a1";
const SELECTOR = "score_worker_selector_AAAAAAAAAAAAAAAAAAAAA";

describe("restricted worker lease runtime providers", () => {
  it("does not connect while the issuer provider is being constructed", () => {
    const connect = vi.fn();

    const issuer = createWorkerLeaseIssuerRuntime({
      env: {
        DATABASE_URL: "postgresql://application_runtime:secret@database.example.test/nova",
        TENANT_WORKER_LEASE_ISSUER_DATABASE_URL:
          "postgresql://worker_lease_issuer:secret@database.example.test/nova",
        TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL:
          "postgresql://worker_lease_resolver:secret@database.example.test/nova",
      },
      connect,
    });
    expect(connect).not.toHaveBeenCalled();
    expect(Object.keys(issuer).sort()).toEqual(["acquire", "cancel"]);
  });

  it.each([
    ["missing", undefined],
    ["malformed", "not-a-postgres-url-with-secret-password"],
    ["wrong protocol", "https://worker_lease_issuer:secret@database.example.test/nova"],
  ])("fails closed for %s issuer database configuration", (_label, issuerUrl) => {
    const connect = vi.fn();
    const create = () => createWorkerLeaseIssuerRuntime({
      env: {
        ...dedicatedEnvironment("configuration-secret"),
        TENANT_WORKER_LEASE_ISSUER_DATABASE_URL: issuerUrl,
      },
      connect,
    });

    expect(create).toThrowError("Worker lease runtime is unavailable");
    expect(captureError(create)).not.toContain("configuration-secret");
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects issuer credentials that reuse the resolver or application role without exposing credentials", () => {
    const secret = "never-echo-this-password";
    const create = (issuerUrl: string, resolverUrl: string) => () => createWorkerLeaseIssuerRuntime({
      env: {
        DATABASE_URL: `postgresql://application_runtime:${secret}@database.example.test/nova`,
        TENANT_WORKER_LEASE_ISSUER_DATABASE_URL: issuerUrl,
        TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL: resolverUrl,
      },
      connect: vi.fn(),
    });

    const sameAsResolver = create(
      `postgresql://shared_worker_role:${secret}@database.example.test/nova`,
      `postgresql://shared_worker_role:different@resolver.example.test/nova`,
    );
    const sameAsApplication = create(
      `postgresql://application_runtime:${secret}@issuer.example.test/nova`,
      `postgresql://worker_lease_resolver:${secret}@database.example.test/nova`,
    );

    expect(sameAsResolver).toThrowError("Worker lease runtime is unavailable");
    expect(sameAsApplication).toThrowError("Worker lease runtime is unavailable");
    expect(captureError(sameAsResolver)).not.toContain(secret);
    expect(captureError(sameAsApplication)).not.toContain(secret);
  });

  it("rejects an issuer role with resolver authority before invoking a lease capability", async () => {
    const secret = "issuer-database-secret";
    const query = vi.fn().mockResolvedValue(roleInspection({ canResolve: true }));
    const db = fakeDb(query);
    const issuer = createWorkerLeaseIssuerRuntime({
      env: dedicatedEnvironment(secret),
      connect: vi.fn().mockResolvedValue(db),
    });

    const result = issuer.acquire(acquireInput());

    await expect(result).rejects.toThrowError("Worker lease runtime is unavailable");
    await expect(captureAsyncError(result)).resolves.not.toContain(secret);
    expect(query).toHaveBeenCalledOnce();
  });

  it.each([
    ["role membership", { hasRoleMemberships: true }],
    ["current database ownership", { ownsCurrentDatabase: true }],
    ["implicit pg_database_owner membership", { isCurrentDatabaseOwnerMember: true }],
    ["current database CREATE", { canCreateDatabaseObjects: true }],
    ["public schema CREATE", { canCreateSchemaObjects: true }],
    ["lease column SELECT", { canSelectAnyLeaseColumn: true }],
    ["lease column INSERT", { canInsertAnyLeaseColumn: true }],
    ["lease column UPDATE", { canUpdateAnyLeaseColumn: true }],
    ["lease column REFERENCES", { canReferenceAnyLeaseColumn: true }],
    ["lease table TRUNCATE", { canTruncateLeaseTable: true }],
    ["lease table REFERENCES", { canReferenceLeaseTable: true }],
    ["lease table TRIGGER", { canTriggerLeaseTable: true }],
  ])("rejects an issuer role with %s authority", async (_label, overrides) => {
    const query = vi.fn().mockResolvedValue(roleInspection(overrides));
    const issuer = createWorkerLeaseIssuerRuntime({
      env: dedicatedEnvironment("hostile-role-secret"),
      connect: vi.fn().mockResolvedValue(fakeDb(query)),
    });

    const result = issuer.acquire(acquireInput());

    await expect(result).rejects.toThrowError("Worker lease runtime is unavailable");
    await expect(captureAsyncError(result)).resolves.not.toContain("hostile-role-secret");
    expect(query).toHaveBeenCalledOnce();
  });

  it.each([
    ["an extra field", { ...roleInspection(), unexpectedAuthority: false }],
    ["a missing field", omitRoleInspectionField("canReferenceAnyLeaseColumn")],
  ])("rejects an inspection row with %s before invoking a lease capability", async (_label, inspection) => {
    const query = vi.fn().mockResolvedValue(inspection);
    const issuer = createWorkerLeaseIssuerRuntime({
      env: dedicatedEnvironment("malformed-row-secret"),
      connect: vi.fn().mockResolvedValue(fakeDb(query)),
    });

    await expect(issuer.acquire(acquireInput())).rejects.toThrowError("Worker lease runtime is unavailable");
    expect(query).toHaveBeenCalledOnce();
  });

  it("closes the default PostgreSQL pool when restricted-role verification fails", async () => {
    postgresMocks.connect.mockReset();
    postgresMocks.unsafe.mockReset();
    postgresMocks.end.mockReset();
    postgresMocks.connect.mockReturnValue({
      unsafe: postgresMocks.unsafe,
      end: postgresMocks.end,
    });
    postgresMocks.unsafe.mockResolvedValue([roleInspection({ canResolve: true })]);
    postgresMocks.end.mockResolvedValue(undefined);
    const issuer = createWorkerLeaseIssuerRuntime({
      env: dedicatedEnvironment("failed-pool-secret"),
    });

    await expect(issuer.acquire(acquireInput())).rejects.toThrowError("Worker lease runtime is unavailable");
    expect(postgresMocks.connect).toHaveBeenCalledOnce();
    expect(postgresMocks.end).toHaveBeenCalledWith({ timeout: 1 });
  });

  it("rejects a connection whose current database role differs from its credential identity", async () => {
    const inspect = vi.fn().mockResolvedValue(roleInspection({ currentUser: "unexpected_database_role" }));
    const issuer = createWorkerLeaseIssuerRuntime({
      env: dedicatedEnvironment("identity-secret"),
      connect: vi.fn().mockResolvedValue(fakeDb(inspect)),
    });

    const result = issuer.acquire(acquireInput());
    await expect(result).rejects.toThrowError("Worker lease runtime is unavailable");
    await expect(captureAsyncError(result)).resolves.not.toContain("unexpected_database_role");
  });

  it("exposes issuer acquire and cancel through one verified restricted connection", async () => {
    const connect = vi.fn();
    const db = {
      prepare: vi.fn((query: string) => {
        if (query.includes("FROM public.novatrade_acquire_tenant_worker_lease")) {
          return { get: vi.fn(async (...params: unknown[]) => leaseMutationRow("created", params)), all: vi.fn(), run: vi.fn() };
        }
        if (query.includes("FROM public.novatrade_cancel_tenant_worker_lease")) {
          return { get: vi.fn(async (...params: unknown[]) => ({
            ...leaseMutationRow("cancelled", params),
            revokedAt: "2026-08-30T15:01:00.000Z",
            revocationReason: "cancelled",
          })), all: vi.fn(), run: vi.fn() };
        }
        return { get: vi.fn(async () => roleInspection()), all: vi.fn(), run: vi.fn() };
      }),
      exec: vi.fn(),
    } as unknown as DbClient;
    connect.mockResolvedValue(db);
    const issuer = createWorkerLeaseIssuerRuntime({ env: dedicatedEnvironment("issuer-secret"), connect });

    const acquired = await issuer.acquire(acquireInput());
    expect(acquired).toEqual(expect.objectContaining({
      kind: "created",
      record: expect.objectContaining({ tenantId: TENANT, workerName: "score_recompute" }),
    }));
    await expect(issuer.cancel(acquired?.record as never)).resolves.toEqual(expect.objectContaining({
      kind: "cancelled",
      leaseGeneration: 1,
    }));
    expect(db.prepare).toHaveBeenCalledWith(expect.stringMatching(
      /database\.datdba=role\.oid[\s\S]*pg_has_role\(CURRENT_USER,'pg_database_owner','MEMBER'\)[\s\S]*has_database_privilege\(CURRENT_USER,CURRENT_DATABASE\(\),'CREATE'\)[\s\S]*FROM pg_catalog\.pg_auth_members[\s\S]*has_schema_privilege\(CURRENT_USER,'public','CREATE'\)[\s\S]*has_any_column_privilege\(CURRENT_USER,'public\.tenant_worker_dispatch_leases','SELECT'\)[\s\S]*has_any_column_privilege\(CURRENT_USER,'public\.tenant_worker_dispatch_leases','INSERT'\)[\s\S]*has_any_column_privilege\(CURRENT_USER,'public\.tenant_worker_dispatch_leases','UPDATE'\)[\s\S]*has_any_column_privilege\(CURRENT_USER,'public\.tenant_worker_dispatch_leases','REFERENCES'\)[\s\S]*'TRUNCATE'[\s\S]*'TRIGGER'[\s\S]*JOIN pg_catalog\.pg_database AS database ON database\.datname=CURRENT_DATABASE\(\)/u,
    ));
    expect(connect).toHaveBeenCalledOnce();
  });

  it("exposes a selector-only resolver permanently bound to one exact worker action", async () => {
    const inspect = vi.fn().mockResolvedValue(roleInspection({
      currentUser: "worker_lease_resolver",
      canAcquire: false,
      canCancel: false,
      canResolve: true,
    }));
    const resolve = vi.fn().mockResolvedValue([leaseRow()]);
    const db = fakeDb(inspect, resolve);
    const binding = {
      workerName: "score_recompute" as "score_recompute" | "crawl",
      action: "score_recompute:recompute" as "score_recompute:recompute" | "crawl:process",
    };
    const resolver = createWorkerLeaseResolverRuntime(
      binding,
      { env: dedicatedEnvironment("resolver-secret"), connect: vi.fn().mockResolvedValue(db) },
    );

    binding.workerName = "crawl";
    binding.action = "crawl:process";

    await expect(resolver(SELECTOR)).resolves.toEqual(expect.objectContaining({
      selector: SELECTOR,
      tenantId: TENANT,
      leaseId: LEASE,
      workerName: "score_recompute",
      action: "score_recompute:recompute",
    }));
    expect(resolve).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/u),
      "score_recompute",
      "score_recompute:recompute",
    );
    expect(Object.keys(resolver)).toEqual([]);
  });

  it("constructs without environment configuration and never falls back to DATABASE_URL", async () => {
    const connect = vi.fn();
    const resolver = createFailClosedWorkerLeaseResolverRuntime(
      { workerName: "crawl", action: "crawl:process" },
      {
        env: { DATABASE_URL: "postgresql://application_runtime:secret@database.example.test/nova" },
        connect,
      },
    );

    expect(connect).not.toHaveBeenCalled();
    await expect(resolver(SELECTOR)).resolves.toBeNull();
    expect(connect).not.toHaveBeenCalled();
  });

  it("fails closed for malformed bindings and configuration", async () => {
    const connect = vi.fn();
    const malformedBinding = createFailClosedWorkerLeaseResolverRuntime(
      { workerName: "crawl", action: "score_recompute:recompute" } as never,
      { env: dedicatedEnvironment("malformed-binding-secret"), connect },
    );
    const malformedEnvironment = createFailClosedWorkerLeaseResolverRuntime(
      { workerName: "crawl", action: "crawl:process" },
      {
        env: {
          ...dedicatedEnvironment("malformed-environment-secret"),
          TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL: "not-postgres",
        },
        connect,
      },
    );

    await expect(malformedBinding(SELECTOR)).resolves.toBeNull();
    await expect(malformedEnvironment(SELECTOR)).resolves.toBeNull();
    expect(connect).not.toHaveBeenCalled();
  });

  it("retries runtime initialization, caches only success, and retains its exact binding", async () => {
    const inspect = vi.fn().mockResolvedValue(roleInspection({
      currentUser: "worker_lease_resolver",
      canAcquire: false,
      canCancel: false,
      canResolve: true,
    }));
    const resolve = vi.fn().mockResolvedValue([leaseRow()]);
    const db = fakeDb(inspect, resolve);
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("resolver temporarily unavailable"))
      .mockResolvedValue(db);
    const binding = {
      workerName: "score_recompute" as "score_recompute" | "crawl",
      action: "score_recompute:recompute" as "score_recompute:recompute" | "crawl:process",
    };
    const resolver = createFailClosedWorkerLeaseResolverRuntime(
      binding,
      { env: dedicatedEnvironment("lazy-resolver-secret"), connect },
    );
    binding.workerName = "crawl";
    binding.action = "crawl:process";

    await expect(resolver(SELECTOR)).resolves.toBeNull();
    await expect(resolver(SELECTOR)).resolves.toMatchObject({
      workerName: "score_recompute",
      action: "score_recompute:recompute",
    });
    await expect(resolver(SELECTOR)).resolves.toMatchObject({
      workerName: "score_recompute",
      action: "score_recompute:recompute",
    });

    expect(connect).toHaveBeenCalledTimes(2);
    expect(inspect).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/^[0-9a-f]{64}$/u),
      "score_recompute",
      "score_recompute:recompute",
    );
  });
});

function dedicatedEnvironment(secret: string) {
  return {
    DATABASE_URL: `postgresql://application_runtime:${secret}@database.example.test/nova`,
    TENANT_WORKER_LEASE_ISSUER_DATABASE_URL:
      `postgresql://worker_lease_issuer:${secret}@database.example.test/nova`,
    TENANT_WORKER_LEASE_RESOLVER_DATABASE_URL:
      `postgresql://worker_lease_resolver:${secret}@database.example.test/nova`,
  };
}

function acquireInput() {
  return {
    tenantId: TENANT,
    workspaceId: null,
    jobId: JOB,
    runId: RUN,
    leaseGeneration: 1,
    workerName: "score_recompute" as const,
    action: "score_recompute:recompute" as const,
    notBefore: "2026-08-30T15:00:00.000Z",
    expiresAt: "2026-08-30T15:10:00.000Z",
    correlationId: "score-dispatch-1",
  };
}

function roleInspection(overrides: Record<string, unknown> = {}) {
  return {
    currentUser: "worker_lease_issuer",
    canLogin: true,
    isSuperuser: false,
    inheritsPrivileges: false,
    canCreateDatabase: false,
    canCreateRole: false,
    canReplicate: false,
    bypassesRls: false,
    hasRoleMemberships: false,
    ownsCurrentDatabase: false,
    isCurrentDatabaseOwnerMember: false,
    canCreateDatabaseObjects: false,
    hasSchemaUsage: true,
    canCreateSchemaObjects: false,
    canAcquire: true,
    canCancel: true,
    canResolve: false,
    canValidate: false,
    canSelectAnyLeaseColumn: false,
    canInsertAnyLeaseColumn: false,
    canUpdateAnyLeaseColumn: false,
    canReferenceAnyLeaseColumn: false,
    canSelectLeaseTable: false,
    canInsertLeaseTable: false,
    canUpdateLeaseTable: false,
    canDeleteLeaseTable: false,
    canTruncateLeaseTable: false,
    canReferenceLeaseTable: false,
    canTriggerLeaseTable: false,
    ...overrides,
  };
}

function omitRoleInspectionField(field: string) {
  return Object.fromEntries(Object.entries(roleInspection()).filter(([key]) => key !== field));
}

function leaseRow() {
  return {
    tenantId: TENANT,
    workspaceId: null,
    jobId: JOB,
    runId: RUN,
    leaseId: LEASE,
    leaseGeneration: "1",
    workerName: "score_recompute",
    action: "score_recompute:recompute",
    status: "active",
    notBefore: "2026-08-30T15:00:00.000Z",
    expiresAt: "2026-08-30T15:10:00.000Z",
    correlationId: "score-dispatch-1",
    recordVersion: 1,
    integrityVersion: "internal-worker-lease-v1",
  };
}

function leaseMutationRow(kind: "created" | "cancelled", params: unknown[]) {
  return {
    kind,
    tenantId: params[1],
    workspaceId: params[2],
    jobId: params[3],
    runId: params[4],
    leaseId: params[5],
    selectorHash: params[0],
    leaseGeneration: params[6],
    workerName: params[7],
    action: params[8],
    notBefore: params[9],
    expiresAt: params[10],
    correlationId: params[11],
    recordVersion: 1,
    integrityVersion: "internal-worker-lease-v1",
  };
}

function fakeDb(get: ReturnType<typeof vi.fn>, all = vi.fn()): DbClient {
  return {
    prepare: vi.fn((query: string) => query.includes("FROM public.novatrade_resolve_tenant_worker_lease")
      ? { get: vi.fn(), all, run: vi.fn() }
      : { get, all: vi.fn(), run: vi.fn() }),
    exec: vi.fn(),
  } as unknown as DbClient;
}

function captureError(callback: () => unknown): string {
  try {
    callback();
    return "";
  } catch (error) {
    return error instanceof Error ? `${error.name}:${error.message}:${error.stack ?? ""}` : String(error);
  }
}

async function captureAsyncError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "";
  } catch (error) {
    return error instanceof Error ? `${error.name}:${error.message}:${error.stack ?? ""}` : String(error);
  }
}
