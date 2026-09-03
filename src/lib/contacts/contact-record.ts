import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export const CONTACT_RECORD_SCHEMA_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string; accountId: string }>;
type EpistemicState = "KNOWN" | "UNKNOWN" | "CONFLICTED" | "STALE" | "NA";
type ContactPointClass =
  | "business_role_mailbox"
  | "named_business_email"
  | "business_switchboard"
  | "personal_email"
  | "personal_mobile"
  | "unknown";
type SuppressionDisposition =
  | "clear"
  | "opt_out"
  | "do_not_contact"
  | "complaint"
  | "hard_bounce"
  | "soft_bounce"
  | "deletion_pending"
  | "deleted_tombstone"
  | "source_prohibited"
  | "conflicted"
  | "unknown";

export type ContactSourceReceipt = Readonly<{
  receiptVersion: 1;
  tenantId: string;
  workspaceId: string;
  accountId: string;
  sourceId: string;
  sourceVersionId: string;
  sourceContentHash: string;
  connectorKey: string;
  locator: string;
  observedAt: string;
  receiptHash: string;
}>;

export type ContactIdentity = Readonly<{
  kind: "person_candidate" | "role_contact";
  displayName: string | null;
  contactPointClass: ContactPointClass;
  contactPoint: string | null;
  verification: "source_observed" | "human_corrected" | "unverified";
}>;

export type ContactRoleHypothesis = Readonly<{
  status: "hypothesis";
  roleKey: string;
  statement: string;
  confidenceBasisPoints: number;
  evidenceReceiptHash: string;
}>;

export type ContactFreshness = Readonly<{
  state: EpistemicState;
  observedAt: string;
  expiresAt: string;
}>;

export type ContactPermittedUse = Readonly<{
  policyVersion: string;
  purpose: string;
  sourcePolicy: EpistemicState;
  jurisdiction: EpistemicState;
  attestation: EpistemicState;
  identity: EpistemicState;
  channelAuthorization: EpistemicState;
  legalBasis: EpistemicState;
  consentSignal: EpistemicState;
}>;

export type ContactEligibilityReason =
  | "REVIEW_REQUIRED"
  | "SUPPRESSED"
  | "CONTACT_POINT_BLOCKED"
  | "SOURCE_POLICY_NOT_KNOWN"
  | "JURISDICTION_NOT_KNOWN"
  | "ATTESTATION_NOT_KNOWN"
  | "IDENTITY_NOT_KNOWN"
  | "FRESHNESS_NOT_KNOWN"
  | "CHANNEL_AUTHORIZATION_NOT_KNOWN"
  | "LEGAL_BASIS_NOT_KNOWN"
  | "CONSENT_NOT_KNOWN";

export type ContactEligibility = Readonly<{
  research: "allowed" | "blocked";
  contactUse: "allowed" | "blocked";
  reasons: readonly ContactEligibilityReason[];
}>;

export type ContactReviewEvent = Readonly<{
  from: "draft" | "in_review";
  to: "in_review" | "approved" | "rejected";
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
}>;

export type ContactReviewSnapshot = Scope & Readonly<{
  reviewVersion: 1;
  versionId: string;
  contentHash: string;
  status: "draft" | "in_review" | "approved" | "rejected";
  events: readonly ContactReviewEvent[];
  eligibility: ContactEligibility;
  reviewHash: string;
}>;

export type ContactRecord = Scope & Readonly<{
  schemaVersion: typeof CONTACT_RECORD_SCHEMA_VERSION;
  versionId: string;
  versionHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  createdAt: string;
  identity: ContactIdentity;
  roleHypothesis: ContactRoleHypothesis | null;
  sourceReceipt: ContactSourceReceipt;
  freshness: ContactFreshness;
  permittedUse: ContactPermittedUse;
  suppressionDisposition: SuppressionDisposition;
  contentHash: string;
  review: ContactReviewSnapshot;
}>;

export type ContactRecordResult = Readonly<
  | { ok: true; code: "CONTACT_RECORD_CREATED" | "CONTACT_RECORD_VERSION_CREATED"; record: ContactRecord }
  | { ok: false; code: ContactFailureCode }
>;

