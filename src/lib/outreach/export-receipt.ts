import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import { outreachDraftEligibleActionsForVersion } from "@/lib/outreach/draft-review";

export const OUTREACH_EXPORT_RECEIPT_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string; accountId: string }>;
type Action = "copy" | "export";
type DataRecord = Record<string, unknown>;

export type OutreachExportReceipt = Scope & Readonly<{
  receiptVersion: typeof OUTREACH_EXPORT_RECEIPT_VERSION;
  receiptId: string;
  receiptHash: string;
  action: Action;
  completion: "caller_attested";
  idempotencyKey: string;
  draft: Readonly<{ versionId: string; stateHash: string; reviewHash: string }>;
  policy: Readonly<{ decisionHash: string; policyVersion: string; purpose: string }>;
  actor: Readonly<{ kind: "human"; actorId: string }>;
  decidedAt: string;
  completedAt: string;
}>;

export type OutreachExportReceiptResult = Readonly<
  | { ok: true; code: "OUTREACH_EXPORT_RECEIPT_CREATED"; receipt: OutreachExportReceipt }
  | { ok: false; code:
    | "MALFORMED_INPUT"
    | "SCOPE_MISMATCH"
    | "DENIED_DECISION"
    | "STALE_BINDING"
    | "ACTION_NOT_ELIGIBLE"
    | "INVALID_CHRONOLOGY"
    | "HUMAN_ACTOR_REQUIRED" }
>;

type ParsedDecision = Scope & Readonly<{
  result: "allow" | "deny";
  action: Action;
  reasons: readonly string[];
  draft: Readonly<{ versionId: string; stateHash: string; reviewHash: string }>;
  policyVersion: string;
  purpose: string;
  actor: Readonly<{ kind: "human"; actorId: string }>;
  decidedAt: string;
  decisionHash: string;
}>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "action", "decision", "currentDraftState",
  "expectedDecisionHash", "expectedDraftStateHash", "expectedDraftVersionId", "expectedDraftReviewHash", "actor",
  "idempotencyKey", "completedAt",
] as const;
const DECISION_FIELDS = [
  "decisionVersion", "tenantId", "workspaceId", "accountId", "result", "action", "reasons", "draft", "contact",
  "policyVersion", "purpose", "actor", "decidedAt", "decisionHash",
] as const;
const DRAFT_FIELDS = ["versionId", "stateHash", "reviewHash"] as const;
const CONTACT_FIELDS = ["versionId", "contentHash", "reviewHash"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const STATE_FIELDS = [
  "stateVersion", "tenantId", "workspaceId", "accountId", "stableKey", "current", "events", "stateHash",
] as const;
const CURRENT_FIELDS = [
  "tenantId", "workspaceId", "accountId", "versionId", "versionHash", "stableKey", "revision",
  "supersedesVersionId", "contentHash", "validationHash", "evidenceDigest", "reviewHash", "status",
  "eligibleActions", "review",
] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,299}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const DRAFT_VERSION = /^outreach-draft-version:[0-9a-f]{64}$/u;
const CONTACT_VERSION = /^contact-version:[0-9a-f]{64}$/u;
const DENY_REASONS = new Set([
  "DRAFT_NOT_ELIGIBLE", "CONTACT_REVIEW_REQUIRED", "CONTACT_STALE", "SUPPRESSED", "CONTACT_USE_BLOCKED",
  "POLICY_MISMATCH", "PURPOSE_MISMATCH", "ACTION_NOT_PERMITTED",
]);

