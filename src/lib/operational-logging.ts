import "server-only";

import { createHash } from "node:crypto";

import type { AppRole } from "@/lib/permissions";
import {
  createAuditLog,
  createPlatformAuditLog,
  type PlatformAuditLogOptions,
} from "@/lib/db/queries";
import {
  getRuntimeLogContext,
  type ExplicitRuntimeLogScope,
  type RuntimeLogContext,
} from "@/lib/runtime-log-context";

export type OperationalLogCategory = "auth" | "user" | "lead" | "server" | "worker" | "build";
export type OperationalLogSeverity = "info" | "warn" | "error";

export interface OperationalLogEvent {
  action: string;
  category: OperationalLogCategory;
  severity?: OperationalLogSeverity;
  entityType?: string;
  entityId?: string | null;
  actor?: { userId?: string | null; email?: string | null; role?: AppRole | null } | null;
  metadata?: Record<string, unknown>;
  persist?: boolean;
  /** Required for intentionally context-free platform/legacy events. */
  scope?: ExplicitRuntimeLogScope;
}

export interface SanitizedOperationalLogEvent {
  readonly action: string;
  readonly category: OperationalLogCategory;
  readonly severity: OperationalLogSeverity;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly actorUserId: string | null;
  readonly actorEmail: { domain: string | null; hash: string } | null;
  readonly actorForAudit: { userId: string; email: null; role: AppRole | null } | null;
  readonly actorWasProvided: boolean;
  readonly metadata: Record<string, unknown>;
  readonly runtime: RuntimeLogContext;
  readonly scopeKind: RuntimeLogContext["scopeKind"];
  readonly persist: boolean;
}

export class OperationalLogRedactionError extends Error {
  readonly code = "REJECTED_LOG_REDACTION" as const;

  constructor() {
    super("Operational log redaction failed");
    this.name = "OperationalLogRedactionError";
  }
}

const MAX_DEPTH = 6;
const MAX_ENTRIES = 64;
const MAX_ARRAY_LENGTH = 64;
const MAX_STRING_LENGTH = 512;
const MAX_KEY_LENGTH = 64;
const MAX_EVENT_BYTES = 16_384;
const MAX_TOTAL_NODES = 512;
const REDACTED = "[redacted]";

const EVENT_KEYS = new Set([
  "action",
  "category",
  "severity",
  "entityType",
  "entityId",
  "actor",
  "metadata",
  "persist",
  "scope",
]);

const SAFE_KEY_NAMES = new Set([
  "action",
  "category",
  "severity",
  "entitytype",
  "reason",
  "result",
  "status",
  "timing",
  "durationms",
  "count",
  "processed",
  "attempt",
  "version",
  "versionid",
  "model",
  "modelid",
  "promptversion",
  "policyversion",
  "schemaversion",
  "code",
  "type",
  "errorname",
  "errorcode",
]);