export type ContactReviewResult = Readonly<
  | { ok: true; code: "CONTACT_REVIEW_TRANSITIONED"; record: ContactRecord }
  | { ok: false; code: ContactFailureCode }
>;

export type ContactFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "VERSION_CONFLICT"
  | "STALE_VERSION"
  | "INVALID_TRANSITION"
  | "HUMAN_REVIEW_REQUIRED";

type PlainRecord = Record<string, unknown>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "stableKey", "revision", "predecessor", "createdAt",
  "identity", "roleHypothesis", "sourceReceipt", "freshness", "permittedUse", "suppressionDisposition",
] as const;
const RECORD_FIELDS = [
  "schemaVersion", "versionId", "versionHash", "tenantId", "workspaceId", "accountId", "stableKey",
  "revision", "supersedesVersionId", "createdAt", "identity", "roleHypothesis", "sourceReceipt", "freshness",
  "permittedUse", "suppressionDisposition", "contentHash", "review",
] as const;
const PREDECESSOR_FIELDS = ["predecessorVersion", "stableKey", "revision", "supersedesVersionId", "record"] as const;
const RECEIPT_FIELDS = [
  "receiptVersion", "tenantId", "workspaceId", "accountId", "sourceId", "sourceVersionId", "sourceContentHash",
  "connectorKey", "locator", "observedAt", "receiptHash",
] as const;
const IDENTITY_FIELDS = ["kind", "displayName", "contactPointClass", "contactPoint", "verification"] as const;
const ROLE_FIELDS = ["status", "roleKey", "statement", "confidenceBasisPoints", "evidenceReceiptHash"] as const;
const FRESHNESS_FIELDS = ["state", "observedAt", "expiresAt"] as const;
const PERMITTED_USE_FIELDS = [
  "policyVersion", "purpose", "sourcePolicy", "jurisdiction", "attestation", "identity", "channelAuthorization",
  "legalBasis", "consentSignal",
] as const;
const REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "accountId", "contentHash", "status", "events",
  "eligibility", "reviewHash",
] as const;
const ELIGIBILITY_FIELDS = ["research", "contactUse", "reasons"] as const;
const EVENT_FIELDS = ["from", "to", "actor", "at", "reason"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "current", "expectedVersionId", "expectedContentHash",
  "expectedReviewHash", "to", "actor", "at", "reason",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,299}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const VERSION_ID = /^contact-version:[0-9a-f]{64}$/u;
const MAX_EVENTS = 100;
const EPISTEMIC = new Set<EpistemicState>(["KNOWN", "UNKNOWN", "CONFLICTED", "STALE", "NA"]);
const CONTACT_POINT_CLASSES = new Set<ContactPointClass>([
  "business_role_mailbox", "named_business_email", "business_switchboard", "personal_email", "personal_mobile",
  "unknown",
]);
const SUPPRESSIONS = new Set<SuppressionDisposition>([
  "clear", "opt_out", "do_not_contact", "complaint", "hard_bounce", "soft_bounce", "deletion_pending",
  "deleted_tombstone", "source_prohibited", "conflicted", "unknown",
]);

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

function safeText(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value !== value.trim()
    || !isWellFormedUnicode(value) || value !== value.normalize("NFKC")
    || /[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value)) return null;
  return value;
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
  }
  return true;
}

function optionalText(value: unknown, maximum: number): string | null | undefined {
  return value === null ? null : safeText(value, maximum) ?? undefined;
}

function reference(value: unknown): string | null {
  return typeof value === "string" && REF.test(value) ? value : null;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value : null;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId
    && left.accountId === right.accountId;
}

