import { isProxy } from "node:util/types";

import {
  SQLITE_G006B_SOURCE_CARD_ID,
  runSqliteG006bPreFinalization,
  type SqliteG006bReplayInput,
} from "./sqlite-g006b-pre-finalization";

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

interface BindingState {
  readonly databasePath: string;
  readonly scope: SqliteCompatibilityStorageScope;
}

type DataRecord = Readonly<Record<string, unknown>>;

const bindingStates = new WeakMap<object, BindingState>();

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
