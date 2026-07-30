import { createHash } from "node:crypto";
import {
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  type BigIntStats,
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { isProxy } from "node:util/types";

import Database from "better-sqlite3";

import {
  SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST,
  assertSqliteSchemaV1DatabaseHealth,
  classifySqliteSchemaV1,
  createFreshSqliteSchemaV1,
  sqliteInternalCatalogDigest,
  sqliteSchemaV1PhysicalManifestDigest,
} from "@/lib/db/sqlite-schema-coordinator";
import {
  SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT,
  SQLITE_SCHEMA_V1_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_CATALOG_VERSION,
  SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST,
  SQLITE_SCHEMA_V1_STAGED_USER_VERSION,
} from "@/lib/db/sqlite-schema-v1";
import {
  LEGACY_WEBSITE_LEAD_PLAY_ID,
  LEGACY_WEBSITE_LEAD_PLAY_VERSION,
  parseLegacyWebsiteLeadPlayJson,
  type LegacyWebsiteLeadPlaySeed,
} from "@/lib/tenancy/compatibility-play";

export const SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID = "google_places_legacy" as const;
export const SQLITE_FRESH_COMPATIBILITY_HASH_ALGORITHM = "novatrade-g006c1-canonical-json-sha256-v1" as const;

export type SqliteFreshFoundationErrorCode =
  | "G006C1_INPUT_REJECTED"
  | "G006C1_PATH_REJECTED"
  | "G006C1_FILE_IDENTITY_MISMATCH"
  | "G006C1_JOURNAL_MODE_MISMATCH"
  | "G006C1_STATE_REJECTED"
  | "G006C1_FOUNDATION_MISMATCH"
  | "G006C1_BINDING_MISMATCH"
  | "G006C1_COMMITTED_UNVERIFIED";

export class SqliteFreshFoundationError extends Error {
  public readonly code: SqliteFreshFoundationErrorCode;
  public readonly detail: string;
  public readonly cleanupEvidence: readonly string[];

  public constructor(
    code: Exclude<SqliteFreshFoundationErrorCode, "G006C1_COMMITTED_UNVERIFIED">,
    detail: string,
    cleanupEvidence: readonly string[] = [],
  ) {
    super(`${code}: ${detail}`);
    this.name = "SqliteFreshFoundationError";
    this.code = code;
    this.detail = detail;
    this.cleanupEvidence = Object.freeze([...cleanupEvidence]);
  }
}

export class SqliteFreshFoundationCommittedUnverifiedError extends Error {
  public readonly code = "G006C1_COMMITTED_UNVERIFIED" as const;
  public readonly committed = true as const;
  public readonly recoveryRequired = true as const;
  public readonly primaryEvidence: string;
  public readonly cleanupEvidence: readonly string[];

  public constructor(primaryEvidence: string, cleanupEvidence: readonly string[] = []) {
    super(`G006C1_COMMITTED_UNVERIFIED: ${primaryEvidence}`);
    this.name = "SqliteFreshFoundationCommittedUnverifiedError";
    this.primaryEvidence = primaryEvidence;
    this.cleanupEvidence = Object.freeze([...cleanupEvidence]);
  }
}

export interface SqliteFreshFileIdentity {
  readonly device: string;
  readonly fileId: string;
}

export interface SqliteFreshTenantRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: "active";
  readonly locale: string;
  readonly timezone: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SqliteFreshWorkspaceRow {
  readonly id: string;
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly status: "active";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SqliteFreshOwnerMembershipRow {
  readonly id: string;
  readonly tenantId: string;
  readonly authIdentityId: string;
  readonly pendingIdentityRefHash: null;
  readonly workspaceId: string;
  readonly status: "active";
  readonly invitedByMembershipId: null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SqliteFreshOwnerRoleBindingRow {
  readonly id: string;
  readonly tenantId: string;
  readonly membershipId: string;
  readonly role: "owner";
  readonly createdAt: string;
  readonly validFrom: string;
  readonly revokedAt: null;
  readonly assignedByMembershipId: null;
  readonly reasonCode: "initial_provisioning";
}

export interface SqliteFreshTenantPolicyRow {
  readonly id: string;
  readonly tenantId: string;
  readonly version: number;
  readonly locale: string;
  readonly timezone: string;
  readonly exportRetentionDays: number;
  readonly operationalLogRetentionDays: number;
  readonly rawSourceRetentionDays: number;
  readonly contactFreshnessDays: number;
  readonly primaryDeleteWithinDays: number;
  readonly backupExpireWithinDays: number;
  readonly tombstoneRetentionYears: 7;
  readonly activeMaterialsMode: "while_authorized_until_superseded_policy_or_deletion";
  readonly aiProcessingEnabled: 0 | 1;
  readonly sourceResearchEnabled: 0 | 1;
  readonly contactResearchEnabled: 0 | 1;
  readonly outreachDraftingEnabled: 0 | 1;
  readonly copyExportEnabled: 0 | 1;
  readonly autonomousSendEnabled: 0;
  readonly requireSourcePlanApproval: 0 | 1;
  readonly requireKnowledgeReview: 0 | 1;
  readonly requireIcpReview: 0 | 1;
  readonly requireLeadPlayReview: 0 | 1;
  readonly requireContactReview: 0 | 1;
  readonly requireOutreachReview: 0 | 1;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SqliteFreshFoundationInput {
  readonly tenant: SqliteFreshTenantRow;
  readonly workspace: SqliteFreshWorkspaceRow;
  readonly ownerMembership: SqliteFreshOwnerMembershipRow;
  readonly ownerRoleBinding: SqliteFreshOwnerRoleBindingRow;
  readonly policy: SqliteFreshTenantPolicyRow;
  readonly policyHash: string;
}

export interface SqliteFreshSourcePin {
  readonly cardId: typeof SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID;
  readonly sourceHash: string;
}

export interface SqliteFreshPlayPin {
  readonly seed: LegacyWebsiteLeadPlaySeed;
  readonly playId: typeof LEGACY_WEBSITE_LEAD_PLAY_ID;
  readonly playVersion: typeof LEGACY_WEBSITE_LEAD_PLAY_VERSION;
  readonly configurationHash: string;
  readonly bindingId: string;
}

export interface SqliteFreshCatalogPin {
  readonly catalogVersion: typeof SQLITE_SCHEMA_V1_CATALOG_VERSION;
  readonly userVersion: typeof SQLITE_SCHEMA_V1_STAGED_USER_VERSION;
  readonly catalogDigest: typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  readonly internalCatalogDigest: typeof SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST;
  readonly physicalManifestDigest: string;
  readonly applicationTableCount: typeof SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT;
}

export interface SqliteFreshCompatibilityProvisionInput {
  readonly backend: "sqlite";
  readonly lifecycle: "fresh";
  readonly databasePath: string;
  readonly expectedFileIdentity: SqliteFreshFileIdentity;
  readonly expectedJournalMode: "delete" | "wal";
  readonly foundation: SqliteFreshFoundationInput;
  readonly source: SqliteFreshSourcePin;
  readonly play: SqliteFreshPlayPin;
  readonly catalog: SqliteFreshCatalogPin;
  readonly expectedFoundationHash: string;
  readonly expectedCanonicalBindingHash: string;
}

export interface SqliteFreshCompatibilityProvisionResult {
  readonly status: "provisioned" | "replayed";
  readonly databasePath: string;
  readonly fileIdentity: SqliteFreshFileIdentity;
  readonly journalMode: "delete" | "wal";
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly ownerAuthIdentityId: string;
  readonly ownerMembershipId: string;
  readonly ownerRoleBindingId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyHash: string;
  readonly sourceCardId: typeof SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID;
  readonly sourceHash: string;
  readonly playId: typeof LEGACY_WEBSITE_LEAD_PLAY_ID;
  readonly playVersion: typeof LEGACY_WEBSITE_LEAD_PLAY_VERSION;
  readonly playBindingId: string;
  readonly playConfigurationHash: string;
  readonly catalogVersion: typeof SQLITE_SCHEMA_V1_CATALOG_VERSION;
  readonly userVersion: typeof SQLITE_SCHEMA_V1_STAGED_USER_VERSION;
  readonly catalogDigest: typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  readonly internalCatalogDigest: typeof SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST;
  readonly physicalManifestDigest: string;
  readonly applicationTableCount: typeof SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT;
  readonly foundationHash: string;
  readonly canonicalBindingHash: string;
}

export type SqliteFreshCompatibilityTestFault =
  | "hold-before-commit"
  | "fail-before-commit"
  | "fail-before-commit-with-cleanup-evidence"
  | "fail-after-commit"
  | "fail-verifier-open"
  | "fail-verifier-proof"
  | "fail-writer-close"
  | "fail-verifier-close"
  | "fail-root-close";

declare const sqliteFreshCompatibilityTestBoundaryBrand: unique symbol;

export interface SqliteFreshCompatibilityTestBoundary {
  readonly [sqliteFreshCompatibilityTestBoundaryBrand]: "sqlite-fresh-compatibility-test-boundary";
}

interface TestBoundaryState {
  readonly fault: SqliteFreshCompatibilityTestFault;
}

const testBoundaries = new WeakMap<object, TestBoundaryState>();

export function createSqliteFreshCompatibilityTestBoundary(
  fault: SqliteFreshCompatibilityTestFault,
): SqliteFreshCompatibilityTestBoundary {
  if (process.env.NODE_ENV !== "test") {
    throw new SqliteFreshFoundationError("G006C1_INPUT_REJECTED", "test boundary is unavailable outside tests");
  }
  const boundary = Object.freeze(Object.create(null)) as SqliteFreshCompatibilityTestBoundary;
  testBoundaries.set(boundary as object, Object.freeze({ fault }));
  return boundary;
}

type DataRecord = Readonly<Record<string, unknown>>;

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UTC_MILLISECOND_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const FOUNDATION_TABLES = Object.freeze(new Set([
  "tenants",
  "workspaces",
  "tenant_memberships",
  "tenant_role_bindings",
  "tenant_policies",
]));

const TENANT_KEYS = Object.freeze(["id", "slug", "name", "status", "locale", "timezone", "createdAt", "updatedAt"]);
const WORKSPACE_KEYS = Object.freeze(["id", "tenantId", "slug", "name", "status", "createdAt", "updatedAt"]);
const MEMBERSHIP_KEYS = Object.freeze([
  "id", "tenantId", "authIdentityId", "pendingIdentityRefHash", "workspaceId", "status",
  "invitedByMembershipId", "createdAt", "updatedAt",
]);
const ROLE_KEYS = Object.freeze([
  "id", "tenantId", "membershipId", "role", "createdAt", "validFrom", "revokedAt",
  "assignedByMembershipId", "reasonCode",
]);
const POLICY_KEYS = Object.freeze([
  "id", "tenantId", "version", "locale", "timezone", "exportRetentionDays", "operationalLogRetentionDays",
  "rawSourceRetentionDays", "contactFreshnessDays", "primaryDeleteWithinDays", "backupExpireWithinDays",
  "tombstoneRetentionYears", "activeMaterialsMode", "aiProcessingEnabled", "sourceResearchEnabled",
  "contactResearchEnabled", "outreachDraftingEnabled", "copyExportEnabled", "autonomousSendEnabled",
  "requireSourcePlanApproval", "requireKnowledgeReview", "requireIcpReview", "requireLeadPlayReview",
  "requireContactReview", "requireOutreachReview", "createdAt", "updatedAt",
]);

function inputError(detail: string): never {
  throw new SqliteFreshFoundationError("G006C1_INPUT_REJECTED", detail);
}

function plainRecord(value: unknown, label: string): DataRecord {
  if (value === null || typeof value !== "object" || isProxy(value)) inputError(`${label} must be a non-proxy plain record`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) inputError(`${label} must have a plain prototype`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") inputError(`${label} contains a symbol key`);
    const descriptor = descriptors[key];
    if (!("value" in descriptor)) inputError(`${label}.${key} must be a data property`);
    record[key] = descriptor.value;
  }
  return Object.freeze(record);
}

function exactKeys(record: DataRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort(compareCodeUnits);
  const wanted = [...expected].sort(compareCodeUnits);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) inputError(`${label} keys`);
}

function stringValue(record: DataRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) inputError(`${label}.${key}`);
  return value;
}

function exactString(record: DataRecord, key: string, expected: string, label: string): string {
  const value = stringValue(record, key, label);
  if (value !== expected) inputError(`${label}.${key}`);
  return value;
}

function integerValue(record: DataRecord, key: string, label: string, minimum?: number, maximum?: number): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)
      || (minimum !== undefined && value < minimum) || (maximum !== undefined && value > maximum)) {
    inputError(`${label}.${key}`);
  }
  return value;
}

