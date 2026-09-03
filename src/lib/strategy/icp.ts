import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { buildBusinessUnderstandingProposal } from "@/lib/understanding/business-understanding";

export const ICP_SCHEMA_VERSION = 1 as const;

export type IcpCriterionDomain =
  | "job"
  | "pain"
  | "positive_signal"
  | "disqualifier"
  | "size_capability"
  | "geography"
  | "channel"
  | "buying_trigger"
  | "economics"
  | "evidence_threshold"
  | "buying_center_role"
  | "custom";

export type IcpReviewStatus = "draft" | "in_review" | "approved" | "rejected" | "superseded";

type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;

export type IcpRationaleReference = Readonly<{
  claimId: string;
  evidenceId: string;
}>;

export type IcpCriterion = Readonly<{
  criterionId: string;
  ruleKey: string;
  domain: IcpCriterionDomain;
  rule: string;
  rationale: string;
  confidenceBasisPoints: number;
  rationaleRefs: readonly IcpRationaleReference[];
}>;

export type IcpUncertainty = Readonly<{
  uncertaintyId: string;
  domain: IcpCriterionDomain;
  statement: string;
  impact: string;
  relatedClaimIds: readonly string[];
}>;

export type IcpUnderstandingBinding = Scope & Readonly<{
  versionId: string;
  contentHash: string;
  claimSetHash: string;
  reviewHash: string;
  authorityHash: string;
  status: "approved";
}>;

export type IcpResolvedAuthority = Scope & Readonly<{
  authorityVersion: 1;
  understandingVersionId: string;
  understandingContentHash: string;
  understandingClaimSetHash: string;
  understandingReviewHash: string;
  claims: readonly Readonly<{ claimId: string; evidenceIds: readonly string[] }>[];
}>;

export type IcpUnderstandingAuthoritySource = Scope & Readonly<{
  authorityVersion: 1;
  understandingVersionId: string;
  understandingContentHash: string;
  understandingClaimSetHash: string;
  understandingReviewHash: string;
  source: unknown;
}>;

export type IcpReviewEvent = Readonly<{
  from: IcpReviewStatus;
  to: Exclude<IcpReviewStatus, "draft">;
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
  replacementVersionId: string | null;
}>;

export type IcpReviewSnapshot = Scope & Readonly<{
  reviewVersion: 1;
  versionId: string;
  contentHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  understandingVersionId: string;
  understandingContentHash: string;
  understandingReviewHash: string;
  createdAt: string;
  status: IcpReviewStatus;
  events: readonly IcpReviewEvent[];
  replacementVersionId: string | null;
  reviewHash: string;
}>;

export type IcpPredecessorDescriptor = Readonly<{
  predecessorVersion: 1;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  review: IcpReviewSnapshot;
}>;

export type IcpReplacementDescriptor = Readonly<{
  replacementVersion: 1;
  supersedesVersionId: string;
  review: IcpReviewSnapshot;
}>;

export type IcpProposal = Scope & Readonly<{
  schemaVersion: typeof ICP_SCHEMA_VERSION;
  versionId: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  status: "review_required";
  contentHash: string;
  createdAt: string;
  understanding: IcpUnderstandingBinding;
  title: string;
  segment: string;
  useCase: string;
  positiveCriteria: readonly IcpCriterion[];
  exclusions: readonly IcpCriterion[];
  uncertainties: readonly IcpUncertainty[];
  review: IcpReviewSnapshot;
}>;

export type IcpProposalFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "UNDERSTANDING_NOT_APPROVED"
  | "STALE_UNDERSTANDING"
  | "VERSION_CONFLICT"
  | "MISSING_RATIONALE_REFERENCE"
  | "DUPLICATE_RULE"
  | "CONTRADICTORY_RULE"
  | "UNSAFE_CRITERION";

export type IcpProposalResult =
  | Readonly<{ ok: true; code: "ICP_PROPOSAL_CREATED"; proposal: IcpProposal }>
  | Readonly<{ ok: false; code: IcpProposalFailureCode }>;

export type IcpReviewResult =
  | Readonly<{ ok: true; code: "ICP_REVIEW_TRANSITIONED"; review: IcpReviewSnapshot }>
  | Readonly<{
    ok: false;
    code: "MALFORMED_INPUT" | "SCOPE_MISMATCH" | "STALE_VERSION" | "INVALID_TRANSITION" | "HUMAN_REVIEW_REQUIRED";
  }>;

