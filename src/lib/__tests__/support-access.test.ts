import { describe, expect, it } from "vitest";
import { getDb, getTenantDbContext, withTenantDbContext } from "@/lib/db";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { runWithWorkerTenantContext } from "@/lib/tenancy/worker-context";
import type { TenantWorkerAuthorization } from "@/lib/internal-worker-auth";
import {
  createSupportAccessService,
  getSupportAccessContext,
  type SupportAccessGrantCreation,
  type SupportAccessRepository,
  type SupportAccessTransaction,
} from "@/lib/tenancy/support-access";
import type { SupportAccessGrant } from "@/lib/tenancy/types";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const MEMBER_A = "20000000-0000-4000-8000-000000000001";
const MEMBER_B = "20000000-0000-4000-8000-000000000002";
const SUPPORT_A = "30000000-0000-4000-8000-000000000001";
const GRANT_A = "40000000-0000-4000-8000-000000000001";
const GRANT_B = "40000000-0000-4000-8000-000000000002";
const AUDIT_A = "50000000-0000-4000-8000-000000000001";
const IDS = [GRANT_A, AUDIT_A, "60000000-0000-4000-8000-000000000001", "70000000-0000-4000-8000-000000000001", "60000000-0000-4000-8000-000000000002", "70000000-0000-4000-8000-000000000002", "60000000-0000-4000-8000-000000000003", "70000000-0000-4000-8000-000000000003"];
const NOW = new Date("2026-07-27T12:00:00.000Z");
const START = "2026-07-27T11:00:00.000Z";
const EXPIRY = "2026-07-27T13:00:00.000Z";

function memberSession(tenantId: string, userId: string, workspaceId: string | null = null) {
  return { userId, email: `${userId}@example.test`, displayName: "Synthetic operator", tenantId, workspaceId, membershipId: `80000000-0000-4000-8000-${tenantId.slice(-12)}`, role: "owner" as const, roleBindingId: `90000000-0000-4000-8000-${tenantId.slice(-12)}` };
}

function grant(input: SupportAccessGrantCreation | SupportAccessGrant, state: "pending" | "approved" | "revoked" = "pending", approvedAt: string | null = null, revokedAt: string | null = null): SupportAccessGrant {
  return Object.freeze({ ...input, state, approvedByAuthIdentityId: approvedAt ? MEMBER_A : null, approvedAt, revokedByAuthIdentityId: revokedAt ? MEMBER_A : null, revokedAt });
}

class FakeRepository implements SupportAccessRepository {
  readonly grants = new Map<string, SupportAccessGrant>();
  readonly events: unknown[] = [];
  readonly idempotency = new Map<string, { hash: string; result?: unknown; replayHash?: string }>();
  readonly workspaces = new Set([`${TENANT_A}:${WORKSPACE_A}`, `${TENANT_A}:${WORKSPACE_B}`]);
  policyAllowed = true;
  authorityAllowed = true;
  failEvents = false;
  failCommit = false;
  malformedGrant = false;
  impossibleTimestamp = false;
  wrongGrantId = false;
  wrongPostcondition = false;
  malformedReservation = false;
  malformedReplayHash = false;
  transactionCommitted = false;

  async withTransaction<T>(callback: (transaction: SupportAccessTransaction) => Promise<T>): Promise<T> {
    const grantsSnapshot = new Map(this.grants);
    const eventsLength = this.events.length;
    const idempotencySnapshot = new Map([...this.idempotency.entries()].map(([key, value]) => [key, { ...value }]));
    this.transactionCommitted = false;
    try {
      const result = await callback(this.transaction());
      this.transactionCommitted = true;
      return result;
    } catch (error) {
      this.grants.clear();
      for (const [key, value] of grantsSnapshot) this.grants.set(key, value);
      this.events.splice(eventsLength);
      this.idempotency.clear();
      for (const [key, value] of idempotencySnapshot) this.idempotency.set(key, value);
      throw error;
    }
  }