function exactInteger(record: DataRecord, key: string, expected: number, label: string): number {
  const value = integerValue(record, key, label);
  if (value !== expected) inputError(`${label}.${key}`);
  return value;
}

function nullValue(record: DataRecord, key: string, label: string): null {
  if (record[key] !== null) inputError(`${label}.${key}`);
  return null;
}

function uuid(record: DataRecord, key: string, label: string): string {
  const value = stringValue(record, key, label);
  if (!UUID_PATTERN.test(value)) inputError(`${label}.${key}`);
  return value.toLowerCase();
}

function sha256Value(record: DataRecord, key: string, label: string): string {
  const value = stringValue(record, key, label);
  if (!SHA256_PATTERN.test(value)) inputError(`${label}.${key}`);
  return value;
}

function utcTimestamp(record: DataRecord, key: string, label: string): string {
  const value = stringValue(record, key, label);
  if (!UTC_MILLISECOND_PATTERN.test(value) || Number.isNaN(Date.parse(value))) inputError(`${label}.${key}`);
  return value;
}

function flag(record: DataRecord, key: string, label: string): 0 | 1 {
  const value = integerValue(record, key, label);
  if (value !== 0 && value !== 1) inputError(`${label}.${key}`);
  return value;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown, label = "value", seen = new Set<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) inputError(`${label} contains a non-finite number`);
    return JSON.stringify(value);
  }
  if (typeof value !== "object" || isProxy(value)) inputError(`${label} contains unsupported data`);
  if (seen.has(value)) inputError(`${label} contains a cycle`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key))) {
          inputError(`${label} array keys`);
        }
        if (key !== "length" && !("value" in descriptors[key])) inputError(`${label}[${key}] must be a data property`);
      }
      return `[${value.map((entry, index) => canonicalJson(entry, `${label}[${index}]`, seen)).join(",")}]`;
    }
    const record = plainRecord(value, label);
    const keys = Object.keys(record).sort(compareCodeUnits);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key], `${label}.${key}`, seen)}`).join(",")}}`;
  } finally {
    seen.delete(value);
  }
}

