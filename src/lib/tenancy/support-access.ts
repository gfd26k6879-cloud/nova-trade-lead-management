import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  getTenantPermissionDecision,
  isTenantRole,
  type TenantRole,
} from "@/lib/permissions";
import { getTenantContext, type TenantContext } from "@/lib/tenancy/context";
import { isSupportAccessGrantEligibleAt, supportAccessGrantSchema } from "@/lib/tenancy/schemas";
import {
  PLATFORM_SUPPORT_ROLE,
  SUPPORT_ACCESS_GRANT_DATA_CLASSES,
  SUPPORT_ACCESS_GRANT_PERMISSIONS,
  type SupportAccessGrant,
  type SupportAccessGrantDataClass,
  type SupportAccessGrantPermission,
} from "@/lib/tenancy/types";
import { getWorkerTenantContext } from "@/lib/tenancy/worker-context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const REASON_CODE = /^[a-z][a-z0-9._-]{2,79}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type SupportAccessOperation = "request" | "approve" | "revoke" | "check" | "authorize_and_run" | "list_current" | "list_history";

export const SUPPORT_ACCESS_CODES = [
  "OK_SUPPORT_GRANT_REQUESTED", "OK_SUPPORT_GRANT_APPROVED", "OK_SUPPORT_GRANT_REVOKED", "OK_SUPPORT_AUTHORIZED", "OK_SUPPORT_REPLAY",
  "SUPPORT_GRANT_REQUIRED", "SUPPORT_SCOPE_MISMATCH", "SUPPORT_WORKSPACE_SCOPE_INVALID", "SUPPORT_POLICY_BLOCKED", "SUPPORT_SELF_ACTION",
  "SUPPORT_STATE_CONFLICT", "SUPPORT_NOT_FOUND_OR_FORBIDDEN", "SUPPORT_MALFORMED", "SUPPORT_INTERNAL",
] as const;
export type SupportAccessCode = (typeof SUPPORT_ACCESS_CODES)[number];

export interface SupportAccessContext {
  readonly source: "support";
  readonly supportActorAuthIdentityId: string;
  readonly supportGrantId: string;
  readonly tenantId: string;
  readonly workspaceId: string | null;
  readonly permission: SupportAccessGrantPermission;
  readonly dataClasses: readonly SupportAccessGrantDataClass[];
  readonly correlationId: string;
  readonly attemptId: string;
  readonly auditEventId: string;
  readonly startsAt: string;
  readonly expiresAt: string;
}

export interface SupportPrincipalResolver {
  /** Resolves a member-selected target for request(). */
  resolve(reference: string): Promise<unknown>;
  /** Resolves the server-authenticated platform-support principal for check/authorizeAndRun. */
  resolveCurrent(): Promise<unknown>;
}
export interface ResolvedSupportPrincipal { readonly authIdentityId: string; readonly platformRole: typeof PLATFORM_SUPPORT_ROLE; }

export interface SupportAccessEvent {
  readonly eventId: string;
  readonly operation: SupportAccessOperation;
  readonly tenantId: string | null;
  readonly workspaceId: string | null;
  readonly actorLayer: "member" | "support" | "worker";
  readonly actorId: string | null;
  readonly supportGrantId: string | null;
  readonly permission: SupportAccessGrantPermission | null;
  readonly dataClasses: readonly SupportAccessGrantDataClass[];
  readonly decisionCode: SupportAccessCode;
  readonly correlationId: string;
  readonly attemptId: string;
  readonly reasonCode: string;
  readonly inputHash: string;
}

export interface SupportAccessReservationNew { readonly kind: "new"; readonly reservationId: string; }
export interface SupportAccessReservationReplay { readonly kind: "replay"; readonly inputHash: string; readonly result: unknown; }
export interface SupportAccessReservationConflict { readonly kind: "conflict"; }
export type SupportAccessReservation = SupportAccessReservationNew | SupportAccessReservationReplay | SupportAccessReservationConflict;

export interface SupportAccessTransaction {
  reserveIdempotency(input: { tenantId: string | null; actorNamespace: string; operation: SupportAccessOperation; idempotencyKey: string; inputHash: string }): Promise<unknown>;
  commitIdempotency(input: { reservationId: string; result: SupportAccessResult }): Promise<unknown>;
  appendEvent(event: SupportAccessEvent): Promise<unknown>;
  createGrant(input: SupportAccessGrantCreation): Promise<unknown>;
  approveGrant(input: { grantId: string; approverAuthIdentityId: string; approvedAt: string }): Promise<unknown>;
  revokeGrant(input: { grantId: string; revokerAuthIdentityId: string; revokedAt: string }): Promise<unknown>;
  getGrant(input: { tenantId: string; grantId: string }): Promise<unknown>;
  /** workspaceId null means all grants for the tenant; the service applies visibility filtering. */
  listGrants(input: { tenantId: string; workspaceId: string | null; history: boolean }): Promise<unknown>;
  verifyWorkspace(input: { tenantId: string; workspaceId: string }): Promise<unknown>;
  /** The adapter must verify current membership and its conditional permission in this same transaction. */
  verifyMemberAuthority(input: {
    tenantId: string; workspaceId: string | null; membershipId: string; actorAuthIdentityId: string; role: TenantRole; roleBindingId: string;
    permission: "support:grant" | "audit:read"; action: string;
  }): Promise<unknown>;
}

export interface SupportAccessRepository { withTransaction<T>(callback: (transaction: SupportAccessTransaction) => Promise<T>): Promise<T>; }
export interface SupportAccessPolicyEvaluator {
  evaluate(input: { tenantId: string; workspaceId: string | null; membershipId: string; role: TenantRole; permission: "support:grant" | "audit:read"; action: string }): Promise<unknown>;
}
export interface SupportAccessServiceOptions {
  readonly repository: SupportAccessRepository;
  readonly principalResolver: SupportPrincipalResolver;
  readonly policyEvaluator: SupportAccessPolicyEvaluator;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
}

export interface SupportAccessResult {
  readonly ok: boolean;
  readonly code: SupportAccessCode;
  readonly grant?: SupportAccessGrant;
  readonly grants?: readonly SupportAccessGrant[];
  /** Internal only. Public check/authorizeAndRun results never expose this field. */
  readonly context?: SupportAccessContext;
}

export interface SupportAccessRequestInput { readonly tenantId: unknown; readonly workspaceId?: unknown; readonly supportPrincipalRef: unknown; readonly reasonCode: unknown; readonly reason: unknown; readonly startsAt: unknown; readonly expiresAt: unknown; readonly permissions: unknown; readonly dataClasses: unknown; readonly correlationId?: unknown; readonly idempotencyKey: unknown; }
export interface SupportAccessDecisionInput { readonly tenantId: unknown; readonly workspaceId?: unknown; readonly grantId: unknown; readonly correlationId?: unknown; readonly idempotencyKey: unknown; }
export interface SupportAccessCheckInput { readonly tenantId: unknown; readonly workspaceId?: unknown; readonly supportPrincipalRef: unknown; readonly grantId: unknown; readonly permission: unknown; readonly dataClasses: unknown; readonly correlationId: unknown; readonly idempotencyKey: unknown; }
export interface SupportAccessListInput { readonly tenantId: unknown; readonly workspaceId?: unknown; readonly correlationId?: unknown; readonly idempotencyKey: unknown; }

export interface SupportAccessGrantCreation {
  readonly id: string; readonly tenantId: string; readonly workspaceId: string | null; readonly supportActorAuthIdentityId: string; readonly platformRole: typeof PLATFORM_SUPPORT_ROLE;
  readonly requestedByAuthIdentityId: string; readonly reasonCode: string; readonly reason: string; readonly startsAt: string; readonly expiresAt: string; readonly correlationId: string;
  readonly auditEventId: string; readonly permissions: readonly SupportAccessGrantPermission[]; readonly dataClasses: readonly SupportAccessGrantDataClass[]; readonly createdAt: string; readonly updatedAt: string;
}

const supportContextStorage = new AsyncLocalStorage<SupportAccessContext>();
/** Only server infrastructure may inspect the context installed by authorizeAndRun. */
export function getSupportAccessContext(): SupportAccessContext | null { return supportContextStorage.getStore() ?? null; }

class SupportInternalError extends Error {}
type RecordEntries = Map<string, unknown>;

