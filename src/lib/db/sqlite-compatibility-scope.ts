import { isProxy } from "node:util/types";

import {
  SQLITE_G006B_SOURCE_CARD_ID,
  runSqliteG006bPreFinalization,
  type SqliteG006bReplayInput,
} from "./sqlite-g006b-pre-finalization";
import type {
  SqliteFreshCompatibilityProvisionInput,
  SqliteFreshCompatibilityProvisionResult,
  SqliteFreshCompatibilityTestBoundary,
} from "./sqlite-fresh-compatibility-scope";

export type {
  SqliteFreshCompatibilityProvisionInput,
  SqliteFreshCompatibilityTestBoundary,
} from "./sqlite-fresh-compatibility-scope";

export type SqliteCompatibilityScopeErrorCode =
  | "G006C0_INPUT_REJECTED"
  | "G006C0_FRESH_FOUNDATION_REQUIRED"
  | "G006C0_CAPABILITY_REQUIRED"
  | "G006C0_SCOPE_MISMATCH";

export class SqliteCompatibilityScopeError extends Error {
  public readonly code: SqliteCompatibilityScopeErrorCode;
  public readonly detail: string;

  public constructor(code: SqliteCompatibilityScopeErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "SqliteCompatibilityScopeError";
    this.code = code;
    this.detail = detail ?? "";
  }
}

export interface PostgresCompatibilityScopeInput {
  readonly backend: "postgresql";
}

export interface UpgradedSqliteCompatibilityScopeInput {
  readonly backend: "sqlite";
  readonly lifecycle: "upgraded";
  readonly replay: SqliteG006bReplayInput;
}

export interface FreshSqliteCompatibilityScopeInput {
  readonly backend: "sqlite";
  readonly lifecycle: "fresh";
}

export type CompatibilityScopeInput =
  | PostgresCompatibilityScopeInput
  | UpgradedSqliteCompatibilityScopeInput
  | FreshSqliteCompatibilityScopeInput;

export interface PostgresCompatibilityScope {
  readonly backend: "postgresql";
}

declare const sqliteCompatibilityBindingBrand: unique symbol;

/**
 * Fieldless storage-scope capability. Its authority exists only in this
 * module's private WeakMap; copying or spreading the value grants nothing.
 */
export interface SqliteCompatibilityBinding {
  readonly [sqliteCompatibilityBindingBrand]: "sqlite-compatibility-binding";
}

export type CompatibilityScope = PostgresCompatibilityScope | SqliteCompatibilityBinding;

export interface SqliteCompatibilityScopeExpectation {
  readonly databasePath: string;
  readonly tenantId: string;
  readonly workspaceId: string;
}

export interface SqliteCompatibilityStorageScope {
  readonly backend: "sqlite";
  readonly lifecycle: "upgraded";
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly ownerAuthIdentityId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyHash: string;
  readonly sourceCardId: typeof SQLITE_G006B_SOURCE_CARD_ID;
  readonly playBindingId: string;
  readonly playConfigurationHash: string;
  readonly preparedHandoffId: string;
  readonly committedHandoffId: string;
  readonly canonicalBindingHash: string;
  readonly authority: "storage-scope-only";
  readonly grantsAuthentication: false;
  readonly grantsAuthorization: false;
  readonly grantsProviderExecution: false;
}

export interface FreshSqliteCompatibilityStorageScope {
  readonly backend: "sqlite";
  readonly lifecycle: "fresh";
  readonly provisioningStatus: "provisioned" | "replayed";
  readonly fileIdentity: Readonly<{ readonly device: string; readonly fileId: string }>;
  readonly journalMode: "delete" | "wal";
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly ownerAuthIdentityId: string;
  readonly ownerMembershipId: string;
  readonly ownerRoleBindingId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyHash: string;
  readonly sourceCardId: "google_places_legacy";
  readonly sourceHash: string;
  readonly playId: "compatibility.legacy-website-lead";
  readonly playVersion: 1;
  readonly playBindingId: string;
  readonly playConfigurationHash: string;
  readonly catalogVersion: 1;
  readonly userVersion: 6001;
  readonly catalogDigest: string;
  readonly internalCatalogDigest: string;
  readonly physicalManifestDigest: string;
  readonly applicationTableCount: 37;
  readonly foundationHash: string;
  readonly canonicalBindingHash: string;
  readonly authority: "storage-scope-only";
  readonly grantsAuthentication: false;
  readonly grantsAuthorization: false;
  readonly grantsProviderExecution: false;
}