const CONTEXT_KEY_NAMES = new Set([
  "tenantid",
  "workspaceid",
  "correlationid",
  "jobid",
  "runid",
  "leaseid",
  "leasegeneration",
  "actorauthidentityid",
  "membershipid",
  "rolebindingid",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(normalizedKey: string): boolean {
  if (SAFE_KEY_NAMES.has(normalizedKey)) return false;
  if (
    normalizedKey === "error" ||
    normalizedKey.startsWith("error") ||
    normalizedKey === "exception" ||
    normalizedKey.startsWith("exception") ||
    normalizedKey.includes("stack") ||
    normalizedKey.includes("trace")
  ) return true;
  return [
    "document",
    "datasheet",
    "catalog",
    "productmaterial",
    "material",
    "rawhtml",
    "html",
    "sourcepayload",
    "sourcebody",
    "sourcecontent",
    "review",
    "customerlist",
    "customerrow",
    "accountrow",
    "contact",
    "email",
    "phone",
    "mobile",
    "address",
    "person",
    "identity",
    "token",
    "secret",
    "password",
    "apikey",
    "auth",
    "cookie",
    "header",
    "session",
    "prompt",
    "modelinput",
    "modeloutput",
    "toolargument",
    "toolargs",
    "body",
    "text",
    "excerpt",
    "chunk",
    "content",
    "rawpayload",
  ].some((term) => normalizedKey.includes(term));
}

function isIdentifierKey(normalizedKey: string): boolean {
  return !SAFE_KEY_NAMES.has(normalizedKey) &&
    (normalizedKey === "id" || normalizedKey.endsWith("id") || normalizedKey.endsWith("ids"));
}

function isPlainRecord(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function readPlainRecordEntries(value: unknown): Array<[string, unknown]> {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isPlainRecord(value)) {
    throw new OperationalLogRedactionError();
  }
  const entries: Array<[string, unknown]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") throw new OperationalLogRedactionError();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || "get" in descriptor || "set" in descriptor || !descriptor.enumerable) {
      throw new OperationalLogRedactionError();
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function readCanonicalArrayValues(value: unknown[]): unknown[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new OperationalLogRedactionError();
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable ||
    typeof lengthDescriptor.value !== "number" || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) {
    throw new OperationalLogRedactionError();
  }
  const length = lengthDescriptor.value;
  const keys = Reflect.ownKeys(value);
  if (length > MAX_ARRAY_LENGTH || keys.length !== length + 1) {
    throw new OperationalLogRedactionError();
  }
  const values = new Array<unknown>(length);
  const indices = new Set<number>();
  let sawLength = false;
  for (const key of keys) {
    if (typeof key !== "string") throw new OperationalLogRedactionError();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) {
      throw new OperationalLogRedactionError();
    }
    if (key === "length") {
      if (descriptor.enumerable || descriptor.value !== length) throw new OperationalLogRedactionError();
      sawLength = true;
      continue;
    }
    if (!/^(?:0|[1-9][0-9]*)$/.test(key)) throw new OperationalLogRedactionError();
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index < 0 || index >= length || !descriptor.enumerable) {
      throw new OperationalLogRedactionError();
    }
    values[index] = descriptor.value;
    indices.add(index);
  }
  if (!sawLength || indices.size !== length) {
    throw new OperationalLogRedactionError();
  }
  return values;
}

function assertInspectableContainer(value: object): void {
  if (Array.isArray(value)) {
    readCanonicalArrayValues(value);
    return;
  }
  readPlainRecordEntries(value);
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.trim()).digest("hex").slice(0, 16);
}

function fingerprintEmail(email: string): { domain: string | null; hash: string } {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.includes("@") ? normalized.split("@").pop() || null : null;
  return { domain, hash: hashIdentifier(normalized) };
}

