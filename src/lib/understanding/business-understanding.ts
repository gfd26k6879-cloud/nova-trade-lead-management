import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export const BUSINESS_UNDERSTANDING_SCHEMA_VERSION = 1 as const;

export type UnderstandingDomain =
  | "products"
  | "variants"
  | "applications"
  | "industries"
  | "customer_types"
  | "channel_positions"
  | "differentiators"
  | "constraints"
  | "certifications"
  | "substitutes"
  | "triggers"
  | "buying_process"
  | "geography"
  | "economics"
  | "exclusions"
  | "custom_facts";

export type UnderstandingClaimClass =
  | "identity"
  | "product_technical_specification"
  | "compatibility_application"
  | "regulatory_compliance"
  | "safety"
  | "performance"
  | "pricing_commercial"
  | "capacity_supply"
  | "geography"
  | "contact_role"
  | "personalization"
  | "negative_absence"
  | "customer_provided_strategic_fact";

export type UnderstandingEvidenceGrade =
  | "direct_observation"
  | "tenant_client_provided"
  | "extracted"
  | "inferred"
  | "corroborated"
  | "conflicted"
  | "stale"
  | "unknown";

export type UnderstandingEvidenceFreshness = "current" | "stale" | "revoked";
export type UnderstandingFactOrigin = "observed" | "client_provided" | "inferred" | "unknown";
export type UnderstandingClaimStatus = "proposed" | "supported" | "conflicted" | "unknown";
export type UnderstandingDomainState = "supported" | "partial" | "unknown" | "conflict";
export type BusinessUnderstandingReviewStatus = "draft" | "in_review" | "approved" | "rejected" | "superseded";

type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;

export type UnderstandingProducer = Readonly<{
  runRef: string;
  runInputHash: string;
  agentVersion: string;
  modelRef: string;
  promptRef: string;
  promptHash: string;
  policyRef: string;
  policyHash: string;
}>;

export type UnderstandingCitation = Readonly<{
  evidenceId: string;
  sourceVersionRef: string;
  locator: string;
  contentHash: string;
  grade: UnderstandingEvidenceGrade;
  freshness: UnderstandingEvidenceFreshness;
}>;

export type UnderstandingFact = Readonly<{
  claimId: string;
  claimVersion: number;
  domain: UnderstandingDomain;
  claimClass: UnderstandingClaimClass;
  subject: string;
  statement: string;
  origin: Exclude<UnderstandingFactOrigin, "unknown">;
  claimStatus: Exclude<UnderstandingClaimStatus, "unknown">;
  reviewState: "pending";
  confidenceBasisPoints: number;
  material: boolean;
  citations: readonly UnderstandingCitation[];
}>;

export type UnderstandingUncertainty = Readonly<{
  claimId: string;
  claimVersion: number;
  domain: UnderstandingDomain;
  claimClass: UnderstandingClaimClass;
  subject: string;
  statement: string;
  reason: string;
  confidenceBasisPoints: 0;
  material: boolean;
}>;

export type BusinessUnderstandingReviewEvent = Readonly<{
  from: BusinessUnderstandingReviewStatus;
  to: Exclude<BusinessUnderstandingReviewStatus, "draft">;
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
  replacementVersionId: string | null;
}>;

export type BusinessUnderstandingReviewSnapshot = Scope & Readonly<{
  reviewVersion: 1;
  versionId: string;
  contentHash: string;
  claimSetHash: string;
  createdAt: string;
  status: BusinessUnderstandingReviewStatus;
  events: readonly BusinessUnderstandingReviewEvent[];
  replacementVersionId: string | null;
  reviewHash: string;
}>;