function inspectRecord(value: unknown): DataRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || utilTypes.isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const output: DataRecord = Object.create(null) as DataRecord;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function exactRecord(value: unknown, fields: readonly string[]): DataRecord | null {
  const record = inspectRecord(value);
  if (!record) return null;
  const keys = Object.keys(record);
  return keys.length === fields.length && keys.every((key) => fields.includes(key)) ? record : null;
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  if (typeof value !== "object" || value === null || !Array.isArray(value) || utilTypes.isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum
      || Reflect.ownKeys(value).length !== value.length + 1) return null;
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function reference(value: unknown): string | null {
  return typeof value === "string" && REF.test(value) ? value : null;
}

function scope(record: DataRecord): Scope | null {
  return typeof record.tenantId === "string" && UUID.test(record.tenantId)
    && typeof record.workspaceId === "string" && UUID.test(record.workspaceId)
    && typeof record.accountId === "string" && UUID.test(record.accountId)
    ? Object.freeze({ tenantId: record.tenantId, workspaceId: record.workspaceId, accountId: record.accountId }) : null;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId
    && left.accountId === right.accountId;
}

function parseDecision(value: unknown): ParsedDecision | null {
  const record = exactRecord(value, DECISION_FIELDS);
  const decisionScope = record && scope(record);
  const result = record?.result === "allow" || record?.result === "deny" ? record.result : null;
  const action = record?.action === "copy" || record?.action === "export" ? record.action : null;
  const rawReasons = record && exactArray(record.reasons, DENY_REASONS.size);
  const draftRecord = record && exactRecord(record.draft, DRAFT_FIELDS);
  const versionId = draftRecord && typeof draftRecord.versionId === "string" && DRAFT_VERSION.test(draftRecord.versionId)
    ? draftRecord.versionId : null;
  const stateHash = draftRecord && typeof draftRecord.stateHash === "string" && HASH.test(draftRecord.stateHash)
    ? draftRecord.stateHash : null;
  const reviewHash = draftRecord && typeof draftRecord.reviewHash === "string" && HASH.test(draftRecord.reviewHash)
    ? draftRecord.reviewHash : null;
  const contactRecord = record && exactRecord(record.contact, CONTACT_FIELDS);
  const contactVersionId = contactRecord && typeof contactRecord.versionId === "string"
    && CONTACT_VERSION.test(contactRecord.versionId) ? contactRecord.versionId : null;
  const contactContentHash = contactRecord && typeof contactRecord.contentHash === "string"
    && HASH.test(contactRecord.contentHash) ? contactRecord.contentHash : null;
  const contactReviewHash = contactRecord && typeof contactRecord.reviewHash === "string"
    && HASH.test(contactRecord.reviewHash) ? contactRecord.reviewHash : null;
  const policyVersion = record && reference(record.policyVersion);
  const purpose = record && reference(record.purpose);
  const actorRecord = record && exactRecord(record.actor, ACTOR_FIELDS);
  const actorId = actorRecord && typeof actorRecord.actorId === "string" && UUID.test(actorRecord.actorId)
    ? actorRecord.actorId : null;
  const decidedAt = record && timestamp(record.decidedAt);
  const decisionHash = record && typeof record.decisionHash === "string" && HASH.test(record.decisionHash)
    ? record.decisionHash : null;
  if (!record || record.decisionVersion !== 1 || !decisionScope || !result || !action || !rawReasons
    || !draftRecord || !versionId || !stateHash || !reviewHash || !contactRecord || !contactVersionId
    || !contactContentHash || !contactReviewHash || !policyVersion || !purpose || !actorRecord
    || actorRecord.kind !== "human" || !actorId || !decidedAt || !decisionHash) return null;
  const reasons: string[] = [];
  for (const reason of rawReasons) {
    if (typeof reason !== "string" || !DENY_REASONS.has(reason) || reasons.includes(reason)) return null;
    reasons.push(reason);
  }
  if ((result === "allow" && reasons.length !== 0) || (result === "deny" && reasons.length === 0)) return null;
  const draft = Object.freeze({ versionId, stateHash, reviewHash });
  const contact = Object.freeze({ versionId: contactVersionId, contentHash: contactContentHash,
    reviewHash: contactReviewHash });
  const actor = Object.freeze({ kind: "human" as const, actorId });
  const payload = Object.freeze({ decisionVersion: 1 as const, ...decisionScope, result, action,
    reasons: Object.freeze(reasons), draft, contact, policyVersion, purpose, actor, decidedAt });
  if (decisionHash !== sha256(payload)) return null;
  return Object.freeze({ ...decisionScope, result, action, reasons: payload.reasons, draft,
    policyVersion, purpose, actor, decidedAt, decisionHash });
}

function failure(code: Extract<OutreachExportReceiptResult, { ok: false }>["code"]): OutreachExportReceiptResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Records caller-attested completion only. It performs no copy, export, file,
 * clipboard, network, provider, recipient, delivery, persistence, or send work.
 */
export function createOutreachExportReceipt(value: unknown): OutreachExportReceiptResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== OUTREACH_EXPORT_RECEIPT_VERSION) return failure("MALFORMED_INPUT");
    const inputScope = scope(input);
    const action = input.action === "copy" || input.action === "export" ? input.action : null;
    const decision = parseDecision(input.decision);
    const actorRecord = exactRecord(input.actor, ACTOR_FIELDS);
    const actorId = actorRecord && typeof actorRecord.actorId === "string" && UUID.test(actorRecord.actorId)
      ? actorRecord.actorId : null;
    const idempotencyKey = reference(input.idempotencyKey);
    const completedAt = timestamp(input.completedAt);
    const expectedDecisionHash = typeof input.expectedDecisionHash === "string" && HASH.test(input.expectedDecisionHash)
      ? input.expectedDecisionHash : null;
    const expectedDraftStateHash = typeof input.expectedDraftStateHash === "string"
      && HASH.test(input.expectedDraftStateHash) ? input.expectedDraftStateHash : null;
    const expectedDraftVersionId = typeof input.expectedDraftVersionId === "string"
      && DRAFT_VERSION.test(input.expectedDraftVersionId) ? input.expectedDraftVersionId : null;
    const expectedDraftReviewHash = typeof input.expectedDraftReviewHash === "string"
      && HASH.test(input.expectedDraftReviewHash) ? input.expectedDraftReviewHash : null;
    const stateRecord = exactRecord(input.currentDraftState, STATE_FIELDS);
    const stateScope = stateRecord && scope(stateRecord);
    const current = stateRecord && exactRecord(stateRecord.current, CURRENT_FIELDS);
    const stateHash = stateRecord && typeof stateRecord.stateHash === "string" && HASH.test(stateRecord.stateHash)
      ? stateRecord.stateHash : null;
    const versionId = current && typeof current.versionId === "string" && DRAFT_VERSION.test(current.versionId)
      ? current.versionId : null;
    const reviewHash = current && typeof current.reviewHash === "string" && HASH.test(current.reviewHash)
      ? current.reviewHash : null;
    if (!inputScope || !action || !decision || !actorRecord || !actorId || !idempotencyKey || !completedAt
      || !expectedDecisionHash || !expectedDraftStateHash || !expectedDraftVersionId || !expectedDraftReviewHash
      || !stateRecord || stateRecord.stateVersion !== 1 || !stateScope || !current || !stateHash || !versionId
      || !reviewHash) return failure("MALFORMED_INPUT");
    if (!sameScope(inputScope, decision) || !sameScope(inputScope, stateScope)) return failure("SCOPE_MISMATCH");
    if (actorRecord.kind !== "human") return failure("HUMAN_ACTOR_REQUIRED");
    if (decision.result !== "allow") return failure("DENIED_DECISION");
    if (expectedDecisionHash !== decision.decisionHash || expectedDraftStateHash !== stateHash
      || expectedDraftVersionId !== versionId || expectedDraftReviewHash !== reviewHash
      || decision.draft.stateHash !== stateHash || decision.draft.versionId !== versionId
      || decision.draft.reviewHash !== reviewHash) return failure("STALE_BINDING");
    if (action !== decision.action || actorId !== decision.actor.actorId) return failure("STALE_BINDING");
    if (Date.parse(completedAt) <= Date.parse(decision.decidedAt)) return failure("INVALID_CHRONOLOGY");
    if (!outreachDraftEligibleActionsForVersion(input.currentDraftState, versionId).includes(action)) {
      return failure("ACTION_NOT_ELIGIBLE");
    }
    const draft = Object.freeze({ versionId, stateHash, reviewHash });
    const policy = Object.freeze({ decisionHash: decision.decisionHash, policyVersion: decision.policyVersion,
      purpose: decision.purpose });
    const actor = Object.freeze({ kind: "human" as const, actorId });
    const payload = Object.freeze({
      receiptVersion: OUTREACH_EXPORT_RECEIPT_VERSION,
      ...inputScope,
      action,
      completion: "caller_attested" as const,
      idempotencyKey,
      draft,
      policy,
      actor,
      decidedAt: decision.decidedAt,
      completedAt,
    });
    const receiptHash = sha256(payload);
    const receipt = Object.freeze({
      ...payload,
      receiptId: `outreach-export-receipt:${receiptHash.slice("sha256:".length)}`,
      receiptHash,
    });
    return Object.freeze({ ok: true, code: "OUTREACH_EXPORT_RECEIPT_CREATED", receipt });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