function recordEntries(value: unknown): RecordEntries | null {
  try {
    if (typeof value !== "object" || value === null || Object.getPrototypeOf(value) !== Object.prototype) return null;
    const keys = Reflect.ownKeys(value);
    const entries = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) return null;
      entries.set(key, descriptor.value);
    }
    return entries;
  } catch { return null; }
}

function exactEntries(value: unknown, required: readonly string[], optional: readonly string[] = []): RecordEntries | null {
  const entries = recordEntries(value);
  if (!entries) return null;
  const allowed = new Set([...required, ...optional]);
  if (entries.size < required.length || required.some((key) => !entries.has(key))) return null;
  for (const key of entries.keys()) if (!allowed.has(key)) return null;
  return entries;
}

function exactArray(value: unknown, allowEmpty = true): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.value !== value.length) return null;
    if (!Number.isSafeInteger(value.length) || (!allowEmpty && value.length === 0)) return null;
    const keys = Reflect.ownKeys(value);
    const values: unknown[] = [];
    const numericKeys = new Set<number>();
    for (const key of keys) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^(0|[1-9][0-9]*)$/.test(key)) return null;
      const index = Number(key);
      if (!Number.isSafeInteger(index) || index < 0 || index >= value.length || String(index) !== key || numericKeys.has(index)) return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || "get" in descriptor || "set" in descriptor) return null;
      numericKeys.add(index);
    }
    if (numericKeys.size !== value.length) return null;
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      values.push(descriptor.value);
    }
    return values;
  } catch { return null; }
}

function isUuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function isText(value: unknown): value is string { return typeof value === "string" && TEXT.test(value); }
function isReasonCode(value: unknown): value is string { return typeof value === "string" && REASON_CODE.test(value); }
function isHash(value: unknown): value is string { return typeof value === "string" && SHA256.test(value); }
function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  try { return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; } catch { return false; }
}
function isKnownPermission(value: unknown): value is SupportAccessGrantPermission { return typeof value === "string" && (SUPPORT_ACCESS_GRANT_PERMISSIONS as readonly string[]).includes(value); }
function isKnownDataClass(value: unknown): value is SupportAccessGrantDataClass { return typeof value === "string" && (SUPPORT_ACCESS_GRANT_DATA_CLASSES as readonly string[]).includes(value); }

function parseKnownList(value: unknown, kind: "permission" | "data", allowEmpty = false): readonly SupportAccessGrantPermission[] | readonly SupportAccessGrantDataClass[] | null {
  const values = exactArray(value, allowEmpty);
  if (!values || values.some((entry) => typeof entry !== "string")) return null;
  const known = kind === "permission" ? values.every(isKnownPermission) : values.every(isKnownDataClass);
  if (!known || new Set(values as readonly string[]).size !== values.length) return null;
  const sorted = [...values].sort() as string[];
  return Object.freeze(sorted) as readonly SupportAccessGrantPermission[] | readonly SupportAccessGrantDataClass[];
}
function parsePermissions(value: unknown): readonly SupportAccessGrantPermission[] | null { const parsed = parseKnownList(value, "permission"); return parsed as readonly SupportAccessGrantPermission[] | null; }
function parseDataClasses(value: unknown, allowEmpty = false): readonly SupportAccessGrantDataClass[] | null { const parsed = parseKnownList(value, "data", allowEmpty); return parsed as readonly SupportAccessGrantDataClass[] | null; }

const GRANT_KEYS = ["id", "tenantId", "workspaceId", "supportActorAuthIdentityId", "platformRole", "requestedByAuthIdentityId", "approvedByAuthIdentityId", "approvedAt", "revokedByAuthIdentityId", "revokedAt", "state", "reasonCode", "reason", "startsAt", "expiresAt", "correlationId", "auditEventId", "permissions", "dataClasses", "createdAt", "updatedAt"] as const;

function isValidPrincipal(value: unknown): value is ResolvedSupportPrincipal {
  const entries = exactEntries(value, ["authIdentityId", "platformRole"]);
  return !!entries && isUuid(entries.get("authIdentityId")) && entries.get("platformRole") === PLATFORM_SUPPORT_ROLE;
}

function parseGrant(value: unknown): SupportAccessGrant | null {
  const entries = exactEntries(value, GRANT_KEYS);
  if (!entries) return null;
  const permissions = parsePermissions(entries.get("permissions"));
  const dataClasses = parseDataClasses(entries.get("dataClasses"));
  if (!permissions || !dataClasses) return null;
  const safe: Record<string, unknown> = {};
  for (const key of GRANT_KEYS) safe[key] = key === "permissions" ? permissions : key === "dataClasses" ? dataClasses : entries.get(key);
  const parsed = supportAccessGrantSchema.safeParse(safe);
  return parsed.success ? Object.freeze(parsed.data) : null;
}
function parseGrantList(value: unknown): readonly SupportAccessGrant[] | null {
  const values = exactArray(value);
  if (!values) return null;
  const grants = values.map(parseGrant);
  return grants.every((grant): grant is SupportAccessGrant => grant !== null) ? Object.freeze(grants) : null;
}
function parseGrantOrThrow(value: unknown): SupportAccessGrant { const grant = parseGrant(value); if (!grant) throw new SupportInternalError("invalid grant"); return grant; }

function isValidReservation(value: unknown): value is SupportAccessReservation {
  const entries = recordEntries(value);
  if (!entries || typeof entries.get("kind") !== "string") return false;
  const kind = entries.get("kind");
  if (kind === "new") return entries.size === 2 && isText(entries.get("reservationId"));
  if (kind === "conflict") return entries.size === 1;
  return kind === "replay" && entries.size === 3 && isHash(entries.get("inputHash")) && isValidResult(entries.get("result"));
}
function isValidCommit(value: unknown): boolean { const e = exactEntries(value, ["committed"]); return !!e && e.get("committed") === true; }
function isValidEventResult(value: unknown): boolean { const e = exactEntries(value, ["recorded"]); return !!e && e.get("recorded") === true; }

function resultKeys(value: unknown): RecordEntries | null { return recordEntries(value); }
function isValidContext(value: unknown): value is SupportAccessContext {
  const e = exactEntries(value, ["source", "supportActorAuthIdentityId", "supportGrantId", "tenantId", "workspaceId", "permission", "dataClasses", "correlationId", "attemptId", "auditEventId", "startsAt", "expiresAt"]);
  return !!e && e.get("source") === "support" && isUuid(e.get("supportActorAuthIdentityId")) && isUuid(e.get("supportGrantId")) && isUuid(e.get("tenantId"))
    && (e.get("workspaceId") === null || isUuid(e.get("workspaceId"))) && isKnownPermission(e.get("permission")) && !!parseDataClasses(e.get("dataClasses"))
    && isText(e.get("correlationId")) && isUuid(e.get("attemptId")) && isUuid(e.get("auditEventId")) && isCanonicalTimestamp(e.get("startsAt")) && isCanonicalTimestamp(e.get("expiresAt"));
}
function isValidResult(value: unknown): value is SupportAccessResult {
  const e = resultKeys(value);
  if (!e || typeof e.get("ok") !== "boolean" || typeof e.get("code") !== "string" || !(SUPPORT_ACCESS_CODES as readonly string[]).includes(e.get("code") as string)) return false;
  const ok = e.get("ok") as boolean;
  const code = e.get("code") as SupportAccessCode;
  const hasGrant = e.has("grant"); const hasGrants = e.has("grants"); const hasContext = e.has("context");
  if (!ok) return e.size === 2 && !hasGrant && !hasGrants && !hasContext && !code.startsWith("OK_");
  if (code === "OK_SUPPORT_REPLAY") {
    return (e.size === 2 || e.size === 3) && !hasContext && !hasGrants && (!hasGrant || !!parseGrant(e.get("grant")));
  }
  if (code === "OK_SUPPORT_GRANT_REQUESTED" || code === "OK_SUPPORT_GRANT_APPROVED" || code === "OK_SUPPORT_GRANT_REVOKED") return e.size === 3 && hasGrant && !hasGrants && !hasContext && !!parseGrant(e.get("grant"));
  if (code === "OK_SUPPORT_AUTHORIZED") {
    if (hasGrant || (hasContext && hasGrants) || e.size !== 2 + (hasContext ? 1 : 0) + (hasGrants ? 1 : 0)) return false;
    return (!hasContext || isValidContext(e.get("context"))) && (!hasGrants || !!parseGrantList(e.get("grants")));
  }
  return false;
}