export type BusinessUnderstandingProposal = Scope & Readonly<{
  version: typeof BUSINESS_UNDERSTANDING_SCHEMA_VERSION;
  versionId: string;
  proposalRef: string;
  revision: number;
  supersedesProposalRef: string | null;
  status: "review_required";
  reviewState: "pending";
  claimSetHash: string;
  contentHash: string;
  createdAt: string;
  producer: UnderstandingProducer;
  domains: readonly Readonly<{
    domain: UnderstandingDomain;
    state: UnderstandingDomainState;
    facts: readonly UnderstandingFact[];
  }>[];
  uncertainties: readonly UnderstandingUncertainty[];
  coverage: Readonly<{
    materialClaims: number;
    materialClaimsWithCurrentEvidence: number;
    explicitUnknowns: number;
    currentEvidenceBasisPoints: number;
    materialConfidenceBasisPoints: number;
  }>;
  review: BusinessUnderstandingReviewSnapshot;
}>;

export type BusinessUnderstandingProposalResult =
  | Readonly<{ ok: true; code: "PROPOSAL_CREATED"; proposal: BusinessUnderstandingProposal }>
  | Readonly<{
    ok: false;
    code: "MALFORMED_INPUT" | "VERSION_CONFLICT" | "SCOPE_MISMATCH" | "EVIDENCE_UNRESOLVABLE" | "EVIDENCE_INELIGIBLE";
  }>;

export type BusinessUnderstandingReviewResult =
  | Readonly<{ ok: true; code: "REVIEW_TRANSITIONED"; review: BusinessUnderstandingReviewSnapshot }>
  | Readonly<{
    ok: false;
    code: "MALFORMED_INPUT" | "SCOPE_MISMATCH" | "STALE_VERSION" | "INVALID_TRANSITION" | "HUMAN_REVIEW_REQUIRED";
  }>;

type PlainRecord = Record<string, unknown>;

type ParsedEvidence = Scope & UnderstandingCitation;
type ParsedClaim = Scope & Readonly<{
  claimId: string;
  claimVersion: number;
  domain: UnderstandingDomain;
  claimClass: UnderstandingClaimClass;
  subject: string;
  statement: string;
  origin: UnderstandingFactOrigin;
  status: UnderstandingClaimStatus;
  confidenceBasisPoints: number;
  material: boolean;
  evidenceIds: readonly string[];
  uncertaintyReason: string | null;
}>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "proposalRef", "revision", "supersedesProposalRef",
  "createdAt", "producer", "evidence", "claims",
] as const;
const PRODUCER_FIELDS = [
  "runRef", "runInputHash", "agentVersion", "modelRef", "promptRef", "promptHash", "policyRef", "policyHash",
] as const;
const EVIDENCE_FIELDS = [
  "evidenceId", "tenantId", "workspaceId", "sourceVersionRef", "locator", "contentHash", "grade", "freshness",
] as const;
const CLAIM_FIELDS = [
  "claimId", "claimVersion", "tenantId", "workspaceId", "domain", "claimClass", "subject", "statement",
  "origin", "status", "confidenceBasisPoints", "material", "evidenceIds", "uncertaintyReason",
] as const;
const REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "contentHash", "claimSetHash", "createdAt",
  "status", "events", "replacementVersionId", "reviewHash",
] as const;
const REVIEW_EVENT_FIELDS = ["from", "to", "actor", "at", "reason", "replacementVersionId"] as const;
const REVIEW_ACTOR_FIELDS = ["kind", "actorId"] as const;
const REVIEW_TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "current", "expectedVersionId", "expectedContentHash",
  "expectedReviewHash", "to", "actor", "at", "reason", "replacementVersionId",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const VERSION_ID = /^understanding-version:[a-f0-9]{64}$/u;
