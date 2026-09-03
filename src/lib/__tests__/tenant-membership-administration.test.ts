import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { TenantSession } from "@/lib/auth";
import {
  createTenantMembershipAdministrationService,
  MembershipAdministrationError,
  type ApplyMembershipMutationResult,
  type MembershipAdministrationAuditEvent,
  type MembershipAdministrationDependencies,
  type MembershipAdministrationRepository,
  type MembershipAdministrationTransactionScope,
  type MembershipIdempotencyPort,
  type MembershipMutationJournalEntry,
  type MembershipMutationResult,
  type MembershipRecord,
  type MembershipSnapshot,
  type RoleBindingRecord,
  type WorkspaceRecord,
} from "@/lib/tenancy/memberships";
import type { LaunchRole, MembershipStatus } from "@/lib/tenancy/types";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const AUTH_SHARED = "20000000-0000-4000-8000-000000000001";
const AUTH_TARGET = "20000000-0000-4000-8000-000000000002";
const ACTOR_A = "30000000-0000-4000-8000-000000000001";
const ACTOR_B = "30000000-0000-4000-8000-000000000002";
const ACTOR_C = "30000000-0000-4000-8000-000000000006";
const TARGET_A = "30000000-0000-4000-8000-000000000003";
const TARGET_B = "30000000-0000-4000-8000-000000000004";
const OWNER_2 = "30000000-0000-4000-8000-000000000005";
const BINDING_ACTOR_A = "40000000-0000-4000-8000-000000000001";
const BINDING_ACTOR_B = "40000000-0000-4000-8000-000000000002";
const BINDING_ACTOR_C = "40000000-0000-4000-8000-000000000006";
const BINDING_TARGET_A = "40000000-0000-4000-8000-000000000003";
const BINDING_TARGET_B = "40000000-0000-4000-8000-000000000004";
const BINDING_OWNER_2 = "40000000-0000-4000-8000-000000000005";
const NOW = new Date("2026-07-27T20:00:00.000Z");
const BEFORE = "2026-07-27T19:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

type EffectMode = "normal" | "no_op" | "wrong_tenant" | "extra_replacement" | "stale_workspace" | "wrong_immutable" | "wrong_history" | "wrong_timestamp" | "custom_proto";
type BoundaryMode = "none" | "inherited" | "symbol" | "non_enumerable" | "accessor" | "sparse" | "extra_key" | "invalid_date" | "nested_role_bindings";

function membership(input: {
  id: string;
  tenantId: string;
  authIdentityId: string | null;
  status?: MembershipStatus;
  workspaceId?: string | null;
}): MembershipRecord {
  return {
    id: input.id,
    tenantId: input.tenantId,
    authIdentityId: input.authIdentityId,
    pendingIdentityRefHash: null,
    workspaceId: input.workspaceId ?? null,
    status: input.status ?? "active",
    invitedByMembershipId: null,
    createdAt: BEFORE,
    updatedAt: BEFORE,
  };
}

function binding(input: {
  id: string;
  tenantId: string;
  membershipId: string;
  role: LaunchRole;
  assignedByMembershipId?: string | null;
  reasonCode?: string;
  revokedAt?: string | null;
  createdAt?: string;
  validFrom?: string;
}): RoleBindingRecord {
  return {
    id: input.id,
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    role: input.role,
    createdAt: input.createdAt ?? BEFORE,
    validFrom: input.validFrom ?? BEFORE,
    revokedAt: input.revokedAt ?? null,
    assignedByMembershipId: input.assignedByMembershipId ?? null,
    reasonCode: input.reasonCode ?? "initial_provisioning",
  };
}

