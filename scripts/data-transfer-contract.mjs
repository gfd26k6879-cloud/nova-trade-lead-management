import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DATA_EXPORT_FORMAT = "nosite-data-export";
export const LEGACY_DATA_EXPORT_SCHEMA_VERSION = 3;
export const DATA_EXPORT_SCHEMA_VERSION = 4;
export const TENANT_INTEGRITY_CONTRACT_VERSION = 1;
export const DYNAMIC_SOURCE_TABLES = Object.freeze(["compatibility_backfill_receipts"]);
export const SQLITE_COMPATIBILITY_SOURCE_ENGINE = "sqlite";
export const SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM = "novatrade-sqlite-canonical-json-v1";
export const POSTGRES_COMPATIBILITY_SOURCE_ENGINE = "postgres";
export const POSTGRES_COMPATIBILITY_CHECKSUM_ALGORITHM = "novatrade-postgres-jsonb-text-v1";
export const DATA_EXPORT_SANITIZED_COLUMNS = Object.freeze({
  place_cache: Object.freeze(["raw_json:strip_google_reviews"]),
  place_observations: Object.freeze(["raw_json:strip_google_reviews"]),
});

const schema3Definitions = [
  { name: "zip_codes", primaryKey: ["zip"] },
  { name: "location_markets", primaryKey: ["id"] },
  { name: "location_cells", primaryKey: ["id"] },
  { name: "tenants", primaryKey: ["id"] },
  { name: "workspaces", primaryKey: ["id"] },
  { name: "tenant_memberships", primaryKey: ["id"] },
  { name: "tenant_role_bindings", primaryKey: ["id"] },
  { name: "tenant_policies", primaryKey: ["id"] },
  { name: "support_access_grants", primaryKey: ["id"] },
  { name: "support_access_grant_permissions", primaryKey: ["grant_id", "permission"] },
  { name: "support_access_grant_data_classes", primaryKey: ["grant_id", "data_class"] },
  { name: "tenant_export_jobs", primaryKey: ["id"] },
  { name: "tenant_deletion_jobs", primaryKey: ["id"] },
  { name: "tenant_deletion_checkpoints", primaryKey: ["id"] },
  { name: "tenant_deletion_checkpoint_events", primaryKey: ["id"] },
  { name: "tenant_deletion_tombstones", primaryKey: ["id"] },
  {
    name: "compatibility_backfill_receipts",
    primaryKey: ["id"],
    dynamicSource: true,
    jsonbColumns: ["table_counts_json", "before_checksums_json", "after_checksums_json", "receipt_json"],
    targetColumnMap: {
      table_counts_json: "table_counts",
      before_checksums_json: "before_content_checksums",
      after_checksums_json: "after_content_checksums",
      receipt_json: "receipt",
    },
  },
  { name: "settings", primaryKey: ["id"], jsonbColumns: ["niche_weights", "social_hosts", "basic_hosts"], excludedColumns: ["openai_api_key_encrypted", "google_places_api_key_encrypted", "google_maps_browser_api_key_encrypted"] },
  { name: "app_users", primaryKey: ["id"] },
  { name: "user_market_access", primaryKey: ["user_id", "market_id"] },
  { name: "crawl_runs", primaryKey: ["id"], jsonbColumns: ["categories", "selection_json"] },
  { name: "crawl_units", primaryKey: ["id"] },
  { name: "leads", primaryKey: ["id"], jsonbColumns: ["categories", "review_highlights", "website_health", "verification", "ai_website_health"] },
  { name: "lead_notes", primaryKey: ["id"] },
  { name: "outreach_events", primaryKey: ["id"] },
  { name: "admin_requests", primaryKey: ["id"] },
  { name: "demos", primaryKey: ["id"], jsonbColumns: ["config_json"] },
  { name: "place_cache", primaryKey: ["place_id"], jsonbColumns: ["raw_json"] },
  { name: "places_master", primaryKey: ["place_id"], jsonbColumns: ["categories", "review_highlights", "website_health"] },
  { name: "place_observations", primaryKey: ["id"], jsonbColumns: ["raw_json"] },
  { name: "api_usage_events", primaryKey: ["id"], jsonbColumns: ["metadata"] },
  { name: "ai_lead_verifications", primaryKey: ["id"], jsonbColumns: ["social_profiles", "sources", "website_health_json", "raw_json"] },
  { name: "ai_usage_events", primaryKey: ["id"], jsonbColumns: ["metadata"] },
  { name: "lead_ai_artifacts", primaryKey: ["id"], jsonbColumns: ["content_json", "sources_json"] },
  { name: "ai_feedback_events", primaryKey: ["id"] },
  { name: "worker_runs", primaryKey: ["id"], jsonbColumns: ["result_json"] },
  { name: "audit_logs", primaryKey: ["id"], jsonbColumns: ["metadata"] },
];

const schema4RowIdentities = new Map([
  ["user_market_access", ["tenant_id", "workspace_id", "user_id", "market_id"]],
  ["place_cache", ["tenant_id", "source_card_id", "place_id"]],
  ["places_master", ["tenant_id", "source_card_id", "place_id"]],
  ["place_observations", ["tenant_id", "source_card_id", "id"]],
  ["api_usage_events", ["tenant_id", "source_card_id", "id"]],
]);

const schema4SqliteNullableIdentityIndexFamilies = new Map([
  ["user_market_access", [
    { columns: ["tenant_id", "user_id", "market_id"], predicate: "workspace_id IS NULL" },
    { columns: ["tenant_id", "workspace_id", "user_id", "market_id"], predicate: "workspace_id IS NOT NULL" },
  ]],
]);

function buildContracts(schemaVersion) {
  return Object.freeze(schema3Definitions.map((definition) => Object.freeze({
    name: definition.name,
    rowIdentity: Object.freeze([
      ...(schemaVersion === DATA_EXPORT_SCHEMA_VERSION
        ? schema4RowIdentities.get(definition.name) ?? definition.primaryKey
        : definition.primaryKey),
    ]),
    nullableIdentityColumns: Object.freeze(
      schemaVersion === DATA_EXPORT_SCHEMA_VERSION && definition.name === "user_market_access"
        ? ["workspace_id"]
        : [],
    ),
    sqliteNullableIdentityIndexFamily: Object.freeze(
      (schemaVersion === DATA_EXPORT_SCHEMA_VERSION
        ? schema4SqliteNullableIdentityIndexFamilies.get(definition.name) ?? []
        : []).map((key) => Object.freeze({
          columns: Object.freeze([...key.columns]),
          predicate: key.predicate,
        })),
    ),
    physicalPrimaryKey: Object.freeze([...(definition.primaryKey ?? [])]),
    jsonbColumns: Object.freeze([...(definition.jsonbColumns ?? [])]),
    excludedColumns: Object.freeze([...(definition.excludedColumns ?? [])]),
    dynamicSource: definition.dynamicSource === true,
    targetColumnMap: Object.freeze({ ...(definition.targetColumnMap ?? {}) }),
  })));
}

export const LEGACY_SCHEMA_3_TABLE_CONTRACTS = buildContracts(LEGACY_DATA_EXPORT_SCHEMA_VERSION);
export const TABLE_CONTRACTS = buildContracts(DATA_EXPORT_SCHEMA_VERSION);

export const TABLE_NAMES = Object.freeze(TABLE_CONTRACTS.map(({ name }) => name));
export const TABLE_CONTRACT_BY_NAME = new Map(TABLE_CONTRACTS.map((contract) => [contract.name, contract]));

