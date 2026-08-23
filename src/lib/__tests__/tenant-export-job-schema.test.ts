import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runSqliteMigrations } from "@/lib/db";
import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  isArtifactUsableAt,
  isTransitionAllowed,
  TENANT_EXPORT_TERMINAL_STATUSES,
  tenantExportArtifactStorageRefSchema,
  tenantExportJobCreationInputSchema,
  tenantExportJobSchema,
  tenantExportTransitionMap,
} from "@/lib/tenancy/schemas";
import {
  TENANT_EXPORT_JOB_OPERATION,
  TENANT_EXPORT_JOB_STATUSES,
  TENANT_EXPORT_MAX_ARTIFACT_AGE_SECONDS,
} from "@/lib/tenancy/types";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "20000000-0000-4000-8000-000000000002";
const MEMBERSHIP_C = "20000000-0000-4000-8000-000000000003";
const MEMBERSHIP_D = "20000000-0000-4000-8000-000000000004";
const REQUESTER_A = "30000000-0000-4000-8000-000000000001";
const REQUESTER_B = "30000000-0000-4000-8000-000000000002";
const SUPPORT_ACTOR_MISSING_PERMISSION = "30000000-0000-4000-8000-000000000003";
const SUPPORT_ACTOR_WRONG_WORKSPACE = "30000000-0000-4000-8000-000000000004";
const SUPPORT_ACTOR_OTHER = "30000000-0000-4000-8000-000000000005";
const SUPPORT_ACTOR_CLEANUP = "30000000-0000-4000-8000-000000000008";
const AUDIT_A = "40000000-0000-4000-8000-000000000001";
const JOB_A = "50000000-0000-4000-8000-000000000001";
const JOB_B = "50000000-0000-4000-8000-000000000002";
const JOB_C = "50000000-0000-4000-8000-000000000003";
const JOB_D = "50000000-0000-4000-8000-000000000004";
const SUPPORT_GRANT_A = "60000000-0000-4000-8000-000000000001";
const SUPPORT_GRANT_B = "60000000-0000-4000-8000-000000000002";
const SUPPORT_GRANT_C = "60000000-0000-4000-8000-000000000003";
const SUPPORT_GRANT_D = "60000000-0000-4000-8000-000000000004";
const SUPPORT_GRANT_E = "60000000-0000-4000-8000-000000000005";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);
const CREATED = "2026-07-27T00:00:00.000Z";
const SNAPSHOT = "2026-07-27T00:01:00.000Z";
// The SQLite transition guard evaluates its real clock, so this fixture must not age past expiry.
const ARTIFACT_CREATED_MILLISECONDS = Date.now();
const ARTIFACT_CREATED = new Date(ARTIFACT_CREATED_MILLISECONDS).toISOString();
const EXPIRY = new Date(ARTIFACT_CREATED_MILLISECONDS + TENANT_EXPORT_MAX_ARTIFACT_AGE_SECONDS * 1000).toISOString();
const BEFORE_EXPIRY = new Date(Date.parse(EXPIRY) - 1).toISOString();
const AFTER_MAXIMUM_EXPIRY = new Date(Date.parse(EXPIRY) + 1).toISOString();

function database(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  return db;
}

function tenant(db: Database.Database, id: string, slug: string): void {
  db.prepare("INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?)").run(id, slug, `${slug} tenant`);
}

function workspace(db: Database.Database, id: string, tenantId: string): void {
  db.prepare("INSERT INTO workspaces (id, tenant_id, slug, name) VALUES (?, ?, ?, ?)").run(id, tenantId, `shared-${id.slice(-3)}`, `${tenantId} workspace`);
}

function membership(
  db: Database.Database,
  id: string,
  tenantId: string,
  identityId: string,
  workspaceId: string | null = null,
  role: "owner" | "admin" | "analyst_read_only" | null = "owner",
): void {
  db.prepare("INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status) VALUES (?, ?, ?, ?, 'active')").run(id, tenantId, identityId, workspaceId);
  if (role !== null) {
    db.prepare("INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role) VALUES (?, ?, ?, ?)")
      .run(id.replace(/^2/, "7"), tenantId, id, role);
  }
}

function artifactRef(jobId = JOB_A, tenantId = TENANT_A): string {
  return `tenants/${tenantId}/exports/${jobId}/artifact.csv`;
}