interface BindingState {
  readonly databasePath: string;
  readonly scope: SqliteCompatibilityStorageScope;
}

interface FreshBindingState {
  readonly databasePath: string;
  readonly scope: FreshSqliteCompatibilityStorageScope;
}

type DataRecord = Readonly<Record<string, unknown>>;

const bindingStates = new WeakMap<object, BindingState>();
const freshBindingStates = new WeakMap<object, FreshBindingState>();

function rejectInput(detail: string): never {
  throw new SqliteCompatibilityScopeError("G006C0_INPUT_REJECTED", detail);
}

function readPlainDataRecord(value: unknown, label: string): DataRecord {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    return rejectInput(`${label} must be a non-proxy plain record`);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return rejectInput(`${label} must have the plain object prototype`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") return rejectInput(`${label} contains a symbol key`);
    const descriptor = descriptors[key];
    if (!("value" in descriptor)) return rejectInput(`${label}.${key} must be a data property`);
    record[key] = descriptor.value;
  }
  return Object.freeze(record);
}

function requireExactKeys(record: DataRecord, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    rejectInput(`${label} keys`);
  }
}

function requireString(record: DataRecord, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) rejectInput(`${label}.${key}`);
  return value;
}

function requireSafeInteger(record: DataRecord, key: string, label: string): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) rejectInput(`${label}.${key}`);
  return value;
}

function snapshotUpgradedScope(replayValue: unknown): {
  readonly replay: SqliteG006bReplayInput;
  readonly databasePath: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly ownerAuthIdentityId: string;
  readonly policyId: string;
  readonly policyVersion: number;
  readonly policyHash: string;
  readonly playBindingId: string;
  readonly playConfigurationHash: string;
  readonly expectedPreparedHandoffId: string;
  readonly expectedCommittedHandoffId: string;
} {
  const replay = readPlainDataRecord(replayValue, "input.replay");
  if (replay.mode !== "replay") rejectInput("input.replay.mode must be replay");
  const manifest = readPlainDataRecord(replay.manifest, "input.replay.manifest");
  return Object.freeze({
    replay: replayValue as SqliteG006bReplayInput,
    databasePath: requireString(replay, "databasePath", "input.replay"),
    tenantId: requireString(manifest, "tenantId", "input.replay.manifest"),
    workspaceId: requireString(manifest, "workspaceId", "input.replay.manifest"),
    ownerAuthIdentityId: requireString(manifest, "ownerAuthIdentityId", "input.replay.manifest"),
    policyId: requireString(manifest, "policyId", "input.replay.manifest"),
    policyVersion: requireSafeInteger(manifest, "policyVersion", "input.replay.manifest"),
    policyHash: requireString(manifest, "policyHash", "input.replay.manifest"),
    playBindingId: requireString(replay, "expectedBindingId", "input.replay"),
    playConfigurationHash: requireString(replay, "expectedConfigurationHash", "input.replay"),
    expectedPreparedHandoffId: requireString(replay, "expectedPreparedHandoffId", "input.replay"),
    expectedCommittedHandoffId: requireString(replay, "expectedCommittedHandoffId", "input.replay"),
  });
}

function snapshotVerifiedResult(value: unknown): {
  readonly preparedHandoffId: string;
  readonly committedHandoffId: string;
  readonly bindingHash: string;
} {
  const result = readPlainDataRecord(value, "G006B replay result");
  requireExactKeys(
    result,
    ["mode", "status", "preparedHandoffId", "committedHandoffId", "bindingHash"],
    "G006B replay result",
  );
  if (result.mode !== "replay" || result.status !== "replayed") {
    rejectInput("G006B did not return exact replayed success");
  }
  return Object.freeze({
    preparedHandoffId: requireString(result, "preparedHandoffId", "G006B replay result"),
    committedHandoffId: requireString(result, "committedHandoffId", "G006B replay result"),
    bindingHash: requireString(result, "bindingHash", "G006B replay result"),
  });
}