function parseReceipt(value: unknown): ContactSourceReceipt | null {
  const record = exactRecord(value, RECEIPT_FIELDS);
  const tenantId = record && typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = record && typeof record.workspaceId === "string" && UUID.test(record.workspaceId)
    ? record.workspaceId : null;
  const accountId = record && typeof record.accountId === "string" && UUID.test(record.accountId) ? record.accountId : null;
  const sourceId = record && reference(record.sourceId);
  const sourceVersionId = record && reference(record.sourceVersionId);
  const sourceContentHash = record && typeof record.sourceContentHash === "string" && HASH.test(record.sourceContentHash)
    ? record.sourceContentHash : null;
  const connectorKey = record && reference(record.connectorKey);
  const locator = record && safeText(record.locator, 2_048);
  const observedAt = record && timestamp(record.observedAt);
  const receiptHash = record && typeof record.receiptHash === "string" && HASH.test(record.receiptHash)
    ? record.receiptHash : null;
  if (!record || record.receiptVersion !== 1 || !tenantId || !workspaceId || !accountId
    || !sourceId || !sourceVersionId || !sourceContentHash
    || !connectorKey || !locator || !observedAt || !receiptHash) return null;
  const payload = Object.freeze({
    receiptVersion: 1 as const,
    tenantId,
    workspaceId,
    accountId,
    sourceId,
    sourceVersionId,
    sourceContentHash,
    connectorKey,
    locator,
    observedAt,
  });
  return sha256(payload) === receiptHash ? Object.freeze({ ...payload, receiptHash }) : null;
}

function parseIdentity(value: unknown): ContactIdentity | null {
  const record = exactRecord(value, IDENTITY_FIELDS);
  const kind = record?.kind === "person_candidate" || record?.kind === "role_contact" ? record.kind : null;
  const displayName = record && optionalText(record.displayName, 500);
  const contactPointClass = record && typeof record.contactPointClass === "string"
    && CONTACT_POINT_CLASSES.has(record.contactPointClass as ContactPointClass)
    ? record.contactPointClass as ContactPointClass : null;
  const contactPoint = record && optionalText(record.contactPoint, 500);
  const verification = record?.verification === "source_observed" || record?.verification === "human_corrected"
    || record?.verification === "unverified" ? record.verification : null;
  return record && kind && displayName !== undefined && contactPointClass && contactPoint !== undefined && verification
    ? Object.freeze({ kind, displayName, contactPointClass, contactPoint, verification }) : null;
}

function parseRole(value: unknown, receiptHash: string): ContactRoleHypothesis | null | undefined {
  if (value === null) return null;
  const record = exactRecord(value, ROLE_FIELDS);
  const roleKey = record && reference(record.roleKey);
  const statement = record && safeText(record.statement, 2_000);
  const confidenceBasisPoints = record && integer(record.confidenceBasisPoints, 0, 10_000);
  const evidenceReceiptHash = record && typeof record.evidenceReceiptHash === "string" && HASH.test(record.evidenceReceiptHash)
    ? record.evidenceReceiptHash : null;
  return record && record.status === "hypothesis" && roleKey && statement && confidenceBasisPoints !== null
    && evidenceReceiptHash === receiptHash
    ? Object.freeze({ status: "hypothesis" as const, roleKey, statement, confidenceBasisPoints, evidenceReceiptHash })
    : undefined;
}

function epistemic(value: unknown): EpistemicState | null {
  return typeof value === "string" && EPISTEMIC.has(value as EpistemicState) ? value as EpistemicState : null;
}

function parseFreshness(value: unknown, receipt: ContactSourceReceipt): ContactFreshness | null {
  const record = exactRecord(value, FRESHNESS_FIELDS);
  const state = record && epistemic(record.state);
  const observedAt = record && timestamp(record.observedAt);
  const expiresAt = record && timestamp(record.expiresAt);
  return record && state && observedAt === receipt.observedAt && expiresAt
    && Date.parse(expiresAt) > Date.parse(observedAt)
    ? Object.freeze({ state, observedAt, expiresAt }) : null;
}

function parsePermittedUse(value: unknown): ContactPermittedUse | null {
  const record = exactRecord(value, PERMITTED_USE_FIELDS);
  const policyVersion = record && reference(record.policyVersion);
  const purpose = record && reference(record.purpose);
  const sourcePolicy = record && epistemic(record.sourcePolicy);
  const jurisdiction = record && epistemic(record.jurisdiction);
  const attestation = record && epistemic(record.attestation);
  const identity = record && epistemic(record.identity);
  const channelAuthorization = record && epistemic(record.channelAuthorization);
  const legalBasis = record && epistemic(record.legalBasis);
  const consentSignal = record && epistemic(record.consentSignal);
  return record && policyVersion && purpose && sourcePolicy && jurisdiction && attestation && identity
    && channelAuthorization && legalBasis && consentSignal
    ? Object.freeze({
      policyVersion, purpose, sourcePolicy, jurisdiction, attestation, identity, channelAuthorization,
      legalBasis, consentSignal,
    }) : null;
}

