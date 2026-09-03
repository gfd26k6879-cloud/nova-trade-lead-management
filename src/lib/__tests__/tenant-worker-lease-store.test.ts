import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { DbClient } from "@/lib/db";
import type { TenantWorkerLeaseRecord } from "@/lib/internal-worker-auth";
import {
  createTenantWorkerLeaseIssuer,
  createTenantWorkerLeaseResolver,
} from "@/lib/tenancy/worker-lease-store";

const TENANT = "00000000-0000-4000-8000-0000000000a1";
const WORKSPACE = "10000000-0000-4000-8000-0000000000a1";
const JOB = "20000000-0000-4000-8000-0000000000a1";
const RUN = "30000000-0000-4000-8000-0000000000a1";
const LEASE = "40000000-0000-4000-8000-0000000000a1";
const SELECTOR = "worker_selector_AAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const NOT_BEFORE = "2026-08-30T15:00:00.000Z";
const EXPIRES_AT = "2026-08-30T15:10:00.000Z";

const get = vi.fn();
const all = vi.fn();
const prepare = vi.fn((query: string) => {
  void query;
  return { get, all, run: vi.fn() };
});
const db = { prepare, exec: vi.fn() } as unknown as DbClient;

function leaseRow(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    jobId: JOB,
    runId: RUN,
    leaseId: LEASE,
    leaseGeneration: "1",
    workerName: "crawl",
    action: "crawl:process",
    notBefore: NOT_BEFORE,
    expiresAt: EXPIRES_AT,
    correlationId: "worker-test-a",
    recordVersion: 1,
    integrityVersion: "internal-worker-lease-v1",
    ...overrides,
  };
}

function issuedRow(overrides: Record<string, unknown> = {}) {
  return {
    selectorHash: createHash("sha256").update(SELECTOR).digest("hex"),
    ...leaseRow(overrides),
  };
}

function issuer() {
  return createTenantWorkerLeaseIssuer({
    db: async () => db,
    createSelector: () => SELECTOR,
    createLeaseId: () => LEASE,
  });
}

function resolver() {
  return createTenantWorkerLeaseResolver({ db: async () => db });
}

function acquireInput() {
  return {
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    jobId: JOB,
    runId: RUN,
    leaseGeneration: 1,
    workerName: "crawl" as const,
    action: "crawl:process" as const,
    notBefore: NOT_BEFORE,
    expiresAt: EXPIRES_AT,
    correlationId: "worker-test-a",
  };
}