type PlainRecord = Record<string, unknown>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "stableKey", "revision", "predecessor", "createdAt",
  "understanding", "title", "segment", "useCase", "positiveCriteria", "exclusions", "uncertainties",
] as const;
const UNDERSTANDING_BINDING_FIELDS = [
  "tenantId", "workspaceId", "versionId", "contentHash", "claimSetHash", "reviewHash", "snapshot", "authority",
] as const;
const AUTHORITY_FIELDS = [
  "authorityVersion", "tenantId", "workspaceId", "understandingVersionId", "understandingContentHash",
  "understandingClaimSetHash", "understandingReviewHash", "source",
] as const;
const UNDERSTANDING_REVIEW_FIELDS = [
  "reviewVersion", "versionId", "proposalRef", "revision", "supersedesProposalRef", "tenantId", "workspaceId",
  "contentHash", "claimSetHash", "supersedesVersionId", "createdAt",
  "status", "events", "replacementVersionId", "reviewHash",
] as const;
const UNDERSTANDING_EVENT_FIELDS = ["from", "to", "actor", "at", "reason", "replacementVersionId"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const CRITERION_FIELDS = [
  "criterionId", "ruleKey", "domain", "rule", "rationale", "confidenceBasisPoints", "rationaleRefs",
] as const;
const RATIONALE_REF_FIELDS = ["claimId", "evidenceId"] as const;
const UNCERTAINTY_FIELDS = ["uncertaintyId", "domain", "statement", "impact", "relatedClaimIds"] as const;
const ICP_REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "contentHash", "stableKey", "revision",
  "supersedesVersionId", "understandingVersionId",
  "understandingContentHash", "understandingReviewHash", "createdAt", "status", "events",
  "replacementVersionId", "reviewHash",
] as const;
const ICP_EVENT_FIELDS = ["from", "to", "actor", "at", "reason", "replacementVersionId"] as const;
const REVIEW_TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "current", "expectedVersionId", "expectedContentHash",
  "expectedReviewHash", "to", "actor", "at", "reason", "replacement",
] as const;
const PREDECESSOR_FIELDS = [
  "predecessorVersion", "stableKey", "revision", "supersedesVersionId", "review",
] as const;
const REPLACEMENT_FIELDS = ["replacementVersion", "supersedesVersionId", "review"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UNDERSTANDING_VERSION_ID = /^understanding-version:[a-f0-9]{64}$/u;
const ICP_VERSION_ID = /^icp-version:[a-f0-9]{64}$/u;
const SECRET = /(?:authorization\s*:\s*bearer\s+\S+|\bsk-[A-Za-z0-9_-]{20,}\b|(?:api[_ -]?key|password|passwd|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+)/iu;
const PROTECTED_TARGETING = /\b(?:race|racial|ethnicity|ethnic|religion|religious|disability|sexual orientation|gender identity|genetic information)\b/iu;
const UNSAFE_LINK_OR_MARKUP = /(?:https?:\/\/|www\.|[<>])/iu;
const DOMAINS = new Set<IcpCriterionDomain>([
  "job", "pain", "positive_signal", "disqualifier", "size_capability", "geography", "channel",
  "buying_trigger", "economics", "evidence_threshold", "buying_center_role", "custom",
]);
const REVIEW_STATUSES = new Set<IcpReviewStatus>(["draft", "in_review", "approved", "rejected", "superseded"]);
const UNDERSTANDING_REVIEW_STATUSES = new Set(["draft", "in_review", "approved", "rejected", "superseded"] as const);
const MAX_RULES = 32;
const MAX_UNCERTAINTIES = 32;
const MAX_REFERENCES = 16;
const MAX_REVIEW_EVENTS = 100;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== fields.length
      || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
    const result: PlainRecord = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result[field] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  if (typeof value !== "object" || value === null || isProxy(value) || !Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum
      || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function validUnicode(value: string): boolean {
  if (/[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function boundedText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value === value.trim() && validUnicode(value) ? value : null;
}

function reference(value: unknown): string | null {
  return typeof value === "string" && REF.test(value) ? value : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function workspace(value: unknown): string | null | undefined {
  return value === null ? null : uuid(value) ?? undefined;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value : null;
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>): T | null {
  return typeof value === "string" && values.has(value as T) ? value as T : null;
}

function timestamp(value: unknown): string | null {
  const parsed = boundedText(value, 40);
  if (!parsed) return null;
  const epoch = Date.parse(parsed);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === parsed ? parsed : null;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId;
}

function allowedReviewTransition(from: IcpReviewStatus, to: IcpReviewStatus): boolean {
  return (from === "draft" && to === "in_review")
    || (from === "in_review" && (to === "approved" || to === "rejected"))
    || (from === "approved" && to === "superseded");
}

function unsafeCriterionText(value: string): boolean {
  const securityView = value.normalize("NFKC");
  return SECRET.test(securityView) || PROTECTED_TARGETING.test(securityView) || UNSAFE_LINK_OR_MARKUP.test(securityView);
}

function canonicalText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ");
}

type ParsedUnderstandingReview = Scope & Readonly<{
  versionId: string;
  proposalRef: string;
  revision: number;
  supersedesProposalRef: string | null;
  contentHash: string;
  claimSetHash: string;
  supersedesVersionId: string | null;
  createdAt: string;
  status: "draft" | "in_review" | "approved" | "rejected" | "superseded";
  reviewHash: string;
  lastEventAt: string;
}>;

function parseUnderstandingReviewEvent(
  value: unknown,
  versionId: string,
): Readonly<{
  from: ParsedUnderstandingReview["status"];
  to: Exclude<ParsedUnderstandingReview["status"], "draft">;
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
  replacementVersionId: string | null;
}> | null {
  const record = exactRecord(value, UNDERSTANDING_EVENT_FIELDS);
  const actor = record && exactRecord(record.actor, ACTOR_FIELDS);
  if (!record || !actor || actor.kind !== "human") return null;
  const from = enumValue(record.from, UNDERSTANDING_REVIEW_STATUSES);
  const to = enumValue(record.to, UNDERSTANDING_REVIEW_STATUSES);
  const actorId = uuid(actor.actorId);
  const at = timestamp(record.at);
  const reason = boundedText(record.reason, 2_000);
  const replacementVersionId = record.replacementVersionId === null
    ? null
    : typeof record.replacementVersionId === "string" && UNDERSTANDING_VERSION_ID.test(record.replacementVersionId)
      ? record.replacementVersionId : undefined;
  if (!from || !to || to === "draft" || !actorId || !at || !reason || replacementVersionId === undefined
    || !allowedReviewTransition(from, to)
    || (to === "superseded" && (!replacementVersionId || replacementVersionId === versionId))
    || (to !== "superseded" && replacementVersionId !== null)) return null;
  return Object.freeze({
    from,
    to,
    actor: Object.freeze({ kind: "human" as const, actorId }),
    at,
    reason,
    replacementVersionId,
  });
}

function parseUnderstandingReview(value: unknown): ParsedUnderstandingReview | null {
  const record = exactRecord(value, UNDERSTANDING_REVIEW_FIELDS);
  const tenantId = record && uuid(record.tenantId);
  const workspaceId = record && workspace(record.workspaceId);
  const versionId = record && typeof record.versionId === "string" && UNDERSTANDING_VERSION_ID.test(record.versionId)
    ? record.versionId : null;
  const proposalRef = record && reference(record.proposalRef);
  const revision = record && integer(record.revision, 1, 1_000_000);
  const supersedesProposalRef = record?.supersedesProposalRef === null
    ? null
    : record && reference(record.supersedesProposalRef);
  const contentHash = record && typeof record.contentHash === "string" && HASH.test(record.contentHash)
    ? record.contentHash : null;
  const claimSetHash = record && typeof record.claimSetHash === "string" && HASH.test(record.claimSetHash)
    ? record.claimSetHash : null;
  const supersedesVersionId = record?.supersedesVersionId === null
    ? null
    : record && typeof record.supersedesVersionId === "string" && UNDERSTANDING_VERSION_ID.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const createdAt = record && timestamp(record.createdAt);
  const events = record && exactArray(record.events, MAX_REVIEW_EVENTS);
  const suppliedStatus = record && enumValue(record.status, UNDERSTANDING_REVIEW_STATUSES);
  if (!record || record.reviewVersion !== 1 || !tenantId || workspaceId === undefined || !versionId
    || !proposalRef || revision === null || supersedesProposalRef === undefined
    || !contentHash || versionId !== `understanding-version:${contentHash.slice("sha256:".length)}`
    || !claimSetHash || supersedesVersionId === undefined || !createdAt || !events || !suppliedStatus
    || typeof record.reviewHash !== "string" || !HASH.test(record.reviewHash)) return null;
  if ((revision === 1 && (supersedesProposalRef !== null || supersedesVersionId !== null))
    || (revision > 1 && (supersedesProposalRef === null || supersedesVersionId === null))
    || supersedesProposalRef === proposalRef || supersedesVersionId === versionId) return null;

  const parsedEvents: NonNullable<ReturnType<typeof parseUnderstandingReviewEvent>>[] = [];
  let status: ParsedUnderstandingReview["status"] = "draft";
  let lastEventAt = createdAt;
  let replacementVersionId: string | null = null;
  for (const rawEvent of events) {
    const event = parseUnderstandingReviewEvent(rawEvent, versionId);
    if (!event || event.from !== status || Date.parse(event.at) <= Date.parse(lastEventAt)) return null;
    status = event.to;
    lastEventAt = event.at;
    replacementVersionId = event.replacementVersionId;
    parsedEvents.push(event);
  }
  if (status !== suppliedStatus || record.replacementVersionId !== replacementVersionId) return null;
  const payload = Object.freeze({
    reviewVersion: 1 as const,
    versionId,
    proposalRef,
    revision,
    supersedesProposalRef,
    tenantId,
    workspaceId,
    contentHash,
    claimSetHash,
    supersedesVersionId,
    createdAt,
    status,
    events: Object.freeze(parsedEvents),
    replacementVersionId,
  });
  if (sha256(payload) !== record.reviewHash) return null;
  return Object.freeze({
    tenantId,
    workspaceId,
    versionId,
    proposalRef,
    revision,
    supersedesProposalRef,
    contentHash,
    claimSetHash,
    supersedesVersionId,
    createdAt,
    status,
    reviewHash: record.reviewHash,
    lastEventAt,
  });
}

function proposalFailure(code: IcpProposalFailureCode): IcpProposalResult {
  return Object.freeze({ ok: false, code });
}

type ParsedAuthority = Readonly<{
  value: IcpResolvedAuthority;
  hash: string;
  claimEvidence: ReadonlyMap<string, ReadonlySet<string>>;
}>;

function parseResolvedAuthority(value: unknown): ParsedAuthority | null {
  const record = exactRecord(value, AUTHORITY_FIELDS);
  const tenantId = record && uuid(record.tenantId);
  const workspaceId = record && workspace(record.workspaceId);
  const versionId = record && typeof record.understandingVersionId === "string"
    && UNDERSTANDING_VERSION_ID.test(record.understandingVersionId) ? record.understandingVersionId : null;
  const contentHash = record && typeof record.understandingContentHash === "string"
    && HASH.test(record.understandingContentHash) ? record.understandingContentHash : null;
  const claimSetHash = record && typeof record.understandingClaimSetHash === "string"
    && HASH.test(record.understandingClaimSetHash) ? record.understandingClaimSetHash : null;
  const reviewHash = record && typeof record.understandingReviewHash === "string"
    && HASH.test(record.understandingReviewHash) ? record.understandingReviewHash : null;
  if (!record || record.authorityVersion !== 1 || !tenantId || workspaceId === undefined || !versionId
    || !contentHash || !claimSetHash || !reviewHash) return null;

  const rebuilt = buildBusinessUnderstandingProposal(record.source);
  if (!rebuilt.ok || rebuilt.proposal.tenantId !== tenantId || rebuilt.proposal.workspaceId !== workspaceId
    || rebuilt.proposal.versionId !== versionId || rebuilt.proposal.contentHash !== contentHash
    || rebuilt.proposal.claimSetHash !== claimSetHash) return null;

  const claims: Array<Readonly<{ claimId: string; evidenceIds: readonly string[] }>> = [];
  const claimEvidence = new Map<string, ReadonlySet<string>>();
  for (const domain of rebuilt.proposal.domains) {
    for (const fact of domain.facts) {
      if (claimEvidence.has(fact.claimId)) return null;
      const evidenceIds = fact.citations.map((citation) => citation.evidenceId).sort(compareAscii);
      const frozenEvidence = Object.freeze(evidenceIds);
      claims.push(Object.freeze({ claimId: fact.claimId, evidenceIds: frozenEvidence }));
      claimEvidence.set(fact.claimId, new Set(frozenEvidence));
    }
  }
  for (const uncertainty of rebuilt.proposal.uncertainties) {
    if (claimEvidence.has(uncertainty.claimId)) return null;
    const evidenceIds = Object.freeze([] as string[]);
    claims.push(Object.freeze({ claimId: uncertainty.claimId, evidenceIds }));
    claimEvidence.set(uncertainty.claimId, new Set());
  }
  claims.sort((left, right) => compareAscii(left.claimId, right.claimId));
  const authority: IcpResolvedAuthority = Object.freeze({
    authorityVersion: 1,
    tenantId,
    workspaceId,
    understandingVersionId: versionId,
    understandingContentHash: contentHash,
    understandingClaimSetHash: claimSetHash,
    understandingReviewHash: reviewHash,
    claims: Object.freeze(claims),
  });
  return Object.freeze({ value: authority, hash: sha256(authority), claimEvidence });
}

function authorityResolves(
  authority: ParsedAuthority,
  referenceValue: IcpRationaleReference,
): boolean {
  return authority.claimEvidence.get(referenceValue.claimId)?.has(referenceValue.evidenceId) === true;
}

type CriterionParseResult =
  | Readonly<{ ok: true; value: IcpCriterion }>
  | Readonly<{ ok: false; code: "MALFORMED_INPUT" | "MISSING_RATIONALE_REFERENCE" | "DUPLICATE_RULE" | "UNSAFE_CRITERION" }>;

function parseRationaleReferences(value: unknown):
Readonly<{ ok: true; value: readonly IcpRationaleReference[] }>
| Readonly<{ ok: false; code: "MALFORMED_INPUT" | "MISSING_RATIONALE_REFERENCE" | "DUPLICATE_RULE" }> {
  const raw = exactArray(value, MAX_REFERENCES);
  if (!raw) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  if (raw.length === 0) return Object.freeze({ ok: false, code: "MISSING_RATIONALE_REFERENCE" });
  const references: IcpRationaleReference[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const record = exactRecord(item, RATIONALE_REF_FIELDS);
    const claimId = record && reference(record.claimId);
    const evidenceId = record && reference(record.evidenceId);
    if (!record || !claimId || !evidenceId) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
    const key = `${claimId}\u0000${evidenceId}`;
    if (seen.has(key)) return Object.freeze({ ok: false, code: "DUPLICATE_RULE" });
    seen.add(key);
    references.push(Object.freeze({ claimId, evidenceId }));
  }
  references.sort((left, right) => compareAscii(left.claimId, right.claimId)
    || compareAscii(left.evidenceId, right.evidenceId));
  return Object.freeze({ ok: true, value: Object.freeze(references) });
}

function parseCriterion(value: unknown): CriterionParseResult {
  const record = exactRecord(value, CRITERION_FIELDS);
  if (!record) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  const criterionId = reference(record.criterionId);
  const ruleKey = reference(record.ruleKey);
  const domain = enumValue(record.domain, DOMAINS);
  const rule = boundedText(record.rule, 2_000);
  const rationale = boundedText(record.rationale, 2_000);
  const confidenceBasisPoints = integer(record.confidenceBasisPoints, 0, 10_000);
  const rationaleRefs = parseRationaleReferences(record.rationaleRefs);
  if (!criterionId || !ruleKey || !domain || !rule || !rationale || confidenceBasisPoints === null) {
    return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  }
  if (unsafeCriterionText(rule) || unsafeCriterionText(rationale)) {
    return Object.freeze({ ok: false, code: "UNSAFE_CRITERION" });
  }
  if (!rationaleRefs.ok) return rationaleRefs;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      criterionId,
      ruleKey,
      domain,
      rule,
      rationale,
      confidenceBasisPoints,
      rationaleRefs: rationaleRefs.value,
    }),
  });
}

type UncertaintyParseResult =
  | Readonly<{ ok: true; value: IcpUncertainty }>
  | Readonly<{ ok: false; code: "MALFORMED_INPUT" | "MISSING_RATIONALE_REFERENCE" | "DUPLICATE_RULE" | "UNSAFE_CRITERION" }>;

function parseUncertainty(value: unknown): UncertaintyParseResult {
  const record = exactRecord(value, UNCERTAINTY_FIELDS);
  if (!record) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  const uncertaintyId = reference(record.uncertaintyId);
  const domain = enumValue(record.domain, DOMAINS);
  const statement = boundedText(record.statement, 2_000);
  const impact = boundedText(record.impact, 2_000);
  const rawClaims = exactArray(record.relatedClaimIds, MAX_REFERENCES);
  if (!uncertaintyId || !domain || !statement || !impact || !rawClaims) {
    return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  }
  if (unsafeCriterionText(statement) || unsafeCriterionText(impact)) {
    return Object.freeze({ ok: false, code: "UNSAFE_CRITERION" });
  }
  if (rawClaims.length === 0) return Object.freeze({ ok: false, code: "MISSING_RATIONALE_REFERENCE" });
  const relatedClaimIds: string[] = [];
  const seen = new Set<string>();
  for (const value of rawClaims) {
    const claimId = reference(value);
    if (!claimId) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
    if (seen.has(claimId)) return Object.freeze({ ok: false, code: "DUPLICATE_RULE" });
    seen.add(claimId);
    relatedClaimIds.push(claimId);
  }
  relatedClaimIds.sort(compareAscii);
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      uncertaintyId,
      domain,
      statement,
      impact,
      relatedClaimIds: Object.freeze(relatedClaimIds),
    }),
  });
}