function stableHash(value: unknown): string {
  let serialized: string | undefined;
  try { serialized = JSON.stringify(value); } catch { throw new SupportInternalError("hash input"); }
  if (serialized === undefined) throw new SupportInternalError("hash input");
  const hash = createHash("sha256").update(serialized).digest("hex");
  if (!isHash(hash)) throw new SupportInternalError("hash output");
  return hash;
}
function operationNow(options: SupportAccessServiceOptions): string {
  let value: Date;
  try { value = options.now ? options.now() : new Date(); } catch { throw new SupportInternalError("clock"); }
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new SupportInternalError("clock");
  const result = value.toISOString();
  if (!isCanonicalTimestamp(result)) throw new SupportInternalError("clock");
  return result;
}
function makeId(options: SupportAccessServiceOptions): string {
  let value: unknown;
  try { value = options.idFactory ? options.idFactory() : randomUUID(); } catch { throw new SupportInternalError("id"); }
  if (!isUuid(value)) throw new SupportInternalError("id");
  return value;
}
function denial(code: SupportAccessCode): SupportAccessResult { return Object.freeze({ ok: false, code }); }
function success(code: SupportAccessCode, fields: Omit<SupportAccessResult, "ok" | "code"> = {}): SupportAccessResult { return Object.freeze({ ok: true, code, ...fields }); }
function currentMember(): TenantContext | null {
  const member = getTenantContext();
  return member && !getWorkerTenantContext() && !getSupportAccessContext() ? member : null;
}
function exactInput(value: unknown, required: readonly string[], optional: readonly string[] = []): RecordEntries | null {
  const entries = exactEntries(value, required, optional);
  return entries;
}
function safeOwnData(value: unknown, key: string): unknown {
  try {
    if (typeof value !== "object" || value === null) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && descriptor.enumerable && "value" in descriptor && !("get" in descriptor) && !("set" in descriptor) ? descriptor.value : undefined;
  } catch { return undefined; }
}
function memberCorrelation(entries: RecordEntries, context: TenantContext): string | null {
  if (!entries.has("correlationId")) return context.correlationId;
  const value = entries.get("correlationId");
  return isText(value) && value === context.correlationId ? context.correlationId : null;
}
function normalizeMemberWorkspace(entries: RecordEntries, context: TenantContext): string | null | undefined {
  const supplied = entries.has("workspaceId") ? entries.get("workspaceId") : context.workspaceId;
  if (context.workspaceId !== null) return supplied === context.workspaceId ? context.workspaceId : undefined;
  if (supplied === null || supplied === undefined) return null;
  return isUuid(supplied) ? supplied : undefined;
}
function validWorkspaceResult(value: unknown, tenantId: string, workspaceId: string): boolean {
  const e = exactEntries(value, ["tenantId", "workspaceId", "exists"]);
  return !!e && e.get("tenantId") === tenantId && e.get("workspaceId") === workspaceId && e.get("exists") === true;
}
function validMemberVerification(value: unknown, input: { tenantId: string; workspaceId: string | null; membershipId: string; actorAuthIdentityId: string; role: TenantRole; roleBindingId: string; permission: "support:grant" | "audit:read"; action: string }): boolean {
  const e = exactEntries(value, ["allowed", "tenantId", "workspaceId", "membershipId", "actorAuthIdentityId", "role", "roleBindingId", "permission", "action"]);
  return !!e && e.get("allowed") === true && e.get("tenantId") === input.tenantId && e.get("workspaceId") === input.workspaceId && e.get("membershipId") === input.membershipId
    && e.get("actorAuthIdentityId") === input.actorAuthIdentityId && e.get("role") === input.role && e.get("roleBindingId") === input.roleBindingId && e.get("permission") === input.permission && e.get("action") === input.action;
}
function validPolicyResult(value: unknown, input: { tenantId: string; workspaceId: string | null; membershipId: string; role: TenantRole; permission: "support:grant" | "audit:read"; action: string }): boolean {
  const e = exactEntries(value, ["allowed", "tenantId", "workspaceId", "membershipId", "role", "permission", "action"]);
  return !!e && e.get("allowed") === true && e.get("tenantId") === input.tenantId && e.get("workspaceId") === input.workspaceId && e.get("membershipId") === input.membershipId && e.get("role") === input.role && e.get("permission") === input.permission && e.get("action") === input.action;
}

function equalGrant(left: SupportAccessGrant, right: SupportAccessGrant): boolean {
  for (const key of GRANT_KEYS) {
    const a = left[key]; const b = right[key];
    if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length || a.some((value, index) => value !== b[index])) return false; }
    else if (a !== b) return false;
  }
  return true;
}
function pendingGrant(creation: SupportAccessGrantCreation): SupportAccessGrant {
  return Object.freeze({ ...creation, state: "pending" as const, approvedByAuthIdentityId: null, approvedAt: null, revokedByAuthIdentityId: null, revokedAt: null });
}
function eventFactsFromGrant(grant: SupportAccessGrant, fallback: EventFacts): EventFacts {
  return { ...fallback, tenantId: grant.tenantId, workspaceId: grant.workspaceId, supportGrantId: grant.id, dataClasses: grant.dataClasses };
}

interface EventFacts {
  readonly tenantId: string | null; readonly workspaceId: string | null; readonly actorLayer: "member" | "support" | "worker"; readonly actorId: string | null; readonly supportGrantId: string | null;
  readonly permission: SupportAccessGrantPermission | null; readonly dataClasses: readonly SupportAccessGrantDataClass[]; readonly correlationId: string; readonly reasonCode: string;
}
function mixedActor(member: TenantContext | null, worker: ReturnType<typeof getWorkerTenantContext>, support: SupportAccessContext | null): Pick<EventFacts, "actorLayer" | "actorId"> {
  if (worker) return { actorLayer: "worker", actorId: null };
  if (member) return { actorLayer: "member", actorId: member.actorAuthIdentityId };
  if (support) return { actorLayer: "support", actorId: support.supportActorAuthIdentityId };
  return { actorLayer: "support", actorId: null };
}
interface AtomicOutcome { readonly result: SupportAccessResult; readonly context?: SupportAccessContext; readonly replay: boolean; }
interface CallbackOutcome { readonly result: SupportAccessResult; readonly context?: SupportAccessContext; readonly facts?: Partial<EventFacts>; }

function makeEvent(facts: EventFacts, operation: SupportAccessOperation, attemptId: string, auditEventId: string, inputHash: string, code: SupportAccessCode): SupportAccessEvent {
  return Object.freeze({ ...facts, operation, attemptId, eventId: auditEventId, inputHash, decisionCode: code });
}

