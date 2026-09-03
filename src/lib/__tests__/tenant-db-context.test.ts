import { describe, expect, it } from "vitest";
import {
  getDb,
  getTenantDbContext,
  TenantDbContextError,
  withTenantDbContext,
  type DbClient,
} from "@/lib/db";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { runWithWorkerTenantContext } from "@/lib/tenancy/worker-context";
import type { TenantSession } from "@/lib/auth";
import type { TenantWorkerAuthorization } from "@/lib/internal-worker-auth";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const ROLE_BINDING_A = "30000000-0000-4000-8000-000000000001";
const ACTOR_A = "50000000-0000-4000-8000-000000000001";
const JOB_A = "60000000-0000-4000-8000-000000000001";
const RUN_A = "70000000-0000-4000-8000-000000000001";
const LEASE_A = "80000000-0000-4000-8000-000000000001";

function session(overrides: Partial<TenantSession> = {}): TenantSession {
  return {
    userId: ACTOR_A,
    email: "synthetic-a@example.test",
    displayName: "Synthetic A",
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    membershipId: MEMBERSHIP_A,
    role: "owner",
    roleBindingId: ROLE_BINDING_A,
    ...overrides,
  };
}

function workerAuthorization(tenantId: string, workspaceId: string | null): TenantWorkerAuthorization {
  return {
    source: "cron",
    context: {
      tenantId,
      workspaceId,
      jobId: JOB_A,
      runId: RUN_A,
      leaseId: LEASE_A,
      leaseGeneration: 3,
      workerName: "crawl",
      action: "crawl:process",
      sourcePrincipalKind: "cron",
      correlationId: "t030-worker-correlation",
    },
  };
}

