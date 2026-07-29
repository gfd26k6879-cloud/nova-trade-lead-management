import {
  createTenantLimitService,
  TENANT_LIMIT_ACTIONS,
  TENANT_LIMIT_ACTION_POLICY,
  type AtomicTenantLimitConsumeRequest,
  type PlatformKillSwitchTransaction,
  type TenantLimitBackend,
  type TenantLimitRuntimeState,
  type TenantLimitAction,
  type TenantLimitService,
  type TenantLimitCommand,
  type TenantLimitConfigurationChange,
  type TenantLimitServiceDependencies,
} from "@/lib/tenancy/limits";
import { runWithTenantContext } from "@/lib/tenancy/context";
import type { TenantSession } from "@/lib/auth";
import { TENANT_FEATURES, TENANT_FEATURE_POLICY_FIELDS } from "@/lib/tenancy/features";
import { describe, expect, it, vi } from "vitest";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const ACTOR_A = "actor-a-00001";
const ACTOR_B = "actor-b-00001";
const USER_A = "50000000-0000-4000-8000-000000000001";
const USER_B = "50000000-0000-4000-8000-000000000002";
const PRINCIPAL_A = { kind: "trusted_service_principal", principalId: "service-ref-1" } as const;
const PRINCIPAL_B = { kind: "trusted_service_principal", principalId: "service-ref-2" } as const;
const OPERATOR = { kind: "platform_operator", principalId: "platform-ref-1" } as const;

type Counts = Map<string, number>;
type MutableTenantLimitRuntimeState = {
  -readonly [Key in keyof TenantLimitRuntimeState]: TenantLimitRuntimeState[Key];
};

function state(tenantId: string, overrides: Partial<TenantLimitRuntimeState> = {}): MutableTenantLimitRuntimeState {
  return {
    tenantId,
    tenantStatus: "active",
    configurationVersion: 1,
    platformConfigurationVersion: 1,
    platformGlobalKill: false,
    platformActionKills: {},
    tenantActionKills: {},
    tenantPolicyCaps: {},
    ...overrides,
  };
}

function session(tenantId: string, userId: string): TenantSession {
  const suffix = tenantId.endsWith("2") ? "2" : "1";
  return {
    userId,
    email: `member-${suffix}@example.com`,
    displayName: `Member ${suffix}`,
    tenantId,
    workspaceId: null,
    membershipId: `60000000-0000-4000-8000-00000000000${suffix}`,
    role: "owner",
    roleBindingId: `70000000-0000-4000-8000-00000000000${suffix}`,
  };
}

function asTenant<T>(tenantId: string, userId: string, callback: () => T): T {
  return runWithTenantContext(session(tenantId, userId), `corr-tenant-${tenantId.slice(-1)}-0001`, callback);
}

function consumeAs(service: TenantLimitService, tenantId: string, userId: string, input: TenantLimitCommand) {
  return asTenant(tenantId, userId, () => service.consume(input));
}

function changeAs(service: TenantLimitService, tenantId: string, userId: string, input: TenantLimitConfigurationChange) {
  return asTenant(tenantId, userId, () => service.changeConfiguration(input));
}

function command(action: unknown = "membership_invite", overrides: Record<string, unknown> = {}) {
  return { action, amount: 1, idempotencyKey: "idem-key-0001", ...overrides };
}

function enabledFeature(tenantId = TENANT_A, featureId: keyof typeof TENANT_FEATURE_POLICY_FIELDS = "ai_processing", policyVersion = 4) {
  return { tenantId, featureId, policyField: TENANT_FEATURE_POLICY_FIELDS[featureId], state: "enabled" as const, policyEnabled: true, policyVersion, reasonCode: "FEATURE_ENABLED" as const };
}

function adversarialMapValues(): unknown[] {
  const customPrototype = Object.assign(Object.create({ inheritedAction: true }), { membership_invite: true });
  const inherited = Object.create({ membership_invite: true });
  const withSymbol = { membership_invite: true, [Symbol("unexpected")]: true };
  const withAccessor: Record<string, unknown> = {};
  Object.defineProperty(withAccessor, "membership_invite", { enumerable: true, get: () => true });
  return [[], new Date(), customPrototype, inherited, withSymbol, withAccessor];
}