export function createSupportAccessService(options: SupportAccessServiceOptions) {
  try {
    if (!options || typeof options !== "object" || !options.repository || typeof options.repository.withTransaction !== "function" || !options.principalResolver || typeof options.principalResolver.resolve !== "function" || typeof options.principalResolver.resolveCurrent !== "function" || !options.policyEvaluator || typeof options.policyEvaluator.evaluate !== "function") throw new Error("dependencies");
  } catch { throw new Error("support access dependencies are required"); }

  function assertTransaction(tx: SupportAccessTransaction): void {
    const methods: readonly (keyof SupportAccessTransaction)[] = ["reserveIdempotency", "commitIdempotency", "appendEvent", "createGrant", "approveGrant", "revokeGrant", "getGrant", "listGrants", "verifyWorkspace", "verifyMemberAuthority"];
    try { if (!tx || methods.some((method) => typeof tx[method] !== "function")) throw new SupportInternalError("transaction contract"); } catch { throw new SupportInternalError("transaction contract"); }
  }
  async function verifyMember(tx: SupportAccessTransaction, context: TenantContext, permission: "support:grant" | "audit:read", action: string): Promise<boolean> {
    if (!isTenantRole(context.role) || !["owner", "admin"].includes(context.role) || getTenantPermissionDecision(context.role, permission).decision !== "C") return false;
    const input = { tenantId: context.tenantId, workspaceId: context.workspaceId, membershipId: context.membershipId, actorAuthIdentityId: context.actorAuthIdentityId, role: context.role, roleBindingId: context.roleBindingId, permission, action } as const;
    let memberResult: unknown; let policyResult: unknown;
    try {
      memberResult = await tx.verifyMemberAuthority(input);
      policyResult = await options.policyEvaluator.evaluate({ tenantId: input.tenantId, workspaceId: input.workspaceId, membershipId: input.membershipId, role: input.role, permission: input.permission, action: input.action });
    } catch { throw new SupportInternalError("authority dependency"); }
    if (!recordEntries(memberResult) || !recordEntries(policyResult)) throw new SupportInternalError("authority result");
    return validMemberVerification(memberResult, input) && validPolicyResult(policyResult, input);
  }
  async function atomic(args: {
    operation: SupportAccessOperation; tenantId: string | null; actorNamespace: string; idempotencyKey: string; inputHash: string; facts: EventFacts; attemptId: string; auditEventId: string;
    callback: (tx: SupportAccessTransaction, reservationId: string) => Promise<CallbackOutcome>; replay?: (tx: SupportAccessTransaction, prior: SupportAccessResult) => Promise<CallbackOutcome>; volatile?: boolean; freshVolatileReplay?: boolean;
  }): Promise<AtomicOutcome> {
    try {
      if (!isHash(args.inputHash) || !isText(args.idempotencyKey) || !isUuid(args.attemptId) || !isUuid(args.auditEventId)) throw new SupportInternalError("atomic input");
      return await options.repository.withTransaction(async (tx) => {
        assertTransaction(tx);
        const reservationRaw = await tx.reserveIdempotency({ tenantId: args.tenantId, actorNamespace: args.actorNamespace, operation: args.operation, idempotencyKey: args.idempotencyKey, inputHash: args.inputHash });
        if (!isValidReservation(reservationRaw)) throw new SupportInternalError("reservation");
        const reservation = reservationRaw;
        if (reservation.kind === "conflict") {
          const result = denial("SUPPORT_STATE_CONFLICT");
          if (!isValidEventResult(await tx.appendEvent(makeEvent(args.facts, args.operation, args.attemptId, args.auditEventId, args.inputHash, result.code)))) throw new SupportInternalError("event");
          return { result, replay: false };
        }
        if (reservation.kind === "replay") {
          if (reservation.inputHash !== args.inputHash || !isHash(reservation.inputHash) || !isValidResult(reservation.result)) throw new SupportInternalError("replay");
          const prior = reservation.result;
          let replayed: CallbackOutcome = { result: prior };
          if (args.replay) replayed = await args.replay(tx, prior);
          if (!isValidResult(replayed.result)) throw new SupportInternalError("replay result");
          const result = replayed.result.ok ? denial("SUPPORT_INTERNAL") : replayed.result;
          const publicResult = replayed.result.ok
            ? args.volatile
              ? args.freshVolatileReplay ? replayed.result : success("OK_SUPPORT_REPLAY")
              : replayed.result.grant
                ? success("OK_SUPPORT_REPLAY", { grant: replayed.result.grant })
                : success("OK_SUPPORT_REPLAY")
            : result;
          const facts = replayed.facts ? { ...args.facts, ...replayed.facts } as EventFacts : prior.grant ? eventFactsFromGrant(prior.grant, args.facts) : args.facts;
          const eventCode = publicResult.code;
          if (!isValidEventResult(await tx.appendEvent(makeEvent(facts, args.operation, args.attemptId, args.auditEventId, args.inputHash, eventCode)))) throw new SupportInternalError("event");
          return { result: publicResult, replay: true };
        }
        const outcome = await args.callback(tx, reservation.reservationId);
        if (!isValidResult(outcome.result) || outcome.result.code === "SUPPORT_INTERNAL") throw new SupportInternalError("service result");
        const facts = outcome.facts ? { ...args.facts, ...outcome.facts } as EventFacts : outcome.result.grant ? eventFactsFromGrant(outcome.result.grant, args.facts) : args.facts;
        if (!isValidEventResult(await tx.appendEvent(makeEvent(facts, args.operation, args.attemptId, args.auditEventId, args.inputHash, outcome.result.code)))) throw new SupportInternalError("event");
        if (!isValidCommit(await tx.commitIdempotency({ reservationId: reservation.reservationId, result: outcome.result }))) throw new SupportInternalError("idempotency");
        return { result: outcome.result, context: outcome.context, replay: false };
      });
    } catch { return { result: denial("SUPPORT_INTERNAL"), replay: false }; }
  }

  async function resolvePrincipal(reference: unknown): Promise<ResolvedSupportPrincipal | null> {
    if (typeof reference !== "string" || reference.length === 0 || reference.length > 256) return null;
    try { const value = await options.principalResolver.resolve(reference); return isValidPrincipal(value) ? value : null; } catch { return null; }
  }
  async function resolveCurrentPrincipal(): Promise<ResolvedSupportPrincipal | null> {
    try { const value = await options.principalResolver.resolveCurrent(); return isValidPrincipal(value) ? value : null; } catch { return null; }
  }
  function normalizedFacts(base: EventFacts): EventFacts { return { ...base, dataClasses: Object.freeze([...base.dataClasses]) }; }
  async function auditDenied(input: { operation: SupportAccessOperation; tenantId: string; workspaceId: string | null; actorLayer: "member" | "support" | "worker"; actorId: string | null; supportGrantId: string | null; permission: SupportAccessGrantPermission | null; dataClasses: readonly SupportAccessGrantDataClass[]; correlationId: string; idempotencyKey: string; code: SupportAccessCode; reasonCode: string; inputHashPayload: unknown }): Promise<SupportAccessResult> {
    try {
      const result = await atomic({ operation: input.operation, tenantId: input.tenantId, actorNamespace: input.actorId ?? "platform-safe-null", idempotencyKey: input.idempotencyKey, inputHash: stableHash(input.inputHashPayload), facts: normalizedFacts({ tenantId: input.tenantId, workspaceId: input.workspaceId, actorLayer: input.actorLayer, actorId: input.actorId, supportGrantId: input.supportGrantId, permission: input.permission, dataClasses: input.dataClasses, correlationId: input.correlationId, reasonCode: input.reasonCode }), attemptId: makeId(options), auditEventId: makeId(options), callback: async () => ({ result: denial(input.code) }) });
      return result.result;
    } catch { return denial("SUPPORT_INTERNAL"); }
  }

  async function request(input: SupportAccessRequestInput): Promise<SupportAccessResult> {
    const context = currentMember();
    const parsed = exactInput(input, ["tenantId", "supportPrincipalRef", "reasonCode", "reason", "startsAt", "expiresAt", "permissions", "dataClasses", "idempotencyKey"], ["workspaceId", "correlationId"]);
    if (!context) {
      const member = getTenantContext(); const worker = getWorkerTenantContext(); const support = getSupportAccessContext();
      const tenantId = member?.tenantId ?? support?.tenantId ?? worker?.tenantId; const key = safeOwnData(input, "idempotencyKey"); const correlationId = safeOwnData(input, "correlationId") ?? member?.correlationId ?? support?.correlationId ?? worker?.correlationId;
      const actor = mixedActor(member, worker, support);
      if ((member || worker || support) && tenantId && isText(key) && isText(correlationId)) return auditDenied({ operation: "request", tenantId, workspaceId: member?.workspaceId ?? support?.workspaceId ?? worker?.workspaceId ?? null, actorLayer: actor.actorLayer, actorId: actor.actorId, supportGrantId: null, permission: "support:grant", dataClasses: [], correlationId, idempotencyKey: key, code: "SUPPORT_SCOPE_MISMATCH", reasonCode: "support.grant.request.mixed-context", inputHashPayload: { operation: "request", tenantId, key, invalid: "mixed-context" } });
      return denial("SUPPORT_MALFORMED");
    }
    const safeTenantId = safeOwnData(input, "tenantId");
    const safeKey = safeOwnData(input, "idempotencyKey");
    if (!parsed) {
      if (safeTenantId === context.tenantId && isText(safeKey)) return auditDenied({ operation: "request", tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "support:grant", dataClasses: [], correlationId: context.correlationId, idempotencyKey: safeKey, code: "SUPPORT_MALFORMED", reasonCode: "support.grant.request", inputHashPayload: { operation: "request", tenantId: context.tenantId, key: safeKey, invalid: "shape" } });
      return denial("SUPPORT_MALFORMED");
    }
    if (!isUuid(parsed.get("tenantId")) || parsed.get("tenantId") !== context.tenantId || !isReasonCode(parsed.get("reasonCode")) || typeof parsed.get("reason") !== "string" || (parsed.get("reason") as string).trim().length === 0 || (parsed.get("reason") as string).length > 500 || !isCanonicalTimestamp(parsed.get("startsAt")) || !isCanonicalTimestamp(parsed.get("expiresAt")) || (parsed.get("startsAt") as string) >= (parsed.get("expiresAt") as string) || !isText(parsed.get("idempotencyKey"))) {
      if (isText(parsed.get("idempotencyKey"))) return auditDenied({ operation: "request", tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "support:grant", dataClasses: [], correlationId: context.correlationId, idempotencyKey: parsed.get("idempotencyKey") as string, code: "SUPPORT_MALFORMED", reasonCode: "support.grant.request", inputHashPayload: { operation: "request", tenantId: context.tenantId, key: parsed.get("idempotencyKey"), invalid: "field" } });
      return denial("SUPPORT_MALFORMED");
    }
    const correlationId = memberCorrelation(parsed, context);
    const workspaceId = normalizeMemberWorkspace(parsed, context);
    const permissions = parsePermissions(parsed.get("permissions"));
    const dataClasses = parseDataClasses(parsed.get("dataClasses"));
    const key = parsed.get("idempotencyKey") as string;
    if (!correlationId) return auditDenied({ operation: "request", tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "support:grant", dataClasses: [], correlationId: context.correlationId, idempotencyKey: key, code: "SUPPORT_MALFORMED", reasonCode: "support.grant.request", inputHashPayload: { operation: "request", tenantId: context.tenantId, key, reason: "correlation-mismatch" } });
    if (workspaceId === undefined) return auditDenied({ operation: "request", tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "support:grant", dataClasses: [], correlationId, idempotencyKey: key, code: "SUPPORT_WORKSPACE_SCOPE_INVALID", reasonCode: "support.grant.request", inputHashPayload: { operation: "request", tenantId: context.tenantId, key, workspace: "scope-mismatch" } });
    if (!permissions || !dataClasses) return auditDenied({ operation: "request", tenantId: context.tenantId, workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "support:grant", dataClasses: [], correlationId, idempotencyKey: key, code: "SUPPORT_MALFORMED", reasonCode: "support.grant.request", inputHashPayload: { operation: "request", tenantId: context.tenantId, key, invalid: "grant-lists" } });
    const principal = await resolvePrincipal(parsed.get("supportPrincipalRef"));
    if (!principal) return auditDenied({ operation: "request", tenantId: context.tenantId, workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "support:grant", dataClasses, correlationId, idempotencyKey: key, code: "SUPPORT_GRANT_REQUIRED", reasonCode: "support.grant.request", inputHashPayload: { operation: "request", tenantId: context.tenantId, key, invalid: "principal" } });
    if (principal.authIdentityId === context.actorAuthIdentityId) return auditDenied({ operation: "request", tenantId: context.tenantId, workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "support:grant", dataClasses, correlationId, idempotencyKey: key, code: "SUPPORT_SELF_ACTION", reasonCode: "support.grant.request", inputHashPayload: { operation: "request", tenantId: context.tenantId, key, principal: principal.authIdentityId } });
    let createdAt: string; let id: string; let auditEventId: string;
    try { createdAt = operationNow(options); id = makeId(options); auditEventId = makeId(options); } catch { return denial("SUPPORT_INTERNAL"); }
    const creation: SupportAccessGrantCreation = { id, tenantId: context.tenantId, workspaceId, supportActorAuthIdentityId: principal.authIdentityId, platformRole: PLATFORM_SUPPORT_ROLE, requestedByAuthIdentityId: context.actorAuthIdentityId, reasonCode: parsed.get("reasonCode") as string, reason: parsed.get("reason") as string, startsAt: parsed.get("startsAt") as string, expiresAt: parsed.get("expiresAt") as string, correlationId, auditEventId, permissions, dataClasses, createdAt, updatedAt: createdAt };
    let hash: string; let attemptId: string;
    try { hash = stableHash({ tenantId: creation.tenantId, workspaceId: creation.workspaceId, supportActorAuthIdentityId: creation.supportActorAuthIdentityId, requestedByAuthIdentityId: creation.requestedByAuthIdentityId, reasonCode: creation.reasonCode, reason: creation.reason, startsAt: creation.startsAt, expiresAt: creation.expiresAt, permissions: creation.permissions, dataClasses: creation.dataClasses, correlationId: creation.correlationId }); attemptId = makeId(options); } catch { return denial("SUPPORT_INTERNAL"); }
    const result = await atomic({ operation: "request", tenantId: context.tenantId, actorNamespace: context.actorAuthIdentityId, idempotencyKey: key, inputHash: hash, facts: normalizedFacts({ tenantId: context.tenantId, workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: id, permission: "support:grant", dataClasses, correlationId, reasonCode: "support.grant.request" }), attemptId, auditEventId, callback: async (tx) => {
      const authority = await verifyMember(tx, context, "support:grant", "support.grant.request");
      if (!authority) return { result: denial("SUPPORT_POLICY_BLOCKED") };
      if (workspaceId !== null && !validWorkspaceResult(await tx.verifyWorkspace({ tenantId: context.tenantId, workspaceId }), context.tenantId, workspaceId)) return { result: denial("SUPPORT_WORKSPACE_SCOPE_INVALID") };
      const returned = parseGrantOrThrow(await tx.createGrant(creation));
      const expected = pendingGrant(creation);
      if (!equalGrant(returned, expected)) throw new SupportInternalError("create postcondition");
      return { result: success("OK_SUPPORT_GRANT_REQUESTED", { grant: returned }), facts: { supportGrantId: returned.id, workspaceId: returned.workspaceId, dataClasses: returned.dataClasses, correlationId: returned.correlationId } };
    }, replay: async (tx, prior) => {
      const allowed = await verifyMember(tx, context, "support:grant", "support.grant.request");
      if (!allowed) return { result: denial("SUPPORT_POLICY_BLOCKED") };
      const facts = prior.grant ? eventFactsFromGrant(prior.grant, { tenantId: prior.grant.tenantId, workspaceId: prior.grant.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: prior.grant.id, permission: "support:grant", dataClasses: prior.grant.dataClasses, correlationId: context.correlationId, reasonCode: "support.grant.request" }) : undefined;
      if (workspaceId !== null && !validWorkspaceResult(await tx.verifyWorkspace({ tenantId: context.tenantId, workspaceId }), context.tenantId, workspaceId)) return { result: denial("SUPPORT_WORKSPACE_SCOPE_INVALID"), facts };
      return { result: prior, facts };
    } });
    return result.result;
  }

  async function mutateDecision(operation: "approve" | "revoke", input: SupportAccessDecisionInput): Promise<SupportAccessResult> {
    const context = currentMember();
    const parsed = exactInput(input, ["tenantId", "grantId", "idempotencyKey"], ["workspaceId", "correlationId"]);
    if (!context) {
      const member = getTenantContext(); const worker = getWorkerTenantContext(); const support = getSupportAccessContext();
      const tenantId = member?.tenantId ?? support?.tenantId ?? worker?.tenantId; const key = safeOwnData(input, "idempotencyKey"); const correlationId = safeOwnData(input, "correlationId") ?? member?.correlationId ?? support?.correlationId ?? worker?.correlationId;
      const actor = mixedActor(member, worker, support);
      if ((member || worker || support) && tenantId && isText(key) && isText(correlationId)) return auditDenied({ operation, tenantId, workspaceId: member?.workspaceId ?? support?.workspaceId ?? worker?.workspaceId ?? null, actorLayer: actor.actorLayer, actorId: actor.actorId, supportGrantId: isUuid(safeOwnData(input, "grantId")) ? safeOwnData(input, "grantId") as string : null, permission: "support:grant", dataClasses: [], correlationId, idempotencyKey: key, code: "SUPPORT_SCOPE_MISMATCH", reasonCode: `support.grant.${operation}.mixed-context`, inputHashPayload: { operation, tenantId, key, invalid: "mixed-context" } });
      return denial("SUPPORT_MALFORMED");
    }
    const safeKey = safeOwnData(input, "idempotencyKey");
    if (!parsed) {
      if (isText(safeKey)) return auditDenied({ operation, tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "support:grant", dataClasses: [], correlationId: context.correlationId, idempotencyKey: safeKey, code: "SUPPORT_MALFORMED", reasonCode: `support.grant.${operation}`, inputHashPayload: { operation, tenantId: context.tenantId, key: safeKey, invalid: "shape" } });
      return denial("SUPPORT_MALFORMED");
    }
    if (!isUuid(parsed.get("tenantId")) || parsed.get("tenantId") !== context.tenantId || !isUuid(parsed.get("grantId")) || !isText(parsed.get("idempotencyKey"))) {
      if (isText(parsed.get("idempotencyKey"))) return auditDenied({ operation, tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "support:grant", dataClasses: [], correlationId: context.correlationId, idempotencyKey: parsed.get("idempotencyKey") as string, code: "SUPPORT_MALFORMED", reasonCode: `support.grant.${operation}`, inputHashPayload: { operation, tenantId: context.tenantId, key: parsed.get("idempotencyKey"), invalid: "field" } });
      return denial("SUPPORT_MALFORMED");
    }
    const correlationId = memberCorrelation(parsed, context); const workspaceId = normalizeMemberWorkspace(parsed, context); const key = parsed.get("idempotencyKey") as string; const grantId = parsed.get("grantId") as string;
    if (!correlationId) return auditDenied({ operation, tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: grantId, permission: "support:grant", dataClasses: [], correlationId: context.correlationId, idempotencyKey: key, code: "SUPPORT_MALFORMED", reasonCode: `support.grant.${operation}`, inputHashPayload: { operation, tenantId: context.tenantId, grantId, key, invalid: "correlation" } });
    if (workspaceId === undefined) return auditDenied({ operation, tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: grantId, permission: "support:grant", dataClasses: [], correlationId, idempotencyKey: key, code: "SUPPORT_WORKSPACE_SCOPE_INVALID", reasonCode: `support.grant.${operation}`, inputHashPayload: { operation, tenantId: context.tenantId, grantId, key, invalid: "workspace" } });
    let hash: string; let attemptId: string; let auditEventId: string;
    try { hash = stableHash({ operation, tenantId: context.tenantId, grantId, workspaceId, actorAuthIdentityId: context.actorAuthIdentityId, correlationId }); attemptId = makeId(options); auditEventId = makeId(options); } catch { return denial("SUPPORT_INTERNAL"); }
    const result = await atomic({ operation, tenantId: context.tenantId, actorNamespace: context.actorAuthIdentityId, idempotencyKey: key, inputHash: hash, facts: normalizedFacts({ tenantId: context.tenantId, workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: grantId, permission: "support:grant", dataClasses: [], correlationId, reasonCode: `support.grant.${operation}` }), attemptId, auditEventId, callback: async (tx) => {
      if (!(await verifyMember(tx, context, "support:grant", `support.grant.${operation}`))) return { result: denial("SUPPORT_POLICY_BLOCKED") };
      const raw = await tx.getGrant({ tenantId: context.tenantId, grantId });
      if (raw === null || raw === undefined) return { result: denial("SUPPORT_NOT_FOUND_OR_FORBIDDEN") };
      const before = parseGrantOrThrow(raw);
      const facts = before.tenantId === context.tenantId
        ? { tenantId: before.tenantId, workspaceId: before.workspaceId, supportGrantId: before.id, dataClasses: before.dataClasses, correlationId }
        : { tenantId: context.tenantId, workspaceId, supportGrantId: grantId, dataClasses: [], correlationId };
      if (before.id !== grantId) throw new SupportInternalError("get postcondition");
      if (before.tenantId !== context.tenantId) return { result: denial("SUPPORT_SCOPE_MISMATCH"), facts };
      if (before.workspaceId !== workspaceId) return { result: denial("SUPPORT_SCOPE_MISMATCH"), facts };
      if (before.supportActorAuthIdentityId === context.actorAuthIdentityId) return { result: denial("SUPPORT_SELF_ACTION"), facts };
      const at = operationNow(options);
      if (operation === "approve") {
        if (before.state !== "pending") return { result: denial("SUPPORT_STATE_CONFLICT"), facts };
        const returned = parseGrantOrThrow(await tx.approveGrant({ grantId, approverAuthIdentityId: context.actorAuthIdentityId, approvedAt: at }));
        const expected: SupportAccessGrant = { ...before, state: "approved", approvedByAuthIdentityId: context.actorAuthIdentityId, approvedAt: at, updatedAt: at };
        if (!equalGrant(returned, expected)) throw new SupportInternalError("approve postcondition");
        return { result: success("OK_SUPPORT_GRANT_APPROVED", { grant: returned }), facts: eventFactsFromGrant(returned, { ...facts, actorId: context.actorAuthIdentityId, actorLayer: "member", permission: "support:grant", reasonCode: "support.grant.approve" }) };
      }
      if (before.state !== "approved") return { result: denial("SUPPORT_STATE_CONFLICT"), facts };
      const returned = parseGrantOrThrow(await tx.revokeGrant({ grantId, revokerAuthIdentityId: context.actorAuthIdentityId, revokedAt: at }));
      const expected: SupportAccessGrant = { ...before, state: "revoked", revokedByAuthIdentityId: context.actorAuthIdentityId, revokedAt: at, updatedAt: at };
      if (!equalGrant(returned, expected)) throw new SupportInternalError("revoke postcondition");
      return { result: success("OK_SUPPORT_GRANT_REVOKED", { grant: returned }), facts: eventFactsFromGrant(returned, { ...facts, actorId: context.actorAuthIdentityId, actorLayer: "member", permission: "support:grant", reasonCode: "support.grant.revoke" }) };
    }, replay: async (tx, prior) => {
      const allowed = await verifyMember(tx, context, "support:grant", `support.grant.${operation}`);
      return allowed ? { result: prior, facts: prior.grant ? eventFactsFromGrant(prior.grant, { tenantId: prior.grant.tenantId, workspaceId: prior.grant.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: prior.grant.id, permission: "support:grant", dataClasses: prior.grant.dataClasses, correlationId, reasonCode: `support.grant.${operation}` }) : undefined } : { result: denial("SUPPORT_POLICY_BLOCKED") };
    } });
    return result.result;
  }

  async function supportAuthorization(input: SupportAccessCheckInput, callbackMode: boolean): Promise<AtomicOutcome> {
    const operation: SupportAccessOperation = callbackMode ? "authorize_and_run" : "check";
    const mixedMember = getTenantContext();
    const mixedWorker = getWorkerTenantContext();
    const mixedSupport = getSupportAccessContext();
    if (mixedMember || mixedWorker) {
      const tenantId = mixedMember?.tenantId ?? mixedWorker?.tenantId ?? safeOwnData(input, "tenantId");
      const key = safeOwnData(input, "idempotencyKey");
      const correlationId = safeOwnData(input, "correlationId") ?? mixedMember?.correlationId ?? mixedWorker?.correlationId;
      const actor = mixedActor(mixedMember, mixedWorker, mixedSupport);
      if (isUuid(tenantId) && isText(key) && isText(correlationId)) return { result: await auditDenied({ operation, tenantId, workspaceId: mixedMember?.workspaceId ?? mixedWorker?.workspaceId ?? mixedSupport?.workspaceId ?? null, actorLayer: actor.actorLayer, actorId: actor.actorId, supportGrantId: isUuid(safeOwnData(input, "grantId")) ? safeOwnData(input, "grantId") as string : null, permission: isKnownPermission(safeOwnData(input, "permission")) ? safeOwnData(input, "permission") as SupportAccessGrantPermission : null, dataClasses: [], correlationId, idempotencyKey: key, code: "SUPPORT_SCOPE_MISMATCH", reasonCode: "support.mixed_context", inputHashPayload: { operation, tenantId, key, invalid: "mixed-context" } }), replay: false };
      return { result: denial("SUPPORT_SCOPE_MISMATCH"), replay: false };
    }
    const parsed = exactInput(input, ["tenantId", "supportPrincipalRef", "grantId", "permission", "dataClasses", "correlationId", "idempotencyKey"], ["workspaceId"]);
    const safeTenantId = safeOwnData(input, "tenantId"); const safeGrantId = safeOwnData(input, "grantId"); const safeKey = safeOwnData(input, "idempotencyKey"); const safeCorrelation = safeOwnData(input, "correlationId");
    if (!parsed) {
      if (isUuid(safeTenantId) && isText(safeKey) && isText(safeCorrelation)) return { result: await auditDenied({ operation, tenantId: safeTenantId, workspaceId: null, actorLayer: "support", actorId: null, supportGrantId: isUuid(safeGrantId) ? safeGrantId : null, permission: null, dataClasses: [], correlationId: safeCorrelation, idempotencyKey: safeKey, code: "SUPPORT_MALFORMED", reasonCode: callbackMode ? "support.authorize_and_run" : "support.check", inputHashPayload: { operation, tenantId: safeTenantId, grantId: safeGrantId, key: safeKey, invalid: "shape" } }), replay: false };
      return { result: denial("SUPPORT_MALFORMED"), replay: false };
    }
    if (!isUuid(parsed.get("tenantId")) || !isUuid(parsed.get("grantId")) || !isText(parsed.get("correlationId")) || !isText(parsed.get("idempotencyKey")) || !isKnownPermission(parsed.get("permission"))) {
      if (isUuid(parsed.get("tenantId")) && isText(parsed.get("idempotencyKey")) && isText(parsed.get("correlationId"))) return { result: await auditDenied({ operation, tenantId: parsed.get("tenantId") as string, workspaceId: null, actorLayer: "support", actorId: null, supportGrantId: isUuid(parsed.get("grantId")) ? parsed.get("grantId") as string : null, permission: isKnownPermission(parsed.get("permission")) ? parsed.get("permission") as SupportAccessGrantPermission : null, dataClasses: [], correlationId: parsed.get("correlationId") as string, idempotencyKey: parsed.get("idempotencyKey") as string, code: "SUPPORT_MALFORMED", reasonCode: callbackMode ? "support.authorize_and_run" : "support.check", inputHashPayload: { operation, tenantId: parsed.get("tenantId"), grantId: parsed.get("grantId"), key: parsed.get("idempotencyKey"), invalid: "field" } }), replay: false };
      return { result: denial("SUPPORT_MALFORMED"), replay: false };
    }
    const dataClasses = parseDataClasses(parsed.get("dataClasses"));
    const tenantId = parsed.get("tenantId") as string; const grantId = parsed.get("grantId") as string; const permission = parsed.get("permission") as SupportAccessGrantPermission; const correlationId = parsed.get("correlationId") as string; const key = parsed.get("idempotencyKey") as string;
    if (!dataClasses) return { result: await auditDenied({ operation, tenantId, workspaceId: null, actorLayer: "support", actorId: null, supportGrantId: grantId, permission, dataClasses: [], correlationId, idempotencyKey: key, code: "SUPPORT_MALFORMED", reasonCode: callbackMode ? "support.authorize_and_run" : "support.check", inputHashPayload: { operation, tenantId, grantId, key, invalid: "data-classes" } }), replay: false };
    const workspaceId = parsed.has("workspaceId") ? parsed.get("workspaceId") : null;
    if (workspaceId !== null && !isUuid(workspaceId)) return { result: await auditDenied({ operation, tenantId, workspaceId: null, actorLayer: "support", actorId: null, supportGrantId: grantId, permission, dataClasses, correlationId, idempotencyKey: key, code: "SUPPORT_WORKSPACE_SCOPE_INVALID", reasonCode: callbackMode ? "support.authorize_and_run" : "support.check", inputHashPayload: { operation, tenantId, grantId, key, invalid: "workspace" } }), replay: false };
    const actingPrincipal = await resolveCurrentPrincipal();
    if (!actingPrincipal) return auditDenied({ operation: callbackMode ? "authorize_and_run" : "check", tenantId, workspaceId: typeof workspaceId === "string" ? workspaceId : null, actorLayer: "support", actorId: null, supportGrantId: grantId, permission, dataClasses, correlationId, idempotencyKey: key, code: "SUPPORT_GRANT_REQUIRED", reasonCode: callbackMode ? "support.authorize_and_run" : "support.check", inputHashPayload: { tenantId, grantId, key, invalid: "current-principal" } }).then((result) => ({ result, replay: false }));
    const selectedPrincipal = await resolvePrincipal(parsed.get("supportPrincipalRef"));
    if (!selectedPrincipal || selectedPrincipal.authIdentityId !== actingPrincipal.authIdentityId) return auditDenied({ operation: callbackMode ? "authorize_and_run" : "check", tenantId, workspaceId: typeof workspaceId === "string" ? workspaceId : null, actorLayer: "support", actorId: actingPrincipal.authIdentityId, supportGrantId: grantId, permission, dataClasses, correlationId, idempotencyKey: key, code: "SUPPORT_GRANT_REQUIRED", reasonCode: callbackMode ? "support.authorize_and_run" : "support.check", inputHashPayload: { tenantId, grantId, key, invalid: "principal-assertion" } }).then((result) => ({ result, replay: false }));
    const principal = actingPrincipal;
    const active = getSupportAccessContext();
    if (active && (active.tenantId !== tenantId || active.supportActorAuthIdentityId !== principal.authIdentityId || active.supportGrantId !== grantId || active.workspaceId !== workspaceId || active.permission !== permission || active.dataClasses.length !== dataClasses.length || active.dataClasses.some((value, index) => value !== dataClasses[index]))) {
      return { result: await auditDenied({ operation, tenantId, workspaceId: typeof workspaceId === "string" ? workspaceId : null, actorLayer: "support", actorId: principal.authIdentityId, supportGrantId: grantId, permission, dataClasses, correlationId, idempotencyKey: key, code: "SUPPORT_SCOPE_MISMATCH", reasonCode: callbackMode ? "support.authorize_and_run" : "support.check", inputHashPayload: { operation, tenantId, grantId, key, invalid: "nested-scope" } }), replay: false };
    }
    let hash: string;
    try { hash = stableHash({ tenantId, workspaceId, supportActorAuthIdentityId: principal.authIdentityId, grantId, permission, dataClasses, correlationId }); } catch { return { result: denial("SUPPORT_INTERNAL"), replay: false }; }
    const createAuthorized = async (tx: SupportAccessTransaction): Promise<CallbackOutcome> => {
      const raw = await tx.getGrant({ tenantId, grantId });
      if (raw === null || raw === undefined) return { result: denial("SUPPORT_NOT_FOUND_OR_FORBIDDEN") };
      const grant = parseGrantOrThrow(raw);
      const facts: EventFacts = { tenantId: grant.tenantId, workspaceId: grant.workspaceId, actorLayer: "support", actorId: principal.authIdentityId, supportGrantId: grant.id, permission, dataClasses: grant.dataClasses, correlationId, reasonCode: callbackMode ? "support.authorize_and_run" : "support.check" };
      if (grant.id !== grantId || grant.tenantId !== tenantId || grant.supportActorAuthIdentityId !== principal.authIdentityId || grant.platformRole !== PLATFORM_SUPPORT_ROLE) return { result: denial("SUPPORT_SCOPE_MISMATCH"), facts };
      if (grant.workspaceId !== null && grant.workspaceId !== workspaceId) return { result: denial("SUPPORT_WORKSPACE_SCOPE_INVALID"), facts };
      if (workspaceId !== null && !validWorkspaceResult(await tx.verifyWorkspace({ tenantId, workspaceId }), tenantId, workspaceId)) return { result: denial("SUPPORT_WORKSPACE_SCOPE_INVALID"), facts };
      if (!grant.permissions.includes(permission) || !dataClasses.every((dataClass) => grant.dataClasses.includes(dataClass))) return { result: denial("SUPPORT_GRANT_REQUIRED"), facts };
      const at = operationNow(options);
      if (!isSupportAccessGrantEligibleAt(grant, at)) return { result: denial("SUPPORT_GRANT_REQUIRED"), facts };
      const context: SupportAccessContext = Object.freeze({ source: "support", supportActorAuthIdentityId: principal.authIdentityId, supportGrantId: grant.id, tenantId, workspaceId, permission, dataClasses, correlationId, attemptId: currentAttemptId, auditEventId: currentAuditEventId, startsAt: grant.startsAt, expiresAt: grant.expiresAt });
      return { result: success("OK_SUPPORT_AUTHORIZED"), context, facts };
    };
    let currentAttemptId: string; let currentAuditEventId: string;
    try { currentAttemptId = makeId(options); currentAuditEventId = makeId(options); } catch { return { result: denial("SUPPORT_INTERNAL"), replay: false }; }
    const result = await atomic({ operation, tenantId, actorNamespace: principal.authIdentityId, idempotencyKey: key, inputHash: hash, facts: normalizedFacts({ tenantId, workspaceId, actorLayer: "support", actorId: principal.authIdentityId, supportGrantId: grantId, permission, dataClasses, correlationId, reasonCode: callbackMode ? "support.authorize_and_run" : "support.check" }), attemptId: currentAttemptId, auditEventId: currentAuditEventId, callback: async (tx) => createAuthorized(tx), replay: async (tx) => createAuthorized(tx), volatile: true });
    return result;
  }

  async function check(input: SupportAccessCheckInput): Promise<SupportAccessResult> {
    const outcome = await supportAuthorization(input, false);
    return outcome.result.context ? success("OK_SUPPORT_AUTHORIZED") : outcome.result;
  }
  async function authorizeAndRun<T>(input: SupportAccessCheckInput, callback: (context: SupportAccessContext) => Promise<T>): Promise<SupportAccessResult & { value?: T }> {
    if (typeof callback !== "function") return denial("SUPPORT_MALFORMED") as SupportAccessResult & { value?: T };
    const outcome = await supportAuthorization(input, true);
    if (outcome.replay || !outcome.result.ok || !outcome.context || outcome.result.code !== "OK_SUPPORT_AUTHORIZED") return outcome.result as SupportAccessResult & { value?: T };
    try {
      const value = await supportContextStorage.run(outcome.context, () => callback(outcome.context as SupportAccessContext));
      return Object.freeze({ ok: true, code: "OK_SUPPORT_AUTHORIZED" as const, value });
    } catch { return denial("SUPPORT_INTERNAL") as SupportAccessResult & { value?: T }; }
  }

  async function list(input: SupportAccessListInput, history: boolean): Promise<SupportAccessResult> {
    const context = currentMember();
    const parsed = exactInput(input, ["tenantId", "idempotencyKey"], ["workspaceId", "correlationId"]);
    if (!context) {
      const member = getTenantContext(); const worker = getWorkerTenantContext(); const support = getSupportAccessContext();
      const tenantId = member?.tenantId ?? support?.tenantId ?? worker?.tenantId; const key = safeOwnData(input, "idempotencyKey"); const correlationId = safeOwnData(input, "correlationId") ?? member?.correlationId ?? support?.correlationId ?? worker?.correlationId;
      const actor = mixedActor(member, worker, support);
      if ((member || worker || support) && tenantId && isText(key) && isText(correlationId)) return auditDenied({ operation: history ? "list_history" : "list_current", tenantId, workspaceId: member?.workspaceId ?? support?.workspaceId ?? worker?.workspaceId ?? null, actorLayer: actor.actorLayer, actorId: actor.actorId, supportGrantId: null, permission: "audit:read", dataClasses: [], correlationId, idempotencyKey: key, code: "SUPPORT_SCOPE_MISMATCH", reasonCode: "support.list.mixed-context", inputHashPayload: { operation: history ? "list_history" : "list_current", tenantId, key, invalid: "mixed-context" } });
      return denial("SUPPORT_MALFORMED");
    }
    const safeKey = safeOwnData(input, "idempotencyKey");
    if (!parsed) {
      if (isText(safeKey)) return auditDenied({ operation: history ? "list_history" : "list_current", tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "audit:read", dataClasses: [], correlationId: context.correlationId, idempotencyKey: safeKey, code: "SUPPORT_MALFORMED", reasonCode: history ? "support.grant.history" : "support.grant.current", inputHashPayload: { operation: history ? "list_history" : "list_current", tenantId: context.tenantId, key: safeKey, invalid: "shape" } });
      return denial("SUPPORT_MALFORMED");
    }
    if (!isUuid(parsed.get("tenantId")) || parsed.get("tenantId") !== context.tenantId || !isText(parsed.get("idempotencyKey"))) {
      if (isText(parsed.get("idempotencyKey"))) return auditDenied({ operation: history ? "list_history" : "list_current", tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "audit:read", dataClasses: [], correlationId: context.correlationId, idempotencyKey: parsed.get("idempotencyKey") as string, code: "SUPPORT_MALFORMED", reasonCode: history ? "support.grant.history" : "support.grant.current", inputHashPayload: { operation: history ? "list_history" : "list_current", tenantId: context.tenantId, key: parsed.get("idempotencyKey"), invalid: "field" } });
      return denial("SUPPORT_MALFORMED");
    }
    const correlationId = memberCorrelation(parsed, context); const workspaceId = normalizeMemberWorkspace(parsed, context); const key = parsed.get("idempotencyKey") as string; const operation: SupportAccessOperation = history ? "list_history" : "list_current"; const action = history ? "support.grant.history" : "support.grant.current";
    if (!correlationId) return auditDenied({ operation, tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "audit:read", dataClasses: [], correlationId: context.correlationId, idempotencyKey: key, code: "SUPPORT_MALFORMED", reasonCode: action, inputHashPayload: { operation, tenantId: context.tenantId, key, invalid: "correlation" } });
    if (workspaceId === undefined) return auditDenied({ operation, tenantId: context.tenantId, workspaceId: context.workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "audit:read", dataClasses: [], correlationId, idempotencyKey: key, code: "SUPPORT_WORKSPACE_SCOPE_INVALID", reasonCode: action, inputHashPayload: { operation, tenantId: context.tenantId, key, invalid: "workspace" } });
    let hash: string;
    try { hash = stableHash({ operation, tenantId: context.tenantId, workspaceId, actorAuthIdentityId: context.actorAuthIdentityId, correlationId }); } catch { return denial("SUPPORT_INTERNAL"); }
    const fetch = async (tx: SupportAccessTransaction): Promise<CallbackOutcome> => {
      if (!(await verifyMember(tx, context, "audit:read", action))) return { result: denial("SUPPORT_POLICY_BLOCKED") };
      const at = operationNow(options);
      const raw = await tx.listGrants({ tenantId: context.tenantId, workspaceId: null, history });
      const grants = parseGrantList(raw);
      if (!grants) throw new SupportInternalError("list result");
      if (grants.some((grant) => grant.tenantId !== context.tenantId)) throw new SupportInternalError("list scope");
      const scoped = workspaceId === null ? grants : grants.filter((grant) => grant.workspaceId === null || grant.workspaceId === workspaceId);
      const visible = history ? scoped : scoped.filter((grant) => isSupportAccessGrantEligibleAt(grant, at));
      return { result: success("OK_SUPPORT_AUTHORIZED", { grants: Object.freeze(visible) }), facts: { tenantId: context.tenantId, workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "audit:read", dataClasses: [], correlationId, reasonCode: action } };
    };
    let attemptId: string; let auditEventId: string;
    try { attemptId = makeId(options); auditEventId = makeId(options); } catch { return denial("SUPPORT_INTERNAL"); }
    const result = await atomic({ operation, tenantId: context.tenantId, actorNamespace: context.actorAuthIdentityId, idempotencyKey: key, inputHash: hash, facts: normalizedFacts({ tenantId: context.tenantId, workspaceId, actorLayer: "member", actorId: context.actorAuthIdentityId, supportGrantId: null, permission: "audit:read", dataClasses: [], correlationId, reasonCode: action }), attemptId, auditEventId, callback: fetch, replay: fetch, volatile: true, freshVolatileReplay: true });
    return result.result;
  }

  return Object.freeze({ request, approve: (input: SupportAccessDecisionInput) => mutateDecision("approve", input), revoke: (input: SupportAccessDecisionInput) => mutateDecision("revoke", input), check, authorizeAndRun, listCurrent: (input: SupportAccessListInput) => list(input, false), listHistory: (input: SupportAccessListInput) => list(input, true) });
}