function snapshot(member: MembershipRecord, current: RoleBindingRecord | null): MembershipSnapshot {
  return { membership: member, currentRoleBinding: current, roleBindings: current ? [current] : [] };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

type Mutable<T> = { -readonly [Property in keyof T]: T[Property] };
type MutableSnapshot = {
  membership: Mutable<MembershipRecord>;
  currentRoleBinding: RoleBindingRecord | null;
  roleBindings: RoleBindingRecord[];
};

function mutable(value: MembershipSnapshot): MutableSnapshot {
  return value as unknown as MutableSnapshot;
}

function key(tenantId: string, membershipId: string): string {
  return `${tenantId}:${membershipId}`;
}

function session(overrides: Partial<TenantSession> = {}): TenantSession {
  return {
    userId: AUTH_SHARED,
    email: "synthetic@example.invalid",
    displayName: null,
    tenantId: TENANT_A,
    workspaceId: null,
    membershipId: ACTOR_A,
    role: "admin",
    roleBindingId: BINDING_ACTOR_A,
    ...overrides,
  };
}

class World {
  readonly memberships = new Map<string, MembershipSnapshot>();
  readonly workspaces = new Map<string, WorkspaceRecord>();
  readonly journal = new Map<string, MembershipMutationJournalEntry>();
  readonly auditEvents: MembershipAdministrationAuditEvent[] = [];
  readonly repository: MembershipAdministrationRepository;
  readonly idempotency: MembershipIdempotencyPort;
  effectMode: EffectMode = "normal";
  reserveMode: "normal" | "unknown" = "normal";
  listLeakTenantB = false;
  failAudit = false;
  failApply = false;
  applyCalls = 0;
  repositoryBoundaryMode: BoundaryMode = "none";
  listBoundaryMode: BoundaryMode = "none";
  journalRaw = false;
  hashOutput: "normal" | "malformed" = "normal";
  private nextMembership = 100;
  private nextBinding = 100;
  private queue = Promise.resolve();
  private open = false;

  constructor() {
    this.workspaces.set(`${TENANT_A}:${WORKSPACE_A}`, { id: WORKSPACE_A, tenantId: TENANT_A, status: "active" });
    this.workspaces.set(`${TENANT_B}:${WORKSPACE_B}`, { id: WORKSPACE_B, tenantId: TENANT_B, status: "active" });
    this.add(snapshot(membership({ id: ACTOR_A, tenantId: TENANT_A, authIdentityId: AUTH_SHARED }), binding({ id: BINDING_ACTOR_A, tenantId: TENANT_A, membershipId: ACTOR_A, role: "admin" })));
    this.add(snapshot(membership({ id: TARGET_A, tenantId: TENANT_A, authIdentityId: AUTH_TARGET, workspaceId: WORKSPACE_A }), binding({ id: BINDING_TARGET_A, tenantId: TENANT_A, membershipId: TARGET_A, role: "researcher" })));
    this.add(snapshot(membership({ id: TARGET_B, tenantId: TENANT_B, authIdentityId: AUTH_TARGET, workspaceId: WORKSPACE_B }), binding({ id: BINDING_TARGET_B, tenantId: TENANT_B, membershipId: TARGET_B, role: "researcher" })));
    this.add(snapshot(membership({ id: ACTOR_B, tenantId: TENANT_B, authIdentityId: AUTH_SHARED }), binding({ id: BINDING_ACTOR_B, tenantId: TENANT_B, membershipId: ACTOR_B, role: "admin" })));
    this.add(snapshot(membership({ id: ACTOR_C, tenantId: TENANT_A, authIdentityId: "20000000-0000-4000-8000-000000000006" }), binding({ id: BINDING_ACTOR_C, tenantId: TENANT_A, membershipId: ACTOR_C, role: "admin" })));
    this.repository = this.createRepository();
    this.idempotency = {
      find: async (hash) => {
        this.assertOpen();
        return this.journalRaw ? (this.journal.get(hash) ?? null) : clone(this.journal.get(hash) ?? null);
      },
      reserve: async (input) => {
        this.assertOpen();
        const previous = this.journal.get(input.idempotencyKeyHash);
        if (previous) return previous.inputHash === input.inputHash ? "completed" : "conflict";
        if (this.reserveMode === "unknown") return "unknown" as never;
        return "reserved";
      },
      complete: async (input) => {
        this.assertOpen();
        const { effectiveAt, ...entry } = input;
        void effectiveAt;
        this.journal.set(input.idempotencyKeyHash, clone({ ...entry, result: clone(input.result) }));
      },
    };
  }

  add(value: MembershipSnapshot): void {
    this.memberships.set(key(value.membership.tenantId, value.membership.id), clone(value));
  }

  owner(id: string, bindingId: string): void {
    this.add(snapshot(membership({ id, tenantId: TENANT_A, authIdentityId: AUTH_TARGET }), binding({ id: bindingId, tenantId: TENANT_A, membershipId: id, role: "owner" })));
  }

  actorAsOwner(): TenantSession {
    const current = mutable(this.memberships.get(key(TENANT_A, ACTOR_A))!);
    const ownerBinding = binding({ id: BINDING_ACTOR_A, tenantId: TENANT_A, membershipId: ACTOR_A, role: "owner" });
    current.membership.status = "active";
    current.currentRoleBinding = ownerBinding;
    current.roleBindings = [ownerBinding];
    return session({ role: "owner", roleBindingId: BINDING_ACTOR_A });
  }

  seedSecondOwner(): void {
    this.owner(OWNER_2, BINDING_OWNER_2);
  }

  corruptLastResult(mutator: (result: MembershipMutationResult) => MembershipMutationResult): void {
    const entry = [...this.journal.entries()].at(-1);
    if (!entry) throw new Error("missing journal entry");
    this.journal.set(entry[0], { ...entry[1], result: mutator(clone(entry[1].result)) });
  }

  corruptJournalBoundary(mode: Exclude<BoundaryMode, "none" | "sparse" | "invalid_date">): void {
    const entry = [...this.journal.entries()].at(-1);
    if (!entry) throw new Error("missing journal entry");
    const value = entry[1] as unknown as Record<string, unknown>;
    this.journalRaw = true;
    if (mode === "inherited") Object.setPrototypeOf(value, { inherited: true });
    if (mode === "symbol") Object.defineProperty(value, Symbol("unexpected"), { value: true, enumerable: true });
    if (mode === "non_enumerable") Object.defineProperty(value, "unexpected", { value: true, enumerable: false });
    if (mode === "accessor") {
      const result = value.result;
      Object.defineProperty(value, "result", { get: () => result, enumerable: true });
    }
    if (mode === "extra_key") Object.defineProperty(value, "unexpected", { value: true, enumerable: true });
  }

  service(policyEvaluator: MembershipAdministrationDependencies["policyEvaluator"] = (context) => ({ allowed: true, context })) {
    return createTenantMembershipAdministrationService({
      transactionCoordinator: {
        run: async <T>(callback: (scope: MembershipAdministrationTransactionScope) => Promise<T>): Promise<T> => {
          const execute = async (): Promise<T> => {
            const backup = { memberships: clone(this.memberships), journal: clone(this.journal), audit: clone(this.auditEvents) };
            this.open = true;
            try {
              const result = await callback({ repository: this.scopedRepository(), idempotency: this.idempotency, audit: { append: async (event) => { this.assertOpen(); if (this.failAudit) throw new Error("audit failure"); this.auditEvents.push(clone(event)); } } });
              this.open = false;
              return result;
            } catch (error) {
              this.memberships.clear(); backup.memberships.forEach((value, itemKey) => this.memberships.set(itemKey, value));
              this.journal.clear(); backup.journal.forEach((value, itemKey) => this.journal.set(itemKey, value));
              this.auditEvents.splice(0, this.auditEvents.length, ...backup.audit);
              this.open = false;
              throw error;
            }
          };
          const result = this.queue.then(execute, execute);
          this.queue = result.then(() => undefined, () => undefined);
          return result;
        },
      },
      idFactory: { next: () => {
        this.nextMembership += 1;
        return `50000000-0000-4000-8000-${this.nextMembership.toString().padStart(12, "0")}`;
      } },
      policyEvaluator,
      clock: () => new Date(NOW),
      ...(this.hashOutput === "malformed" ? { hash: () => "not-a-sha256" } : {}),
    });
  }

  private scopedRepository(): MembershipAdministrationRepository {
    const repository = this.repository;
    return new Proxy(repository, { get: (target, property, receiver) => {
      if (property !== "then") this.assertOpen();
      return Reflect.get(target, property, receiver);
    } });
  }

  private assertOpen(): void {
    if (!this.open) throw new Error("transaction-scoped handle used after callback");
  }

  private createRepository(): MembershipAdministrationRepository {
    // Repository methods close over the test-world state while each transaction exposes a fresh scoped proxy.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const world = this;
    return {
      async listMemberships(tenantId) {
        world.assertOpen();
        const rows = [...world.memberships.values()].filter((value) => value.membership.tenantId === tenantId).map(clone);
        if (world.listLeakTenantB) rows.push(clone(world.memberships.get(key(TENANT_B, TARGET_B))!));
        if (world.listBoundaryMode === "nested_role_bindings") {
          return rows.map((row) => {
            const roleBindings = row.roleBindings.slice();
            delete roleBindings[0];
            return { ...row, roleBindings };
          });
        }
        return shapeBoundaryArray(rows, world.listBoundaryMode);
      },
      async getMembership(tenantId, membershipId) {
        world.assertOpen();
        return clone(world.memberships.get(key(tenantId, membershipId)) ?? null);
      },
      async findByIdentitySelectorHash(tenantId, selectorHash) {
        world.assertOpen();
        const found = [...world.memberships.values()].find((value) => value.membership.tenantId === tenantId && value.membership.pendingIdentityRefHash === selectorHash);
        return found ? { snapshot: clone(found), selectorHash } : null;
      },
      async getWorkspace(tenantId, workspaceId) {
        world.assertOpen();
        return clone(world.workspaces.get(`${tenantId}:${workspaceId}`) ?? null);
      },
      async createPendingMembership(input) {
        world.assertOpen();
        const member: MembershipRecord = { id: input.membershipId, tenantId: input.tenantId, authIdentityId: null, pendingIdentityRefHash: input.pendingIdentityRefHash, workspaceId: input.workspaceId, status: "pending", invitedByMembershipId: input.invitedByMembershipId, createdAt: input.effectiveAt, updatedAt: input.effectiveAt };
        const roleBinding = binding({ id: `60000000-0000-4000-8000-${(++world.nextBinding).toString().padStart(12, "0")}`, tenantId: input.tenantId, membershipId: input.membershipId, role: input.role, assignedByMembershipId: input.invitedByMembershipId, reasonCode: "invitation", createdAt: input.effectiveAt, validFrom: input.effectiveAt });
        const result = snapshot(member, roleBinding);
        world.add(result);
        return clone(result);
      },
      async applyMutation(tenantId, input) {
        world.assertOpen();
        world.applyCalls += 1;
        if (world.failApply) throw new Error("repository failure");
        if (world.effectMode === "stale_workspace") {
          const stale = mutable(world.memberships.get(key(tenantId, input.targetMembershipId))!);
          if (stale) stale.membership.workspaceId = stale.membership.workspaceId === null ? WORKSPACE_A : null;
        }
        const currentRaw = world.memberships.get(key(tenantId, input.targetMembershipId));
        const current = currentRaw ? mutable(currentRaw) : null;
        if (!current || !input.expectedStatus.includes(current.membership.status) || current.membership.workspaceId !== input.expectedWorkspaceId || (current.currentRoleBinding?.id ?? null) !== input.expectedCurrentRoleBindingId || (current.currentRoleBinding?.role ?? null) !== input.expectedCurrentRole) throw new MembershipAdministrationError("STATE_CONFLICT");
        const losesOwner = current.membership.status === "active" && current.currentRoleBinding?.role === "owner" && ((input.roleChange?.kind === "replace" && input.roleChange.role !== "owner") || input.status === "disabled" || input.status === "revoked" || input.status === "removed");
        const ownerCount = [...world.memberships.values()].filter((value) => value.membership.tenantId === tenantId && value.membership.status === "active" && value.currentRoleBinding?.role === "owner").length;
        let replacement: MembershipSnapshot | null = null;
        if (losesOwner && ownerCount === 1 && input.replacementOwnerMembershipId === undefined) throw new MembershipAdministrationError("OWNER_GUARD");
        if (input.replacementOwnerMembershipId !== undefined) {
          const candidateRaw = world.memberships.get(key(tenantId, input.replacementOwnerMembershipId));
          const candidate = candidateRaw ? mutable(candidateRaw) : null;
          if (!candidate || candidate.membership.status !== "active" || candidate.membership.id === input.targetMembershipId || candidate.currentRoleBinding === null || candidate.currentRoleBinding.role === "owner") throw new MembershipAdministrationError("OWNER_GUARD");
          const old = candidate.currentRoleBinding;
          const revoked = { ...old, revokedAt: input.effectiveAt };
          const promoted = binding({ id: `70000000-0000-4000-8000-${(++world.nextBinding).toString().padStart(12, "0")}`, tenantId, membershipId: candidate.membership.id, role: "owner", assignedByMembershipId: input.actorMembershipId, reasonCode: "owner_replacement", createdAt: input.effectiveAt, validFrom: input.effectiveAt });
          candidate.membership.updatedAt = input.effectiveAt;
          candidate.roleBindings = [...candidate.roleBindings.map((item) => item.id === old.id ? revoked : item), promoted];
          candidate.currentRoleBinding = promoted;
          replacement = candidate;
        }
        if (world.effectMode === "no_op") return { target: clone(current), replacement: null };
        if (world.effectMode === "wrong_tenant") return { target: clone({ ...current, membership: { ...current.membership, tenantId: TENANT_B } }), replacement: null } as ApplyMembershipMutationResult;
        if (input.roleChange?.kind === "replace") {
          if (!current.currentRoleBinding) throw new MembershipAdministrationError("STATE_CONFLICT");
          const old = current.currentRoleBinding;
          current.roleBindings = [...current.roleBindings.map((item) => item.id === old.id ? { ...item, revokedAt: input.effectiveAt } : item), binding({ id: `80000000-0000-4000-8000-${(++world.nextBinding).toString().padStart(12, "0")}`, tenantId, membershipId: current.membership.id, role: input.roleChange.role, assignedByMembershipId: input.actorMembershipId, reasonCode: "role_change", createdAt: input.effectiveAt, validFrom: input.effectiveAt })];
          current.currentRoleBinding = current.roleBindings.at(-1)!;
        }
        if (input.roleChange?.kind === "revoke" && current.currentRoleBinding) {
          const old = current.currentRoleBinding;
          current.roleBindings = current.roleBindings.map((item) => item.id === old.id ? { ...item, revokedAt: input.effectiveAt } : item);
          current.currentRoleBinding = null;
        }
        if (input.status !== undefined) current.membership.status = input.status;
        if (input.workspaceId !== undefined) current.membership.workspaceId = input.workspaceId;
        current.membership.updatedAt = input.effectiveAt;
        if (world.effectMode === "wrong_immutable") current.membership.authIdentityId = null;
        if (world.effectMode === "wrong_history" && current.roleBindings.length > 0) current.roleBindings = current.roleBindings.slice(1);
        if (world.effectMode === "wrong_timestamp" && current.currentRoleBinding) {
          current.roleBindings = current.roleBindings.map((item) => item.id === current.currentRoleBinding!.id ? { ...item, validFrom: BEFORE } : item);
          current.currentRoleBinding = current.roleBindings.find((item) => item.revokedAt === null) ?? null;
        }
        const target = clone(current);
        if (world.effectMode === "extra_replacement") replacement = replacement ?? clone(current);
        const applied = { target, replacement };
        if (world.effectMode === "custom_proto") return Object.assign(Object.create({ inherited: true }), applied) as ApplyMembershipMutationResult;
        if (world.repositoryBoundaryMode === "inherited") return Object.assign(Object.create({ inherited: true }), applied) as ApplyMembershipMutationResult;
        if (world.repositoryBoundaryMode === "symbol") return Object.defineProperty(applied, Symbol("unexpected"), { value: true, enumerable: true }) as ApplyMembershipMutationResult;
        if (world.repositoryBoundaryMode === "non_enumerable") return Object.defineProperty(applied, "unexpected", { value: true, enumerable: false }) as ApplyMembershipMutationResult;
        if (world.repositoryBoundaryMode === "accessor") return Object.defineProperty(applied, "replacement", { get: () => replacement, enumerable: true }) as ApplyMembershipMutationResult;
        if (world.repositoryBoundaryMode === "sparse") {
          const rows = target.roleBindings.slice();
          delete rows[0];
          mutable(target).roleBindings = rows;
        }
        if (world.repositoryBoundaryMode === "extra_key") Object.defineProperty(target.roleBindings, "unexpected", { value: true, enumerable: true });
        if (world.repositoryBoundaryMode === "invalid_date") mutable(target).membership.createdAt = "2026-02-30T19:00:00.000Z";
        return { target, replacement };
      },
    };
  }
}

function commandBase(idempotencyKey: string) {
  const safeKey = idempotencyKey.length >= 8 ? idempotencyKey : `${idempotencyKey}-x`;
  return { reasonCode: "member_admin", correlationId: `corr-${safeKey}`, idempotencyKey: safeKey };
}

function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  return expect(promise).rejects.toMatchObject({ code });
}