function fingerprintValue(value: string): string {
  return `[hash:${hashIdentifier(value)}]`;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isPhone(value: string): boolean {
  return /^\+?[0-9][0-9 .()\-]{6,}[0-9]$/.test(value.trim());
}

function isCredentialLike(value: string): boolean {
  return /^(?:bearer\s+|basic\s+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$|(?:sk|pk|rk|ghp|github_pat|xox[baprs])-|AIza[0-9A-Za-z_-]{20,})/i.test(value.trim()) ||
    /(?:api[_ -]?key|access[_ -]?token|client[_ -]?secret|secret|password|token)\s*[:=_-]\s*\S+/i.test(value);
}

function isUrlKey(normalizedKey: string): boolean {
  return normalizedKey.includes("url") || normalizedKey.includes("uri") || normalizedKey.includes("href") ||
    normalizedKey.includes("redirect") || normalizedKey === "query" || normalizedKey === "querystring" ||
    normalizedKey === "next" || normalizedKey.includes("route") || normalizedKey.includes("path") ||
    normalizedKey.includes("locator") || normalizedKey.includes("endpoint");
}

function isHighEntropyOpaquePathSegment(value: string): boolean {
  const segment = value.replace(/[._~-]/g, "");
  if (segment.length < 24 || !/^[A-Za-z0-9]+$/.test(segment)) return false;
  const frequencies = new Map<string, number>();
  for (const character of segment) frequencies.set(character, (frequencies.get(character) ?? 0) + 1);
  const entropy = [...frequencies.values()].reduce((sum, count) => {
    const probability = count / segment.length;
    return sum - probability * Math.log2(probability);
  }, 0);
  return entropy >= 4 || /^[0-9a-f]{32,}$/i.test(segment);
}

function hasSensitivePathContent(pathname: string): boolean {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  if (isCredentialLike(decodedPath) || /(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]+/i.test(decodedPath)) return true;
  return decodedPath.split("/").filter(Boolean).some((segment) =>
    /^(?:token|secret|password|api[_-]?key|key|auth|credential|cookie|session)(?:$|[=:/.\-])/i.test(segment) ||
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(segment) ||
    isHighEntropyOpaquePathSegment(segment),
  );
}

function sanitizeUrl(value: string, normalizedKey: string): string {
  const trimmed = value.trim();
  const isAbsoluteHttpUrl = /^https?:\/\//i.test(trimmed);
  const isRootRelativeRoute = trimmed.startsWith("/") && !trimmed.startsWith("//");
  if (normalizedKey === "query" || normalizedKey === "querystring" ||
    (!isAbsoluteHttpUrl && !isRootRelativeRoute) || /[\\\s]/.test(trimmed)) {
    return REDACTED;
  }
  try {
    const parsed = isAbsoluteHttpUrl
      ? new URL(trimmed)
      : new URL(trimmed, "https://redaction.invalid");
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return REDACTED;
    const path = parsed.pathname || "/";
    if (hasSensitivePathContent(path)) return REDACTED;
    return isAbsoluteHttpUrl ? `${parsed.origin}${path}` : path;
  } catch {
    return REDACTED;
  }
}

function sanitizeString(key: string, value: string): unknown {
  if (value.length > MAX_STRING_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new OperationalLogRedactionError();
  }
  const normalizedKey = normalizeKey(key);
  if (isSensitiveKey(normalizedKey)) {
    if (normalizedKey.includes("email") && isEmail(value)) return fingerprintEmail(value);
    return REDACTED;
  }
  if (isUrlKey(normalizedKey)) {
    return sanitizeUrl(value, normalizedKey);
  }
  if (isCredentialLike(value)) return REDACTED;
  if (isIdentifierKey(normalizedKey)) return fingerprintValue(value);
  if (isEmail(value) && normalizedKey.includes("email")) return fingerprintEmail(value);
  if (isPhone(value) && (normalizedKey.includes("phone") || normalizedKey.includes("mobile"))) return fingerprintValue(value);
  if (SAFE_KEY_NAMES.has(normalizedKey)) {
    return /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,127}$/.test(value) ? value : REDACTED;
  }
  // Unknown strings are untrusted free text. Numbers and booleans remain
  // useful, but prose is never preserved merely because its key is benign.
  return REDACTED;
}

interface SanitizerState {
  readonly seen: Set<object>;
  nodes: number;
}

function assertSafeErrorShape(error: Error): void {
  const builtinErrorPrototypes = new Set< object | null>([
    Error.prototype,
    EvalError.prototype,
    RangeError.prototype,
    ReferenceError.prototype,
    SyntaxError.prototype,
    TypeError.prototype,
    URIError.prototype,
  ]);
  if (!builtinErrorPrototypes.has(Object.getPrototypeOf(error))) {
    throw new OperationalLogRedactionError();
  }
  const allowedOwnKeys = new Set(["stack", "message", "cause"]);
  for (const key of Reflect.ownKeys(error)) {
    if (typeof key !== "string" || !allowedOwnKeys.has(key)) throw new OperationalLogRedactionError();
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (!descriptor || descriptor.enumerable ||
      (key !== "stack" && (!("value" in descriptor) || "get" in descriptor || "set" in descriptor))) {
      throw new OperationalLogRedactionError();
    }
  }
  let prototype: object | null = Object.getPrototypeOf(error);
  while (prototype && prototype !== Object.prototype) {
    for (const key of ["name", "message"]) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
      if (descriptor && ("get" in descriptor || "set" in descriptor)) throw new OperationalLogRedactionError();
    }
    prototype = Object.getPrototypeOf(prototype);
  }
}