interface SnapshotBudget {
  nodes: number;
}

function snapshotFreshData(value: unknown, label: string, budget: SnapshotBudget, depth = 0): unknown {
  budget.nodes += 1;
  if (budget.nodes > 50_000 || depth > 64) rejectInput(`${label} exceeds snapshot limits`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) rejectInput(`${label} must contain finite numbers`);
    return value;
  }
  if (typeof value !== "object" || isProxy(value)) rejectInput(`${label} contains unsupported data`);
  if (Array.isArray(value)) {
    if (value.length > 10_000) rejectInput(`${label} array is too large`);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (typeof key !== "string" || (key !== "length" && !/^(0|[1-9]\d*)$/u.test(key))) {
        rejectInput(`${label} array keys`);
      }
      if (key !== "length" && !("value" in descriptors[key])) rejectInput(`${label}[${key}] must be a data property`);
    }
    const copy: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) rejectInput(`${label} must not contain sparse arrays`);
      copy.push(snapshotFreshData(value[index], `${label}[${index}]`, budget, depth + 1));
    }
    return Object.freeze(copy);
  }
  const record = readPlainDataRecord(value, label);
  const copy: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    copy[key] = snapshotFreshData(record[key], `${label}.${key}`, budget, depth + 1);
  }
  return Object.freeze(copy);
}

function snapshotFreshProvisionInput(inputValue: unknown): SqliteFreshCompatibilityProvisionInput {
  const snapshot = snapshotFreshData(inputValue, "input", { nodes: 0 });
  const input = readPlainDataRecord(snapshot, "input");
  requireExactKeys(input, [
    "backend", "lifecycle", "databasePath", "expectedFileIdentity", "expectedJournalMode", "foundation",
    "source", "play", "catalog", "expectedFoundationHash", "expectedCanonicalBindingHash",
  ], "input");
  if (input.backend !== "sqlite" || input.lifecycle !== "fresh") rejectInput("input fresh discriminants");
  const fileIdentity = readPlainDataRecord(input.expectedFileIdentity, "input.expectedFileIdentity");
  requireExactKeys(fileIdentity, ["device", "fileId"], "input.expectedFileIdentity");
  const foundation = readPlainDataRecord(input.foundation, "input.foundation");
  requireExactKeys(
    foundation,
    ["tenant", "workspace", "ownerMembership", "ownerRoleBinding", "policy", "policyHash"],
    "input.foundation",
  );
  const tenant = readPlainDataRecord(foundation.tenant, "input.foundation.tenant");
  requireExactKeys(tenant, ["id", "slug", "name", "status", "locale", "timezone", "createdAt", "updatedAt"], "input.foundation.tenant");
  const workspace = readPlainDataRecord(foundation.workspace, "input.foundation.workspace");
  requireExactKeys(workspace, ["id", "tenantId", "slug", "name", "status", "createdAt", "updatedAt"], "input.foundation.workspace");
  const membership = readPlainDataRecord(foundation.ownerMembership, "input.foundation.ownerMembership");
  requireExactKeys(membership, [
    "id", "tenantId", "authIdentityId", "pendingIdentityRefHash", "workspaceId", "status",
    "invitedByMembershipId", "createdAt", "updatedAt",
  ], "input.foundation.ownerMembership");
  const role = readPlainDataRecord(foundation.ownerRoleBinding, "input.foundation.ownerRoleBinding");
  requireExactKeys(role, [
    "id", "tenantId", "membershipId", "role", "createdAt", "validFrom", "revokedAt",
    "assignedByMembershipId", "reasonCode",
  ], "input.foundation.ownerRoleBinding");
  const policy = readPlainDataRecord(foundation.policy, "input.foundation.policy");
  requireExactKeys(policy, [
    "id", "tenantId", "version", "locale", "timezone", "exportRetentionDays", "operationalLogRetentionDays",
    "rawSourceRetentionDays", "contactFreshnessDays", "primaryDeleteWithinDays", "backupExpireWithinDays",
    "tombstoneRetentionYears", "activeMaterialsMode", "aiProcessingEnabled", "sourceResearchEnabled",
    "contactResearchEnabled", "outreachDraftingEnabled", "copyExportEnabled", "autonomousSendEnabled",
    "requireSourcePlanApproval", "requireKnowledgeReview", "requireIcpReview", "requireLeadPlayReview",
    "requireContactReview", "requireOutreachReview", "createdAt", "updatedAt",
  ], "input.foundation.policy");
  const source = readPlainDataRecord(input.source, "input.source");
  requireExactKeys(source, ["cardId", "sourceHash"], "input.source");
  const play = readPlainDataRecord(input.play, "input.play");
  requireExactKeys(play, ["seed", "playId", "playVersion", "configurationHash", "bindingId"], "input.play");
  const catalog = readPlainDataRecord(input.catalog, "input.catalog");
  requireExactKeys(catalog, [
    "catalogVersion", "userVersion", "catalogDigest", "internalCatalogDigest", "physicalManifestDigest",
    "applicationTableCount",
  ], "input.catalog");
  return snapshot as SqliteFreshCompatibilityProvisionInput;
}

