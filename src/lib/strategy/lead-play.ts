import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { buildIcpProposal } from "@/lib/strategy/icp";

export const LEAD_PLAY_SCHEMA_VERSION = 1 as const;

export type LeadPlayReviewStatus = "draft" | "in_review" | "approved" | "rejected" | "superseded";

type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;

export type LeadPlayRationaleReference = Readonly<{
  claimId: string;
  evidenceId: string;
}>;

export type LeadPlaySearchHypothesis = Readonly<{
  hypothesisId: string;
  queryFamily: string;
  statement: string;
  rationale: string;
  rationaleRefs: readonly LeadPlayRationaleReference[];
}>;

export type LeadPlayBounds = Readonly<{
  maxAccounts: number;
  maxProviderRequests: number;
  maxSpendCents: number;
}>;

export type LeadPlayUncertainty = Readonly<{
  uncertaintyId: string;
  statement: string;
  impact: string;
  relatedClaimIds: readonly string[];
}>;

export type LeadPlayIcpBinding = Scope & Readonly<{
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  versionId: string;
  contentHash: string;
  reviewHash: string;
  understandingVersionId: string;
  understandingContentHash: string;
  understandingClaimSetHash: string;
  understandingReviewHash: string;
  authorityHash: string;
  status: "approved";
}>;

export type LeadPlayReviewEvent = Readonly<{
  from: LeadPlayReviewStatus;
  to: Exclude<LeadPlayReviewStatus, "draft">;
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
  replacementVersionId: string | null;
}>;

export type LeadPlayReviewSnapshot = Scope & Readonly<{
  reviewVersion: 1;
  versionId: string;
  contentHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  icpVersionId: string;
  icpContentHash: string;
  icpReviewHash: string;
  icpAuthorityHash: string;
  understandingVersionId: string;
  understandingContentHash: string;
  understandingClaimSetHash: string;
  understandingReviewHash: string;
  createdAt: string;
  status: LeadPlayReviewStatus;
  events: readonly LeadPlayReviewEvent[];
  replacementVersionId: string | null;
  reviewHash: string;
}>;

export type LeadPlayPredecessorDescriptor = Readonly<{
  predecessorVersion: 1;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  review: LeadPlayReviewSnapshot;
}>;

export type LeadPlayReplacementDescriptor = Readonly<{
  replacementVersion: 1;
  supersedesVersionId: string;
  review: LeadPlayReviewSnapshot;
}>;

export type LeadPlayProposal = Scope & Readonly<{
  schemaVersion: typeof LEAD_PLAY_SCHEMA_VERSION;
  versionId: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  status: "review_required";
  contentHash: string;
  createdAt: string;
  icp: LeadPlayIcpBinding;
  title: string;
  objective: string;
  motion: string;
  searchHypotheses: readonly LeadPlaySearchHypothesis[];
  sourceAllowlist: readonly string[];
  bounds: LeadPlayBounds;
  outreachMode: "draft_only";
  rationaleRefs: readonly LeadPlayRationaleReference[];
  uncertainties: readonly LeadPlayUncertainty[];
  review: LeadPlayReviewSnapshot;
}>;

export type LeadPlayProposalFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "ICP_NOT_APPROVED"
  | "STALE_ICP"
  | "VERSION_CONFLICT"
  | "UNBOUNDED_PLAY"
  | "MISSING_RATIONALE_REFERENCE"
  | "DUPLICATE_ITEM"
  | "AUTOMATIC_OUTREACH_FORBIDDEN"
  | "UNSAFE_PLAY";

export type LeadPlayProposalResult =
  | Readonly<{ ok: true; code: "LEAD_PLAY_PROPOSAL_CREATED"; proposal: LeadPlayProposal }>
  | Readonly<{ ok: false; code: LeadPlayProposalFailureCode }>;

export type LeadPlayReviewResult =
  | Readonly<{ ok: true; code: "LEAD_PLAY_REVIEW_TRANSITIONED"; review: LeadPlayReviewSnapshot }>
  | Readonly<{
    ok: false;
    code: "MALFORMED_INPUT" | "SCOPE_MISMATCH" | "STALE_VERSION" | "INVALID_TRANSITION" | "HUMAN_REVIEW_REQUIRED";
  }>;