function sanitizeNode(value: unknown, key: string, depth: number, state: SanitizerState): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_TOTAL_NODES || depth > MAX_DEPTH) throw new OperationalLogRedactionError();
  if (value === null || value === undefined || typeof value === "boolean") return value;
  if (typeof value === "string") return sanitizeString(key, value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new OperationalLogRedactionError();
    return value;
  }
  if (typeof value !== "object") throw new OperationalLogRedactionError();

  if (value instanceof Error) {
    try {
      assertSafeErrorShape(value);
      return {
        errorName: "Error",
        errorMessage: REDACTED,
      };
    } catch (error) {
      if (error instanceof OperationalLogRedactionError) throw error;
      throw new OperationalLogRedactionError();
    }
  }

  const objectValue = value as object;
  assertInspectableContainer(objectValue);
  const normalizedKey = normalizeKey(key);
  if (isSensitiveKey(normalizedKey)) return REDACTED;
  if (state.seen.has(objectValue)) throw new OperationalLogRedactionError();
    state.seen.add(objectValue);
  try {
    if (Array.isArray(objectValue)) {
      return Object.freeze(readCanonicalArrayValues(objectValue as unknown[])
        .map((item) => sanitizeNode(item, key, depth + 1, state)));
    }

    const output: Record<string, unknown> = {};
    const entries = readPlainRecordEntries(objectValue);
    if (entries.length > MAX_ENTRIES) throw new OperationalLogRedactionError();
    for (const [childKey, childValue] of entries) {
      if (childKey.length > MAX_KEY_LENGTH || !/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(childKey)) {
        throw new OperationalLogRedactionError();
      }
      const normalizedChildKey = normalizeKey(childKey);
      // Caller metadata can never become effective context. It is omitted,
      // while the controlled runtime envelope is added by the caller below.
      if (CONTEXT_KEY_NAMES.has(normalizedChildKey)) continue;
      const child = sanitizeNode(childValue, childKey, depth + 1, state);
      Object.defineProperty(output, childKey, { value: child, enumerable: true, writable: true, configurable: true });
    }
    return Object.freeze(output);
  } finally {
    state.seen.delete(objectValue);
  }
}

function sanitizeMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata === undefined) return {};
  const result = sanitizeNode(metadata, "metadata", 0, { seen: new Set(), nodes: 0 });
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new OperationalLogRedactionError();
  return result as Record<string, unknown>;
}

function sanitizeEventShape(event: unknown): OperationalLogEvent {
  const entries = readPlainRecordEntries(event);
  if (entries.some(([key]) => !EVENT_KEYS.has(key))) throw new OperationalLogRedactionError();
  const snapshot: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    Object.defineProperty(snapshot, key, { value, enumerable: true, writable: true, configurable: true });
  }
  return snapshot as unknown as OperationalLogEvent;
}

function sanitizeEventText(value: unknown, pattern: RegExp, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || !pattern.test(value)) {
    throw new OperationalLogRedactionError();
  }
  return value;
}

const ACTION_PATTERN = /^[a-z][a-z0-9_.:-]{0,127}$/;
const ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9_.:-]{0,63}$/;