function basisReasons(
  identity: ContactIdentity,
  freshness: ContactFreshness,
  permittedUse: ContactPermittedUse,
  suppression: SuppressionDisposition,
  asOf: string,
): Readonly<{ researchAllowed: boolean; contactUseAllowed: boolean; reasons: readonly ContactEligibilityReason[] }> {
  const reasons: ContactEligibilityReason[] = [];
  if (suppression !== "clear") reasons.push("SUPPRESSED");
  else if (identity.contactPointClass === "personal_email" || identity.contactPointClass === "personal_mobile"
    || identity.contactPointClass === "unknown" || identity.contactPoint === null) reasons.push("CONTACT_POINT_BLOCKED");
  else if (permittedUse.sourcePolicy !== "KNOWN") reasons.push("SOURCE_POLICY_NOT_KNOWN");
  else if (permittedUse.jurisdiction !== "KNOWN") reasons.push("JURISDICTION_NOT_KNOWN");
  else if (permittedUse.attestation !== "KNOWN") reasons.push("ATTESTATION_NOT_KNOWN");
  else if (permittedUse.identity !== "KNOWN") reasons.push("IDENTITY_NOT_KNOWN");
  else if (freshness.state !== "KNOWN" || Date.parse(freshness.expiresAt) <= Date.parse(asOf)) {
    reasons.push("FRESHNESS_NOT_KNOWN");
  }
  const researchAllowed = reasons.length === 0;
  if (researchAllowed) {
    if (permittedUse.channelAuthorization !== "KNOWN") reasons.push("CHANNEL_AUTHORIZATION_NOT_KNOWN");
    else if (permittedUse.legalBasis !== "KNOWN") reasons.push("LEGAL_BASIS_NOT_KNOWN");
    else if (permittedUse.consentSignal !== "KNOWN" && permittedUse.consentSignal !== "NA") {
      reasons.push("CONSENT_NOT_KNOWN");
    }
  }
  return Object.freeze({
    researchAllowed,
    contactUseAllowed: researchAllowed && reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}

function eligibility(
  status: ContactReviewSnapshot["status"],
  identity: ContactIdentity,
  freshness: ContactFreshness,
  permittedUse: ContactPermittedUse,
  suppression: SuppressionDisposition,
  asOf: string,
): ContactEligibility {
  if (status !== "approved") {
    return Object.freeze({
      research: "blocked",
      contactUse: "blocked",
      reasons: Object.freeze(["REVIEW_REQUIRED"] as const),
    });
  }
  const basis = basisReasons(identity, freshness, permittedUse, suppression, asOf);
  return Object.freeze({
    research: basis.researchAllowed ? "allowed" : "blocked",
    contactUse: basis.contactUseAllowed ? "allowed" : "blocked",
    reasons: basis.reasons,
  });
}

function createReview(input: Omit<ContactReviewSnapshot, "reviewVersion" | "eligibility" | "reviewHash"> & Readonly<{
  identity: ContactIdentity;
  freshness: ContactFreshness;
  permittedUse: ContactPermittedUse;
  suppressionDisposition: SuppressionDisposition;
  asOf: string;
}>): ContactReviewSnapshot {
  const { identity, freshness, permittedUse, suppressionDisposition, asOf, ...reviewInput } = input;
  const payload = Object.freeze({
    reviewVersion: 1 as const,
    ...reviewInput,
    eligibility: eligibility(input.status, identity, freshness, permittedUse, suppressionDisposition, asOf),
  });
  return Object.freeze({ ...payload, reviewHash: sha256(payload) });
}

function parseReview(
  value: unknown,
  record: Scope & Readonly<{
    versionId: string;
    contentHash: string;
    createdAt: string;
    identity: ContactIdentity;
    freshness: ContactFreshness;
    permittedUse: ContactPermittedUse;
    suppressionDisposition: SuppressionDisposition;
  }>,
): ContactReviewSnapshot | null {
  const raw = exactRecord(value, REVIEW_FIELDS);
  if (!raw || raw.reviewVersion !== 1 || raw.versionId !== record.versionId || raw.contentHash !== record.contentHash
    || raw.tenantId !== record.tenantId || raw.workspaceId !== record.workspaceId || raw.accountId !== record.accountId) return null;
  const eventsInput = exactArray(raw.events, MAX_EVENTS);
  const eligibilityInput = exactRecord(raw.eligibility, ELIGIBILITY_FIELDS);
  const reviewHash = typeof raw.reviewHash === "string" && HASH.test(raw.reviewHash) ? raw.reviewHash : null;
  if (!eventsInput || !eligibilityInput || !reviewHash) return null;
  const events: ContactReviewEvent[] = [];
  let status: ContactReviewSnapshot["status"] = "draft";
  let lastAt = record.createdAt;
  for (const valueEvent of eventsInput) {
    const event = exactRecord(valueEvent, EVENT_FIELDS);
    const actor = event && exactRecord(event.actor, ACTOR_FIELDS);
    const actorId = actor && typeof actor.actorId === "string" && UUID.test(actor.actorId) ? actor.actorId : null;
    const at = event && timestamp(event.at);
    const reason = event && safeText(event.reason, 2_000);
    const to = event?.to;
    const allowed = (status === "draft" && to === "in_review")
      || (status === "in_review" && (to === "approved" || to === "rejected"));
    if (!event || !actor || actor.kind !== "human" || !actorId || !at || !reason || event.from !== status || !allowed
      || Date.parse(at) <= Date.parse(lastAt)) return null;
    events.push(Object.freeze({
      from: status as "draft" | "in_review",
      to: to as "in_review" | "approved" | "rejected",
      actor: Object.freeze({ kind: "human" as const, actorId }),
      at,
      reason,
    }));
    status = to as ContactReviewSnapshot["status"];
    lastAt = at;
  }
  if (raw.status !== status) return null;
  const parsed = createReview({
    versionId: record.versionId,
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    accountId: record.accountId,
    contentHash: record.contentHash,
    status,
    events: Object.freeze(events),
    identity: record.identity,
    freshness: record.freshness,
    permittedUse: record.permittedUse,
    suppressionDisposition: record.suppressionDisposition,
    asOf: events.at(-1)?.at ?? record.createdAt,
  });
  return parsed.reviewHash === reviewHash && JSON.stringify(parsed.eligibility) === JSON.stringify(eligibilityInput)
    ? parsed : null;
}

function parseContactRecord(value: unknown): ContactRecord | null {
  const raw = exactRecord(value, RECORD_FIELDS);
  if (!raw || raw.schemaVersion !== CONTACT_RECORD_SCHEMA_VERSION) return null;
  const tenantId = typeof raw.tenantId === "string" && UUID.test(raw.tenantId) ? raw.tenantId : null;
  const workspaceId = typeof raw.workspaceId === "string" && UUID.test(raw.workspaceId) ? raw.workspaceId : null;
  const accountId = typeof raw.accountId === "string" && UUID.test(raw.accountId) ? raw.accountId : null;
  const stableKey = reference(raw.stableKey);
  const revision = integer(raw.revision, 1, 1_000_000);
  const supersedesVersionId = raw.supersedesVersionId === null ? null
    : typeof raw.supersedesVersionId === "string" && VERSION_ID.test(raw.supersedesVersionId)
      ? raw.supersedesVersionId : undefined;
  const createdAt = timestamp(raw.createdAt);
  const identity = parseIdentity(raw.identity);
  const sourceReceipt = parseReceipt(raw.sourceReceipt);
  const roleHypothesis = sourceReceipt ? parseRole(raw.roleHypothesis, sourceReceipt.receiptHash) : undefined;
  const freshness = sourceReceipt && parseFreshness(raw.freshness, sourceReceipt);
  const permittedUse = parsePermittedUse(raw.permittedUse);
  const suppressionDisposition = typeof raw.suppressionDisposition === "string"
    && SUPPRESSIONS.has(raw.suppressionDisposition as SuppressionDisposition)
    ? raw.suppressionDisposition as SuppressionDisposition : null;
  const contentHash = typeof raw.contentHash === "string" && HASH.test(raw.contentHash) ? raw.contentHash : null;
  const versionHash = typeof raw.versionHash === "string" && HASH.test(raw.versionHash) ? raw.versionHash : null;
  const versionId = typeof raw.versionId === "string" && VERSION_ID.test(raw.versionId) ? raw.versionId : null;
  if (!tenantId || !workspaceId || !accountId || !stableKey || revision === null || supersedesVersionId === undefined
    || !createdAt || !identity || !sourceReceipt || roleHypothesis === undefined || !freshness || !permittedUse
    || !suppressionDisposition || !contentHash || !versionHash || !versionId
    || versionId !== `contact-version:${versionHash.slice("sha256:".length)}`) return null;
  if (!sameScope({ tenantId, workspaceId, accountId }, sourceReceipt)) return null;
  const content = Object.freeze({
    identity,
    roleHypothesis,
    sourceReceipt,
    freshness,
    permittedUse,
    suppressionDisposition,
  });
  if (sha256(content) !== contentHash || sha256({
    tenantId, workspaceId, accountId, stableKey, revision, supersedesVersionId, createdAt, contentHash,
  }) !== versionHash) return null;
  const base = Object.freeze({
    tenantId, workspaceId, accountId, versionId, contentHash, createdAt, identity, freshness, permittedUse,
    suppressionDisposition,
  });
  const review = parseReview(raw.review, base);
  return review ? Object.freeze({
    schemaVersion: CONTACT_RECORD_SCHEMA_VERSION,
    versionId,
    versionHash,
    tenantId,
    workspaceId,
    accountId,
    stableKey,
    revision,
    supersedesVersionId,
    createdAt,
    ...content,
    contentHash,
    review,
  }) : null;
}

function failure(code: ContactFailureCode): Readonly<{ ok: false; code: ContactFailureCode }> {
  return Object.freeze({ ok: false, code });
}

export function buildContactRecord(value: unknown): ContactRecordResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== CONTACT_RECORD_SCHEMA_VERSION) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const accountId = typeof input.accountId === "string" && UUID.test(input.accountId) ? input.accountId : null;
    const stableKey = reference(input.stableKey);
    const revision = integer(input.revision, 1, 1_000_000);
    const createdAt = timestamp(input.createdAt);
    const identity = parseIdentity(input.identity);
    const sourceReceipt = parseReceipt(input.sourceReceipt);
    const roleHypothesis = sourceReceipt ? parseRole(input.roleHypothesis, sourceReceipt.receiptHash) : undefined;
    const freshness = sourceReceipt && parseFreshness(input.freshness, sourceReceipt);
    const permittedUse = parsePermittedUse(input.permittedUse);
    const suppressionDisposition = typeof input.suppressionDisposition === "string"
      && SUPPRESSIONS.has(input.suppressionDisposition as SuppressionDisposition)
      ? input.suppressionDisposition as SuppressionDisposition : null;
    const predecessorInput = input.predecessor === null ? null : exactRecord(input.predecessor, PREDECESSOR_FIELDS);
    const predecessor = predecessorInput && parseContactRecord(predecessorInput.record);
    if (!tenantId || !workspaceId || !accountId || !stableKey || revision === null || !createdAt || !identity
      || !sourceReceipt || roleHypothesis === undefined || !freshness || !permittedUse || !suppressionDisposition
      || (input.predecessor !== null && (!predecessorInput || !predecessor))) return failure("MALFORMED_INPUT");
    const scope = Object.freeze({ tenantId, workspaceId, accountId });
    if (!sameScope(scope, sourceReceipt)) return failure("SCOPE_MISMATCH");
    if (predecessor && !sameScope(scope, predecessor)) return failure("SCOPE_MISMATCH");
    if ((revision === 1 && predecessor !== null) || (revision > 1 && predecessor === null)) {
      return failure("VERSION_CONFLICT");
    }
    if (predecessor && (predecessorInput?.predecessorVersion !== 1
      || predecessorInput.stableKey !== predecessor.stableKey || predecessorInput.revision !== predecessor.revision
      || predecessorInput.supersedesVersionId !== predecessor.supersedesVersionId
      || predecessor.stableKey !== stableKey || predecessor.revision + 1 !== revision
      || predecessor.review.status !== "approved"
      || Date.parse(createdAt) <= Date.parse(predecessor.review.events.at(-1)?.at ?? predecessor.createdAt))) {
      return failure("VERSION_CONFLICT");
    }
    if (Date.parse(createdAt) <= Date.parse(sourceReceipt.observedAt)) return failure("VERSION_CONFLICT");
    const content = Object.freeze({
      identity,
      roleHypothesis,
      sourceReceipt,
      freshness,
      permittedUse,
      suppressionDisposition,
    });
    const contentHash = sha256(content);
    const supersedesVersionId = predecessor?.versionId ?? null;
    const versionHash = sha256({
      tenantId, workspaceId, accountId, stableKey, revision, supersedesVersionId, createdAt, contentHash,
    });
    const versionId = `contact-version:${versionHash.slice("sha256:".length)}`;
    const review = createReview({
      versionId,
      tenantId,
      workspaceId,
      accountId,
      contentHash,
      status: "draft",
      events: Object.freeze([]),
      identity,
      freshness,
      permittedUse,
      suppressionDisposition,
      asOf: createdAt,
    });
    const record: ContactRecord = Object.freeze({
      schemaVersion: CONTACT_RECORD_SCHEMA_VERSION,
      versionId,
      versionHash,
      tenantId,
      workspaceId,
      accountId,
      stableKey,
      revision,
      supersedesVersionId,
      createdAt,
      ...content,
      contentHash,
      review,
    });
    return Object.freeze({
      ok: true,
      code: predecessor ? "CONTACT_RECORD_VERSION_CREATED" : "CONTACT_RECORD_CREATED",
      record,
    });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

export function transitionContactRecordReview(value: unknown): ContactReviewResult {
  try {
    const input = exactRecord(value, TRANSITION_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const current = parseContactRecord(input.current);
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const accountId = typeof input.accountId === "string" && UUID.test(input.accountId) ? input.accountId : null;
    const actor = exactRecord(input.actor, ACTOR_FIELDS);
    const actorId = actor && typeof actor.actorId === "string" && UUID.test(actor.actorId) ? actor.actorId : null;
    const to = input.to === "in_review" || input.to === "approved" || input.to === "rejected" ? input.to : null;
    const at = timestamp(input.at);
    const reason = safeText(input.reason, 2_000);
    if (!current || !tenantId || !workspaceId || !accountId || !actor || !actorId || !to || !at || !reason
      || typeof input.expectedVersionId !== "string" || !VERSION_ID.test(input.expectedVersionId)
      || typeof input.expectedContentHash !== "string" || !HASH.test(input.expectedContentHash)
      || typeof input.expectedReviewHash !== "string" || !HASH.test(input.expectedReviewHash)) {
      return failure("MALFORMED_INPUT");
    }
    if (!sameScope({ tenantId, workspaceId, accountId }, current)) return failure("SCOPE_MISMATCH");
    if (input.expectedVersionId !== current.versionId || input.expectedContentHash !== current.contentHash
      || input.expectedReviewHash !== current.review.reviewHash) return failure("STALE_VERSION");
    if (actor.kind !== "human") return failure("HUMAN_REVIEW_REQUIRED");
    const allowed = (current.review.status === "draft" && to === "in_review")
      || (current.review.status === "in_review" && (to === "approved" || to === "rejected"));
    const lastAt = current.review.events.at(-1)?.at ?? current.createdAt;
    if (!allowed || Date.parse(at) <= Date.parse(lastAt) || current.review.events.length >= MAX_EVENTS) {
      return failure("INVALID_TRANSITION");
    }
    const event: ContactReviewEvent = Object.freeze({
      from: current.review.status as "draft" | "in_review",
      to,
      actor: Object.freeze({ kind: "human", actorId }),
      at,
      reason,
    });
    const review = createReview({
      versionId: current.versionId,
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      accountId: current.accountId,
      contentHash: current.contentHash,
      status: to,
      events: Object.freeze([...current.review.events, event]),
      identity: current.identity,
      freshness: current.freshness,
      permittedUse: current.permittedUse,
      suppressionDisposition: current.suppressionDisposition,
      asOf: at,
    });
    return Object.freeze({ ok: true, code: "CONTACT_REVIEW_TRANSITIONED", record: Object.freeze({ ...current, review }) });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