const DOMAINS = new Set<UnderstandingDomain>([
  "products", "variants", "applications", "industries", "customer_types", "channel_positions",
  "differentiators", "constraints", "certifications", "substitutes", "triggers", "buying_process",
  "geography", "economics", "exclusions", "custom_facts",
]);
const CLAIM_CLASSES = new Set<UnderstandingClaimClass>([
  "identity", "product_technical_specification", "compatibility_application", "regulatory_compliance",
  "safety", "performance", "pricing_commercial", "capacity_supply", "geography", "contact_role",
  "personalization", "negative_absence", "customer_provided_strategic_fact",
]);
const EVIDENCE_GRADES = new Set<UnderstandingEvidenceGrade>([
  "direct_observation", "tenant_client_provided", "extracted", "inferred", "corroborated",
  "conflicted", "stale", "unknown",
]);
const FRESHNESS = new Set<UnderstandingEvidenceFreshness>(["current", "stale", "revoked"]);
const ORIGINS = new Set<UnderstandingFactOrigin>(["observed", "client_provided", "inferred", "unknown"]);
const CLAIM_STATUSES = new Set<UnderstandingClaimStatus>(["proposed", "supported", "conflicted", "unknown"]);
const REVIEW_STATUSES = new Set<BusinessUnderstandingReviewStatus>([
  "draft", "in_review", "approved", "rejected", "superseded",
]);
const SUPPORTED_GRADES = new Set<UnderstandingEvidenceGrade>([
  "direct_observation", "tenant_client_provided", "corroborated",
]);
const DIRECT_SUPPORT_CLASSES = new Set<UnderstandingClaimClass>([
  "identity", "product_technical_specification", "compatibility_application", "regulatory_compliance", "safety",
  "performance", "pricing_commercial", "capacity_supply", "personalization", "negative_absence",
  "geography", "contact_role",
]);

function reject(code: Exclude<BusinessUnderstandingProposalResult, { ok: true }>["code"]): BusinessUnderstandingProposalResult {
  return Object.freeze({ ok: false, code });
}

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
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
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum) return null;
    if (Reflect.ownKeys(descriptors).length !== length + 1) return null;
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

function boundedText(value: unknown, maximum = 2_000): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value !== value.trim()
    || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return null;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return null;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return null;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return null;
  }
  return value;
}

function reference(value: unknown): string | null {
  return typeof value === "string" && value.length <= 300 && REF.test(value) ? value : null;
}

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function optionalWorkspace(value: unknown): string | null | undefined {
  return value === null ? null : uuid(value) ?? undefined;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>): T | null {
  return typeof value === "string" && values.has(value as T) ? value as T : null;
}

function parseProducer(value: unknown): UnderstandingProducer | null {
  const record = exactRecord(value, PRODUCER_FIELDS);
  if (!record) return null;
  const runRef = reference(record.runRef);
  const runInputHash = typeof record.runInputHash === "string" && HASH.test(record.runInputHash)
    ? record.runInputHash : null;
  const agentVersion = reference(record.agentVersion);
  const modelRef = reference(record.modelRef);
  const promptRef = reference(record.promptRef);
  const promptHash = typeof record.promptHash === "string" && HASH.test(record.promptHash)
    ? record.promptHash : null;
  const policyRef = reference(record.policyRef);
  const policyHash = typeof record.policyHash === "string" && HASH.test(record.policyHash)
    ? record.policyHash : null;
  return runRef && runInputHash && agentVersion && modelRef && promptRef && promptHash && policyRef && policyHash
    ? Object.freeze({ runRef, runInputHash, agentVersion, modelRef, promptRef, promptHash, policyRef, policyHash })
    : null;
}

function parseEvidence(value: unknown): ParsedEvidence | null {
  const record = exactRecord(value, EVIDENCE_FIELDS);
  if (!record) return null;
  const evidenceId = reference(record.evidenceId);
  const tenantId = uuid(record.tenantId);
  const workspaceId = optionalWorkspace(record.workspaceId);
  const sourceVersionRef = reference(record.sourceVersionRef);
  const locator = boundedText(record.locator, 1_000);
  const contentHash = typeof record.contentHash === "string" && HASH.test(record.contentHash) ? record.contentHash : null;
  const grade = enumValue(record.grade, EVIDENCE_GRADES);
  const freshness = enumValue(record.freshness, FRESHNESS);
  if (!evidenceId || !tenantId || workspaceId === undefined || !sourceVersionRef || !locator || !contentHash || !grade || !freshness) return null;
  return Object.freeze({ evidenceId, tenantId, workspaceId, sourceVersionRef, locator, contentHash, grade, freshness });
}

