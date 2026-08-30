import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { transitionContactRecordReview } from "@/lib/contacts/contact-record";
import {
  outreachDraftEligibleActionsForVersion,
  refreshOutreachDraftCurrentReview,
} from "@/lib/outreach/draft-review";

export const OUTREACH_POLICY_GATE_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string; accountId: string }>;
type Action = "copy" | "export";

export type OutreachPolicyDenyReason =
  | "DRAFT_NOT_ELIGIBLE"
  | "CONTACT_REVIEW_REQUIRED"
  | "CONTACT_STALE"
  | "SUPPRESSED"
  | "CONTACT_USE_BLOCKED"
  | "POLICY_MISMATCH"
  | "PURPOSE_MISMATCH"
  | "ACTION_NOT_PERMITTED";

export type OutreachPolicyDecision = Scope & Readonly<{
  decisionVersion: typeof OUTREACH_POLICY_GATE_VERSION;
  result: "allow" | "deny";
  action: Action;
  reasons: readonly OutreachPolicyDenyReason[];
  draft: Readonly<{ versionId: string; stateHash: string; reviewHash: string }>;
  contact: Readonly<{ versionId: string; contentHash: string; reviewHash: string }>;
  policyVersion: string;
  purpose: string;
  actor: Readonly<{ kind: "human"; actorId: string }>;
  decidedAt: string;
  decisionHash: string;
}>;

export type OutreachPolicyGateResult =
  | Readonly<{ ok: true; code: "OUTREACH_POLICY_DECIDED"; decision: OutreachPolicyDecision }>
  | Readonly<{ ok: false; code:
    | "MALFORMED_INPUT"
    | "SCOPE_MISMATCH"
    | "STALE_BINDING"
    | "INVALID_CHRONOLOGY"
    | "HUMAN_ACTOR_REQUIRED" }>;