function icpReviewPayload(input: Readonly<{
  versionId: string;
  tenantId: string;
  workspaceId: string | null;
  contentHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  understandingVersionId: string;
  understandingContentHash: string;
  understandingReviewHash: string;
  createdAt: string;
  status: IcpReviewStatus;
  events: readonly IcpReviewEvent[];
  replacementVersionId: string | null;
}>): Omit<IcpReviewSnapshot, "reviewHash"> {
  return Object.freeze({
    reviewVersion: 1 as const,
    versionId: input.versionId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    contentHash: input.contentHash,
    stableKey: input.stableKey,
    revision: input.revision,
    supersedesVersionId: input.supersedesVersionId,
    understandingVersionId: input.understandingVersionId,
    understandingContentHash: input.understandingContentHash,
    understandingReviewHash: input.understandingReviewHash,
    createdAt: input.createdAt,
    status: input.status,
    events: input.events,
    replacementVersionId: input.replacementVersionId,
  });
}

function createIcpReviewSnapshot(input: Parameters<typeof icpReviewPayload>[0]): IcpReviewSnapshot {
  const payload = icpReviewPayload(input);
  return Object.freeze({ ...payload, reviewHash: sha256(payload) });
}

function parseIcpReviewEvent(value: unknown, versionId: string): IcpReviewEvent | null {
  const record = exactRecord(value, ICP_EVENT_FIELDS);
  const actor = record && exactRecord(record.actor, ACTOR_FIELDS);
  if (!record || !actor || actor.kind !== "human") return null;
  const from = enumValue(record.from, REVIEW_STATUSES);
  const to = enumValue(record.to, REVIEW_STATUSES);
  const actorId = uuid(actor.actorId);
  const at = timestamp(record.at);
  const reason = boundedText(record.reason, 2_000);
  const replacementVersionId = record.replacementVersionId === null
    ? null
    : typeof record.replacementVersionId === "string" && ICP_VERSION_ID.test(record.replacementVersionId)
      ? record.replacementVersionId : undefined;
  if (!from || !to || to === "draft" || !actorId || !at || !reason || replacementVersionId === undefined
    || !allowedReviewTransition(from, to)
    || (to === "superseded" && (!replacementVersionId || replacementVersionId === versionId))
    || (to !== "superseded" && replacementVersionId !== null)) return null;
  return Object.freeze({
    from,
    to,
    actor: Object.freeze({ kind: "human" as const, actorId }),
    at,
    reason,
    replacementVersionId,
  });
}