function adversarialRecords(base: Record<string, unknown>, accessorKey = "tenantId"): unknown[] {
  const date = Object.assign(new Date(), base);
  const customPrototype = Object.assign(Object.create({ inheritedKey: true }), base);
  const withInheritedKey = { ...base };
  Object.setPrototypeOf(withInheritedKey, { inheritedKey: true });
  const withSymbol = { ...base, [Symbol("unexpected")]: true };
  const withAccessor = { ...base };
  Object.defineProperty(withAccessor, accessorKey, { enumerable: true, get: () => base[accessorKey] });
  return [[], date, customPrototype, withInheritedKey, withSymbol, withAccessor];
}

class AtomicFakeBackend implements TenantLimitBackend {
  readonly states = new Map<string, MutableTenantLimitRuntimeState>([[TENANT_A, state(TENANT_A)], [TENANT_B, state(TENANT_B)]]);
  readonly tenantCounts: Counts = new Map();
  readonly actorCounts: Counts = new Map();
  readonly idempotency = new Map<string, string>();
  readonly platformState = { configurationVersion: 1, platformGlobalKill: false, platformActionKills: {} as Partial<Record<TenantLimitAction, boolean>> };
  consumeCalls: AtomicTenantLimitConsumeRequest[] = [];
  configurationCalls = 0;
  platformConfigurationCalls = 0;
  beforeConsume: (() => void) | undefined;
  featureVersions: Record<string, number> = { [TENANT_A]: 4, [TENANT_B]: 4 };

  async getRuntimeState(input: { tenantId: string; action: TenantLimitAction }) {
    const value = this.states.get(input.tenantId);
    return value ? structuredClone(value) : null;
  }

  async getPlatformRuntimeState() {
    return structuredClone(this.platformState);
  }

  async consume(input: AtomicTenantLimitConsumeRequest) {
    this.beforeConsume?.();
    this.consumeCalls.push(input);
    const current = this.states.get(input.tenantId);
    if (!current || current.tenantStatus !== input.expectedTenantStatus || current.configurationVersion !== input.expectedConfigurationVersion || current.platformConfigurationVersion !== input.expectedPlatformConfigurationVersion || current.platformGlobalKill !== input.expectedPlatformGlobalKill || current.platformActionKills[input.action] === true !== input.expectedPlatformActionKill || current.tenantActionKills[input.action] === true !== input.expectedTenantActionKill || (current.tenantPolicyCaps[input.action] ?? TENANT_LIMIT_ACTION_POLICY[input.action].platformHardCap) !== input.expectedTenantPolicyCap || Math.min(TENANT_LIMIT_ACTION_POLICY[input.action].platformHardCap, current.tenantPolicyCaps[input.action] ?? TENANT_LIMIT_ACTION_POLICY[input.action].platformHardCap) !== input.hardBound) return { status: "state_changed" as const };
    const featureVersion = this.featureVersions[input.tenantId];
    if (input.expectedFeaturePolicyVersion !== null && featureVersion !== input.expectedFeaturePolicyVersion) return { status: "policy_blocked" as const };
    const priorHash = this.idempotency.get(input.idempotencyKey);
    if (priorHash !== undefined) return priorHash === input.requestHash ? { status: "replayed" as const, remaining: input.hardBound, resetAt: input.nowMs + input.windowMs } : { status: "idempotency_conflict" as const };
    const tenantKey = `${input.tenantId}:${input.action}`;
    const actorKey = `${tenantKey}:${input.actorId}`;
    const tenantUsed = this.tenantCounts.get(tenantKey) ?? 0;
    const actorUsed = this.actorCounts.get(actorKey) ?? 0;
    if (tenantUsed + input.amount > input.hardBound || actorUsed + input.amount > input.hardBound) return { status: "rate_limited" as const, remaining: Math.max(0, input.hardBound - tenantUsed), resetAt: input.nowMs + input.windowMs };
    this.idempotency.set(input.idempotencyKey, input.requestHash);
    this.tenantCounts.set(tenantKey, tenantUsed + input.amount);
    this.actorCounts.set(actorKey, actorUsed + input.amount);
    return { status: "consumed" as const, remaining: input.hardBound - tenantUsed - input.amount, resetAt: input.nowMs + input.windowMs };
  }