  private transaction(): SupportAccessTransaction {
    return {
      reserveIdempotency: async (input) => {
        const key = `${input.tenantId}:${input.actorNamespace}:${input.operation}:${input.idempotencyKey}`;
        const prior = this.idempotency.get(key);
        if (!prior) {
          this.idempotency.set(key, { hash: input.inputHash });
          return this.malformedReservation ? { kind: "new", reservationId: key, hidden: true } : { kind: "new", reservationId: key };
        }
        if (prior.hash !== input.inputHash) return { kind: "conflict" };
        if (prior.result === undefined) return { kind: "replay", inputHash: prior.replayHash ?? prior.hash, result: prior.result };
        return { kind: "replay", inputHash: this.malformedReplayHash ? `${prior.hash.slice(0, 63)}0` : prior.replayHash ?? prior.hash, result: prior.result };
      },
      commitIdempotency: async (input) => {
        if (this.failCommit) throw new Error("idempotency unavailable");
        const entry = this.idempotency.get(input.reservationId);
        if (!entry || entry.result !== undefined) return { committed: false };
        entry.result = input.result;
        return { committed: true };
      },
      appendEvent: async (event) => {
        if (this.failEvents) throw new Error("audit unavailable");
        this.events.push(event);
        return { recorded: true };
      },
      createGrant: async (input) => {
        const value = grant(input);
        this.grants.set(value.id, value);
        if (this.malformedGrant) {
          const withHidden = { ...value } as Record<string, unknown>;
          Object.defineProperty(withHidden, "hidden", { value: true, enumerable: false });
          return withHidden;
        }
        if (this.impossibleTimestamp) return { ...value, startsAt: "2026-02-30T11:00:00.000Z" };
        return value;
      },
      approveGrant: async ({ grantId, approverAuthIdentityId, approvedAt }) => {
        const current = this.grants.get(grantId);
        if (!current || current.state !== "pending") return null;
        const updated = grant({ ...current, approvedByAuthIdentityId: approverAuthIdentityId, approvedAt, updatedAt: approvedAt }, "approved", approvedAt);
        this.grants.set(grantId, updated);
        return this.wrongPostcondition ? { ...updated, id: GRANT_B } : updated;
      },
      revokeGrant: async ({ grantId, revokerAuthIdentityId, revokedAt }) => {
        const current = this.grants.get(grantId);
        if (!current || current.state !== "approved") return null;
        const updated = grant({ ...current, approvedByAuthIdentityId: current.approvedByAuthIdentityId ?? MEMBER_A, approvedAt: current.approvedAt ?? START, revokedByAuthIdentityId: revokerAuthIdentityId, revokedAt, updatedAt: revokedAt }, "revoked", current.approvedAt ?? START, revokedAt);
        this.grants.set(grantId, updated);
        return this.wrongPostcondition ? { ...updated, tenantId: TENANT_B } : updated;
      },
      getGrant: async ({ tenantId, grantId }) => {
        const value = this.grants.get(grantId);
        if (!value || value.tenantId !== tenantId) return null;
        if (this.wrongGrantId) return { ...value, id: GRANT_B };
        return value;
      },
      listGrants: async ({ tenantId, workspaceId }) => [...this.grants.values()].filter((value) => value.tenantId === tenantId && (workspaceId === null || value.workspaceId === workspaceId)),
      verifyWorkspace: async ({ tenantId, workspaceId }) => ({ tenantId, workspaceId, exists: this.workspaces.has(`${tenantId}:${workspaceId}`) }),
      verifyMemberAuthority: async (input) => ({ ...input, allowed: this.authorityAllowed }),
    };
  }
}

function makeService(repository: FakeRepository, policyAllowed = true, currentPrincipal: unknown = { authIdentityId: SUPPORT_A, platformRole: "platform_support" }) {
  let idIndex = 0;
  repository.policyAllowed = policyAllowed;
  return createSupportAccessService({
    repository,
    principalResolver: { resolve: async (reference) => reference === "opaque-support-a" ? { authIdentityId: SUPPORT_A, platformRole: "platform_support" } : reference === "opaque-support-b" ? { authIdentityId: MEMBER_B, platformRole: "platform_support" } : null, resolveCurrent: async () => currentPrincipal },
    policyEvaluator: { evaluate: async (input) => ({ ...input, allowed: repository.policyAllowed }) },
    now: () => NOW,
    idFactory: () => IDS[idIndex++ % IDS.length],
  });
}

function requestInput(key = "request-001", workspaceId: string | null | undefined = undefined, correlationId?: string) {
  return { tenantId: TENANT_A, ...(workspaceId === undefined ? {} : { workspaceId }), supportPrincipalRef: "opaque-support-a", reasonCode: "incident.review", reason: "Synthetic support review", startsAt: START, expiresAt: EXPIRY, permissions: ["tenant:read"], dataClasses: ["tenant_metadata"], ...(correlationId === undefined ? {} : { correlationId }), idempotencyKey: key } as const;
}
function workerAuthorization(): TenantWorkerAuthorization {
  return { source: "cron", context: { tenantId: TENANT_A, workspaceId: WORKSPACE_A, jobId: "60000000-0000-4000-8000-000000000001", runId: "70000000-0000-4000-8000-000000000001", leaseId: "80000000-0000-4000-8000-000000000001", leaseGeneration: 3, workerName: "crawl", action: "crawl:process", sourcePrincipalKind: "cron", correlationId: "corr-worker-001" } };
}
function checkInput(key = "check-001", extra: Record<string, unknown> = {}) {
  return { tenantId: TENANT_A, workspaceId: WORKSPACE_A, supportPrincipalRef: "opaque-support-a", grantId: GRANT_A, permission: "tenant:read", dataClasses: ["tenant_metadata"], correlationId: "corr-check-001", idempotencyKey: key, ...extra } as const;
}
async function asMember<T>(callback: () => Promise<T>, tenantId = TENANT_A, userId = MEMBER_A, workspaceId: string | null = WORKSPACE_A, correlationId = "corr-member-001") {
  return runWithTenantContext(memberSession(tenantId, userId, workspaceId), correlationId, callback);
}