export function tableContractsForSchemaVersion(schemaVersion) {
  if (schemaVersion === LEGACY_DATA_EXPORT_SCHEMA_VERSION) return LEGACY_SCHEMA_3_TABLE_CONTRACTS;
  if (schemaVersion === DATA_EXPORT_SCHEMA_VERSION) return TABLE_CONTRACTS;
  throw new Error(`Unsupported export schema version: ${String(schemaVersion ?? "missing")}`);
}

const LEGACY_SCOPED_TABLES = new Set([
  "settings", "user_market_access", "leads", "place_cache", "places_master", "place_observations",
  "api_usage_events", "ai_usage_events", "audit_logs", "crawl_runs", "crawl_units", "lead_notes",
  "outreach_events", "admin_requests", "demos", "ai_lead_verifications", "lead_ai_artifacts", "ai_feedback_events",
]);
const CHECKPOINT_STATUSES = new Set(["pending", "running", "complete", "retryable", "failed", "held", "exempted"]);
const CHECKPOINT_TRANSITIONS = new Map([
  ["pending", new Set(["pending", "running", "held", "exempted"])],
  ["running", new Set(["running", "complete", "retryable", "failed", "held", "exempted"])],
  ["retryable", new Set(["retryable", "running", "failed"])],
  ["failed", new Set(["failed", "retryable"])],
  ["held", new Set(["held", "pending"])],
  ["complete", new Set(["complete"])],
  ["exempted", new Set(["exempted"])],
]);
const AUTH_REFERENCE_COLUMNS = new Map([
  ["app_users", ["user_id", "created_by", "team_lead_user_id"]],
  ["leads", ["assigned_to_user_id", "quality_checked_by_user_id", "archived_by_user_id"]],
  ["lead_notes", ["author_user_id"]],
  ["outreach_events", ["actor_user_id"]],
  ["user_market_access", ["user_id", "created_by_user_id"]],
  ["crawl_runs", ["created_by_user_id"]],
  ["admin_requests", ["created_by_user_id", "assigned_admin_user_id"]],
  ["demos", ["published_by_user_id", "unpublished_by_user_id", "revoked_by_user_id"]],
  ["ai_lead_verifications", ["requested_by_user_id"]],
  ["ai_usage_events", ["actor_user_id"]],
  ["lead_ai_artifacts", ["requested_by_user_id"]],
  ["ai_feedback_events", ["actor_user_id"]],
  ["audit_logs", ["actor_user_id", "actor_auth_identity_id"]],
  ["tenant_memberships", ["auth_identity_id"]],
  ["support_access_grants", ["support_actor_auth_identity_id", "requested_by_auth_identity_id", "approved_by_auth_identity_id", "revoked_by_auth_identity_id"]],
  ["tenant_export_jobs", ["requester_auth_identity_id"]],
  ["tenant_deletion_jobs", ["requested_by_auth_identity_id", "verified_by_auth_identity_id", "approved_by_auth_identity_id"]],
  ["compatibility_backfill_receipts", ["owner_auth_identity_id"]],
]);

export function targetColumn(contract, sourceColumn) {
  return contract.targetColumnMap[sourceColumn] ?? sourceColumn;
}

export function targetColumns(contract, sourceColumns) {
  return sourceColumns.map((column) => targetColumn(contract, column));
}

export function authReferenceColumns() {
  return new Map([...AUTH_REFERENCE_COLUMNS].map(([table, columns]) => [table, [...columns]]));
}

export function isLegacyScopedTable(tableName) {
  return LEGACY_SCOPED_TABLES.has(tableName);
}

export function historicalRowsRequireRestore(validated) {
  const stateful = [
    ["support_access_grants", (row) => ["approved", "revoked"].includes(row.state)],
    ["support_access_grant_permissions", (row) => supportChildRequiresRestore(validated, row, "permission")],
    ["support_access_grant_data_classes", (row) => supportChildRequiresRestore(validated, row, "data_class")],
    ["tenant_export_jobs", (row) => row.status !== "requested"],
    ["tenant_deletion_jobs", () => true],
    ["tenant_deletion_checkpoints", () => true],
    ["tenant_deletion_checkpoint_events", () => true],
    ["tenant_deletion_tombstones", () => true],
    ["compatibility_backfill_receipts", () => true],
  ];
  return stateful.filter(([table, predicate]) => validated.tables.get(table)?.rows.some(predicate)).map(([table]) => table);
}

export const RESTORE_TRIGGER_PLAN = Object.freeze({
  support_access_grants: Object.freeze(["trg_novatrade_support_access_grants_validate"]),
  support_access_grant_permissions: Object.freeze(["trg_novatrade_support_access_grant_permissions_guard"]),
  support_access_grant_data_classes: Object.freeze(["trg_novatrade_support_access_grant_data_classes_guard"]),
  tenant_export_jobs: Object.freeze(["trg_novatrade_tenant_export_jobs_guard_and_touch"]),
  tenant_deletion_jobs: Object.freeze(["trg_novatrade_tenant_deletion_jobs_insert_guard", "trg_novatrade_tenant_deletion_jobs_guard_and_touch"]),
  tenant_deletion_checkpoints: Object.freeze(["trg_novatrade_tenant_deletion_checkpoints_insert_guard", "trg_novatrade_tenant_deletion_checkpoints_guard"]),
  tenant_deletion_checkpoint_events: Object.freeze(["trg_novatrade_tenant_deletion_checkpoint_events_insert_guard"]),
  tenant_deletion_tombstones: Object.freeze(["trg_novatrade_tenant_deletion_tombstones_insert_guard"]),
  compatibility_backfill_receipts: Object.freeze(["trg_novatrade_compatibility_backfill_receipt_guard"]),
});

function supportChildRequiresRestore(validated, row, anchorColumn) {
  const parent = validated.tables.get("support_access_grants")?.rows.find((grant) => String(grant.id) === String(row.grant_id));
  return Boolean(parent && ["approved", "revoked"].includes(parent.state) && row[anchorColumn]);
}

export function parseCliArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
      continue;
    }
    args.set(key, next);
    index += 1;
  }
  return args;
}