  async changeConfiguration(input: Parameters<TenantLimitBackend["changeConfiguration"]>[0]) {
    this.configurationCalls += 1;
    const current = this.states.get(input.tenantId);
    if (!current || current.configurationVersion !== input.expectedVersion) return { status: "conflict" as const };
    const next = structuredClone(current);
    next.configurationVersion = input.resultingVersion;
    if (input.mutation.tenantPolicyCap !== undefined) next.tenantPolicyCaps[input.action] = input.mutation.tenantPolicyCap;
    if (input.mutation.tenantActionKill !== undefined) next.tenantActionKills[input.action] = input.mutation.tenantActionKill;
    this.states.set(input.tenantId, next);
    return { tenantId: input.tenantId, action: input.action, previousVersion: input.expectedVersion, resultingVersion: input.resultingVersion };
  }

  async changePlatformConfiguration(input: PlatformKillSwitchTransaction) {
    this.platformConfigurationCalls += 1;
    if (this.platformState.configurationVersion !== input.expectedVersion) return { status: "conflict" as const };
    this.platformState.configurationVersion = input.resultingVersion;
    if (input.scope === "global") this.platformState.platformGlobalKill = input.enabled;
    else this.platformState.platformActionKills[input.action as TenantLimitAction] = input.enabled;
    for (const current of this.states.values()) {
      current.platformConfigurationVersion = this.platformState.configurationVersion;
      current.platformGlobalKill = this.platformState.platformGlobalKill;
      current.platformActionKills = structuredClone(this.platformState.platformActionKills);
    }
    return { scope: input.scope, action: input.action, previousVersion: input.expectedVersion, resultingVersion: input.resultingVersion };
  }
}

function makeService(backend: AtomicFakeBackend, featureService?: TenantLimitService["consume"] extends never ? never : { enforceFeature: (tenantId: string, featureId: string) => Promise<unknown> }, overrides: {
  servicePrincipalResolver?: NonNullable<TenantLimitServiceDependencies["servicePrincipalResolver"]>;
  platformOperatorResolver?: NonNullable<TenantLimitServiceDependencies["platformOperatorResolver"]>;
  policyEvaluator?: NonNullable<TenantLimitServiceDependencies["policyEvaluator"]>;
} = {}): TenantLimitService {
  return createTenantLimitService({
    backend,
    featureService: featureService as never,
    servicePrincipalResolver: overrides.servicePrincipalResolver ?? { resolve: async (principalId) => principalId === PRINCIPAL_A.principalId ? { tenantId: TENANT_A, actorId: ACTOR_A, workspaceId: null, permissions: ["budget:manage", "feature:manage"] } : principalId === PRINCIPAL_B.principalId ? { tenantId: TENANT_B, actorId: ACTOR_B, workspaceId: null, permissions: ["budget:manage", "feature:manage"] } : null },
    platformOperatorResolver: overrides.platformOperatorResolver ?? { resolve: async (principalId) => principalId === OPERATOR.principalId ? { operatorId: "operator-0001", permission: "platform:limit_manage" } : null },
    policyEvaluator: overrides.policyEvaluator ?? (async (context) => ({ allowed: true, context })),
    clock: () => 1_000,
  });
}