function domainHash(domain: string, value: unknown): string {
  return createHash("sha256").update(`NOVATRADE\0G006C1\0${domain}\0V1\0`, "utf8").update(canonicalJson(value), "utf8").digest("hex");
}

export function computeSqliteFreshPolicyHash(policy: SqliteFreshTenantPolicyRow): string {
  return domainHash("POLICY", policy);
}

export function computeSqliteFreshFoundationHash(foundation: Omit<SqliteFreshFoundationInput, "policyHash"> & { readonly policyHash: string }): string {
  return domainHash("FOUNDATION", foundation);
}

export function computeSqliteFreshPlayBindingId(input: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceCardId: typeof SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID;
  readonly playId: typeof LEGACY_WEBSITE_LEAD_PLAY_ID;
  readonly playVersion: typeof LEGACY_WEBSITE_LEAD_PLAY_VERSION;
  readonly configurationHash: string;
}): string {
  return domainHash("PLAY-BINDING", input);
}

export function computeSqliteFreshSourceHash(source: {
  readonly cardId: typeof SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID;
}): string {
  return domainHash("SOURCE", source);
}

export function computeSqliteFreshCanonicalBindingHash(input: {
  readonly databasePath: string;
  readonly fileIdentity: SqliteFreshFileIdentity;
  readonly journalMode: "delete" | "wal";
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly ownerAuthIdentityId: string;
  readonly policyHash: string;
  readonly sourceCardId: typeof SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID;
  readonly sourceHash: string;
  readonly playBindingId: string;
  readonly playConfigurationHash: string;
  readonly catalogVersion: typeof SQLITE_SCHEMA_V1_CATALOG_VERSION;
  readonly userVersion: typeof SQLITE_SCHEMA_V1_STAGED_USER_VERSION;
  readonly catalogDigest: typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  readonly internalCatalogDigest: typeof SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST;
  readonly physicalManifestDigest: string;
  readonly foundationHash: string;
}): string {
  return domainHash("CANONICAL-BINDING", input);
}

function fileIdentity(stats: BigIntStats): SqliteFreshFileIdentity {
  return Object.freeze({ device: stats.dev.toString(10), fileId: stats.ino.toString(10) });
}

function sameIdentity(left: SqliteFreshFileIdentity, right: SqliteFreshFileIdentity): boolean {
  return left.device === right.device && left.fileId === right.fileId;
}

function validateIdentityRecord(value: unknown, label: string): SqliteFreshFileIdentity {
  const record = plainRecord(value, label);
  exactKeys(record, ["device", "fileId"], label);
  const device = stringValue(record, "device", label);
  const fileId = stringValue(record, "fileId", label);
  if (!/^(0|[1-9]\d*)$/u.test(device) || !/^(0|[1-9]\d*)$/u.test(fileId)) inputError(label);
  return Object.freeze({ device, fileId });
}

export function inspectSqliteFreshFileIdentity(databasePath: string): SqliteFreshFileIdentity {
  if (typeof databasePath !== "string" || databasePath.length === 0) inputError("databasePath");
  return fileIdentity(statSync(databasePath, { bigint: true }));
}

