import { readFileSync } from "node:fs";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runSqliteMigrations } from "@/lib/db";
import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  canEnterTenantDeletionCompleted,
  canEnterTenantDeletionPrimaryDeleted,
  isTenantDeletionTransitionAllowed,
  TENANT_DELETION_CHECKPOINT_STORES,
  TENANT_DELETION_MAX_RETRIES,
  tenantDeletionIdempotencyResult,
  validateTenantDeletionCheckpointTransition,
  validateTenantDeletionTransition,
} from "@/lib/tenancy/types";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_B = "10000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "20000000-0000-4000-8000-000000000002";
const JOB_A = "50000000-0000-4000-8000-000000000001";
const JOB_B = "50000000-0000-4000-8000-000000000002";
const JOB_C = "50000000-0000-4000-8000-000000000003";
const CHECKPOINT_PREFIX = "60000000-0000-4000-8000-";
const CHECKPOINT_PREFIX_B = "60000000-0000-4000-8001-";
const CHECKPOINT_PREFIX_C = "60000000-0000-4000-8002-";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const IDENTITY_A = "30000000-0000-4000-8000-000000000001";
const IDENTITY_B = "30000000-0000-4000-8000-000000000002";
const AUDIT_A = "40000000-0000-4000-8000-000000000001";
const T0 = "2030-07-27T00:00:00.000Z";
const T1 = "2030-07-27T00:01:00.000Z";
const T2 = "2030-07-27T00:02:00.000Z";
const T3 = "2030-07-27T00:03:00.000Z";
const T4 = "2030-07-27T00:04:00.000Z";
const T5 = "2030-07-27T00:05:00.000Z";
const T6 = "2030-07-27T00:06:00.000Z";
const BACKUP_TARGET = "2030-08-20T00:04:00.000Z";

function database(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA_SQL);
  seedTenant(db, TENANT_A, WORKSPACE_A, MEMBERSHIP_A, IDENTITY_A, "a");
  seedTenant(db, TENANT_B, WORKSPACE_B, MEMBERSHIP_B, IDENTITY_B, "b");
  return db;
}

function seedTenant(db: Database.Database, tenantId: string, workspaceId: string, membershipId: string, identityId: string, suffix: string): void {
  db.prepare("INSERT INTO tenants (id, slug, name) VALUES (?, ?, ?)").run(tenantId, `deletion-${suffix}`, `Deletion Tenant ${suffix}`);
  db.prepare("INSERT INTO workspaces (id, tenant_id, slug, name, status) VALUES (?, ?, ?, ?, 'active')").run(workspaceId, tenantId, `workspace-${suffix}`, `Workspace ${suffix}`);
  db.prepare("INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status) VALUES (?, ?, ?, ?, 'active')").run(membershipId, tenantId, identityId, workspaceId);
}

function insertJob(db: Database.Database, values: Record<string, unknown> = {}): void {
  const row = {
    id: JOB_A,
    tenant_id: TENANT_A,
    workspace_id: null,
    scope_kind: "tenant",
    scope_selector_hash: HASH_A,
    requested_by_auth_identity_id: IDENTITY_A,
    requested_by_membership_id: MEMBERSHIP_A,
    status: "requested",
    policy_version: "policy-v1",
    policy_snapshot_hash: HASH_B,
    input_hash: HASH_C,
    idempotency_key_hash: HASH_A,
    correlation_id: "corr-deletion-001",
    audit_event_id: AUDIT_A,
    created_at: T0,
    updated_at: T0,
    ...values,
  };
  const columns = Object.keys(row);
  db.prepare(`INSERT INTO tenant_deletion_jobs (${columns.join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`).run(row);
}

function insertCheckpoints(db: Database.Database, jobId = JOB_A, tenantId = TENANT_A, workspaceId: string | null = null, prefix = CHECKPOINT_PREFIX): void {
  for (const [index, store] of TENANT_DELETION_CHECKPOINT_STORES.entries()) {
    db.prepare(`INSERT INTO tenant_deletion_checkpoints (id, job_id, tenant_id, workspace_id, store_class, required, opaque_target_hash)
      VALUES (?, ?, ?, ?, ?, 1, ?)`).run(`${prefix}${String(index + 1).padStart(12, "0")}`, jobId, tenantId, workspaceId, store, HASH_A);
  }
}

function setCheckpoint(db: Database.Database, store: string, status: string, values: Record<string, unknown> = {}): void {
  if (["running", "complete", "retryable", "failed", "held", "exempted"].includes(status) && status !== "running") {
    db.prepare("UPDATE tenant_deletion_checkpoints SET status = 'running', started_at = ?, updated_at = ? WHERE job_id = ? AND store_class = ?").run(T1, T1, JOB_A, store);
  }
  db.prepare(`UPDATE tenant_deletion_checkpoints SET status = @status, started_at = @started_at, completed_at = @completed_at, receipt_hash = @receipt_hash,
    exemption_reason = @exemption_reason, exemption_approved = @exemption_approved, error_code = @error_code, error_fingerprint = @error_fingerprint, updated_at = @updated_at WHERE job_id = @job_id AND store_class = @store`).run({
    status,
    started_at: status === "complete" || status === "exempted" || status === "failed" ? T1 : null,
    completed_at: status === "complete" || status === "exempted" ? T1 : null,
    receipt_hash: status === "complete" ? HASH_B : null,
    exemption_reason: null,
    exemption_approved: 0,
    error_code: status === "failed" ? "DELETE_CHECKPOINT_FAILED" : null,
    error_fingerprint: status === "failed" ? HASH_C : null,
    updated_at: T1,
    job_id: JOB_A,
    store,
    ...values,
  });
}

