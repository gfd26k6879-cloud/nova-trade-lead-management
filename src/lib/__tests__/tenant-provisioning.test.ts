import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { SCHEMA_SQL } from "@/lib/db/schema";
import type { DbClient } from "@/lib/db";
import {
  createTenantQueryRepository,
  type TenantQueryRepository,
} from "@/lib/tenancy/queries";
import {
  createTenantProvisioningService,
  TENANT_PROVISIONING_ACTIVATION_BLOCKERS,
  TENANT_PROVISIONING_AUDIT_EVENT,
  TENANT_PROVISIONING_RESULT_CODE,
  TenantProvisioningIdempotencyConflictError,
  TenantProvisioningRetryableError,
  type ProvisioningIdFactory,
  type ProvisioningJournalRecord,
  type TenantProvisioningAuditEvent,
  type TenantProvisioningResult,
  type TransactionalProvisioningAuditPort,
  type TransactionalProvisioningJournal,
  type TenantProvisioningTransactionCoordinator,
  type TenantProvisioningTransactionScope,
} from "@/lib/tenancy/provisioning";

const OPERATOR_ID = "50000000-0000-4000-8000-000000000001";
const OWNER_ID = "50000000-0000-4000-8000-000000000002";
const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000099";
const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const POLICY_ID = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000001";
const ROLE_BINDING_ID = "40000000-0000-4000-8000-000000000001";
const MISMATCHED_ROLE_BINDING_ID = "40000000-0000-4000-8000-000000000099";
const REQUEST_ID = "60000000-0000-4000-8000-000000000001";
const AUDIT_ID = "70000000-0000-4000-8000-000000000001";

const openDatabases: Database.Database[] = [];

type FailureStage = "tenant" | "workspace" | "policy" | "membership" | "role_binding" | "audit";
type ReturnedRecordFault = "tenant_id" | "workspace_tenant" | "policy_tenant" | "membership_tenant" | "role_binding_tenant";
type ReplayFault =
  | "wrong_key"
  | "wrong_request_id"
  | "malformed_tenant_id"
  | "malformed_workspace_id"
  | "missing_blocker"
  | "extra_blocker"
  | "inconsistent_workspace_status"
  | "wrong_fixed_role"
  | "wrong_fixed_state"
  | "missing_result";

class FakeJournal implements TransactionalProvisioningJournal {
  readonly records: Map<string, ProvisioningJournalRecord>;
  readonly directUseCalls: { find: number; reserve: number; complete: number } = { find: 0, reserve: 0, complete: 0 };
  forcedRecord: ProvisioningJournalRecord | null = null;
  reservationOutcome: Awaited<ReturnType<TransactionalProvisioningJournal["reserve"]>> | null = null;
  reserveCalls = 0;
  completeCalls = 0;

  constructor(
    records = new Map<string, ProvisioningJournalRecord>(),
    private readonly callbackScoped = false,
  ) {
    this.records = records;
  }

  async findByIdempotencyKeyHash(idempotencyKeyHashRef: string): Promise<ProvisioningJournalRecord | null> {
    if (!this.callbackScoped) this.directUseCalls.find += 1;
    if (this.forcedRecord) return clone(this.forcedRecord);
    return clone(this.records.get(idempotencyKeyHashRef) ?? null);
  }

  async reserve(input: Parameters<TransactionalProvisioningJournal["reserve"]>[0]): Promise<Awaited<ReturnType<TransactionalProvisioningJournal["reserve"]>>> {
    if (!this.callbackScoped) this.directUseCalls.reserve += 1;
    this.reserveCalls += 1;
    if (this.reservationOutcome) return clone(this.reservationOutcome);
    this.records.set(input.idempotencyKeyHashRef, {
      ...input,
      state: "in_progress",
    });
    return { state: "reserved" };
  }