type PlainRecord = Record<string, unknown>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "action", "currentDraftState",
  "expectedDraftStateHash", "expectedDraftVersionId", "expectedDraftReviewHash", "contact",
  "expectedContactVersionId", "expectedContactContentHash", "expectedContactReviewHash", "policy", "actor", "decidedAt",
] as const;
const POLICY_FIELDS = ["policyVersion", "purpose", "allowedActions"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const STATE_FIELDS = [
  "stateVersion", "tenantId", "workspaceId", "accountId", "stableKey", "current", "events", "stateHash",
] as const;
const CURRENT_FIELDS = [
  "tenantId", "workspaceId", "accountId", "versionId", "versionHash", "stableKey", "revision",
  "supersedesVersionId", "contentHash", "validationHash", "evidenceDigest", "reviewHash", "status",
  "eligibleActions", "review",
] as const;
const CURRENT_EVENT_FIELDS = ["fromVersionId", "to", "actor", "at", "reason"] as const;
const CONTACT_FIELDS = [
  "schemaVersion", "versionId", "versionHash", "tenantId", "workspaceId", "accountId", "stableKey", "revision",
  "supersedesVersionId", "createdAt", "identity", "roleHypothesis", "sourceReceipt", "freshness", "permittedUse",
  "suppressionDisposition", "contentHash", "review",
] as const;
const CONTACT_REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "accountId", "contentHash", "status", "events",
  "eligibility", "reviewHash",
] as const;
const CONTACT_EVENT_FIELDS = ["from", "to", "actor", "at", "reason"] as const;
const FRESHNESS_FIELDS = ["state", "observedAt", "expiresAt"] as const;
const PERMITTED_USE_FIELDS = [
  "policyVersion", "purpose", "sourcePolicy", "jurisdiction", "attestation", "identity", "channelAuthorization",
  "legalBasis", "consentSignal",
] as const;
const ELIGIBILITY_FIELDS = ["research", "contactUse", "reasons"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,299}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const DRAFT_VERSION = /^outreach-draft-version:[0-9a-f]{64}$/u;
const CONTACT_VERSION = /^contact-version:[0-9a-f]{64}$/u;
const MAX_EVENTS = 100;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
    const output: PlainRecord = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output[field] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  if (typeof value !== "object" || value === null || !Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum
      || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function reference(value: unknown): string | null {
  return typeof value === "string" && REF.test(value) ? value : null;
}

function scope(value: PlainRecord): Scope | null {
  return typeof value.tenantId === "string" && UUID.test(value.tenantId)
    && typeof value.workspaceId === "string" && UUID.test(value.workspaceId)
    && typeof value.accountId === "string" && UUID.test(value.accountId)
    ? Object.freeze({ tenantId: value.tenantId, workspaceId: value.workspaceId, accountId: value.accountId }) : null;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId && left.accountId === right.accountId;
}

function lastEventAt(value: unknown, fields: readonly string[]): string | null {
  const events = exactArray(value, MAX_EVENTS);
  if (!events?.length) return null;
  const event = exactRecord(events.at(-1), fields);
  return event ? timestamp(event.at) : null;
}

function failure(code: Extract<OutreachPolicyGateResult, { ok: false }>["code"]): OutreachPolicyGateResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Produces a decision receipt only. It does not copy, export, send, persist,
 * contact a provider, authenticate the actor, or grant any execution authority.
 */
export function evaluateOutreachPolicyGate(value: unknown): OutreachPolicyGateResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== OUTREACH_POLICY_GATE_VERSION) return failure("MALFORMED_INPUT");
    const inputScope = scope(input);
    const action = input.action === "copy" || input.action === "export" ? input.action : null;
    const actorRecord = exactRecord(input.actor, ACTOR_FIELDS);
    const actorId = actorRecord && typeof actorRecord.actorId === "string" && UUID.test(actorRecord.actorId)
      ? actorRecord.actorId : null;
    const decidedAt = timestamp(input.decidedAt);
    const policyRecord = exactRecord(input.policy, POLICY_FIELDS);
    const policyVersion = policyRecord && reference(policyRecord.policyVersion);
    const purpose = policyRecord && reference(policyRecord.purpose);
    const rawActions = policyRecord && exactArray(policyRecord.allowedActions, 2);
    if (!inputScope || !action || !actorRecord || !actorId || !decidedAt || !policyRecord || !policyVersion
      || !purpose || !rawActions?.length) return failure("MALFORMED_INPUT");
    if (actorRecord.kind !== "human") return failure("HUMAN_ACTOR_REQUIRED");
    const allowedActions: Action[] = [];
    for (const rawAction of rawActions) {
      if (rawAction !== "copy" && rawAction !== "export") return failure("MALFORMED_INPUT");
      if (allowedActions.includes(rawAction)) return failure("MALFORMED_INPUT");
      allowedActions.push(rawAction);
    }
    allowedActions.sort();

    const stateRecord = exactRecord(input.currentDraftState, STATE_FIELDS);
    const stateScope = stateRecord && scope(stateRecord);
    const binding = stateRecord && exactRecord(stateRecord.current, CURRENT_FIELDS);
    const draftVersionId = binding && typeof binding.versionId === "string" && DRAFT_VERSION.test(binding.versionId)
      ? binding.versionId : null;
    const draftReviewHash = binding && typeof binding.reviewHash === "string" && HASH.test(binding.reviewHash)
      ? binding.reviewHash : null;
    const stateHash = stateRecord && typeof stateRecord.stateHash === "string" && HASH.test(stateRecord.stateHash)
      ? stateRecord.stateHash : null;
    const draftLastAt = stateRecord && lastEventAt(stateRecord.events, CURRENT_EVENT_FIELDS);
    if (!stateRecord || stateRecord.stateVersion !== 1 || !stateScope || !binding || !draftVersionId
      || !draftReviewHash || !stateHash || !draftLastAt) return failure("MALFORMED_INPUT");

    const contactRecord = exactRecord(input.contact, CONTACT_FIELDS);
    const contactScope = contactRecord && scope(contactRecord);
    const contactVersionId = contactRecord && typeof contactRecord.versionId === "string"
      && CONTACT_VERSION.test(contactRecord.versionId) ? contactRecord.versionId : null;
    const contactContentHash = contactRecord && typeof contactRecord.contentHash === "string" && HASH.test(contactRecord.contentHash)
      ? contactRecord.contentHash : null;
    const contactReview = contactRecord && exactRecord(contactRecord.review, CONTACT_REVIEW_FIELDS);
    const contactReviewHash = contactReview && typeof contactReview.reviewHash === "string" && HASH.test(contactReview.reviewHash)
      ? contactReview.reviewHash : null;
    const contactLastAt = contactReview && lastEventAt(contactReview.events, CONTACT_EVENT_FIELDS);
    const freshness = contactRecord && exactRecord(contactRecord.freshness, FRESHNESS_FIELDS);
    const expiresAt = freshness && timestamp(freshness.expiresAt);
    const permittedUse = contactRecord && exactRecord(contactRecord.permittedUse, PERMITTED_USE_FIELDS);
    const contactPolicyVersion = permittedUse && reference(permittedUse.policyVersion);
    const contactPurpose = permittedUse && reference(permittedUse.purpose);
    const eligibility = contactReview && exactRecord(contactReview.eligibility, ELIGIBILITY_FIELDS);
    if (!contactRecord || contactRecord.schemaVersion !== 1 || !contactScope || !contactVersionId || !contactContentHash
      || !contactReview || !contactReviewHash || !contactLastAt || !freshness || !expiresAt || !permittedUse
      || !contactPolicyVersion || !contactPurpose || !eligibility) return failure("MALFORMED_INPUT");
    if (!sameScope(inputScope, stateScope) || !sameScope(inputScope, contactScope)) return failure("SCOPE_MISMATCH");

    if (input.expectedDraftStateHash !== stateHash || input.expectedDraftVersionId !== draftVersionId
      || input.expectedDraftReviewHash !== draftReviewHash || input.expectedContactVersionId !== contactVersionId
      || input.expectedContactContentHash !== contactContentHash || input.expectedContactReviewHash !== contactReviewHash) {
      return failure("STALE_BINDING");
    }
    if (Date.parse(decidedAt) <= Date.parse(draftLastAt) || Date.parse(decidedAt) <= Date.parse(contactLastAt)) {
      return failure("INVALID_CHRONOLOGY");
    }

    const stateValidation = refreshOutreachDraftCurrentReview({ version: 1, ...inputScope,
      current: input.currentDraftState, expectedStateHash: stateHash, review: binding.review,
      actor: { kind: "human", actorId }, at: decidedAt,
      reason: "Validate canonical current outreach state for policy decision." });
    if (stateValidation.ok || stateValidation.code !== "INVALID_TRANSITION") return failure("MALFORMED_INPUT");

    const contactStatus = contactReview.status;
    const contactTo = contactStatus === "draft" ? "in_review" : contactStatus === "in_review" ? "approved" : "in_review";
    const contactValidation = transitionContactRecordReview({ version: 1, ...inputScope, current: input.contact,
      expectedVersionId: contactVersionId, expectedContentHash: contactContentHash,
      expectedReviewHash: contactReviewHash, to: contactTo, actor: { kind: "human", actorId }, at: decidedAt,
      reason: "Validate canonical governed contact for policy decision." });
    const terminalContact = contactStatus === "approved" || contactStatus === "rejected";
    if (!contactValidation.ok && !(terminalContact && contactValidation.code === "INVALID_TRANSITION")) {
      return failure("MALFORMED_INPUT");
    }

    const eligibleActions = outreachDraftEligibleActionsForVersion(input.currentDraftState, draftVersionId);
    const reasons: OutreachPolicyDenyReason[] = [];
    if (!eligibleActions.includes(action)) reasons.push("DRAFT_NOT_ELIGIBLE");
    if (contactStatus !== "approved") reasons.push("CONTACT_REVIEW_REQUIRED");
    if (freshness.state !== "KNOWN" || Date.parse(expiresAt) <= Date.parse(decidedAt)) reasons.push("CONTACT_STALE");
    if (contactRecord.suppressionDisposition !== "clear") reasons.push("SUPPRESSED");
    if (eligibility.contactUse !== "allowed") reasons.push("CONTACT_USE_BLOCKED");
    if (policyVersion !== contactPolicyVersion) reasons.push("POLICY_MISMATCH");
    if (purpose !== contactPurpose) reasons.push("PURPOSE_MISMATCH");
    if (!allowedActions.includes(action)) reasons.push("ACTION_NOT_PERMITTED");

    const draft = Object.freeze({ versionId: draftVersionId, stateHash, reviewHash: draftReviewHash });
    const contact = Object.freeze({ versionId: contactVersionId, contentHash: contactContentHash,
      reviewHash: contactReviewHash });
    const actor = Object.freeze({ kind: "human" as const, actorId });
    const payload = Object.freeze({ decisionVersion: OUTREACH_POLICY_GATE_VERSION, tenantId: inputScope.tenantId,
      workspaceId: inputScope.workspaceId, accountId: inputScope.accountId,
      result: reasons.length === 0 ? "allow" as const : "deny" as const, action,
      reasons: Object.freeze(reasons), draft, contact, policyVersion, purpose, actor, decidedAt });
    const decision = Object.freeze({ ...payload, decisionHash: sha256(payload) });
    return Object.freeze({ ok: true, code: "OUTREACH_POLICY_DECIDED", decision });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