describe("T-032 tenant-aware limits and kill switches", () => {
  it("has fixed action vocabulary and no process-memory production backend", () => {
    expect(TENANT_LIMIT_ACTIONS).toEqual(expect.arrayContaining(["membership_invite", "support_grant_request", "support_grant_approval", "knowledge_upload", "export_request", "deletion_request", "worker_start", "agent_plan_expensive"]));
    expect(() => createTenantLimitService(undefined as never)).toThrow("BACKEND_REQUIRED");
  });

  it("fails closed for unknown, negative, zero, oversized, and malformed commands", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    for (const input of [command("unknown"), command("membership_invite", { amount: 0 }), command("membership_invite", { amount: -1 }), command("membership_invite", { amount: Number.NaN }), command("membership_invite", { idempotencyKey: "bad" })]) {
      await expect(consumeAs(service, TENANT_A, USER_A, input)).resolves.toMatchObject({ outcome: "blocked" });
    }
    expect(backend.consumeCalls).toHaveLength(0);
  });

  it("isolates concurrent tenant A/B capacity and enforces tenant plus actor buckets", async () => {
    const backend = new AtomicFakeBackend();
    backend.states.get(TENANT_A)!.tenantPolicyCaps.membership_invite = 2;
    backend.states.get(TENANT_B)!.tenantPolicyCaps.membership_invite = 2;
    const service = makeService(backend);
    const [a1, b1, a2, b2, a3] = await Promise.all([
      consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: "a-key-0001" })),
      consumeAs(service, TENANT_B, USER_B, command("membership_invite", { idempotencyKey: "b-key-0001" })),
      consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: "a-key-0002" })),
      consumeAs(service, TENANT_B, USER_B, command("membership_invite", { idempotencyKey: "b-key-0002" })),
      consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: "a-key-0003" })),
    ]);
    expect([a1.outcome, a2.outcome, b1.outcome, b2.outcome]).toEqual(["allowed", "allowed", "allowed", "allowed"]);
    expect(a3).toMatchObject({ outcome: "rate_limited", code: "RATE_LIMITED" });
    expect(backend.tenantCounts.get(`${TENANT_B}:membership_invite`)).toBe(2);
  });

  it("returns one winner at an atomic boundary", async () => {
    const backend = new AtomicFakeBackend();
    backend.states.get(TENANT_A)!.tenantPolicyCaps.membership_invite = 1;
    const service = makeService(backend);
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: `boundary-${index}-0001` }))));
    expect(results.filter((result) => result.outcome === "allowed")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "rate_limited")).toHaveLength(7);
  });

  it("replays idempotently, conflicts on the same key with a different scoped request, and namespaces tenants/actions", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite"))).resolves.toMatchObject({ outcome: "allowed" });
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite"))).resolves.toMatchObject({ outcome: "allowed" });
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite", { amount: 2 }))).resolves.toMatchObject({ code: "BLOCKED_IDEMPOTENCY_CONFLICT" });
    await expect(consumeAs(service, TENANT_B, USER_B, command("membership_invite"))).resolves.toMatchObject({ outcome: "allowed" });
    await expect(consumeAs(service, TENANT_A, USER_A, command("export_request"))).resolves.toMatchObject({ code: "BLOCKED_FEATURE" });
    expect(new Set(backend.consumeCalls.map((input) => input.idempotencyKey)).size).toBe(2);
  });

  it("uses the minimum of platform hard cap and tenant policy cap", async () => {
    const backend = new AtomicFakeBackend();
    backend.states.get(TENANT_A)!.tenantPolicyCaps.membership_invite = 100;
    const service = makeService(backend);
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite"))).resolves.toMatchObject({ outcome: "allowed" });
    expect(backend.consumeCalls[0].hardBound).toBe(TENANT_LIMIT_ACTION_POLICY.membership_invite.platformHardCap);
    backend.states.get(TENANT_A)!.configurationVersion += 1;
    backend.states.get(TENANT_A)!.tenantPolicyCaps.membership_invite = 1;
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: "tight-key-0001" }))).resolves.toMatchObject({ outcome: "rate_limited" });
    expect(backend.consumeCalls[1].hardBound).toBe(1);
  });

  it("blocks malformed backend state, throws, and commit results without leaking details", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    backend.getRuntimeState = vi.fn(async () => ({ tenantId: TENANT_A, tenantStatus: "active" })) as never;
    await expect(consumeAs(service, TENANT_A, USER_A, command())).resolves.toMatchObject({ code: "BLOCKED_BACKEND" });
    backend.getRuntimeState = vi.fn(async () => { throw new Error("backend down"); }) as never;
    await expect(consumeAs(service, TENANT_A, USER_A, command())).resolves.toMatchObject({ code: "BLOCKED_BACKEND" });
  });

  it("rejects non-plain runtime records and malformed action maps before consuming", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    for (const malformed of adversarialRecords(state(TENANT_A) as unknown as Record<string, unknown>)) {
      backend.getRuntimeState = vi.fn(async () => malformed) as never;
      await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: `state-record-${backend.consumeCalls.length + 1}` }))).resolves.toMatchObject({ code: "BLOCKED_BACKEND" });
    }
    for (const field of ["platformActionKills", "tenantActionKills", "tenantPolicyCaps"] as const) {
      for (const malformed of adversarialMapValues()) {
        backend.getRuntimeState = vi.fn(async () => ({ ...state(TENANT_A), [field]: malformed })) as never;
        await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: `map-${field}-${backend.consumeCalls.length + 1}` }))).resolves.toMatchObject({ code: "BLOCKED_BACKEND" });
      }
    }
    expect(backend.consumeCalls).toHaveLength(0);
  });

  it("rejects adversarial feature, resolver, policy, authority, operator, commit, and result records without side effects", async () => {
    const backend = new AtomicFakeBackend();
    const featureService = { enforceFeature: vi.fn(async () => enabledFeature()) };
    const service = makeService(backend, featureService);
    for (const malformed of adversarialRecords(enabledFeature() as unknown as Record<string, unknown>)) {
      featureService.enforceFeature.mockResolvedValue(malformed as never);
      await expect(consumeAs(service, TENANT_A, USER_A, command("agent_plan_expensive", { idempotencyKey: `feature-record-${backend.consumeCalls.length + 1}` }))).resolves.toMatchObject({ code: "BLOCKED_FEATURE" });
    }
    expect(backend.consumeCalls).toHaveLength(0);

    for (const malformed of adversarialRecords({ tenantId: TENANT_A, actorId: ACTOR_A, workspaceId: null, permissions: ["budget:manage", "feature:manage"] })) {
      const resolvedService = makeService(backend, undefined, { servicePrincipalResolver: { resolve: async () => malformed } });
      await expect(resolvedService.consume(command(), { kind: "service_principal", principal: PRINCIPAL_A })).resolves.toMatchObject({ code: "BLOCKED_TENANT_SCOPE" });
    }
    for (const malformed of adversarialRecords({ operatorId: "operator-0001", permission: "platform:limit_manage" })) {
      const resolvedOperator = makeService(backend, undefined, { platformOperatorResolver: { resolve: async () => malformed } });
      await expect(resolvedOperator.changePlatformKillSwitch({ scope: "global", enabled: true, expectedVersion: 1, reason: "bad operator", correlationId: "corr-operator-001" }, OPERATOR)).rejects.toMatchObject({ code: "PLATFORM_CONFIGURATION_UNAUTHORIZED" });
    }
    for (const malformed of adversarialRecords({ kind: "service_principal", principal: PRINCIPAL_A }, "kind")) {
      await expect(service.consume(command(), malformed as never)).resolves.toMatchObject({ code: "BLOCKED_TENANT_SCOPE" });
    }
    for (const malformed of adversarialRecords({ kind: "platform_operator", principalId: OPERATOR.principalId }, "kind")) {
      await expect(service.changePlatformKillSwitch({ scope: "global", enabled: true, expectedVersion: 1, reason: "bad reference", correlationId: "corr-operator-002" }, malformed as never)).rejects.toMatchObject({ code: "PLATFORM_CONFIGURATION_UNAUTHORIZED" });
    }

    for (const malformed of adversarialRecords({ allowed: true, context: { tenantId: TENANT_A, workspaceId: null, membershipId: session(TENANT_A, USER_A).membershipId, role: "owner", permission: "budget:manage", action: "tenant_limits.budget:manage.change", resource: null } })) {
      const denied = makeService(backend, undefined, { policyEvaluator: async () => malformed as never });
      await expect(changeAs(denied, TENANT_A, USER_A, { action: "membership_invite", tenantPolicyCap: 3, expectedVersion: 1, reason: "bad policy", correlationId: "corr-policy-001" })).rejects.toMatchObject({ code: "CONFIGURATION_UNAUTHORIZED" });
    }
    expect(backend.configurationCalls).toBe(0);
    expect(backend.platformConfigurationCalls).toBe(0);

    const validCommit = { tenantId: TENANT_A, action: "membership_invite", previousVersion: 1, resultingVersion: 2 };
    for (const malformed of adversarialRecords(validCommit)) {
      backend.changeConfiguration = vi.fn(async () => malformed) as never;
      await expect(changeAs(service, TENANT_A, USER_A, { action: "membership_invite", tenantPolicyCap: 3, expectedVersion: 1, reason: "bad commit", correlationId: `corr-commit-${backend.configurationCalls + 1}` })).rejects.toMatchObject({ code: "CONFIGURATION_FAILED" });
      expect(backend.states.get(TENANT_A)!.configurationVersion).toBe(1);
    }

    const validResult = { status: "consumed", remaining: 99, resetAt: 86_401_000 };
    for (const malformed of adversarialRecords(validResult, "status")) {
      backend.consume = vi.fn(async () => malformed) as never;
      await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: `result-${backend.consumeCalls.length + 1}` }))).resolves.toMatchObject({ code: "BLOCKED_BACKEND" });
      expect(backend.tenantCounts.size).toBe(0);
    }
  });

  it("propagates platform and tenant kills before consume", async () => {
    const backend = new AtomicFakeBackend();
    backend.platformState.platformGlobalKill = true;
    for (const current of backend.states.values()) current.platformGlobalKill = true;
    const service = makeService(backend);
    await expect(consumeAs(service, TENANT_A, USER_A, command())).resolves.toMatchObject({ code: "BLOCKED_KILL_SWITCH" });
    expect(backend.consumeCalls).toHaveLength(0);
    backend.platformState.platformGlobalKill = false;
    for (const current of backend.states.values()) current.platformGlobalKill = false;
    backend.states.get(TENANT_A)!.tenantActionKills.membership_invite = true;
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: "tenant-kill-001" }))).resolves.toMatchObject({ code: "BLOCKED_KILL_SWITCH" });
  });

  it("blocks suspended, archived, deletion-pending, and deleted tenants while permitting only lifecycle-classified bookkeeping", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    for (const tenantStatus of ["suspended", "archived", "deletion_pending", "deleted"] as const) {
      backend.states.get(TENANT_A)!.tenantStatus = tenantStatus;
      await expect(consumeAs(service, TENANT_A, USER_A, command("worker_start", { idempotencyKey: `${tenantStatus}-0001` }))).resolves.toMatchObject({ code: "BLOCKED_LIFECYCLE" });
    }
    backend.states.get(TENANT_A)!.tenantStatus = "suspended";
    await expect(consumeAs(service, TENANT_A, USER_A, command("recovery_bookkeeping", { idempotencyKey: "recovery-001" }))).resolves.toMatchObject({ outcome: "allowed" });
    backend.states.get(TENANT_A)!.tenantStatus = "archived";
    await expect(consumeAs(service, TENANT_A, USER_A, command("export_request", { idempotencyKey: "export-001" }))).resolves.toMatchObject({ code: "BLOCKED_FEATURE" });
  });

  it("requires T-019 feature enablement before consuming and binds its policy version", async () => {
    const backend = new AtomicFakeBackend();
    const featureService = { enforceFeature: vi.fn(async (): Promise<{ state: "enabled" | "disabled"; policyVersion?: number }> => ({ state: "disabled" })) };
    const service = makeService(backend, featureService);
    await expect(consumeAs(service, TENANT_A, USER_A, command("agent_plan_expensive"))).resolves.toMatchObject({ code: "BLOCKED_FEATURE" });
    expect(backend.consumeCalls).toHaveLength(0);
    featureService.enforceFeature.mockResolvedValue(enabledFeature(TENANT_A, TENANT_FEATURES.AI_PROCESSING));
    await expect(consumeAs(service, TENANT_A, USER_A, command("agent_plan_expensive", { idempotencyKey: "agent-plan-001" }))).resolves.toMatchObject({ outcome: "allowed" });
    expect(backend.consumeCalls[0].expectedFeaturePolicyVersion).toBe(4);
    featureService.enforceFeature.mockResolvedValue(enabledFeature(TENANT_B, TENANT_FEATURES.AI_PROCESSING));
    await expect(consumeAs(service, TENANT_A, USER_A, command("agent_plan_expensive", { idempotencyKey: "agent-plan-002" }))).resolves.toMatchObject({ code: "BLOCKED_FEATURE" });
    featureService.enforceFeature.mockResolvedValue({ ...enabledFeature(TENANT_A, TENANT_FEATURES.SOURCE_RESEARCH), policyVersion: 5 });
    await expect(consumeAs(service, TENANT_A, USER_A, command("agent_plan_expensive", { idempotencyKey: "agent-plan-003" }))).resolves.toMatchObject({ code: "BLOCKED_FEATURE" });
    expect(backend.consumeCalls).toHaveLength(1);
  });

  it("ignores forged authority fields and rejects mismatched selectors and forged service principals", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite", { tenantId: TENANT_B, actorId: ACTOR_B }))).resolves.toMatchObject({ code: "BLOCKED_TENANT_SCOPE" });
    const forgedContext = { tenantId: TENANT_B, workspaceId: null, membershipId: session(TENANT_B, USER_B).membershipId, role: "owner", roleBindingId: session(TENANT_B, USER_B).roleBindingId, actorAuthIdentityId: USER_B, correlationId: "corr-forged-0001" };
    await expect(service.consume(command(), { kind: "tenant_context", context: forgedContext } as never)).resolves.toMatchObject({ code: "BLOCKED_TENANT_SCOPE" });
    await expect(service.consume(command(), { kind: "tenant_session", session: session(TENANT_B, USER_B) } as never)).resolves.toMatchObject({ code: "BLOCKED_TENANT_SCOPE" });
    expect(backend.consumeCalls).toHaveLength(0);
  });

  it("namespaces both bucket identities by action", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: "bucket-action-001" }))).resolves.toMatchObject({ outcome: "allowed" });
    await expect(consumeAs(service, TENANT_A, USER_A, command("recovery_bookkeeping", { idempotencyKey: "bucket-action-002" }))).resolves.toMatchObject({ outcome: "allowed" });
    const membership = backend.consumeCalls.find((input) => input.action === "membership_invite");
    const recovery = backend.consumeCalls.find((input) => input.action === "recovery_bookkeeping");
    expect(membership?.buckets[0].key).not.toBe(recovery?.buckets[0].key);
    expect(membership?.buckets[1].key).not.toBe(recovery?.buckets[1].key);
  });

  it("revalidates kill, suspension, cap, and feature versions inside atomic consume", async () => {
    const backend = new AtomicFakeBackend();
    const featureService = { enforceFeature: vi.fn(async () => enabledFeature(TENANT_A, TENANT_FEATURES.AI_PROCESSING)) };
    const service = makeService(backend, featureService);
    backend.beforeConsume = () => { backend.states.get(TENANT_A)!.tenantActionKills.agent_plan_expensive = true; };
    await expect(consumeAs(service, TENANT_A, USER_A, command("agent_plan_expensive"))).resolves.toMatchObject({ code: "BLOCKED_BACKEND" });
    expect(backend.tenantCounts.size).toBe(0);
    backend.states.get(TENANT_A)!.tenantActionKills.agent_plan_expensive = false;
    backend.beforeConsume = () => { backend.states.get(TENANT_A)!.tenantActionKills.agent_plan_expensive = false; backend.states.get(TENANT_A)!.tenantStatus = "suspended"; };
    await expect(consumeAs(service, TENANT_A, USER_A, command("agent_plan_expensive", { idempotencyKey: "suspension-001" }))).resolves.toMatchObject({ code: "BLOCKED_BACKEND" });
    expect(backend.tenantCounts.size).toBe(0);
    backend.states.get(TENANT_A)!.tenantStatus = "active";
    backend.beforeConsume = () => { backend.states.get(TENANT_A)!.configurationVersion += 1; backend.states.get(TENANT_A)!.tenantPolicyCaps.agent_plan_expensive = 1; };
    await expect(consumeAs(service, TENANT_A, USER_A, command("agent_plan_expensive", { amount: 2, idempotencyKey: "cap-race-001" }))).resolves.toMatchObject({ code: "BLOCKED_BACKEND" });
    expect(backend.tenantCounts.size).toBe(0);
    backend.states.get(TENANT_A)!.tenantPolicyCaps.agent_plan_expensive = 100;
    backend.beforeConsume = () => { backend.featureVersions[TENANT_A] = 5; };
    await expect(consumeAs(service, TENANT_A, USER_A, command("agent_plan_expensive", { idempotencyKey: "feature-race-001" }))).resolves.toMatchObject({ code: "BLOCKED_FEATURE" });
    expect(backend.tenantCounts.size).toBe(0);
  });

  it("changes tenant caps/kill switches only with exact conditional authorization and CAS audit", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    await expect(changeAs(service, TENANT_A, USER_A, { action: "membership_invite", tenantPolicyCap: 3, expectedVersion: 1, reason: "tighten cap", correlationId: "corr-limit-001" })).resolves.toMatchObject({ code: "CONFIGURATION_CHANGED", resultingVersion: 2 });
    expect(backend.configurationCalls).toBe(1);
    await expect(changeAs(service, TENANT_A, USER_A, { action: "membership_invite", tenantPolicyCap: 4, expectedVersion: 1, reason: "stale cap", correlationId: "corr-limit-002" })).rejects.toMatchObject({ code: "CONFIGURATION_VERSION_CONFLICT" });
    const denied = makeService(backend);
    await expect(denied.changeConfiguration({ action: "membership_invite", tenantPolicyCap: 4, expectedVersion: 2, reason: "denied", correlationId: "corr-limit-003" }, { kind: "service_principal", principal: { kind: "trusted_service_principal", principalId: "not-trusted" } })).rejects.toMatchObject({ code: "CONFIGURATION_INVALID" });
  });

  it("rolls back configuration on backend failure and rejects unexpected commit fields", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    backend.changeConfiguration = vi.fn(async () => { throw new Error("audit rollback"); }) as never;
    await expect(changeAs(service, TENANT_A, USER_A, { action: "membership_invite", tenantPolicyCap: 3, expectedVersion: 1, reason: "audit failure", correlationId: "corr-limit-004" })).rejects.toMatchObject({ code: "CONFIGURATION_FAILED" });
    expect(backend.states.get(TENANT_A)!.configurationVersion).toBe(1);
    backend.changeConfiguration = vi.fn(async () => ({ tenantId: TENANT_A, action: "membership_invite", previousVersion: 1, resultingVersion: 2, unexpected: true })) as never;
    await expect(changeAs(service, TENANT_A, USER_A, { action: "membership_invite", tenantPolicyCap: 3, expectedVersion: 1, reason: "malformed commit", correlationId: "corr-limit-005" })).rejects.toMatchObject({ code: "CONFIGURATION_FAILED" });
  });

  it("administers platform global/action kills only through the trusted platform resolver and atomic audit CAS", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    await expect(service.changePlatformKillSwitch({ scope: "global", enabled: true, expectedVersion: 1, reason: "emergency stop", correlationId: "corr-platform-001" }, OPERATOR)).resolves.toMatchObject({ code: "PLATFORM_CONFIGURATION_CHANGED", resultingVersion: 2 });
    expect(backend.platformConfigurationCalls).toBe(1);
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite"))).resolves.toMatchObject({ code: "BLOCKED_KILL_SWITCH" });
    await expect(service.changePlatformKillSwitch({ scope: "action", action: "membership_invite", enabled: true, expectedVersion: 1, reason: "stale action", correlationId: "corr-platform-002" }, OPERATOR)).rejects.toMatchObject({ code: "PLATFORM_CONFIGURATION_VERSION_CONFLICT" });
    await expect(service.changePlatformKillSwitch({ scope: "global", enabled: false, expectedVersion: 2, reason: "resume", correlationId: "corr-platform-003" }, { kind: "platform_operator", principalId: "tenant-ref" })).rejects.toMatchObject({ code: "PLATFORM_CONFIGURATION_UNAUTHORIZED" });
    await expect(service.changePlatformKillSwitch({ scope: "global", enabled: false, expectedVersion: 2, reason: "resume", correlationId: "corr-platform-004" }, OPERATOR)).resolves.toMatchObject({ code: "PLATFORM_CONFIGURATION_CHANGED" });
    await expect(service.changePlatformKillSwitch({ scope: "action", action: "membership_invite", enabled: true, expectedVersion: 3, reason: "action stop", correlationId: "corr-platform-006" }, OPERATOR)).resolves.toMatchObject({ code: "PLATFORM_CONFIGURATION_CHANGED", action: "membership_invite" });
    await expect(consumeAs(service, TENANT_A, USER_A, command("membership_invite", { idempotencyKey: "platform-action-001" }))).resolves.toMatchObject({ code: "BLOCKED_KILL_SWITCH" });
    await expect(service.changePlatformKillSwitch({ scope: "action", action: "membership_invite", enabled: false, expectedVersion: 4, reason: "action resume", correlationId: "corr-platform-007" }, OPERATOR)).resolves.toMatchObject({ code: "PLATFORM_CONFIGURATION_CHANGED", action: "membership_invite" });
    backend.changePlatformConfiguration = vi.fn(async () => { throw new Error("audit rollback"); }) as never;
    await expect(service.changePlatformKillSwitch({ scope: "action", action: "worker_start", enabled: true, expectedVersion: 5, reason: "audit failure", correlationId: "corr-platform-005" }, OPERATOR)).rejects.toMatchObject({ code: "PLATFORM_CONFIGURATION_FAILED" });
    expect(backend.platformState.configurationVersion).toBe(5);
  });

  it("fails closed for malformed rate-limit results and never returns tenant counts or raw keys", async () => {
    const backend = new AtomicFakeBackend();
    const service = makeService(backend);
    backend.consume = vi.fn(async () => ({ status: "consumed", remaining: 1, resetAt: 2_000, unexpected: "tenant-count" })) as never;
    const result = await consumeAs(service, TENANT_A, USER_A, command());
    expect(result).toEqual({ outcome: "blocked", code: "BLOCKED_BACKEND", retryAfterMs: null, resetAt: null });
    expect(JSON.stringify(result)).not.toContain("idem-key-0001");
  });
});