  async complete(input: Parameters<TransactionalProvisioningJournal["complete"]>[0]): Promise<void> {
    if (!this.callbackScoped) this.directUseCalls.complete += 1;
    this.completeCalls += 1;
    this.records.set(input.idempotencyKeyHashRef, {
      idempotencyKeyHashRef: input.idempotencyKeyHashRef,
      inputHashRef: input.inputHashRef,
      requestId: input.requestId,
      state: "completed",
      result: clone(input.result),
    });
  }

  forTransaction(): FakeJournal {
    const transaction = new FakeJournal(clone(this.records), true);
    transaction.forcedRecord = clone(this.forcedRecord);
    transaction.reservationOutcome = clone(this.reservationOutcome);
    return transaction;
  }

  commitFrom(transaction: FakeJournal): void {
    this.records.clear();
    for (const [key, value] of transaction.records) this.records.set(key, clone(value));
    this.reserveCalls += transaction.reserveCalls;
    this.completeCalls += transaction.completeCalls;
  }
}

class FakeAudit implements TransactionalProvisioningAuditPort {
  readonly events: TenantProvisioningAuditEvent[] = [];
  directUseCalls = 0;
  fail = false;
  constructor(private readonly callbackScoped = false) {}

  async append(event: TenantProvisioningAuditEvent): Promise<void> {
    if (!this.callbackScoped) this.directUseCalls += 1;
    if (this.fail) throw new Error("synthetic audit failure");
    this.events.push(clone(event));
  }

  forTransaction(): FakeAudit {
    const transaction = new FakeAudit(true);
    transaction.fail = this.fail;
    return transaction;
  }

  commitFrom(transaction: FakeAudit): void {
    this.events.push(...transaction.events.map(clone));
  }
}