function sanitizeActor(actor: OperationalLogEvent["actor"]): {
  actorUserId: string | null;
  actorEmail: { domain: string | null; hash: string } | null;
  actorForAudit: { userId: string; email: null; role: AppRole | null } | null;
  actorWasProvided: boolean;
} {
  if (actor === null || actor === undefined) {
    return { actorUserId: null, actorEmail: null, actorForAudit: null, actorWasProvided: actor === null };
  }
  if (typeof actor !== "object" || Array.isArray(actor) || !isPlainRecord(actor)) throw new OperationalLogRedactionError();
  const entries = readPlainRecordEntries(actor);
  const values = new Map(entries);
  if (entries.some(([key]) => !new Set(["userId", "email", "role"]).has(key))) throw new OperationalLogRedactionError();
  const userId = (values.get("userId") ?? null);
  const email = (values.get("email") ?? null);
  const role = (values.get("role") ?? null);
  if (userId !== null && (typeof userId !== "string" || userId.length > MAX_STRING_LENGTH)) throw new OperationalLogRedactionError();
  if (email !== null && (typeof email !== "string" || email.length > MAX_STRING_LENGTH)) throw new OperationalLogRedactionError();
  if (role !== null && role !== "admin" && role !== "researcher") throw new OperationalLogRedactionError();
  const actorUserId = userId ? hashIdentifier(userId) : null;
  const actorEmail = email ? fingerprintEmail(email) : null;
  return {
    actorUserId,
    actorEmail,
    actorForAudit: actorUserId ? { userId: actorUserId, email: null, role } : null,
    actorWasProvided: true,
  };
}

export function sanitizeOperationalLogEvent(event: OperationalLogEvent): SanitizedOperationalLogEvent {
  const safeEvent = sanitizeEventShape(event);
  const severity = safeEvent.severity ?? "info";
  if (severity !== "info" && severity !== "warn" && severity !== "error") throw new OperationalLogRedactionError();
  const action = sanitizeEventText(safeEvent.action, ACTION_PATTERN, 128);
  const category = safeEvent.category;
  if (category !== "auth" && category !== "user" && category !== "lead" && category !== "server" && category !== "worker" && category !== "build") {
    throw new OperationalLogRedactionError();
  }
  const entityType = safeEvent.entityType === undefined ? category : sanitizeEventText(safeEvent.entityType, ENTITY_TYPE_PATTERN, 64);
  const entityId = safeEvent.entityId === undefined || safeEvent.entityId === null
    ? null
    : sanitizeEventText(safeEvent.entityId, /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/, 256) && hashIdentifier(safeEvent.entityId);
  if (safeEvent.persist !== undefined && typeof safeEvent.persist !== "boolean") throw new OperationalLogRedactionError();
  if (safeEvent.scope !== undefined && safeEvent.scope !== "platform" && safeEvent.scope !== "legacy_unscoped") throw new OperationalLogRedactionError();

  const runtime = getRuntimeLogContext(safeEvent.scope);
  const actor = sanitizeActor(safeEvent.actor);
  const metadata = sanitizeMetadata(safeEvent.metadata);
  const envelope = Object.freeze({
    ...metadata,
    category,
    severity,
    runtime,
  });
  const output: SanitizedOperationalLogEvent = Object.freeze({
    action,
    category,
    severity,
    entityType,
    entityId,
    actorUserId: actor.actorUserId,
    actorEmail: actor.actorEmail,
    actorForAudit: actor.actorForAudit,
    actorWasProvided: actor.actorWasProvided,
    metadata: envelope,
    runtime,
    scopeKind: runtime.scopeKind,
    persist: safeEvent.persist !== false,
  });
  if (JSON.stringify(output).length > MAX_EVENT_BYTES) throw new OperationalLogRedactionError();
  return output;
}

function fixedRejectionMetadata(runtime: RuntimeLogContext | null): Record<string, unknown> {
  return {
    reasonCode: "REJECTED_LOG_REDACTION",
    version: 1,
    runtime: runtime ?? Object.freeze({
      scopeKind: "legacy_unscoped",
      tenantId: null,
      workspaceId: null,
      correlationId: null,
      jobId: null,
      runId: null,
      leaseId: null,
      leaseGeneration: null,
      workerName: null,
      workerAction: null,
      sourcePrincipalKind: null,
      vercelEnv: null,
      vercelUrl: null,
      gitRef: null,
      gitSha: null,
    }),
  };
}