function parseIcpReview(value: unknown): IcpReviewSnapshot | null {
  const record = exactRecord(value, ICP_REVIEW_FIELDS);
  const tenantId = record && uuid(record.tenantId);
  const workspaceId = record && workspace(record.workspaceId);
  const versionId = record && typeof record.versionId === "string" && ICP_VERSION_ID.test(record.versionId)
    ? record.versionId : null;
  const contentHash = record && typeof record.contentHash === "string" && HASH.test(record.contentHash)
    ? record.contentHash : null;
  const stableKey = record && reference(record.stableKey);
  const revision = record && integer(record.revision, 1, 1_000_000);
  const supersedesVersionId = record?.supersedesVersionId === null
    ? null
    : record && typeof record.supersedesVersionId === "string" && ICP_VERSION_ID.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const understandingVersionId = record && typeof record.understandingVersionId === "string"
    && UNDERSTANDING_VERSION_ID.test(record.understandingVersionId) ? record.understandingVersionId : null;
  const understandingContentHash = record && typeof record.understandingContentHash === "string"
    && HASH.test(record.understandingContentHash) ? record.understandingContentHash : null;
  const understandingReviewHash = record && typeof record.understandingReviewHash === "string"
    && HASH.test(record.understandingReviewHash) ? record.understandingReviewHash : null;
  const createdAt = record && timestamp(record.createdAt);
  const events = record && exactArray(record.events, MAX_REVIEW_EVENTS);
  const suppliedStatus = record && enumValue(record.status, REVIEW_STATUSES);
  if (!record || record.reviewVersion !== 1 || !tenantId || workspaceId === undefined || !versionId
    || !contentHash || versionId !== `icp-version:${contentHash.slice("sha256:".length)}`
    || !stableKey || revision === null || supersedesVersionId === undefined
    || (revision === 1 ? supersedesVersionId !== null : supersedesVersionId === null)
    || !understandingVersionId || !understandingContentHash || !understandingReviewHash
    || !createdAt || !events || !suppliedStatus
    || typeof record.reviewHash !== "string" || !HASH.test(record.reviewHash)) return null;

  const parsedEvents: IcpReviewEvent[] = [];
  let status: IcpReviewStatus = "draft";
  let lastAt = createdAt;
  let replacementVersionId: string | null = null;
  for (const rawEvent of events) {
    const event = parseIcpReviewEvent(rawEvent, versionId);
    if (!event || event.from !== status || Date.parse(event.at) <= Date.parse(lastAt)) return null;
    status = event.to;
    lastAt = event.at;
    replacementVersionId = event.replacementVersionId;
    parsedEvents.push(event);
  }
  if (status !== suppliedStatus || record.replacementVersionId !== replacementVersionId) return null;
  const canonical = createIcpReviewSnapshot({
    versionId,
    tenantId,
    workspaceId,
    contentHash,
    stableKey,
    revision,
    supersedesVersionId,
    understandingVersionId,
    understandingContentHash,
    understandingReviewHash,
    createdAt,
    status,
    events: Object.freeze(parsedEvents),
    replacementVersionId,
  });
  return canonical.reviewHash === record.reviewHash ? canonical : null;
}

