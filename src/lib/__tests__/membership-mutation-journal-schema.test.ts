import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { SCHEMA_SQL } from "@/lib/db/schema";
import {
  SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
  SQLITE_SCHEMA_V1_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
  SQLITE_SCHEMA_V1_SQL,
} from "@/lib/db/sqlite-schema-v1";
import {
  classifySqliteMembershipJournalSchema,
  classifySqliteSchemaV1,
  coordinateSqliteMembershipJournalUpgrade,
  SQLITE_MEMBERSHIP_JOURNAL_APPLICATION_TABLE_COUNT,
  SQLITE_MEMBERSHIP_JOURNAL_USER_VERSION,
} from "@/lib/db/sqlite-schema-coordinator";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const ACTOR_A = "20000000-0000-4000-8000-000000000001";
const ACTOR_B = "20000000-0000-4000-8000-000000000002";
const TARGET_A = "30000000-0000-4000-8000-000000000001";
const BINDING_A = "40000000-0000-4000-8000-000000000001";
const BINDING_B = "40000000-0000-4000-8000-000000000002";
const CREATED_AT = "2026-08-30T00:00:00.000Z";
const COMPLETED_AT = "2026-08-30T00:00:01.000Z";

describe("SQLite tenant membership mutation journal", () => {
  it("is manifest-locked, identity-minimal, tenant-bound, and append-durable", () => {
    const db = new Database(":memory:");
    try {
      db.pragma("foreign_keys = ON");
      db.exec(SCHEMA_SQL);
      seedTenant(db, TENANT_A, ACTOR_A, BINDING_A);
      seedTenant(db, TENANT_B, ACTOR_B, BINDING_B);
      seedMembership(db, TENANT_A, TARGET_A);

      expect(SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT).toBe(37);
      expect(SQLITE_SCHEMA_V1_SQL).not.toContain("CREATE TABLE IF NOT EXISTS tenant_membership_mutation_journal");
      const columns = db.prepare("PRAGMA table_info(tenant_membership_mutation_journal)")
        .all() as Array<{ name: string }>;
      expect(columns.map(({ name }) => name)).not.toEqual(expect.arrayContaining([
        "auth_identity_id", "email", "identity_selector", "identity_selector_hash",
      ]));

      const insert = db.prepare(
        `INSERT INTO tenant_membership_mutation_journal
          (idempotency_key_hash, input_hash, tenant_id, actor_membership_id,
           actor_role_binding_id, operation, target_membership_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'assign_role', ?, ?)`,
      );
      expect(() => insert.run(hash(1), hash(2), TENANT_A, ACTOR_B, BINDING_B, TARGET_A, CREATED_AT))
        .toThrow();

      const missingTarget = "50000000-0000-4000-8000-000000000001";
      insert.run(hash(3), hash(4), TENANT_A, ACTOR_A, BINDING_A, missingTarget, CREATED_AT);
      expect(() => db.prepare(
        `UPDATE tenant_membership_mutation_journal
         SET status = 'completed', result_json = '{}', completed_at = ?
         WHERE idempotency_key_hash = ?`,
      ).run(COMPLETED_AT, hash(3))).toThrow(/target is not tenant-owned/u);

      insert.run(hash(5), hash(6), TENANT_A, ACTOR_A, BINDING_A, TARGET_A, CREATED_AT);
      db.prepare(
        `UPDATE tenant_membership_mutation_journal
         SET status = 'completed', result_json = '{}', completed_at = ?
         WHERE idempotency_key_hash = ?`,
      ).run(COMPLETED_AT, hash(5));
      expect(db.prepare(
        "SELECT status, result_json FROM tenant_membership_mutation_journal WHERE idempotency_key_hash = ?",
      ).get(hash(5))).toEqual({ status: "completed", result_json: "{}" });
      expect(() => db.prepare(
        "UPDATE tenant_membership_mutation_journal SET result_json = '{\"changed\":true}' WHERE idempotency_key_hash = ?",
      ).run(hash(5))).toThrow(/reserved-to-completed/u);
      expect(() => db.prepare(
        "DELETE FROM tenant_membership_mutation_journal WHERE idempotency_key_hash = ?",
      ).run(hash(5))).toThrow(/durable/u);
    } finally {
      db.close();
    }
  });

  it("upgrades the exact frozen 37-table final catalog additively without rewriting source data", () => {
    const db = new Database(":memory:");
    try {
      db.pragma("foreign_keys = ON");
      db.exec(SQLITE_SCHEMA_V1_SQL);
      db.pragma(`user_version = ${SQLITE_SCHEMA_V1_FINAL_USER_VERSION}`);
      db.prepare("INSERT INTO zip_codes (zip, city, state, county) VALUES ('80000', 'Original', 'CO', 'Test')")
        .run();

      expect(classifySqliteSchemaV1(db)).toMatchObject({
        kind: "final",
        userVersion: SQLITE_SCHEMA_V1_FINAL_USER_VERSION,
        applicationTableCount: 37,
        catalogDigest: SQLITE_SCHEMA_V1_CATALOG_DIGEST,
      });
      expect(classifySqliteMembershipJournalSchema(db)).toMatchObject({ kind: "upgrade-required" });

      expect(coordinateSqliteMembershipJournalUpgrade(db)).toMatchObject({
        status: "upgraded",
        state: {
          kind: "ready",
          userVersion: SQLITE_MEMBERSHIP_JOURNAL_USER_VERSION,
          applicationTableCount: SQLITE_MEMBERSHIP_JOURNAL_APPLICATION_TABLE_COUNT,
        },
      });
      expect(db.prepare("SELECT city FROM zip_codes WHERE zip = '80000'").get())
        .toEqual({ city: "Original" });
      expect(db.prepare(
        "SELECT COUNT(*) AS count FROM tenant_membership_mutation_journal",
      ).get()).toEqual({ count: 0 });
      expect(coordinateSqliteMembershipJournalUpgrade(db)).toMatchObject({ status: "replayed" });
    } finally {
      db.close();
    }
  });
});

function seedTenant(db: Database.Database, tenantId: string, membershipId: string, bindingId: string): void {
  db.prepare("INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, 'active')")
    .run(tenantId, `tenant-${tenantId.at(-1)}`, tenantId);
  seedMembership(db, tenantId, membershipId);
  db.prepare(
    `INSERT INTO tenant_role_bindings
      (id, tenant_id, membership_id, role, created_at, valid_from, reason_code)
     VALUES (?, ?, ?, 'admin', ?, ?, 'initial_provisioning')`,
  ).run(bindingId, tenantId, membershipId, CREATED_AT, CREATED_AT);
}

function seedMembership(db: Database.Database, tenantId: string, membershipId: string): void {
  db.prepare(
    `INSERT INTO tenant_memberships
      (id, tenant_id, auth_identity_id, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`,
  ).run(membershipId, tenantId, crypto.randomUUID(), CREATED_AT, CREATED_AT);
}

function hash(value: number): string {
  return value.toString(16).padStart(64, "0");
}