function validateFoundation(value: unknown): SqliteFreshFoundationInput {
  const foundation = plainRecord(value, "input.foundation");
  exactKeys(foundation, ["tenant", "workspace", "ownerMembership", "ownerRoleBinding", "policy", "policyHash"], "input.foundation");

  const tenant = plainRecord(foundation.tenant, "input.foundation.tenant");
  exactKeys(tenant, TENANT_KEYS, "input.foundation.tenant");
  const tenantRow: SqliteFreshTenantRow = Object.freeze({
    id: uuid(tenant, "id", "input.foundation.tenant"),
    slug: stringValue(tenant, "slug", "input.foundation.tenant"),
    name: stringValue(tenant, "name", "input.foundation.tenant"),
    status: exactString(tenant, "status", "active", "input.foundation.tenant") as "active",
    locale: stringValue(tenant, "locale", "input.foundation.tenant"),
    timezone: stringValue(tenant, "timezone", "input.foundation.tenant"),
    createdAt: utcTimestamp(tenant, "createdAt", "input.foundation.tenant"),
    updatedAt: utcTimestamp(tenant, "updatedAt", "input.foundation.tenant"),
  });

  const workspace = plainRecord(foundation.workspace, "input.foundation.workspace");
  exactKeys(workspace, WORKSPACE_KEYS, "input.foundation.workspace");
  const workspaceRow: SqliteFreshWorkspaceRow = Object.freeze({
    id: uuid(workspace, "id", "input.foundation.workspace"),
    tenantId: uuid(workspace, "tenantId", "input.foundation.workspace"),
    slug: stringValue(workspace, "slug", "input.foundation.workspace"),
    name: stringValue(workspace, "name", "input.foundation.workspace"),
    status: exactString(workspace, "status", "active", "input.foundation.workspace") as "active",
    createdAt: utcTimestamp(workspace, "createdAt", "input.foundation.workspace"),
    updatedAt: utcTimestamp(workspace, "updatedAt", "input.foundation.workspace"),
  });

  const membership = plainRecord(foundation.ownerMembership, "input.foundation.ownerMembership");
  exactKeys(membership, MEMBERSHIP_KEYS, "input.foundation.ownerMembership");
  const membershipRow: SqliteFreshOwnerMembershipRow = Object.freeze({
    id: uuid(membership, "id", "input.foundation.ownerMembership"),
    tenantId: uuid(membership, "tenantId", "input.foundation.ownerMembership"),
    authIdentityId: uuid(membership, "authIdentityId", "input.foundation.ownerMembership"),
    pendingIdentityRefHash: nullValue(membership, "pendingIdentityRefHash", "input.foundation.ownerMembership"),
    workspaceId: uuid(membership, "workspaceId", "input.foundation.ownerMembership"),
    status: exactString(membership, "status", "active", "input.foundation.ownerMembership") as "active",
    invitedByMembershipId: nullValue(membership, "invitedByMembershipId", "input.foundation.ownerMembership"),
    createdAt: utcTimestamp(membership, "createdAt", "input.foundation.ownerMembership"),
    updatedAt: utcTimestamp(membership, "updatedAt", "input.foundation.ownerMembership"),
  });

  const role = plainRecord(foundation.ownerRoleBinding, "input.foundation.ownerRoleBinding");
  exactKeys(role, ROLE_KEYS, "input.foundation.ownerRoleBinding");
  const roleRow: SqliteFreshOwnerRoleBindingRow = Object.freeze({
    id: uuid(role, "id", "input.foundation.ownerRoleBinding"),
    tenantId: uuid(role, "tenantId", "input.foundation.ownerRoleBinding"),
    membershipId: uuid(role, "membershipId", "input.foundation.ownerRoleBinding"),
    role: exactString(role, "role", "owner", "input.foundation.ownerRoleBinding") as "owner",
    createdAt: utcTimestamp(role, "createdAt", "input.foundation.ownerRoleBinding"),
    validFrom: utcTimestamp(role, "validFrom", "input.foundation.ownerRoleBinding"),
    revokedAt: nullValue(role, "revokedAt", "input.foundation.ownerRoleBinding"),
    assignedByMembershipId: nullValue(role, "assignedByMembershipId", "input.foundation.ownerRoleBinding"),
    reasonCode: exactString(role, "reasonCode", "initial_provisioning", "input.foundation.ownerRoleBinding") as "initial_provisioning",
  });

  const policy = plainRecord(foundation.policy, "input.foundation.policy");
  exactKeys(policy, POLICY_KEYS, "input.foundation.policy");
  const policyRow: SqliteFreshTenantPolicyRow = Object.freeze({
    id: uuid(policy, "id", "input.foundation.policy"),
    tenantId: uuid(policy, "tenantId", "input.foundation.policy"),
    version: integerValue(policy, "version", "input.foundation.policy", 1),
    locale: stringValue(policy, "locale", "input.foundation.policy"),
    timezone: stringValue(policy, "timezone", "input.foundation.policy"),
    exportRetentionDays: integerValue(policy, "exportRetentionDays", "input.foundation.policy", 1, 7),
    operationalLogRetentionDays: integerValue(policy, "operationalLogRetentionDays", "input.foundation.policy", 1, 30),
    rawSourceRetentionDays: integerValue(policy, "rawSourceRetentionDays", "input.foundation.policy", 1, 180),
    contactFreshnessDays: integerValue(policy, "contactFreshnessDays", "input.foundation.policy", 1, 180),
    primaryDeleteWithinDays: integerValue(policy, "primaryDeleteWithinDays", "input.foundation.policy", 1, 30),
    backupExpireWithinDays: integerValue(policy, "backupExpireWithinDays", "input.foundation.policy", 1, 35),
    tombstoneRetentionYears: exactInteger(policy, "tombstoneRetentionYears", 7, "input.foundation.policy") as 7,
    activeMaterialsMode: exactString(policy, "activeMaterialsMode", "while_authorized_until_superseded_policy_or_deletion", "input.foundation.policy") as "while_authorized_until_superseded_policy_or_deletion",
    aiProcessingEnabled: flag(policy, "aiProcessingEnabled", "input.foundation.policy"),
    sourceResearchEnabled: flag(policy, "sourceResearchEnabled", "input.foundation.policy"),
    contactResearchEnabled: flag(policy, "contactResearchEnabled", "input.foundation.policy"),
    outreachDraftingEnabled: flag(policy, "outreachDraftingEnabled", "input.foundation.policy"),
    copyExportEnabled: flag(policy, "copyExportEnabled", "input.foundation.policy"),
    autonomousSendEnabled: exactInteger(policy, "autonomousSendEnabled", 0, "input.foundation.policy") as 0,
    requireSourcePlanApproval: flag(policy, "requireSourcePlanApproval", "input.foundation.policy"),
    requireKnowledgeReview: flag(policy, "requireKnowledgeReview", "input.foundation.policy"),
    requireIcpReview: flag(policy, "requireIcpReview", "input.foundation.policy"),
    requireLeadPlayReview: flag(policy, "requireLeadPlayReview", "input.foundation.policy"),
    requireContactReview: flag(policy, "requireContactReview", "input.foundation.policy"),
    requireOutreachReview: flag(policy, "requireOutreachReview", "input.foundation.policy"),
    createdAt: utcTimestamp(policy, "createdAt", "input.foundation.policy"),
    updatedAt: utcTimestamp(policy, "updatedAt", "input.foundation.policy"),
  });

  const policyHash = sha256Value(foundation, "policyHash", "input.foundation");
  if (computeSqliteFreshPolicyHash(policyRow) !== policyHash) inputError("input.foundation.policyHash");
  if (workspaceRow.tenantId !== tenantRow.id
      || membershipRow.tenantId !== tenantRow.id
      || membershipRow.workspaceId !== workspaceRow.id
      || roleRow.tenantId !== tenantRow.id
      || roleRow.membershipId !== membershipRow.id
      || policyRow.tenantId !== tenantRow.id
      || tenantRow.locale !== policyRow.locale
      || tenantRow.timezone !== policyRow.timezone) {
    inputError("input.foundation relationship binding");
  }
  return Object.freeze({
    tenant: tenantRow,
    workspace: workspaceRow,
    ownerMembership: membershipRow,
    ownerRoleBinding: roleRow,
    policy: policyRow,
    policyHash,
  });
}

