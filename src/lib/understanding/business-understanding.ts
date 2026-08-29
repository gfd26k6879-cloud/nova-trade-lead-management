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

type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;

export type UnderstandingProducer = Readonly<{
  runRef: string;
  agentVersion: string;
  promptRef: string;
  policyRef: string;
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
  material: boolean;
}>;

export type BusinessUnderstandingProposal = Scope & Readonly<{
  version: typeof BUSINESS_UNDERSTANDING_SCHEMA_VERSION;
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
  }>;
}>;

export type BusinessUnderstandingProposalResult =
  | Readonly<{ ok: true; code: "PROPOSAL_CREATED"; proposal: BusinessUnderstandingProposal }>
  | Readonly<{
    ok: false;
    code: "MALFORMED_INPUT" | "VERSION_CONFLICT" | "SCOPE_MISMATCH" | "EVIDENCE_UNRESOLVABLE" | "EVIDENCE_INELIGIBLE";
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
  material: boolean;
  evidenceIds: readonly string[];
  uncertaintyReason: string | null;
}>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "proposalRef", "revision", "supersedesProposalRef",
  "createdAt", "producer", "evidence", "claims",
] as const;
const PRODUCER_FIELDS = ["runRef", "agentVersion", "promptRef", "policyRef"] as const;
const EVIDENCE_FIELDS = [
  "evidenceId", "tenantId", "workspaceId", "sourceVersionRef", "locator", "contentHash", "grade", "freshness",
] as const;
const CLAIM_FIELDS = [
  "claimId", "claimVersion", "tenantId", "workspaceId", "domain", "claimClass", "subject", "statement",
  "origin", "status", "material", "evidenceIds", "uncertaintyReason",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
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
  if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return null;
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
  if (typeof value !== "object" || value === null || !Array.isArray(value) || isProxy(value)) return null;
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
  const agentVersion = reference(record.agentVersion);
  const promptRef = reference(record.promptRef);
  const policyRef = reference(record.policyRef);
  return runRef && agentVersion && promptRef && policyRef
    ? Object.freeze({ runRef, agentVersion, promptRef, policyRef })
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
  const evidenceIds = parseEvidenceIds(record.evidenceIds);
  const uncertaintyReason = record.uncertaintyReason === null ? null : boundedText(record.uncertaintyReason, 2_000);
  if (!claimId || claimVersion === null || !tenantId || workspaceId === undefined || !domain || !claimClass
    || !subject || !statement || !origin || !status || typeof record.material !== "boolean" || !evidenceIds) return null;
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
        if (claim.origin !== "unknown" || claim.evidenceIds.length !== 0 || claim.uncertaintyReason === null) {
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
    const coverage = Object.freeze({
      materialClaims,
      materialClaimsWithCurrentEvidence,
      explicitUnknowns,
      currentEvidenceBasisPoints: materialClaims === 0
        ? 0
        : Math.floor((materialClaimsWithCurrentEvidence * 10_000) / materialClaims),
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
      material: claim.material,
      evidenceIds: claim.evidenceIds,
      uncertaintyReason: claim.uncertaintyReason,
    })));
    const proposalWithoutContentHash = {
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
    const proposal: BusinessUnderstandingProposal = Object.freeze({
      ...proposalWithoutContentHash,
      contentHash: sha256(proposalWithoutContentHash),
    });
    return Object.freeze({ ok: true, code: "PROPOSAL_CREATED", proposal });
  } catch {
    return reject("MALFORMED_INPUT");
  }
}