function snapshotFreshVerifiedResult(value: unknown): SqliteFreshCompatibilityProvisionResult {
  const result = readPlainDataRecord(value, "G006C1 provision result");
  requireExactKeys(result, [
    "status", "databasePath", "fileIdentity", "journalMode", "tenantId", "workspaceId", "ownerAuthIdentityId",
    "ownerMembershipId", "ownerRoleBindingId", "policyId", "policyVersion", "policyHash", "sourceCardId", "sourceHash",
    "playId", "playVersion", "playBindingId", "playConfigurationHash", "catalogVersion", "userVersion",
    "catalogDigest", "internalCatalogDigest", "physicalManifestDigest", "applicationTableCount", "foundationHash",
    "canonicalBindingHash",
  ], "G006C1 provision result");
  if (result.status !== "provisioned" && result.status !== "replayed") rejectInput("G006C1 provision result.status");
  const identity = readPlainDataRecord(result.fileIdentity, "G006C1 provision result.fileIdentity");
  requireExactKeys(identity, ["device", "fileId"], "G006C1 provision result.fileIdentity");
  return value as SqliteFreshCompatibilityProvisionResult;
}

/**
 * Verifies only storage scope. PostgreSQL is an explicit no-op discriminant;
 * upgraded SQLite authority is minted only from this call's G006B replay.
 */
export async function verifyCompatibilityScope(inputValue: CompatibilityScopeInput): Promise<CompatibilityScope> {
  const input = readPlainDataRecord(inputValue, "input");
  if (input.backend === "postgresql") {
    requireExactKeys(input, ["backend"], "input");
    return Object.freeze({ backend: "postgresql" });
  }
  if (input.backend !== "sqlite") rejectInput("input.backend");
  if (input.lifecycle === "fresh") {
    requireExactKeys(input, ["backend", "lifecycle"], "input");
    throw new SqliteCompatibilityScopeError(
      "G006C0_FRESH_FOUNDATION_REQUIRED",
      "C1 must explicitly provision and verify the named fresh foundation",
    );
  }
  if (input.lifecycle !== "upgraded") rejectInput("input.lifecycle");
  requireExactKeys(input, ["backend", "lifecycle", "replay"], "input");

  // Capture every primitive retained by C0 before G006B reaches an async
  // boundary. G006B synchronously validates and snapshots the complete replay.
  const snapshot = snapshotUpgradedScope(input.replay);
  const result = snapshotVerifiedResult(await runSqliteG006bPreFinalization(snapshot.replay));
  if (result.preparedHandoffId !== snapshot.expectedPreparedHandoffId
      || result.committedHandoffId !== snapshot.expectedCommittedHandoffId) {
    rejectInput("G006B replay result handoff identity");
  }

  const scope: SqliteCompatibilityStorageScope = Object.freeze({
    backend: "sqlite",
    lifecycle: "upgraded",
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    ownerAuthIdentityId: snapshot.ownerAuthIdentityId,
    policyId: snapshot.policyId,
    policyVersion: snapshot.policyVersion,
    policyHash: snapshot.policyHash,
    sourceCardId: SQLITE_G006B_SOURCE_CARD_ID,
    playBindingId: snapshot.playBindingId,
    playConfigurationHash: snapshot.playConfigurationHash,
    preparedHandoffId: result.preparedHandoffId,
    committedHandoffId: result.committedHandoffId,
    canonicalBindingHash: result.bindingHash,
    authority: "storage-scope-only",
    grantsAuthentication: false,
    grantsAuthorization: false,
    grantsProviderExecution: false,
  });
  const capability = Object.freeze(Object.create(null)) as SqliteCompatibilityBinding;
  bindingStates.set(capability as object, Object.freeze({ databasePath: snapshot.databasePath, scope }));
  return capability;
}