describe("support access service", () => {
  it("runs the request/approval/check/callback/revoke flow and keeps effective context callback-only", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    const requested = await asMember(() => service.request(requestInput()));
    expect(requested).toMatchObject({ ok: true, code: "OK_SUPPORT_GRANT_REQUESTED", grant: { id: GRANT_A, workspaceId: WORKSPACE_A, correlationId: "corr-member-001" } });
    const approved = await asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "approve-001" }));
    expect(approved).toMatchObject({ ok: true, code: "OK_SUPPORT_GRANT_APPROVED" });
    expect(await service.check(checkInput("check-001"))).toEqual({ ok: true, code: "OK_SUPPORT_AUTHORIZED" });
    let callbackContext: string | null = null;
    const authorized = await service.authorizeAndRun(checkInput("run-001"), async (context) => {
      callbackContext = context.supportGrantId;
      expect(getSupportAccessContext()).toMatchObject({ supportGrantId: GRANT_A, attemptId: context.attemptId, auditEventId: context.auditEventId });
      expect(repository.transactionCommitted).toBe(true);
      return context.supportGrantId;
    });
    expect(authorized).toEqual({ ok: true, code: "OK_SUPPORT_AUTHORIZED", value: GRANT_A });
    expect(callbackContext).toBe(GRANT_A);
    expect(getSupportAccessContext()).toBeNull();
    const revoked = await asMember(() => service.revoke({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "revoke-001" }));
    expect(revoked).toMatchObject({ ok: true, code: "OK_SUPPORT_GRANT_REVOKED" });
    const supportEvents = repository.events as Array<Record<string, unknown>>;
    expect(supportEvents).toHaveLength(5);
    expect(supportEvents.every((event) => typeof event.attemptId === "string" && event.attemptId !== event.supportGrantId || event.operation === "request")).toBe(true);
  });

  it("binds every action event and support context to the current action correlation", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    await asMember(() => service.request(requestInput("correlation-request")), TENANT_A, MEMBER_A, WORKSPACE_A, "corr-request");
    await asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "correlation-approve" }), TENANT_A, MEMBER_A, WORKSPACE_A, "corr-approve");
    expect(repository.events.at(-1)).toMatchObject({ operation: "approve", correlationId: "corr-approve" });
    expect(repository.grants.get(GRANT_A)?.correlationId).toBe("corr-request");
    await expect(service.check({ ...checkInput("correlation-check"), correlationId: "corr-check" })).resolves.toEqual({ ok: true, code: "OK_SUPPORT_AUTHORIZED" });
    expect(repository.events.at(-1)).toMatchObject({ operation: "check", correlationId: "corr-check" });
    let callbackCorrelation = "";
    await expect(service.authorizeAndRun({ ...checkInput("correlation-run"), correlationId: "corr-run" }, async (context) => { callbackCorrelation = context.correlationId; return context.correlationId; })).resolves.toEqual({ ok: true, code: "OK_SUPPORT_AUTHORIZED", value: "corr-run" });
    expect(callbackCorrelation).toBe("corr-run");
    expect(repository.events.at(-1)).toMatchObject({ operation: "authorize_and_run", correlationId: "corr-run" });
    await expect(service.check({ ...checkInput("correlation-check"), correlationId: "corr-check" })).resolves.toEqual({ ok: true, code: "OK_SUPPORT_REPLAY" });
    expect(repository.events.at(-1)).toMatchObject({ operation: "check", correlationId: "corr-check" });
    await asMember(() => service.revoke({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "correlation-revoke" }), TENANT_A, MEMBER_A, WORKSPACE_A, "corr-revoke");
    expect(repository.events.at(-1)).toMatchObject({ operation: "revoke", correlationId: "corr-revoke" });
  });

  it("requires accepted member correlation and rechecks current membership plus conditional policy in the transaction", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository, false);
    await expect(asMember(() => service.request(requestInput("policy-001")))).resolves.toEqual({ ok: false, code: "SUPPORT_POLICY_BLOCKED" });
    expect(repository.events).toHaveLength(1);
    const mismatched = await asMember(() => service.request(requestInput("correlation-001", undefined, "caller-correlation")));
    expect(mismatched).toEqual({ ok: false, code: "SUPPORT_MALFORMED" });
    expect(repository.events).toHaveLength(2);
    repository.policyAllowed = true;
    repository.authorityAllowed = false;
    await expect(asMember(() => service.request(requestInput("stale-authority-001")))).resolves.toEqual({ ok: false, code: "SUPPORT_POLICY_BLOCKED" });
    expect(repository.grants.size).toBe(0);
  });

  it("audits safely classifiable malformed and mixed-scope attempts", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    const malformedDecision = { tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "malformed-decision", unexpected: true };
    await expect(asMember(() => service.approve(malformedDecision as never))).resolves.toEqual({ ok: false, code: "SUPPORT_MALFORMED" });
    expect(repository.events).toHaveLength(1);
    await expect(asMember(() => service.check({ ...checkInput("mixed-check"), supportPrincipalRef: "opaque-support-a" }))).resolves.toEqual({ ok: false, code: "SUPPORT_SCOPE_MISMATCH" });
    expect(repository.events).toHaveLength(2);
  });

  it("audits safely classifiable mixed request attempts with truthful support and worker actors", async () => {
    const workerRepository = new FakeRepository();
    const workerService = makeService(workerRepository);
    await runWithWorkerTenantContext(workerAuthorization(), () => workerService.request(requestInput("worker-request")));
    expect(workerRepository.events).toHaveLength(1);
    expect(workerRepository.events[0]).toMatchObject({ operation: "request", actorLayer: "worker", actorId: null, decisionCode: "SUPPORT_SCOPE_MISMATCH" });

    const supportRepository = new FakeRepository();
    const supportService = makeService(supportRepository);
    await asMember(() => supportService.request(requestInput("support-seed")));
    await asMember(() => supportService.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "support-seed-approve" }));
    const before = supportRepository.events.length;
    await expect(supportService.authorizeAndRun(checkInput("support-request-context"), async () => supportService.request(requestInput("support-request")))).resolves.toMatchObject({ ok: true, value: { ok: false, code: "SUPPORT_SCOPE_MISMATCH" } });
    expect(supportRepository.events).toHaveLength(before + 2);
    expect(supportRepository.events.at(-1)).toMatchObject({ operation: "request", actorLayer: "support", actorId: SUPPORT_A, decisionCode: "SUPPORT_SCOPE_MISMATCH" });
  });

  it("audits invalid support data classes, replays deterministically, and rolls back audit failures", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    const input = { ...checkInput("invalid-data-classes"), dataClasses: ["not-a-data-class"] };
    await expect(service.check(input)).resolves.toEqual({ ok: false, code: "SUPPORT_MALFORMED" });
    expect(repository.events).toHaveLength(1);
    expect(repository.events[0]).toMatchObject({ actorLayer: "support", supportGrantId: GRANT_A, permission: "tenant:read", dataClasses: [], reasonCode: "support.check", decisionCode: "SUPPORT_MALFORMED" });
    await expect(service.check(input)).resolves.toEqual({ ok: false, code: "SUPPORT_MALFORMED" });
    expect(repository.events).toHaveLength(2);
    expect(repository.events[1]).toMatchObject({ actorLayer: "support", supportGrantId: GRANT_A, permission: "tenant:read", dataClasses: [], reasonCode: "support.check", decisionCode: "SUPPORT_MALFORMED", inputHash: (repository.events[0] as { inputHash: string }).inputHash });

    const eventFailure = new FakeRepository();
    eventFailure.failEvents = true;
    await expect(makeService(eventFailure).check(input)).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(eventFailure.events).toHaveLength(0);
    expect(eventFailure.idempotency).toHaveLength(0);
    const commitFailure = new FakeRepository();
    commitFailure.failCommit = true;
    await expect(makeService(commitFailure).check(input)).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(commitFailure.events).toHaveLength(0);
    expect(commitFailure.idempotency).toHaveLength(0);
  });

  it("records worker-originated mixed-context denials as worker events without inventing an actor", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    await runWithWorkerTenantContext(workerAuthorization(), () => asMember(async () => {
      await expect(service.check(checkInput("worker-check"))).resolves.toEqual({ ok: false, code: "SUPPORT_SCOPE_MISMATCH" });
      await expect(service.authorizeAndRun(checkInput("worker-authorize"), async () => "must-not-run")).resolves.toEqual({ ok: false, code: "SUPPORT_SCOPE_MISMATCH" });
      await expect(service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "worker-approve" })).resolves.toEqual({ ok: false, code: "SUPPORT_SCOPE_MISMATCH" });
      await expect(service.revoke({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "worker-revoke" })).resolves.toEqual({ ok: false, code: "SUPPORT_SCOPE_MISMATCH" });
      await expect(service.listCurrent({ tenantId: TENANT_A, idempotencyKey: "worker-list-current" })).resolves.toEqual({ ok: false, code: "SUPPORT_SCOPE_MISMATCH" });
      await expect(service.listHistory({ tenantId: TENANT_A, idempotencyKey: "worker-list-history" })).resolves.toEqual({ ok: false, code: "SUPPORT_SCOPE_MISMATCH" });
    }));
    expect(repository.events).toHaveLength(6);
    expect(repository.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "check", actorLayer: "worker", actorId: null }),
      expect.objectContaining({ operation: "authorize_and_run", actorLayer: "worker", actorId: null }),
      expect.objectContaining({ operation: "approve", actorLayer: "worker", actorId: null }),
      expect.objectContaining({ operation: "revoke", actorLayer: "worker", actorId: null }),
      expect.objectContaining({ operation: "list_current", actorLayer: "worker", actorId: null }),
      expect.objectContaining({ operation: "list_history", actorLayer: "worker", actorId: null }),
    ]));
  });

  it("rejects forged selectors and enforces workspace member narrowing", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    await expect(asMember(() => service.request(requestInput("scope-001", null)))).resolves.toMatchObject({ code: "SUPPORT_WORKSPACE_SCOPE_INVALID" });
    await expect(asMember(() => service.listCurrent({ tenantId: TENANT_A, workspaceId: null, idempotencyKey: "scope-list-001" }))).resolves.toMatchObject({ code: "SUPPORT_WORKSPACE_SCOPE_INVALID" });
    await expect(asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, workspaceId: null, idempotencyKey: "scope-approve-001" }))).resolves.toMatchObject({ code: "SUPPORT_WORKSPACE_SCOPE_INVALID" });
    await expect(service.check({ ...checkInput("forge-001"), supportPrincipalRef: { authIdentityId: SUPPORT_A, platformRole: "platform_support" } })).resolves.toMatchObject({ code: "SUPPORT_GRANT_REQUIRED" });
    await expect(asMember(() => service.request(requestInput("foreign-001")), TENANT_B, MEMBER_B, null)).resolves.toMatchObject({ code: "SUPPORT_MALFORMED" });
  });

  it("requires a server-authenticated matching support principal before grant lookup or callback", async () => {
    const missingRepository = new FakeRepository();
    const missingService = makeService(missingRepository, true, null);
    await expect(missingService.check(checkInput("no-current-principal"))).resolves.toEqual({ ok: false, code: "SUPPORT_GRANT_REQUIRED" });
    expect(missingRepository.events).toHaveLength(1);
    expect(missingRepository.grants.size).toBe(0);

    const otherRepository = new FakeRepository();
    const otherService = makeService(otherRepository, true, { authIdentityId: MEMBER_B, platformRole: "platform_support" });
    let called = false;
    await expect(otherService.authorizeAndRun(checkInput("other-principal"), async () => { called = true; return "must-not-run"; })).resolves.toEqual({ ok: false, code: "SUPPORT_GRANT_REQUIRED" });
    expect(called).toBe(false);
    expect(otherRepository.events).toHaveLength(1);
    expect(otherRepository.grants.size).toBe(0);

    const matchingRepository = new FakeRepository();
    const matchingService = makeService(matchingRepository);
    await asMember(() => matchingService.request(requestInput("matching-principal-request")));
    await asMember(() => matchingService.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "matching-principal-approve" }));
    await expect(matchingService.check(checkInput("matching-principal-check"))).resolves.toEqual({ ok: true, code: "OK_SUPPORT_AUTHORIZED" });
  });

  it("allows a tenant-wide member to choose tenant-wide or a verified workspace", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    const wide = await asMember(() => service.request(requestInput("wide-001", null)), TENANT_A, MEMBER_A, null);
    expect(wide).toMatchObject({ ok: true, grant: { workspaceId: null } });
    const scoped = await asMember(() => service.request(requestInput("wide-002", WORKSPACE_A)), TENANT_A, MEMBER_A, null);
    expect(scoped).toMatchObject({ ok: true, grant: { workspaceId: WORKSPACE_A } });
    await expect(asMember(() => service.request(requestInput("wide-003", WORKSPACE_B)), TENANT_A, MEMBER_A, null)).resolves.toMatchObject({ ok: true });
  });

  it("uses exact descriptor boundaries for inputs, arrays, and repository grants", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    const getter = Object.defineProperty({ ...requestInput("getter-001") }, "permissions", { get: () => ["tenant:read"], enumerable: true });
    await expect(asMember(() => service.request(getter))).resolves.toMatchObject({ code: "SUPPORT_MALFORMED" });
    const symbolInput = { ...requestInput("symbol-001"), permissions: ["tenant:read"] as string[] } as Record<string, unknown>;
    Object.defineProperty(symbolInput, Symbol("hidden"), { value: true, enumerable: true });
    await expect(asMember(() => service.request(symbolInput as never))).resolves.toMatchObject({ code: "SUPPORT_MALFORMED" });
    const sparse = [] as string[];
    sparse.length = 1;
    await expect(asMember(() => service.request({ ...requestInput("sparse-001"), permissions: sparse }))).resolves.toMatchObject({ code: "SUPPORT_MALFORMED" });
    const noncanonical = Object.assign([], { "01": "tenant:read" }) as string[];
    noncanonical.length = 1;
    await expect(asMember(() => service.request({ ...requestInput("index-001"), permissions: noncanonical }))).resolves.toMatchObject({ code: "SUPPORT_MALFORMED" });
    repository.malformedGrant = true;
    await expect(asMember(() => service.request(requestInput("hidden-grant-001")))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(repository.grants.size).toBe(0);
  });

  it("rejects impossible ISO rollover dates from callers and repositories", async () => {
    const inputRepository = new FakeRepository();
    const inputService = makeService(inputRepository);
    await expect(asMember(() => inputService.request({ ...requestInput("impossible-input"), startsAt: "2026-02-30T11:00:00.000Z" }))).resolves.toEqual({ ok: false, code: "SUPPORT_MALFORMED" });
    expect(inputRepository.events).toHaveLength(1);
    const repository = new FakeRepository();
    repository.impossibleTimestamp = true;
    const service = makeService(repository);
    await expect(asMember(() => service.request(requestInput("impossible-repository")))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(repository.grants.size).toBe(0);
    expect(repository.events).toHaveLength(0);
  });

  it("requires exact create/approve/revoke/get postconditions and rolls back every residual mutation", async () => {
    const createRepository = new FakeRepository();
    createRepository.malformedGrant = true;
    const createService = makeService(createRepository);
    await expect(asMember(() => createService.request(requestInput("post-create-001")))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(createRepository.grants.size).toBe(0);
    expect(createRepository.idempotency.size).toBe(0);
    expect(createRepository.events).toHaveLength(0);

    const repository = new FakeRepository();
    const service = makeService(repository);
    await asMember(() => service.request(requestInput("post-approve-request")));
    repository.wrongPostcondition = true;
    await expect(asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "post-approve-001" }))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(repository.grants.get(GRANT_A)?.state).toBe("pending");
    expect(repository.events).toHaveLength(1);
    repository.wrongPostcondition = false;
    await asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "post-approve-002" }));
    repository.wrongGrantId = true;
    await expect(asMember(() => service.revoke({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "post-get-001" }))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(repository.grants.get(GRANT_A)?.state).toBe("approved");
  });

  it("keeps replay hashes and result codes coherent, without replaying denial as OK_SUPPORT_REPLAY", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository, false);
    const input = requestInput("denial-replay-001");
    await expect(asMember(() => service.request(input))).resolves.toEqual({ ok: false, code: "SUPPORT_POLICY_BLOCKED" });
    repository.policyAllowed = true;
    await expect(asMember(() => service.request(input))).resolves.toEqual({ ok: false, code: "SUPPORT_POLICY_BLOCKED" });
    const malformed = new FakeRepository();
    const malformedService = makeService(malformed);
    await asMember(() => malformedService.request(requestInput("hash-replay-001")));
    malformed.malformedReplayHash = true;
    await expect(asMember(() => malformedService.request(requestInput("hash-replay-001")))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(malformed.events).toHaveLength(1);
  });

  it("reauthorizes mutation replays before returning stored grant details", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    await asMember(() => service.request(requestInput("replay-request")));
    const requestEvents = repository.events.length;
    repository.authorityAllowed = false;
    await expect(asMember(() => service.request(requestInput("replay-request")))).resolves.toEqual({ ok: false, code: "SUPPORT_POLICY_BLOCKED" });
    expect(repository.events).toHaveLength(requestEvents + 1);
    repository.authorityAllowed = true;
    await expect(asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "replay-approve" }))).resolves.toMatchObject({ ok: true, code: "OK_SUPPORT_GRANT_APPROVED" });
    repository.authorityAllowed = false;
    await expect(asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "replay-approve" }))).resolves.toEqual({ ok: false, code: "SUPPORT_POLICY_BLOCKED" });
    expect(repository.grants.get(GRANT_A)?.state).toBe("approved");
    await expect(asMember(() => service.revoke({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "replay-revoke" }))).resolves.toEqual({ ok: false, code: "SUPPORT_POLICY_BLOCKED" });
  });

  it("revalidates the requested workspace before disclosing a request replay", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    const input = requestInput("replay-workspace");
    await asMember(() => service.request(input));
    const eventsBefore = repository.events.length;
    repository.workspaces.delete(`${TENANT_A}:${WORKSPACE_A}`);
    await expect(asMember(() => service.request(input))).resolves.toEqual({ ok: false, code: "SUPPORT_WORKSPACE_SCOPE_INVALID" });
    expect(repository.events).toHaveLength(eventsBefore + 1);
    expect(repository.grants.size).toBe(1);
    expect(repository.idempotency.size).toBe(1);
  });

  it("turns clock and id dependency failures into internal denials without transaction residue", async () => {
    const repository = new FakeRepository();
    const throwingClock = createSupportAccessService({
      repository,
      principalResolver: { resolve: async () => ({ authIdentityId: SUPPORT_A, platformRole: "platform_support" }), resolveCurrent: async () => ({ authIdentityId: SUPPORT_A, platformRole: "platform_support" }) },
      policyEvaluator: { evaluate: async (input) => ({ ...input, allowed: true }) },
      now: () => { throw new Error("clock unavailable"); },
      idFactory: () => IDS[0],
    });
    await expect(asMember(() => throwingClock.request(requestInput("clock-failure")))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(repository.grants.size).toBe(0);
    expect(repository.idempotency.size).toBe(0);
    expect(repository.events).toHaveLength(0);

    const normal = makeService(repository);
    await asMember(() => normal.request(requestInput("dependency-seed")));
    await asMember(() => normal.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "dependency-approve" }));
    const throwingId = createSupportAccessService({
      repository,
      principalResolver: { resolve: async () => ({ authIdentityId: SUPPORT_A, platformRole: "platform_support" }), resolveCurrent: async () => ({ authIdentityId: SUPPORT_A, platformRole: "platform_support" }) },
      policyEvaluator: { evaluate: async (input) => ({ ...input, allowed: true }) },
      now: () => NOW,
      idFactory: () => { throw new Error("id unavailable"); },
    });
    const beforeEvents = repository.events.length;
    await expect(asMember(() => throwingId.revoke({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "dependency-revoke" }))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    await expect(asMember(() => throwingId.listCurrent({ tenantId: TENANT_A, idempotencyKey: "dependency-list" }))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(repository.events).toHaveLength(beforeEvents);
    expect(repository.grants.get(GRANT_A)?.state).toBe("approved");

    const throwingTransactionClock = createSupportAccessService({
      repository,
      principalResolver: { resolve: async () => ({ authIdentityId: SUPPORT_A, platformRole: "platform_support" }), resolveCurrent: async () => ({ authIdentityId: SUPPORT_A, platformRole: "platform_support" }) },
      policyEvaluator: { evaluate: async (input) => ({ ...input, allowed: true }) },
      now: () => { throw new Error("transaction clock unavailable"); },
      idFactory: () => IDS[0],
    });
    await expect(throwingTransactionClock.check(checkInput("dependency-clock-check"))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(repository.events).toHaveLength(beforeEvents);
    expect(repository.grants.get(GRANT_A)?.state).toBe("approved");
  });

  it("freshly rechecks volatile check/list replay and keeps authorize_and_run in its own namespace", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    await asMember(() => service.request(requestInput("volatile-request")));
    await asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "volatile-approve" }));
    const input = checkInput("volatile-check-001");
    await expect(service.check(input)).resolves.toEqual({ ok: true, code: "OK_SUPPORT_AUTHORIZED" });
    const approved = repository.grants.get(GRANT_A) as SupportAccessGrant;
    repository.grants.set(GRANT_A, grant({ ...approved, updatedAt: NOW.toISOString() }, "revoked", approved.approvedAt ?? START, NOW.toISOString()));
    await expect(service.check(input)).resolves.toEqual({ ok: false, code: "SUPPORT_GRANT_REQUIRED" });
    let called = false;
    await expect(service.authorizeAndRun(input, async () => { called = true; return "should-not-run"; })).resolves.toEqual({ ok: false, code: "SUPPORT_GRANT_REQUIRED" });
    expect(called).toBe(false);
  });

  it("lists only same-scope current grants at one trusted instant and keeps history tenant/workspace bounded", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    await asMember(() => service.request(requestInput("list-request")));
    await expect(asMember(() => service.listCurrent({ tenantId: TENANT_A, idempotencyKey: "list-current" }))).resolves.toMatchObject({ ok: true, grants: [] });
    await expect(asMember(() => service.listHistory({ tenantId: TENANT_A, idempotencyKey: "list-history" }))).resolves.toMatchObject({ ok: true, grants: [{ id: GRANT_A, workspaceId: WORKSPACE_A }] });
    repository.grants.set(GRANT_B, grant({ ...(repository.grants.get(GRANT_A) as SupportAccessGrant), id: GRANT_B, tenantId: TENANT_B, workspaceId: null }, "pending"));
    await expect(asMember(() => service.listHistory({ tenantId: TENANT_A, idempotencyKey: "list-foreign" }))).resolves.toMatchObject({ ok: true, grants: [{ id: GRANT_A }] });
  });

  it("applies tenant-admin inherited visibility and returns fresh list replay data", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    await asMember(() => service.request(requestInput("visibility-wide", null)), TENANT_A, MEMBER_A, null);
    await asMember(() => service.request(requestInput("visibility-workspace", WORKSPACE_A)), TENANT_A, MEMBER_A, null);
    const tenantWide = await asMember(() => service.listHistory({ tenantId: TENANT_A, idempotencyKey: "visibility-tenant-wide" }), TENANT_A, MEMBER_A, null);
    expect(tenantWide).toMatchObject({ ok: true });
    expect(tenantWide.grants).toHaveLength(2);
    const workspace = await asMember(() => service.listHistory({ tenantId: TENANT_A, workspaceId: WORKSPACE_A, idempotencyKey: "visibility-workspace-query" }), TENANT_A, MEMBER_A, WORKSPACE_A);
    expect(workspace).toMatchObject({ ok: true });
    expect(workspace.grants).toHaveLength(2);
    expect((workspace.grants ?? []).map((value) => value.workspaceId)).toEqual(expect.arrayContaining([null, WORKSPACE_A]));

    await asMember(() => service.request(requestInput("fresh-list-request")));
    const freshGrantId = [...repository.grants.keys()].at(-1) as string;
    const listInput = { tenantId: TENANT_A, idempotencyKey: "fresh-list-replay" };
    await expect(asMember(() => service.listCurrent(listInput))).resolves.toMatchObject({ ok: true, grants: [] });
    await asMember(() => service.approve({ tenantId: TENANT_A, grantId: freshGrantId, idempotencyKey: "fresh-list-approve" }));
    await expect(asMember(() => service.listCurrent(listInput))).resolves.toMatchObject({ ok: true, code: "OK_SUPPORT_AUTHORIZED", grants: [{ id: freshGrantId }] });
  });

  it("does not run the callback when event durability fails and cleans support/database ALS after callback failure", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    let called = false;
    repository.failEvents = true;
    await expect(service.authorizeAndRun(checkInput("audit-fail"), async () => { called = true; })).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(called).toBe(false);
    expect(repository.grants.size).toBe(0);
    expect(repository.idempotency.size).toBe(0);
    expect(repository.events).toHaveLength(0);
    const callbackRepository = new FakeRepository();
    const callbackService = makeService(callbackRepository);
    await asMember(() => callbackService.request(requestInput("callback-request")));
    await asMember(() => callbackService.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "callback-approve" }));
    expect(callbackRepository.grants.get(GRANT_A)?.state).toBe("approved");
    await expect(callbackService.authorizeAndRun(checkInput("callback-fail"), async () => {
      expect(getTenantDbContext()).toBeNull();
      await expect(withTenantDbContext(async () => { throw new Error("callback failure"); })).rejects.toThrow();
      throw new Error("callback failure");
    })).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(getSupportAccessContext()).toBeNull();
    expect(getTenantDbContext()).toBeNull();
  });

  it("installs only the support T-030 scope after the durable event and rejects mixed scopes", async () => {
    const repository = new FakeRepository();
    const service = makeService(repository);
    await asMember(() => service.request(requestInput("guc-request")));
    await asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "guc-approve" }));
    const result = await service.authorizeAndRun({ ...checkInput("guc-run"), workspaceId: WORKSPACE_A }, async (context) => withTenantDbContext(async (db) => {
      expect(repository.transactionCommitted).toBe(true);
      expect(context.auditEventId).not.toBe(context.supportGrantId);
      expect(getTenantDbContext()).toMatchObject({ source: "support", tenantId: TENANT_A, workspaceId: WORKSPACE_A, actorId: SUPPORT_A, supportGrantId: GRANT_A, membershipId: null, role: null, roleBindingId: null, jobId: null, runId: null, leaseId: null, correlationId: "corr-check-001" });
      return db.prepare("SELECT 1 AS ok").get<{ ok: number }>();
    }));
    expect(result).toMatchObject({ ok: true, value: { ok: 1 } });
    expect(getTenantDbContext()).toBeNull();
    await expect(asMember(() => service.request(requestInput("mixed-request")))).resolves.toMatchObject({ ok: true });
  });

  it("proves direct Postgres transaction-local support GUCs only when a Postgres test environment is present", async () => {
    if (!process.env.DATABASE_URL) return;
    const repository = new FakeRepository();
    const service = makeService(repository);
    await asMember(() => service.request(requestInput("pg-support-request")));
    await asMember(() => service.approve({ tenantId: TENANT_A, grantId: GRANT_A, idempotencyKey: "pg-support-approve" }));
    const readGucs = async (db: Awaited<ReturnType<typeof getDb>>) => db.prepare(`
      SELECT
        current_setting('app.tenant_id', true) AS tenant_id,
        current_setting('app.workspace_id', true) AS workspace_id,
        current_setting('app.actor_id', true) AS actor_id,
        current_setting('app.membership_id', true) AS membership_id,
        current_setting('app.role', true) AS role,
        current_setting('app.role_binding_id', true) AS role_binding_id,
        current_setting('app.support_grant_id', true) AS support_grant_id,
        current_setting('app.job_id', true) AS job_id,
        current_setting('app.run_id', true) AS run_id,
        current_setting('app.lease_id', true) AS lease_id,
        current_setting('app.lease_generation', true) AS lease_generation,
        current_setting('app.worker_name', true) AS worker_name,
        current_setting('app.worker_action', true) AS worker_action,
        current_setting('app.worker_principal_kind', true) AS worker_principal_kind,
        current_setting('app.correlation_id', true) AS correlation_id
    `).get<Record<string, string | null>>();

    const committed = await service.authorizeAndRun(checkInput("pg-support-run"), async () => withTenantDbContext(async (db) => readGucs(db)));
    expect(committed).toMatchObject({ ok: true, value: { tenant_id: TENANT_A, workspace_id: WORKSPACE_A, actor_id: SUPPORT_A, membership_id: "", role: "", role_binding_id: "", support_grant_id: GRANT_A, job_id: "", run_id: "", lease_id: "", lease_generation: "", worker_name: "", worker_action: "", worker_principal_kind: "", correlation_id: "corr-check-001" } });
    expect(getTenantDbContext()).toBeNull();

    await expect(service.authorizeAndRun(checkInput("pg-support-rollback"), async () => withTenantDbContext(async (db) => {
      expect((await readGucs(db))?.support_grant_id).toBe(GRANT_A);
      throw new Error("support rollback");
    }))).resolves.toEqual({ ok: false, code: "SUPPORT_INTERNAL" });
    expect(getTenantDbContext()).toBeNull();

    const reused = await readGucs(await getDb());
    expect(reused).toMatchObject({ tenant_id: "", workspace_id: "", actor_id: "", membership_id: "", role: "", role_binding_id: "", support_grant_id: "", job_id: "", run_id: "", lease_id: "", lease_generation: "", worker_name: "", worker_action: "", worker_principal_kind: "", correlation_id: "" });

    await expect(service.authorizeAndRun(checkInput("pg-support-mixed"), async () => runWithTenantContext(memberSession(TENANT_A, MEMBER_A, WORKSPACE_A), "corr-mixed-pg", async () => {
      await expect(withTenantDbContext(async () => undefined)).rejects.toMatchObject({ code: "TENANT_DB_CONTEXT_CONFLICT" });
    }))).resolves.toMatchObject({ ok: true });
  });
});