function insertJob(db: Database.Database, values: Record<string, unknown> = {}): void {
  const row = {
    id: JOB_A,
    tenant_id: TENANT_A,
    workspace_id: null,
    operation: TENANT_EXPORT_JOB_OPERATION,
    requester_auth_identity_id: REQUESTER_A,
    requester_membership_id: MEMBERSHIP_A,
    support_access_grant_id: null,
    status: "requested",
    scope_hash: HASH_A,
    input_hash: HASH_B,
    idempotency_key_hash: HASH_C,
    policy_version: "policy-v1",
    manifest_version: "d014-v1",
    schema_version: "tenant-export-job-v1",
    requested_format: "csv",
    correlation_id: "corr-export-001",
    audit_event_id: AUDIT_A,
    created_at: CREATED,
    updated_at: CREATED,
    ...values,
  };
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO tenant_export_jobs (${columns.join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`).run(row);
}

function readJob(db: Database.Database, id = JOB_A): Record<string, unknown> {
  const row = db.prepare("SELECT * FROM tenant_export_jobs WHERE id = ?").get(id) as Record<string, unknown>;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    workspaceId: row.workspace_id,
    operation: row.operation,
    requesterAuthIdentityId: row.requester_auth_identity_id,
    requesterMembershipId: row.requester_membership_id,
    supportAccessGrantId: row.support_access_grant_id,
    status: row.status,
    scopeHash: row.scope_hash,
    inputHash: row.input_hash,
    idempotencyKeyHash: row.idempotency_key_hash,
    policyVersion: row.policy_version,
    manifestVersion: row.manifest_version,
    schemaVersion: row.schema_version,
    requestedFormat: row.requested_format,
    snapshotAt: row.snapshot_at,
    artifactStorageRef: row.artifact_storage_ref,
    artifactChecksumSha256: row.artifact_checksum_sha256,
    includedCount: row.included_count,
    excludedCount: row.excluded_count,
    redactedCount: row.redacted_count,
    artifactCreatedAt: row.artifact_created_at,
    expiresAt: row.expires_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    nextRetryAt: row.next_retry_at,
    leaseOwnerHash: row.lease_owner_hash,
    leaseGeneration: row.lease_generation,
    leaseAcquiredAt: row.lease_acquired_at,
    leaseHeartbeatAt: row.lease_heartbeat_at,
    leaseExpiresAt: row.lease_expires_at,
    correlationId: row.correlation_id,
    auditEventId: row.audit_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function artifactValues(jobId = JOB_A): Record<string, unknown> {
  return {
    artifact_storage_ref: artifactRef(jobId),
    artifact_checksum_sha256: HASH_D,
    included_count: 10,
    excluded_count: 2,
    redacted_count: 1,
    artifact_created_at: ARTIFACT_CREATED,
    expires_at: EXPIRY,
  };
}

function approvedSupportGrant(
  db: Database.Database,
  id: string,
  actorId: string,
  permission: "data:export" | "tenant:read",
  workspaceId: string | null,
  startsAt: string,
  expiresAt: string,
  createdAt: string,
): void {
  db.transaction(() => {
    db.prepare(`INSERT INTO support_access_grants (
      id, tenant_id, workspace_id, support_actor_auth_identity_id, requested_by_auth_identity_id,
      reason_code, reason, starts_at, expires_at, correlation_id, audit_event_id,
      permission_anchor, data_class_anchor, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'diagnostic-review', 'test support grant', ?, ?, ?, ?, ?, 'tenant_metadata', ?, ?)`)
      .run(id, TENANT_A, workspaceId, actorId, REQUESTER_A, startsAt, expiresAt, `corr-${id.slice(-3)}`, AUDIT_A, permission, createdAt, createdAt);
    db.prepare("INSERT INTO support_access_grant_permissions (grant_id, permission) VALUES (?, ?)").run(id, permission);
    db.prepare("INSERT INTO support_access_grant_data_classes (grant_id, data_class) VALUES (?, 'tenant_metadata')").run(id);
    db.prepare("UPDATE support_access_grants SET state = 'approved', approved_by_auth_identity_id = ?, approved_at = ? WHERE id = ?")
      .run(REQUESTER_A, createdAt, id);
  })();
}

function expiredSupportGrant(db: Database.Database): void {
  membership(db, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
  approvedSupportGrant(db, SUPPORT_GRANT_A, REQUESTER_B, "data:export", null, "2019-01-01T00:00:00.000Z", "2019-01-02T00:00:00.000Z", "2019-01-01T00:00:00.000Z");
}

describe("tenant export job schema", () => {
  it("executes the complete SQLite schema on a fresh database without SQL text replacement", () => {
    const db = new Database(":memory:");
    try {
      db.pragma("foreign_keys = ON");
      expect(() => db.exec(SCHEMA_SQL)).not.toThrow();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tenant_export_jobs'").get()).toEqual({ name: "tenant_export_jobs" });
    } finally { db.close(); }
  });

  it("creates the additive schema, keeps legacy settings, and has the fixed vocabulary/indexes", () => {
    const db = new Database(":memory:");
    try {
      db.pragma("foreign_keys = ON");
      db.exec("CREATE TABLE settings (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)");
      db.prepare("INSERT INTO settings VALUES (1, 'legacy')").run();
      runSqliteMigrations(db);
      db.exec(SCHEMA_SQL);
      expect(db.prepare("SELECT marker FROM settings WHERE id = 1").get()).toEqual({ marker: "legacy" });
      const columns = (db.prepare("PRAGMA table_info(tenant_export_jobs)").all() as Array<{ name: string }>).map(({ name }) => name);
      expect(columns).toEqual([
        "id", "tenant_id", "workspace_id", "operation", "requester_auth_identity_id", "requester_membership_id", "support_access_grant_id", "status",
        "scope_hash", "input_hash", "idempotency_key_hash", "policy_version", "manifest_version", "schema_version", "requested_format", "snapshot_at",
        "artifact_storage_ref", "artifact_checksum_sha256", "included_count", "excluded_count", "redacted_count", "artifact_created_at", "expires_at",
        "error_code", "error_message", "retry_count", "max_retries", "next_retry_at", "lease_owner_hash", "lease_generation", "lease_acquired_at",
        "lease_heartbeat_at", "lease_expires_at", "correlation_id", "audit_event_id", "created_at", "updated_at",
      ]);
      expect((db.prepare("PRAGMA index_list(tenant_export_jobs)").all() as Array<{ name: string }>).map(({ name }) => name)).toEqual(expect.arrayContaining([
        "idx_tenant_export_jobs_tenant_history", "idx_tenant_export_jobs_queue", "idx_tenant_export_jobs_lease", "idx_tenant_export_jobs_expiry",
      ]));
      expect(columns.some((column) => /credential|password|secret|raw|bytes/i.test(column))).toBe(false);
    } finally { db.close(); }
  });

  it("allows only the exact requested initial state on INSERT", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "initial-state-a"); membership(db, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
      for (const values of [
        { status: "snapshotting" },
        { status: "released" },
        { status: "retry_wait" },
        { status: "failed", error_code: "EXPORT_RETRYABLE", error_message: "retry" },
        { snapshot_at: SNAPSHOT },
        { retry_count: 1 },
        { lease_generation: 1 },
      ]) {
        expect(() => insertJob(db, { id: JOB_B, idempotency_key_hash: HASH_D, ...values })).toThrow(/initial state|requested|constraint/i);
      }
      expect(db.prepare("SELECT COUNT(*) AS count FROM tenant_export_jobs").get()).toEqual({ count: 0 });
      expect(tenantExportJobCreationInputSchema.safeParse({
        tenantId: TENANT_A, requesterAuthIdentityId: REQUESTER_A, requesterMembershipId: MEMBERSHIP_A,
        status: "released", scopeHash: HASH_A, inputHash: HASH_B, idempotencyKeyHash: HASH_C, policyVersion: "policy-v1",
        requestedFormat: "csv", correlationId: "corr-export-001", auditEventId: AUDIT_A,
      }).success).toBe(false);
    } finally { db.close(); }
  });

  it("proves exact tenant/workspace requester scope and does not make IDs authoritative in Zod", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "export-a"); tenant(db, TENANT_B, "export-b");
      workspace(db, WORKSPACE_A, TENANT_A); workspace(db, WORKSPACE_B, TENANT_B);
      membership(db, MEMBERSHIP_A, TENANT_A, REQUESTER_A, WORKSPACE_A);
      membership(db, MEMBERSHIP_B, TENANT_B, REQUESTER_B, WORKSPACE_B);
      expect(() => insertJob(db, { workspace_id: WORKSPACE_B })).toThrow(/FOREIGN KEY|same-tenant|same-scope|constraint/i);
      expect(() => insertJob(db, { requester_membership_id: MEMBERSHIP_B, requester_auth_identity_id: REQUESTER_B })).toThrow(/FOREIGN KEY|same-tenant|same-scope|constraint/i);
      const parsed = tenantExportJobCreationInputSchema.safeParse({
        tenantId: TENANT_A, requesterAuthIdentityId: REQUESTER_A, requesterMembershipId: MEMBERSHIP_A,
        scopeHash: HASH_A, inputHash: HASH_B, idempotencyKeyHash: HASH_C, policyVersion: "policy-v1",
        requestedFormat: "csv", correlationId: "corr-export-001", auditEventId: AUDIT_A,
      });
      expect(parsed.success).toBe(true);
      expect(tenantExportJobCreationInputSchema.safeParse({
        tenantId: TENANT_A, requesterAuthIdentityId: REQUESTER_A, requesterMembershipId: MEMBERSHIP_A,
        supportAccessGrantId: "60000000-0000-4000-8000-000000000001", scopeHash: HASH_A, inputHash: HASH_B,
        idempotencyKeyHash: HASH_C, policyVersion: "policy-v1", requestedFormat: "csv", correlationId: "corr-export-001", auditEventId: AUDIT_A,
      }).success).toBe(false);
      expect(tenantExportJobCreationInputSchema.safeParse({
        tenantId: TENANT_A, requesterAuthIdentityId: REQUESTER_A, supportAccessGrantId: "60000000-0000-4000-8000-000000000001",
        scopeHash: HASH_A, inputHash: HASH_B, idempotencyKeyHash: HASH_C, policyVersion: "policy-v1", requestedFormat: "csv", correlationId: "corr-export-001", auditEventId: AUDIT_A,
        unknown: true,
      }).success).toBe(false);
    } finally { db.close(); }
  });

  it("requires D-002 export authority and treats tenant-wide principals as narrowing selectors", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "authority-a"); workspace(db, WORKSPACE_A, TENANT_A); workspace(db, WORKSPACE_B, TENANT_A);
      membership(db, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
      insertJob(db, { workspace_id: WORKSPACE_A });
      approvedSupportGrant(db, SUPPORT_GRANT_B, SUPPORT_ACTOR_MISSING_PERMISSION, "data:export", null, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      insertJob(db, {
        id: JOB_B, tenant_id: TENANT_A, workspace_id: WORKSPACE_A, requester_auth_identity_id: SUPPORT_ACTOR_MISSING_PERMISSION,
        requester_membership_id: null, support_access_grant_id: SUPPORT_GRANT_B, idempotency_key_hash: HASH_D,
      });

      membership(db, MEMBERSHIP_B, TENANT_A, REQUESTER_B, null, null);
      expect(() => insertJob(db, { id: JOB_C, requester_auth_identity_id: REQUESTER_B, requester_membership_id: MEMBERSHIP_B, idempotency_key_hash: "e".repeat(64) })).toThrow(/requester|active|authority|constraint/i);
      membership(db, MEMBERSHIP_C, TENANT_A, "30000000-0000-4000-8000-000000000006");
      db.prepare("UPDATE tenant_role_bindings SET revoked_at = ? WHERE membership_id = ?").run("2099-01-01T00:00:00.000Z", MEMBERSHIP_C);
      expect(() => insertJob(db, { id: JOB_C, requester_auth_identity_id: "30000000-0000-4000-8000-000000000006", requester_membership_id: MEMBERSHIP_C, idempotency_key_hash: "f".repeat(64) })).toThrow(/requester|active|authority|constraint/i);
      membership(db, MEMBERSHIP_D, TENANT_A, "30000000-0000-4000-8000-000000000007", WORKSPACE_A);
      expect(() => insertJob(db, { id: JOB_C, requester_auth_identity_id: "30000000-0000-4000-8000-000000000007", requester_membership_id: MEMBERSHIP_D, workspace_id: WORKSPACE_B, idempotency_key_hash: "1".repeat(64) })).toThrow(/same-scope|requester|constraint/i);

      approvedSupportGrant(db, SUPPORT_GRANT_C, SUPPORT_ACTOR_WRONG_WORKSPACE, "tenant:read", null, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      expect(() => insertJob(db, { id: JOB_C, requester_auth_identity_id: SUPPORT_ACTOR_WRONG_WORKSPACE, requester_membership_id: null, support_access_grant_id: SUPPORT_GRANT_C, workspace_id: WORKSPACE_A, idempotency_key_hash: "2".repeat(64) })).toThrow(/support grant|permission|active|constraint/i);
      approvedSupportGrant(db, SUPPORT_GRANT_D, SUPPORT_ACTOR_OTHER, "data:export", WORKSPACE_A, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      expect(() => insertJob(db, { id: JOB_D, requester_auth_identity_id: SUPPORT_ACTOR_OTHER, requester_membership_id: null, support_access_grant_id: SUPPORT_GRANT_D, workspace_id: WORKSPACE_B, idempotency_key_hash: "3".repeat(64) })).toThrow(/support grant|same-scope|constraint/i);
    } finally { db.close(); }
  });

  it("makes the idempotency identity unique per tenant/operation/key, including scope and input conflicts", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "idempotency-a"); tenant(db, TENANT_B, "idempotency-b");
      membership(db, MEMBERSHIP_A, TENANT_A, REQUESTER_A); membership(db, MEMBERSHIP_B, TENANT_B, REQUESTER_B);
      insertJob(db);
      expect(() => insertJob(db, { id: JOB_B })).toThrow(/UNIQUE|constraint/i);
      expect(() => insertJob(db, { id: JOB_B, input_hash: HASH_D })).toThrow(/UNIQUE|constraint/i);
      expect(() => insertJob(db, { id: JOB_B, scope_hash: HASH_D })).toThrow(/UNIQUE|constraint/i);
      insertJob(db, { id: JOB_B, tenant_id: TENANT_B, requester_auth_identity_id: REQUESTER_B, requester_membership_id: MEMBERSHIP_B });
      expect(db.prepare("SELECT COUNT(*) AS count FROM tenant_export_jobs").get()).toEqual({ count: 2 });
    } finally { db.close(); }
  });

  it("rejects invalid artifact paths/checksums/counts/expiry and enforces inclusive seven-day maximum with exclusive access", () => {
    const invalid = [
      { artifact_storage_ref: "https://public.example/artifact.csv" },
      { artifact_storage_ref: artifactRef().replace("artifact.csv", "../artifact.csv") },
      { artifact_checksum_sha256: HASH_D.toUpperCase() },
      { included_count: -1 },
      { expires_at: AFTER_MAXIMUM_EXPIRY },
    ];
    for (const values of invalid) {
      const invalidDb = database();
      try {
        tenant(invalidDb, TENANT_A, "artifact-a"); membership(invalidDb, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
        insertJob(invalidDb);
        invalidDb.prepare("UPDATE tenant_export_jobs SET snapshot_at = ?, status = 'snapshotting' WHERE id = ?").run(SNAPSHOT, JOB_A);
        invalidDb.prepare("UPDATE tenant_export_jobs SET status = 'redacting' WHERE id = ?").run(JOB_A);
        expect(() => invalidDb.prepare(`UPDATE tenant_export_jobs SET status = 'artifact_created', ${Object.keys(artifactValues()).map((column) => `${column} = @${column}`).join(", ")} WHERE id = @id`).run({ ...artifactValues(), ...values, id: JOB_A })).toThrow(/CHECK|constraint|private|namespace/i);
      } finally { invalidDb.close(); }
    }
    const db = database();
    try {
      tenant(db, TENANT_A, "artifact-a"); membership(db, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
      insertJob(db);
      db.prepare("UPDATE tenant_export_jobs SET snapshot_at = ?, status = 'snapshotting' WHERE id = ?").run(SNAPSHOT, JOB_A);
      db.prepare("UPDATE tenant_export_jobs SET status = 'redacting' WHERE id = ?").run(JOB_A);
      db.prepare(`UPDATE tenant_export_jobs SET status = 'artifact_created', ${Object.keys(artifactValues()).map((column) => `${column} = @${column}`).join(", ")} WHERE id = @id`).run({ ...artifactValues(), id: JOB_A });
      expect(() => db.prepare("UPDATE tenant_export_jobs SET status = 'released' WHERE id = ?").run(JOB_A)).not.toThrow();
      const job = tenantExportJobSchema.parse(readJob(db));
      expect(isArtifactUsableAt(job, BEFORE_EXPIRY)).toBe(true);
      expect(isArtifactUsableAt(job, EXPIRY)).toBe(false);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET status = 'expired' WHERE id = ?").run(JOB_A)).toThrow(/expire|expiry/i);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET status = 'deleted' WHERE id = ?").run(JOB_A)).not.toThrow();
      expect(TENANT_EXPORT_MAX_ARTIFACT_AGE_SECONDS).toBe(604800);
    } finally { db.close(); }
  });

  it("accepts every defined transition edge, rejects skips, and handles retry/failed/canceled states", () => {
    const allStatuses = new Set(TENANT_EXPORT_JOB_STATUSES);
    for (const [from, targets] of Object.entries(tenantExportTransitionMap)) {
      expect(allStatuses.has(from as never)).toBe(true);
      for (const to of targets) expect(isTransitionAllowed(from as never, to)).toBe(true);
    }
    expect(isTransitionAllowed("requested", "released")).toBe(false);
    expect(isTransitionAllowed("released", "snapshotting")).toBe(false);
    expect(isTransitionAllowed("deleted", "requested")).toBe(false);
    expect(isTransitionAllowed("unknown" as never, "requested")).toBe(false);
    expect(TENANT_EXPORT_TERMINAL_STATUSES).toEqual(["canceled", "deleted"]);

    const db = database();
    try {
      tenant(db, TENANT_A, "state-a"); membership(db, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
      insertJob(db);
      db.prepare("UPDATE tenant_export_jobs SET status = 'failed', error_code = 'EXPORT_SNAPSHOT_FAILED', error_message = 'snapshot failed' WHERE id = ?").run(JOB_A);
      db.prepare("UPDATE tenant_export_jobs SET status = 'retry_wait', retry_count = 1, next_retry_at = ?, error_code = 'EXPORT_RETRYABLE', error_message = ? WHERE id = ?").run("2026-07-27T00:05:00.000Z", "retry later", JOB_A);
      db.prepare("UPDATE tenant_export_jobs SET status = 'snapshotting', next_retry_at = NULL, error_code = NULL, error_message = NULL WHERE id = ?").run(JOB_A);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET retry_count = 0 WHERE id = ?").run(JOB_A)).toThrow(/retry_count|immutable/i);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET retry_count = 3 WHERE id = ?").run(JOB_A)).toThrow(/retry_count|immutable/i);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET max_retries = 4 WHERE id = ?").run(JOB_A)).toThrow(/max_retries|immutable/i);
      db.prepare("UPDATE tenant_export_jobs SET status = 'failed', error_code = 'EXPORT_SNAPSHOT_FAILED', error_message = 'snapshot failed again' WHERE id = ?").run(JOB_A);
      db.prepare("UPDATE tenant_export_jobs SET status = 'retry_wait', retry_count = 2, next_retry_at = ?, error_code = 'EXPORT_RETRYABLE', error_message = ? WHERE id = ?").run("2026-07-27T00:06:00.000Z", "retry again", JOB_A);
      db.prepare("UPDATE tenant_export_jobs SET status = 'snapshotting', next_retry_at = NULL, error_code = NULL, error_message = NULL WHERE id = ?").run(JOB_A);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET status = 'released' WHERE id = ?").run(JOB_A)).toThrow(/transition|artifact/i);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET status = 'canceled', error_code = 'EXPORT_CANCELED', error_message = 'operator canceled' WHERE id = ?").run(JOB_A)).not.toThrow();
    } finally { db.close(); }
  });

  it("enforces bounded leases, generation monotonicity, stale replacement, and immutable facts", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "lease-a"); membership(db, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
      insertJob(db);
      db.prepare("UPDATE tenant_export_jobs SET lease_owner_hash = ?, lease_generation = 1, lease_acquired_at = ?, lease_heartbeat_at = ?, lease_expires_at = ? WHERE id = ?").run(HASH_D, "2020-01-01T00:00:00.000Z", "2020-01-01T00:00:00.000Z", "2020-01-01T00:15:00.000Z", JOB_A);
      db.prepare("UPDATE tenant_export_jobs SET lease_heartbeat_at = ?, lease_expires_at = ? WHERE id = ?").run("2020-01-01T00:01:00.000Z", "2020-01-01T00:16:00.000Z", JOB_A);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET lease_acquired_at = ? WHERE id = ?").run("2019-12-31T23:59:00.000Z", JOB_A)).toThrow(/acquired_at|immutable/i);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET lease_heartbeat_at = ? WHERE id = ?").run("2020-01-01T00:00:30.000Z", JOB_A)).toThrow(/heartbeat|backward/i);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET lease_expires_at = ? WHERE id = ?").run("2020-01-01T00:15:30.000Z", JOB_A)).toThrow(/expiry|backward/i);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET lease_generation = 0 WHERE id = ?").run(JOB_A)).toThrow(/generation|stale/i);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET lease_generation = 2, lease_owner_hash = ?, lease_acquired_at = ?, lease_heartbeat_at = ?, lease_expires_at = ? WHERE id = ?").run(HASH_C, "2020-01-01T00:02:00.000Z", "2020-01-01T00:02:00.000Z", "2020-01-01T00:17:00.000Z", JOB_A)).not.toThrow();
      expect(() => db.prepare("UPDATE tenant_export_jobs SET lease_owner_hash = NULL, lease_acquired_at = NULL, lease_heartbeat_at = NULL, lease_expires_at = ? WHERE id = ?").run("2020-01-01T00:17:00.000Z", JOB_A)).toThrow(/lease|facts/i);
      db.prepare("UPDATE tenant_export_jobs SET lease_owner_hash = NULL, lease_acquired_at = NULL, lease_heartbeat_at = NULL, lease_expires_at = NULL WHERE id = ?").run(JOB_A);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET scope_hash = ? WHERE id = ?").run(HASH_D, JOB_A)).toThrow(/immutable/i);
      db.prepare("UPDATE tenant_export_jobs SET snapshot_at = ? WHERE id = ?").run(SNAPSHOT, JOB_A);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET snapshot_at = ? WHERE id = ?").run(CREATED, JOB_A)).toThrow(/immutable/i);
      db.prepare("UPDATE tenant_export_jobs SET status = 'snapshotting' WHERE id = ?").run(JOB_A);
      db.prepare("UPDATE tenant_export_jobs SET status = 'redacting' WHERE id = ?").run(JOB_A);
      db.prepare(`UPDATE tenant_export_jobs SET status = 'artifact_created', ${Object.keys(artifactValues()).map((column) => `${column} = @${column}`).join(", ")} WHERE id = @id`).run({ ...artifactValues(), id: JOB_A, snapshot_at: SNAPSHOT });
      expect(() => db.prepare("UPDATE tenant_export_jobs SET artifact_checksum_sha256 = ? WHERE id = ?").run(HASH_A, JOB_A)).toThrow(/immutable/i);
      db.prepare("UPDATE tenant_export_jobs SET status = 'released' WHERE id = ?").run(JOB_A);
      expect(() => db.prepare("UPDATE tenant_export_jobs SET lease_generation = 2147483647 WHERE id = ?").run(JOB_A)).toThrow(/generation|lease/i);
    } finally { db.close(); }
  });

  it("checks support-grant eligibility at database time, not a caller-supplied created_at", () => {
    const db = database();
    try {
      tenant(db, TENANT_A, "support-time-a");
      expiredSupportGrant(db);
      expect(() => insertJob(db, {
        id: JOB_B,
        requester_auth_identity_id: REQUESTER_B,
        requester_membership_id: null,
        support_access_grant_id: SUPPORT_GRANT_A,
        created_at: "2019-01-01T00:00:00.000Z",
        updated_at: "2019-01-01T00:00:00.000Z",
        scope_hash: HASH_D,
      })).toThrow(/support grant|active|constraint/i);
    } finally { db.close(); }
  });

  it("permits only safe terminal cleanup after requester invalidation", () => {
    const memberDb = database();
    try {
      tenant(memberDb, TENANT_A, "cleanup-member-a"); membership(memberDb, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
      insertJob(memberDb);
      memberDb.prepare("UPDATE tenant_memberships SET status = 'disabled' WHERE id = ?").run(MEMBERSHIP_A);
      expect(() => memberDb.prepare("UPDATE tenant_export_jobs SET status = 'snapshotting' WHERE id = ?").run(JOB_A)).toThrow(/requester|eligible|active/i);
      expect(() => memberDb.prepare("UPDATE tenant_export_jobs SET status = 'failed', error_code = 'EXPORT_SCOPE_INVALID', error_message = 'requester invalidated' WHERE id = ?").run(JOB_A)).not.toThrow();
    } finally { memberDb.close(); }

    const supportDb = database();
    try {
      tenant(supportDb, TENANT_A, "cleanup-support-a"); membership(supportDb, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
      approvedSupportGrant(supportDb, SUPPORT_GRANT_E, SUPPORT_ACTOR_CLEANUP, "data:export", null, "2026-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
      insertJob(supportDb, { requester_auth_identity_id: SUPPORT_ACTOR_CLEANUP, requester_membership_id: null, support_access_grant_id: SUPPORT_GRANT_E });
      supportDb.prepare("UPDATE support_access_grants SET state = 'revoked', revoked_by_auth_identity_id = ?, revoked_at = ? WHERE id = ?").run(REQUESTER_A, "2027-01-01T00:00:00.000Z", SUPPORT_GRANT_E);
      expect(() => supportDb.prepare("UPDATE tenant_export_jobs SET status = 'snapshotting' WHERE id = ?").run(JOB_A)).toThrow(/requester|eligible|support grant/i);
      expect(() => supportDb.prepare("UPDATE tenant_export_jobs SET status = 'canceled', error_code = 'EXPORT_CANCELED', error_message = 'grant invalidated' WHERE id = ?").run(JOB_A)).not.toThrow();
    } finally { supportDb.close(); }
  });

  it("keeps strict read schemas separate from authorization and preserves migration hardening", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/202607270006_add_tenant_export_jobs.sql"), "utf8");
    const db = database();
    try {
      tenant(db, TENANT_A, "schema-a"); membership(db, MEMBERSHIP_A, TENANT_A, REQUESTER_A);
      insertJob(db);
      const valid = readJob(db);
      expect(tenantExportJobSchema.safeParse(valid).success).toBe(true);
      expect(tenantExportJobSchema.safeParse({ ...valid, unknown: true }).success).toBe(false);
      expect(tenantExportJobSchema.safeParse({ ...valid, idempotencyKeyHash: HASH_A.toUpperCase() }).success).toBe(false);
      expect(tenantExportJobSchema.safeParse({ ...valid, status: "redacting" }).success).toBe(false);
      const artifactFacts = Object.fromEntries(Object.entries(artifactValues()).map(([key, value]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), value]));
      expect(tenantExportJobSchema.safeParse({ ...valid, status: "requested", snapshotAt: SNAPSHOT, ...artifactFacts }).success).toBe(false);
      expect(tenantExportJobSchema.safeParse({ ...valid, status: "retry_wait", snapshotAt: SNAPSHOT, ...artifactFacts, errorCode: "EXPORT_RETRYABLE", errorMessage: "retry later", retryCount: 1, nextRetryAt: "2026-07-27T00:05:00.000Z" }).success).toBe(true);
      expect(tenantExportJobSchema.safeParse({ ...valid, status: "artifact_created", snapshotAt: SNAPSHOT, ...artifactFacts, artifactCreatedAt: CREATED }).success).toBe(false);
      expect(tenantExportArtifactStorageRefSchema.safeParse("/tmp/artifact.csv").success).toBe(false);
      expect(tenantExportArtifactStorageRefSchema.safeParse("tenants/a/exports/b/artifact.csv").success).toBe(false);
    } finally { db.close(); }
    expect(migration).toContain("CREATE TABLE public.tenant_export_jobs");
    expect(migration).toContain("UNIQUE (tenant_id, operation, idempotency_key_hash)");
    expect(migration).not.toContain("UNIQUE (tenant_id, operation, scope_hash, idempotency_key_hash)");
    expect(migration).toContain("binding.role IN ('owner', 'admin')");
    expect(migration).toContain("permission_row.permission = 'data:export'");
    expect(migration).toContain("export job must be inserted in the exact requested initial state");
    expect(migration).toContain("OLD.lease_generation < 2147483647 AND NEW.lease_generation = OLD.lease_generation + 1");
    expect(migration).not.toContain("lease_generation + CASE");
    expect(SCHEMA_SQL).toContain("binding.role IN ('owner', 'admin')");
    expect(SCHEMA_SQL).toContain("permission_row.permission = 'data:export'");
    expect(SCHEMA_SQL).toContain("export job must be inserted in the exact requested initial state");
    expect(SCHEMA_SQL).toContain("OLD.lease_generation < 2147483647 AND NEW.lease_generation = OLD.lease_generation + 1");
    expect(migration).toContain("SET search_path = pg_catalog, public");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).not.toMatch(/CREATE POLICY|ENABLE ROW LEVEL SECURITY|jsonb/i);
    expect(migration).not.toMatch(/artifact_bytes|raw_content|private_key/i);
  });
});