function parseEvidenceIds(value: unknown): readonly string[] | null {
  const raw = exactArray(value, 20);
  if (!raw) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const id = reference(item);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    result.push(id);
  }
  return Object.freeze(result.sort(compareAscii));
}

function parseClaim(value: unknown): ParsedClaim | null {
  const record = exactRecord(value, CLAIM_FIELDS);
  if (!record) return null;
  const claimId = reference(record.claimId);
  const claimVersion = integer(record.claimVersion, 1, 1_000_000);
  const tenantId = uuid(record.tenantId);
  const workspaceId = optionalWorkspace(record.workspaceId);
  const domain = enumValue(record.domain, DOMAINS);
  const claimClass = enumValue(record.claimClass, CLAIM_CLASSES);
  const subject = boundedText(record.subject, 500);
  const statement = boundedText(record.statement, 5_000);
  const origin = enumValue(record.origin, ORIGINS);
  const status = enumValue(record.status, CLAIM_STATUSES);
  const confidenceBasisPoints = integer(record.confidenceBasisPoints, 0, 10_000);
  const evidenceIds = parseEvidenceIds(record.evidenceIds);
  const uncertaintyReason = record.uncertaintyReason === null ? null : boundedText(record.uncertaintyReason, 2_000);
  if (!claimId || claimVersion === null || !tenantId || workspaceId === undefined || !domain || !claimClass
    || !subject || !statement || !origin || !status || confidenceBasisPoints === null
    || typeof record.material !== "boolean" || !evidenceIds) return null;
  if (record.uncertaintyReason !== null && uncertaintyReason === null) return null;
  return Object.freeze({
    claimId,
    claimVersion,
    tenantId,
    workspaceId,
    domain,
    claimClass,
    subject,
    statement,
    origin,
    status,
    confidenceBasisPoints,
    material: record.material,
    evidenceIds,
    uncertaintyReason,
  });
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function canonicalTimestamp(value: unknown): string | null {
  const timestamp = boundedText(value, 40);
  if (!timestamp) return null;
  const epoch = Date.parse(timestamp);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === timestamp ? timestamp : null;
}

function allowedReviewTransition(
  from: BusinessUnderstandingReviewStatus,
  to: BusinessUnderstandingReviewStatus,
): boolean {
  return (from === "draft" && to === "in_review")
    || (from === "in_review" && (to === "approved" || to === "rejected"))
    || (from === "approved" && to === "superseded");
}

function reviewPayload(input: Readonly<{
  versionId: string;
  tenantId: string;
  workspaceId: string | null;
  contentHash: string;
  claimSetHash: string;
  createdAt: string;
  status: BusinessUnderstandingReviewStatus;
  events: readonly BusinessUnderstandingReviewEvent[];
  replacementVersionId: string | null;
}>): Omit<BusinessUnderstandingReviewSnapshot, "reviewHash"> {
  return Object.freeze({
    reviewVersion: 1 as const,
    versionId: input.versionId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    contentHash: input.contentHash,
    claimSetHash: input.claimSetHash,
    createdAt: input.createdAt,
    status: input.status,
    events: input.events,
    replacementVersionId: input.replacementVersionId,
  });
}

function createReviewSnapshot(
  input: Parameters<typeof reviewPayload>[0],
): BusinessUnderstandingReviewSnapshot {
  const payload = reviewPayload(input);
  return Object.freeze({ ...payload, reviewHash: sha256(payload) });
}

function parseReviewEvent(
  value: unknown,
  versionId: string,
): BusinessUnderstandingReviewEvent | null {
  const record = exactRecord(value, REVIEW_EVENT_FIELDS);
  const actor = record && exactRecord(record.actor, REVIEW_ACTOR_FIELDS);
  if (!record || !actor || actor.kind !== "human") return null;
  const from = enumValue(record.from, REVIEW_STATUSES);
  const to = enumValue(record.to, REVIEW_STATUSES);
  const actorId = uuid(actor.actorId);
  const at = canonicalTimestamp(record.at);
  const reason = boundedText(record.reason, 2_000);
  const replacementVersionId = record.replacementVersionId === null
    ? null
    : typeof record.replacementVersionId === "string" && VERSION_ID.test(record.replacementVersionId)
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

function parseReviewSnapshot(value: unknown): BusinessUnderstandingReviewSnapshot | null {
  const record = exactRecord(value, REVIEW_FIELDS);
  const tenantId = record && uuid(record.tenantId);
  const workspaceId = record && optionalWorkspace(record.workspaceId);
  const versionId = record && typeof record.versionId === "string" && VERSION_ID.test(record.versionId)
    ? record.versionId : null;
  const contentHash = record && typeof record.contentHash === "string" && HASH.test(record.contentHash)
    ? record.contentHash : null;
  const claimSetHash = record && typeof record.claimSetHash === "string" && HASH.test(record.claimSetHash)
    ? record.claimSetHash : null;
  const createdAt = record && canonicalTimestamp(record.createdAt);
  const events = record && exactArray(record.events, 100);
  const suppliedStatus = record && enumValue(record.status, REVIEW_STATUSES);
  if (!record || record.reviewVersion !== 1 || !tenantId || workspaceId === undefined || !versionId
    || !contentHash || versionId !== `understanding-version:${contentHash.slice("sha256:".length)}`
    || !claimSetHash || !createdAt || !events || !suppliedStatus
    || typeof record.reviewHash !== "string" || !HASH.test(record.reviewHash)) return null;

  const parsedEvents: BusinessUnderstandingReviewEvent[] = [];
  let status: BusinessUnderstandingReviewStatus = "draft";
  let lastAt = createdAt;
  let replacementVersionId: string | null = null;
  for (const value of events) {
    const event = parseReviewEvent(value, versionId);
    if (!event || event.from !== status || Date.parse(event.at) <= Date.parse(lastAt)) return null;
    status = event.to;
    lastAt = event.at;
    replacementVersionId = event.replacementVersionId;
    parsedEvents.push(event);
  }
  if (status !== suppliedStatus || record.replacementVersionId !== replacementVersionId) return null;
  const canonical = createReviewSnapshot({
    versionId,
    tenantId,
    workspaceId,
    contentHash,
    claimSetHash,
    createdAt,
    status,
    events: Object.freeze(parsedEvents),
    replacementVersionId,
  });
  return canonical.reviewHash === record.reviewHash ? canonical : null;
}

function rejectReview(
  code: Exclude<BusinessUnderstandingReviewResult, { ok: true }>["code"],
): BusinessUnderstandingReviewResult {
  return Object.freeze({ ok: false, code });
}

function citation(evidence: ParsedEvidence): UnderstandingCitation {
  return Object.freeze({
    evidenceId: evidence.evidenceId,
    sourceVersionRef: evidence.sourceVersionRef,
    locator: evidence.locator,
    contentHash: evidence.contentHash,
    grade: evidence.grade,
    freshness: evidence.freshness,
  });
}

export function buildBusinessUnderstandingProposal(input: unknown): BusinessUnderstandingProposalResult {
  try {
    const record = exactRecord(input, INPUT_FIELDS);
    if (!record || record.version !== BUSINESS_UNDERSTANDING_SCHEMA_VERSION) return reject("MALFORMED_INPUT");
    const tenantId = uuid(record.tenantId);
    const workspaceId = optionalWorkspace(record.workspaceId);
    const proposalRef = reference(record.proposalRef);
    const revision = integer(record.revision, 1, 1_000_000);
    const supersedesProposalRef = record.supersedesProposalRef === null ? null : reference(record.supersedesProposalRef);
    const createdAt = boundedText(record.createdAt, 40);
    const producer = parseProducer(record.producer);
    const rawEvidence = exactArray(record.evidence, 500);
    const rawClaims = exactArray(record.claims, 100);
    if (!tenantId || workspaceId === undefined || !proposalRef || revision === null || !createdAt || !producer
      || !rawEvidence || !rawClaims?.length || (record.supersedesProposalRef !== null && !supersedesProposalRef)) {
      return reject("MALFORMED_INPUT");
    }
    const epoch = Date.parse(createdAt);
    if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== createdAt) return reject("MALFORMED_INPUT");
    if ((revision === 1 && supersedesProposalRef !== null)
      || (revision > 1 && supersedesProposalRef === null)
      || supersedesProposalRef === proposalRef) return reject("VERSION_CONFLICT");

    const scope = Object.freeze({ tenantId, workspaceId });
    const evidenceById = new Map<string, ParsedEvidence>();
    for (const rawItem of rawEvidence) {
      const item = parseEvidence(rawItem);
      if (!item || evidenceById.has(item.evidenceId)) return reject("MALFORMED_INPUT");
      if (!sameScope(scope, item)) return reject("SCOPE_MISMATCH");
      evidenceById.set(item.evidenceId, item);
    }

    const claims: ParsedClaim[] = [];
    const claimIds = new Set<string>();
    for (const rawClaim of rawClaims) {
      const parsed = parseClaim(rawClaim);
      if (!parsed || claimIds.has(parsed.claimId)) return reject("MALFORMED_INPUT");
      if (!sameScope(scope, parsed)) return reject("SCOPE_MISMATCH");
      claimIds.add(parsed.claimId);
      claims.push(parsed);
    }
    claims.sort((left, right) => compareAscii(left.domain, right.domain)
      || compareAscii(left.subject, right.subject)
      || compareAscii(left.claimId, right.claimId));

    const facts: UnderstandingFact[] = [];
    const uncertainties: UnderstandingUncertainty[] = [];
    let materialClaimsWithCurrentEvidence = 0;
    for (const claim of claims) {
      const isUnknown = claim.status === "unknown";
      if (isUnknown) {
        if (claim.origin !== "unknown" || claim.confidenceBasisPoints !== 0
          || claim.evidenceIds.length !== 0 || claim.uncertaintyReason === null) {
          return reject("EVIDENCE_INELIGIBLE");
        }
        uncertainties.push(Object.freeze({
          claimId: claim.claimId,
          claimVersion: claim.claimVersion,
          domain: claim.domain,
          claimClass: claim.claimClass,
          subject: claim.subject,
          statement: claim.statement,
          reason: claim.uncertaintyReason,
          confidenceBasisPoints: 0,
          material: claim.material,
        }));
        continue;
      }
      if (claim.origin === "unknown" || claim.evidenceIds.length === 0 || claim.uncertaintyReason !== null) {
        return reject("EVIDENCE_INELIGIBLE");
      }
      const resolved: ParsedEvidence[] = [];
      for (const evidenceId of claim.evidenceIds) {
        const item = evidenceById.get(evidenceId);
        if (!item) return reject("EVIDENCE_UNRESOLVABLE");
        resolved.push(item);
      }
      resolved.sort((left, right) => compareAscii(left.evidenceId, right.evidenceId));
      if (claim.claimClass === "negative_absence") return reject("EVIDENCE_INELIGIBLE");
      if (claim.status === "supported"
        && (claim.origin === "inferred"
          || resolved.some((item) => item.freshness !== "current" || !SUPPORTED_GRADES.has(item.grade))
          || (DIRECT_SUPPORT_CLASSES.has(claim.claimClass)
            && !resolved.some((item) => item.grade === "direct_observation" || item.grade === "corroborated")))) {
        return reject("EVIDENCE_INELIGIBLE");
      }
      if (claim.status === "conflicted" && !resolved.some((item) => item.grade === "conflicted")) {
        return reject("EVIDENCE_INELIGIBLE");
      }
      if (claim.status === "proposed" && resolved.some((item) => item.freshness !== "current"
        || item.grade === "conflicted" || item.grade === "stale" || item.grade === "unknown")) {
        return reject("EVIDENCE_INELIGIBLE");
      }
      if (claim.material && resolved.every((item) => item.freshness === "current"
        && item.grade !== "conflicted" && item.grade !== "stale" && item.grade !== "unknown")) {
        materialClaimsWithCurrentEvidence += 1;
      }
      facts.push(Object.freeze({
        claimId: claim.claimId,
        claimVersion: claim.claimVersion,
        domain: claim.domain,
        claimClass: claim.claimClass,
        subject: claim.subject,
        statement: claim.statement,
        origin: claim.origin,
        claimStatus: claim.status,
        reviewState: "pending",
        confidenceBasisPoints: claim.confidenceBasisPoints,
        material: claim.material,
        citations: Object.freeze(resolved.map(citation)),
      } as UnderstandingFact));
    }

    const domainNames = Array.from(new Set(claims.map((claim) => claim.domain))).sort(compareAscii);
    const domains = Object.freeze(domainNames.map((domain) => {
      const domainFacts = Object.freeze(facts.filter((fact) => fact.domain === domain));
      const domainUnknowns = uncertainties.filter((uncertainty) => uncertainty.domain === domain);
      const state: UnderstandingDomainState = domainFacts.some((fact) => fact.claimStatus === "conflicted")
        ? "conflict"
        : domainFacts.length === 0 && domainUnknowns.length > 0
          ? "unknown"
          : domainFacts.every((fact) => fact.claimStatus === "supported") && domainUnknowns.length === 0
            ? "supported"
            : "partial";
      return Object.freeze({ domain, state, facts: domainFacts });
    }));
    const frozenUncertainties = Object.freeze(uncertainties);
    const materialClaims = claims.filter((claim) => claim.material).length;
    const explicitUnknowns = claims.filter((claim) => claim.status === "unknown").length;
    const materialConfidenceTotal = claims
      .filter((claim) => claim.material)
      .reduce((total, claim) => total + claim.confidenceBasisPoints, 0);
    const coverage = Object.freeze({
      materialClaims,
      materialClaimsWithCurrentEvidence,
      explicitUnknowns,
      currentEvidenceBasisPoints: materialClaims === 0
        ? 0
        : Math.floor((materialClaimsWithCurrentEvidence * 10_000) / materialClaims),
      materialConfidenceBasisPoints: materialClaims === 0
        ? 0
        : Math.floor(materialConfidenceTotal / materialClaims),
    });
    const claimSetHash = sha256(claims.map((claim) => ({
      claimId: claim.claimId,
      claimVersion: claim.claimVersion,
      domain: claim.domain,
      claimClass: claim.claimClass,
      subject: claim.subject,
      statement: claim.statement,
      origin: claim.origin,
      status: claim.status,
      confidenceBasisPoints: claim.confidenceBasisPoints,
      material: claim.material,
      evidenceIds: claim.evidenceIds,
      uncertaintyReason: claim.uncertaintyReason,
    })));
    const proposalContent = {
      version: BUSINESS_UNDERSTANDING_SCHEMA_VERSION,
      proposalRef,
      tenantId,
      workspaceId,
      revision,
      supersedesProposalRef,
      status: "review_required" as const,
      reviewState: "pending" as const,
      claimSetHash,
      createdAt,
      producer,
      domains,
      uncertainties: frozenUncertainties,
      coverage,
    };
    const contentHash = sha256(proposalContent);
    const versionId = `understanding-version:${contentHash.slice("sha256:".length)}`;
    const review = createReviewSnapshot({
      versionId,
      tenantId,
      workspaceId,
      contentHash,
      claimSetHash,
      createdAt,
      status: "draft",
      events: Object.freeze([]),
      replacementVersionId: null,
    });
    const proposal: BusinessUnderstandingProposal = Object.freeze({
      ...proposalContent,
      versionId,
      contentHash,
      review,
    });
    return Object.freeze({ ok: true, code: "PROPOSAL_CREATED", proposal });
  } catch {
    return reject("MALFORMED_INPUT");
  }
}

/**
 * Pure review-state boundary. Authorization remains the caller service's job;
 * this function only accepts an exact human decision bound to one immutable
 * scope, content version, and prior review hash.
 */
export function transitionBusinessUnderstandingReview(value: unknown): BusinessUnderstandingReviewResult {
  try {
    const input = exactRecord(value, REVIEW_TRANSITION_FIELDS);
    if (!input || input.version !== 1) return rejectReview("MALFORMED_INPUT");
    const current = parseReviewSnapshot(input.current);
    const tenantId = uuid(input.tenantId);
    const workspaceId = optionalWorkspace(input.workspaceId);
    const actor = exactRecord(input.actor, REVIEW_ACTOR_FIELDS);
    const actorId = actor && uuid(actor.actorId);
    const to = enumValue(input.to, REVIEW_STATUSES);
    const at = canonicalTimestamp(input.at);
    const reason = boundedText(input.reason, 2_000);
    const replacementVersionId = input.replacementVersionId === null
      ? null
      : typeof input.replacementVersionId === "string" && VERSION_ID.test(input.replacementVersionId)
        ? input.replacementVersionId : undefined;
    if (!current || !tenantId || workspaceId === undefined || !actor || !actorId || !to || to === "draft"
      || !at || !reason || replacementVersionId === undefined
      || typeof input.expectedVersionId !== "string" || !VERSION_ID.test(input.expectedVersionId)
      || typeof input.expectedContentHash !== "string" || !HASH.test(input.expectedContentHash)
      || typeof input.expectedReviewHash !== "string" || !HASH.test(input.expectedReviewHash)) {
      return rejectReview("MALFORMED_INPUT");
    }
    if (tenantId !== current.tenantId || workspaceId !== current.workspaceId) {
      return rejectReview("SCOPE_MISMATCH");
    }
    if (input.expectedVersionId !== current.versionId || input.expectedContentHash !== current.contentHash
      || input.expectedReviewHash !== current.reviewHash) return rejectReview("STALE_VERSION");
    if (actor.kind !== "human") return rejectReview("HUMAN_REVIEW_REQUIRED");
    if (!allowedReviewTransition(current.status, to)
      || Date.parse(at) <= Date.parse(current.events.at(-1)?.at ?? current.createdAt)
      || (to === "superseded" && (!replacementVersionId || replacementVersionId === current.versionId))
      || (to !== "superseded" && replacementVersionId !== null)) {
      return rejectReview("INVALID_TRANSITION");
    }

    const event: BusinessUnderstandingReviewEvent = Object.freeze({
      from: current.status,
      to,
      actor: Object.freeze({ kind: "human" as const, actorId }),
      at,
      reason,
      replacementVersionId,
    });
    const review = createReviewSnapshot({
      versionId: current.versionId,
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      contentHash: current.contentHash,
      claimSetHash: current.claimSetHash,
      createdAt: current.createdAt,
      status: to,
      events: Object.freeze([...current.events, event]),
      replacementVersionId,
    });
    return Object.freeze({ ok: true, code: "REVIEW_TRANSITIONED", review });
  } catch {
    return rejectReview("MALFORMED_INPUT");
  }
}