export function quoteIdent(identifier) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizeRawGoogleReviewJson(value, label = "raw_json") {
  if (value === null || value === undefined) return value;
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(`${label}: invalid JSON cannot be safely redacted: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const sanitized = stripGoogleReviewCollections(parsed);
  return typeof value === "string" ? JSON.stringify(sanitized) : sanitized;
}

export function containsRawGoogleReviews(value) {
  if (Array.isArray(value)) return value.some(containsRawGoogleReviews);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => key.toLowerCase() === "reviews" || containsRawGoogleReviews(nested));
}

export function validateTenantIntegrity(tables) {
  const rows = (name) => tables.get(name)?.rows ?? [];
  const index = (name, key = "id") => new Map(rows(name).map((row) => [String(row[key]), row]));
  const tenants = index("tenants");
  const workspaces = index("workspaces");
  const memberships = index("tenant_memberships");
  const roleBindings = rows("tenant_role_bindings");
  const policies = index("tenant_policies");
  const grants = index("support_access_grants");
  const deletionJobs = index("tenant_deletion_jobs");
  const checkpoints = index("tenant_deletion_checkpoints");

  const fail = (table, rule, rowIndex) => {
    throw new Error(`tenant-integrity ${table}: ${rule}${rowIndex === undefined ? "" : ` (row ${rowIndex})`}`);
  };
  const has = (map, key) => key !== null && key !== undefined && key !== "" && map.has(String(key));
  const timestampAtOrBefore = (earlier, later) => {
    if (earlier === null || earlier === undefined || later === null || later === undefined) return false;
    const earlierTime = Date.parse(String(earlier));
    const laterTime = Date.parse(String(later));
    return Number.isFinite(earlierTime) && Number.isFinite(laterTime) && earlierTime <= laterTime;
  };
  const sameTenant = (row, parent) => String(row.tenant_id) === String(parent.tenant_id);
  const requireTenant = (table, row, rowIndex) => {
    if (!has(tenants, row.tenant_id)) fail(table, "tenant parent is missing", rowIndex);
  };
  const requireWorkspace = (table, row, rowIndex) => {
    if (row.workspace_id === null || row.workspace_id === undefined || row.workspace_id === "") return;
    const workspace = workspaces.get(String(row.workspace_id));
    if (!workspace) fail(table, "workspace parent is missing", rowIndex);
    if (String(workspace.tenant_id) !== String(row.tenant_id)) fail(table, "workspace crosses tenant boundary", rowIndex);
  };

  rows("workspaces").forEach((row, index) => requireTenant("workspaces", row, index));
  rows("tenant_memberships").forEach((row, rowIndex) => {
    requireTenant("tenant_memberships", row, rowIndex);
    requireWorkspace("tenant_memberships", row, rowIndex);
    if (row.invited_by_membership_id !== null && row.invited_by_membership_id !== undefined
      && (!has(memberships, row.invited_by_membership_id) || !sameTenant(row, memberships.get(String(row.invited_by_membership_id))))) {
      fail("tenant_memberships", "inviter membership is missing or cross-tenant", rowIndex);
    }
  });
  rows("tenant_role_bindings").forEach((row, rowIndex) => {
    requireTenant("tenant_role_bindings", row, rowIndex);
    const membership = memberships.get(String(row.membership_id));
    if (!membership || !sameTenant(row, membership)) fail("tenant_role_bindings", "membership parent is missing or cross-tenant", rowIndex);
    if (row.assigned_by_membership_id !== null && row.assigned_by_membership_id !== undefined
      && (!has(memberships, row.assigned_by_membership_id) || !sameTenant(row, memberships.get(String(row.assigned_by_membership_id))))) {
      fail("tenant_role_bindings", "assigner membership is missing or cross-tenant", rowIndex);
    }
  });
  rows("tenant_policies").forEach((row, rowIndex) => requireTenant("tenant_policies", row, rowIndex));
  rows("support_access_grants").forEach((row, rowIndex) => {
    requireTenant("support_access_grants", row, rowIndex);
    requireWorkspace("support_access_grants", row, rowIndex);
    const permission = rows("support_access_grant_permissions").find((candidate) => String(candidate.grant_id) === String(row.id) && candidate.permission === row.permission_anchor);
    const dataClass = rows("support_access_grant_data_classes").find((candidate) => String(candidate.grant_id) === String(row.id) && candidate.data_class === row.data_class_anchor);
    if (!permission || !dataClass) fail("support_access_grants", "permission/data-class anchors are missing", rowIndex);
    if (row.state === "pending" && (row.approved_by_auth_identity_id !== null || row.revoked_by_auth_identity_id !== null || row.approved_at !== null || row.revoked_at !== null)) fail("support_access_grants", "pending approval facts are not immutable", rowIndex);
    if (row.state === "approved" && (row.approved_by_auth_identity_id === null || row.approved_at === null || row.revoked_by_auth_identity_id !== null || row.revoked_at !== null)) fail("support_access_grants", "approved state facts are malformed", rowIndex);
    if (row.state === "revoked" && (row.approved_by_auth_identity_id === null || row.approved_at === null || row.revoked_by_auth_identity_id === null || row.revoked_at === null)) fail("support_access_grants", "revoked state facts are malformed", rowIndex);
    for (const [authColumn, timestampColumn] of [["approved_by_auth_identity_id", "approved_at"], ["revoked_by_auth_identity_id", "revoked_at"]]) {
      if (row[authColumn] === null || row[authColumn] === undefined) continue;
      const authority = rows("tenant_memberships").some((membership) => String(membership.tenant_id) === String(row.tenant_id)
        && String(membership.auth_identity_id) === String(row[authColumn])
        && roleBindings.some((binding) => String(binding.tenant_id) === String(row.tenant_id)
          && String(binding.membership_id) === String(membership.id) && ["owner", "admin"].includes(binding.role)
          && timestampAtOrBefore(binding.valid_from, row[timestampColumn])
          && (binding.revoked_at === null || binding.revoked_at === undefined || timestampAtOrBefore(row[timestampColumn], binding.revoked_at))));
      if (!authority) fail("support_access_grants", `${authColumn} lacks same-tenant owner/admin attribution at ${timestampColumn}`, rowIndex);
    }
  });
  for (const table of ["support_access_grant_permissions", "support_access_grant_data_classes"]) {
    rows(table).forEach((row, rowIndex) => {
      if (!has(grants, row.grant_id)) fail(table, "grant parent is missing", rowIndex);
    });
  }
  rows("tenant_export_jobs").forEach((row, rowIndex) => {
    requireTenant("tenant_export_jobs", row, rowIndex);
    requireWorkspace("tenant_export_jobs", row, rowIndex);
    if (row.requester_membership_id !== null && row.requester_membership_id !== undefined
      && (!has(memberships, row.requester_membership_id) || !sameTenant(row, memberships.get(String(row.requester_membership_id))))) {
      fail("tenant_export_jobs", "requester membership is missing or cross-tenant", rowIndex);
    }
    if (row.support_access_grant_id !== null && row.support_access_grant_id !== undefined
      && (!has(grants, row.support_access_grant_id) || !sameTenant(row, grants.get(String(row.support_access_grant_id))))) {
      fail("tenant_export_jobs", "support grant is missing or cross-tenant", rowIndex);
    }
    const requester = row.requester_membership_id === null || row.requester_membership_id === undefined ? null : memberships.get(String(row.requester_membership_id));
    if (requester && requester.auth_identity_id !== row.requester_auth_identity_id) fail("tenant_export_jobs", "requester auth identity does not bind to membership", rowIndex);
    if (row.status === "requested" && (row.snapshot_at !== null || row.artifact_storage_ref !== null || row.artifact_checksum_sha256 !== null || row.artifact_created_at !== null || row.expires_at !== null || Number(row.retry_count) !== 0 || row.next_retry_at !== null || row.lease_owner_hash !== null || row.error_code !== null)) fail("tenant_export_jobs", "requested state contains historical execution facts", rowIndex);
    if (["snapshotting", "redacting", "artifact_created", "released", "expired"].includes(row.status) && row.snapshot_at === null) fail("tenant_export_jobs", "historical state is missing snapshot binding", rowIndex);
  });
  rows("tenant_deletion_jobs").forEach((row, rowIndex) => {
    requireTenant("tenant_deletion_jobs", row, rowIndex);
    requireWorkspace("tenant_deletion_jobs", row, rowIndex);
    for (const column of ["requested_by_membership_id", "verified_by_membership_id", "approved_by_membership_id"]) {
      if (row[column] !== null && row[column] !== undefined
        && (!has(memberships, row[column]) || !sameTenant(row, memberships.get(String(row[column]))))) {
        fail("tenant_deletion_jobs", `${column} is missing or cross-tenant`, rowIndex);
      }
      const membership = row[column] === null || row[column] === undefined ? null : memberships.get(String(row[column]));
      const authColumn = column.replace("_membership_id", "_auth_identity_id");
      if (membership && membership.auth_identity_id !== row[authColumn]) fail("tenant_deletion_jobs", `${column} auth identity binding is malformed`, rowIndex);
    }
    if (["scheduled", "running", "retry_wait", "failed", "primary_deleted", "backup_aging", "completed"].includes(row.status) && row.scheduled_at === null) fail("tenant_deletion_jobs", "historical state is missing schedule binding", rowIndex);
    if (["running", "retry_wait", "failed", "primary_deleted", "backup_aging", "completed"].includes(row.status) && row.started_at === null) fail("tenant_deletion_jobs", "historical state is missing start binding", rowIndex);
    if (["primary_deleted", "backup_aging", "completed"].includes(row.status) && row.primary_deleted_at === null) fail("tenant_deletion_jobs", "historical state is missing primary-delete binding", rowIndex);
    if (["backup_aging", "completed"].includes(row.status) && row.backup_aging_at === null) fail("tenant_deletion_jobs", "historical state is missing backup-aging binding", rowIndex);
    if (row.status === "completed" && row.completed_at === null) fail("tenant_deletion_jobs", "completed state is missing completion binding", rowIndex);
    if (row.status === "canceled" && row.canceled_at === null) fail("tenant_deletion_jobs", "canceled state is missing cancellation binding", rowIndex);
  });
  rows("tenant_deletion_checkpoints").forEach((row, rowIndex) => {
    requireTenant("tenant_deletion_checkpoints", row, rowIndex);
    requireWorkspace("tenant_deletion_checkpoints", row, rowIndex);
    const job = deletionJobs.get(String(row.job_id));
    if (!job || !sameTenant(row, job)) fail("tenant_deletion_checkpoints", "deletion job parent is missing or cross-tenant", rowIndex);
    if (Number(row.attempt) > Number(row.max_attempts)) fail("tenant_deletion_checkpoints", "attempt exceeds immutable retry budget", rowIndex);
    const expectedCheckpointShape = {
      pending: [row.started_at === null, row.completed_at === null, row.receipt_hash === null, row.exemption_reason === null, !row.exemption_approved, row.reason_code === null, row.error_code === null, row.error_fingerprint === null],
      running: [row.started_at !== null, row.completed_at === null, row.receipt_hash === null, row.exemption_reason === null, !row.exemption_approved, row.reason_code === null, row.error_code === null, row.error_fingerprint === null],
      retryable: [row.started_at !== null, row.completed_at === null, row.receipt_hash === null, row.exemption_reason === null, !row.exemption_approved, row.reason_code === null, row.error_code === "DELETE_CHECKPOINT_RETRYABLE", row.error_fingerprint !== null],
      failed: [row.started_at !== null, row.completed_at === null, row.receipt_hash === null, row.exemption_reason === null, !row.exemption_approved, row.reason_code === null, row.error_code !== null, row.error_fingerprint !== null],
      held: [row.started_at === null, row.completed_at === null, row.receipt_hash === null, row.exemption_reason === null, !row.exemption_approved, row.reason_code === "LEGAL_HOLD", row.error_code === null, row.error_fingerprint === null],
      complete: [row.started_at !== null, row.completed_at !== null, row.receipt_hash !== null, row.exemption_reason === null, !row.exemption_approved, row.reason_code === null, row.error_code === null, row.error_fingerprint === null],
      exempted: [row.started_at !== null, row.completed_at !== null, row.receipt_hash === null, row.exemption_reason !== null, Boolean(row.exemption_approved), row.reason_code === null, row.error_code === null, row.error_fingerprint === null],
    }[row.status];
    if (!expectedCheckpointShape || expectedCheckpointShape.some((valid) => !valid)) fail("tenant_deletion_checkpoints", "checkpoint immutable state facts are malformed", rowIndex);
  });
  const eventsByCheckpoint = new Map();
  rows("tenant_deletion_checkpoint_events").forEach((row, rowIndex) => {
    requireTenant("tenant_deletion_checkpoint_events", row, rowIndex);
    const checkpoint = checkpoints.get(String(row.checkpoint_id));
    const job = deletionJobs.get(String(row.job_id));
    if (!checkpoint || !sameTenant(row, checkpoint) || String(checkpoint.job_id) !== String(row.job_id)) fail("tenant_deletion_checkpoint_events", "checkpoint parent is missing or cross-tenant", rowIndex);
    if (!job || !sameTenant(row, job)) fail("tenant_deletion_checkpoint_events", "deletion job parent is missing or cross-tenant", rowIndex);
    if (!CHECKPOINT_STATUSES.has(row.status) || Number(row.attempt) < 0 || Number(row.lease_generation) < 0) fail("tenant_deletion_checkpoint_events", "event state facts are malformed", rowIndex);
    const hasReceipt = row.receipt_hash !== null && row.receipt_hash !== undefined && row.receipt_hash !== "";
    const hasReason = row.reason_code !== null && row.reason_code !== undefined && row.reason_code !== "";
    if (hasReceipt && !/^[0-9a-f]{64}$/.test(String(row.receipt_hash))) fail("tenant_deletion_checkpoint_events", "event receipt binding is malformed", rowIndex);
    if (row.status === "complete" && (!hasReceipt || hasReason)) fail("tenant_deletion_checkpoint_events", "complete event facts are malformed", rowIndex);
    if (row.status === "exempted" && (hasReceipt || hasReason)) fail("tenant_deletion_checkpoint_events", "exempted event facts are malformed", rowIndex);
    if (row.status === "held" && (hasReceipt || row.reason_code !== "LEGAL_HOLD")) fail("tenant_deletion_checkpoint_events", "held event facts are malformed", rowIndex);
    if (!["complete", "exempted", "held"].includes(row.status) && (hasReceipt || hasReason)) fail("tenant_deletion_checkpoint_events", "non-final event facts are malformed", rowIndex);
    const eventList = eventsByCheckpoint.get(String(row.checkpoint_id)) ?? [];
    eventList.push({ row, rowIndex });
    eventsByCheckpoint.set(String(row.checkpoint_id), eventList);
  });
  for (const eventList of eventsByCheckpoint.values()) {
    eventList.sort((left, right) => {
      const leftTime = String(left.row.occurred_at ?? "");
      const rightTime = String(right.row.occurred_at ?? "");
      return leftTime < rightTime ? -1 : leftTime > rightTime ? 1 : Number(left.row.id) - Number(right.row.id);
    });
    for (let index = 1; index < eventList.length; index += 1) {
      const previous = eventList[index - 1].row;
      const current = eventList[index].row;
      if (!isLegalCheckpointTransition(previous.status, current.status)) fail("tenant_deletion_checkpoint_events", "event state progression is invalid", eventList[index].rowIndex);
      if (Number(current.attempt) < Number(previous.attempt) || Number(current.lease_generation) < Number(previous.lease_generation)) fail("tenant_deletion_checkpoint_events", "event retry facts move backward", eventList[index].rowIndex);
    }
    const latest = eventList[eventList.length - 1].row;
    const checkpoint = checkpoints.get(String(latest.checkpoint_id));
    if (!checkpoint || latest.status !== checkpoint.status || Number(latest.attempt) !== Number(checkpoint.attempt)
      || Number(latest.lease_generation) !== Number(checkpoint.lease_generation) || latest.receipt_hash !== checkpoint.receipt_hash
      || latest.reason_code !== checkpoint.reason_code) {
      fail("tenant_deletion_checkpoint_events", "latest event does not bind to checkpoint state", eventList[eventList.length - 1].rowIndex);
    }
  }
  rows("tenant_deletion_tombstones").forEach((row, rowIndex) => {
    requireTenant("tenant_deletion_tombstones", row, rowIndex);
    requireWorkspace("tenant_deletion_tombstones", row, rowIndex);
    const job = deletionJobs.get(String(row.job_id));
    if (!job || !sameTenant(row, job)) fail("tenant_deletion_tombstones", "deletion job parent is missing or cross-tenant", rowIndex);
    if (row.scope_selector_hash !== job.scope_selector_hash || row.policy_version !== job.policy_version) fail("tenant_deletion_tombstones", "tombstone facts do not bind to deletion job", rowIndex);
    if (!["primary_deleted", "backup_aging", "completed"].includes(job.status)) fail("tenant_deletion_tombstones", "tombstone requires a terminal deletion job state", rowIndex);
  });
  rows("compatibility_backfill_receipts").forEach((row, rowIndex) => {
    requireTenant("compatibility_backfill_receipts", row, rowIndex);
    const workspace = workspaces.get(String(row.workspace_id));
    if (!workspace || String(workspace.tenant_id) !== String(row.tenant_id)) fail("compatibility_backfill_receipts", "scope workspace is missing or cross-tenant", rowIndex);
    const policy = policies.get(String(row.policy_id));
    if (!policy || String(policy.tenant_id) !== String(row.tenant_id)) fail("compatibility_backfill_receipts", "policy parent is missing or cross-tenant", rowIndex);
    const receipt = parseReceipt(row, fail, rowIndex);
    const bindings = [
      ["receiptId", row.id], ["idempotencyKey", row.idempotency_key], ["schemaVersion", row.schema_version],
      ["sourceEngine", row.source_engine], ["checksumAlgorithm", row.checksum_algorithm],
      ["manifestHash", row.manifest_hash], ["sourceSnapshotFingerprint", row.source_snapshot_fingerprint],
      ["tenantId", row.tenant_id], ["workspaceId", row.workspace_id], ["ownerAuthIdentityId", row.owner_auth_identity_id],
      ["policyId", row.policy_id], ["policyVersion", row.policy_version], ["policyHash", row.policy_hash],
      ["userCount", row.user_count], ["relationshipOrphanCount", row.relationship_orphan_count], ["status", row.status],
    ];
    for (const [field, expected] of bindings) {
      if (String(receipt[field]) !== String(expected)) fail("compatibility_backfill_receipts", "receipt binding is malformed", rowIndex);
    }
    for (const [jsonColumn, receiptField] of [["table_counts_json", "tableCounts"], ["before_checksums_json", "beforeContentChecksums"], ["after_checksums_json", "afterContentChecksums"]]) {
      try {
        if (JSON.stringify(parseJsonValue(row[jsonColumn])) !== JSON.stringify(receipt[receiptField])) fail("compatibility_backfill_receipts", "receipt JSON binding is malformed", rowIndex);
      } catch {
        fail("compatibility_backfill_receipts", "receipt JSON binding is malformed", rowIndex);
      }
    }
    if (row.source_engine !== SQLITE_COMPATIBILITY_SOURCE_ENGINE
      || row.checksum_algorithm !== SQLITE_COMPATIBILITY_CHECKSUM_ALGORITHM) {
      fail("compatibility_backfill_receipts", "source engine/checksum algorithm pair is not the accepted SQLite pair", rowIndex);
    }
    if (policy.compatibility_policy_hash !== null && policy.compatibility_policy_hash !== undefined
      && String(policy.compatibility_policy_hash) !== String(row.policy_hash)) {
      fail("compatibility_backfill_receipts", "policy hash does not bind to policy parent", rowIndex);
    }
  });

  for (const table of LEGACY_SCOPED_TABLES) {
    rows(table).forEach((row, rowIndex) => {
      if (row.tenant_id !== null && row.tenant_id !== undefined && row.tenant_id !== "" && !has(tenants, row.tenant_id)) fail(table, "scoped tenant mapping is missing", rowIndex);
      if (row.workspace_id !== null && row.workspace_id !== undefined && row.workspace_id !== "") {
        if (row.tenant_id === null || row.tenant_id === undefined || row.tenant_id === "") fail(table, "workspace mapping requires tenant mapping", rowIndex);
        requireWorkspace(table, row, rowIndex);
      }
    });
  }
}

function parseReceipt(row, fail, rowIndex) {
  try {
    const parsed = parseJsonValue(row.receipt_json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || parsed.status !== "completed") fail("compatibility_backfill_receipts", "receipt object is malformed", rowIndex);
    return parsed;
  } catch {
    fail("compatibility_backfill_receipts", "receipt object is malformed", rowIndex);
  }
}

function isLegalCheckpointTransition(previous, current) {
  return CHECKPOINT_TRANSITIONS.get(previous)?.has(current) ?? false;
}

function parseJsonValue(value) {
  if (typeof value === "string") return JSON.parse(value);
  return value;
}

function stripGoogleReviewCollections(value) {
  if (Array.isArray(value)) return value.map(stripGoogleReviewCollections);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key.toLowerCase() !== "reviews")
      .map(([key, nested]) => [key, stripGoogleReviewCollections(nested)]),
  );
}

export function validateDataExportDirectory(inputDir) {
  const dir = path.resolve(inputDir);
  const manifestPath = path.join(dir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Export manifest not found: ${manifestPath}`);
  }

  const manifest = parseJsonFile(manifestPath, "export manifest");
  assertRecord(manifest, "Export manifest must be a JSON object");
  assertExactKeys(
    manifest,
    ["format", "schemaVersion", "integrityContract", "exportedAt", "source", "tableOrder", "excludedColumns", "sanitizedColumns", "tables"],
    "Export manifest",
  );

  if (manifest.format !== DATA_EXPORT_FORMAT) {
    throw new Error(`Unsupported export format: ${String(manifest.format ?? "missing")}`);
  }
  const contracts = tableContractsForSchemaVersion(manifest.schemaVersion);
  assertRecord(manifest.integrityContract, "Export manifest integrityContract must be an object");
  assertExactKeys(manifest.integrityContract, ["version", "rules"], "Export manifest integrityContract");
  if (manifest.integrityContract.version !== TENANT_INTEGRITY_CONTRACT_VERSION) throw new Error("Unsupported tenant integrity contract version");
  assertStringArrayEqual(manifest.integrityContract.rules, [
    "foundation-parent-closure", "composite-tenant-relationships", "legacy-scope-mappings", "compatibility-receipt-bindings", "immutable-state-facts",
  ], "Export manifest integrityContract.rules");
  if (!isIsoDate(manifest.exportedAt)) {
    throw new Error("Export manifest exportedAt must be a valid ISO timestamp");
  }
  assertRecord(manifest.source, "Export manifest source must be an object");
  assertExactKeys(manifest.source, ["kind", "file"], "Export manifest source");
  if (manifest.source.kind !== "sqlite") {
    throw new Error(`Unsupported export source: ${String(manifest.source.kind ?? "missing")}`);
  }
  if (
    typeof manifest.source.file !== "string"
    || !manifest.source.file
    || path.basename(manifest.source.file) !== manifest.source.file
  ) {
    throw new Error("Export manifest source.file must be a base file name");
  }
  assertStringArrayEqual(manifest.tableOrder, TABLE_NAMES, "Export manifest tableOrder");
  assertRecord(manifest.tables, "Export manifest tables must be an object");
  assertExactKeys(manifest.tables, TABLE_NAMES, "Export manifest tables");

  const expectedExclusions = Object.fromEntries(
    contracts
      .filter(({ excludedColumns }) => excludedColumns.length > 0)
      .map(({ name, excludedColumns }) => [name, [...excludedColumns]]),
  );
  assertRecord(manifest.excludedColumns, "Export manifest excludedColumns must be an object");
  assertExactKeys(manifest.excludedColumns, Object.keys(expectedExclusions), "Export manifest excludedColumns");
  for (const [table, columns] of Object.entries(expectedExclusions)) {
    assertStringArrayEqual(manifest.excludedColumns[table], columns, `Export manifest excludedColumns.${table}`);
  }
  assertRecord(manifest.sanitizedColumns, "Export manifest sanitizedColumns must be an object");
  assertExactKeys(manifest.sanitizedColumns, Object.keys(DATA_EXPORT_SANITIZED_COLUMNS), "Export manifest sanitizedColumns");
  for (const [table, columns] of Object.entries(DATA_EXPORT_SANITIZED_COLUMNS)) {
    assertStringArrayEqual(manifest.sanitizedColumns[table], columns, `Export manifest sanitizedColumns.${table}`);
  }

  const tables = new Map();
  for (const contract of contracts) {
    const tableInfo = manifest.tables[contract.name];
    assertRecord(tableInfo, `Manifest entry for ${contract.name} must be an object`);
    const legacySchema3 = manifest.schemaVersion === LEGACY_DATA_EXPORT_SCHEMA_VERSION;
    assertExactKeys(tableInfo, legacySchema3
      ? ["file", "rows", "columns", "primaryKey", "bytes", "sha256"]
      : ["file", "rows", "columns", "physicalPrimaryKey", "uniqueKeys", "rowIdentity", "nullableIdentityColumns", "bytes", "sha256"],
    `Manifest entry for ${contract.name}`);

    const expectedFile = `${contract.name}.json`;
    if (tableInfo.file !== expectedFile) {
      throw new Error(`${contract.name}: expected file ${expectedFile}, received ${String(tableInfo.file)}`);
    }
    assertStringArray(tableInfo.columns, `${contract.name}: columns`);
    assertUnique(tableInfo.columns, `${contract.name}: columns`);
    const physicalPrimaryKey = legacySchema3 ? tableInfo.primaryKey : tableInfo.physicalPrimaryKey;
    assertStringArray(physicalPrimaryKey, `${contract.name}: physical primary key`);
    assertUnique(physicalPrimaryKey, `${contract.name}: physical primary key`);
    if (legacySchema3) {
      assertStringArrayEqual(physicalPrimaryKey, contract.physicalPrimaryKey, `${contract.name}: primaryKey`);
    } else {
      assertStringArrayEqual(tableInfo.rowIdentity, contract.rowIdentity, `${contract.name}: rowIdentity`);
      assertStringArrayEqual(tableInfo.nullableIdentityColumns, contract.nullableIdentityColumns, `${contract.name}: nullableIdentityColumns`);
      assertUniqueKeyMetadata(tableInfo.uniqueKeys, tableInfo.columns, contract.name);
      if (!keyMetadataSupportsIdentity(physicalPrimaryKey, tableInfo.uniqueKeys, contract)) {
        throw new Error(`${contract.name}: rowIdentity is not backed by an exact physical primary or unique key`);
      }
    }
    for (const column of physicalPrimaryKey) {
      if (!tableInfo.columns.includes(column)) {
        throw new Error(`${contract.name}: physical primary key column ${column} is absent from the export`);
      }
    }
    for (const column of contract.rowIdentity) {
      if (!tableInfo.columns.includes(column)) {
        throw new Error(`${contract.name}: row identity column ${column} is absent from the export`);
      }
    }
    for (const column of contract.excludedColumns) {
      if (tableInfo.columns.includes(column)) {
        throw new Error(`${contract.name}: protected column ${column} must be excluded from exports`);
      }
    }
    assertNonNegativeInteger(tableInfo.rows, `${contract.name}: rows`);
    assertNonNegativeInteger(tableInfo.bytes, `${contract.name}: bytes`);
    if (typeof tableInfo.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(tableInfo.sha256)) {
      throw new Error(`${contract.name}: sha256 must be a lowercase SHA-256 digest`);
    }

    const filePath = path.join(dir, expectedFile);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`${contract.name}: data file not found: ${filePath}`);
    }
    const raw = fs.readFileSync(filePath);
    if (raw.byteLength !== tableInfo.bytes) {
      throw new Error(`${contract.name}: byte count mismatch (manifest ${tableInfo.bytes}, file ${raw.byteLength})`);
    }
    const actualSha = sha256(raw);
    if (actualSha !== tableInfo.sha256) {
      throw new Error(`${contract.name}: checksum mismatch`);
    }

    let rows;
    try {
      rows = JSON.parse(raw.toString("utf8"));
    } catch (error) {
      throw new Error(`${contract.name}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!Array.isArray(rows)) {
      throw new Error(`${contract.name}: data file must contain a JSON array`);
    }
    if (rows.length !== tableInfo.rows) {
      throw new Error(`${contract.name}: row count mismatch (manifest ${tableInfo.rows}, file ${rows.length})`);
    }

    const seenPhysicalPrimaryKeys = new Set();
    const seenRowIdentities = new Set();
    for (const [rowIndex, row] of rows.entries()) {
      assertRecord(row, `${contract.name}[${rowIndex}] must be a JSON object`);
      assertExactKeys(row, tableInfo.columns, `${contract.name}[${rowIndex}]`);
      for (const column of contract.excludedColumns) {
        if (Object.hasOwn(row, column)) {
          throw new Error(`${contract.name}[${rowIndex}]: protected column ${column} must be excluded`);
        }
      }
      if (Object.hasOwn(DATA_EXPORT_SANITIZED_COLUMNS, contract.name)) {
        let rawJson;
        try {
          rawJson = typeof row.raw_json === "string" ? JSON.parse(row.raw_json) : row.raw_json;
        } catch (error) {
          throw new Error(`${contract.name}[${rowIndex}].raw_json: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (containsRawGoogleReviews(rawJson)) {
          throw new Error(`${contract.name}[${rowIndex}].raw_json: raw Google reviews must be redacted`);
        }
      }
      const encodedIdentity = encodeRowIdentity(contract, row, `${contract.name}[${rowIndex}]`);
      if (seenRowIdentities.has(encodedIdentity)) {
        throw new Error(`${contract.name}: duplicate row identity at row ${rowIndex}`);
      }
      seenRowIdentities.add(encodedIdentity);

      if (physicalPrimaryKey.length > 0) {
        const primaryKey = physicalPrimaryKey.map((column) => {
          const value = row[column];
          if (value === null || value === undefined || value === "") {
            throw new Error(`${contract.name}[${rowIndex}]: physical primary key column ${column} is empty`);
          }
          return value;
        });
        const encodedPrimaryKey = JSON.stringify(primaryKey);
        if (seenPhysicalPrimaryKeys.has(encodedPrimaryKey)) {
          throw new Error(`${contract.name}: duplicate physical primary key at row ${rowIndex}`);
        }
        seenPhysicalPrimaryKeys.add(encodedPrimaryKey);
      }
    }

    tables.set(contract.name, {
      contract,
      columns: [...tableInfo.columns],
      filePath,
      rows,
    });
  }

  validateTenantIntegrity(tables);

  return { dir, manifest, contracts, tables };
}