function reviewFailure(code: Exclude<IcpReviewResult, { ok: true }>["code"]): IcpReviewResult {
  return Object.freeze({ ok: false, code });
}

function parsePredecessorDescriptor(value: unknown): IcpPredecessorDescriptor | null {
  const record = exactRecord(value, PREDECESSOR_FIELDS);
  const stableKey = record && reference(record.stableKey);
  const revision = record && integer(record.revision, 1, 999_999);
  const supersedesVersionId = record?.supersedesVersionId === null
    ? null
    : record && typeof record.supersedesVersionId === "string" && ICP_VERSION_ID.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const review = record && parseIcpReview(record.review);
  if (!record || record.predecessorVersion !== 1 || !stableKey || revision === null
    || supersedesVersionId === undefined || !review || review.status !== "approved"
    || stableKey !== review.stableKey || revision !== review.revision
    || supersedesVersionId !== review.supersedesVersionId) return null;
  return Object.freeze({ predecessorVersion: 1, stableKey, revision, supersedesVersionId, review });
}

function parseReplacementDescriptor(value: unknown): IcpReplacementDescriptor | null {
  const record = exactRecord(value, REPLACEMENT_FIELDS);
  const supersedesVersionId = record && typeof record.supersedesVersionId === "string"
    && ICP_VERSION_ID.test(record.supersedesVersionId) ? record.supersedesVersionId : null;
  const review = record && parseIcpReview(record.review);
  if (!record || record.replacementVersion !== 1 || !supersedesVersionId || !review) return null;
  return Object.freeze({ replacementVersion: 1, supersedesVersionId, review });
}

