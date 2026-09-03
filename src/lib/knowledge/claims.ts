import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import type {
  KnowledgeEvidenceRecord,
  KnowledgeEvidenceScope,
  RenderSafeKnowledgeCitation,
} from "./evidence-citations";
import type { RenderSafeSourceLocator } from "./extraction-pipeline";

export const KNOWLEDGE_CLAIM_MAX_PROPOSALS = 100;
export const KNOWLEDGE_CLAIM_MAX_SUPPORTS = 256;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const HASH_REF = /^sha256:[0-9a-f]{64}$/u;
const EVIDENCE_ID = /^evidence:[0-9a-f]{64}$/u;
const CITATION_ID = /^citation:[0-9a-f]{64}$/u;
const CLAIM_ID = /^claim:[0-9a-f]{64}$/u;
const CLAIM_VERSION_ID = /^claim-version:[0-9a-f]{64}$/u;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PARSER_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const PARSER_VERSION = /^[a-z0-9][a-z0-9._+-]{0,63}$/u;
const PREDICATE = /^[a-z][a-z0-9._-]{0,127}$/u;

const INPUT_FIELDS = ["version", "scope", "evidence", "citations", "proposals"] as const;
const SCOPE_FIELDS = [
  "tenantId", "workspaceId", "documentId", "documentVersionId", "checksum", "scannerPolicyVersion",
] as const;
const EVIDENCE_FIELDS = [
  "evidenceVersion", "evidenceId", "tenantId", "workspaceId", "documentId", "documentVersionId",
  "checksum", "scannerPolicyVersion", "extractionInputHash", "parserId", "parserVersion", "evidenceGrade",
  "origin", "blockOrdinal", "blockContentHash", "sourceLocator", "quoteStart", "quoteEnd", "quote", "quoteHash",
] as const;
const CITATION_FIELDS = [
  "citationVersion", "citationId", "evidenceId", "state", "tenantId", "workspaceId", "documentId",
  "documentVersionId", "quote", "quoteHash", "sourceLocator", "display",
] as const;
const DISPLAY_FIELDS = ["sourceLabel", "locatorLabel"] as const;
const LINE_LOCATOR_FIELDS = ["kind", "label", "startLine", "endLine"] as const;
const ROW_LOCATOR_FIELDS = ["kind", "label", "row"] as const;
const PROPOSAL_FIELDS = [
  "claimClass", "subject", "predicate", "value", "unit", "polarity", "material",
  "confidenceBasisPoints", "uncertainty", "citationIds",
] as const;
const CLAIM_FIELDS = [
  "claimSchemaVersion", "claimId", "claimVersionId", "claimVersion", "supersedesClaimVersionId",
  "tenantId", "workspaceId", "documentId", "documentVersionId", "checksum", "scannerPolicyVersion",
  "claimClass", "subject", "predicate", "value", "unit", "polarity", "material",
  "confidenceBasisPoints", "uncertainty", "origin", "evidenceGrade", "claimStatus", "reviewState",
  "reviewerId", "reviewReason", "citationIds", "evidenceIds",
] as const;
const TRANSITION_FIELDS = [
  "version", "scope", "claim", "evidence", "citations", "expectedReviewState", "decision",
] as const;
const DECISION_FIELDS = ["state", "reviewerId", "reason"] as const;

type PlainRecord = Record<string, unknown>;

export type KnowledgeClaimClass =
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

export type KnowledgeClaimPolarity = "positive" | "negative" | "conditional" | "unknown";
export type KnowledgeClaimReviewState = "proposed" | "accepted" | "rejected";

const CLAIM_CLASSES = new Set<KnowledgeClaimClass>([
  "identity", "product_technical_specification", "compatibility_application", "regulatory_compliance",
  "safety", "performance", "pricing_commercial", "capacity_supply", "geography", "contact_role",
  "personalization", "negative_absence", "customer_provided_strategic_fact",
]);
const POLARITIES = new Set<KnowledgeClaimPolarity>(["positive", "negative", "conditional", "unknown"]);