/**
 * Reveals only replay-verified storage evidence after exact selector matching.
 * The result is not actor, permission, request, or provider authority.
 */
export function requireSqliteCompatibilityScope(
  binding: SqliteCompatibilityBinding,
  expectationValue: SqliteCompatibilityScopeExpectation,
): SqliteCompatibilityStorageScope {
  if (binding === null || typeof binding !== "object" || isProxy(binding)) {
    throw new SqliteCompatibilityScopeError("G006C0_CAPABILITY_REQUIRED");
  }
  const state = bindingStates.get(binding as object);
  if (!state) throw new SqliteCompatibilityScopeError("G006C0_CAPABILITY_REQUIRED");

  const expectation = readPlainDataRecord(expectationValue, "expectation");
  requireExactKeys(expectation, ["databasePath", "tenantId", "workspaceId"], "expectation");
  const databasePath = requireString(expectation, "databasePath", "expectation");
  const tenantId = requireString(expectation, "tenantId", "expectation");
  const workspaceId = requireString(expectation, "workspaceId", "expectation");
  if (databasePath !== state.databasePath
      || tenantId !== state.scope.tenantId
      || workspaceId !== state.scope.workspaceId) {
    throw new SqliteCompatibilityScopeError("G006C0_SCOPE_MISMATCH");
  }
  return state.scope;
}

/**
 * Explicitly provisions or re-verifies only the named fresh SQLite storage
 * foundation. The implementation is loaded only after the complete caller
 * input has been synchronously detached and descriptor-validated.
 */