type PlainRecord = Record<string, unknown>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "stableKey", "revision", "predecessor", "createdAt",
  "icp", "title", "objective", "motion", "searchHypotheses", "sourceAllowlist", "bounds",
  "outreachMode", "rationaleRefs", "uncertainties",
] as const;
const ICP_BINDING_FIELDS = [
  "tenantId", "workspaceId", "stableKey", "revision", "supersedesVersionId", "versionId", "contentHash",
  "reviewHash", "understandingVersionId", "understandingContentHash", "understandingReviewHash", "snapshot", "source",
] as const;
const ICP_REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "contentHash", "understandingVersionId",
  "understandingContentHash", "understandingReviewHash", "stableKey", "revision", "supersedesVersionId",
  "createdAt", "status", "events", "replacementVersionId", "reviewHash",
] as const;
const ICP_EVENT_FIELDS = ["from", "to", "actor", "at", "reason", "replacementVersionId"] as const;
const HYPOTHESIS_FIELDS = ["hypothesisId", "queryFamily", "statement", "rationale", "rationaleRefs"] as const;
const RATIONALE_REF_FIELDS = ["claimId", "evidenceId"] as const;
const BOUNDS_FIELDS = ["maxAccounts", "maxProviderRequests", "maxSpendCents"] as const;
const UNCERTAINTY_FIELDS = ["uncertaintyId", "statement", "impact", "relatedClaimIds"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "contentHash", "stableKey", "revision",
  "supersedesVersionId", "icpVersionId",
  "icpContentHash", "icpReviewHash", "icpAuthorityHash", "understandingVersionId", "understandingContentHash",
  "understandingClaimSetHash", "understandingReviewHash", "createdAt", "status", "events", "replacementVersionId",
  "reviewHash",
] as const;
const REVIEW_EVENT_FIELDS = ["from", "to", "actor", "at", "reason", "replacementVersionId"] as const;
const PREDECESSOR_FIELDS = ["predecessorVersion", "stableKey", "revision", "supersedesVersionId", "review"] as const;
const REPLACEMENT_FIELDS = ["replacementVersion", "supersedesVersionId", "review"] as const;
const TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "current", "expectedVersionId", "expectedContentHash",
  "expectedReviewHash", "to", "actor", "at", "reason", "replacement",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ICP_VERSION_ID = /^icp-version:[a-f0-9]{64}$/u;
const UNDERSTANDING_VERSION_ID = /^understanding-version:[a-f0-9]{64}$/u;
const LEAD_PLAY_VERSION_ID = /^lead-play-version:[a-f0-9]{64}$/u;
const SECRET = /(?:authorization\s*:\s*bearer\s+\S+|\bsk-[A-Za-z0-9_-]{20,}\b|(?:api[_ -]?key|password|passwd|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+)/iu;
const PROTECTED_TARGETING = /\b(?:race|racial|ethnicity|ethnic|religion|religious|disability|sexual orientation|gender identity|genetic information)\b/iu;
const UNSAFE_LINK_OR_MARKUP = /(?:https?:\/\/|www\.|[<>])/iu;
const INVISIBLE_UNICODE = /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufe00-\ufe0f\ufeff\ufff9-\ufffb\u{e0100}-\u{e01ef}]/u;
const REVIEW_STATUSES = new Set<LeadPlayReviewStatus>(["draft", "in_review", "approved", "rejected", "superseded"]);
const MAX_HYPOTHESES = 16;
const MAX_SOURCES = 8;
const MAX_REFERENCES = 16;
const MAX_UNCERTAINTIES = 16;
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
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value) || INVISIBLE_UNICODE.test(value)) return false;
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