export type KnowledgeClaimProposal = Readonly<{
  claimClass: KnowledgeClaimClass;
  subject: string;
  predicate: string;
  value: string;
  unit: string | null;
  polarity: KnowledgeClaimPolarity;
  material: boolean;
  confidenceBasisPoints: number;
  uncertainty: string | null;
  citationIds: readonly string[];
}>;

export type CitedKnowledgeClaimVersion = Readonly<{
  claimSchemaVersion: 1;
  claimId: string;
  claimVersionId: string;
  claimVersion: number;
  supersedesClaimVersionId: string | null;
  tenantId: string;
  workspaceId: string;
  documentId: string;
  documentVersionId: string;
  checksum: string;
  scannerPolicyVersion: string;
  claimClass: KnowledgeClaimClass;
  subject: string;
  predicate: string;
  value: string;
  unit: string | null;
  polarity: KnowledgeClaimPolarity;
  material: boolean;
  confidenceBasisPoints: number;
  uncertainty: string | null;
  origin: "extracted";
  evidenceGrade: "extracted";
  claimStatus: "proposed";
  reviewState: KnowledgeClaimReviewState;
  reviewerId: string | null;
  reviewReason: string | null;
  citationIds: readonly string[];
  evidenceIds: readonly string[];
}>;

export type CreateCitedKnowledgeClaimsInput = Readonly<{
  version: 1;
  scope: KnowledgeEvidenceScope;
  evidence: readonly KnowledgeEvidenceRecord[];
  citations: readonly RenderSafeKnowledgeCitation[];
  proposals: readonly KnowledgeClaimProposal[];
}>;

export type KnowledgeClaimsResult = Readonly<
  | { ok: true; code: "CLAIMS_PROPOSED"; claims: readonly CitedKnowledgeClaimVersion[] }
  | {
    ok: false;
    code: "MALFORMED_INPUT" | "SCOPE_MISMATCH" | "EVIDENCE_MISMATCH" | "CITATION_REQUIRED" | "DUPLICATE_ID";
  }
>;

export type KnowledgeClaimReviewTransitionInput = Readonly<{
  version: 1;
  scope: KnowledgeEvidenceScope;
  claim: CitedKnowledgeClaimVersion;
  evidence: readonly KnowledgeEvidenceRecord[];
  citations: readonly RenderSafeKnowledgeCitation[];
  expectedReviewState: KnowledgeClaimReviewState;
  decision: Readonly<{
    state: Exclude<KnowledgeClaimReviewState, "proposed">;
    reviewerId: string;
    reason: string;
  }>;
}>;

export type KnowledgeClaimReviewTransitionResult = Readonly<
  | { ok: true; code: "CLAIM_REVIEW_TRANSITIONED"; claim: CitedKnowledgeClaimVersion }
  | {
    ok: false;
    code: "MALFORMED_INPUT" | "SCOPE_MISMATCH" | "EVIDENCE_MISMATCH" | "INVALID_TRANSITION";
  }
>;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const expected = new Set(fields);
    if (keys.length !== fields.length
      || keys.some((key) => typeof key !== "string" || !expected.has(key))) return null;
    const record: PlainRecord = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      record[field] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value) || !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor)
      || typeof lengthDescriptor.value !== "number" || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0 || lengthDescriptor.value > maximum) return null;
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || keys.some((key) => typeof key === "symbol"
      || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number
    : null;
}

function unsafeText(value: string): boolean {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufeff]/u.test(value)) return true;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
}

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value.trim().length > 0 && !unsafeText(value) ? value : null;
}

function hashReference(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    const bytes = Buffer.from(part, "utf8");
    hash.update(String(bytes.byteLength));
    hash.update(":");
    hash.update(bytes);
    hash.update(";");
  }
  return `sha256:${hash.digest("hex")}`;
}

function stableId(prefix: "evidence" | "citation" | "claim" | "claim-version", parts: readonly string[]): string {
  return `${prefix}:${hashReference(parts).slice("sha256:".length)}`;
}

