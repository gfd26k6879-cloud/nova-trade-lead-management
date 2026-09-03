import { createHash } from "node:crypto";

export const COMPATIBILITY_BACKFILL_SCHEMA_VERSION = 1 as const;
export const SQLITE_COMPATIBILITY_SOURCE_ENGINE = "sqlite" as const;
export const SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM = "novatrade-sqlite-canonical-json-v1" as const;
export const POSTGRES_COMPATIBILITY_SOURCE_ENGINE = "postgres" as const;
export const POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM = "novatrade-postgres-jsonb-text-v1" as const;

export const COMPATIBILITY_TENANT_TABLES = [
  "settings",
  "user_market_access",
  "leads",
  "place_cache",
  "places_master",
  "place_observations",
  "api_usage_events",
  "ai_usage_events",
  "audit_logs",
  "crawl_runs",
  "crawl_units",
  "lead_notes",
  "outreach_events",
  "admin_requests",
  "demos",
  "ai_lead_verifications",
  "lead_ai_artifacts",
  "ai_feedback_events",
] as const;

export const COMPATIBILITY_WORKSPACE_TABLES = new Set<string>([
  "user_market_access",
  "crawl_runs",
  "crawl_units",
  "lead_notes",
  "outreach_events",
  "admin_requests",
  "demos",
  "ai_lead_verifications",
  "lead_ai_artifacts",
  "ai_feedback_events",
]);

export const COMPATIBILITY_PRESERVED_TABLES = new Set<string>(["audit_logs"]);

export type CompatibilityRole =
  | "owner"
  | "admin"
  | "strategist_manager"
  | "researcher"
  | "reviewer"
  | "outreach_operator"
  | "analyst_read_only";

export interface CompatibilityUserMapping {
  legacyUserId: string;
  authIdentityId: string;
  expectedEmail: string;
  expectedLegacyRole: "admin" | "researcher";
  expectedStatus: "active" | "disabled";
  membershipId: string;
  workspaceId?: string;
  membershipRole: CompatibilityRole;
  membershipStatus: "active" | "pending" | "suspended" | "revoked";
  roleBindingId: string;
  marketAccessIds: readonly string[];
}

export interface CompatibilityTableExpectation {
  table: (typeof COMPATIBILITY_TENANT_TABLES)[number];
  rowCount: number;
  contentChecksum: string;
}

export interface CompatibilityBackfillManifest {
  schemaVersion: typeof COMPATIBILITY_BACKFILL_SCHEMA_VERSION;
  sourceEngine: typeof SQLITE_COMPATIBILITY_SOURCE_ENGINE | typeof POSTGRES_COMPATIBILITY_SOURCE_ENGINE;
  checksumAlgorithm: typeof SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM | typeof POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM;
  idempotencyKey: string;
  sourceSnapshotFingerprint: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  ownerLegacyUserId: string;
  ownerAuthIdentityId: string;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  legacyUsers: readonly CompatibilityUserMapping[];
  legacyTables: readonly CompatibilityTableExpectation[];
}

export interface SqliteBackfillRow {
  [column: string]: unknown;
}

export interface SqliteBackfillDb {
  all<T extends SqliteBackfillRow = SqliteBackfillRow>(sql: string, params?: readonly unknown[]): readonly T[];
  get<T extends SqliteBackfillRow = SqliteBackfillRow>(sql: string, params?: readonly unknown[]): T | undefined;
  run(sql: string, params?: readonly unknown[]): { changes: number };
  /** The implementation must use BEGIN IMMEDIATE for mode="immediate". */
  transaction<T>(work: (db: SqliteBackfillDb) => T, mode?: "deferred" | "immediate"): T;
}

export interface SqliteCompatibilityPreparationReceipt {
  status: "prepared";
  addedTenantColumns: readonly string[];
  addedWorkspaceColumns: readonly string[];
  receiptTableCreated: boolean;
  receiptProtectionInstalled: boolean;
  activation: "call prepareSqliteCompatibilityBackfill before runSqliteCompatibilityBackfill; real activation requires approved compatibility identity and authorized rehearsal snapshot";
}

export interface CompatibilityBackfillReceipt {
  receiptId: string;
  status: "completed";
  schemaVersion: 1;
  sourceEngine: typeof SQLITE_COMPATIBILITY_SOURCE_ENGINE | typeof POSTGRES_COMPATIBILITY_SOURCE_ENGINE;
  checksumAlgorithm: typeof SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM | typeof POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM;
  idempotencyKey: string;
  manifestHash: string;
  sourceSnapshotFingerprint: string;
  tenantId: string;
  workspaceId: string;
  ownerAuthIdentityId: string;
  policyId: string;
  policyVersion: number;
  policyHash: string;
  userCount: number;
  tableCounts: Record<string, number>;
  beforeContentChecksums: Record<string, string>;
  afterContentChecksums: Record<string, string>;
  relationshipOrphanCount: 0;
  rollback: "snapshot_restore_only";
  activation: "real activation requires approved compatibility identity and authorized rehearsal snapshot";
}

export class CompatibilityBackfillError extends Error {
  public readonly code: string;

  public constructor(code: string, message = code) {
    super(message);
    this.name = "CompatibilityBackfillError";
    this.code = code;
  }
}

const WORKSPACE_TABLE_NAMES = [...COMPATIBILITY_WORKSPACE_TABLES];
const REQUIRED_LEGACY_BASE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  settings: ["id"],
  user_market_access: ["user_id", "market_id"],
  leads: ["id"],
  place_cache: ["place_id"],
  places_master: ["place_id"],
  place_observations: ["id"],
  api_usage_events: ["id"],
  ai_usage_events: ["id"],
  audit_logs: ["id", "scope_kind"],
  crawl_runs: ["id"],
  crawl_units: ["id", "crawl_run_id"],
  lead_notes: ["id", "lead_id"],
  outreach_events: ["id", "lead_id"],
  admin_requests: ["id", "lead_id"],
  demos: ["id", "lead_id"],
  ai_lead_verifications: ["id", "lead_id"],
  lead_ai_artifacts: ["id", "lead_id"],
  ai_feedback_events: ["id", "lead_id"],
};

// These are the auth-identity references in the bounded D-001/T-028 dataset.
// Historical audit actors are deliberately excluded because audit_logs remains
// preserved as legacy_unscoped under T-015 and is never assigned to the tenant.
const COMPATIBILITY_AUTH_REFERENCE_COLUMNS = [
  ["app_users", "created_by"],
  ["app_users", "team_lead_user_id"],
  ["user_market_access", "user_id"],
  ["user_market_access", "created_by_user_id"],
  ["leads", "archived_by_user_id"],
  ["leads", "quality_checked_by_user_id"],
  ["leads", "assigned_to_user_id"],
  ["ai_usage_events", "actor_user_id"],
  ["crawl_runs", "created_by_user_id"],
  ["lead_notes", "author_user_id"],
  ["outreach_events", "actor_user_id"],
  ["admin_requests", "created_by_user_id"],
  ["admin_requests", "assigned_admin_user_id"],
  ["demos", "published_by_user_id"],
  ["demos", "unpublished_by_user_id"],
  ["demos", "revoked_by_user_id"],
  ["ai_lead_verifications", "requested_by_user_id"],
  ["lead_ai_artifacts", "requested_by_user_id"],
  ["ai_feedback_events", "actor_user_id"],
] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ID_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function fail(code: string, detail?: string): never {
  throw new CompatibilityBackfillError(code, detail ? `${code}:${detail}` : code);
}