async function emitRedactionRejection(runtime: RuntimeLogContext | null): Promise<void> {
  const metadata = fixedRejectionMetadata(runtime);
  try {
    console.error("operational_event", {
      action: "REJECTED_LOG_REDACTION",
      category: "server",
      severity: "error",
      entityType: "operational_log",
      entityId: null,
      actorUserId: null,
      actorEmail: null,
      metadata,
    });
  } catch {
    // Fixed incident reporting must not turn a rejected event into an
    // attacker-controlled exception or attempt to serialize the event again.
  }
  // Worker audit persistence is intentionally unavailable until its later
  // worker-audit contract exists; never misclassify it as legacy/platform.
  if (runtime?.scopeKind === "worker") return;
  try {
    if (runtime?.scopeKind === "platform") {
      const options: PlatformAuditLogOptions = {
        scope: "platform",
        actor: { layer: "system" },
      };
      await createPlatformAuditLog("rejected_log_redaction", "operational_log", undefined, metadata, options);
    } else {
      await createAuditLog("rejected_log_redaction", "operational_log", undefined, metadata);
    }
  } catch {
    try {
      console.warn("operational_event_persist_failed", { code: "OPERATIONAL_EVENT_PERSIST_FAILED", version: 1 });
    } catch {
      // The fixed console incident is already privacy-safe. Never log the
      // original event or persistence error as a fallback.
    }
  }
}

async function persistSanitizedEvent(event: SanitizedOperationalLogEvent): Promise<void> {
  if (event.scopeKind === "worker") return;
  if (event.scopeKind === "platform") {
    await createPlatformAuditLog(
      event.action,
      event.entityType,
      event.entityId ?? undefined,
      event.metadata,
      { scope: "platform", actor: { layer: "system" } },
    );
    return;
  }
  await createAuditLog(
    event.action,
    event.entityType,
    event.entityId ?? undefined,
    event.metadata,
    event.actorWasProvided ? { actor: event.actorForAudit } : {},
  );
}

export async function recordOperationalEvent(event: OperationalLogEvent): Promise<void> {
  let sanitized: SanitizedOperationalLogEvent;
  try {
    sanitized = sanitizeOperationalLogEvent(event);
  } catch {
    let rejectionRuntime: RuntimeLogContext | null = null;
    try {
      // This call reads only accepted async-local context. It deliberately
      // does not inspect the rejected event or its scope/persist fields.
      rejectionRuntime = getRuntimeLogContext();
    } catch {
      rejectionRuntime = null;
    }
    await emitRedactionRejection(rejectionRuntime);
    throw new OperationalLogRedactionError();
  }

  const payload = {
    action: sanitized.action,
    category: sanitized.category,
    severity: sanitized.severity,
    entityType: sanitized.entityType,
    entityId: sanitized.entityId,
    actorUserId: sanitized.actorUserId,
    actorEmail: sanitized.actorEmail,
    runtime: sanitized.runtime,
    metadata: sanitized.metadata,
  };
  const writer = sanitized.severity === "error" ? console.error : sanitized.severity === "warn" ? console.warn : console.info;
  try {
    writer("operational_event", payload);
  } catch {
    try {
      console.error("operational_event_emit_failed", { code: "OPERATIONAL_LOG_EMIT_FAILED", version: 1 });
    } catch {
      // A broken console must never cause the logger to serialize or expose
      // the original event through a fallback path.
    }
  }

  if (!sanitized.persist) return;
  if (sanitized.scopeKind === "worker") {
    try {
      console.warn("operational_event_persist_unavailable", { code: "OPERATIONAL_EVENT_PERSIST_UNAVAILABLE", version: 1 });
    } catch {
      // Persistence unavailability is already represented by a fixed code;
      // a broken console cannot expose the original event.
    }
    return;
  }
  try {
    await persistSanitizedEvent(sanitized);
  } catch {
    try {
      console.warn("operational_event_persist_failed", { code: "OPERATIONAL_EVENT_PERSIST_FAILED", version: 1 });
    } catch {
      // Never expose the original persistence error through a fallback.
    }
  }
}

export function buildErrorMetadata(error: unknown): Record<string, unknown> {
  return { errorName: error instanceof Error ? "Error" : typeof error, errorMessage: "[redacted]" };
}