/**
 * Pure canonical builder. The caller still owns repository existence and
 * authenticity for supplied snapshots and producer input. This boundary
 * rebuilds that input and only accepts its claim/evidence graph when the
 * resulting version, content, and claim-set hashes match the approved review.
 */
export function buildIcpProposal(value: unknown): IcpProposalResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== ICP_SCHEMA_VERSION) return proposalFailure("MALFORMED_INPUT");
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const stableKey = reference(input.stableKey);
    const revision = integer(input.revision, 1, 1_000_000);
    const predecessor = input.predecessor === null ? null : parsePredecessorDescriptor(input.predecessor);
    const createdAt = timestamp(input.createdAt);
    const title = boundedText(input.title, 500);
    const segment = boundedText(input.segment, 2_000);
    const useCase = boundedText(input.useCase, 2_000);
    const understandingInput = exactRecord(input.understanding, UNDERSTANDING_BINDING_FIELDS);
    const understanding = understandingInput && parseUnderstandingReview(understandingInput.snapshot);
    const authority = understandingInput && parseResolvedAuthority(understandingInput.authority);
    const rawPositive = exactArray(input.positiveCriteria, MAX_RULES);
    const rawExclusions = exactArray(input.exclusions, MAX_RULES);
    const rawUncertainties = exactArray(input.uncertainties, MAX_UNCERTAINTIES);
    if (!tenantId || workspaceId === undefined || !stableKey || revision === null
      || (input.predecessor !== null && !predecessor) || !createdAt || !title || !segment || !useCase
      || !understandingInput || !understanding || !authority || !rawPositive?.length || !rawExclusions?.length
      || !rawUncertainties) return proposalFailure("MALFORMED_INPUT");
    if (unsafeCriterionText(title) || unsafeCriterionText(segment) || unsafeCriterionText(useCase)) {
      return proposalFailure("UNSAFE_CRITERION");
    }
    if ((revision === 1 && predecessor !== null) || (revision > 1 && predecessor === null)) {
      return proposalFailure("VERSION_CONFLICT");
    }

    const scope = Object.freeze({ tenantId, workspaceId });
    const bindingTenantId = uuid(understandingInput.tenantId);
    const bindingWorkspaceId = workspace(understandingInput.workspaceId);
    if (!bindingTenantId || bindingWorkspaceId === undefined
      || !sameScope(scope, { tenantId: bindingTenantId, workspaceId: bindingWorkspaceId })
      || !sameScope(scope, understanding)) return proposalFailure("SCOPE_MISMATCH");
    if (!sameScope(scope, authority.value)) return proposalFailure("SCOPE_MISMATCH");
    if (understandingInput.versionId !== understanding.versionId
      || understandingInput.contentHash !== understanding.contentHash
      || understandingInput.claimSetHash !== understanding.claimSetHash
      || understandingInput.reviewHash !== understanding.reviewHash) return proposalFailure("STALE_UNDERSTANDING");
    if (authority.value.understandingVersionId !== understanding.versionId
      || authority.value.understandingContentHash !== understanding.contentHash
      || authority.value.understandingClaimSetHash !== understanding.claimSetHash
      || authority.value.understandingReviewHash !== understanding.reviewHash) {
      return proposalFailure("STALE_UNDERSTANDING");
    }
    if (understanding.status !== "approved") return proposalFailure("UNDERSTANDING_NOT_APPROVED");
    if (Date.parse(createdAt) <= Date.parse(understanding.lastEventAt)) return proposalFailure("STALE_UNDERSTANDING");
    if (predecessor && (!sameScope(scope, predecessor.review)
      || predecessor.stableKey !== stableKey
      || predecessor.revision + 1 !== revision
      || Date.parse(createdAt) <= Date.parse(predecessor.review.events.at(-1)?.at ?? predecessor.review.createdAt))) {
      return proposalFailure("VERSION_CONFLICT");
    }
    const supersedesVersionId = predecessor?.review.versionId ?? null;

    const positiveCriteria: IcpCriterion[] = [];
    const exclusions: IcpCriterion[] = [];
    const criterionIds = new Set<string>();
    const positiveRuleKeys = new Set<string>();
    const exclusionRuleKeys = new Set<string>();
    const positiveFingerprints = new Set<string>();
    const positiveText = new Set<string>();
    const exclusionFingerprints = new Set<string>();
    const exclusionText = new Set<string>();
    for (const raw of rawPositive) {
      const parsed = parseCriterion(raw);
      if (!parsed.ok) return proposalFailure(parsed.code);
      const textFingerprint = canonicalText(parsed.value.rule);
      const ruleFingerprint = `${parsed.value.domain}\u0000${textFingerprint}`;
      if (criterionIds.has(parsed.value.criterionId) || positiveRuleKeys.has(parsed.value.ruleKey)
        || positiveFingerprints.has(ruleFingerprint) || positiveText.has(textFingerprint)) {
        return proposalFailure("DUPLICATE_RULE");
      }
      if (parsed.value.rationaleRefs.some((item) => !authorityResolves(authority, item))) {
        return proposalFailure("MISSING_RATIONALE_REFERENCE");
      }
      criterionIds.add(parsed.value.criterionId);
      positiveRuleKeys.add(parsed.value.ruleKey);
      positiveFingerprints.add(ruleFingerprint);
      positiveText.add(textFingerprint);
      positiveCriteria.push(parsed.value);
    }
    for (const raw of rawExclusions) {
      const parsed = parseCriterion(raw);
      if (!parsed.ok) return proposalFailure(parsed.code);
      const textFingerprint = canonicalText(parsed.value.rule);
      const ruleFingerprint = `${parsed.value.domain}\u0000${textFingerprint}`;
      if (criterionIds.has(parsed.value.criterionId) || exclusionRuleKeys.has(parsed.value.ruleKey)
        || exclusionFingerprints.has(ruleFingerprint) || exclusionText.has(textFingerprint)) {
        return proposalFailure("DUPLICATE_RULE");
      }
      if (positiveRuleKeys.has(parsed.value.ruleKey) || positiveFingerprints.has(ruleFingerprint)
        || positiveText.has(textFingerprint)) return proposalFailure("CONTRADICTORY_RULE");
      if (parsed.value.rationaleRefs.some((item) => !authorityResolves(authority, item))) {
        return proposalFailure("MISSING_RATIONALE_REFERENCE");
      }
      criterionIds.add(parsed.value.criterionId);
      exclusionRuleKeys.add(parsed.value.ruleKey);
      exclusionFingerprints.add(ruleFingerprint);
      exclusionText.add(textFingerprint);
      exclusions.push(parsed.value);
    }
    positiveCriteria.sort((left, right) => compareAscii(left.ruleKey, right.ruleKey)
      || compareAscii(left.criterionId, right.criterionId));
    exclusions.sort((left, right) => compareAscii(left.ruleKey, right.ruleKey)
      || compareAscii(left.criterionId, right.criterionId));

    const uncertainties: IcpUncertainty[] = [];
    const uncertaintyIds = new Set<string>();
    for (const raw of rawUncertainties) {
      const parsed = parseUncertainty(raw);
      if (!parsed.ok) return proposalFailure(parsed.code);
      if (uncertaintyIds.has(parsed.value.uncertaintyId)
        || criterionIds.has(parsed.value.uncertaintyId)) return proposalFailure("DUPLICATE_RULE");
      if (parsed.value.relatedClaimIds.some((claimId) => !authority.claimEvidence.has(claimId))) {
        return proposalFailure("MISSING_RATIONALE_REFERENCE");
      }
      uncertaintyIds.add(parsed.value.uncertaintyId);
      uncertainties.push(parsed.value);
    }
    uncertainties.sort((left, right) => compareAscii(left.uncertaintyId, right.uncertaintyId));

    const approvedUnderstanding: IcpUnderstandingBinding = Object.freeze({
      tenantId: understanding.tenantId,
      workspaceId: understanding.workspaceId,
      versionId: understanding.versionId,
      contentHash: understanding.contentHash,
      claimSetHash: understanding.claimSetHash,
      reviewHash: understanding.reviewHash,
      authorityHash: authority.hash,
      status: "approved" as const,
    });
    const content = Object.freeze({
      schemaVersion: ICP_SCHEMA_VERSION,
      stableKey,
      tenantId,
      workspaceId,
      revision,
      supersedesVersionId,
      status: "review_required" as const,
      createdAt,
      understanding: approvedUnderstanding,
      title,
      segment,
      useCase,
      positiveCriteria: Object.freeze(positiveCriteria),
      exclusions: Object.freeze(exclusions),
      uncertainties: Object.freeze(uncertainties),
    });
    const contentHash = sha256(content);
    const versionId = `icp-version:${contentHash.slice("sha256:".length)}`;
    const review = createIcpReviewSnapshot({
      versionId,
      tenantId,
      workspaceId,
      contentHash,
      stableKey,
      revision,
      supersedesVersionId,
      understandingVersionId: understanding.versionId,
      understandingContentHash: understanding.contentHash,
      understandingReviewHash: understanding.reviewHash,
      createdAt,
      status: "draft",
      events: Object.freeze([]),
      replacementVersionId: null,
    });
    const proposal: IcpProposal = Object.freeze({ ...content, versionId, contentHash, review });
    return Object.freeze({ ok: true, code: "ICP_PROPOSAL_CREATED", proposal });
  } catch {
    return proposalFailure("MALFORMED_INPUT");
  }
}