function shapeBoundaryArray<T>(items: T[], mode: BoundaryMode): readonly T[] {
  if (mode === "inherited") return Object.setPrototypeOf(items, { inherited: true });
  if (mode === "symbol") return Object.defineProperty(items, Symbol("unexpected"), { value: true, enumerable: true });
  if (mode === "non_enumerable") return Object.defineProperty(items, "unexpected", { value: true, enumerable: false });
  if (mode === "accessor") return Object.defineProperty(items, "unexpected", { get: () => true, enumerable: true });
  if (mode === "sparse") {
    delete items[0];
    return items;
  }
  if (mode === "extra_key") return Object.defineProperty(items, "unexpected", { value: true, enumerable: true });
  return items;
}

describe("T-031 tenant membership administration", () => {
  it("consumes current/history reads before the coordinator invalidates the repository handle", async () => {
    const world = new World();
    const service = world.service();
    const current = await service.listCurrent(session());
    const history = await service.listHistory(session());
    expect(current.some((item) => item.membershipId === TARGET_A)).toBe(true);
    expect(history.find((item) => item.membershipId === TARGET_A)?.roleBindings).toHaveLength(1);
  });

  it("rejects tenant-B rows returned by either current or history listing", async () => {
    const world = new World();
    world.listLeakTenantB = true;
    const service = world.service();
    await expectCode(service.listCurrent(session()), "MALFORMED_REPOSITORY_RESULT");
    await expectCode(service.listHistory(session()), "MALFORMED_REPOSITORY_RESULT");
  });

  it("rejects command boundary violations before idempotency or persistence", async () => {
    const world = new World();
    const service = world.service();
    const valid = { ...commandBase("command-boundary-01"), membershipId: TARGET_A, role: "reviewer" as const };
    const inherited = Object.assign(Object.create({ inherited: true }), valid);
    const symbol = { ...valid };
    Object.defineProperty(symbol, Symbol("unexpected"), { value: true, enumerable: true });
    const nonEnumerable = { ...valid };
    Object.defineProperty(nonEnumerable, "unexpected", { value: true, enumerable: false });
    const accessor = { ...valid };
    Object.defineProperty(accessor, "role", { get: () => "reviewer", enumerable: true });
    const extra = { ...valid, unexpected: true };
    const missing = { ...valid } as { membershipId?: string; role?: "reviewer" } & Record<string, unknown>;
    delete missing.role;
    for (const malformed of [inherited, symbol, nonEnumerable, accessor, extra, missing]) {
      await expectCode(service.assignMemberRole(session(), malformed as never), "INVALID_INPUT");
    }
    expect(world.applyCalls).toBe(0);
    expect(world.journal.size).toBe(0);
    expect(world.auditEvents).toHaveLength(0);
  });

  it("rejects malformed current and history list array boundaries", async () => {
    for (const mode of ["inherited", "symbol", "non_enumerable", "accessor", "sparse", "extra_key", "nested_role_bindings"] as const) {
      const currentWorld = new World();
      currentWorld.listBoundaryMode = mode;
      const currentService = currentWorld.service();
      await expectCode(currentService.listCurrent(session()), "MALFORMED_REPOSITORY_RESULT");
      const historyWorld = new World();
      historyWorld.listBoundaryMode = mode;
      const historyService = historyWorld.service();
      await expectCode(historyService.listHistory(session()), "MALFORMED_REPOSITORY_RESULT");
    }
  });

  it("rejects malformed repository result records, arrays, and canonical dates", async () => {
    for (const mode of ["inherited", "symbol", "non_enumerable", "accessor", "sparse", "extra_key", "invalid_date"] as const) {
      const world = new World();
      world.repositoryBoundaryMode = mode;
      const service = world.service();
      await expectCode(service.assignMemberRole(session(), { ...commandBase(`repository-${mode}-01`), membershipId: TARGET_A, role: "reviewer" }), "MALFORMED_REPOSITORY_RESULT");
      expect(world.journal.size).toBe(0);
      expect(world.auditEvents).toHaveLength(0);
    }
  });

  it("preserves the shared Auth identity and tenant B membership when removing tenant A", async () => {
    const world = new World();
    const service = world.service();
    const result = await service.removeMember(session(), { ...commandBase("remove-a-01"), membershipId: TARGET_A });
    expect(result.tenantId).toBe(TENANT_A);
    expect(world.memberships.get(key(TENANT_A, TARGET_A))?.membership.status).toBe("removed");
    expect(world.memberships.get(key(TENANT_B, TARGET_B))?.membership.authIdentityId).toBe(AUTH_TARGET);
    expect(world.memberships.get(key(TENANT_B, TARGET_B))?.membership.status).toBe("active");
  });

  it("rejects cross-tenant selectors and forged command authority", async () => {
    const world = new World();
    const service = world.service();
    await expectCode(service.removeMember(session(), { ...commandBase("cross-target-01"), membershipId: TARGET_B, tenantId: TENANT_B } as never), "INVALID_INPUT");
    await expectCode(service.assignMemberWorkspace(session(), { ...commandBase("cross-workspace-01"), membershipId: TARGET_A, workspaceId: WORKSPACE_B }), "WORKSPACE_SCOPE_INVALID");
    await expectCode(service.assignMemberWorkspace(session(), { ...commandBase("forged-command-01"), membershipId: TARGET_A, workspaceId: null, tenantId: TENANT_B, actorMembershipId: ACTOR_B } as never), "INVALID_INPUT");
  });

  it("denies analyst/researcher administration and allows owner/admin only through the exact conditional evaluator", async () => {
    const world = new World();
    const denied = world.service();
    await expectCode(denied.removeMember(session({ role: "researcher", roleBindingId: BINDING_ACTOR_A }), { ...commandBase("researcher-01"), membershipId: TARGET_A }), "PERMISSION_DENIED");
    await expectCode(denied.removeMember(session({ role: "analyst_read_only", roleBindingId: BINDING_ACTOR_A }), { ...commandBase("analyst-01"), membershipId: TARGET_A }), "PERMISSION_DENIED");
    const contexts: string[] = [];
    const service = world.service((context) => { contexts.push(context.resource?.id ?? "none"); return { allowed: true, context }; });
    await service.assignMemberRole(session(), { ...commandBase("conditional-01"), membershipId: TARGET_A, role: "reviewer" });
    expect(contexts).toContain(TARGET_A);
  });

  it("prevents duplicate pending invites, replays the same command, and namespaces the same raw key by tenant and actor", async () => {
    const world = new World();
    const service = world.service();
    const command = { ...commandBase("invite-replay-01"), identitySelectorHash: HASH_A, role: "researcher" as const, workspaceId: null };
    const first = await service.invitePendingMember(session(), command);
    const replay = await service.invitePendingMember(session(), command);
    expect(replay).toEqual(first);
    await expectCode(service.invitePendingMember(session(), { ...command, idempotencyKey: "invite-replay-02", correlationId: "corr-invite-replay-02" }), "DUPLICATE_PENDING_INVITE");
    const tenantBService = world.service();
    const tenantBSession = session({ tenantId: TENANT_B, membershipId: ACTOR_B, roleBindingId: BINDING_ACTOR_B, userId: AUTH_SHARED });
    const tenantBResult = await tenantBService.invitePendingMember(tenantBSession, { ...command, identitySelectorHash: HASH_B });
    expect(tenantBResult.tenantId).toBe(TENANT_B);
    const sameTenantActor = world.service();
    const actorCSession = session({ membershipId: ACTOR_C, roleBindingId: BINDING_ACTOR_C, userId: "20000000-0000-4000-8000-000000000006" });
    const sameKeyResult = await sameTenantActor.invitePendingMember(actorCSession, { ...command, identitySelectorHash: "e".repeat(64), correlationId: "corr-invite-actor-c" });
    expect(sameKeyResult.tenantId).toBe(TENANT_A);
  });

  it("fails closed when idempotency reservation returns an unknown state", async () => {
    const world = new World();
    world.reserveMode = "unknown";
    const service = world.service();
    const before = clone(world.memberships.get(key(TENANT_A, TARGET_A))!);
    await expectCode(service.assignMemberRole(session(), { ...commandBase("reserve-unknown-01"), membershipId: TARGET_A, role: "reviewer" }), "MALFORMED_REPOSITORY_RESULT");
    expect(world.applyCalls).toBe(0);
    expect(world.memberships.get(key(TENANT_A, TARGET_A))).toEqual(before);
    expect(world.auditEvents).toHaveLength(0);
  });

  it("rejects malformed idempotency journal record boundaries on replay", async () => {
    for (const mode of ["inherited", "symbol", "non_enumerable", "accessor", "extra_key"] as const) {
      const world = new World();
      const service = world.service();
      const command = { ...commandBase(`journal-${mode}-01`), membershipId: TARGET_A, role: "reviewer" as const };
      await service.assignMemberRole(session(), command);
      world.corruptJournalBoundary(mode);
      await expectCode(service.assignMemberRole(session(), command), "IDEMPOTENCY_CONFLICT");
    }
  });

  it("handles pending/disabled transitions and requires fresh active binding for reactivation", async () => {
    const world = new World();
    const service = world.service();
    const invite = await service.invitePendingMember(session(), { ...commandBase("pending-01"), identitySelectorHash: "c".repeat(64), role: "researcher", workspaceId: null });
    await expectCode(service.disableMember(session(), { ...commandBase("pending-disable-01"), membershipId: invite.membership.membershipId }), "STATE_CONFLICT");
    await service.disableMember(session(), { ...commandBase("disable-01"), membershipId: TARGET_A });
    await service.reactivateMember(session(), { ...commandBase("reactivate-01"), membershipId: TARGET_A });
    expect(world.memberships.get(key(TENANT_A, TARGET_A))?.membership.status).toBe("active");
  });

  it("fails closed on malformed injected hash output with zero effects", async () => {
    const world = new World();
    world.hashOutput = "malformed";
    const service = world.service();
    const before = clone(world.memberships.get(key(TENANT_A, TARGET_A))!);
    await expectCode(service.assignMemberRole(session(), { ...commandBase("hash-output-01"), membershipId: TARGET_A, role: "reviewer" }), "TRANSACTION_FAILED");
    expect(world.applyCalls).toBe(0);
    expect(world.memberships.get(key(TENANT_A, TARGET_A))).toEqual(before);
    expect(world.journal.size).toBe(0);
    expect(world.auditEvents).toHaveLength(0);
  });

  it("allows a non-final owner change without replacement but guards the final owner", async () => {
    const world = new World();
    world.seedSecondOwner();
    const service = world.service();
    const ownerSession = world.actorAsOwner();
    const nonFinal = await service.assignMemberRole(ownerSession, { ...commandBase("owner-nonfinal-01"), membershipId: OWNER_2, role: "admin" });
    expect(nonFinal.membership.role).toBe("admin");
    await expectCode(service.assignMemberRole(ownerSession, { ...commandBase("owner-final-01"), membershipId: ACTOR_A, role: "admin" }), "OWNER_GUARD");
  });

  it("serializes two concurrent last-owner attempts so one loses atomically", async () => {
    const world = new World();
    world.seedSecondOwner();
    const service = world.service();
    const adminSession = session();
    const first = service.assignMemberRole(adminSession, { ...commandBase("concurrent-owner-01"), membershipId: OWNER_2, role: "admin" });
    const second = service.assignMemberRole(adminSession, { ...commandBase("concurrent-owner-02"), membershipId: ACTOR_A, role: "researcher" });
    const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected").map((outcome) => (outcome.reason as MembershipAdministrationError).code)).toContain("OWNER_GUARD");
  });

  it("performs approved atomic replacement and records correct replacement before/after audit", async () => {
    const world = new World();
    const ownerSession = world.actorAsOwner();
    const service = world.service();
    const result = await service.assignMemberRole(ownerSession, { ...commandBase("replacement-01"), membershipId: ACTOR_A, role: "admin", replacementOwnerMembershipId: TARGET_A });
    expect(result.replacementMembership).toMatchObject({ membershipId: TARGET_A, role: "owner", status: "active" });
    const audit = world.auditEvents.at(-1)!;
    expect(audit.replacementBefore).toMatchObject({ membershipId: TARGET_A, role: "researcher" });
    expect(audit.replacementAfter).toMatchObject({ membershipId: TARGET_A, role: "owner" });
    expect(audit.before).toMatchObject({ membershipId: ACTOR_A, role: "owner" });
    expect(audit.after).toMatchObject({ membershipId: ACTOR_A, role: "admin" });
    expect(Object.keys(audit.before ?? {}).sort()).toEqual(["membershipId", "role", "status", "workspaceId"].sort());
    expect(Object.keys(audit.after).sort()).toEqual(["membershipId", "role", "status", "workspaceId"].sort());
    expect(Object.keys(audit.replacementBefore ?? {}).sort()).toEqual(["membershipId", "role", "status", "workspaceId"].sort());
    expect(Object.keys(audit.replacementAfter ?? {}).sort()).toEqual(["membershipId", "role", "status", "workspaceId"].sort());
    expect(audit.before).not.toHaveProperty("tenantId");
    expect(audit.after).not.toHaveProperty("tenantId");
  });

  it("binds effectiveAt to every membership mutation and owner replacement effect", async () => {
    const effectiveAt = NOW.toISOString();
    const inviteWorld = new World();
    const invite = await inviteWorld.service().invitePendingMember(session(), { ...commandBase("timestamp-invite-01"), identitySelectorHash: "f".repeat(64), role: "researcher", workspaceId: null });
    const invited = inviteWorld.memberships.get(key(TENANT_A, invite.membership.membershipId))!;
    expect(invited.membership.createdAt).toBe(effectiveAt);
    expect(invited.membership.updatedAt).toBe(effectiveAt);
    expect(invited.roleBindings[0].createdAt).toBe(effectiveAt);
    expect(invited.roleBindings[0].validFrom).toBe(effectiveAt);

    const roleWorld = new World();
    await roleWorld.service().assignMemberRole(session(), { ...commandBase("timestamp-role-01"), membershipId: TARGET_A, role: "reviewer" });
    const roleTarget = roleWorld.memberships.get(key(TENANT_A, TARGET_A))!;
    expect(roleTarget.membership.updatedAt).toBe(effectiveAt);
    expect(roleTarget.roleBindings.at(-1)?.createdAt).toBe(effectiveAt);
    expect(roleTarget.roleBindings.at(-1)?.validFrom).toBe(effectiveAt);
    expect(roleTarget.roleBindings[0].revokedAt).toBe(effectiveAt);

    const workspaceWorld = new World();
    await workspaceWorld.service().assignMemberWorkspace(session(), { ...commandBase("timestamp-workspace-01"), membershipId: TARGET_A, workspaceId: null });
    expect(workspaceWorld.memberships.get(key(TENANT_A, TARGET_A))?.membership.updatedAt).toBe(effectiveAt);

    const stateWorld = new World();
    const stateService = stateWorld.service();
    await stateService.disableMember(session(), { ...commandBase("timestamp-disable-01"), membershipId: TARGET_A });
    expect(stateWorld.memberships.get(key(TENANT_A, TARGET_A))?.membership.updatedAt).toBe(effectiveAt);
    await stateService.reactivateMember(session(), { ...commandBase("timestamp-reactivate-01"), membershipId: TARGET_A });
    expect(stateWorld.memberships.get(key(TENANT_A, TARGET_A))?.membership.updatedAt).toBe(effectiveAt);

    const revokeWorld = new World();
    await revokeWorld.service().revokeMember(session(), { ...commandBase("timestamp-revoke-01"), membershipId: TARGET_A });
    expect(revokeWorld.memberships.get(key(TENANT_A, TARGET_A))?.membership.updatedAt).toBe(effectiveAt);

    const removeWorld = new World();
    await removeWorld.service().removeMember(session(), { ...commandBase("timestamp-remove-01"), membershipId: TARGET_A });
    expect(removeWorld.memberships.get(key(TENANT_A, TARGET_A))?.membership.updatedAt).toBe(effectiveAt);

    const replacementWorld = new World();
    const replacementService = replacementWorld.service();
    await replacementService.assignMemberRole(replacementWorld.actorAsOwner(), { ...commandBase("timestamp-replacement-01"), membershipId: ACTOR_A, role: "admin", replacementOwnerMembershipId: TARGET_A });
    const replacementTarget = replacementWorld.memberships.get(key(TENANT_A, ACTOR_A))!;
    const replacement = replacementWorld.memberships.get(key(TENANT_A, TARGET_A))!;
    expect(replacementTarget.membership.updatedAt).toBe(effectiveAt);
    expect(replacement.roleBindings.at(-1)?.createdAt).toBe(effectiveAt);
    expect(replacement.roleBindings.at(-1)?.validFrom).toBe(effectiveAt);
    expect(replacement.roleBindings[0].revokedAt).toBe(effectiveAt);
    expect(replacement.membership.updatedAt).toBe(effectiveAt);
  });

  it("rolls back membership, role, journal, and audit effects on repository or audit failure", async () => {
    const world = new World();
    const service = world.service();
    const before = clone(world.memberships.get(key(TENANT_A, TARGET_A))!);
    world.failApply = true;
    await expectCode(service.assignMemberRole(session(), { ...commandBase("rollback-repo-01"), membershipId: TARGET_A, role: "reviewer" }), "TRANSACTION_FAILED");
    expect(world.memberships.get(key(TENANT_A, TARGET_A))).toEqual(before);
    world.failApply = false;
    world.failAudit = true;
    await expectCode(service.assignMemberRole(session(), { ...commandBase("rollback-audit-01"), membershipId: TARGET_A, role: "reviewer" }), "TRANSACTION_FAILED");
    expect(world.memberships.get(key(TENANT_A, TARGET_A))).toEqual(before);
    expect(world.auditEvents).toHaveLength(0);
    expect(world.journal.size).toBe(0);
  });

  it("rejects malformed transaction scope contracts before action work", async () => {
    const world = new World();
    let actionCalls = 0;
    const service = createTenantMembershipAdministrationService({
      transactionCoordinator: {
        run: async (callback) => callback({ repository: {}, idempotency: {}, audit: { append: async () => { actionCalls += 1; } } } as never),
      },
      idFactory: { next: () => { actionCalls += 1; return TARGET_A; } },
      clock: () => new Date(NOW),
    });
    await expectCode(service.assignMemberRole(session(), { ...commandBase("scope-contract-01"), membershipId: TARGET_A, role: "reviewer" }), "TRANSACTION_REQUIRED");
    expect(actionCalls).toBe(0);
    expect(world.applyCalls).toBe(0);
  });

  it("rejects stale workspace and malformed/no-op/wrong-effect repository results", async () => {
    const world = new World();
    const service = world.service();
    world.effectMode = "stale_workspace";
    await expectCode(service.assignMemberWorkspace(session(), { ...commandBase("stale-01"), membershipId: TARGET_A, workspaceId: null }), "STATE_CONFLICT");
    world.effectMode = "no_op";
    await expectCode(service.assignMemberRole(session(), { ...commandBase("noop-01"), membershipId: TARGET_A, role: "reviewer" }), "MALFORMED_REPOSITORY_RESULT");
    world.effectMode = "wrong_tenant";
    await expectCode(service.assignMemberRole(session(), { ...commandBase("wrong-tenant-effect-01"), membershipId: TARGET_A, role: "reviewer" }), "MALFORMED_REPOSITORY_RESULT");
    world.effectMode = "extra_replacement";
    await expectCode(service.assignMemberRole(session(), { ...commandBase("extra-replacement-01"), membershipId: TARGET_A, role: "reviewer" }), "MALFORMED_REPOSITORY_RESULT");
    world.effectMode = "normal";
    const callsBeforeNoOp = world.applyCalls;
    await expectCode(service.assignMemberRole(session(), { ...commandBase("semantic-role-noop-01"), membershipId: TARGET_A, role: "researcher" }), "STATE_CONFLICT");
    await expectCode(service.assignMemberWorkspace(session(), { ...commandBase("semantic-workspace-noop-01"), membershipId: TARGET_A, workspaceId: WORKSPACE_A }), "STATE_CONFLICT");
    expect(world.applyCalls).toBe(callsBeforeNoOp);
    world.effectMode = "wrong_immutable";
    await expectCode(service.assignMemberRole(session(), { ...commandBase("wrong-immutable-01"), membershipId: TARGET_A, role: "reviewer" }), "MALFORMED_REPOSITORY_RESULT");
    world.effectMode = "wrong_history";
    await expectCode(service.assignMemberRole(session(), { ...commandBase("wrong-history-01"), membershipId: TARGET_A, role: "reviewer" }), "MALFORMED_REPOSITORY_RESULT");
    world.effectMode = "wrong_timestamp";
    await expectCode(service.assignMemberRole(session(), { ...commandBase("wrong-timestamp-01"), membershipId: TARGET_A, role: "reviewer" }), "MALFORMED_REPOSITORY_RESULT");
    world.effectMode = "custom_proto";
    await expectCode(service.assignMemberRole(session(), { ...commandBase("custom-proto-01"), membershipId: TARGET_A, role: "reviewer" }), "MALFORMED_REPOSITORY_RESULT");
  });

  it("binds policy to the exact target and never exposes the invite selector", async () => {
    const world = new World();
    const service = world.service((context) => ({ allowed: true, context: { ...context, resource: context.resource ? { ...context.resource, id: TARGET_B } : null } }));
    await expectCode(service.assignMemberRole(session(), { ...commandBase("policy-target-01"), membershipId: TARGET_A, role: "reviewer" }), "POLICY_BLOCKED");
    const inviteContexts: string[] = [];
    const inviteService = world.service((context) => { if (context.resource) inviteContexts.push(context.resource.id ?? ""); return { allowed: true, context }; });
    await inviteService.invitePendingMember(session(), { ...commandBase("policy-invite-01"), identitySelectorHash: "d".repeat(64), role: "researcher", workspaceId: null });
    expect(inviteContexts[0]).not.toBe("d".repeat(64));
    expect(inviteContexts[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it("revalidates actor and policy before replay, and rejects cross-tenant or malformed journal results", async () => {
    const world = new World();
    const service = world.service();
    const command = { ...commandBase("replay-guards-01"), membershipId: TARGET_A, role: "reviewer" as const };
    await service.assignMemberRole(session(), command);
    mutable(world.memberships.get(key(TENANT_A, ACTOR_A))!).membership.status = "disabled";
    await expectCode(service.assignMemberRole(session(), command), "TENANT_SCOPE_REQUIRED");
    mutable(world.memberships.get(key(TENANT_A, ACTOR_A))!).membership.status = "active";
    const denying = world.service(() => ({ allowed: false, context: { tenantId: TENANT_A, workspaceId: null, membershipId: ACTOR_A, role: "admin", permission: "role:assign", action: "membership.assign_role", resource: null } }));
    await expectCode(denying.assignMemberRole(session(), command), "POLICY_BLOCKED");
    world.corruptLastResult((result) => ({ ...result, tenantId: TENANT_B }));
    await expectCode(service.assignMemberRole(session(), command), "MALFORMED_REPOSITORY_RESULT");
  });
});
