import { createHash } from "node:crypto";

import { tenantIdSchema, workspaceIdSchema } from "@/lib/tenancy/schemas";
import type { TenantId, WorkspaceId } from "@/lib/tenancy/types";

export const KEY_FORMAT_VERSION = "v1";
export const KEY_FORMAT_PREFIX = `ntk:${KEY_FORMAT_VERSION}`;
export const TENANT_SCOPE_SENTINEL = "tenant-scope";

export const MAX_KEY_COMPONENTS = 16;
export const MAX_KEY_COMPONENT_BYTES = 2048;
export const MAX_KEY_LENGTH = 2048;

export function getKeyFormatVersion(): string {
  return KEY_FORMAT_VERSION;
}

const KEY_PART_DELIMITER = "|";
const OBJECT_KEY_SEPARATOR = "/";
const HASH_BYTES = 16;
const HASH_HEX_LENGTH = HASH_BYTES * 2;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;
const PURPOSE_TOKEN = /^[a-z][a-z0-9-]{2,40}$/u;

const CACHE_FAMILY = "cache";
const OBJECT_FAMILY = "object";
const IDEMPOTENCY_FAMILY = "idempotency";
const JOB_FAMILY = "job";

export const KEY_FAMILIES = [CACHE_FAMILY, OBJECT_FAMILY, IDEMPOTENCY_FAMILY, JOB_FAMILY] as const;
export type KeyFamily = (typeof KEY_FAMILIES)[number];

export const CACHE_KEY_PURPOSES = ["lookup", "query", "run-state"] as const;
export const OBJECT_KEY_PURPOSES = ["document", "artifact", "export"] as const;
export const IDEMPOTENCY_KEY_PURPOSES = ["mutation", "request", "ingest"] as const;
export const JOB_KEY_PURPOSES = ["run", "retry", "completion"] as const;
const CACHE_KEY_PURPOSE_ALLOWLIST = new Set<string>(CACHE_KEY_PURPOSES as ReadonlyArray<string>);
const OBJECT_KEY_PURPOSE_ALLOWLIST = new Set<string>(OBJECT_KEY_PURPOSES as ReadonlyArray<string>);
const IDEMPOTENCY_KEY_PURPOSE_ALLOWLIST = new Set<string>(
  IDEMPOTENCY_KEY_PURPOSES as ReadonlyArray<string>,
);
const JOB_KEY_PURPOSE_ALLOWLIST = new Set<string>(JOB_KEY_PURPOSES as ReadonlyArray<string>);
const PURPOSE_UNKNOWN_ALLOWLIST = new Set<string>();

export type CacheKeyPurpose = (typeof CACHE_KEY_PURPOSES)[number];
export type ObjectKeyPurpose = (typeof OBJECT_KEY_PURPOSES)[number];
export type IdempotencyKeyPurpose = (typeof IDEMPOTENCY_KEY_PURPOSES)[number];
export type JobKeyPurpose = (typeof JOB_KEY_PURPOSES)[number];
export type TenantWorkspaceScope = WorkspaceId | typeof TENANT_SCOPE_SENTINEL;

export interface TenantWorkspaceKeyInput {
  tenantId: TenantId | string;
  workspaceId: TenantWorkspaceScope | string;
  components: readonly string[];
}

export interface CacheKeyInput extends TenantWorkspaceKeyInput {
  family: typeof CACHE_FAMILY;
  purpose: CacheKeyPurpose;
}

export interface ObjectKeyInput extends TenantWorkspaceKeyInput {
  family: typeof OBJECT_FAMILY;
  purpose: ObjectKeyPurpose;
}

export interface IdempotencyKeyInput extends TenantWorkspaceKeyInput {
  family: typeof IDEMPOTENCY_FAMILY;
  purpose: IdempotencyKeyPurpose;
}

export interface JobKeyInput extends TenantWorkspaceKeyInput {
  family: typeof JOB_FAMILY;
  purpose: JobKeyPurpose;
}

export function buildCacheKey(input: Omit<CacheKeyInput, "family">): string {
  return buildScopedKey({
    family: CACHE_FAMILY,
    purpose: input.purpose,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    components: input.components,
    objectStorage: false,
  });
}

export function buildObjectStorageKey(input: Omit<ObjectKeyInput, "family">): string {
  return buildScopedKey({
    family: OBJECT_FAMILY,
    purpose: input.purpose,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    components: input.components,
    objectStorage: true,
  });
}

export function buildIdempotencyKey(input: Omit<IdempotencyKeyInput, "family">): string {
  return buildScopedKey({
    family: IDEMPOTENCY_FAMILY,
    purpose: input.purpose,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    components: input.components,
    objectStorage: false,
  });
}

export function buildJobKey(input: Omit<JobKeyInput, "family">): string {
  return buildScopedKey({
    family: JOB_FAMILY,
    purpose: input.purpose,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    components: input.components,
    objectStorage: false,
  });
}

function buildScopedKey(params: {
  family: KeyFamily;
  purpose: string;
  tenantId: TenantId | string;
  workspaceId: TenantWorkspaceScope | string;
  components: readonly string[];
  objectStorage: boolean;
}): string {
  const tenantId = validateTenantId(params.tenantId);
  const workspaceId = validateWorkspaceId(params.workspaceId);
  const purpose = validatePurpose(params.family, params.purpose);
  const components = encodeComponents({
    components: params.components,
    family: params.family,
    purpose,
    tenantId,
    workspaceId,
  });

  const key = params.objectStorage
    ? buildObjectStorageKeyString({ tenantId, workspaceId, family: params.family, purpose, components })
    : buildDelimitedKeyString({ tenantId, workspaceId, family: params.family, purpose, components });

  return enforceKeyLength(key);
}