export async function provisionFreshSqliteCompatibilityScope(
  inputValue: SqliteFreshCompatibilityProvisionInput,
  testBoundary?: SqliteFreshCompatibilityTestBoundary,
): Promise<SqliteCompatibilityBinding> {
  const snapshot = snapshotFreshProvisionInput(inputValue);
  const fresh = await import("./sqlite-fresh-compatibility-scope");
  const result = snapshotFreshVerifiedResult(
    fresh.provisionSqliteFreshCompatibilityFoundation(snapshot, testBoundary),
  );
  const expectedIdentity = snapshot.expectedFileIdentity;
  if (result.databasePath !== snapshot.databasePath
      || result.fileIdentity.device !== expectedIdentity.device
      || result.fileIdentity.fileId !== expectedIdentity.fileId
      || result.journalMode !== snapshot.expectedJournalMode
      || result.tenantId !== snapshot.foundation.tenant.id
      || result.workspaceId !== snapshot.foundation.workspace.id
      || result.ownerAuthIdentityId !== snapshot.foundation.ownerMembership.authIdentityId
      || result.ownerMembershipId !== snapshot.foundation.ownerMembership.id
      || result.ownerRoleBindingId !== snapshot.foundation.ownerRoleBinding.id
      || result.policyId !== snapshot.foundation.policy.id
      || result.policyVersion !== snapshot.foundation.policy.version
      || result.policyHash !== snapshot.foundation.policyHash
      || result.sourceCardId !== snapshot.source.cardId
      || result.sourceHash !== snapshot.source.sourceHash
      || result.playId !== snapshot.play.playId
      || result.playVersion !== snapshot.play.playVersion
      || result.playBindingId !== snapshot.play.bindingId
      || result.playConfigurationHash !== snapshot.play.configurationHash
      || result.catalogVersion !== snapshot.catalog.catalogVersion
      || result.userVersion !== snapshot.catalog.userVersion
      || result.catalogDigest !== snapshot.catalog.catalogDigest
      || result.internalCatalogDigest !== snapshot.catalog.internalCatalogDigest
      || result.physicalManifestDigest !== snapshot.catalog.physicalManifestDigest
      || result.applicationTableCount !== snapshot.catalog.applicationTableCount
      || result.foundationHash !== snapshot.expectedFoundationHash
      || result.canonicalBindingHash !== snapshot.expectedCanonicalBindingHash) {
    rejectInput("G006C1 provision result binding");
  }

  const scope: FreshSqliteCompatibilityStorageScope = Object.freeze({
    backend: "sqlite",
    lifecycle: "fresh",
    provisioningStatus: result.status,
    fileIdentity: Object.freeze({ device: result.fileIdentity.device, fileId: result.fileIdentity.fileId }),
    journalMode: result.journalMode,
    tenantId: result.tenantId,
    workspaceId: result.workspaceId,
    ownerAuthIdentityId: result.ownerAuthIdentityId,
    ownerMembershipId: result.ownerMembershipId,
    ownerRoleBindingId: result.ownerRoleBindingId,
    policyId: result.policyId,
    policyVersion: result.policyVersion,
    policyHash: result.policyHash,
    sourceCardId: result.sourceCardId,
    sourceHash: result.sourceHash,
    playId: result.playId,
    playVersion: result.playVersion,
    playBindingId: result.playBindingId,
    playConfigurationHash: result.playConfigurationHash,
    catalogVersion: result.catalogVersion,
    userVersion: result.userVersion,
    catalogDigest: result.catalogDigest,
    internalCatalogDigest: result.internalCatalogDigest,
    physicalManifestDigest: result.physicalManifestDigest,
    applicationTableCount: result.applicationTableCount,
    foundationHash: result.foundationHash,
    canonicalBindingHash: result.canonicalBindingHash,
    authority: "storage-scope-only",
    grantsAuthentication: false,
    grantsAuthorization: false,
    grantsProviderExecution: false,
  });
  const capability = Object.freeze(Object.create(null)) as SqliteCompatibilityBinding;
  freshBindingStates.set(capability as object, Object.freeze({ databasePath: snapshot.databasePath, scope }));
  return capability;
}

/** Reveals only a fresh foundation's storage evidence after exact selection. */
export function requireFreshSqliteCompatibilityScope(
  binding: SqliteCompatibilityBinding,
  expectationValue: SqliteCompatibilityScopeExpectation,
): FreshSqliteCompatibilityStorageScope {
  if (binding === null || typeof binding !== "object" || isProxy(binding)) {
    throw new SqliteCompatibilityScopeError("G006C0_CAPABILITY_REQUIRED");
  }
  const state = freshBindingStates.get(binding as object);
  if (!state) throw new SqliteCompatibilityScopeError("G006C0_CAPABILITY_REQUIRED");

  const expectation = readPlainDataRecord(expectationValue, "expectation");
  requireExactKeys(expectation, ["databasePath", "tenantId", "workspaceId"], "expectation");
  const databasePath = requireString(expectation, "databasePath", "expectation");
  const tenantId = requireString(expectation, "tenantId", "expectation");
  const workspaceId = requireString(expectation, "workspaceId", "expectation");
  if (databasePath !== state.databasePath
      || tenantId !== state.scope.tenantId
      || workspaceId !== state.scope.workspaceId) {
    throw new SqliteCompatibilityScopeError("G006C0_SCOPE_MISMATCH");
  }
  return state.scope;
}