async function readScope(db: DbClient): Promise<{ tenantId: string; workspaceId: string | null }> {
  const scope = getTenantDbContext();
  const row = await db.prepare("SELECT 1 AS ok").get<{ ok: number }>();
  expect(row?.ok).toBe(1);
  return { tenantId: scope?.tenantId ?? "", workspaceId: scope?.workspaceId ?? null };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("tenant database transaction context", () => {
  it("requires accepted member or worker callback context and cleans up after success/error", async () => {
    await expect(withTenantDbContext(async () => undefined)).rejects.toMatchObject({
      code: "TENANT_DB_CONTEXT_REQUIRED",
      message: "A tenant database context is required",
    });

    const observed = await runWithTenantContext(session(), "t030-member-success", () =>
      withTenantDbContext(async (db) => readScope(db)),
    );
    expect(observed).toEqual({ tenantId: TENANT_A, workspaceId: WORKSPACE_A });
    expect(getTenantDbContext()).toBeNull();

    await expect(runWithTenantContext(session(), "t030-member-error", () =>
      withTenantDbContext(async () => {
        expect(getTenantDbContext()).toMatchObject({ source: "member", tenantId: TENANT_A });
        throw new Error("synthetic callback failure");
      }),
    )).rejects.toThrow("synthetic callback failure");
    expect(getTenantDbContext()).toBeNull();
  });

  it("uses only transaction-scoped clients and rejects support spoofing and nested broadening", async () => {
    let callbackCalled = false;
    await expect(runWithTenantContext(session(), "t030-extra-argument", () =>
      (withTenantDbContext as unknown as (
        callback: (db: DbClient) => Promise<void>,
        supportContext: unknown,
      ) => Promise<void>)(
        async () => {
          callbackCalled = true;
        },
        { supportGrantId: "forged-support-grant" },
      ),
    )).rejects.toMatchObject({ code: "TENANT_DB_CONTEXT_INVALID" });
    expect(callbackCalled).toBe(false);

    await runWithTenantContext(session(), "t030-nested-member", async () => {
      await withTenantDbContext(async (outerDb) => {
        await expect(runWithWorkerTenantContext(
          workerAuthorization(TENANT_B, WORKSPACE_B),
          () => withTenantDbContext(async () => undefined),
        )).rejects.toMatchObject({ code: "TENANT_DB_CONTEXT_CONFLICT" });
        expect(getTenantDbContext()).toMatchObject({ source: "member", tenantId: TENANT_A });
        await expect(withTenantDbContext(async (nestedDb) => {
          expect(nestedDb).toBe(outerDb);
          return readScope(nestedDb);
        })).resolves.toEqual({ tenantId: TENANT_A, workspaceId: WORKSPACE_A });
      });
    });
    expect(getTenantDbContext()).toBeNull();
  });

  it("installs an accepted worker lease scope without manufacturing membership or support authority", async () => {
    const observed = await runWithWorkerTenantContext(workerAuthorization(TENANT_A, WORKSPACE_A), () =>
      withTenantDbContext(async (db) => {
        const scope = getTenantDbContext();
        expect(scope).toMatchObject({
          source: "worker",
          tenantId: TENANT_A,
          workspaceId: WORKSPACE_A,
          jobId: JOB_A,
          runId: RUN_A,
          leaseId: LEASE_A,
          membershipId: null,
          roleBindingId: null,
          supportGrantId: null,
        });
        return readScope(db);
      }),
    );
    expect(observed).toEqual({ tenantId: TENANT_A, workspaceId: WORKSPACE_A });
    expect(getTenantDbContext()).toBeNull();
  });

  it("rejects malformed accepted callback state before the scoped callback runs", async () => {
    let called = false;
    await expect(runWithWorkerTenantContext(
      workerAuthorization("not-a-uuid", WORKSPACE_A),
      () => withTenantDbContext(async () => {
        called = true;
      }),
    )).rejects.toThrow(TenantDbContextError);
    expect(called).toBe(false);
    expect(getTenantDbContext()).toBeNull();
  });

  it("keeps two accepted tenant scopes separate across concurrent callback lifetimes", async () => {
    const results = await Promise.all([
      runWithTenantContext(session(), "t030-concurrent-a", () =>
        withTenantDbContext(async (db) => {
          await Promise.resolve();
          return readScope(db);
        }),
      ),
      runWithTenantContext(session({
        userId: "50000000-0000-4000-8000-000000000002",
        email: "synthetic-b@example.test",
        displayName: "Synthetic B",
        tenantId: TENANT_B,
        workspaceId: WORKSPACE_B,
        membershipId: "20000000-0000-4000-8000-000000000002",
        role: "researcher",
        roleBindingId: "30000000-0000-4000-8000-000000000002",
      }), "t030-concurrent-b", () =>
        withTenantDbContext(async (db) => {
          await Promise.resolve();
          return readScope(db);
        }),
      ),
    ]);

    expect(results).toEqual([
      { tenantId: TENANT_A, workspaceId: WORKSPACE_A },
      { tenantId: TENANT_B, workspaceId: WORKSPACE_B },
    ]);
    expect(getTenantDbContext()).toBeNull();
  });

  it("checks transaction-local GUCs when the focused run targets Postgres", async () => {
    if (!process.env.DATABASE_URL) return;

    await runWithTenantContext(session(), "t030-guc-a", () => withTenantDbContext(async (db) => {
      const row = await db.prepare(`
        SELECT
          current_setting('app.tenant_id', true) AS tenant_id,
          current_setting('app.workspace_id', true) AS workspace_id,
          current_setting('app.actor_id', true) AS actor_id,
          current_setting('app.membership_id', true) AS membership_id,
          current_setting('app.role_binding_id', true) AS role_binding_id,
          current_setting('app.support_grant_id', true) AS support_grant_id
      `).get<Record<string, string | null>>();
      expect(row).toMatchObject({
        tenant_id: TENANT_A,
        workspace_id: WORKSPACE_A,
        actor_id: ACTOR_A,
        membership_id: MEMBERSHIP_A,
        role_binding_id: ROLE_BINDING_A,
        support_grant_id: "",
      });
    }));
  });

  it("proves Postgres transaction-local isolation, rollback cleanup, and pooled reuse cleanup", async () => {
    if (!process.env.DATABASE_URL) return;

    const aStarted = deferred();
    const bStarted = deferred();
    const release = deferred();
    const readGucs = async (db: DbClient) => db.prepare(`
      SELECT
        current_setting('app.tenant_id', true) AS tenant_id,
        current_setting('app.workspace_id', true) AS workspace_id,
        current_setting('app.actor_id', true) AS actor_id,
        current_setting('app.membership_id', true) AS membership_id,
        current_setting('app.role_binding_id', true) AS role_binding_id,
        current_setting('app.support_grant_id', true) AS support_grant_id
    `).get<Record<string, string | null>>();

    const concurrent = Promise.all([
      runWithTenantContext(session(), "t030-pg-concurrent-a", () => withTenantDbContext(async (db) => {
        const row = await readGucs(db);
        aStarted.resolve();
        await release.promise;
        return row;
      })),
      runWithTenantContext(session({
        userId: "50000000-0000-4000-8000-000000000002",
        email: "synthetic-b@example.test",
        displayName: "Synthetic B",
        tenantId: TENANT_B,
        workspaceId: WORKSPACE_B,
        membershipId: "20000000-0000-4000-8000-000000000002",
        role: "researcher",
        roleBindingId: "30000000-0000-4000-8000-000000000002",
      }), "t030-pg-concurrent-b", () => withTenantDbContext(async (db) => {
        await aStarted.promise;
        const row = await readGucs(db);
        bStarted.resolve();
        await release.promise;
        return row;
      })),
    ]);

    await aStarted.promise;
    await bStarted.promise;
    release.resolve();
    const [scopeA, scopeB] = await concurrent;
    expect(scopeA).toMatchObject({ tenant_id: TENANT_A, workspace_id: WORKSPACE_A, actor_id: ACTOR_A });
    expect(scopeB).toMatchObject({ tenant_id: TENANT_B, workspace_id: WORKSPACE_B });

    await expect(runWithTenantContext(session(), "t030-pg-rollback", () =>
      withTenantDbContext(async (db) => {
        expect((await readGucs(db))?.tenant_id).toBe(TENANT_A);
        throw new Error("synthetic rollback");
      }),
    )).rejects.toThrow("synthetic rollback");

    const reused = await (await getDb()).prepare(`
      SELECT
        NULLIF(current_setting('app.tenant_id', true), '') AS tenant_id,
        NULLIF(current_setting('app.workspace_id', true), '') AS workspace_id,
        NULLIF(current_setting('app.actor_id', true), '') AS actor_id,
        NULLIF(current_setting('app.membership_id', true), '') AS membership_id,
        NULLIF(current_setting('app.role_binding_id', true), '') AS role_binding_id,
        NULLIF(current_setting('app.support_grant_id', true), '') AS support_grant_id
    `).get<Record<string, string | null>>();
    expect(reused).toEqual({
      tenant_id: null,
      workspace_id: null,
      actor_id: null,
      membership_id: null,
      role_binding_id: null,
      support_grant_id: null,
    });
  });
});