function buildDelimitedKeyString(params: {
  tenantId: TenantId;
  workspaceId: TenantWorkspaceScope;
  family: KeyFamily;
  purpose: string;
  components: string[];
}): string {
  return [
    KEY_FORMAT_PREFIX,
    `tenant:${params.tenantId}`,
    `workspace:${params.workspaceId}`,
    `family:${params.family}`,
    `purpose:${params.purpose}`,
    `count:${params.components.length}`,
    `components:${params.components.join(",")}`,
  ].join(KEY_PART_DELIMITER);
}

function buildObjectStorageKeyString(params: {
  tenantId: TenantId;
  workspaceId: TenantWorkspaceScope;
  family: KeyFamily;
  purpose: string;
  components: string[];
}): string {
  const parts = [
    KEY_FORMAT_PREFIX,
    "tenant",
    params.tenantId,
    "workspace",
    params.workspaceId,
    "family",
    params.family,
    "purpose",
    params.purpose,
    "count",
    String(params.components.length),
    "components",
    ...params.components,
  ];
  const key = parts.join(OBJECT_KEY_SEPARATOR);

  if (key.startsWith(OBJECT_KEY_SEPARATOR) || key.includes("\\") || key.includes("//")) {
    throw new Error("object key cannot use platform filesystem paths.");
  }
  if (key.includes("..")) {
    throw new Error("object key cannot include dot segments.");
  }
  return key;
}

function validateTenantId(value: TenantId | string): TenantId {
  const parsed = tenantIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("tenantId must be a valid UUID.");
  }
  return parsed.data.toLowerCase() as TenantId;
}

function validateWorkspaceId(value: TenantWorkspaceScope | string): TenantWorkspaceScope {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("workspaceId is required and must be a valid UUID or tenant scope sentinel.");
  }
  if (value === TENANT_SCOPE_SENTINEL) {
    return value;
  }
  const parsed = workspaceIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("workspaceId is required and must be a valid UUID or tenant scope sentinel.");
  }
  return parsed.data.toLowerCase() as WorkspaceId;
}

function validatePurpose(family: KeyFamily, purpose: string): string {
  if (typeof purpose !== "string" || !PURPOSE_TOKEN.test(purpose)) {
    throw new Error("purpose must be an allow-listed, path-safe token.");
  }
  if (!purposeAllowlist(family).has(purpose)) {
    throw new Error("purpose must be an allow-listed value for this key family.");
  }
  return purpose;
}

function purposeAllowlist(family: KeyFamily): ReadonlySet<string> {
  switch (family) {
    case CACHE_FAMILY:
      return CACHE_KEY_PURPOSE_ALLOWLIST;
    case OBJECT_FAMILY:
      return OBJECT_KEY_PURPOSE_ALLOWLIST;
    case IDEMPOTENCY_FAMILY:
      return IDEMPOTENCY_KEY_PURPOSE_ALLOWLIST;
    case JOB_FAMILY:
      return JOB_KEY_PURPOSE_ALLOWLIST;
    default:
      return PURPOSE_UNKNOWN_ALLOWLIST;
  }
}

function encodeComponents(params: {
  components: readonly string[];
  tenantId: TenantId;
  workspaceId: TenantWorkspaceScope;
  family: KeyFamily;
  purpose: string;
}): string[] {
  if (!Array.isArray(params.components)) {
    throw new Error("components must be an array.");
  }
  if (params.components.length < 1 || params.components.length > MAX_KEY_COMPONENTS) {
    throw new Error(`components must contain 1-${MAX_KEY_COMPONENTS} entries.`);
  }

  return params.components.map((component, index) =>
    encodeComponent({
      component,
      index,
      family: params.family,
      purpose: params.purpose,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    }),
  );
}

function encodeComponent(params: {
  component: string;
  index: number;
  family: KeyFamily;
  purpose: string;
  tenantId: TenantId;
  workspaceId: TenantWorkspaceScope;
}): string {
  if (typeof params.component !== "string") {
    throw new Error("each key component must be a text value.");
  }
  const normalized = params.component.normalize("NFC");
  if (!normalized.trim()) {
    throw new Error("each key component must be a non-empty text value.");
  }
  if (CONTROL_CHARACTERS.test(normalized)) {
    throw new Error("each key component must not contain control characters.");
  }

  const bytes = Buffer.from(normalized, "utf8");
  if (bytes.length < 1 || bytes.length > MAX_KEY_COMPONENT_BYTES) {
    throw new Error(`key component byte length must be 1-${MAX_KEY_COMPONENT_BYTES}.`);
  }

  const canonical = [
    `version=${KEY_FORMAT_VERSION}`,
    `family=${params.family}`,
    `purpose=${params.purpose}`,
    `tenant=${params.tenantId}`,
    `workspace=${params.workspaceId}`,
    `index=${params.index}`,
    `bytes=${bytes.toString("hex")}`,
  ].join("|");
  const digest = createHash("sha256").update(canonical, "utf8").digest("hex");

  return digest.slice(0, HASH_HEX_LENGTH);
}

function enforceKeyLength(value: string): string {
  if (value.length < 1) {
    throw new Error("Generated key is empty.");
  }
  if (value.length > MAX_KEY_LENGTH) {
    throw new Error(`Generated key exceeds ${MAX_KEY_LENGTH} characters.`);
  }
  return value;
}