class FakeTransactionCoordinator implements TenantProvisioningTransactionCoordinator {
  scopeRepository: TenantQueryRepository | null = null;
  scopeJournal: TransactionalProvisioningJournal | null = null;
  scopeAudit: TransactionalProvisioningAuditPort | null = null;
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private readonly repository: TenantQueryRepository,
    private readonly durableJournal: FakeJournal,
    private readonly durableAudit: FakeAudit,
  ) {}

  async run<T>(callback: (scope: TenantProvisioningTransactionScope) => Promise<T>): Promise<T> {
    let resolveResult!: (value: T | PromiseLike<T>) => void;
    let rejectResult!: (reason?: unknown) => void;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    const execute = async (): Promise<void> => {
      try {
        resolveResult(await this.runOne(callback));
      } catch (error) {
        rejectResult(error);
      }
    };
    this.queue = this.queue.then(execute, execute);
    return result;
  }

  private async runOne<T>(callback: (scope: TenantProvisioningTransactionScope) => Promise<T>): Promise<T> {
    const transactionJournal = this.durableJournal.forTransaction();
    const transactionAudit = this.durableAudit.forTransaction();
    const result = await this.repository.withTransaction((transactionRepository) => {
      const scopedRepository = { ...transactionRepository };
      this.scopeRepository = scopedRepository;
      this.scopeJournal = transactionJournal;
      this.scopeAudit = transactionAudit;
      return callback({ repository: scopedRepository, journal: transactionJournal, audit: transactionAudit });
    });
    this.durableJournal.commitFrom(transactionJournal);
    this.durableAudit.commitFrom(transactionAudit);
    return result;
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createDb(): { database: Database.Database; client: DbClient } {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  database.exec(SCHEMA_SQL);
  openDatabases.push(database);
  const client: DbClient = {
    prepare(query) {
      const statement = database.prepare(query);
      return {
        all: async <T = Record<string, unknown>>(...params: unknown[]) => statement.all(...params) as T[],
        get: async <T = Record<string, unknown>>(...params: unknown[]) => statement.get(...params) as T | undefined,
        run: async (...params: unknown[]) => ({ changes: statement.run(...params).changes }),
      };
    },
    exec: async (query) => {
      database.exec(query);
    },
    withTransaction: async <T>(fn: () => Promise<T>): Promise<T> => {
      database.exec("BEGIN");
      try {
        const result = await fn();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { database, client };
}

function createTransactionalRepository(
  client: DbClient,
  failureStage: { value: FailureStage | undefined },
  returnedRoleBindingId?: string,
  returnedRecordFault?: ReturnedRecordFault,
): TenantQueryRepository {
  const base = createTenantQueryRepository(client);
  const repository: TenantQueryRepository = {
    ...base,
    createTenant: async (input) => {
      if (failureStage.value === "tenant") throw new Error("synthetic tenant failure");
      const tenant = await base.createTenant(input);
      return returnedRecordFault === "tenant_id" ? { ...tenant, id: OTHER_TENANT_ID } : tenant;
    },
    createWorkspace: async (tenantId, input) => {
      if (failureStage.value === "workspace") throw new Error("synthetic workspace failure");
      const workspace = await base.createWorkspace(tenantId, input);
      return returnedRecordFault === "workspace_tenant" ? { ...workspace, tenantId: OTHER_TENANT_ID } : workspace;
    },
    createTenantPolicy: async (tenantId, input) => {
      if (failureStage.value === "policy") throw new Error("synthetic policy failure");
      const policy = await base.createTenantPolicy(tenantId, input);
      return returnedRecordFault === "policy_tenant" ? { ...policy, tenantId: OTHER_TENANT_ID } : policy;
    },
    createMembership: async (tenantId, input) => {
      if (failureStage.value === "membership") throw new Error("synthetic membership failure");
      const membership = await base.createMembership(tenantId, input);
      return returnedRecordFault === "membership_tenant" ? { ...membership, tenantId: OTHER_TENANT_ID } : membership;
    },
    createRoleBinding: async (tenantId, input) => {
      if (failureStage.value === "role_binding") throw new Error("synthetic role binding failure");
      const roleBinding = await base.createRoleBinding(tenantId, input);
      return returnedRecordFault === "role_binding_tenant"
        ? { ...roleBinding, tenantId: OTHER_TENANT_ID }
        : returnedRoleBindingId
          ? { ...roleBinding, id: returnedRoleBindingId }
          : roleBinding;
    },
    withTransaction: async <T>(fn: (transactionRepository: TenantQueryRepository) => Promise<T>): Promise<T> =>
      client.withTransaction!(() => fn(repository)),
  };
  return repository;
}

function createIdFactory(): ProvisioningIdFactory {
  const ids = new Map([
    ["request", REQUEST_ID],
    ["tenant", TENANT_ID],
    ["workspace", WORKSPACE_ID],
    ["policy", POLICY_ID],
    ["membership", MEMBERSHIP_ID],
    ["role_binding", ROLE_BINDING_ID],
    ["audit", AUDIT_ID],
  ] as const);
  return { next: (kind) => ids.get(kind)! };
}

function command(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organizationName: "  Apex Materials  ",
    organizationSlug: "  apex-materials  ",
    requestedPolicyVersion: "policy-v1",
    idempotencyKey: "tenant-create-01",
    correlationId: "correlation-01",
    ownerIdentityId: OWNER_ID,
    locale: "en-US",
    timezone: "UTC",
    ...overrides,
  };
}

function workspaceCommand(): Record<string, unknown> {
  return command({
    workspace: {
      workspaceName: " North America Industrial ",
      workspaceSlug: " north-america-industrial ",
    },
  });
}

function setup(
  failureStage?: FailureStage,
  returnedRoleBindingId?: string,
  returnedRecordFault?: ReturnedRecordFault,
): ReturnType<typeof createSetup> {
  return createSetup(failureStage, returnedRoleBindingId, returnedRecordFault);
}

function createSetup(
  failureStage?: FailureStage,
  returnedRoleBindingId?: string,
  returnedRecordFault?: ReturnedRecordFault,
) {
  const { database, client } = createDb();
  const journal = new FakeJournal();
  const audit = new FakeAudit();
  const failureControl = { value: failureStage };
  const repository = createTransactionalRepository(client, failureControl, returnedRoleBindingId, returnedRecordFault);
  if (failureStage === "audit") audit.fail = true;
  const transactionCoordinator = new FakeTransactionCoordinator(repository, journal, audit);
  const service = createTenantProvisioningService({
    idFactory: createIdFactory(),
    transactionCoordinator,
    operatorIdentityId: OPERATOR_ID,
  });
  return { database, repository, journal, audit, service, transactionCoordinator, failureControl };
}

afterEach(() => {
  while (openDatabases.length > 0) openDatabases.pop()?.close();
});

describe("tenant provisioning service", () => {
  it("creates a tenant-wide foundation with exact pending and fail-closed defaults", async () => {
    const { repository, journal, audit, service } = setup();
    const result = await service.provisionTenant(command());

    expect(result).toMatchObject({
      resultCode: TENANT_PROVISIONING_RESULT_CODE,
      requestId: REQUEST_ID,
      tenantId: TENANT_ID,
      workspaceId: null,
      policyId: POLICY_ID,
      membershipId: MEMBERSHIP_ID,
      roleBindingId: ROLE_BINDING_ID,
      workflowState: "provisioning",
      tenantStatus: "provisioning",
      workspaceStatus: null,
      membershipStatus: "pending",
      role: "owner",
      roleBindingStatus: "pending",
      activationState: "blocked",
      activationBlockers: TENANT_PROVISIONING_ACTIVATION_BLOCKERS,
    });
    expect(await repository.getTenant(TENANT_ID)).toMatchObject({
      id: TENANT_ID,
      slug: "apex-materials",
      name: "Apex Materials",
      status: "provisioning",
      locale: "en-US",
      timezone: "UTC",
    });
    expect(await repository.getCurrentTenantPolicy(TENANT_ID)).toMatchObject({
      id: POLICY_ID,
      tenantId: TENANT_ID,
      version: 1,
      locale: "en-US",
      timezone: "UTC",
      exportRetentionDays: 7,
      operationalLogRetentionDays: 30,
      rawSourceRetentionDays: 180,
      contactFreshnessDays: 180,
      primaryDeleteWithinDays: 30,
      backupExpireWithinDays: 35,
      tombstoneRetentionYears: 7,
      aiProcessingEnabled: false,
      sourceResearchEnabled: false,
      contactResearchEnabled: false,
      outreachDraftingEnabled: false,
      copyExportEnabled: false,
      autonomousSendEnabled: false,
      requireSourcePlanApproval: true,
      requireKnowledgeReview: true,
      requireIcpReview: true,
      requireLeadPlayReview: true,
      requireContactReview: true,
      requireOutreachReview: true,
    });
    expect(await repository.getMembership(TENANT_ID, MEMBERSHIP_ID)).toMatchObject({
      authIdentityId: OWNER_ID,
      workspaceId: null,
      status: "pending",
    });
    expect(await repository.getCurrentRoleBinding(TENANT_ID, MEMBERSHIP_ID)).toMatchObject({
      role: "owner",
      revokedAt: null,
      reasonCode: "initial_provisioning",
    });
    expect(journal.reserveCalls).toBe(1);
    expect(journal.completeCalls).toBe(1);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]).toMatchObject({
      eventType: TENANT_PROVISIONING_AUDIT_EVENT,
      requestId: REQUEST_ID,
      correlationId: "correlation-01",
      actorLayer: "system",
      actorIdentityId: OPERATOR_ID,
      tenantId: TENANT_ID,
      workspaceId: null,
      createdIds: {
        tenantId: TENANT_ID,
        workspaceId: null,
        policyId: POLICY_ID,
        membershipId: MEMBERSHIP_ID,
        roleBindingId: ROLE_BINDING_ID,
      },
      policyVersion: "policy-v1",
      priorWorkflowState: "operator_approved",
      nextWorkflowState: "provisioning",
      resultCode: TENANT_PROVISIONING_RESULT_CODE,
    });
    expect(audit.events[0]).not.toHaveProperty("idempotencyKey");
  });

  it("creates the optional default workspace in the same tenant-wide foundation transaction", async () => {
    const { repository, service } = setup();
    const result = await service.provisionTenant(workspaceCommand());

    expect(result.workspaceId).toBe(WORKSPACE_ID);
    expect(await repository.getWorkspace(TENANT_ID, WORKSPACE_ID)).toMatchObject({
      tenantId: TENANT_ID,
      slug: "north-america-industrial",
      name: "North America Industrial",
      status: "provisioning",
    });
    expect(await repository.getMembership(TENANT_ID, MEMBERSHIP_ID)).toMatchObject({
      workspaceId: WORKSPACE_ID,
      status: "pending",
    });
  });

  it("rolls back when the repository returns a role binding ID different from the requested generated ID", async () => {
    const { database, journal, audit, service } = setup(undefined, MISMATCHED_ROLE_BINDING_ID);
    await expect(service.provisionTenant(command())).rejects.toBeInstanceOf(TenantProvisioningRetryableError);
    expect(foundationCounts(database)).toEqual({ tenants: 0, workspaces: 0, policies: 0, memberships: 0, roles: 0 });
    expect(journal.records.size).toBe(0);
    expect(audit.events).toHaveLength(0);
  });

  it.each<ReturnedRecordFault>([
    "tenant_id",
    "workspace_tenant",
    "policy_tenant",
    "membership_tenant",
    "role_binding_tenant",
  ])("rolls back when the repository returns an unexpected %s", async (returnedRecordFault) => {
    const { database, journal, audit, service } = setup(undefined, undefined, returnedRecordFault);
    await expect(service.provisionTenant(workspaceCommand())).rejects.toBeInstanceOf(TenantProvisioningRetryableError);
    expect(foundationCounts(database)).toEqual({ tenants: 0, workspaces: 0, policies: 0, memberships: 0, roles: 0 });
    expect(journal.records.size).toBe(0);
    expect(audit.events).toHaveLength(0);
  });

  it("uses only callback-scoped repository, journal, and audit ports", async () => {
    const { audit, journal, repository, service, transactionCoordinator } = setup();
    await service.provisionTenant(command());

    expect(transactionCoordinator.scopeRepository).not.toBe(repository);
    expect(transactionCoordinator.scopeJournal).not.toBe(journal);
    expect(transactionCoordinator.scopeAudit).not.toBe(audit);
    expect(journal.directUseCalls).toEqual({ find: 0, reserve: 0, complete: 0 });
    expect(audit.directUseCalls).toBe(0);
  });

  it("replays the exact completed result without foundation writes or duplicate audit", async () => {
    const { database, journal, audit, service } = setup();
    const first = await service.provisionTenant(command());
    const countsBefore = foundationCounts(database);
    const reserveCallsBefore = journal.reserveCalls;
    const second = await service.provisionTenant({
      ...command(),
      organizationName: "Apex Materials",
      correlationId: "correlation-retry",
    });

    expect(second).toEqual(first);
    expect(foundationCounts(database)).toEqual(countsBefore);
    expect(journal.reserveCalls).toBe(reserveCallsBefore);
    expect(journal.completeCalls).toBe(1);
    expect(audit.events).toHaveLength(1);
  });

  it("returns the canonical conflict for the same key with a different normalized material hash", async () => {
    const { service } = setup();
    await service.provisionTenant(command());

    await expect(service.provisionTenant(command({ organizationName: "Harbor Ledger" })))
      .rejects.toBeInstanceOf(TenantProvisioningIdempotencyConflictError);
    await expect(service.provisionTenant(command({ ownerIdentityId: "50000000-0000-4000-8000-000000000003" })))
      .rejects.toMatchObject({ code: "PROVISIONING_IDEMPOTENCY_CONFLICT" });
  });

  it.each<FailureStage>(["tenant", "workspace", "policy", "membership", "role_binding"])(
    "rolls back all foundation rows when the %s stage fails",
    async (failureStage) => {
      const { database, journal, audit, service } = setup(failureStage);
      await expect(service.provisionTenant(failureStage === "tenant" ? command() : workspaceCommand()))
        .rejects.toBeInstanceOf(TenantProvisioningRetryableError);
      expect(foundationCounts(database)).toEqual({ tenants: 0, workspaces: 0, policies: 0, memberships: 0, roles: 0 });
      expect(journal.records.size).toBe(0);
      expect(audit.events).toHaveLength(0);
    },
  );

  it("rolls back all foundation rows and reservation on audit failure, then retries cleanly", async () => {
    const { database, journal, audit, service, failureControl } = setup("audit");
    await expect(service.provisionTenant(workspaceCommand())).rejects.toBeInstanceOf(TenantProvisioningRetryableError);
    expect(foundationCounts(database)).toEqual({ tenants: 0, workspaces: 0, policies: 0, memberships: 0, roles: 0 });
    expect(journal.records.size).toBe(0);
    expect(audit.events).toHaveLength(0);

    failureControl.value = undefined;
    audit.fail = false;
    await expect(service.provisionTenant(workspaceCommand())).resolves.toMatchObject({ tenantId: TENANT_ID });
    expect(journal.records.size).toBe(1);
    expect(audit.events).toHaveLength(1);
  });

  it("exposes the transaction-scoped in-progress state as a typed privacy-safe failure", async () => {
    const setupState = setup();
    const inputHashRef = canonicalInputHash();
    const keyHashRef = canonicalIdempotencyKeyHash();
    setupState.journal.forcedRecord = {
      idempotencyKeyHashRef: keyHashRef,
      inputHashRef,
      requestId: REQUEST_ID,
      state: "in_progress",
    };
    await expect(setupState.service.provisionTenant(command())).rejects.toMatchObject({ code: "PROVISIONING_IN_PROGRESS" });
  });

  it.each<ReplayFault>([
    "wrong_key",
    "wrong_request_id",
    "malformed_tenant_id",
    "malformed_workspace_id",
    "missing_blocker",
    "extra_blocker",
    "inconsistent_workspace_status",
    "wrong_fixed_role",
    "wrong_fixed_state",
    "missing_result",
  ])("rejects malformed completed replay records (%s) with a stable retryable error", async (replayFault) => {
    const seed = setup();
    await seed.service.provisionTenant(command());
    const validRecord = seed.journal.records.get(canonicalIdempotencyKeyHash());
    expect(validRecord).toBeDefined();

    const candidate = setup();
    candidate.journal.forcedRecord = malformedReplayRecord(clone(validRecord!), replayFault);
    await expect(candidate.service.provisionTenant(command())).rejects.toBeInstanceOf(TenantProvisioningRetryableError);
  });

  it("fails closed when the mandatory transaction coordinator is missing", async () => {
    expect(() => createTenantProvisioningService({
      idFactory: createIdFactory(),
      transactionCoordinator: undefined as never,
      operatorIdentityId: OPERATOR_ID,
    })).toThrow(TenantProvisioningRetryableError);
  });

  it("maps adapter-level same-key reservation outcomes to in-progress and conflict", async () => {
    const inProgress = setup();
    inProgress.journal.reservationOutcome = { state: "in_progress" };
    await expect(inProgress.service.provisionTenant(command())).rejects.toMatchObject({ code: "PROVISIONING_IN_PROGRESS" });

    const conflict = setup();
    conflict.journal.reservationOutcome = { state: "conflict" };
    await expect(conflict.service.provisionTenant(command())).rejects.toMatchObject({ code: "PROVISIONING_IDEMPOTENCY_CONFLICT" });
  });

  it("maps concurrent same-key adapter lock outcomes without creating foundation rows", async () => {
    const concurrent = setup();
    concurrent.journal.reservationOutcome = { state: "in_progress" };
    const outcomes = await Promise.allSettled([
      concurrent.service.provisionTenant(command()),
      concurrent.service.provisionTenant(command()),
    ]);

    expect(outcomes.every((outcome) => outcome.status === "rejected" && outcome.reason.code === "PROVISIONING_IN_PROGRESS")).toBe(true);
    expect(foundationCounts(concurrent.database)).toEqual({ tenants: 0, workspaces: 0, policies: 0, memberships: 0, roles: 0 });
  });

  it("validates the internal command and has no public self-service export or invitation side effect", async () => {
    const { service, audit } = setup();
    await expect(service.provisionTenant({ organizationName: "public caller" }))
      .rejects.toThrow("The provisioning command is invalid.");
    expect(audit.events).toHaveLength(0);

    const source = readFileSync(join(process.cwd(), "src/lib/tenancy/provisioning.ts"), "utf8");
    expect(source).not.toContain("tenantProvisioningRequestIntakeSchema");
    expect(source).not.toMatch(/src\/app\/api|export\s+async\s+function\s+(GET|POST|PUT|DELETE)/);
    expect(source).not.toMatch(/invitationToken|rawToken|password|ownerEmail|ownerContact/);
  });
});

function foundationCounts(database: Database.Database): Record<string, number> {
  return {
    tenants: (database.prepare("SELECT COUNT(*) AS count FROM tenants").get() as { count: number }).count,
    workspaces: (database.prepare("SELECT COUNT(*) AS count FROM workspaces").get() as { count: number }).count,
    policies: (database.prepare("SELECT COUNT(*) AS count FROM tenant_policies").get() as { count: number }).count,
    memberships: (database.prepare("SELECT COUNT(*) AS count FROM tenant_memberships").get() as { count: number }).count,
    roles: (database.prepare("SELECT COUNT(*) AS count FROM tenant_role_bindings").get() as { count: number }).count,
  };
}

function canonicalInputHash(): string {
  return createHash("sha256").update(JSON.stringify({
    organizationName: "Apex Materials",
    organizationSlug: "apex-materials",
    requestedPolicyVersion: "policy-v1",
    locale: "en-US",
    timezone: "UTC",
    ownerIdentityId: OWNER_ID,
    workspace: null,
  }), "utf8").digest("hex");
}

function canonicalIdempotencyKeyHash(): string {
  return createHash("sha256").update("tenant-create-01", "utf8").digest("hex");
}

function malformedReplayRecord(record: ProvisioningJournalRecord, fault: ReplayFault): ProvisioningJournalRecord {
  const mutable = record as ProvisioningJournalRecord & { result?: TenantProvisioningResult };
  const result = mutable.result;
  if (!result && fault !== "missing_result") throw new Error("expected completed replay result");
  switch (fault) {
    case "wrong_key":
      Object.assign(mutable, { idempotencyKeyHashRef: "f".repeat(64) });
      break;
    case "wrong_request_id":
      Object.assign(mutable, { requestId: OTHER_TENANT_ID });
      break;
    case "malformed_tenant_id":
      Object.assign(result!, { tenantId: "not-an-id" });
      break;
    case "malformed_workspace_id":
      Object.assign(result!, { workspaceId: "not-a-workspace", workspaceStatus: "provisioning" });
      break;
    case "missing_blocker":
      Object.assign(result!, { activationBlockers: result!.activationBlockers.slice(0, -1) });
      break;
    case "extra_blocker":
      Object.assign(result!, { activationBlockers: [...result!.activationBlockers, "OWNER_ACCEPTANCE_REQUIRED"] });
      break;
    case "inconsistent_workspace_status":
      Object.assign(result!, { workspaceStatus: "provisioning" });
      break;
    case "wrong_fixed_role":
      Object.assign(result!, { role: "admin" });
      break;
    case "wrong_fixed_state":
      Object.assign(result!, { tenantStatus: "active", activationState: "ready" });
      break;
    case "missing_result":
      delete (mutable as unknown as { result?: TenantProvisioningResult }).result;
      break;
  }
  return mutable;
}