function leaseRecord(): TenantWorkerLeaseRecord {
  return {
    selector: SELECTOR,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    jobId: JOB,
    runId: RUN,
    leaseId: LEASE,
    leaseGeneration: 1,
    workerName: "crawl",
    action: "crawl:process",
    status: "active",
    notBefore: NOT_BEFORE,
    expiresAt: EXPIRES_AT,
    correlationId: "worker-test-a",
    recordVersion: 1,
    integrityVersion: "internal-worker-lease-v1",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant worker lease store", () => {
  it("acquires through the digest-only pre-GUC function and returns the raw selector only to the issuer", async () => {
    get.mockResolvedValue({ kind: "created", ...issuedRow() });

    const result = await issuer().acquire(acquireInput());

    expect(result).toEqual({ kind: "created", record: expect.objectContaining({
      selector: SELECTOR,
      tenantId: TENANT,
      jobId: JOB,
      leaseGeneration: 1,
      status: "active",
    }) });
    const params = get.mock.calls[0] ?? [];
    expect(params[0]).toBe(createHash("sha256").update(SELECTOR).digest("hex"));
    expect(params).not.toContain(SELECTOR);
    expect(prepare.mock.calls[0]?.[0]).toContain("novatrade_acquire_tenant_worker_lease");
  });

  it("replays only when the dispatcher persists and resubmits the exact returned capability", async () => {
    get.mockResolvedValueOnce({ kind: "created", ...issuedRow() });
    get.mockResolvedValueOnce({ kind: "replay", ...issuedRow() });
    const leaseIssuer = issuer();

    const created = await leaseIssuer.acquire(acquireInput());
    expect(created?.kind).toBe("created");
    const replayed = await leaseIssuer.acquire({
      ...acquireInput(),
      retryCapability: {
        selector: created?.record.selector ?? "",
        leaseId: created?.record.leaseId ?? "",
      },
    });

    expect(replayed).toEqual({ kind: "replay", record: created?.record });
    expect(get.mock.calls[1]).toEqual(get.mock.calls[0]);
  });

  it("resolves one exact live record by digest without installing tenant GUCs", async () => {
    all.mockResolvedValue([{ status: "active", ...leaseRow() }]);

    await expect(resolver().resolve(SELECTOR, {
      workerName: "crawl",
      action: "crawl:process",
    })).resolves.toEqual(expect.objectContaining({
      selector: SELECTOR,
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      leaseId: LEASE,
    }));

    expect(all).toHaveBeenCalledWith(
      createHash("sha256").update(SELECTOR).digest("hex"),
      "crawl",
      "crawl:process",
    );
    expect(prepare.mock.calls[0]?.[0]).toContain("novatrade_resolve_tenant_worker_lease");
  });

  it.each([
    ["malformed selector", "short", { workerName: "crawl", action: "crawl:process" }],
    ["wrong action", SELECTOR, { workerName: "crawl", action: "artifact:process" }],
    ["unknown worker", SELECTOR, { workerName: "unknown", action: "crawl:process" }],
  ])("fails %s closed before database access", async (_label, selector, expected) => {
    await expect(resolver().resolve(selector, expected as never)).resolves.toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("rejects ambiguous or misleading resolver output", async () => {
    all.mockResolvedValueOnce([
      { status: "active", ...leaseRow() },
      { status: "active", ...leaseRow({ leaseId: "40000000-0000-4000-8000-0000000000a2" }) },
    ]);
    await expect(resolver().resolve(SELECTOR, { workerName: "crawl", action: "crawl:process" }))
      .resolves.toBeNull();

    all.mockResolvedValueOnce([{ status: "active", ...leaseRow(), selectorHash: "a".repeat(64) }]);
    await expect(resolver().resolve(SELECTOR, { workerName: "crawl", action: "crawl:process" }))
      .resolves.toBeNull();
  });

  it("rejects malformed acquisition input before selector generation or SQL", async () => {
    await expect(issuer().acquire({
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      jobId: JOB,
      runId: RUN,
      leaseGeneration: 0,
      workerName: "crawl",
      action: "crawl:process",
      notBefore: EXPIRES_AT,
      expiresAt: NOT_BEFORE,
      correlationId: "worker-test-a",
    })).resolves.toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("fails accessor and proxy input closed without database access", async () => {
    const hostile = new Proxy(acquireInput(), {
      get() {
        throw new Error("input trap");
      },
    });
    await expect(issuer().acquire(hostile)).resolves.toBeNull();
    await expect(resolver().resolve(SELECTOR, new Proxy({
      workerName: "crawl" as const,
      action: "crawl:process" as const,
    }, {
      get() {
        throw new Error("expected trap");
      },
    }))).resolves.toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("requires separate explicit database capabilities for issuer and resolver adapters", () => {
    expect(() => createTenantWorkerLeaseIssuer(undefined as never)).toThrow(/issuer database provider/u);
    expect(() => createTenantWorkerLeaseResolver(undefined as never)).toThrow(/resolver database provider/u);
    expect(Object.keys(issuer())).toEqual(["acquire", "cancel"]);
    expect(Object.keys(resolver())).toEqual(["resolve"]);
  });

  it.each([
    ["tenantId", "00000000-0000-4000-8000-0000000000b1"],
    ["workspaceId", "10000000-0000-4000-8000-0000000000b1"],
    ["jobId", "20000000-0000-4000-8000-0000000000b1"],
    ["runId", "30000000-0000-4000-8000-0000000000b1"],
    ["leaseId", "40000000-0000-4000-8000-0000000000b1"],
    ["leaseGeneration", "2"],
    ["notBefore", "2026-08-30T15:00:01.000Z"],
    ["expiresAt", "2026-08-30T15:10:01.000Z"],
    ["correlationId", "hostile-correlation"],
    ["selectorHash", "b".repeat(64)],
  ])("rejects an acquisition row that lies about requested %s", async (field, value) => {
    get.mockResolvedValue({ kind: "created", ...issuedRow({ [field]: value }) });
    await expect(issuer().acquire(acquireInput())).resolves.toBeNull();
  });

  it("cancels and idempotently replays only an exact issued capability", async () => {
    const record = leaseRecord();
    const cancelledRow = {
      kind: "cancelled",
      ...issuedRow({ leaseGeneration: 1 }),
      revokedAt: "2026-08-30T15:05:00.000Z",
      revocationReason: "cancelled",
    };
    get.mockResolvedValueOnce(cancelledRow).mockResolvedValueOnce({ ...cancelledRow, kind: "replay" });
    const leaseIssuer = issuer();

    await expect(leaseIssuer.cancel(record)).resolves.toEqual({
      kind: "cancelled",
      leaseId: LEASE,
      leaseGeneration: 1,
      revokedAt: "2026-08-30T15:05:00.000Z",
    });
    await expect(leaseIssuer.cancel(record)).resolves.toEqual(expect.objectContaining({ kind: "replay" }));
    expect(get.mock.calls[0]?.[0]).toBe(createHash("sha256").update(SELECTOR).digest("hex"));
    expect(get.mock.calls[0]).not.toContain(SELECTOR);
    expect(prepare.mock.calls[0]?.[0]).toContain("novatrade_cancel_tenant_worker_lease");
  });

  it("rejects a misleading cancellation response", async () => {
    const record = leaseRecord();
    get.mockResolvedValue({
      kind: "cancelled",
      ...issuedRow({ leaseGeneration: 2 }),
      revokedAt: "2026-08-30T15:05:00.000Z",
      revocationReason: "cancelled",
    });
    await expect(issuer().cancel(record)).resolves.toBeNull();
  });
});