export function encodeRowIdentity(contract, row, label = contract.name) {
  const nullableColumns = new Set(contract.nullableIdentityColumns);
  return JSON.stringify(contract.rowIdentity.map((column) => {
    if (!Object.hasOwn(row, column) || row[column] === undefined || row[column] === "") {
      throw new Error(`${label}: row identity column ${column} is missing or empty`);
    }
    if (row[column] === null) {
      if (!nullableColumns.has(column)) {
        throw new Error(`${label}: row identity column ${column} is null`);
      }
      return ["null"];
    }
    return [typeof row[column], stableCanonicalize(row[column])];
  }));
}

function stableCanonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(stableCanonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableCanonicalize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertUniqueKeyMetadata(value, columns, tableName) {
  if (!Array.isArray(value)) throw new Error(`${tableName}: uniqueKeys must be an array`);
  const seen = new Set();
  for (const [index, key] of value.entries()) {
    assertRecord(key, `${tableName}: uniqueKeys[${index}] must be an object`);
    assertExactKeys(key, ["name", "columns", "predicate", "nullsNotDistinct"], `${tableName}: uniqueKeys[${index}]`);
    if (typeof key.name !== "string" || key.name.length === 0) {
      throw new Error(`${tableName}: uniqueKeys[${index}].name must be a non-empty string`);
    }
    assertStringArray(key.columns, `${tableName}: uniqueKeys[${index}].columns`);
    if (key.columns.length === 0) throw new Error(`${tableName}: uniqueKeys[${index}].columns must not be empty`);
    assertUnique(key.columns, `${tableName}: uniqueKeys[${index}].columns`);
    if (key.columns.some((column) => !columns.includes(column))) {
      throw new Error(`${tableName}: uniqueKeys[${index}] references a missing column`);
    }
    if (typeof key.nullsNotDistinct !== "boolean") {
      throw new Error(`${tableName}: uniqueKeys[${index}].nullsNotDistinct must be boolean`);
    }
    if (key.nullsNotDistinct) {
      throw new Error(`${tableName}: SQLite unique metadata cannot use NULLS NOT DISTINCT`);
    }
    if (key.predicate !== null && (typeof key.predicate !== "string" || key.predicate.length === 0)) {
      throw new Error(`${tableName}: uniqueKeys[${index}].predicate must be null or a non-empty string`);
    }
    if (key.predicate !== normalizeSqlitePredicate(key.predicate)) {
      throw new Error(`${tableName}: uniqueKeys[${index}].predicate is not normalized`);
    }
    const encoded = JSON.stringify(key.name);
    if (seen.has(encoded)) throw new Error(`${tableName}: uniqueKeys contains duplicate metadata`);
    seen.add(encoded);
  }
}

function keyMetadataSupportsIdentity(physicalPrimaryKey, uniqueKeys, contract) {
  return sqliteKeyMetadataSupportsIdentity(physicalPrimaryKey, uniqueKeys, contract);
}

export function loadSqliteUniqueKeyMetadata(db, tableName) {
  return db.prepare(`PRAGMA index_list(${quoteIdent(tableName)})`).all()
    .filter((index) => Number(index.unique) === 1 && String(index.origin) !== "pk")
    .map((index) => {
      const name = String(index.name);
      const columns = db.prepare("SELECT * FROM pragma_index_xinfo(?)").all(name)
        .filter((column) => Number(column.key) === 1)
        .sort((left, right) => Number(left.seqno) - Number(right.seqno));
      if (columns.length === 0 || columns.some((column) => Number(column.cid) < 0 || typeof column.name !== "string")) return null;
      const partial = Number(index.partial) === 1;
      const schemaRow = db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?").get(name);
      const predicate = partial ? normalizeSqliteIndexPredicate(schemaRow?.sql, tableName, name) : null;
      return {
        name,
        columns: columns.map((column) => String(column.name)),
        predicate,
        nullsNotDistinct: false,
      };
    })
    .filter(Boolean)
    .sort((left, right) => compareCodeUnits(JSON.stringify(left), JSON.stringify(right)));
}

export function sqliteKeyMetadataSupportsIdentity(physicalPrimaryKey, uniqueKeys, contract) {
  if (contract.nullableIdentityColumns.length === 0) {
    return sameStringArray(physicalPrimaryKey, contract.rowIdentity)
      || uniqueKeys.some((key) => key.predicate === null && sameStringArray(key.columns, contract.rowIdentity));
  }
  return contract.sqliteNullableIdentityIndexFamily.length > 0
    && contract.sqliteNullableIdentityIndexFamily.every((required) => uniqueKeys.some((key) => (
      key.nullsNotDistinct === false
      && key.predicate === required.predicate
      && sameStringArray(key.columns, required.columns)
    )));
}

function normalizeSqliteIndexPredicate(createSql, tableName, indexName) {
  if (typeof createSql !== "string") {
    throw new Error(`${tableName}: partial unique index ${indexName} has no inspectable definition`);
  }
  const label = `${tableName}: partial unique index ${indexName}`;
  const { predicateStart, predicateEnd } = parseSqliteCreateIndexStatement(createSql, label);
  return normalizeSqlitePredicate(createSql.slice(predicateStart, predicateEnd));
}

function normalizeSqlitePredicate(value) {
  if (typeof value !== "string") return value;
  let normalized = stripSqliteComments(value, "SQLite index predicate")
    .trim()
    .replace(/;\s*$/, "")
    .replace(/\s+/g, " ");
  while (normalized.startsWith("(") && normalized.endsWith(")") && hasSingleOuterParenthesisPair(normalized)) {
    normalized = normalized.slice(1, -1).trim();
  }
  const workspaceNull = /^(?:workspace_id|"workspace_id"|`workspace_id`|\[workspace_id\])\s+IS\s+(NOT\s+)?NULL$/i.exec(normalized);
  if (workspaceNull) return `workspace_id IS ${workspaceNull[1] ? "NOT " : ""}NULL`;
  return normalized;
}

function hasSingleOuterParenthesisPair(value) {
  let depth = 0;
  for (let index = 0; index < value.length;) {
    if (isSqliteQuoteStart(value[index])) {
      index = skipSqliteQuotedRegion(value, index, "SQLite index predicate");
      continue;
    }
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return false;
    if (depth < 0) return false;
    index += 1;
  }
  return depth === 0;
}

function parseSqliteCreateIndexStatement(sql, label) {
  let depth = 0;
  let columnListStart = -1;
  let columnListEnd = -1;
  let terminalSemicolon = -1;
  const whereIndexes = [];
  for (let index = 0; index < sql.length;) {
    if (isSqliteQuoteStart(sql[index])) {
      index = skipSqliteQuotedRegion(sql, index, label);
      continue;
    }
    if (sql[index] === "-" && sql[index + 1] === "-") {
      index = skipSqliteLineComment(sql, index);
      continue;
    }
    if (sql[index] === "/" && sql[index + 1] === "*") {
      index = skipSqliteBlockComment(sql, index, label);
      continue;
    }
    if (sql[index] === "(") {
      if (depth === 0 && columnListStart < 0) columnListStart = index;
      depth += 1;
      index += 1;
      continue;
    }
    if (sql[index] === ")") {
      if (depth === 0) throw new Error(`${label}: stored CREATE INDEX has parenthesis underflow`);
      depth -= 1;
      if (depth === 0 && columnListStart >= 0 && columnListEnd < 0) columnListEnd = index;
      index += 1;
      continue;
    }
    if (depth === 0 && isSqliteWhereTokenAt(sql, index)) {
      whereIndexes.push(index);
      index += "WHERE".length;
      continue;
    }
    if (depth === 0 && sql[index] === ";") {
      terminalSemicolon = index;
      const trailingIndex = skipSqliteTrivia(sql, index + 1, label);
      if (trailingIndex !== sql.length) {
        throw new Error(`${label}: stored CREATE INDEX has tokens after its terminal semicolon`);
      }
      break;
    }
    index += 1;
  }
  if (depth !== 0) throw new Error(`${label}: stored CREATE INDEX has unbalanced parentheses`);
  if (columnListStart < 0 || columnListEnd < columnListStart) {
    throw new Error(`${label}: stored CREATE INDEX has no balanced index column list`);
  }
  validateSqliteCreateIndexPrefix(sql, columnListStart, label);
  if (whereIndexes.length !== 1) {
    throw new Error(`${label}: stored CREATE INDEX must contain exactly one top-level WHERE`);
  }
  const whereIndex = whereIndexes[0];
  if (whereIndex <= columnListEnd) {
    throw new Error(`${label}: stored CREATE INDEX WHERE must follow the balanced index column list`);
  }
  if (skipSqliteTrivia(sql, columnListEnd + 1, label) !== whereIndex) {
    throw new Error(`${label}: stored CREATE INDEX has tokens between its column list and WHERE`);
  }
  const predicateEnd = terminalSemicolon >= 0 ? terminalSemicolon : sql.length;
  if (predicateEnd <= whereIndex) {
    throw new Error(`${label}: stored CREATE INDEX terminal semicolon precedes its WHERE`);
  }
  const predicateStart = whereIndex + "WHERE".length;
  if (stripSqliteComments(sql.slice(predicateStart, predicateEnd), label).trim().length === 0) {
    throw new Error(`${label}: stored CREATE INDEX has an empty predicate`);
  }
  return { predicateStart, predicateEnd };
}

function validateSqliteCreateIndexPrefix(sql, columnListStart, label) {
  let index = requireSqliteKeyword(sql, 0, "CREATE", label);
  index = requireSqliteKeyword(sql, index, "UNIQUE", label);
  index = requireSqliteKeyword(sql, index, "INDEX", label);
  const ifEnd = consumeSqliteKeyword(sql, index, "IF");
  if (ifEnd >= 0) {
    index = requireSqliteKeyword(sql, ifEnd, "NOT", label);
    index = requireSqliteKeyword(sql, index, "EXISTS", label);
  }
  index = consumeSqliteQualifiedIdentifier(sql, index, label);
  index = requireSqliteKeyword(sql, index, "ON", label);
  index = consumeSqliteQualifiedIdentifier(sql, index, label);
  if (skipSqliteTrivia(sql, index, label) !== columnListStart) {
    throw new Error(`${label}: invalid stored CREATE INDEX prefix`);
  }
}

function requireSqliteKeyword(sql, startIndex, keyword, label) {
  const endIndex = consumeSqliteKeyword(sql, startIndex, keyword);
  if (endIndex < 0) throw new Error(`${label}: invalid stored CREATE INDEX prefix; expected ${keyword}`);
  return endIndex;
}

function consumeSqliteKeyword(sql, startIndex, keyword) {
  const index = skipSqliteTrivia(sql, startIndex, "SQLite CREATE INDEX prefix");
  if (sql.slice(index, index + keyword.length).toUpperCase() !== keyword) return -1;
  if (isSqliteIdentifierCharacter(sql[index - 1]) || isSqliteIdentifierCharacter(sql[index + keyword.length])) return -1;
  return index + keyword.length;
}

function consumeSqliteQualifiedIdentifier(sql, startIndex, label) {
  let index = consumeSqliteIdentifier(sql, skipSqliteTrivia(sql, startIndex, label), label);
  const dotIndex = skipSqliteTrivia(sql, index, label);
  if (sql[dotIndex] !== ".") return index;
  index = skipSqliteTrivia(sql, dotIndex + 1, label);
  return consumeSqliteIdentifier(sql, index, label);
}

function consumeSqliteIdentifier(sql, startIndex, label) {
  if (isSqliteQuoteStart(sql[startIndex])) return skipSqliteQuotedRegion(sql, startIndex, label);
  let index = startIndex;
  while (index < sql.length && isSqliteIdentifierCharacter(sql[index])) index += 1;
  if (index === startIndex) throw new Error(`${label}: invalid stored CREATE INDEX identifier`);
  return index;
}

function skipSqliteTrivia(sql, startIndex, label) {
  let index = startIndex;
  while (index < sql.length) {
    if (isSqliteWhitespace(sql[index])) {
      index += 1;
      continue;
    }
    if (sql[index] === "-" && sql[index + 1] === "-") {
      index = skipSqliteLineComment(sql, index);
      continue;
    }
    if (sql[index] === "/" && sql[index + 1] === "*") {
      index = skipSqliteBlockComment(sql, index, label);
      continue;
    }
    break;
  }
  return index;
}

function stripSqliteComments(sql, label) {
  let result = "";
  for (let index = 0; index < sql.length;) {
    if (isSqliteQuoteStart(sql[index])) {
      const nextIndex = skipSqliteQuotedRegion(sql, index, label);
      result += sql.slice(index, nextIndex);
      index = nextIndex;
      continue;
    }
    if (sql[index] === "-" && sql[index + 1] === "-") {
      result += " ";
      index = skipSqliteLineComment(sql, index);
      continue;
    }
    if (sql[index] === "/" && sql[index + 1] === "*") {
      result += " ";
      index = skipSqliteBlockComment(sql, index, label);
      continue;
    }
    result += sql[index];
    index += 1;
  }
  return result;
}

function skipSqliteQuotedRegion(sql, startIndex, label) {
  const opening = sql[startIndex];
  const closing = opening === "[" ? "]" : opening;
  for (let index = startIndex + 1; index < sql.length; index += 1) {
    if (sql[index] !== closing) continue;
    if (sql[index + 1] === closing) {
      index += 1;
      continue;
    }
    return index + 1;
  }
  throw new Error(`${label}: unterminated SQLite quoted region`);
}

function skipSqliteLineComment(sql, startIndex) {
  let index = startIndex + 2;
  while (index < sql.length && sql[index] !== "\r" && sql[index] !== "\n") index += 1;
  return index;
}

function skipSqliteBlockComment(sql, startIndex, label) {
  const endIndex = sql.indexOf("*/", startIndex + 2);
  if (endIndex < 0) throw new Error(`${label}: unterminated SQLite block comment`);
  return endIndex + 2;
}

function isSqliteQuoteStart(character) {
  return character === "'" || character === '"' || character === "`" || character === "[";
}

function isSqliteWhitespace(character) {
  return typeof character === "string" && /\s/u.test(character);
}

function isSqliteWhereTokenAt(sql, index) {
  if (sql.slice(index, index + "WHERE".length).toUpperCase() !== "WHERE") return false;
  return !isSqliteIdentifierCharacter(sql[index - 1])
    && !isSqliteIdentifierCharacter(sql[index + "WHERE".length]);
}

function isSqliteIdentifierCharacter(character) {
  if (typeof character !== "string") return false;
  const code = character.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || character === "_"
    || character === "$"
    || code >= 128;
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseJsonFile(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to parse ${label} at ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertRecord(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`${label} must be an array of non-empty strings`);
  }
}

function assertStringArrayEqual(actual, expected, label) {
  assertStringArray(actual, label);
  if (!sameStringArray(actual, expected)) {
    throw new Error(`${label} does not match the recovery contract`);
  }
}

function sameStringArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertExactKeys(value, expectedKeys, label) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (actualKeys.length !== sortedExpected.length || actualKeys.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} has unexpected or missing keys`);
  }
}

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicates`);
  }
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}