function timestamp(value: unknown): string | null {
  const parsed = boundedText(value, 40);
  if (!parsed) return null;
  const epoch = Date.parse(parsed);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === parsed ? parsed : null;
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>): T | null {
  return typeof value === "string" && values.has(value as T) ? value as T : null;
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

function allowedTransition(from: LeadPlayReviewStatus, to: LeadPlayReviewStatus): boolean {
  return (from === "draft" && to === "in_review")
    || (from === "in_review" && (to === "approved" || to === "rejected"))
    || (from === "approved" && to === "superseded");
}

function unsafeText(value: string): boolean {
  const securityView = value.normalize("NFKC");
  return SECRET.test(securityView) || PROTECTED_TARGETING.test(securityView) || UNSAFE_LINK_OR_MARKUP.test(securityView);
}

type ParsedIcpReview = Scope & Readonly<{
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  versionId: string;
  contentHash: string;
  reviewHash: string;
  understandingVersionId: string;
  understandingContentHash: string;
  understandingReviewHash: string;
  status: LeadPlayReviewStatus;
  lastEventAt: string;
}>;

function parseIcpEvent(value: unknown, versionId: string): LeadPlayReviewEvent | null {
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
    || !allowedTransition(from, to)
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

function parseIcpReview(value: unknown): ParsedIcpReview | null {
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
  const rawEvents = record && exactArray(record.events, MAX_REVIEW_EVENTS);
  const suppliedStatus = record && enumValue(record.status, REVIEW_STATUSES);
  if (!record || record.reviewVersion !== 1 || !tenantId || workspaceId === undefined || !versionId
    || !contentHash || versionId !== `icp-version:${contentHash.slice("sha256:".length)}`
    || !stableKey || revision === null || supersedesVersionId === undefined
    || (revision === 1 ? supersedesVersionId !== null : supersedesVersionId === null)
    || !understandingVersionId || !understandingContentHash || !understandingReviewHash
    || !createdAt || !rawEvents || !suppliedStatus
    || typeof record.reviewHash !== "string" || !HASH.test(record.reviewHash)) return null;

  const events: LeadPlayReviewEvent[] = [];
  let status: LeadPlayReviewStatus = "draft";
  let lastEventAt = createdAt;
  let replacementVersionId: string | null = null;
  for (const rawEvent of rawEvents) {
    const event = parseIcpEvent(rawEvent, versionId);
    if (!event || event.from !== status || Date.parse(event.at) <= Date.parse(lastEventAt)) return null;
    status = event.to;
    lastEventAt = event.at;
    replacementVersionId = event.replacementVersionId;
    events.push(event);
  }
  if (status !== suppliedStatus || record.replacementVersionId !== replacementVersionId) return null;
  const payload = Object.freeze({
    reviewVersion: 1,
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
    events: Object.freeze(events),
    replacementVersionId,
  });
  if (sha256(payload) !== record.reviewHash) return null;
  return Object.freeze({
    tenantId,
    workspaceId,
    stableKey,
    revision,
    supersedesVersionId,
    versionId,
    contentHash,
    reviewHash: record.reviewHash,
    understandingVersionId,
    understandingContentHash,
    understandingReviewHash,
    status,
    lastEventAt,
  });
}

type ReferenceResult =
  | Readonly<{ ok: true; value: readonly LeadPlayRationaleReference[] }>
  | Readonly<{ ok: false; code: "MALFORMED_INPUT" | "MISSING_RATIONALE_REFERENCE" | "DUPLICATE_ITEM" }>;

function parseRationaleReferences(value: unknown): ReferenceResult {
  const raw = exactArray(value, MAX_REFERENCES);
  if (!raw) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  if (raw.length === 0) return Object.freeze({ ok: false, code: "MISSING_RATIONALE_REFERENCE" });
  const references: LeadPlayRationaleReference[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const record = exactRecord(item, RATIONALE_REF_FIELDS);
    const claimId = record && reference(record.claimId);
    const evidenceId = record && reference(record.evidenceId);
    if (!record || !claimId || !evidenceId) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
    const key = `${claimId}\u0000${evidenceId}`;
    if (seen.has(key)) return Object.freeze({ ok: false, code: "DUPLICATE_ITEM" });
    seen.add(key);
    references.push(Object.freeze({ claimId, evidenceId }));
  }
  references.sort((left, right) => compareAscii(left.claimId, right.claimId)
    || compareAscii(left.evidenceId, right.evidenceId));
  return Object.freeze({ ok: true, value: Object.freeze(references) });
}

type ResolvedIcpSource = Readonly<{
  proposal: Extract<ReturnType<typeof buildIcpProposal>, { ok: true }>["proposal"];
  claimEvidence: ReadonlyMap<string, ReadonlySet<string>>;
}>;

function resolveIcpSource(value: unknown): ResolvedIcpSource | null {
  const rebuilt = buildIcpProposal(value);
  if (!rebuilt.ok) return null;
  const claimEvidence = new Map<string, Set<string>>();
  for (const criterion of [...rebuilt.proposal.positiveCriteria, ...rebuilt.proposal.exclusions]) {
    for (const rationaleRef of criterion.rationaleRefs) {
      const evidence = claimEvidence.get(rationaleRef.claimId) ?? new Set<string>();
      evidence.add(rationaleRef.evidenceId);
      claimEvidence.set(rationaleRef.claimId, evidence);
    }
  }
  for (const uncertainty of rebuilt.proposal.uncertainties) {
    for (const claimId of uncertainty.relatedClaimIds) {
      if (!claimEvidence.has(claimId)) claimEvidence.set(claimId, new Set());
    }
  }
  return Object.freeze({ proposal: rebuilt.proposal, claimEvidence });
}

function icpResolves(source: ResolvedIcpSource, value: LeadPlayRationaleReference): boolean {
  return source.claimEvidence.get(value.claimId)?.has(value.evidenceId) === true;
}

type HypothesisResult =
  | Readonly<{ ok: true; value: LeadPlaySearchHypothesis }>
  | Readonly<{ ok: false; code: "MALFORMED_INPUT" | "MISSING_RATIONALE_REFERENCE" | "DUPLICATE_ITEM" | "UNSAFE_PLAY" }>;

function parseHypothesis(value: unknown): HypothesisResult {
  const record = exactRecord(value, HYPOTHESIS_FIELDS);
  if (!record) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  const hypothesisId = reference(record.hypothesisId);
  const queryFamily = reference(record.queryFamily);
  const statement = boundedText(record.statement, 2_000);
  const rationale = boundedText(record.rationale, 2_000);
  const rationaleRefs = parseRationaleReferences(record.rationaleRefs);
  if (!hypothesisId || !queryFamily || !statement || !rationale) {
    return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  }
  if (unsafeText(statement) || unsafeText(rationale)) {
    return Object.freeze({ ok: false, code: "UNSAFE_PLAY" });
  }
  if (!rationaleRefs.ok) return rationaleRefs;
  return Object.freeze({
    ok: true,
    value: Object.freeze({ hypothesisId, queryFamily, statement, rationale, rationaleRefs: rationaleRefs.value }),
  });
}

type UncertaintyResult =
  | Readonly<{ ok: true; value: LeadPlayUncertainty }>
  | Readonly<{ ok: false; code: "MALFORMED_INPUT" | "MISSING_RATIONALE_REFERENCE" | "DUPLICATE_ITEM" | "UNSAFE_PLAY" }>;

function parseUncertainty(value: unknown): UncertaintyResult {
  const record = exactRecord(value, UNCERTAINTY_FIELDS);
  if (!record) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  const uncertaintyId = reference(record.uncertaintyId);
  const statement = boundedText(record.statement, 2_000);
  const impact = boundedText(record.impact, 2_000);
  const rawClaims = exactArray(record.relatedClaimIds, MAX_REFERENCES);
  if (!uncertaintyId || !statement || !impact || !rawClaims) {
    return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  }
  if (unsafeText(statement) || unsafeText(impact)) return Object.freeze({ ok: false, code: "UNSAFE_PLAY" });
  if (rawClaims.length === 0) return Object.freeze({ ok: false, code: "MISSING_RATIONALE_REFERENCE" });
  const relatedClaimIds: string[] = [];
  const seen = new Set<string>();
  for (const item of rawClaims) {
    const claimId = reference(item);
    if (!claimId) return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
    if (seen.has(claimId)) return Object.freeze({ ok: false, code: "DUPLICATE_ITEM" });
    seen.add(claimId);
    relatedClaimIds.push(claimId);
  }
  relatedClaimIds.sort(compareAscii);
  return Object.freeze({
    ok: true,
    value: Object.freeze({ uncertaintyId, statement, impact, relatedClaimIds: Object.freeze(relatedClaimIds) }),
  });
}

function reviewPayload(input: Readonly<{
  versionId: string;
  tenantId: string;
  workspaceId: string | null;
  contentHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  icpVersionId: string;
  icpContentHash: string;
  icpReviewHash: string;
  icpAuthorityHash: string;
  understandingVersionId: string;
  understandingContentHash: string;
  understandingClaimSetHash: string;
  understandingReviewHash: string;
  createdAt: string;
  status: LeadPlayReviewStatus;
  events: readonly LeadPlayReviewEvent[];
  replacementVersionId: string | null;
}>): Omit<LeadPlayReviewSnapshot, "reviewHash"> {
  return Object.freeze({
    reviewVersion: 1,
    versionId: input.versionId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    contentHash: input.contentHash,
    stableKey: input.stableKey,
    revision: input.revision,
    supersedesVersionId: input.supersedesVersionId,
    icpVersionId: input.icpVersionId,
    icpContentHash: input.icpContentHash,
    icpReviewHash: input.icpReviewHash,
    icpAuthorityHash: input.icpAuthorityHash,
    understandingVersionId: input.understandingVersionId,
    understandingContentHash: input.understandingContentHash,
    understandingClaimSetHash: input.understandingClaimSetHash,
    understandingReviewHash: input.understandingReviewHash,
    createdAt: input.createdAt,
    status: input.status,
    events: input.events,
    replacementVersionId: input.replacementVersionId,
  });
}

function createReview(input: Parameters<typeof reviewPayload>[0]): LeadPlayReviewSnapshot {
  const payload = reviewPayload(input);
  return Object.freeze({ ...payload, reviewHash: sha256(payload) });
}

function parseReviewEvent(value: unknown, versionId: string): LeadPlayReviewEvent | null {
  const record = exactRecord(value, REVIEW_EVENT_FIELDS);
  const actor = record && exactRecord(record.actor, ACTOR_FIELDS);
  if (!record || !actor || actor.kind !== "human") return null;
  const from = enumValue(record.from, REVIEW_STATUSES);
  const to = enumValue(record.to, REVIEW_STATUSES);
  const actorId = uuid(actor.actorId);
  const at = timestamp(record.at);
  const reason = boundedText(record.reason, 2_000);
  const replacementVersionId = record.replacementVersionId === null
    ? null
    : typeof record.replacementVersionId === "string" && LEAD_PLAY_VERSION_ID.test(record.replacementVersionId)
      ? record.replacementVersionId : undefined;
  if (!from || !to || to === "draft" || !actorId || !at || !reason || replacementVersionId === undefined
    || !allowedTransition(from, to)
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

function parseReview(value: unknown): LeadPlayReviewSnapshot | null {
  const record = exactRecord(value, REVIEW_FIELDS);
  const tenantId = record && uuid(record.tenantId);
  const workspaceId = record && workspace(record.workspaceId);
  const versionId = record && typeof record.versionId === "string" && LEAD_PLAY_VERSION_ID.test(record.versionId)
    ? record.versionId : null;
  const contentHash = record && typeof record.contentHash === "string" && HASH.test(record.contentHash)
    ? record.contentHash : null;
  const stableKey = record && reference(record.stableKey);
  const revision = record && integer(record.revision, 1, 1_000_000);
  const supersedesVersionId = record?.supersedesVersionId === null
    ? null
    : record && typeof record.supersedesVersionId === "string" && LEAD_PLAY_VERSION_ID.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const icpVersionId = record && typeof record.icpVersionId === "string" && ICP_VERSION_ID.test(record.icpVersionId)
    ? record.icpVersionId : null;
  const hashes = [record?.icpContentHash, record?.icpReviewHash, record?.icpAuthorityHash,
    record?.understandingContentHash, record?.understandingClaimSetHash, record?.understandingReviewHash];
  const understandingVersionId = record && typeof record.understandingVersionId === "string"
    && UNDERSTANDING_VERSION_ID.test(record.understandingVersionId) ? record.understandingVersionId : null;
  const createdAt = record && timestamp(record.createdAt);
  const rawEvents = record && exactArray(record.events, MAX_REVIEW_EVENTS);
  const suppliedStatus = record && enumValue(record.status, REVIEW_STATUSES);
  if (!record || record.reviewVersion !== 1 || !tenantId || workspaceId === undefined || !versionId
    || !contentHash || versionId !== `lead-play-version:${contentHash.slice("sha256:".length)}`
    || !stableKey || revision === null || supersedesVersionId === undefined
    || (revision === 1 ? supersedesVersionId !== null : supersedesVersionId === null)
    || !icpVersionId || !understandingVersionId || hashes.some((hash) => typeof hash !== "string" || !HASH.test(hash))
    || !createdAt || !rawEvents || !suppliedStatus
    || typeof record.reviewHash !== "string" || !HASH.test(record.reviewHash)) return null;

  const events: LeadPlayReviewEvent[] = [];
  let status: LeadPlayReviewStatus = "draft";
  let lastAt = createdAt;
  let replacementVersionId: string | null = null;
  for (const rawEvent of rawEvents) {
    const event = parseReviewEvent(rawEvent, versionId);
    if (!event || event.from !== status || Date.parse(event.at) <= Date.parse(lastAt)) return null;
    status = event.to;
    lastAt = event.at;
    replacementVersionId = event.replacementVersionId;
    events.push(event);
  }
  if (status !== suppliedStatus || record.replacementVersionId !== replacementVersionId) return null;
  const canonical = createReview({
    versionId,
    tenantId,
    workspaceId,
    contentHash,
    stableKey,
    revision,
    supersedesVersionId,
    icpVersionId,
    icpContentHash: record.icpContentHash as string,
    icpReviewHash: record.icpReviewHash as string,
    icpAuthorityHash: record.icpAuthorityHash as string,
    understandingVersionId,
    understandingContentHash: record.understandingContentHash as string,
    understandingClaimSetHash: record.understandingClaimSetHash as string,
    understandingReviewHash: record.understandingReviewHash as string,
    createdAt,
    status,
    events: Object.freeze(events),
    replacementVersionId,
  });
  return canonical.reviewHash === record.reviewHash ? canonical : null;
}

function parsePredecessor(value: unknown): LeadPlayPredecessorDescriptor | null {
  const record = exactRecord(value, PREDECESSOR_FIELDS);
  const stableKey = record && reference(record.stableKey);
  const revision = record && integer(record.revision, 1, 999_999);
  const supersedesVersionId = record?.supersedesVersionId === null
    ? null
    : record && typeof record.supersedesVersionId === "string" && LEAD_PLAY_VERSION_ID.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const review = record && parseReview(record.review);
  if (!record || record.predecessorVersion !== 1 || !stableKey || revision === null
    || supersedesVersionId === undefined || !review || review.status !== "approved"
    || stableKey !== review.stableKey || revision !== review.revision
    || supersedesVersionId !== review.supersedesVersionId) return null;
  return Object.freeze({ predecessorVersion: 1, stableKey, revision, supersedesVersionId, review });
}

function parseReplacement(value: unknown): LeadPlayReplacementDescriptor | null {
  const record = exactRecord(value, REPLACEMENT_FIELDS);
  const review = record && parseReview(record.review);
  const supersedesVersionId = record && typeof record.supersedesVersionId === "string"
    && LEAD_PLAY_VERSION_ID.test(record.supersedesVersionId) ? record.supersedesVersionId : null;
  if (!record || record.replacementVersion !== 1 || !review || !supersedesVersionId
    || review.supersedesVersionId !== supersedesVersionId) return null;
  return Object.freeze({ replacementVersion: 1, supersedesVersionId, review });
}

function proposalFailure(code: LeadPlayProposalFailureCode): LeadPlayProposalResult {
  return Object.freeze({ ok: false, code });
}

export function buildLeadPlayProposal(value: unknown): LeadPlayProposalResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== LEAD_PLAY_SCHEMA_VERSION) return proposalFailure("MALFORMED_INPUT");
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const stableKey = reference(input.stableKey);
    const revision = integer(input.revision, 1, 1_000_000);
    const predecessor = input.predecessor === null ? null : parsePredecessor(input.predecessor);
    const createdAt = timestamp(input.createdAt);
    const title = boundedText(input.title, 500);
    const objective = boundedText(input.objective, 2_000);
    const motion = boundedText(input.motion, 2_000);
    const rawHypotheses = exactArray(input.searchHypotheses, MAX_HYPOTHESES);
    const rawSources = exactArray(input.sourceAllowlist, MAX_SOURCES);
    const rawUncertainties = exactArray(input.uncertainties, MAX_UNCERTAINTIES);
    const boundsInput = exactRecord(input.bounds, BOUNDS_FIELDS);
    const maxAccounts = boundsInput && integer(boundsInput.maxAccounts, 1, 10_000);
    const maxProviderRequests = boundsInput && integer(boundsInput.maxProviderRequests, 1, 10_000);
    const maxSpendCents = boundsInput && integer(boundsInput.maxSpendCents, 0, 100_000_000);
    if (!tenantId || workspaceId === undefined || !stableKey || revision === null
      || (input.predecessor !== null && !predecessor) || !createdAt || !title || !objective || !motion
      || !rawHypotheses || !rawSources || !rawUncertainties || !boundsInput) {
      return proposalFailure("MALFORMED_INPUT");
    }
    if (input.outreachMode !== "draft_only") {
      return typeof input.outreachMode === "string"
        ? proposalFailure("AUTOMATIC_OUTREACH_FORBIDDEN") : proposalFailure("MALFORMED_INPUT");
    }
    if (!rawHypotheses.length || !rawSources.length || maxAccounts === null
      || maxProviderRequests === null || maxSpendCents === null) return proposalFailure("UNBOUNDED_PLAY");
    if (unsafeText(title) || unsafeText(objective) || unsafeText(motion)) return proposalFailure("UNSAFE_PLAY");
    const scope = Object.freeze({ tenantId, workspaceId });
    if ((revision === 1 && predecessor !== null) || (revision > 1 && predecessor === null)) {
      return proposalFailure("VERSION_CONFLICT");
    }
    if (predecessor && (!sameScope(scope, predecessor.review)
      || predecessor.stableKey !== stableKey
      || predecessor.revision + 1 !== revision
      || predecessor.review.status !== "approved"
      || Date.parse(createdAt) <= Date.parse(predecessor.review.events.at(-1)?.at ?? predecessor.review.createdAt))) {
      return proposalFailure(sameScope(scope, predecessor.review) ? "VERSION_CONFLICT" : "SCOPE_MISMATCH");
    }

    const icpInput = exactRecord(input.icp, ICP_BINDING_FIELDS);
    const icpReview = icpInput && parseIcpReview(icpInput.snapshot);
    const icpSource = icpInput && resolveIcpSource(icpInput.source);
    if (!icpInput || !icpReview || !icpSource) return proposalFailure("MALFORMED_INPUT");
    const bindingTenantId = uuid(icpInput.tenantId);
    const bindingWorkspaceId = workspace(icpInput.workspaceId);
    if (!bindingTenantId || bindingWorkspaceId === undefined
      || !sameScope(scope, { tenantId: bindingTenantId, workspaceId: bindingWorkspaceId })
      || !sameScope(scope, icpReview)) return proposalFailure("SCOPE_MISMATCH");
    if (!sameScope(scope, icpSource.proposal)) return proposalFailure("SCOPE_MISMATCH");
    if (icpInput.versionId !== icpReview.versionId || icpInput.contentHash !== icpReview.contentHash
      || icpInput.reviewHash !== icpReview.reviewHash
      || icpInput.stableKey !== icpReview.stableKey
      || icpInput.revision !== icpReview.revision
      || icpInput.supersedesVersionId !== icpReview.supersedesVersionId
      || icpInput.understandingVersionId !== icpReview.understandingVersionId
      || icpInput.understandingContentHash !== icpReview.understandingContentHash
      || icpInput.understandingReviewHash !== icpReview.understandingReviewHash
      || icpSource.proposal.versionId !== icpReview.versionId
      || icpSource.proposal.contentHash !== icpReview.contentHash
      || icpSource.proposal.stableKey !== icpReview.stableKey
      || icpSource.proposal.revision !== icpReview.revision
      || icpSource.proposal.supersedesVersionId !== icpReview.supersedesVersionId
      || icpSource.proposal.understanding.versionId !== icpReview.understandingVersionId
      || icpSource.proposal.understanding.contentHash !== icpReview.understandingContentHash
      || icpSource.proposal.understanding.reviewHash !== icpReview.understandingReviewHash) {
      return proposalFailure("STALE_ICP");
    }
    if (icpReview.status !== "approved") return proposalFailure("ICP_NOT_APPROVED");
    if (Date.parse(createdAt) <= Date.parse(icpReview.lastEventAt)) return proposalFailure("STALE_ICP");

    const searchHypotheses: LeadPlaySearchHypothesis[] = [];
    const hypothesisIds = new Set<string>();
    const queryFamilies = new Set<string>();
    for (const raw of rawHypotheses) {
      const parsed = parseHypothesis(raw);
      if (!parsed.ok) return proposalFailure(parsed.code);
      if (hypothesisIds.has(parsed.value.hypothesisId) || queryFamilies.has(parsed.value.queryFamily)) {
        return proposalFailure("DUPLICATE_ITEM");
      }
      hypothesisIds.add(parsed.value.hypothesisId);
      queryFamilies.add(parsed.value.queryFamily);
      if (parsed.value.rationaleRefs.some((item) => !icpResolves(icpSource, item))) {
        return proposalFailure("MISSING_RATIONALE_REFERENCE");
      }
      searchHypotheses.push(parsed.value);
    }
    searchHypotheses.sort((left, right) => compareAscii(left.hypothesisId, right.hypothesisId));

    const sourceAllowlist: string[] = [];
    const sourceSet = new Set<string>();
    for (const rawSource of rawSources) {
      const source = reference(rawSource);
      if (!source) return proposalFailure("MALFORMED_INPUT");
      if (sourceSet.has(source)) return proposalFailure("DUPLICATE_ITEM");
      sourceSet.add(source);
      sourceAllowlist.push(source);
    }
    sourceAllowlist.sort(compareAscii);

    const rationaleRefs = parseRationaleReferences(input.rationaleRefs);
    if (!rationaleRefs.ok) return proposalFailure(rationaleRefs.code);
    if (rationaleRefs.value.some((item) => !icpResolves(icpSource, item))) {
      return proposalFailure("MISSING_RATIONALE_REFERENCE");
    }
    const uncertainties: LeadPlayUncertainty[] = [];
    const uncertaintyIds = new Set<string>();
    for (const raw of rawUncertainties) {
      const parsed = parseUncertainty(raw);
      if (!parsed.ok) return proposalFailure(parsed.code);
      if (uncertaintyIds.has(parsed.value.uncertaintyId)
        || hypothesisIds.has(parsed.value.uncertaintyId)) return proposalFailure("DUPLICATE_ITEM");
      if (parsed.value.relatedClaimIds.some((claimId) => !icpSource.claimEvidence.has(claimId))) {
        return proposalFailure("MISSING_RATIONALE_REFERENCE");
      }
      uncertaintyIds.add(parsed.value.uncertaintyId);
      uncertainties.push(parsed.value);
    }
    uncertainties.sort((left, right) => compareAscii(left.uncertaintyId, right.uncertaintyId));

    const approvedIcp: LeadPlayIcpBinding = Object.freeze({
      tenantId: icpReview.tenantId,
      workspaceId: icpReview.workspaceId,
      stableKey: icpReview.stableKey,
      revision: icpReview.revision,
      supersedesVersionId: icpReview.supersedesVersionId,
      versionId: icpReview.versionId,
      contentHash: icpReview.contentHash,
      reviewHash: icpReview.reviewHash,
      understandingVersionId: icpReview.understandingVersionId,
      understandingContentHash: icpReview.understandingContentHash,
      understandingClaimSetHash: icpSource.proposal.understanding.claimSetHash,
      understandingReviewHash: icpReview.understandingReviewHash,
      authorityHash: icpSource.proposal.understanding.authorityHash,
      status: "approved",
    });
    const bounds: LeadPlayBounds = Object.freeze({ maxAccounts, maxProviderRequests, maxSpendCents });
    const content = Object.freeze({
      schemaVersion: LEAD_PLAY_SCHEMA_VERSION,
      stableKey,
      tenantId,
      workspaceId,
      revision,
      supersedesVersionId: predecessor?.review.versionId ?? null,
      status: "review_required" as const,
      createdAt,
      icp: approvedIcp,
      title,
      objective,
      motion,
      searchHypotheses: Object.freeze(searchHypotheses),
      sourceAllowlist: Object.freeze(sourceAllowlist),
      bounds,
      outreachMode: "draft_only" as const,
      rationaleRefs: rationaleRefs.value,
      uncertainties: Object.freeze(uncertainties),
    });
    const contentHash = sha256(content);
    const versionId = `lead-play-version:${contentHash.slice("sha256:".length)}`;
    const review = createReview({
      versionId,
      tenantId,
      workspaceId,
      contentHash,
      stableKey,
      revision,
      supersedesVersionId: predecessor?.review.versionId ?? null,
      icpVersionId: approvedIcp.versionId,
      icpContentHash: approvedIcp.contentHash,
      icpReviewHash: approvedIcp.reviewHash,
      icpAuthorityHash: approvedIcp.authorityHash,
      understandingVersionId: approvedIcp.understandingVersionId,
      understandingContentHash: approvedIcp.understandingContentHash,
      understandingClaimSetHash: approvedIcp.understandingClaimSetHash,
      understandingReviewHash: approvedIcp.understandingReviewHash,
      createdAt,
      status: "draft",
      events: Object.freeze([]),
      replacementVersionId: null,
    });
    const proposal: LeadPlayProposal = Object.freeze({ ...content, versionId, contentHash, review });
    return Object.freeze({ ok: true, code: "LEAD_PLAY_PROPOSAL_CREATED", proposal });
  } catch {
    return proposalFailure("MALFORMED_INPUT");
  }
}

function reviewFailure(code: Exclude<LeadPlayReviewResult, { ok: true }>["code"]): LeadPlayReviewResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Pure lifecycle transition. Authorization, separation of duty, audit storage,
 * activation, and one-current-version enforcement remain caller responsibilities.
 */
export function transitionLeadPlayReview(value: unknown): LeadPlayReviewResult {
  try {
    const input = exactRecord(value, TRANSITION_FIELDS);
    if (!input || input.version !== 1) return reviewFailure("MALFORMED_INPUT");
    const current = parseReview(input.current);
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const actor = exactRecord(input.actor, ACTOR_FIELDS);
    const actorId = actor && uuid(actor.actorId);
    const to = enumValue(input.to, REVIEW_STATUSES);
    const at = timestamp(input.at);
    const reason = boundedText(input.reason, 2_000);
    const replacement = input.replacement === null ? null : parseReplacement(input.replacement);
    if (!current || !tenantId || workspaceId === undefined || !actor || !actorId || !to || to === "draft"
      || !at || !reason || (input.replacement !== null && !replacement)
      || typeof input.expectedVersionId !== "string" || !LEAD_PLAY_VERSION_ID.test(input.expectedVersionId)
      || typeof input.expectedContentHash !== "string" || !HASH.test(input.expectedContentHash)
      || typeof input.expectedReviewHash !== "string" || !HASH.test(input.expectedReviewHash)) {
      return reviewFailure("MALFORMED_INPUT");
    }
    if (!sameScope({ tenantId, workspaceId }, current)) return reviewFailure("SCOPE_MISMATCH");
    if (replacement && !sameScope(current, replacement.review)) return reviewFailure("SCOPE_MISMATCH");
    if (input.expectedVersionId !== current.versionId || input.expectedContentHash !== current.contentHash
      || input.expectedReviewHash !== current.reviewHash) return reviewFailure("STALE_VERSION");
    if (actor.kind !== "human") return reviewFailure("HUMAN_REVIEW_REQUIRED");
    const currentLastAt = current.events.at(-1)?.at ?? current.createdAt;
    const replacementLastAt = replacement?.review.events.at(-1)?.at ?? null;
    const validReplacement = replacement !== null
      && replacement.supersedesVersionId === current.versionId
      && replacement.review.status === "approved"
      && replacement.review.versionId !== current.versionId
      && replacement.review.stableKey === current.stableKey
      && replacement.review.revision === current.revision + 1
      && replacement.review.supersedesVersionId === current.versionId
      && Date.parse(replacement.review.createdAt) > Date.parse(current.createdAt)
      && replacementLastAt !== null
      && Date.parse(replacementLastAt) > Date.parse(currentLastAt)
      && Date.parse(at) > Date.parse(replacementLastAt);
    if (!allowedTransition(current.status, to)
      || Date.parse(at) <= Date.parse(currentLastAt)
      || (to === "superseded" ? !validReplacement : replacement !== null)) {
      return reviewFailure("INVALID_TRANSITION");
    }

    const replacementVersionId = replacement?.review.versionId ?? null;

    const event: LeadPlayReviewEvent = Object.freeze({
      from: current.status,
      to,
      actor: Object.freeze({ kind: "human", actorId }),
      at,
      reason,
      replacementVersionId,
    });
    const review = createReview({
      versionId: current.versionId,
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      contentHash: current.contentHash,
      stableKey: current.stableKey,
      revision: current.revision,
      supersedesVersionId: current.supersedesVersionId,
      icpVersionId: current.icpVersionId,
      icpContentHash: current.icpContentHash,
      icpReviewHash: current.icpReviewHash,
      icpAuthorityHash: current.icpAuthorityHash,
      understandingVersionId: current.understandingVersionId,
      understandingContentHash: current.understandingContentHash,
      understandingClaimSetHash: current.understandingClaimSetHash,
      understandingReviewHash: current.understandingReviewHash,
      createdAt: current.createdAt,
      status: to,
      events: Object.freeze([...current.events, event]),
      replacementVersionId,
    });
    return Object.freeze({ ok: true, code: "LEAD_PLAY_REVIEW_TRANSITIONED", review });
  } catch {
    return reviewFailure("MALFORMED_INPUT");
  }
}