function validateInput(value: unknown): SqliteFreshCompatibilityProvisionInput {
  const input = plainRecord(value, "input");
  exactKeys(input, [
    "backend", "lifecycle", "databasePath", "expectedFileIdentity", "expectedJournalMode", "foundation",
    "source", "play", "catalog", "expectedFoundationHash", "expectedCanonicalBindingHash",
  ], "input");
  exactString(input, "backend", "sqlite", "input");
  exactString(input, "lifecycle", "fresh", "input");
  const databasePath = stringValue(input, "databasePath", "input");
  const expectedFileIdentity = validateIdentityRecord(input.expectedFileIdentity, "input.expectedFileIdentity");
  const expectedJournalMode = stringValue(input, "expectedJournalMode", "input");
  if (expectedJournalMode !== "delete" && expectedJournalMode !== "wal") inputError("input.expectedJournalMode");
  const foundation = validateFoundation(input.foundation);

  const source = plainRecord(input.source, "input.source");
  exactKeys(source, ["cardId", "sourceHash"], "input.source");
  const cardId = exactString(source, "cardId", SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID, "input.source") as typeof SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID;
  const sourceHash = sha256Value(source, "sourceHash", "input.source");
  if (sourceHash !== computeSqliteFreshSourceHash({ cardId })) inputError("input.source.sourceHash");

  const play = plainRecord(input.play, "input.play");
  exactKeys(play, ["seed", "playId", "playVersion", "configurationHash", "bindingId"], "input.play");
  const playId = exactString(play, "playId", LEGACY_WEBSITE_LEAD_PLAY_ID, "input.play") as typeof LEGACY_WEBSITE_LEAD_PLAY_ID;
  const playVersion = exactInteger(play, "playVersion", LEGACY_WEBSITE_LEAD_PLAY_VERSION, "input.play") as typeof LEGACY_WEBSITE_LEAD_PLAY_VERSION;
  const configurationHash = sha256Value(play, "configurationHash", "input.play");
  const bindingId = sha256Value(play, "bindingId", "input.play");
  const parsedSeed = parseLegacyWebsiteLeadPlayJson(canonicalJson(play.seed, "input.play.seed"));
  if (!parsedSeed.ok || parsedSeed.seed.configurationHash !== configurationHash
      || parsedSeed.seed.playId !== playId || parsedSeed.seed.playVersion !== playVersion
      || parsedSeed.seed.source.connectorId !== cardId) {
    inputError("input.play.seed");
  }
  const expectedPlayBindingId = computeSqliteFreshPlayBindingId({
    tenantId: foundation.tenant.id,
    workspaceId: foundation.workspace.id,
    sourceCardId: cardId,
    playId,
    playVersion,
    configurationHash,
  });
  if (bindingId !== expectedPlayBindingId) inputError("input.play.bindingId");

  const catalog = plainRecord(input.catalog, "input.catalog");
  exactKeys(catalog, [
    "catalogVersion", "userVersion", "catalogDigest", "internalCatalogDigest", "physicalManifestDigest",
    "applicationTableCount",
  ], "input.catalog");
  const catalogVersion = exactInteger(catalog, "catalogVersion", SQLITE_SCHEMA_V1_CATALOG_VERSION, "input.catalog") as typeof SQLITE_SCHEMA_V1_CATALOG_VERSION;
  const userVersion = exactInteger(catalog, "userVersion", SQLITE_SCHEMA_V1_STAGED_USER_VERSION, "input.catalog") as typeof SQLITE_SCHEMA_V1_STAGED_USER_VERSION;
  const catalogDigest = exactString(catalog, "catalogDigest", SQLITE_SCHEMA_V1_CATALOG_DIGEST, "input.catalog") as typeof SQLITE_SCHEMA_V1_CATALOG_DIGEST;
  const internalCatalogDigest = exactString(catalog, "internalCatalogDigest", SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST, "input.catalog") as typeof SQLITE_SCHEMA_V1_INTERNAL_CATALOG_DIGEST;
  const physicalManifestDigest = sha256Value(catalog, "physicalManifestDigest", "input.catalog");
  const applicationTableCount = exactInteger(catalog, "applicationTableCount", SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT, "input.catalog") as typeof SQLITE_SCHEMA_V1_APPLICATION_TABLE_COUNT;
  const actualPhysicalPin = SQLITE_SCHEMA_V1_PHYSICAL_MANIFEST_DIGEST;
  if (physicalManifestDigest !== actualPhysicalPin) inputError("input.catalog.physicalManifestDigest");

  const expectedFoundationHash = sha256Value(input, "expectedFoundationHash", "input");
  if (computeSqliteFreshFoundationHash(foundation) !== expectedFoundationHash) inputError("input.expectedFoundationHash");
  const expectedCanonicalBindingHash = sha256Value(input, "expectedCanonicalBindingHash", "input");
  const calculatedBindingHash = computeSqliteFreshCanonicalBindingHash({
    databasePath,
    fileIdentity: expectedFileIdentity,
    journalMode: expectedJournalMode,
    tenantId: foundation.tenant.id,
    workspaceId: foundation.workspace.id,
    ownerAuthIdentityId: foundation.ownerMembership.authIdentityId,
    policyHash: foundation.policyHash,
    sourceCardId: cardId,
    sourceHash,
    playBindingId: bindingId,
    playConfigurationHash: configurationHash,
    catalogVersion,
    userVersion,
    catalogDigest,
    internalCatalogDigest,
    physicalManifestDigest,
    foundationHash: expectedFoundationHash,
  });
  if (calculatedBindingHash !== expectedCanonicalBindingHash) inputError("input.expectedCanonicalBindingHash");

  return Object.freeze({
    backend: "sqlite",
    lifecycle: "fresh",
    databasePath,
    expectedFileIdentity,
    expectedJournalMode,
    foundation,
    source: Object.freeze({ cardId, sourceHash }),
    play: Object.freeze({ seed: parsedSeed.seed, playId, playVersion, configurationHash, bindingId }),
    catalog: Object.freeze({
      catalogVersion, userVersion, catalogDigest, internalCatalogDigest, physicalManifestDigest, applicationTableCount,
    }),
    expectedFoundationHash,
    expectedCanonicalBindingHash,
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `NonError: ${String(error)}`;
}

function pathError(detail: string): never {
  throw new SqliteFreshFoundationError("G006C1_PATH_REJECTED", detail);
}

function requireCanonicalExistingFile(databasePath: string): void {
  if (!isAbsolute(databasePath) || resolve(databasePath) !== databasePath) pathError("databasePath must be absolute and normalized");
  let canonicalPath: string;
  let stats: BigIntStats;
  try {
    canonicalPath = realpathSync.native(databasePath);
    stats = statSync(databasePath, { bigint: true });
  } catch (error) {
    pathError(`databasePath is not an existing file: ${describeError(error)}`);
  }
  if (canonicalPath !== databasePath) pathError("databasePath must be its exact canonical real path");
  if (!stats.isFile()) pathError("databasePath must name a regular file");
}

interface RetainedFile {
  readonly descriptor: number;
  readonly identity: SqliteFreshFileIdentity;
}

function retainFile(databasePath: string, expected: SqliteFreshFileIdentity): RetainedFile {
  const descriptor = openSync(databasePath, "r+");
  try {
    const identity = fileIdentity(fstatSync(descriptor, { bigint: true }));
    if (!sameIdentity(identity, expected)) {
      throw new SqliteFreshFoundationError("G006C1_FILE_IDENTITY_MISMATCH", "retained descriptor does not match expected identity");
    }
    return Object.freeze({ descriptor, identity });
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function assertRetainedIdentity(databasePath: string, retained: RetainedFile, stage: string): void {
  const descriptorIdentity = fileIdentity(fstatSync(retained.descriptor, { bigint: true }));
  const pathIdentity = fileIdentity(statSync(databasePath, { bigint: true }));
  if (!sameIdentity(descriptorIdentity, retained.identity) || !sameIdentity(pathIdentity, retained.identity)) {
    throw new SqliteFreshFoundationError("G006C1_FILE_IDENTITY_MISMATCH", stage);
  }
  if (realpathSync.native(databasePath) !== databasePath) {
    throw new SqliteFreshFoundationError("G006C1_PATH_REJECTED", `${stage}: canonical path changed`);
  }
}

function openExactDatabase(databasePath: string, readonly: boolean): Database.Database {
  return new Database(databasePath, { fileMustExist: true, readonly, timeout: 1_000 });
}

function assertConnectionIdentity(
  db: Database.Database,
  databasePath: string,
  retained: RetainedFile,
  stage: string,
): void {
  assertRetainedIdentity(databasePath, retained, stage);
  if (!db.open || db.memory || db.name !== databasePath || db.readonly !== (stage.startsWith("verifier"))) {
    throw new SqliteFreshFoundationError("G006C1_FILE_IDENTITY_MISMATCH", `${stage}: connection flags or name`);
  }
  const databases = db.pragma("database_list") as Array<{ seq: number; name: string; file: string }>;
  const main = databases.filter((entry) => entry.name === "main");
  const temporary = databases.filter((entry) => entry.name === "temp");
  if (main.length !== 1 || main[0]?.file !== databasePath
      || temporary.length > 1 || temporary.some((entry) => entry.file !== "")
      || databases.some((entry) => entry.name !== "main" && entry.name !== "temp")) {
    throw new SqliteFreshFoundationError("G006C1_FILE_IDENTITY_MISMATCH", `${stage}: database_list`);
  }
  const temporaryObjects = db.prepare("SELECT count(*) AS count FROM temp.sqlite_schema").get() as { count: number };
  if (temporaryObjects.count !== 0) throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", `${stage}: temporary schema objects`);
  const writableSchema = db.pragma("writable_schema", { simple: true });
  if (writableSchema !== 0) throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", `${stage}: writable_schema enabled`);
}

function assertConnectionPragmas(db: Database.Database, expectedJournalMode: "delete" | "wal", stage: string): void {
  const foreignKeys = db.pragma("foreign_keys", { simple: true });
  if (foreignKeys !== 1) throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", `${stage}: foreign_keys disabled`);
  const journalMode = db.pragma("journal_mode", { simple: true });
  if (journalMode !== expectedJournalMode) {
    throw new SqliteFreshFoundationError("G006C1_JOURNAL_MODE_MISMATCH", `${stage}: ${String(journalMode)}`);
  }
  const lockingMode = db.pragma("locking_mode", { simple: true });
  if (lockingMode !== "normal") throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", `${stage}: locking_mode ${String(lockingMode)}`);
}

const INSERT_TENANT = `INSERT INTO tenants
  (id, slug, name, status, locale, timezone, created_at, updated_at)
  VALUES (@id, @slug, @name, @status, @locale, @timezone, @createdAt, @updatedAt)`;
const INSERT_WORKSPACE = `INSERT INTO workspaces
  (id, tenant_id, slug, name, status, created_at, updated_at)
  VALUES (@id, @tenantId, @slug, @name, @status, @createdAt, @updatedAt)`;
const INSERT_MEMBERSHIP = `INSERT INTO tenant_memberships
  (id, tenant_id, auth_identity_id, pending_identity_ref_hash, workspace_id, status,
   invited_by_membership_id, created_at, updated_at)
  VALUES (@id, @tenantId, @authIdentityId, @pendingIdentityRefHash, @workspaceId, @status,
          @invitedByMembershipId, @createdAt, @updatedAt)`;
const INSERT_ROLE = `INSERT INTO tenant_role_bindings
  (id, tenant_id, membership_id, role, created_at, valid_from, revoked_at, assigned_by_membership_id, reason_code)
  VALUES (@id, @tenantId, @membershipId, @role, @createdAt, @validFrom, @revokedAt, @assignedByMembershipId, @reasonCode)`;
const INSERT_POLICY = `INSERT INTO tenant_policies
  (id, tenant_id, version, locale, timezone, export_retention_days, operational_log_retention_days,
   raw_source_retention_days, contact_freshness_days, primary_delete_within_days, backup_expire_within_days,
   tombstone_retention_years, active_materials_mode, ai_processing_enabled, source_research_enabled,
   contact_research_enabled, outreach_drafting_enabled, copy_export_enabled, autonomous_send_enabled,
   require_source_plan_approval, require_knowledge_review, require_icp_review, require_lead_play_review,
   require_contact_review, require_outreach_review, created_at, updated_at)
  VALUES (@id, @tenantId, @version, @locale, @timezone, @exportRetentionDays, @operationalLogRetentionDays,
          @rawSourceRetentionDays, @contactFreshnessDays, @primaryDeleteWithinDays, @backupExpireWithinDays,
          @tombstoneRetentionYears, @activeMaterialsMode, @aiProcessingEnabled, @sourceResearchEnabled,
          @contactResearchEnabled, @outreachDraftingEnabled, @copyExportEnabled, @autonomousSendEnabled,
          @requireSourcePlanApproval, @requireKnowledgeReview, @requireIcpReview, @requireLeadPlayReview,
          @requireContactReview, @requireOutreachReview, @createdAt, @updatedAt)`;

function insertFoundation(db: Database.Database, foundation: SqliteFreshFoundationInput): void {
  db.prepare(INSERT_TENANT).run(foundation.tenant);
  db.prepare(INSERT_WORKSPACE).run(foundation.workspace);
  db.prepare(INSERT_MEMBERSHIP).run(foundation.ownerMembership);
  db.prepare(INSERT_ROLE).run(foundation.ownerRoleBinding);
  db.prepare(INSERT_POLICY).run(foundation.policy);
}

function selectExactRow(db: Database.Database, sql: string): DataRecord {
  const row = db.prepare(sql).get();
  if (row === undefined) throw new SqliteFreshFoundationError("G006C1_FOUNDATION_MISMATCH", "missing exact foundation row");
  return plainRecord(row, "persisted foundation row");
}

function persistedFoundation(db: Database.Database): SqliteFreshFoundationInput {
  const tenant = selectExactRow(db, `SELECT id, slug, name, status, locale, timezone,
    created_at AS createdAt, updated_at AS updatedAt FROM tenants`);
  const workspace = selectExactRow(db, `SELECT id, tenant_id AS tenantId, slug, name, status,
    created_at AS createdAt, updated_at AS updatedAt FROM workspaces`);
  const membership = selectExactRow(db, `SELECT id, tenant_id AS tenantId, auth_identity_id AS authIdentityId,
    pending_identity_ref_hash AS pendingIdentityRefHash, workspace_id AS workspaceId, status,
    invited_by_membership_id AS invitedByMembershipId, created_at AS createdAt, updated_at AS updatedAt
    FROM tenant_memberships`);
  const role = selectExactRow(db, `SELECT id, tenant_id AS tenantId, membership_id AS membershipId, role,
    created_at AS createdAt, valid_from AS validFrom, revoked_at AS revokedAt,
    assigned_by_membership_id AS assignedByMembershipId, reason_code AS reasonCode FROM tenant_role_bindings`);
  const policy = selectExactRow(db, `SELECT id, tenant_id AS tenantId, version, locale, timezone,
    export_retention_days AS exportRetentionDays, operational_log_retention_days AS operationalLogRetentionDays,
    raw_source_retention_days AS rawSourceRetentionDays, contact_freshness_days AS contactFreshnessDays,
    primary_delete_within_days AS primaryDeleteWithinDays, backup_expire_within_days AS backupExpireWithinDays,
    tombstone_retention_years AS tombstoneRetentionYears, active_materials_mode AS activeMaterialsMode,
    ai_processing_enabled AS aiProcessingEnabled, source_research_enabled AS sourceResearchEnabled,
    contact_research_enabled AS contactResearchEnabled, outreach_drafting_enabled AS outreachDraftingEnabled,
    copy_export_enabled AS copyExportEnabled, autonomous_send_enabled AS autonomousSendEnabled,
    require_source_plan_approval AS requireSourcePlanApproval, require_knowledge_review AS requireKnowledgeReview,
    require_icp_review AS requireIcpReview, require_lead_play_review AS requireLeadPlayReview,
    require_contact_review AS requireContactReview, require_outreach_review AS requireOutreachReview,
    created_at AS createdAt, updated_at AS updatedAt FROM tenant_policies`);
  return Object.freeze({
    tenant: tenant as unknown as SqliteFreshTenantRow,
    workspace: workspace as unknown as SqliteFreshWorkspaceRow,
    ownerMembership: membership as unknown as SqliteFreshOwnerMembershipRow,
    ownerRoleBinding: role as unknown as SqliteFreshOwnerRoleBindingRow,
    policy: policy as unknown as SqliteFreshTenantPolicyRow,
    policyHash: computeSqliteFreshPolicyHash(policy as unknown as SqliteFreshTenantPolicyRow),
  });
}

function assertNonPersistedPins(input: SqliteFreshCompatibilityProvisionInput): void {
  if (input.source.cardId !== SQLITE_FRESH_COMPATIBILITY_SOURCE_CARD_ID
      || computeSqliteFreshSourceHash({ cardId: input.source.cardId }) !== input.source.sourceHash
      || input.play.playId !== LEGACY_WEBSITE_LEAD_PLAY_ID
      || input.play.playVersion !== LEGACY_WEBSITE_LEAD_PLAY_VERSION
      || input.play.seed.configurationHash !== input.play.configurationHash
      || input.play.seed.source.connectorId !== input.source.cardId
      || computeSqliteFreshPlayBindingId({
        tenantId: input.foundation.tenant.id,
        workspaceId: input.foundation.workspace.id,
        sourceCardId: input.source.cardId,
        playId: input.play.playId,
        playVersion: input.play.playVersion,
        configurationHash: input.play.configurationHash,
      }) !== input.play.bindingId
      || computeSqliteFreshCanonicalBindingHash({
        databasePath: input.databasePath,
        fileIdentity: input.expectedFileIdentity,
        journalMode: input.expectedJournalMode,
        tenantId: input.foundation.tenant.id,
        workspaceId: input.foundation.workspace.id,
        ownerAuthIdentityId: input.foundation.ownerMembership.authIdentityId,
        policyHash: input.foundation.policyHash,
        sourceCardId: input.source.cardId,
        sourceHash: input.source.sourceHash,
        playBindingId: input.play.bindingId,
        playConfigurationHash: input.play.configurationHash,
        catalogVersion: input.catalog.catalogVersion,
        userVersion: input.catalog.userVersion,
        catalogDigest: input.catalog.catalogDigest,
        internalCatalogDigest: input.catalog.internalCatalogDigest,
        physicalManifestDigest: input.catalog.physicalManifestDigest,
        foundationHash: input.expectedFoundationHash,
      }) !== input.expectedCanonicalBindingHash) {
    throw new SqliteFreshFoundationError("G006C1_BINDING_MISMATCH", "source, play, or canonical binding pins");
  }
}

function assertExactFoundation(db: Database.Database, expected: SqliteFreshCompatibilityProvisionInput): void {
  assertNonPersistedPins(expected);
  const state = classifySqliteSchemaV1(db);
  if (state.kind !== "staged"
      || state.userVersion !== expected.catalog.userVersion
      || state.catalogDigest !== expected.catalog.catalogDigest
      || state.applicationTableCount !== expected.catalog.applicationTableCount
      || state.targetColumnCount !== state.expectedTargetColumnCount) {
    throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", `${state.kind}: ${state.reason}`);
  }
  if (sqliteInternalCatalogDigest(db) !== expected.catalog.internalCatalogDigest) {
    throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", "internal catalog digest");
  }
  if (sqliteSchemaV1PhysicalManifestDigest(db) !== expected.catalog.physicalManifestDigest) {
    throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", "physical manifest digest");
  }
  const tables = db.prepare(`SELECT name FROM main.sqlite_schema
    WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name COLLATE BINARY`).all() as Array<{ name: string }>;
  if (tables.length !== expected.catalog.applicationTableCount) {
    throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", "application table count");
  }
  for (const { name } of tables) {
    if (!/^[a-z][a-z0-9_]*$/u.test(name)) {
      throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", "noncanonical table name");
    }
    const count = (db.prepare(`SELECT count(*) AS count FROM "${name}"`).get() as { count: number }).count;
    const expectedCount = FOUNDATION_TABLES.has(name) ? 1 : 0;
    if (count !== expectedCount) {
      throw new SqliteFreshFoundationError("G006C1_FOUNDATION_MISMATCH", `${name} row count ${count}/${expectedCount}`);
    }
  }
  const actualFoundation = persistedFoundation(db);
  const actualHash = computeSqliteFreshFoundationHash(actualFoundation);
  if (actualHash !== expected.expectedFoundationHash
      || canonicalJson(actualFoundation) !== canonicalJson(expected.foundation)) {
    throw new SqliteFreshFoundationError("G006C1_FOUNDATION_MISMATCH", "foundation rows or policy hash");
  }
  const relationshipOrphans = (db.prepare(`SELECT
    (SELECT count(*) FROM workspaces w LEFT JOIN tenants t ON t.id=w.tenant_id WHERE t.id IS NULL) +
    (SELECT count(*) FROM tenant_memberships m LEFT JOIN tenants t ON t.id=m.tenant_id WHERE t.id IS NULL) +
    (SELECT count(*) FROM tenant_memberships m LEFT JOIN workspaces w
      ON w.tenant_id=m.tenant_id AND w.id=m.workspace_id WHERE w.id IS NULL) +
    (SELECT count(*) FROM tenant_role_bindings r LEFT JOIN tenant_memberships m
      ON m.tenant_id=r.tenant_id AND m.id=r.membership_id WHERE m.id IS NULL) +
    (SELECT count(*) FROM tenant_policies p LEFT JOIN tenants t ON t.id=p.tenant_id WHERE t.id IS NULL)
    AS count`).get() as { count: number }).count;
  if (relationshipOrphans !== 0) throw new SqliteFreshFoundationError("G006C1_FOUNDATION_MISMATCH", "relationship orphans");
  assertSqliteSchemaV1DatabaseHealth(db);
}

function resolveBoundary(value: SqliteFreshCompatibilityTestBoundary | undefined): TestBoundaryState | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object" || isProxy(value)) inputError("test boundary");
  const state = testBoundaries.get(value as object);
  if (!state) inputError("test boundary");
  return state;
}

function buildResult(
  input: SqliteFreshCompatibilityProvisionInput,
  status: "provisioned" | "replayed",
): SqliteFreshCompatibilityProvisionResult {
  return Object.freeze({
    status,
    databasePath: input.databasePath,
    fileIdentity: input.expectedFileIdentity,
    journalMode: input.expectedJournalMode,
    tenantId: input.foundation.tenant.id,
    workspaceId: input.foundation.workspace.id,
    ownerAuthIdentityId: input.foundation.ownerMembership.authIdentityId,
    ownerMembershipId: input.foundation.ownerMembership.id,
    ownerRoleBindingId: input.foundation.ownerRoleBinding.id,
    policyId: input.foundation.policy.id,
    policyVersion: input.foundation.policy.version,
    policyHash: input.foundation.policyHash,
    sourceCardId: input.source.cardId,
    sourceHash: input.source.sourceHash,
    playId: input.play.playId,
    playVersion: input.play.playVersion,
    playBindingId: input.play.bindingId,
    playConfigurationHash: input.play.configurationHash,
    catalogVersion: input.catalog.catalogVersion,
    userVersion: input.catalog.userVersion,
    catalogDigest: input.catalog.catalogDigest,
    internalCatalogDigest: input.catalog.internalCatalogDigest,
    physicalManifestDigest: input.catalog.physicalManifestDigest,
    applicationTableCount: input.catalog.applicationTableCount,
    foundationHash: input.expectedFoundationHash,
    canonicalBindingHash: input.expectedCanonicalBindingHash,
  });
}

/**
 * Creates or exactly re-verifies the staged fresh SQLite foundation. This is
 * storage proof only; no receipt, request, session, actor, permission, or
 * provider authority is consulted or returned.
 */
export function provisionSqliteFreshCompatibilityFoundation(
  inputValue: SqliteFreshCompatibilityProvisionInput,
  testBoundaryValue?: SqliteFreshCompatibilityTestBoundary,
): SqliteFreshCompatibilityProvisionResult {
  const input = validateInput(inputValue);
  const testBoundary = resolveBoundary(testBoundaryValue);
  requireCanonicalExistingFile(input.databasePath);

  let retained: RetainedFile | undefined;
  let writer: Database.Database | undefined;
  let verifier: Database.Database | undefined;
  let status: "provisioned" | "replayed" | undefined;
  let committed = false;
  let verified = false;
  let failure: unknown;
  const cleanupEvidence: string[] = [];

  try {
    retained = retainFile(input.databasePath, input.expectedFileIdentity);
    assertRetainedIdentity(input.databasePath, retained, "before writer open");
    writer = openExactDatabase(input.databasePath, false);
    writer.pragma("foreign_keys = ON");
    assertConnectionIdentity(writer, input.databasePath, retained, "writer before transaction");
    assertConnectionPragmas(writer, input.expectedJournalMode, "writer before transaction");

    writer.exec("BEGIN IMMEDIATE");
    try {
      assertConnectionIdentity(writer, input.databasePath, retained, "writer inside transaction");
      const before = classifySqliteSchemaV1(writer);
      if (before.kind === "fresh") {
        createFreshSqliteSchemaV1(writer);
        insertFoundation(writer, input.foundation);
        status = "provisioned";
      } else if (before.kind === "staged") {
        status = "replayed";
      } else {
        throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", `${before.kind}: ${before.reason}`);
      }
      assertExactFoundation(writer, input);
      assertConnectionIdentity(writer, input.databasePath, retained, "writer before commit");
      if (testBoundary?.fault === "hold-before-commit" && status === "provisioned") {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 750);
      }
      if (testBoundary?.fault === "fail-before-commit"
          || testBoundary?.fault === "fail-before-commit-with-cleanup-evidence") {
        throw new Error("simulated precommit failure");
      }
      writer.exec("COMMIT");
      committed = true;
    } catch (error) {
      failure = error;
      if (writer.inTransaction) {
        try {
          writer.exec("ROLLBACK");
        } catch (rollbackError) {
          cleanupEvidence.push(`writer rollback: ${describeError(rollbackError)}`);
        }
      }
      if (testBoundary?.fault === "fail-before-commit-with-cleanup-evidence") {
        cleanupEvidence.push("writer rollback: simulated cleanup evidence");
      }
    }

    if (failure === undefined && committed) {
      if (testBoundary?.fault === "fail-after-commit") throw new Error("simulated postcommit failure");
      assertConnectionIdentity(writer, input.databasePath, retained, "writer after commit");
      assertConnectionPragmas(writer, input.expectedJournalMode, "writer after commit");
    }
  } catch (error) {
    if (failure === undefined) failure = error;
  } finally {
    if (writer) {
      try {
        writer.close();
        if (testBoundary?.fault === "fail-writer-close") throw new Error("simulated writer close uncertainty");
      } catch (error) {
        if (failure === undefined) failure = error;
        else cleanupEvidence.push(`writer close: ${describeError(error)}`);
      }
    }
  }

  if (failure === undefined && committed && retained) {
    try {
      if (testBoundary?.fault === "fail-verifier-open") throw new Error("simulated verifier open failure");
      assertRetainedIdentity(input.databasePath, retained, "before verifier open");
      verifier = openExactDatabase(input.databasePath, true);
      verifier.pragma("foreign_keys = ON");
      assertConnectionIdentity(verifier, input.databasePath, retained, "verifier before proof");
      assertConnectionPragmas(verifier, input.expectedJournalMode, "verifier before proof");
      verifier.exec("BEGIN DEFERRED");
      try {
        assertConnectionIdentity(verifier, input.databasePath, retained, "verifier inside proof");
        assertExactFoundation(verifier, input);
        if (testBoundary?.fault === "fail-verifier-proof") throw new Error("simulated verifier proof failure");
        assertConnectionIdentity(verifier, input.databasePath, retained, "verifier before commit");
        verifier.exec("COMMIT");
      } catch (error) {
        failure = error;
        if (verifier.inTransaction) {
          try {
            verifier.exec("ROLLBACK");
          } catch (rollbackError) {
            cleanupEvidence.push(`verifier rollback: ${describeError(rollbackError)}`);
          }
        }
      }
      if (failure === undefined) {
        assertConnectionIdentity(verifier, input.databasePath, retained, "verifier after proof");
        verified = true;
      }
    } catch (error) {
      if (failure === undefined) failure = error;
    } finally {
      if (verifier) {
        try {
          verifier.close();
          if (testBoundary?.fault === "fail-verifier-close") throw new Error("simulated verifier close uncertainty");
        } catch (error) {
          if (failure === undefined) failure = error;
          else cleanupEvidence.push(`verifier close: ${describeError(error)}`);
        }
      }
    }
  }

  if (retained) {
    try {
      assertRetainedIdentity(input.databasePath, retained, "final retained identity");
    } catch (error) {
      if (failure === undefined) failure = error;
      else cleanupEvidence.push(`final retained identity: ${describeError(error)}`);
    }
    try {
      closeSync(retained.descriptor);
      if (testBoundary?.fault === "fail-root-close") throw new Error("simulated retained descriptor close uncertainty");
    } catch (error) {
      if (failure === undefined) failure = error;
      else cleanupEvidence.push(`retained descriptor close: ${describeError(error)}`);
    }
  }

  if (failure !== undefined) {
    if (committed) {
      throw new SqliteFreshFoundationCommittedUnverifiedError(describeError(failure), cleanupEvidence);
    }
    if (failure instanceof SqliteFreshFoundationError && cleanupEvidence.length === 0) throw failure;
    throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", describeError(failure), cleanupEvidence);
  }
  if (!committed || !verified || !status) {
    throw new SqliteFreshFoundationError("G006C1_STATE_REJECTED", "non-exhaustive provisioning outcome");
  }
  return buildResult(input, status);
}

export function __testOnlySqliteFreshDatabaseBytes(databasePath: string): string {
  if (process.env.NODE_ENV !== "test") inputError("test-only database digest unavailable");
  return createHash("sha256").update(readFileSync(databasePath)).digest("hex");
}