function assertUuid(value: string, code: string): void {
  if (!UUID_PATTERN.test(value)) fail(code);
}

function assertSha256(value: string, code: string): void {
  if (!SHA256_PATTERN.test(value)) fail(code);
}

function assertString(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) fail(code);
}

function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => compareCodeUnits(left, right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function compatibilityManifestHash(manifest: CompatibilityBackfillManifest): string {
  return createHash("sha256").update(canonicalize(manifest)).digest("hex");
}

export function compatibilityContentChecksum(rows: readonly SqliteBackfillRow[]): string {
  const content = rows
    .map((row) => {
      const withoutScope = Object.fromEntries(
        Object.entries(row).filter(([key]) => key !== "tenant_id" && key !== "workspace_id"),
      );
      return canonicalize(withoutScope);
    })
    .sort(compareCodeUnits)
    .join("|");
  return createHash("sha256").update(content).digest("hex");
}

function quoteIdentifier(identifier: string): string {
  const safeIdentifiers = new Set<string>([
    ...COMPATIBILITY_TENANT_TABLES,
    "app_users",
    "tenants",
    "workspaces",
    "tenant_memberships",
    "tenant_role_bindings",
    "tenant_policies",
    "compatibility_backfill_receipts",
  ]);
  if (!safeIdentifiers.has(identifier)) fail("T028_UNKNOWN_LEGACY_TABLE");
  return `"${identifier}"`;
}

function asRecord(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function readReceipt(row: SqliteBackfillRow): CompatibilityBackfillReceipt {
  const parsed = JSON.parse(String(row.receipt_json)) as unknown;
  return asRecord(parsed, "T028_RECEIPT_INVALID") as unknown as CompatibilityBackfillReceipt;
}

function assertManifestShape(manifest: CompatibilityBackfillManifest): void {
  if (manifest.schemaVersion !== COMPATIBILITY_BACKFILL_SCHEMA_VERSION) fail("T028_SCHEMA_VERSION_UNSUPPORTED");
  if (manifest.sourceEngine !== SQLITE_COMPATIBILITY_SOURCE_ENGINE || manifest.checksumAlgorithm !== SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM) fail("T028_SOURCE_ENGINE_CONTRACT_MISMATCH");
  if (!ID_KEY_PATTERN.test(manifest.idempotencyKey)) fail("T028_IDEMPOTENCY_KEY_INVALID");
  assertSha256(manifest.sourceSnapshotFingerprint, "T028_SOURCE_FINGERPRINT_INVALID");
  assertUuid(manifest.tenantId, "T028_TENANT_ID_INVALID");
  assertUuid(manifest.workspaceId, "T028_WORKSPACE_ID_INVALID");
  assertUuid(manifest.ownerAuthIdentityId, "T028_OWNER_IDENTITY_INVALID");
  assertUuid(manifest.policyId, "T028_POLICY_ID_INVALID");
  if (!Number.isSafeInteger(manifest.policyVersion) || manifest.policyVersion < 1) fail("T028_POLICY_VERSION_INVALID");
  assertSha256(manifest.policyHash, "T028_POLICY_HASH_INVALID");
  assertString(manifest.ownerLegacyUserId, "T028_OWNER_LEGACY_USER_REQUIRED");
  assertString(manifest.tenantSlug, "T028_TENANT_SLUG_REQUIRED");
  assertString(manifest.tenantName, "T028_TENANT_NAME_REQUIRED");
  assertString(manifest.workspaceSlug, "T028_WORKSPACE_SLUG_REQUIRED");
  assertString(manifest.workspaceName, "T028_WORKSPACE_NAME_REQUIRED");
  if (manifest.legacyUsers.length === 0) fail("T028_USERS_REQUIRED");
  if (manifest.legacyTables.length !== COMPATIBILITY_TENANT_TABLES.length) fail("T028_TABLE_MANIFEST_SET_MISMATCH");

  const seenTables = new Set<string>();
  for (const table of manifest.legacyTables) {
    if (seenTables.has(table.table) || !COMPATIBILITY_TENANT_TABLES.includes(table.table)) fail("T028_DUPLICATE_OR_UNKNOWN_TABLE");
    seenTables.add(table.table);
    if (!Number.isSafeInteger(table.rowCount) || table.rowCount < 0) fail("T028_TABLE_EXPECTATION_INVALID");
    assertSha256(table.contentChecksum, "T028_TABLE_CHECKSUM_INVALID");
  }
  if (seenTables.size !== COMPATIBILITY_TENANT_TABLES.length) fail("T028_TABLE_MANIFEST_SET_MISMATCH");

  const legacyIds = new Set<string>();
  const authIds = new Set<string>();
  const membershipIds = new Set<string>();
  const roleBindingIds = new Set<string>();
  let ownerCount = 0;
  for (const user of manifest.legacyUsers) {
    assertString(user.legacyUserId, "T028_LEGACY_USER_ID_REQUIRED");
    assertUuid(user.authIdentityId, "T028_AUTH_IDENTITY_INVALID");
    assertString(user.expectedEmail, "T028_EXPECTED_EMAIL_REQUIRED");
    assertUuid(user.membershipId, "T028_MEMBERSHIP_ID_INVALID");
    assertUuid(user.roleBindingId, "T028_ROLE_BINDING_ID_INVALID");
    if (user.workspaceId !== undefined) assertUuid(user.workspaceId, "T028_MEMBERSHIP_WORKSPACE_ID_INVALID");
    if (legacyIds.has(user.legacyUserId)) fail("T028_DUPLICATE_LEGACY_USER_ID");
    if (authIds.has(user.authIdentityId)) fail("T028_DUPLICATE_IDENTITY_MAPPING");
    if (membershipIds.has(user.membershipId)) fail("T028_DUPLICATE_MEMBERSHIP_ID");
    if (roleBindingIds.has(user.roleBindingId)) fail("T028_DUPLICATE_ROLE_BINDING_ID");
    legacyIds.add(user.legacyUserId);
    authIds.add(user.authIdentityId);
    membershipIds.add(user.membershipId);
    roleBindingIds.add(user.roleBindingId);
    if (user.expectedStatus === "active" && !["active", "pending"].includes(user.membershipStatus)) fail("T028_ACTIVE_USER_MEMBERSHIP_STATUS_INVALID");
    if (user.expectedStatus === "disabled" && !["suspended", "revoked"].includes(user.membershipStatus)) fail("T028_DISABLED_USER_MEMBERSHIP_MUST_NOT_AUTHORIZE");
    if (user.membershipRole === "owner" && (user.expectedStatus !== "active" || user.membershipStatus !== "active")) fail("T028_OWNER_MUST_BE_ACTIVE");
    if (user.membershipRole === "owner") {
      ownerCount += 1;
      if (user.legacyUserId !== manifest.ownerLegacyUserId || user.authIdentityId !== manifest.ownerAuthIdentityId) fail("T028_OWNER_MAPPING_MISMATCH");
    }
    if (!Array.isArray(user.marketAccessIds) || new Set(user.marketAccessIds).size !== user.marketAccessIds.length) fail("T028_MARKET_MAPPING_INVALID");
  }
  if (ownerCount !== 1) fail("T028_EXACTLY_ONE_OWNER_REQUIRED");
}

function expectedTable(manifest: CompatibilityBackfillManifest, table: string): CompatibilityTableExpectation {
  const found = manifest.legacyTables.find((entry) => entry.table === table);
  if (!found) fail("T028_TABLE_MANIFEST_SET_MISMATCH", table);
  return found;
}

function assertColumns(db: SqliteBackfillDb, table: string, columns: readonly string[]): void {
  const actual = new Set(db.all<{ name: string }>(`PRAGMA table_info(${quoteIdentifier(table)})`).map((row) => row.name));
  for (const column of columns) if (!actual.has(column)) fail("T028_REQUIRED_COLUMN_MISSING", `${table}.${column}`);
}

interface SqliteColumnInfo extends SqliteBackfillRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

function normalizedSql(value: string): string {
  return value.replace(/\s+/g, " ").trim().toUpperCase();
}

function assertNullableTextColumn(db: SqliteBackfillDb, table: string, column: string): void {
  const actual = db.all<SqliteColumnInfo>(`PRAGMA table_info(${quoteIdentifier(table)})`).find((entry) => entry.name === column);
  if (!actual) fail("T028_REQUIRED_COLUMN_MISSING", `${table}.${column}`);
  if (actual.type.toUpperCase() !== "TEXT" || actual.notnull !== 0) fail("T028_SCOPE_COLUMN_DECLARATION_DRIFT", `${table}.${column}`);
}

function assertSqliteForeignKeysEnabled(db: SqliteBackfillDb): void {
  const row = db.get<{ foreign_keys: number }>("PRAGMA foreign_keys");
  if (Number(row?.foreign_keys ?? 0) !== 1) fail("T028_SQLITE_FOREIGN_KEYS_REQUIRED");
}

function ensureSqlitePolicyTenantIndex(db: SqliteBackfillDb): void {
  const indexName = "compatibility_tenant_policies_tenant_id_id_unique";
  const indexes = db.all<{ name: string; unique: number }>("PRAGMA index_list(tenant_policies)");
  const index = indexes.find((candidate) => candidate.name === indexName);
  if (index && index.unique !== 1) fail("T028_POLICY_INDEX_DRIFT", indexName);
  if (index) {
    const columns = db.all<{ name: string }>(`PRAGMA index_info(${indexName})`).map((column) => column.name);
    if (columns.length !== 2 || columns[0] !== "tenant_id" || columns[1] !== "id") fail("T028_POLICY_INDEX_DRIFT", indexName);
  } else {
    db.run(`CREATE UNIQUE INDEX ${indexName} ON tenant_policies(tenant_id, id)`);
  }
}

function assertReceiptTableContract(db: SqliteBackfillDb): void {
  const tableSql = db.get<{ sql: string }>("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?", ["compatibility_backfill_receipts"])?.sql;
  if (!tableSql) fail("T028_RECEIPT_TABLE_DRIFT");
  const normalized = normalizedSql(tableSql);
  if (!normalized.includes("FOREIGN KEY (TENANT_ID, WORKSPACE_ID) REFERENCES WORKSPACES(TENANT_ID, ID)")) fail("T028_RECEIPT_TABLE_DRIFT");
  if (!normalized.includes("FOREIGN KEY (TENANT_ID, POLICY_ID) REFERENCES TENANT_POLICIES(TENANT_ID, ID)")) fail("T028_RECEIPT_TABLE_DRIFT");
  if (!normalized.includes("STATUS TEXT NOT NULL CHECK(STATUS = 'COMPLETED')")) fail("T028_RECEIPT_TABLE_DRIFT");
  if (!normalized.includes("RECEIPT_JSON TEXT NOT NULL")) fail("T028_RECEIPT_TABLE_DRIFT");
  if (!normalized.includes("POLICY_VERSION INTEGER NOT NULL CHECK(POLICY_VERSION >= 1)")) fail("T028_RECEIPT_TABLE_DRIFT");
  if (!normalized.includes("POLICY_HASH TEXT NOT NULL CHECK(LENGTH(POLICY_HASH) = 64")) fail("T028_RECEIPT_TABLE_DRIFT");
  if (!normalized.includes("SOURCE_ENGINE TEXT NOT NULL CHECK(SOURCE_ENGINE = 'SQLITE')")) fail("T028_RECEIPT_TABLE_DRIFT");
  if (!normalized.includes("CHECKSUM_ALGORITHM TEXT NOT NULL CHECK(CHECKSUM_ALGORITHM = 'NOVATRADE-SQLITE-CANONICAL-JSON-V1')")) fail("T028_RECEIPT_TABLE_DRIFT");
  const expectedColumns: Readonly<Record<string, string>> = {
    id: "TEXT",
    idempotency_key: "TEXT",
    schema_version: "INTEGER",
    source_engine: "TEXT",
    checksum_algorithm: "TEXT",
    manifest_hash: "TEXT",
    source_snapshot_fingerprint: "TEXT",
    tenant_id: "TEXT",
    workspace_id: "TEXT",
    owner_auth_identity_id: "TEXT",
    policy_id: "TEXT",
    policy_version: "INTEGER",
    policy_hash: "TEXT",
    user_count: "INTEGER",
    table_counts_json: "TEXT",
    before_checksums_json: "TEXT",
    after_checksums_json: "TEXT",
    relationship_orphan_count: "INTEGER",
    status: "TEXT",
    created_at: "TEXT",
    completed_at: "TEXT",
    receipt_json: "TEXT",
  };
  const columns = db.all<SqliteColumnInfo>("PRAGMA table_info(compatibility_backfill_receipts)");
  for (const [name, type] of Object.entries(expectedColumns)) {
    const actual = columns.find((column) => column.name === name);
    if (!actual || actual.type.toUpperCase() !== type || (name !== "id" && actual.notnull !== 1)) fail("T028_RECEIPT_COLUMN_DRIFT", name);
  }
  const indexes = db.all<{ name: string; unique: number }>("PRAGMA index_list(compatibility_backfill_receipts)");
  const keyIndex = indexes.find((index) => index.name === "compatibility_backfill_receipts_key_unique");
  if (keyIndex && keyIndex.unique !== 1) fail("T028_RECEIPT_INDEX_DRIFT", "compatibility_backfill_receipts_key_unique");
  if (keyIndex) {
    const indexedColumns = db.all<{ name: string }>("PRAGMA index_info(compatibility_backfill_receipts_key_unique)").map((column) => column.name);
    if (indexedColumns.length !== 1 || indexedColumns[0] !== "idempotency_key") fail("T028_RECEIPT_INDEX_DRIFT", "compatibility_backfill_receipts_key_unique");
  }
  if (!keyIndex) db.run("CREATE UNIQUE INDEX compatibility_backfill_receipts_key_unique ON compatibility_backfill_receipts(idempotency_key)");
  const triggers = db.all<{ name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name IN (?, ?, ?)", [
    "trg_t028_compatibility_receipt_no_update",
    "trg_t028_compatibility_receipt_no_delete",
    "trg_t028_compatibility_receipt_binding",
  ]);
  const expectedTriggers: Readonly<Record<string, string>> = {
    trg_t028_compatibility_receipt_no_update: "CREATE TRIGGER TRG_T028_COMPATIBILITY_RECEIPT_NO_UPDATE BEFORE UPDATE ON COMPATIBILITY_BACKFILL_RECEIPTS BEGIN SELECT RAISE(ABORT, 'COMPATIBILITY BACKFILL RECEIPTS ARE APPEND-ONLY'); END",
    trg_t028_compatibility_receipt_no_delete: "CREATE TRIGGER TRG_T028_COMPATIBILITY_RECEIPT_NO_DELETE BEFORE DELETE ON COMPATIBILITY_BACKFILL_RECEIPTS BEGIN SELECT RAISE(ABORT, 'COMPATIBILITY BACKFILL RECEIPTS ARE APPEND-ONLY'); END",
    trg_t028_compatibility_receipt_binding: "CREATE TRIGGER TRG_T028_COMPATIBILITY_RECEIPT_BINDING BEFORE INSERT ON COMPATIBILITY_BACKFILL_RECEIPTS BEGIN SELECT CASE WHEN JSON_EXTRACT(NEW.RECEIPT_JSON, '$.RECEIPTID') IS NOT NEW.ID OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.IDEMPOTENCYKEY') IS NOT NEW.IDEMPOTENCY_KEY OR CAST(JSON_EXTRACT(NEW.RECEIPT_JSON, '$.SCHEMAVERSION') AS INTEGER) IS NOT NEW.SCHEMA_VERSION OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.SOURCEENGINE') IS NOT NEW.SOURCE_ENGINE OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.CHECKSUMALGORITHM') IS NOT NEW.CHECKSUM_ALGORITHM OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.MANIFESTHASH') IS NOT NEW.MANIFEST_HASH OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.SOURCESNAPSHOTFINGERPRINT') IS NOT NEW.SOURCE_SNAPSHOT_FINGERPRINT OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.TENANTID') IS NOT NEW.TENANT_ID OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.WORKSPACEID') IS NOT NEW.WORKSPACE_ID OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.OWNERAUTHIDENTITYID') IS NOT NEW.OWNER_AUTH_IDENTITY_ID OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.POLICYID') IS NOT NEW.POLICY_ID OR CAST(JSON_EXTRACT(NEW.RECEIPT_JSON, '$.POLICYVERSION') AS INTEGER) IS NOT NEW.POLICY_VERSION OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.POLICYHASH') IS NOT NEW.POLICY_HASH OR CAST(JSON_EXTRACT(NEW.RECEIPT_JSON, '$.USERCOUNT') AS INTEGER) IS NOT NEW.USER_COUNT OR JSON(NEW.TABLE_COUNTS_JSON) IS NOT JSON(JSON_EXTRACT(NEW.RECEIPT_JSON, '$.TABLECOUNTS')) OR JSON(NEW.BEFORE_CHECKSUMS_JSON) IS NOT JSON(JSON_EXTRACT(NEW.RECEIPT_JSON, '$.BEFORECONTENTCHECKSUMS')) OR JSON(NEW.AFTER_CHECKSUMS_JSON) IS NOT JSON(JSON_EXTRACT(NEW.RECEIPT_JSON, '$.AFTERCONTENTCHECKSUMS')) OR CAST(JSON_EXTRACT(NEW.RECEIPT_JSON, '$.RELATIONSHIPORPHANCOUNT') AS INTEGER) IS NOT NEW.RELATIONSHIP_ORPHAN_COUNT OR JSON_EXTRACT(NEW.RECEIPT_JSON, '$.STATUS') IS NOT NEW.STATUS THEN RAISE(ABORT, 'COMPATIBILITY BACKFILL RECEIPT JSON BINDING MISMATCH') END; END",
  };
  for (const [name, definition] of Object.entries(expectedTriggers)) {
    const actual = triggers.find((trigger) => trigger.name === name);
    if (actual && normalizedSql(actual.sql).replace(/;$/, "") !== definition.replace(/;$/, "")) fail("T028_RECEIPT_TRIGGER_DRIFT", name);
    if (!actual && name === "trg_t028_compatibility_receipt_binding") db.run("CREATE TRIGGER trg_t028_compatibility_receipt_binding BEFORE INSERT ON compatibility_backfill_receipts BEGIN SELECT CASE WHEN json_extract(NEW.receipt_json, '$.receiptId') IS NOT NEW.id OR json_extract(NEW.receipt_json, '$.idempotencyKey') IS NOT NEW.idempotency_key OR CAST(json_extract(NEW.receipt_json, '$.schemaVersion') AS INTEGER) IS NOT NEW.schema_version OR json_extract(NEW.receipt_json, '$.sourceEngine') IS NOT NEW.source_engine OR json_extract(NEW.receipt_json, '$.checksumAlgorithm') IS NOT NEW.checksum_algorithm OR json_extract(NEW.receipt_json, '$.manifestHash') IS NOT NEW.manifest_hash OR json_extract(NEW.receipt_json, '$.sourceSnapshotFingerprint') IS NOT NEW.source_snapshot_fingerprint OR json_extract(NEW.receipt_json, '$.tenantId') IS NOT NEW.tenant_id OR json_extract(NEW.receipt_json, '$.workspaceId') IS NOT NEW.workspace_id OR json_extract(NEW.receipt_json, '$.ownerAuthIdentityId') IS NOT NEW.owner_auth_identity_id OR json_extract(NEW.receipt_json, '$.policyId') IS NOT NEW.policy_id OR CAST(json_extract(NEW.receipt_json, '$.policyVersion') AS INTEGER) IS NOT NEW.policy_version OR json_extract(NEW.receipt_json, '$.policyHash') IS NOT NEW.policy_hash OR CAST(json_extract(NEW.receipt_json, '$.userCount') AS INTEGER) IS NOT NEW.user_count OR json(NEW.table_counts_json) IS NOT json(json_extract(NEW.receipt_json, '$.tableCounts')) OR json(NEW.before_checksums_json) IS NOT json(json_extract(NEW.receipt_json, '$.beforeContentChecksums')) OR json(NEW.after_checksums_json) IS NOT json(json_extract(NEW.receipt_json, '$.afterContentChecksums')) OR CAST(json_extract(NEW.receipt_json, '$.relationshipOrphanCount') AS INTEGER) IS NOT NEW.relationship_orphan_count OR json_extract(NEW.receipt_json, '$.status') IS NOT NEW.status THEN RAISE(ABORT, 'compatibility backfill receipt JSON binding mismatch') END; END");
    if (!actual && name !== "trg_t028_compatibility_receipt_binding") {
      const operation = name.endsWith("no_update") ? "UPDATE" : "DELETE";
      db.run(`CREATE TRIGGER ${name} BEFORE ${operation} ON compatibility_backfill_receipts BEGIN SELECT RAISE(ABORT, 'compatibility backfill receipts are append-only'); END`);
    }
  }
}

function assertSqliteBaselinePolicy(db: SqliteBackfillDb, manifest: CompatibilityBackfillManifest): void {
  const policy = db.get<Record<string, unknown>>(
    `SELECT locale, timezone, export_retention_days, operational_log_retention_days, raw_source_retention_days,
      contact_freshness_days, primary_delete_within_days, backup_expire_within_days, tombstone_retention_years,
      active_materials_mode, ai_processing_enabled, source_research_enabled, contact_research_enabled,
      outreach_drafting_enabled, copy_export_enabled, autonomous_send_enabled, require_source_plan_approval,
      require_knowledge_review, require_icp_review, require_lead_play_review, require_contact_review,
      require_outreach_review
     FROM tenant_policies
     WHERE id = ? AND tenant_id = ? AND version = ? AND compatibility_policy_hash = ?`,
    [manifest.policyId, manifest.tenantId, manifest.policyVersion, manifest.policyHash],
  );
  const expected: Record<string, unknown> = {
    locale: "en-US", timezone: "UTC", export_retention_days: 7, operational_log_retention_days: 30,
    raw_source_retention_days: 180, contact_freshness_days: 180, primary_delete_within_days: 30,
    backup_expire_within_days: 35, tombstone_retention_years: 7,
    active_materials_mode: "while_authorized_until_superseded_policy_or_deletion",
    ai_processing_enabled: 0, source_research_enabled: 0, contact_research_enabled: 0,
    outreach_drafting_enabled: 0, copy_export_enabled: 0, autonomous_send_enabled: 0,
    require_source_plan_approval: 1, require_knowledge_review: 1, require_icp_review: 1,
    require_lead_play_review: 1, require_contact_review: 1, require_outreach_review: 1,
  };
  if (!policy || Object.entries(expected).some(([key, value]) => policy[key] !== value)) fail("T028_REPLAY_POLICY_BASELINE_DRIFT");
}

function tableExists(db: SqliteBackfillDb, table: string): boolean {
  return Boolean(db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", [table]));
}

/**
 * Prepare an existing local compatibility schema without touching data rows.
 * This is intentionally separate from the backfill: it only adds nullable
 * columns from the accepted D-001 map and creates the operator-only receipt
 * ledger. It never rebuilds, drops, or copies a legacy table.
 */
export function prepareSqliteCompatibilityBackfill(db: SqliteBackfillDb): SqliteCompatibilityPreparationReceipt {
  assertSqliteForeignKeysEnabled(db);
  return db.transaction((tx) => {
    assertSqliteForeignKeysEnabled(tx);
    const requiredTables = [
      ...COMPATIBILITY_TENANT_TABLES,
      "app_users",
      "tenants",
      "workspaces",
      "tenant_memberships",
      "tenant_role_bindings",
      "tenant_policies",
    ];
    for (const table of requiredTables) {
      if (!tableExists(tx, table)) fail("T028_REQUIRED_TABLE_MISSING", table);
    }
    assertColumns(tx, "app_users", ["id", "user_id", "email", "role", "status"]);
    for (const table of COMPATIBILITY_TENANT_TABLES) {
      assertColumns(tx, table, REQUIRED_LEGACY_BASE_COLUMNS[table]);
      const columns = new Set(tx.all<{ name: string }>(`PRAGMA table_info(${quoteIdentifier(table)})`).map((row) => row.name));
      if (columns.has("tenant_id")) assertNullableTextColumn(tx, table, "tenant_id");
      if (columns.has("workspace_id")) {
        if (!WORKSPACE_TABLE_NAMES.includes(table) && table !== "audit_logs") fail("T028_UNAPPROVED_SCOPE_COLUMN", `${table}.workspace_id`);
        assertNullableTextColumn(tx, table, "workspace_id");
      }
      if (table === "audit_logs" && (!columns.has("tenant_id") || !columns.has("workspace_id"))) fail("T028_AUDIT_SCOPE_COLUMNS_REQUIRED");
    }
    const policyColumns = new Set(tx.all<{ name: string }>("PRAGMA table_info(tenant_policies)").map((row) => row.name));
    if (!policyColumns.has("compatibility_policy_hash")) tx.run("ALTER TABLE tenant_policies ADD COLUMN compatibility_policy_hash TEXT");
    ensureSqlitePolicyTenantIndex(tx);

    const receiptTableCreated = !tableExists(tx, "compatibility_backfill_receipts");
    if (!receiptTableCreated) assertReceiptTableContract(tx);

    const addedTenantColumns: string[] = [];
    const addedWorkspaceColumns: string[] = [];
    for (const table of COMPATIBILITY_TENANT_TABLES) {
      const columns = new Set(tx.all<{ name: string }>(`PRAGMA table_info(${quoteIdentifier(table)})`).map((row) => row.name));
      if (!columns.has("tenant_id") && table !== "audit_logs") {
        tx.run(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN tenant_id TEXT`);
        addedTenantColumns.push(table);
      }
      if (WORKSPACE_TABLE_NAMES.includes(table) && !columns.has("workspace_id")) {
        tx.run(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN workspace_id TEXT`);
        addedWorkspaceColumns.push(table);
      }
    }

    const receiptColumns = [
      "id", "idempotency_key", "schema_version", "source_engine", "checksum_algorithm", "manifest_hash", "source_snapshot_fingerprint", "tenant_id", "workspace_id",
      "owner_auth_identity_id", "policy_id", "policy_version", "policy_hash", "user_count", "table_counts_json",
      "before_checksums_json", "after_checksums_json", "relationship_orphan_count", "status", "created_at",
      "completed_at", "receipt_json",
    ];
    if (receiptTableCreated) {
      tx.run(`CREATE TABLE compatibility_backfill_receipts (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        schema_version INTEGER NOT NULL CHECK(schema_version = 1),
        source_engine TEXT NOT NULL CHECK(source_engine = 'sqlite'),
        checksum_algorithm TEXT NOT NULL CHECK(checksum_algorithm = 'novatrade-sqlite-canonical-json-v1'),
        manifest_hash TEXT NOT NULL CHECK(length(manifest_hash) = 64 AND manifest_hash NOT GLOB '*[^0-9a-f]*'),
        source_snapshot_fingerprint TEXT NOT NULL CHECK(length(source_snapshot_fingerprint) = 64 AND source_snapshot_fingerprint NOT GLOB '*[^0-9a-f]*'),
        tenant_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        owner_auth_identity_id TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        policy_version INTEGER NOT NULL CHECK(policy_version >= 1),
        policy_hash TEXT NOT NULL CHECK(length(policy_hash) = 64 AND policy_hash NOT GLOB '*[^0-9a-f]*'),
        user_count INTEGER NOT NULL CHECK(user_count >= 0),
        table_counts_json TEXT NOT NULL,
        before_checksums_json TEXT NOT NULL,
        after_checksums_json TEXT NOT NULL,
        relationship_orphan_count INTEGER NOT NULL CHECK(relationship_orphan_count = 0),
        status TEXT NOT NULL CHECK(status = 'completed'),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        receipt_json TEXT NOT NULL,
        FOREIGN KEY (tenant_id, workspace_id) REFERENCES workspaces(tenant_id, id),
        FOREIGN KEY (tenant_id, policy_id) REFERENCES tenant_policies(tenant_id, id)
      )`);
    } else {
      assertColumns(tx, "compatibility_backfill_receipts", receiptColumns);
    }
    assertReceiptTableContract(tx);
    return {
      status: "prepared",
      addedTenantColumns,
      addedWorkspaceColumns,
      receiptTableCreated,
      receiptProtectionInstalled: true,
      activation: "call prepareSqliteCompatibilityBackfill before runSqliteCompatibilityBackfill; real activation requires approved compatibility identity and authorized rehearsal snapshot",
    };
  }, "immediate");
}

function tableRows(db: SqliteBackfillDb, table: string): readonly SqliteBackfillRow[] {
  return db.all(`SELECT * FROM ${quoteIdentifier(table)}`);
}

function assertSqliteAuthReferences(db: SqliteBackfillDb, manifest: CompatibilityBackfillManifest): void {
  const authIdentityCounts = new Map<string, number>();
  for (const user of manifest.legacyUsers) authIdentityCounts.set(user.authIdentityId, (authIdentityCounts.get(user.authIdentityId) ?? 0) + 1);
  for (const [table, column] of COMPATIBILITY_AUTH_REFERENCE_COLUMNS) {
    const columns = new Set(db.all<{ name: string }>(`PRAGMA table_info(${quoteIdentifier(table)})`).map((row) => row.name));
    if (!columns.has(column)) {
      if (table === "user_market_access" && column === "user_id") fail("T028_REQUIRED_COLUMN_MISSING", `${table}.${column}`);
      continue;
    }
    const references = db.all<{ identity: string }>(`SELECT "${column}" AS identity FROM ${quoteIdentifier(table)} WHERE "${column}" IS NOT NULL`);
    if (references.some((reference) => authIdentityCounts.get(String(reference.identity)) !== 1)) fail("T028_UNMAPPED_AUTH_REFERENCE", `${table}.${column}`);
  }
}

function assertRelationships(db: SqliteBackfillDb): void {
  const checks: readonly [string, string][] = [
    ["crawl_units", "crawl_runs"],
    ["outreach_events", "leads"],
    ["admin_requests", "leads"],
    ["demos", "leads"],
    ["lead_notes", "leads"],
    ["ai_lead_verifications", "leads"],
    ["lead_ai_artifacts", "leads"],
  ];
  for (const [child, parent] of checks) {
    const childKey = child === "crawl_units" ? "crawl_run_id" : "lead_id";
    const parentKey = "id";
    const orphans = db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${quoteIdentifier(child)} c LEFT JOIN ${quoteIdentifier(parent)} p ON p.${parentKey} = c.${childKey} WHERE p.${parentKey} IS NULL`,
    );
    if (Number(orphans?.count ?? 0) !== 0) fail("T028_RELATIONSHIP_ORPHANING");
  }
}

function verifySqliteReceipt(db: SqliteBackfillDb, manifest: CompatibilityBackfillManifest, receipt: CompatibilityBackfillReceipt): void {
  if (receipt.status !== "completed" || receipt.schemaVersion !== 1 || receipt.sourceEngine !== SQLITE_COMPATIBILITY_SOURCE_ENGINE || receipt.checksumAlgorithm !== SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM || receipt.sourceEngine !== manifest.sourceEngine || receipt.checksumAlgorithm !== manifest.checksumAlgorithm || receipt.idempotencyKey !== manifest.idempotencyKey || receipt.manifestHash !== compatibilityManifestHash(manifest) || receipt.sourceSnapshotFingerprint !== manifest.sourceSnapshotFingerprint || receipt.tenantId !== manifest.tenantId || receipt.workspaceId !== manifest.workspaceId || receipt.ownerAuthIdentityId !== manifest.ownerAuthIdentityId || receipt.policyId !== manifest.policyId || receipt.policyVersion !== manifest.policyVersion || receipt.policyHash !== manifest.policyHash || receipt.rollback !== "snapshot_restore_only" || receipt.relationshipOrphanCount !== 0) fail("T028_RECEIPT_STRUCTURAL_DRIFT");
  if (!db.get("SELECT id FROM tenants WHERE id = ? AND slug = ? AND name = ? AND status = 'active'", [manifest.tenantId, manifest.tenantSlug, manifest.tenantName])) fail("T028_REPLAY_FOUNDATION_DRIFT");
  if (!db.get("SELECT id FROM workspaces WHERE id = ? AND tenant_id = ? AND slug = ? AND name = ? AND status = 'active'", [manifest.workspaceId, manifest.tenantId, manifest.workspaceSlug, manifest.workspaceName])) fail("T028_REPLAY_FOUNDATION_DRIFT");
  assertSqliteBaselinePolicy(db, manifest);
  const users = db.all<{ id: string; user_id: string; email: string; role: string; status: string }>("SELECT id, user_id, email, role, status FROM app_users ORDER BY id");
  if (users.length !== manifest.legacyUsers.length || receipt.userCount !== users.length) fail("T028_REPLAY_USER_COUNT_DRIFT");
  for (const user of manifest.legacyUsers) {
    const actual = users.find((candidate) => candidate.id === user.legacyUserId);
    if (!actual || actual.user_id !== user.authIdentityId || actual.email !== user.expectedEmail || actual.role !== user.expectedLegacyRole || actual.status !== user.expectedStatus) fail("T028_REPLAY_USER_MAPPING_DRIFT");
    const membership = db.get<{ id: string; tenant_id: string; auth_identity_id: string; workspace_id: string | null; status: string }>("SELECT id, tenant_id, auth_identity_id, workspace_id, status FROM tenant_memberships WHERE id = ?", [user.membershipId]);
    const binding = db.get<{ id: string; tenant_id: string; membership_id: string; role: string; revoked_at: string | null }>("SELECT id, tenant_id, membership_id, role, revoked_at FROM tenant_role_bindings WHERE id = ?", [user.roleBindingId]);
    if (!membership || membership.tenant_id !== manifest.tenantId || membership.auth_identity_id !== user.authIdentityId || membership.workspace_id !== (user.workspaceId ?? null) || membership.status !== user.membershipStatus || !binding || binding.tenant_id !== manifest.tenantId || binding.membership_id !== user.membershipId || binding.role !== user.membershipRole || ((user.membershipStatus === "active") !== (binding.revoked_at === null))) fail("T028_REPLAY_IDENTITY_ROLE_DRIFT");
  }
  assertSqliteAuthReferences(db, manifest);
  const actualCounts: Record<string, number> = {};
  const actualChecksums: Record<string, string> = {};
  for (const table of COMPATIBILITY_TENANT_TABLES) {
    const rows = tableRows(db, table);
    const expectation = expectedTable(manifest, table);
    if (rows.length !== expectation.rowCount || rows.length !== receipt.tableCounts[table]) fail("T028_REPLAY_ROW_COUNT_DRIFT", table);
    const checksum = compatibilityContentChecksum(rows);
    if (checksum !== expectation.contentChecksum || checksum !== receipt.beforeContentChecksums[table] || checksum !== receipt.afterContentChecksums[table]) fail("T028_REPLAY_CHECKSUM_DRIFT", table);
    if (COMPATIBILITY_PRESERVED_TABLES.has(table)) {
      if (rows.some((row) => row.scope_kind !== "legacy_unscoped" || row.tenant_id !== null || row.workspace_id !== null)) fail("T028_AUDIT_HISTORY_SCOPE_DRIFT");
    } else if (COMPATIBILITY_WORKSPACE_TABLES.has(table)) {
      if (rows.some((row) => row.tenant_id !== manifest.tenantId || row.workspace_id !== manifest.workspaceId)) fail("T028_REPLAY_SCOPE_DRIFT", table);
    } else if (rows.some((row) => row.tenant_id !== manifest.tenantId)) {
      fail("T028_REPLAY_SCOPE_DRIFT", table);
    }
    actualCounts[table] = rows.length;
    actualChecksums[table] = checksum;
  }
  if (canonicalize(actualCounts) !== canonicalize(receipt.tableCounts) || canonicalize(actualChecksums) !== canonicalize(receipt.afterContentChecksums)) fail("T028_REPLAY_RECEIPT_CONTENT_DRIFT");
  assertRelationships(db);
}

export function runSqliteCompatibilityBackfill(
  db: SqliteBackfillDb,
  manifest: CompatibilityBackfillManifest,
): CompatibilityBackfillReceipt {
  assertManifestShape(manifest);
  assertSqliteForeignKeysEnabled(db);
  return db.transaction((tx) => {
    assertSqliteForeignKeysEnabled(tx);
    const manifestHash = compatibilityManifestHash(manifest);
    const existing = tx.get<{ receipt_json: string; manifest_hash: string; source_engine: string; checksum_algorithm: string; tenant_id: string; workspace_id: string; owner_auth_identity_id: string; policy_id: string; policy_version: number; policy_hash: string }>("SELECT receipt_json, manifest_hash, source_engine, checksum_algorithm, tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash FROM compatibility_backfill_receipts WHERE idempotency_key = ?", [manifest.idempotencyKey]);
    if (existing) {
      if (existing.manifest_hash !== manifestHash) fail("T028_IDEMPOTENCY_CONTENT_CONFLICT");
      const receipt = readReceipt(existing);
      if (existing.source_engine !== manifest.sourceEngine || existing.checksum_algorithm !== manifest.checksumAlgorithm || existing.tenant_id !== manifest.tenantId || existing.workspace_id !== manifest.workspaceId || existing.owner_auth_identity_id !== manifest.ownerAuthIdentityId || existing.policy_id !== manifest.policyId || existing.policy_version !== manifest.policyVersion || existing.policy_hash !== manifest.policyHash) fail("T028_RECEIPT_ROW_DRIFT");
      verifySqliteReceipt(tx, manifest, receipt);
      return receipt;
    }

    assertColumns(tx, "app_users", ["id", "user_id", "email", "role", "status"]);
    assertColumns(tx, "tenant_policies", ["id", "tenant_id", "version", "compatibility_policy_hash"]);
    assertColumns(tx, "user_market_access", ["user_id", "market_id", "tenant_id", "workspace_id"]);
    for (const table of COMPATIBILITY_TENANT_TABLES) {
      assertColumns(tx, table, ["tenant_id", ...(COMPATIBILITY_WORKSPACE_TABLES.has(table) ? ["workspace_id"] : [])]);
    }

    const targetTenant = tx.get("SELECT id FROM tenants WHERE id = ?", [manifest.tenantId]);
    const targetWorkspace = tx.get("SELECT id FROM workspaces WHERE id = ?", [manifest.workspaceId]);
    if (targetTenant || targetWorkspace) fail("T028_PREEXISTING_TARGET_CONFLICT");

    const users = tx.all<{ id: string; user_id: string; email: string; role: string; status: string }>("SELECT id, user_id, email, role, status FROM app_users ORDER BY id");
    if (users.length !== manifest.legacyUsers.length) fail("T028_USER_COUNT_MISMATCH");
    const mappingById = new Map(manifest.legacyUsers.map((user) => [user.legacyUserId, user]));
    for (const user of users) {
      const mapping = mappingById.get(user.id);
      if (!mapping) fail("T028_UNKNOWN_LEGACY_USER_ID");
      if (user.user_id !== mapping.authIdentityId || user.email !== mapping.expectedEmail || user.role !== mapping.expectedLegacyRole || user.status !== mapping.expectedStatus) fail("T028_USER_MAPPING_DRIFT");
      if (tx.get("SELECT id FROM tenant_memberships WHERE id = ?", [mapping.membershipId]) || tx.get("SELECT id FROM tenant_role_bindings WHERE id = ?", [mapping.roleBindingId])) fail("T028_PREEXISTING_TARGET_CONFLICT");
      const markets = tx.all<{ market_id: string }>("SELECT market_id FROM user_market_access WHERE user_id = ?", [mapping.authIdentityId]).map((row) => row.market_id).sort(compareCodeUnits);
      const expectedMarkets = [...mapping.marketAccessIds].sort(compareCodeUnits);
      if (canonicalize(markets) !== canonicalize(expectedMarkets)) fail("T028_MARKET_MAPPING_DRIFT");
    }
    assertSqliteAuthReferences(tx, manifest);

    const beforeChecksums: Record<string, string> = {};
    const tableCounts: Record<string, number> = {};
    for (const table of COMPATIBILITY_TENANT_TABLES) {
      const rows = tableRows(tx, table);
      const expectation = expectedTable(manifest, table);
      if (rows.length !== expectation.rowCount) fail("T028_ROW_COUNT_MISMATCH", table);
      const checksum = compatibilityContentChecksum(rows);
      if (checksum !== expectation.contentChecksum) fail("T028_CHECKSUM_MISMATCH", table);
      if (COMPATIBILITY_PRESERVED_TABLES.has(table)) {
        if (rows.some((row) => row.scope_kind !== "legacy_unscoped" || row.tenant_id !== null || row.workspace_id !== null)) fail("T028_AUDIT_HISTORY_SCOPE_DRIFT");
      } else if (rows.some((row) => row.tenant_id !== null || (COMPATIBILITY_WORKSPACE_TABLES.has(table) && row.workspace_id !== null))) fail("T028_PREEXISTING_SCOPE_CONFLICT", table);
      beforeChecksums[table] = checksum;
      tableCounts[table] = rows.length;
    }
    assertRelationships(tx);

    tx.run("INSERT INTO tenants (id, slug, name, status) VALUES (?, ?, ?, 'active')", [manifest.tenantId, manifest.tenantSlug, manifest.tenantName]);
    tx.run("INSERT INTO workspaces (id, tenant_id, slug, name, status) VALUES (?, ?, ?, ?, 'active')", [manifest.workspaceId, manifest.tenantId, manifest.workspaceSlug, manifest.workspaceName]);
    tx.run("INSERT INTO tenant_policies (id, tenant_id, version, compatibility_policy_hash) VALUES (?, ?, ?, ?)", [manifest.policyId, manifest.tenantId, manifest.policyVersion, manifest.policyHash]);
    assertSqliteBaselinePolicy(tx, manifest);
    for (const user of manifest.legacyUsers) {
      tx.run("INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, workspace_id, status) VALUES (?, ?, ?, ?, ?)", [user.membershipId, manifest.tenantId, user.authIdentityId, user.workspaceId ?? null, user.membershipStatus]);
      tx.run("INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role, reason_code, revoked_at) VALUES (?, ?, ?, ?, 'initial_provisioning', CASE WHEN ? = 'active' THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END)", [user.roleBindingId, manifest.tenantId, user.membershipId, user.membershipRole, user.membershipStatus]);
    }
    for (const table of COMPATIBILITY_TENANT_TABLES) {
      if (COMPATIBILITY_PRESERVED_TABLES.has(table)) continue;
      const sql = COMPATIBILITY_WORKSPACE_TABLES.has(table)
        ? `UPDATE ${quoteIdentifier(table)} SET tenant_id = ?, workspace_id = ? WHERE tenant_id IS NULL AND workspace_id IS NULL`
        : `UPDATE ${quoteIdentifier(table)} SET tenant_id = ? WHERE tenant_id IS NULL`;
      tx.run(sql, COMPATIBILITY_WORKSPACE_TABLES.has(table) ? [manifest.tenantId, manifest.workspaceId] : [manifest.tenantId]);
    }

    const afterChecksums: Record<string, string> = {};
    for (const table of COMPATIBILITY_TENANT_TABLES) {
      const rows = tableRows(tx, table);
      if (rows.length !== tableCounts[table]) fail("T028_AFTER_ROW_COUNT_MISMATCH", table);
      const checksum = compatibilityContentChecksum(rows);
      if (checksum !== beforeChecksums[table]) fail("T028_AFTER_CHECKSUM_MISMATCH", table);
      if (COMPATIBILITY_PRESERVED_TABLES.has(table)) {
        if (rows.some((row) => row.scope_kind !== "legacy_unscoped" || row.tenant_id !== null || row.workspace_id !== null)) fail("T028_AUDIT_HISTORY_SCOPE_DRIFT_AFTER");
      } else if (COMPATIBILITY_WORKSPACE_TABLES.has(table)) {
        if (rows.some((row) => row.tenant_id !== manifest.tenantId || row.workspace_id !== manifest.workspaceId)) fail("T028_AFTER_SCOPE_MISMATCH", table);
      } else if (rows.some((row) => row.tenant_id !== manifest.tenantId)) {
        fail("T028_AFTER_SCOPE_MISMATCH", table);
      }
      afterChecksums[table] = checksum;
    }
    const receipt: CompatibilityBackfillReceipt = {
      receiptId: `compatibility-backfill-${manifestHash.slice(0, 24)}`,
      status: "completed",
      schemaVersion: 1,
      sourceEngine: SQLITE_COMPATIBILITY_SOURCE_ENGINE,
      checksumAlgorithm: SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM,
      idempotencyKey: manifest.idempotencyKey,
      manifestHash,
      sourceSnapshotFingerprint: manifest.sourceSnapshotFingerprint,
      tenantId: manifest.tenantId,
      workspaceId: manifest.workspaceId,
      ownerAuthIdentityId: manifest.ownerAuthIdentityId,
      policyId: manifest.policyId,
      policyVersion: manifest.policyVersion,
      policyHash: manifest.policyHash,
      userCount: users.length,
      tableCounts,
      beforeContentChecksums: beforeChecksums,
      afterContentChecksums: afterChecksums,
      relationshipOrphanCount: 0,
      rollback: "snapshot_restore_only",
      activation: "real activation requires approved compatibility identity and authorized rehearsal snapshot",
    };
    tx.run(
      "INSERT INTO compatibility_backfill_receipts (id, idempotency_key, schema_version, source_engine, checksum_algorithm, manifest_hash, source_snapshot_fingerprint, tenant_id, workspace_id, owner_auth_identity_id, policy_id, policy_version, policy_hash, user_count, table_counts_json, before_checksums_json, after_checksums_json, relationship_orphan_count, status, receipt_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'completed', ?)",
      [receipt.receiptId, receipt.idempotencyKey, receipt.schemaVersion, receipt.sourceEngine, receipt.checksumAlgorithm, receipt.manifestHash, receipt.sourceSnapshotFingerprint, receipt.tenantId, receipt.workspaceId, receipt.ownerAuthIdentityId, receipt.policyId, receipt.policyVersion, receipt.policyHash, receipt.userCount, JSON.stringify(tableCounts), JSON.stringify(beforeChecksums), JSON.stringify(afterChecksums), JSON.stringify(receipt)],
    );
    return receipt;
  }, "immediate");
}