/**
 * Pure lifecycle transition. A caller service still owns role authorization,
 * separation of duty, audit persistence, repository existence checks for
 * supplied descriptors, and the one-current-version rule.
 */
export function transitionIcpReview(value: unknown): IcpReviewResult {
  try {
    const input = exactRecord(value, REVIEW_TRANSITION_FIELDS);
    if (!input || input.version !== 1) return reviewFailure("MALFORMED_INPUT");
    const current = parseIcpReview(input.current);
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const actor = exactRecord(input.actor, ACTOR_FIELDS);
    const actorId = actor && uuid(actor.actorId);
    const to = enumValue(input.to, REVIEW_STATUSES);
    const at = timestamp(input.at);
    const reason = boundedText(input.reason, 2_000);
    const replacement = input.replacement === null ? null : parseReplacementDescriptor(input.replacement);
    if (!current || !tenantId || workspaceId === undefined || !actor || !actorId || !to || to === "draft"
      || !at || !reason || (input.replacement !== null && !replacement)
      || typeof input.expectedVersionId !== "string" || !ICP_VERSION_ID.test(input.expectedVersionId)
      || typeof input.expectedContentHash !== "string" || !HASH.test(input.expectedContentHash)
      || typeof input.expectedReviewHash !== "string" || !HASH.test(input.expectedReviewHash)) {
      return reviewFailure("MALFORMED_INPUT");
    }
    if (!sameScope({ tenantId, workspaceId }, current)) return reviewFailure("SCOPE_MISMATCH");
    if (input.expectedVersionId !== current.versionId || input.expectedContentHash !== current.contentHash
      || input.expectedReviewHash !== current.reviewHash) return reviewFailure("STALE_VERSION");
    if (actor.kind !== "human") return reviewFailure("HUMAN_REVIEW_REQUIRED");
    if (replacement && !sameScope(current, replacement.review)) return reviewFailure("SCOPE_MISMATCH");
    const currentLastAt = current.events.at(-1)?.at ?? current.createdAt;
    const replacementLastAt = replacement?.review.events.at(-1)?.at ?? null;
    const validReplacement = replacement !== null
      && replacement.review.status === "approved"
      && replacement.review.stableKey === current.stableKey
      && replacement.review.revision === current.revision + 1
      && replacement.supersedesVersionId === current.versionId
      && replacement.review.supersedesVersionId === current.versionId
      && replacement.review.versionId !== current.versionId
      && Date.parse(replacement.review.createdAt) > Date.parse(current.createdAt)
      && replacementLastAt !== null
      && Date.parse(replacementLastAt) > Date.parse(currentLastAt)
      && Date.parse(at) > Date.parse(replacementLastAt);
    if (!allowedReviewTransition(current.status, to)
      || Date.parse(at) <= Date.parse(currentLastAt)
      || (to === "superseded" ? !validReplacement : replacement !== null)) {
      return reviewFailure("INVALID_TRANSITION");
    }

    const replacementVersionId = replacement?.review.versionId ?? null;

    const event: IcpReviewEvent = Object.freeze({
      from: current.status,
      to,
      actor: Object.freeze({ kind: "human" as const, actorId }),
      at,
      reason,
      replacementVersionId,
    });
    const review = createIcpReviewSnapshot({
      versionId: current.versionId,
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      contentHash: current.contentHash,
      stableKey: current.stableKey,
      revision: current.revision,
      supersedesVersionId: current.supersedesVersionId,
      understandingVersionId: current.understandingVersionId,
      understandingContentHash: current.understandingContentHash,
      understandingReviewHash: current.understandingReviewHash,
      createdAt: current.createdAt,
      status: to,
      events: Object.freeze([...current.events, event]),
      replacementVersionId,
    });
    return Object.freeze({ ok: true, code: "ICP_REVIEW_TRANSITIONED", review });
  } catch {
    return reviewFailure("MALFORMED_INPUT");
  }
}