function approveAndSchedule(db: Database.Database): void {
  db.prepare(`UPDATE tenant_deletion_jobs SET status = 'verified', verified_by_auth_identity_id = ?, verified_by_membership_id = ?, verified_at = ?, updated_at = ? WHERE id = ?`).run(IDENTITY_A, MEMBERSHIP_A, T1, T1, JOB_A);
  db.prepare(`UPDATE tenant_deletion_jobs SET status = 'scheduled', approved_by_auth_identity_id = ?, approved_by_membership_id = ?, approved_at = ?, scheduled_at = ?, updated_at = ? WHERE id = ?`).run(IDENTITY_A, MEMBERSHIP_A, T2, T2, T2, JOB_A);
}

function startRunning(db: Database.Database): void {
  db.prepare("UPDATE tenant_deletion_jobs SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?").run(T3, T3, JOB_A);
}

describe("tenant deletion job schema and contract", () => {
  it("creates fresh SQLite and remains additive on an upgrade", () => {
    const db = new Database(":memory:");
    try {
      db.pragma("foreign_keys = ON");
      db.exec("CREATE TABLE settings (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)");
      db.prepare("INSERT INTO settings VALUES (1, 'legacy')").run();
      runSqliteMigrations(db);
      db.exec(SCHEMA_SQL);
      db.exec(SCHEMA_SQL);
      expect(db.prepare("SELECT marker FROM settings WHERE id = 1").get()).toEqual({ marker: "legacy" });
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'tenant_deletion_%'").all()).toHaveLength(4);
      const tombstoneColumns = (db.prepare("PRAGMA table_info(tenant_deletion_tombstones)").all() as Array<{ name: string }>).map((column) => column.name);
      expect(tombstoneColumns.some((name) => /content|email|phone|prompt|output|contact|raw|bytes|secret/i.test(name))).toBe(false);
    } finally {
      db.close();
    }
  });

  it("matches the migration vocabulary and structural safety claims", () => {
    const migration = readFileSync(join(process.cwd(), "supabase/migrations/202607270008_add_tenant_deletion_jobs.sql"), "utf8");
    for (const status of ["requested", "verified", "scheduled", "running", "retry_wait", "failed", "canceled", "primary_deleted", "backup_aging", "completed"]) expect(migration).toContain(`'${status}'`);
    for (const store of TENANT_DELETION_CHECKPOINT_STORES) expect(migration).toContain(`'${store}'`);
    expect(migration).toContain("ON DELETE RESTRICT");
    expect(migration).toContain("UNIQUE (tenant_id, operation, scope_selector_hash, idempotency_key_hash)");
    expect(migration).toContain("retry_count <= max_retries");
    expect(migration).toContain("NEW.retry_count > NEW.max_retries");
    const postgresInsertGuard = migration.match(/CREATE OR REPLACE FUNCTION public\.novatrade_tenant_deletion_jobs_insert_guard\(\)[\s\S]*?END; \$\$;/)?.[0] ?? "";
    expect(postgresInsertGuard).toMatch(/authored_at timestamptz/);
    expect(postgresInsertGuard).toMatch(/authored_at\s*:=\s*pg_catalog\.now\(\)/);
    expect(postgresInsertGuard).toMatch(/NEW\.created_at\s*=\s*authored_at/);
    expect(postgresInsertGuard).toMatch(/NEW\.updated_at\s*=\s*authored_at/);
    expect(migration).toContain("never deletes tenant data");
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(public\.)?(tenant_deletion_jobs|tenant_deletion_checkpoints)/i);
    expect(migration).not.toMatch(/error_message|provider_erased|customer_email|contact_body|document_content/i);
  });

  it("rejects vacuous or non-canonical completion contracts and binds exemption reasons", () => {
    const complete = TENANT_DELETION_CHECKPOINT_STORES.map((store) => ({ store, status: "complete" as const, required: true }));
    expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: [] })).toBe(false);
    expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: complete.slice(0, -1) })).toBe(false);
    expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: complete.map((checkpoint) => ({ ...checkpoint, required: false })) })).toBe(false);
    expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: [...complete.slice(0, -1), complete[0]] })).toBe(false);
    expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: [...complete.slice(0, -1), { store: "unknown_store", status: "complete", required: true } as never] })).toBe(false);
    expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: complete.map((checkpoint) => checkpoint.store === "logs_telemetry_aggregates"
      ? { ...checkpoint, status: "exempted" as const, exemptionReason: "backup_retention_only" as const, exemptionApproved: true }
      : checkpoint) })).toBe(false);
    expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: complete.map((checkpoint) => checkpoint.store === "search_embeddings"
      ? { ...checkpoint, status: "exempted" as const, exemptionReason: "no_provider_copy_evidenced" as const, exemptionApproved: true }
      : checkpoint) })).toBe(false);
    expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: complete.map((checkpoint) => checkpoint.store === "logs_telemetry_aggregates"
      ? { ...checkpoint, status: "exempted" as const, exemptionReason: "legal_hold_covered" as const, exemptionApproved: false }
      : checkpoint) })).toBe(false);
    expect(validateTenantDeletionCheckpointTransition("running", "complete", { store: "logs_telemetry_aggregates", status: "complete", required: true, exemptionReason: "backup_retention_only", exemptionApproved: false })).toBe("complete_cannot_have_exemption");
  });

  it("cross-binds event history to the tenant and job checkpoint parent", () => {
    const db = database();
    try {
      insertJob(db);
      insertJob(db, { id: JOB_B, tenant_id: TENANT_A, scope_selector_hash: HASH_B });
      insertJob(db, { id: JOB_C, tenant_id: TENANT_B, requested_by_auth_identity_id: IDENTITY_B, requested_by_membership_id: MEMBERSHIP_B });
      insertCheckpoints(db, JOB_A, TENANT_A, null, CHECKPOINT_PREFIX);
      insertCheckpoints(db, JOB_B, TENANT_A, null, CHECKPOINT_PREFIX_B);
      insertCheckpoints(db, JOB_C, TENANT_B, null, CHECKPOINT_PREFIX_C);
      const checkpointA = `${CHECKPOINT_PREFIX}000000000001`;
      expect(() => db.prepare("INSERT INTO tenant_deletion_checkpoint_events (checkpoint_id, tenant_id, job_id, status, attempt, lease_generation) VALUES (?, ?, ?, 'pending', 0, 0)").run(checkpointA, TENANT_A, JOB_B)).toThrow(/foreign key|constraint|facts/i);
      expect(() => db.prepare("INSERT INTO tenant_deletion_checkpoint_events (checkpoint_id, tenant_id, job_id, status, attempt, lease_generation) VALUES (?, ?, ?, 'pending', 0, 0)").run(checkpointA, TENANT_B, JOB_C)).toThrow(/foreign key|constraint|facts/i);
    } finally { db.close(); }
  });

  it("uses fixed stores, tenant/workspace foreign keys, and no cross-tenant idempotency collision", () => {
    const db = database();
    try {
      insertJob(db);
      expect(() => insertJob(db, { id: JOB_B, tenant_id: TENANT_A })).toThrow(/unique|constraint/i);
      expect(() => insertJob(db, { id: JOB_B, tenant_id: TENANT_A, scope_selector_hash: HASH_B })).not.toThrow();
      expect(() => insertJob(db, { id: JOB_C, tenant_id: TENANT_B, requested_by_auth_identity_id: IDENTITY_B, requested_by_membership_id: MEMBERSHIP_B, idempotency_key_hash: HASH_A })).not.toThrow();
      expect(db.prepare("SELECT COUNT(*) AS count FROM tenant_deletion_checkpoints").get()).toEqual({ count: 0 });
      expect(() => insertCheckpoints(db, JOB_B, TENANT_B, WORKSPACE_A)).toThrow(/foreign key|workspace/i);
    } finally { db.close(); }
  });

  it("allows only the documented state graph and closes cancellation after handoff/checkpoint work", () => {
    const allowed = new Set(["requested->verified", "requested->canceled", "verified->scheduled", "verified->canceled", "scheduled->running", "scheduled->canceled", "running->retry_wait", "running->failed", "running->primary_deleted", "retry_wait->running", "retry_wait->failed", "failed->retry_wait", "primary_deleted->backup_aging", "backup_aging->completed"]);
    for (const from of ["requested", "verified", "scheduled", "running", "retry_wait", "failed", "canceled", "primary_deleted", "backup_aging", "completed"]) {
      for (const to of ["requested", "verified", "scheduled", "running", "retry_wait", "failed", "canceled", "primary_deleted", "backup_aging", "completed"]) {
        expect(isTenantDeletionTransitionAllowed(from, to)).toBe(from === to || allowed.has(`${from}->${to}`));
      }
    }
    expect(validateTenantDeletionTransition({ from: "scheduled", to: "canceled", freezeHandoffStatus: "acknowledged", accessRevocationHandoffStatus: "not_started", checkpoints: [], retryCount: 0, maxRetries: 3 })).toBe("cancel_window_closed");
    expect(validateTenantDeletionTransition({ from: "running", to: "canceled", freezeHandoffStatus: "not_started", accessRevocationHandoffStatus: "not_started", checkpoints: [], retryCount: 0, maxRetries: 3 })).toBe("invalid_state_transition");
    const retryInput = { from: "running" as const, to: "retry_wait" as const, freezeHandoffStatus: "not_started" as const, accessRevocationHandoffStatus: "not_started" as const, checkpoints: [], retryCount: 1, maxRetries: 1 };
    expect(validateTenantDeletionTransition(retryInput)).toBeNull();
    expect(validateTenantDeletionTransition({ ...retryInput, retryCount: 0, maxRetries: 0 })).toBe("retry_bound_exceeded");
    expect(validateTenantDeletionTransition({ ...retryInput, retryCount: 0, maxRetries: 1 })).toBe("retry_bound_exceeded");
    expect(validateTenantDeletionTransition({ ...retryInput, retryCount: 2 })).toBe("retry_bound_exceeded");
    expect(validateTenantDeletionTransition({ ...retryInput, retryCount: -1 })).toBe("retry_bound_exceeded");
    expect(validateTenantDeletionTransition({ ...retryInput, retryCount: 0.5 })).toBe("retry_bound_exceeded");
    expect(validateTenantDeletionTransition({ ...retryInput, retryCount: Number.NaN })).toBe("retry_bound_exceeded");
    expect(validateTenantDeletionTransition({ ...retryInput, maxRetries: TENANT_DELETION_MAX_RETRIES + 1 })).toBe("retry_bound_exceeded");
  });

  it("closes the cancellation bypass and rejects preloaded later-state facts", () => {
    const db = database();
    try {
      insertJob(db);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'canceled', canceled_at = ?, freeze_handoff_status = 'acknowledged', updated_at = ? WHERE id = ?").run(T1, T1, JOB_A)).toThrow(/cancellation|constraint/i);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'canceled', canceled_at = ?, updated_at = ? WHERE id = ?").run(T1, T1, JOB_A)).not.toThrow();
      const preloadDb = database();
      try {
        expect(() => insertJob(preloadDb, { id: JOB_B, verified_by_auth_identity_id: IDENTITY_A, verified_by_membership_id: MEMBERSHIP_A, verified_at: T1 })).toThrow(/constraint|requested state/i);
      } finally { preloadDb.close(); }
    } finally { db.close(); }

    const preservedDb = database();
    try {
      insertJob(preservedDb); approveAndSchedule(preservedDb);
      preservedDb.prepare("UPDATE tenant_deletion_jobs SET status = 'canceled', canceled_at = ?, updated_at = ? WHERE id = ?").run(T3, T3, JOB_A);
      expect(preservedDb.prepare("SELECT status, verified_at, approved_at, scheduled_at, canceled_at FROM tenant_deletion_jobs WHERE id = ?").get(JOB_A)).toEqual({ status: "canceled", verified_at: T1, approved_at: T2, scheduled_at: T2, canceled_at: T3 });
    } finally { preservedDb.close(); }

    const verifiedDb = database();
    try {
      insertJob(verifiedDb);
      verifiedDb.prepare("UPDATE tenant_deletion_jobs SET status = 'verified', verified_by_auth_identity_id = ?, verified_by_membership_id = ?, verified_at = ?, updated_at = ? WHERE id = ?").run(IDENTITY_A, MEMBERSHIP_A, T1, T1, JOB_A);
      verifiedDb.prepare("UPDATE tenant_deletion_jobs SET status = 'canceled', canceled_at = ?, updated_at = ? WHERE id = ?").run(T2, T2, JOB_A);
      expect(verifiedDb.prepare("SELECT status, verified_at, approved_at, scheduled_at, canceled_at FROM tenant_deletion_jobs WHERE id = ?").get(JOB_A)).toEqual({ status: "canceled", verified_at: T1, approved_at: null, scheduled_at: null, canceled_at: T2 });
    } finally { verifiedDb.close(); }
  });

  it("keeps handoff and legal-hold ledgers monotonic and blocks unresolved execution", () => {
    const db = database();
    try {
      insertJob(db); approveAndSchedule(db);
      db.prepare("UPDATE tenant_deletion_jobs SET freeze_handoff_status = 'requested', updated_at = ? WHERE id = ?").run(T3, JOB_A);
      db.prepare("UPDATE tenant_deletion_jobs SET freeze_handoff_status = 'acknowledged', updated_at = ? WHERE id = ?").run(T3, JOB_A);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET freeze_handoff_status = 'not_started', updated_at = ? WHERE id = ?").run(T4, JOB_A)).toThrow(/handoff|transition/i);
      db.prepare("UPDATE tenant_deletion_jobs SET legal_hold_status = 'active_subset', legal_hold_snapshot_hash = ?, held_scope_hash = ?, uncovered_scope_hash = ?, updated_at = ? WHERE id = ?").run(HASH_A, HASH_B, HASH_C, T4, JOB_A);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET legal_hold_status = 'active_subset', legal_hold_snapshot_hash = ?, held_scope_hash = ?, uncovered_scope_hash = ?, updated_at = ? WHERE id = ?").run(HASH_B, HASH_B, HASH_C, T5, JOB_A)).toThrow(/snapshot|status|transition/i);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET legal_hold_status = 'released', legal_hold_snapshot_hash = ?, held_scope_hash = ?, uncovered_scope_hash = ?, updated_at = ? WHERE id = ?").run(HASH_B, HASH_B, HASH_C, T5, JOB_A)).toThrow(/snapshot|release|transition/i);
      db.prepare("UPDATE tenant_deletion_jobs SET legal_hold_status = 'released', updated_at = ? WHERE id = ?").run(T5, JOB_A);
      expect(db.prepare("SELECT legal_hold_status, legal_hold_snapshot_hash, held_scope_hash, uncovered_scope_hash FROM tenant_deletion_jobs WHERE id = ?").get(JOB_A)).toEqual({ legal_hold_status: "released", legal_hold_snapshot_hash: HASH_A, held_scope_hash: HASH_B, uncovered_scope_hash: HASH_C });
    } finally { db.close(); }

    const holdDb = database();
    try {
      insertJob(holdDb, { legal_hold_status: "unresolved", legal_hold_snapshot_hash: HASH_A });
      expect(() => holdDb.prepare("UPDATE tenant_deletion_jobs SET status = 'verified', verified_by_auth_identity_id = ?, verified_by_membership_id = ?, verified_at = ?, updated_at = ? WHERE id = ?").run(IDENTITY_A, MEMBERSHIP_A, T1, T1, JOB_A)).toThrow(/unresolved|hold|constraint/i);
    } finally { holdDb.close(); }
  });

  it("requires verification and separate approval attribution before execution", () => {
    const db = database();
    try {
      insertJob(db);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'scheduled', scheduled_at = ?, updated_at = ? WHERE id = ?").run(T1, T1, JOB_A)).toThrow(/constraint|approval|verification|invalid/i);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'verified', verified_by_auth_identity_id = ?, verified_by_membership_id = ?, verified_at = ?, updated_at = ? WHERE id = ?").run(IDENTITY_A, MEMBERSHIP_A, T1, T1, JOB_A)).not.toThrow();
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'scheduled', approved_by_auth_identity_id = ?, approved_by_membership_id = ?, approved_at = ?, scheduled_at = ?, updated_at = ? WHERE id = ?").run(IDENTITY_A, MEMBERSHIP_A, T2, T2, T2, JOB_A)).not.toThrow();
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET scheduled_at = ?, updated_at = ? WHERE id = ?").run(T3, T3, JOB_A)).toThrow(/schedule|immutable|constraint/i);
    } finally { db.close(); }
  });

  it("does not allow primary deletion or completion with missing/failed/unknown checkpoints", () => {
    const db = database();
    try {
      insertJob(db); insertCheckpoints(db); approveAndSchedule(db); startRunning(db);
      for (const store of TENANT_DELETION_CHECKPOINT_STORES.slice(0, -2)) setCheckpoint(db, store, "complete");
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'primary_deleted', primary_deleted_at = ?, updated_at = ? WHERE id = ?").run(T4, T4, JOB_A)).toThrow(/checkpoint/i);
      expect(() => setCheckpoint(db, "logs_telemetry_aggregates", "unknown")).toThrow(/constraint|transition/i);
      setCheckpoint(db, "logs_telemetry_aggregates", "failed");
      expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: [{ store: "logs_telemetry_aggregates", status: "failed", required: true }] })).toBe(false);
    } finally { db.close(); }
  });

  it("requires direct SQL inserts to begin at the requested and pending states", () => {
    const jobDb = database();
    try {
      expect(() => insertJob(jobDb, { id: JOB_B, status: "verified", verified_by_auth_identity_id: IDENTITY_A, verified_by_membership_id: MEMBERSHIP_A, verified_at: T1 })).toThrow(/requested state|constraint/i);
    } finally { jobDb.close(); }

    const checkpointDb = database();
    try {
      insertJob(checkpointDb);
      const sql = `INSERT INTO tenant_deletion_checkpoints (id, job_id, tenant_id, store_class, status, opaque_target_hash, started_at, completed_at, receipt_hash, exemption_reason, exemption_approved, error_code, error_fingerprint)
        VALUES (@id, @job_id, @tenant_id, @store_class, @status, @opaque_target_hash, @started_at, @completed_at, @receipt_hash, @exemption_reason, @exemption_approved, @error_code, @error_fingerprint)`;
      const rows = [
        { id: `${CHECKPOINT_PREFIX_B}000000000001`, store_class: "cache_idempotency", status: "running", started_at: T1, completed_at: null, receipt_hash: null, exemption_reason: null, exemption_approved: 0, error_code: null, error_fingerprint: null },
        { id: `${CHECKPOINT_PREFIX_B}000000000002`, store_class: "search_embeddings", status: "complete", started_at: T1, completed_at: T2, receipt_hash: HASH_B, exemption_reason: null, exemption_approved: 0, error_code: null, error_fingerprint: null },
        { id: `${CHECKPOINT_PREFIX_B}000000000003`, store_class: "queues_leases", status: "failed", started_at: T1, completed_at: null, receipt_hash: null, exemption_reason: null, exemption_approved: 0, error_code: "DELETE_CHECKPOINT_FAILED", error_fingerprint: HASH_C },
        { id: `${CHECKPOINT_PREFIX_B}000000000004`, store_class: "backup_aging", status: "exempted", started_at: T1, completed_at: T2, receipt_hash: null, exemption_reason: "backup_retention_only", exemption_approved: 1, error_code: null, error_fingerprint: null },
      ];
      for (const row of rows) expect(() => checkpointDb.prepare(sql).run({ ...row, job_id: JOB_A, tenant_id: TENANT_A, opaque_target_hash: HASH_A })).toThrow(/pending state|constraint/i);
      expect(() => checkpointDb.prepare("INSERT INTO tenant_deletion_checkpoints (id, job_id, tenant_id, store_class, required, opaque_target_hash) VALUES (?, ?, ?, ?, 0, ?)").run(`${CHECKPOINT_PREFIX_B}000000000005`, JOB_A, TENANT_A, "cache_idempotency", HASH_A)).toThrow(/required|constraint/i);
    } finally { checkpointDb.close(); }
  });

  it("binds actor identities to their tenant memberships", () => {
    const requesterDb = database();
    try {
      expect(() => insertJob(requesterDb, { requested_by_auth_identity_id: IDENTITY_B })).toThrow(/requester|identity|membership|constraint/i);
    } finally { requesterDb.close(); }

    const verifierDb = database();
    try {
      insertJob(verifierDb);
      expect(() => verifierDb.prepare("UPDATE tenant_deletion_jobs SET status = 'verified', verified_by_auth_identity_id = ?, verified_by_membership_id = ?, verified_at = ? WHERE id = ?").run(IDENTITY_B, MEMBERSHIP_A, T1, JOB_A)).toThrow(/verifier|identity|membership|constraint/i);
    } finally { verifierDb.close(); }

    const approverDb = database();
    try {
      insertJob(approverDb);
      approverDb.prepare("UPDATE tenant_deletion_jobs SET status = 'verified', verified_by_auth_identity_id = ?, verified_by_membership_id = ?, verified_at = ? WHERE id = ?").run(IDENTITY_A, MEMBERSHIP_A, T1, JOB_A);
      expect(() => approverDb.prepare("UPDATE tenant_deletion_jobs SET status = 'scheduled', approved_by_auth_identity_id = ?, approved_by_membership_id = ?, approved_at = ?, scheduled_at = ? WHERE id = ?").run(IDENTITY_B, MEMBERSHIP_A, T2, T2, JOB_A)).toThrow(/approver|identity|membership|constraint/i);
    } finally { approverDb.close(); }
  });

  it("authors ledger clocks in SQLite and rejects caller chronology overrides", () => {
    const db = database();
    try {
      insertJob(db);
      const jobClock = db.prepare("SELECT created_at, updated_at FROM tenant_deletion_jobs WHERE id = ?").get(JOB_A) as { created_at: string; updated_at: string };
      expect(jobClock.created_at).not.toBe(T0);
      expect(jobClock.updated_at).not.toBe(T0);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET updated_at = ? WHERE id = ?").run("1900-01-01T00:00:00.000Z", JOB_A)).toThrow(/timestamp|constraint/i);
      db.prepare("UPDATE tenant_deletion_jobs SET updated_at = ? WHERE id = ?").run(T6, JOB_A);
      const touchedJob = db.prepare("SELECT created_at, updated_at FROM tenant_deletion_jobs WHERE id = ?").get(JOB_A) as { created_at: string; updated_at: string };
      expect(touchedJob.created_at).toBe(jobClock.created_at);
      expect(touchedJob.updated_at).not.toBe(T6);

      insertCheckpoints(db);
      const checkpointId = `${CHECKPOINT_PREFIX}000000000001`;
      db.prepare("UPDATE tenant_deletion_checkpoints SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?").run(T1, "2099-01-01T00:00:00.000Z", checkpointId);
      const checkpointClock = db.prepare("SELECT updated_at FROM tenant_deletion_checkpoints WHERE id = ?").get(checkpointId) as { updated_at: string };
      expect(checkpointClock.updated_at).not.toBe("2099-01-01T00:00:00.000Z");

      const eventSql = "INSERT INTO tenant_deletion_checkpoint_events (checkpoint_id, tenant_id, job_id, status, attempt, lease_generation, receipt_hash) VALUES (?, ?, ?, ?, ?, ?, ?)";
      db.prepare(eventSql).run(checkpointId, TENANT_A, JOB_A, "running", 0, 0, null);
      const eventClock = db.prepare("SELECT occurred_at FROM tenant_deletion_checkpoint_events WHERE checkpoint_id = ?").get(checkpointId) as { occurred_at: string };
      expect(eventClock.occurred_at).not.toBe(T0);
      expect(() => db.prepare("INSERT INTO tenant_deletion_checkpoint_events (checkpoint_id, tenant_id, job_id, status, attempt, lease_generation, receipt_hash, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(checkpointId, TENANT_A, JOB_A, "running", 0, 0, null, "1900-01-01T00:00:00.000Z")).toThrow(/timestamp|clock|constraint/i);
    } finally { db.close(); }
  });

  it("allows the configured maximum retry and rejects the next retry", () => {
    const db = database();
    try {
      insertJob(db, { max_retries: 1 }); insertCheckpoints(db); approveAndSchedule(db); startRunning(db);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'retry_wait', retry_count = 1, next_retry_at = ?, error_code = 'DELETE_CHECKPOINT_RETRYABLE', error_fingerprint = ? WHERE id = ?").run(T4, HASH_C, JOB_A)).not.toThrow();
      db.prepare("UPDATE tenant_deletion_jobs SET status = 'running', next_retry_at = NULL, error_code = NULL, error_fingerprint = NULL WHERE id = ?").run(JOB_A);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'retry_wait', retry_count = 2, next_retry_at = ?, error_code = 'DELETE_CHECKPOINT_RETRYABLE', error_fingerprint = ? WHERE id = ?").run(T5, HASH_C, JOB_A)).toThrow(/retry|bound|constraint/i);
    } finally { db.close(); }
  });

  it("permits an approved legal-hold subset exemption while keeping backup aging separate", () => {
    const db = database();
    try {
      insertJob(db, { legal_hold_status: "active_subset", legal_hold_snapshot_hash: HASH_A, held_scope_hash: HASH_B, uncovered_scope_hash: HASH_C });
      insertCheckpoints(db); approveAndSchedule(db); startRunning(db);
      for (const store of TENANT_DELETION_CHECKPOINT_STORES.slice(0, -2)) setCheckpoint(db, store, "complete");
      setCheckpoint(db, "logs_telemetry_aggregates", "exempted", { exemption_reason: "legal_hold_covered", exemption_approved: 1 });
      expect(canEnterTenantDeletionPrimaryDeleted({ checkpoints: TENANT_DELETION_CHECKPOINT_STORES.map((store) => store === "logs_telemetry_aggregates"
        ? { store, status: "exempted" as const, required: true, exemptionReason: "legal_hold_covered" as const, exemptionApproved: true }
        : { store, status: "complete" as const, required: true }) })).toBe(true);
      db.prepare("UPDATE tenant_deletion_jobs SET status = 'primary_deleted', primary_deleted_at = ?, backup_expiry_target_at = ?, updated_at = ? WHERE id = ?").run(T4, BACKUP_TARGET, T4, JOB_A);
      db.prepare("UPDATE tenant_deletion_jobs SET status = 'backup_aging', backup_aging_at = ?, updated_at = ? WHERE id = ?").run(T5, T5, JOB_A);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(T6, T6, JOB_A)).toThrow(/checkpoint/i);
      setCheckpoint(db, "backup_aging", "exempted", { exemption_reason: "backup_retention_only", exemption_approved: 1 });
      const retentionBoundary = (db.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 years') AS value").get() as { value: string }).value;
      db.prepare("INSERT INTO tenant_deletion_tombstones (id, job_id, tenant_id, scope_selector_hash, tenant_identity_hash, policy_version, retention_until) VALUES (?, ?, ?, ?, ?, ?, ?)").run("70000000-0000-4000-8000-000000000001", JOB_A, TENANT_A, HASH_A, HASH_B, "policy-v1", retentionBoundary);
      db.prepare("UPDATE tenant_deletion_jobs SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(T6, T6, JOB_A);
      expect(db.prepare("SELECT status, primary_deleted_at, backup_aging_at, completed_at FROM tenant_deletion_jobs WHERE id = ?").get(JOB_A)).toMatchObject({ status: "completed", primary_deleted_at: T4, backup_aging_at: T5, completed_at: T6 });
      expect(canEnterTenantDeletionCompleted({ checkpoints: TENANT_DELETION_CHECKPOINT_STORES.map((store) => store === "backup_aging"
        ? { store, status: "exempted" as const, required: true, exemptionReason: "backup_retention_only" as const, exemptionApproved: true }
        : { store, status: "complete" as const, required: true }) })).toBe(true);
    } finally { db.close(); }
  });

  it("bounds retry and rejects stale lease generations while preserving replay/conflict semantics", () => {
    const db = database();
    try {
      insertJob(db); insertCheckpoints(db); approveAndSchedule(db); startRunning(db);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET lease_generation = 1, updated_at = ? WHERE id = ?").run(T3, JOB_A)).toThrow(/generation|acquisition|lease/i);
      db.prepare("UPDATE tenant_deletion_jobs SET lease_generation = 1, lease_owner_hash = ?, lease_acquired_at = ?, lease_heartbeat_at = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?").run(HASH_A, T3, T3, T4, T3, JOB_A);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET lease_acquired_at = ?, updated_at = ? WHERE id = ?").run(T2, T3, JOB_A)).toThrow(/acquisition|generation|lease/i);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET lease_generation = 2, lease_owner_hash = ?, lease_acquired_at = ?, lease_heartbeat_at = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?").run(HASH_B, T3, T3, T4, T3, JOB_A)).toThrow(/generation|expiry|lease/i);
      db.prepare("UPDATE tenant_deletion_jobs SET lease_generation = 2, lease_owner_hash = ?, lease_acquired_at = ?, lease_heartbeat_at = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?").run(HASH_B, T4, T4, T5, T4, JOB_A);
      db.prepare("UPDATE tenant_deletion_jobs SET lease_owner_hash = NULL, updated_at = ? WHERE id = ?").run(T4, JOB_A);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'retry_wait', retry_count = 1, next_retry_at = ?, error_code = 'DELETE_CHECKPOINT_RETRYABLE', error_fingerprint = ?, updated_at = ? WHERE id = ?").run(T4, HASH_C, T4, JOB_A)).not.toThrow();
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET lease_generation = 3, lease_owner_hash = ?, updated_at = ? WHERE id = ?").run(HASH_A, T4, JOB_A)).toThrow(/generation|lease|constraint/i);
      expect(tenantDeletionIdempotencyResult(HASH_A, HASH_A)).toBe("replay");
      expect(tenantDeletionIdempotencyResult(HASH_A, HASH_B)).toBe("conflict");
    } finally { db.close(); }
  });

  it("enforces checkpoint state/lease exactness and deterministic event replay", () => {
    const db = database();
    try {
      insertJob(db); insertCheckpoints(db);
      const checkpointId = `${CHECKPOINT_PREFIX}000000000001`;
      expect(() => db.prepare("UPDATE tenant_deletion_checkpoints SET status = 'running', started_at = ?, attempt = 1, updated_at = ? WHERE id = ?").run(T1, T1, checkpointId)).toThrow(/attempt|constraint/i);
      expect(() => db.prepare("UPDATE tenant_deletion_checkpoints SET lease_generation = 1 WHERE id = ?").run(checkpointId)).toThrow(/generation|acquisition|constraint/i);
      expect(() => db.prepare("UPDATE tenant_deletion_checkpoints SET status = 'complete', started_at = ?, completed_at = ?, receipt_hash = ?, updated_at = ? WHERE id = ?").run(T1, T2, HASH_B, T2, checkpointId)).toThrow(/transition|constraint/i);
      db.prepare("UPDATE tenant_deletion_checkpoints SET status = 'running', started_at = ?, lease_generation = 1, lease_owner_hash = ?, lease_acquired_at = ?, lease_heartbeat_at = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?").run(T1, HASH_A, T1, T1, T2, T1, checkpointId);
      expect(() => db.prepare("UPDATE tenant_deletion_checkpoints SET lease_generation = 2, lease_owner_hash = ?, lease_acquired_at = ?, lease_heartbeat_at = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?").run(HASH_B, T1, T1, T2, T2, checkpointId)).toThrow(/generation|expiry|lease/i);
      db.prepare("UPDATE tenant_deletion_checkpoints SET lease_generation = 2, lease_owner_hash = ?, lease_acquired_at = ?, lease_heartbeat_at = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?").run(HASH_B, T2, T2, T3, T2, checkpointId);
      expect(() => db.prepare("UPDATE tenant_deletion_checkpoints SET lease_acquired_at = ?, updated_at = ? WHERE id = ?").run(T1, T2, checkpointId)).toThrow(/acquisition|generation|lease/i);
      expect(() => db.prepare("UPDATE tenant_deletion_checkpoints SET lease_owner_hash = ?, updated_at = ? WHERE id = ?").run(HASH_C, T2, checkpointId)).toThrow(/owner|generation/i);
      expect(() => db.prepare("UPDATE tenant_deletion_checkpoints SET lease_heartbeat_at = ?, updated_at = ? WHERE id = ?").run(T0, T2, checkpointId)).toThrow(/heartbeat|lease/i);

      const event = "INSERT INTO tenant_deletion_checkpoint_events (checkpoint_id, tenant_id, job_id, status, attempt, lease_generation, receipt_hash) VALUES (?, ?, ?, ?, ?, ?, ?)";
      db.prepare(event).run(checkpointId, TENANT_A, JOB_A, "running", 0, 2, null);
      expect(() => db.prepare(event).run(checkpointId, TENANT_A, JOB_A, "running", 0, 2, null)).toThrow(/unique|constraint/i);
      db.prepare("UPDATE tenant_deletion_checkpoints SET status = 'complete', completed_at = ?, receipt_hash = ?, lease_owner_hash = NULL, updated_at = ? WHERE id = ?").run(T2, HASH_B, T2, checkpointId);
      expect(() => db.prepare(event).run(checkpointId, TENANT_A, JOB_A, "complete", 0, 2, HASH_B)).not.toThrow();
      const laterCheckpointId = `${CHECKPOINT_PREFIX}000000000002`;
      db.prepare("UPDATE tenant_deletion_checkpoints SET status = 'running', started_at = ?, updated_at = ? WHERE id = ?").run(T1, T1, laterCheckpointId);
      db.prepare("UPDATE tenant_deletion_checkpoints SET status = 'retryable', attempt = 1, error_code = 'DELETE_CHECKPOINT_RETRYABLE', error_fingerprint = ?, updated_at = ? WHERE id = ?").run(HASH_C, T2, laterCheckpointId);
      db.prepare("UPDATE tenant_deletion_checkpoints SET status = 'running', error_code = NULL, error_fingerprint = NULL, lease_generation = 1, lease_owner_hash = ?, lease_acquired_at = ?, lease_heartbeat_at = ?, lease_expires_at = ?, updated_at = ? WHERE id = ?").run(HASH_B, T2, T2, T3, T2, laterCheckpointId);
      expect(() => db.prepare(event).run(laterCheckpointId, TENANT_A, JOB_A, "running", 1, 1, null)).not.toThrow();
    } finally { db.close(); }
  });

  it("makes tombstones write-last, scope-bound, and required before completion", () => {
    const db = database();
    try {
      insertJob(db); insertCheckpoints(db);
      const tombstoneSql = "INSERT INTO tenant_deletion_tombstones (id, job_id, tenant_id, scope_selector_hash, tenant_identity_hash, policy_version, retention_until) VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 years'))";
      expect(() => db.prepare(tombstoneSql).run("70000000-0000-4000-8000-000000000003", JOB_A, TENANT_A, HASH_A, HASH_B, "policy-v1")).toThrow(/tombstone|primary|constraint/i);
      approveAndSchedule(db); startRunning(db);
      for (const store of TENANT_DELETION_CHECKPOINT_STORES) setCheckpoint(db, store, "complete");
      db.prepare("UPDATE tenant_deletion_jobs SET status = 'primary_deleted', primary_deleted_at = ?, backup_expiry_target_at = ?, updated_at = ? WHERE id = ?").run(T4, BACKUP_TARGET, T4, JOB_A);
      expect(() => db.prepare(tombstoneSql).run("70000000-0000-4000-8000-000000000004", JOB_A, TENANT_A, HASH_B, HASH_B, "policy-v1")).toThrow(/facts|scope|constraint/i);
      expect(() => db.prepare(tombstoneSql).run("70000000-0000-4000-8000-000000000005", JOB_A, TENANT_A, HASH_A, HASH_B, "policy-v2")).toThrow(/facts|policy|constraint/i);
      const shortRetentionSql = "INSERT INTO tenant_deletion_tombstones (id, job_id, tenant_id, scope_selector_hash, tenant_identity_hash, policy_version, retention_until) VALUES (?, ?, ?, ?, ?, ?, ?)";
      expect(() => db.prepare(shortRetentionSql).run("70000000-0000-4000-8000-000000000007", JOB_A, TENANT_A, HASH_A, HASH_B, "policy-v1", "2027-07-27T00:00:00.000Z")).toThrow(/retention|constraint/i);
      const backdatedTombstoneSql = "INSERT INTO tenant_deletion_tombstones (id, job_id, tenant_id, scope_selector_hash, tenant_identity_hash, policy_version, retention_until, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      expect(() => db.prepare(backdatedTombstoneSql).run("70000000-0000-4000-8000-000000000008", JOB_A, TENANT_A, HASH_A, HASH_B, "policy-v1", "2033-07-27T00:00:00.000Z", T0)).toThrow(/clock|timestamp|constraint/i);
      db.prepare(tombstoneSql).run("70000000-0000-4000-8000-000000000006", JOB_A, TENANT_A, HASH_A, HASH_B, "policy-v1");
      const tombstone = db.prepare("SELECT created_at, retention_until FROM tenant_deletion_tombstones WHERE id = ?").get("70000000-0000-4000-8000-000000000006") as { created_at: string; retention_until: string };
      expect(tombstone.created_at).not.toBe(T5);
      expect(db.prepare("SELECT julianday(?) >= julianday(?, '+7 years') AS at_boundary").get(tombstone.retention_until, tombstone.created_at)).toEqual({ at_boundary: 1 });
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(T6, T6, JOB_A)).toThrow(/checkpoint|completion|transition/i);
    } finally { db.close(); }
  });

  it("keeps primary_deleted, backup_aging, and completed truthful and protects tombstone/history rows", () => {
    const db = database();
    try {
      insertJob(db); insertCheckpoints(db); approveAndSchedule(db); startRunning(db);
      for (const store of TENANT_DELETION_CHECKPOINT_STORES) setCheckpoint(db, store, "complete");
      expect(() => db.prepare("UPDATE tenant_deletion_checkpoints SET receipt_hash = ?, updated_at = ? WHERE job_id = ? AND store_class = 'cache_idempotency'").run(HASH_C, T4, JOB_A)).toThrow(/finalized|immutable|constraint/i);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET status = 'primary_deleted', primary_deleted_at = ?, backup_expiry_target_at = ?, updated_at = ? WHERE id = ?").run(T4, "2026-09-02T00:04:00.000Z", T4, JOB_A)).toThrow(/backup|constraint/i);
      db.prepare("UPDATE tenant_deletion_jobs SET status = 'primary_deleted', primary_deleted_at = ?, backup_expiry_target_at = ?, updated_at = ? WHERE id = ?").run(T4, BACKUP_TARGET, T4, JOB_A);
      expect(() => db.prepare("UPDATE tenant_deletion_jobs SET primary_deleted_at = ?, updated_at = ? WHERE id = ?").run(T5, T5, JOB_A)).toThrow(/timestamp|immutable|constraint/i);
      expect(db.prepare("SELECT status, completed_at FROM tenant_deletion_jobs WHERE id = ?").get(JOB_A)).toEqual({ status: "primary_deleted", completed_at: null });
      expect(db.prepare("SELECT backup_expiry_target_at FROM tenant_deletion_jobs WHERE id = ?").get(JOB_A)).toEqual({ backup_expiry_target_at: BACKUP_TARGET });
      db.prepare("UPDATE tenant_deletion_jobs SET status = 'backup_aging', backup_aging_at = ?, updated_at = ? WHERE id = ?").run(T5, T5, JOB_A);
      db.prepare("INSERT INTO tenant_deletion_tombstones (id, job_id, tenant_id, scope_selector_hash, tenant_identity_hash, policy_version, retention_until) VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+7 years'))").run("70000000-0000-4000-8000-000000000002", JOB_A, TENANT_A, HASH_A, HASH_B, "policy-v1");
      db.prepare("UPDATE tenant_deletion_jobs SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?").run(T6, T6, JOB_A);
      expect(() => db.prepare("UPDATE tenant_deletion_tombstones SET tenant_identity_hash = ? WHERE job_id = ?").run(HASH_C, JOB_A)).toThrow(/append-only/i);
      expect(() => db.prepare("DELETE FROM tenant_deletion_tombstones WHERE job_id = ?").run(JOB_A)).toThrow(/append-only/i);
      db.prepare("INSERT INTO tenant_deletion_checkpoint_events (checkpoint_id, tenant_id, job_id, status, attempt, lease_generation, receipt_hash) SELECT id, tenant_id, job_id, status, attempt, lease_generation, receipt_hash FROM tenant_deletion_checkpoints WHERE job_id = ? LIMIT 1").run(JOB_A);
      expect(() => db.prepare("UPDATE tenant_deletion_checkpoint_events SET status = 'complete' WHERE id = 1").run()).toThrow(/append-only/i);
    } finally { db.close(); }
  });
});