function parseLocator(value: unknown): RenderSafeSourceLocator | null {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kindDescriptor || !("value" in kindDescriptor) || !kindDescriptor.enumerable) return null;
  if (kindDescriptor.value === "line_range") {
    const record = exactRecord(value, LINE_LOCATOR_FIELDS);
    const startLine = record && integer(record.startLine, 1, 500_000);
    const endLine = record && integer(record.endLine, 1, 500_000);
    if (!record || startLine === null || endLine === null || endLine < startLine) return null;
    const label = startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`;
    return record.label === label ? Object.freeze({ kind: "line_range", label, startLine, endLine }) : null;
  }
  if (kindDescriptor.value === "row") {
    const record = exactRecord(value, ROW_LOCATOR_FIELDS);
    const row = record && integer(record.row, 1, 100_000);
    if (!record || row === null) return null;
    const label = `Row ${row}`;
    return record.label === label ? Object.freeze({ kind: "row", label, row }) : null;
  }
  return null;
}

function sameLocator(left: RenderSafeSourceLocator, right: RenderSafeSourceLocator): boolean {
  return left.kind === right.kind && left.label === right.label
    && (left.kind === "line_range" && right.kind === "line_range"
      ? left.startLine === right.startLine && left.endLine === right.endLine
      : left.kind === "row" && right.kind === "row" && left.row === right.row);
}

function parseScope(value: unknown): KnowledgeEvidenceScope | null {
  const record = exactRecord(value, SCOPE_FIELDS);
  if (!record || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || typeof record.workspaceId !== "string" || !UUID.test(record.workspaceId)
    || typeof record.documentId !== "string" || !UUID.test(record.documentId)
    || typeof record.documentVersionId !== "string" || !UUID.test(record.documentVersionId)
    || typeof record.checksum !== "string" || !SHA256.test(record.checksum)
    || typeof record.scannerPolicyVersion !== "string" || !POLICY_VERSION.test(record.scannerPolicyVersion)) {
    return null;
  }
  return Object.freeze({
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    checksum: record.checksum,
    scannerPolicyVersion: record.scannerPolicyVersion,
  });
}

function sameScope(scope: KnowledgeEvidenceScope, value: KnowledgeEvidenceScope): boolean {
  return scope.tenantId === value.tenantId && scope.workspaceId === value.workspaceId
    && scope.documentId === value.documentId && scope.documentVersionId === value.documentVersionId
    && scope.checksum === value.checksum && scope.scannerPolicyVersion === value.scannerPolicyVersion;
}

function parseEvidence(value: unknown): KnowledgeEvidenceRecord | null {
  const record = exactRecord(value, EVIDENCE_FIELDS);
  const sourceLocator = record && parseLocator(record.sourceLocator);
  const blockOrdinal = record && integer(record.blockOrdinal, 0, 499_999);
  const quoteStart = record && integer(record.quoteStart, 0, 32_767);
  const quoteEnd = record && integer(record.quoteEnd, 1, 32_767);
  if (!record || record.evidenceVersion !== 1 || typeof record.evidenceId !== "string"
    || !EVIDENCE_ID.test(record.evidenceId) || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || typeof record.workspaceId !== "string" || !UUID.test(record.workspaceId)
    || typeof record.documentId !== "string" || !UUID.test(record.documentId)
    || typeof record.documentVersionId !== "string" || !UUID.test(record.documentVersionId)
    || typeof record.checksum !== "string" || !SHA256.test(record.checksum)
    || typeof record.scannerPolicyVersion !== "string" || !POLICY_VERSION.test(record.scannerPolicyVersion)
    || typeof record.extractionInputHash !== "string" || !HASH_REF.test(record.extractionInputHash)
    || typeof record.parserId !== "string" || !PARSER_ID.test(record.parserId)
    || typeof record.parserVersion !== "string" || !PARSER_VERSION.test(record.parserVersion)
    || record.evidenceGrade !== "extracted" || record.origin !== "parser_output"
    || blockOrdinal === null || typeof record.blockContentHash !== "string" || !HASH_REF.test(record.blockContentHash)
    || !sourceLocator || quoteStart === null || quoteEnd === null || quoteEnd <= quoteStart
    || typeof record.quote !== "string" || record.quote.length !== quoteEnd - quoteStart
    || record.quote.length > 4096 || record.quote.length === 0 || unsafeText(record.quote)
    || typeof record.quoteHash !== "string" || !HASH_REF.test(record.quoteHash)) return null;
  const quoteHash = `sha256:${createHash("sha256").update(record.quote, "utf8").digest("hex")}`;
  if (record.quoteHash !== quoteHash || Buffer.byteLength(record.quote, "utf8") > 4096) return null;
  const evidenceId = stableId("evidence", [
    "knowledge-evidence-v1", record.tenantId, record.workspaceId, record.documentId,
    record.documentVersionId, record.checksum, record.scannerPolicyVersion, record.extractionInputHash,
    String(blockOrdinal), record.blockContentHash, JSON.stringify(sourceLocator),
    String(quoteStart), String(quoteEnd), quoteHash,
  ]);
  if (record.evidenceId !== evidenceId) return null;
  return Object.freeze({
    evidenceVersion: 1,
    evidenceId,
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    checksum: record.checksum,
    scannerPolicyVersion: record.scannerPolicyVersion,
    extractionInputHash: record.extractionInputHash,
    parserId: record.parserId,
    parserVersion: record.parserVersion,
    evidenceGrade: "extracted",
    origin: "parser_output",
    blockOrdinal,
    blockContentHash: record.blockContentHash,
    sourceLocator,
    quoteStart,
    quoteEnd,
    quote: record.quote,
    quoteHash,
  });
}

function parseCitation(value: unknown): RenderSafeKnowledgeCitation | null {
  const record = exactRecord(value, CITATION_FIELDS);
  const sourceLocator = record && parseLocator(record.sourceLocator);
  const display = record && exactRecord(record.display, DISPLAY_FIELDS);
  if (!record || record.citationVersion !== 1 || typeof record.citationId !== "string"
    || !CITATION_ID.test(record.citationId) || typeof record.evidenceId !== "string"
    || !EVIDENCE_ID.test(record.evidenceId) || record.state !== "resolved"
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || typeof record.workspaceId !== "string" || !UUID.test(record.workspaceId)
    || typeof record.documentId !== "string" || !UUID.test(record.documentId)
    || typeof record.documentVersionId !== "string" || !UUID.test(record.documentVersionId)
    || typeof record.quote !== "string" || record.quote.length === 0 || record.quote.length > 4096
    || unsafeText(record.quote) || typeof record.quoteHash !== "string" || !HASH_REF.test(record.quoteHash)
    || !sourceLocator || !display || display.sourceLabel !== "Private document"
    || display.locatorLabel !== sourceLocator.label) return null;
  const quoteHash = `sha256:${createHash("sha256").update(record.quote, "utf8").digest("hex")}`;
  const citationId = stableId("citation", ["knowledge-citation-v1", record.evidenceId]);
  if (record.quoteHash !== quoteHash || record.citationId !== citationId
    || Buffer.byteLength(record.quote, "utf8") > 4096) return null;
  return Object.freeze({
    citationVersion: 1,
    citationId,
    evidenceId: record.evidenceId,
    state: "resolved",
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    quote: record.quote,
    quoteHash,
    sourceLocator,
    display: Object.freeze({ sourceLabel: "Private document", locatorLabel: sourceLocator.label }),
  });
}

function parseProposal(value: unknown): KnowledgeClaimProposal | null {
  const record = exactRecord(value, PROPOSAL_FIELDS);
  const subject = record && text(record.subject, 512);
  const claimValue = record && text(record.value, 2048);
  const unit = record && (record.unit === null ? null : text(record.unit, 64));
  const uncertainty = record && (record.uncertainty === null ? null : text(record.uncertainty, 1000));
  const confidenceBasisPoints = record && integer(record.confidenceBasisPoints, 0, 10_000);
  const citationIds = record && exactArray(record.citationIds, KNOWLEDGE_CLAIM_MAX_SUPPORTS);
  if (!record || typeof record.claimClass !== "string" || !CLAIM_CLASSES.has(record.claimClass as KnowledgeClaimClass)
    || !subject || typeof record.predicate !== "string" || !PREDICATE.test(record.predicate)
    || !claimValue || unit === undefined || typeof record.polarity !== "string"
    || !POLARITIES.has(record.polarity as KnowledgeClaimPolarity) || typeof record.material !== "boolean"
    || confidenceBasisPoints === null || uncertainty === undefined || !citationIds) return null;
  const normalizedCitationIds: string[] = [];
  for (const citationId of citationIds) {
    if (typeof citationId !== "string" || !CITATION_ID.test(citationId)
      || normalizedCitationIds.includes(citationId)) return null;
    normalizedCitationIds.push(citationId);
  }
  normalizedCitationIds.sort();
  return Object.freeze({
    claimClass: record.claimClass as KnowledgeClaimClass,
    subject,
    predicate: record.predicate,
    value: claimValue,
    unit,
    polarity: record.polarity as KnowledgeClaimPolarity,
    material: record.material,
    confidenceBasisPoints,
    uncertainty,
    citationIds: Object.freeze(normalizedCitationIds),
  });
}

function claimIdFor(scope: KnowledgeEvidenceScope, proposal: Pick<
KnowledgeClaimProposal, "claimClass" | "subject" | "predicate"
>): string {
  return stableId("claim", [
    "knowledge-claim-v1", scope.tenantId, scope.workspaceId, scope.documentId,
    scope.documentVersionId, proposal.claimClass, proposal.subject, proposal.predicate,
  ]);
}

function claimVersionIdFor(
  scope: KnowledgeEvidenceScope,
  claimId: string,
  version: number,
  proposal: Pick<KnowledgeClaimProposal,
  "value" | "unit" | "polarity" | "material" | "confidenceBasisPoints" | "uncertainty" | "citationIds">,
  review: Readonly<{
    state: KnowledgeClaimReviewState;
    supersedesClaimVersionId: string | null;
    reviewerId: string | null;
    reason: string | null;
  }>,
): string {
  return stableId("claim-version", [
    "knowledge-claim-version-v1", claimId, String(version), scope.checksum, scope.scannerPolicyVersion,
    proposal.value, proposal.unit ?? "", proposal.polarity, String(proposal.material),
    String(proposal.confidenceBasisPoints), proposal.uncertainty ?? "", review.state,
    review.supersedesClaimVersionId ?? "", review.reviewerId ?? "", review.reason ?? "",
    ...proposal.citationIds,
  ]);
}

function parseStringIds(
  value: unknown,
  pattern: RegExp,
  maximum: number,
): readonly string[] | null {
  const rawIds = exactArray(value, maximum);
  if (!rawIds) return null;
  const ids: string[] = [];
  for (const rawId of rawIds) {
    if (typeof rawId !== "string" || !pattern.test(rawId) || ids.includes(rawId)) return null;
    ids.push(rawId);
  }
  ids.sort();
  return Object.freeze(ids);
}

function parseClaim(value: unknown): CitedKnowledgeClaimVersion | null {
  const record = exactRecord(value, CLAIM_FIELDS);
  if (!record) return null;
  const scope = parseScope({
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    checksum: record.checksum,
    scannerPolicyVersion: record.scannerPolicyVersion,
  });
  const claimVersion = integer(record.claimVersion, 1, 1_000_000);
  const subject = text(record.subject, 512);
  const claimValue = text(record.value, 2048);
  const unit = record.unit === null ? null : text(record.unit, 64);
  const uncertainty = record.uncertainty === null ? null : text(record.uncertainty, 1000);
  const confidenceBasisPoints = integer(record.confidenceBasisPoints, 0, 10_000);
  const citationIds = parseStringIds(record.citationIds, CITATION_ID, KNOWLEDGE_CLAIM_MAX_SUPPORTS);
  const evidenceIds = parseStringIds(record.evidenceIds, EVIDENCE_ID, KNOWLEDGE_CLAIM_MAX_SUPPORTS);
  const supersedesClaimVersionId = record.supersedesClaimVersionId === null
    ? null
    : typeof record.supersedesClaimVersionId === "string" && CLAIM_VERSION_ID.test(record.supersedesClaimVersionId)
      ? record.supersedesClaimVersionId
      : undefined;
  const reviewerId = record.reviewerId === null
    ? null
    : typeof record.reviewerId === "string" && UUID.test(record.reviewerId) ? record.reviewerId : undefined;
  const reviewReason = record.reviewReason === null ? null : text(record.reviewReason, 1000);
  if (record.claimSchemaVersion !== 1 || !scope || typeof record.claimId !== "string"
    || !CLAIM_ID.test(record.claimId) || typeof record.claimVersionId !== "string"
    || !CLAIM_VERSION_ID.test(record.claimVersionId) || claimVersion === null
    || supersedesClaimVersionId === undefined || typeof record.claimClass !== "string"
    || !CLAIM_CLASSES.has(record.claimClass as KnowledgeClaimClass) || !subject
    || typeof record.predicate !== "string" || !PREDICATE.test(record.predicate) || !claimValue
    || unit === undefined || typeof record.polarity !== "string"
    || !POLARITIES.has(record.polarity as KnowledgeClaimPolarity) || typeof record.material !== "boolean"
    || confidenceBasisPoints === null || uncertainty === undefined || record.origin !== "extracted"
    || record.evidenceGrade !== "extracted" || record.claimStatus !== "proposed"
    || (record.reviewState !== "proposed" && record.reviewState !== "accepted" && record.reviewState !== "rejected")
    || reviewerId === undefined || reviewReason === undefined || !citationIds || !evidenceIds
    || citationIds.length !== evidenceIds.length || (record.material && citationIds.length === 0)) return null;
  const proposal = {
    claimClass: record.claimClass as KnowledgeClaimClass,
    subject,
    predicate: record.predicate,
    value: claimValue,
    unit,
    polarity: record.polarity as KnowledgeClaimPolarity,
    material: record.material,
    confidenceBasisPoints,
    uncertainty,
    citationIds,
  };
  const claimId = claimIdFor(scope, proposal);
  const claimVersionId = claimVersionIdFor(scope, claimId, claimVersion, proposal, {
    state: record.reviewState,
    supersedesClaimVersionId,
    reviewerId,
    reason: reviewReason,
  });
  if (record.claimId !== claimId || record.claimVersionId !== claimVersionId) return null;
  if (record.reviewState === "proposed") {
    if (claimVersion !== 1 || supersedesClaimVersionId !== null || reviewerId !== null || reviewReason !== null) {
      return null;
    }
  } else if (claimVersion < 2 || supersedesClaimVersionId === null || reviewerId === null || reviewReason === null) {
    return null;
  }
  return Object.freeze({
    claimSchemaVersion: 1,
    claimId,
    claimVersionId,
    claimVersion,
    supersedesClaimVersionId,
    ...scope,
    ...proposal,
    origin: "extracted",
    evidenceGrade: "extracted",
    claimStatus: "proposed",
    reviewState: record.reviewState,
    reviewerId,
    reviewReason,
    evidenceIds,
  });
}

function failure(code: Exclude<KnowledgeClaimsResult, { ok: true }>["code"]): KnowledgeClaimsResult {
  return Object.freeze({ ok: false, code });
}

function citationMatchesEvidence(
  citation: RenderSafeKnowledgeCitation,
  evidence: KnowledgeEvidenceRecord,
): boolean {
  return citation.evidenceId === evidence.evidenceId && citation.tenantId === evidence.tenantId
    && citation.workspaceId === evidence.workspaceId && citation.documentId === evidence.documentId
    && citation.documentVersionId === evidence.documentVersionId && citation.quote === evidence.quote
    && citation.quoteHash === evidence.quoteHash && sameLocator(citation.sourceLocator, evidence.sourceLocator);
}

/**
 * Pure pre-persistence validator. A proposed review state never means approved
 * knowledge or action eligibility, and this function performs no inference.
 */
export function createCitedKnowledgeClaims(value: unknown): KnowledgeClaimsResult {
  const input = exactRecord(value, INPUT_FIELDS);
  const scope = input && parseScope(input.scope);
  const rawEvidence = input && exactArray(input.evidence, KNOWLEDGE_CLAIM_MAX_SUPPORTS);
  const rawCitations = input && exactArray(input.citations, KNOWLEDGE_CLAIM_MAX_SUPPORTS);
  const rawProposals = input && exactArray(input.proposals, KNOWLEDGE_CLAIM_MAX_PROPOSALS);
  if (!input || input.version !== 1 || !scope || !rawEvidence?.length
    || !rawCitations?.length || !rawProposals?.length) return failure("MALFORMED_INPUT");

  const evidenceById = new Map<string, KnowledgeEvidenceRecord>();
  for (const rawItem of rawEvidence) {
    const item = parseEvidence(rawItem);
    if (!item) return failure("MALFORMED_INPUT");
    if (evidenceById.has(item.evidenceId)) return failure("DUPLICATE_ID");
    if (!sameScope(scope, item)) return failure("SCOPE_MISMATCH");
    evidenceById.set(item.evidenceId, item);
  }

  const citationsById = new Map<string, RenderSafeKnowledgeCitation>();
  for (const rawItem of rawCitations) {
    const item = parseCitation(rawItem);
    if (!item) return failure("MALFORMED_INPUT");
    if (citationsById.has(item.citationId)) return failure("DUPLICATE_ID");
    const evidence = evidenceById.get(item.evidenceId);
    if (!evidence || !citationMatchesEvidence(item, evidence)) return failure("EVIDENCE_MISMATCH");
    if (item.tenantId !== scope.tenantId || item.workspaceId !== scope.workspaceId
      || item.documentId !== scope.documentId || item.documentVersionId !== scope.documentVersionId) {
      return failure("SCOPE_MISMATCH");
    }
    citationsById.set(item.citationId, item);
  }

  const claims: CitedKnowledgeClaimVersion[] = [];
  const claimIds = new Set<string>();
  for (const rawProposal of rawProposals) {
    const proposal = parseProposal(rawProposal);
    if (!proposal) return failure("MALFORMED_INPUT");
    if ((proposal.material && proposal.citationIds.length === 0)
      || (proposal.citationIds.length === 0 && proposal.uncertainty === null)) {
      return failure("CITATION_REQUIRED");
    }
    const evidenceIds: string[] = [];
    for (const citationId of proposal.citationIds) {
      const citation = citationsById.get(citationId);
      if (!citation) return failure("EVIDENCE_MISMATCH");
      evidenceIds.push(citation.evidenceId);
    }
    evidenceIds.sort();
    const claimId = claimIdFor(scope, proposal);
    if (claimIds.has(claimId)) return failure("DUPLICATE_ID");
    claimIds.add(claimId);
    const claimVersionId = claimVersionIdFor(scope, claimId, 1, proposal, {
      state: "proposed",
      supersedesClaimVersionId: null,
      reviewerId: null,
      reason: null,
    });
    claims.push(Object.freeze({
      claimSchemaVersion: 1,
      claimId,
      claimVersionId,
      claimVersion: 1,
      supersedesClaimVersionId: null,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      documentId: scope.documentId,
      documentVersionId: scope.documentVersionId,
      checksum: scope.checksum,
      scannerPolicyVersion: scope.scannerPolicyVersion,
      claimClass: proposal.claimClass,
      subject: proposal.subject,
      predicate: proposal.predicate,
      value: proposal.value,
      unit: proposal.unit,
      polarity: proposal.polarity,
      material: proposal.material,
      confidenceBasisPoints: proposal.confidenceBasisPoints,
      uncertainty: proposal.uncertainty,
      origin: "extracted",
      evidenceGrade: "extracted",
      claimStatus: "proposed",
      reviewState: "proposed",
      reviewerId: null,
      reviewReason: null,
      citationIds: proposal.citationIds,
      evidenceIds: Object.freeze(evidenceIds),
    }));
  }
  claims.sort((left, right) => left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0);
  return Object.freeze({ ok: true, code: "CLAIMS_PROPOSED", claims: Object.freeze(claims) });
}

function transitionFailure(
  code: Exclude<KnowledgeClaimReviewTransitionResult, { ok: true }>["code"],
): KnowledgeClaimReviewTransitionResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Applies an explicit reviewer disposition to a cited proposed version. The
 * caller remains responsible for resolving human authorization before calling.
 */
export function transitionCitedKnowledgeClaimReview(value: unknown): KnowledgeClaimReviewTransitionResult {
  const input = exactRecord(value, TRANSITION_FIELDS);
  const scope = input && parseScope(input.scope);
  const claim = input && parseClaim(input.claim);
  const decision = input && exactRecord(input.decision, DECISION_FIELDS);
  const rawEvidence = input && exactArray(input.evidence, KNOWLEDGE_CLAIM_MAX_SUPPORTS);
  const rawCitations = input && exactArray(input.citations, KNOWLEDGE_CLAIM_MAX_SUPPORTS);
  if (!input || input.version !== 1 || !scope || !claim || !decision || !rawEvidence?.length
    || !rawCitations?.length || (input.expectedReviewState !== "proposed"
      && input.expectedReviewState !== "accepted" && input.expectedReviewState !== "rejected")
    || (decision.state !== "accepted" && decision.state !== "rejected")
    || typeof decision.reviewerId !== "string" || !UUID.test(decision.reviewerId)
    || !text(decision.reason, 1000)) return transitionFailure("MALFORMED_INPUT");
  if (!sameScope(scope, claim)) return transitionFailure("SCOPE_MISMATCH");
  if (input.expectedReviewState !== claim.reviewState || claim.reviewState !== "proposed") {
    return transitionFailure("INVALID_TRANSITION");
  }

  const evidenceById = new Map<string, KnowledgeEvidenceRecord>();
  for (const rawItem of rawEvidence) {
    const item = parseEvidence(rawItem);
    if (!item || evidenceById.has(item.evidenceId)) return transitionFailure("MALFORMED_INPUT");
    if (!sameScope(scope, item)) return transitionFailure("SCOPE_MISMATCH");
    evidenceById.set(item.evidenceId, item);
  }
  const citationsById = new Map<string, RenderSafeKnowledgeCitation>();
  for (const rawItem of rawCitations) {
    const item = parseCitation(rawItem);
    if (!item || citationsById.has(item.citationId)) return transitionFailure("MALFORMED_INPUT");
    const evidence = evidenceById.get(item.evidenceId);
    if (!evidence || !citationMatchesEvidence(item, evidence)) return transitionFailure("EVIDENCE_MISMATCH");
    citationsById.set(item.citationId, item);
  }
  const evidenceIds: string[] = [];
  for (const citationId of claim.citationIds) {
    const citation = citationsById.get(citationId);
    if (!citation) return transitionFailure("EVIDENCE_MISMATCH");
    evidenceIds.push(citation.evidenceId);
  }
  evidenceIds.sort();
  if (evidenceIds.length !== claim.evidenceIds.length
    || evidenceIds.some((evidenceId, index) => evidenceId !== claim.evidenceIds[index])) {
    return transitionFailure("EVIDENCE_MISMATCH");
  }

  const nextVersion = claim.claimVersion + 1;
  const reason = decision.reason as string;
  const claimVersionId = claimVersionIdFor(scope, claim.claimId, nextVersion, claim, {
    state: decision.state,
    supersedesClaimVersionId: claim.claimVersionId,
    reviewerId: decision.reviewerId,
    reason,
  });
  const next: CitedKnowledgeClaimVersion = Object.freeze({
    ...claim,
    claimVersionId,
    claimVersion: nextVersion,
    supersedesClaimVersionId: claim.claimVersionId,
    reviewState: decision.state,
    reviewerId: decision.reviewerId,
    reviewReason: reason,
  });
  return Object.freeze({ ok: true, code: "CLAIM_REVIEW_TRANSITIONED", claim: next });
}
