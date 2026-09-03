import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

const ROOT_FIELDS = ["version", "scope", "draft", "citations", "evidence"] as const;
const SCOPE_FIELDS = ["tenantId", "workspaceId", "accountId"] as const;
const DRAFT_FIELDS = [
  "draftVersion", "draftId", "draftVersionId", "contentHash", "subject", "body", "claims",
] as const;
const CLAIM_FIELDS = [
  "claimId", "field", "start", "end", "text", "textHash", "claimClass", "material",
  "citationIds", "uncertainty",
] as const;
const CITATION_FIELDS = [
  "citationVersion", "citationId", "evidenceId", "tenantId", "workspaceId", "accountId",
  "state", "quoteHash", "locator",
] as const;
const EVIDENCE_FIELDS = [
  "evidenceVersion", "evidenceId", "sourceKind", "tenantId", "workspaceId", "accountId",
  "approvalState", "support", "freshness", "conflict", "revokedAt", "claimTextHash", "citationId",
  "sourceReceipt",
] as const;
const SOURCE_RECEIPT_FIELDS = [
  "receiptVersion", "evidenceId", "citationId", "sourceVersionId", "sourceContentHash", "sourceKind",
  "tenantId", "workspaceId", "accountId", "locator", "quote", "quoteHash", "receiptHash",
] as const;

const HASH = /^sha256:[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$/u;
const DEFAULT_IGNORABLE = /\p{Default_Ignorable_Code_Point}/u;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u;
const ACTIVE_MARKUP = /<\s*\/?\s*[a-z][^>]*>|javascript\s*:|data\s*:\s*text\/html/iu;
const SECRET = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:authorization\s*:\s*)?bearer\s+[A-Za-z0-9._~+/-]{20,}={0,2}\b|\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b|\bAKIA[0-9A-Z]{16}\b|\bsk-[A-Za-z0-9_-]{20,}\b)/iu;
const FORBIDDEN_DELIVERY_FIELD = /(?:automatic.*send|auto.*send|send|sent|deliver|recipient|mailbox|transport|message.*id)/u;

const CLAIM_CLASSES = new Set([
  "identity", "product_technical_specification", "compatibility_application", "regulatory_compliance",
  "safety", "performance", "pricing_commercial", "capacity_supply", "geography", "contact_role",
  "personalization", "negative_absence", "customer_provided_strategic_fact",
]);
const CITATION_STATES = new Set(["resolved", "unresolved", "stale", "revoked", "conflicted"]);
const APPROVAL_STATES = new Set(["approved", "pending", "rejected", "superseded"]);
const SUPPORT_STATES = new Set(["direct", "corroborated", "inferred", "unsupported"]);
const FRESHNESS_STATES = new Set(["current", "stale", "revoked"]);
const CONFLICT_STATES = new Set(["none", "conflicted"]);

const MAX_SUBJECT_CHARS = 500;
const MAX_BODY_CHARS = 32_000;
const MAX_CLAIMS = 128;
const MAX_CITATIONS = 256;
const MAX_EVIDENCE = 256;
const MAX_CITATIONS_PER_CLAIM = 16;

export type OutreachCitationFailureCode =
  | "MALFORMED_INPUT"
  | "DELIVERY_FIELD_FORBIDDEN"
  | "UNSAFE_CONTENT"
  | "SCOPE_MISMATCH"
  | "DRAFT_CONTENT_MISMATCH"
  | "CLAIM_SPAN_MISMATCH"
  | "CITATION_REQUIRED"
  | "CITATION_UNRESOLVABLE"
  | "EVIDENCE_UNAPPROVED"
  | "EVIDENCE_STALE"
  | "EVIDENCE_REVOKED"
  | "EVIDENCE_CONFLICTED"
  | "EVIDENCE_UNSUPPORTED"
  | "DUPLICATE_ID";

export type ValidatedOutreachClaim = Readonly<{
  claimId: string;
  field: "subject" | "body";
  start: number;
  end: number;
  text: string;
  textHash: string;
  claimClass: string;
  material: boolean;
  citationIds: readonly string[];
  evidenceIds: readonly string[];
  uncertainty: string | null;
}>;

export type ValidatedOutreachCitations = Readonly<{
  validatorVersion: 1;
  tenantId: string;
  workspaceId: string;
  accountId: string;
  draftId: string;
  draftVersionId: string;
  contentHash: string;
  claims: readonly ValidatedOutreachClaim[];
}>;

export type OutreachCitationValidationResult = Readonly<
  | { ok: true; code: "OUTREACH_CITATIONS_VALID"; value: ValidatedOutreachCitations }
  | { ok: false; code: OutreachCitationFailureCode }
>;

type DataRecord = Record<string, unknown>;

type ParsedCitation = Readonly<{
  citationId: string;
  evidenceId: string;
  tenantId: string;
  workspaceId: string;
  accountId: string | null;
  state: string;
  quoteHash: string;
  locator: string;
}>;

type ParsedSourceReceipt = Readonly<{
  evidenceId: string;
  citationId: string;
  sourceVersionId: string;
  sourceContentHash: string;
  sourceKind: "knowledge" | "account";
  tenantId: string;
  workspaceId: string;
  accountId: string | null;
  locator: string;
  quoteHash: string;
  receiptHash: string;
}>;

type ParsedEvidence = Readonly<{
  evidenceId: string;
  sourceKind: "knowledge" | "account";
  tenantId: string;
  workspaceId: string;
  accountId: string | null;
  approvalState: string;
  support: string;
  freshness: string;
  conflict: string;
  revokedAt: string | null;
  claimTextHash: string;
  citationId: string;
  sourceReceipt: ParsedSourceReceipt;
}>;

function failure(code: OutreachCitationFailureCode): OutreachCitationValidationResult {
  return Object.freeze({ ok: false, code });
}

function normalizedFieldName(value: string): string {
  return value.normalize("NFKC").replace(/\p{Default_Ignorable_Code_Point}/gu, "").replace(/[^a-z]/giu, "").toLowerCase();
}

function isForbiddenField(value: string): boolean {
  return FORBIDDEN_DELIVERY_FIELD.test(normalizedFieldName(value));
}

function inspectRecord(value: unknown): DataRecord | null {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value) || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const output: DataRecord = Object.create(null) as DataRecord;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    output[key] = descriptor.value;
  }
  return output;
}

function exactRecord(value: unknown, allowed: readonly string[]): DataRecord | null {
  const record = inspectRecord(value);
  if (!record) return null;
  const keys = Object.keys(record);
  if (keys.length !== allowed.length || keys.some((key) => !allowed.includes(key))) return null;
  return record;
}

function exactArray(value: unknown, maximum: number): unknown[] | null {
  if (typeof value !== "object" || value === null || utilTypes.isProxy(value)
    || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > maximum) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string" || (key !== "length" && !/^(?:0|[1-9][0-9]*)$/u.test(key)))) return null;
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
    output.push(descriptor.value);
  }
  return output;
}

function containsForbiddenDeliveryField(value: unknown, seen = new Set<object>()): boolean {
  if (typeof value !== "object" || value === null || seen.has(value)) return false;
  seen.add(value);
  if (utilTypes.isProxy(value)) return false;
  if (Array.isArray(value)) {
    const items = exactArray(value, Math.max(MAX_CITATIONS, MAX_EVIDENCE));
    return items ? items.some((item) => containsForbiddenDeliveryField(item, seen)) : false;
  }
  const record = inspectRecord(value);
  if (!record) return false;
  return Object.keys(record).some((key) => isForbiddenField(key)
    || containsForbiddenDeliveryField(record[key], seen));
}

function safeId(value: unknown): value is string {
  return typeof value === "string" && isWellFormedUnicode(value)
    && SAFE_ID.test(value) && !DEFAULT_IGNORABLE.test(value);
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isCodePointBoundary(value: string, index: number): boolean {
  if (index <= 0 || index >= value.length) return true;
  const previous = value.charCodeAt(index - 1);
  const current = value.charCodeAt(index);
  return !(previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff);
}

function hasUnsafeContent(value: string): boolean {
  if (DEFAULT_IGNORABLE.test(value)) return true;
  const securityView = value.normalize("NFKC");
  return CONTROL.test(securityView) || ACTIVE_MARKUP.test(securityView) || SECRET.test(securityView);
}

function safeText(value: unknown, maximum: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || value.length > 0)
    && isWellFormedUnicode(value) && !hasUnsafeContent(value);
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number : null;
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function contentHash(subject: string, body: string): string {
  return hash(JSON.stringify({ subject, body }));
}

function parseSourceReceipt(value: unknown): ParsedSourceReceipt | null {
  const item = exactRecord(value, SOURCE_RECEIPT_FIELDS);
  if (!item || item.receiptVersion !== 1 || !safeId(item.evidenceId) || !safeId(item.citationId)
    || !safeId(item.sourceVersionId) || typeof item.sourceContentHash !== "string"
    || !HASH.test(item.sourceContentHash) || (item.sourceKind !== "knowledge" && item.sourceKind !== "account")
    || !safeId(item.tenantId) || !safeId(item.workspaceId)
    || (item.accountId !== null && !safeId(item.accountId)) || !safeText(item.locator, 2_048)
    || !safeText(item.quote, 4_096) || Buffer.byteLength(item.quote, "utf8") > 4_096
    || typeof item.quoteHash !== "string" || !HASH.test(item.quoteHash)
    || typeof item.receiptHash !== "string" || !HASH.test(item.receiptHash)) return null;
  const quoteHash = hash(item.quote);
  if (item.quoteHash !== quoteHash) return null;
  const payload = Object.freeze({
    receiptVersion: 1,
    evidenceId: item.evidenceId,
    citationId: item.citationId,
    sourceVersionId: item.sourceVersionId,
    sourceContentHash: item.sourceContentHash,
    sourceKind: item.sourceKind,
    tenantId: item.tenantId,
    workspaceId: item.workspaceId,
    accountId: item.accountId,
    locator: item.locator,
    quote: item.quote,
    quoteHash,
  });
  if (item.receiptHash !== hash(JSON.stringify(payload))) return null;
  return Object.freeze({
    evidenceId: item.evidenceId,
    citationId: item.citationId,
    sourceVersionId: item.sourceVersionId,
    sourceContentHash: item.sourceContentHash,
    sourceKind: item.sourceKind,
    tenantId: item.tenantId,
    workspaceId: item.workspaceId,
    accountId: item.accountId,
    locator: item.locator,
    quoteHash,
    receiptHash: item.receiptHash,
  });
}

function isoTimestampOrNull(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return undefined;
  const epoch = Date.parse(value);
  if (Number.isNaN(epoch) || new Date(epoch).toISOString() !== value) return undefined;
  return value;
}

function citationStateFailure(state: string): OutreachCitationFailureCode | null {
  if (state === "resolved") return null;
  if (state === "stale") return "EVIDENCE_STALE";
  if (state === "revoked") return "EVIDENCE_REVOKED";
  if (state === "conflicted") return "EVIDENCE_CONFLICTED";
  return "CITATION_UNRESOLVABLE";
}

function findUnsafeText(input: DataRecord): boolean {
  const draft = inspectRecord(input.draft);
  if (!draft) return false;
  for (const field of ["subject", "body"] as const) {
    const value = draft[field];
    if (typeof value === "string" && hasUnsafeContent(value)) return true;
  }
  const claims = exactArray(draft.claims, MAX_CLAIMS);
  if (claims) {
    for (const rawClaim of claims) {
      const claim = inspectRecord(rawClaim);
      if (!claim) continue;
      for (const field of ["text", "uncertainty"] as const) {
        const value = claim[field];
        if (typeof value === "string" && hasUnsafeContent(value)) return true;
      }
    }
  }
  const citations = exactArray(input.citations, MAX_CITATIONS);
  if (citations) {
    for (const rawCitation of citations) {
      const citation = inspectRecord(rawCitation);
      if (citation && typeof citation.locator === "string" && hasUnsafeContent(citation.locator)) return true;
    }
  }
  return false;
}

function validate(value: unknown): OutreachCitationValidationResult {
  if (containsForbiddenDeliveryField(value)) return failure("DELIVERY_FIELD_FORBIDDEN");
  const inspected = inspectRecord(value);
  if (inspected && findUnsafeText(inspected)) return failure("UNSAFE_CONTENT");

  const input = exactRecord(value, ROOT_FIELDS);
  const scope = input && exactRecord(input.scope, SCOPE_FIELDS);
  const draft = input && exactRecord(input.draft, DRAFT_FIELDS);
  const rawClaims = draft && exactArray(draft.claims, MAX_CLAIMS);
  const rawCitations = input && exactArray(input.citations, MAX_CITATIONS);
  const rawEvidence = input && exactArray(input.evidence, MAX_EVIDENCE);
  if (!input || input.version !== 1 || !scope || !draft || !rawClaims || !rawCitations || !rawEvidence
    || !safeId(scope.tenantId) || !safeId(scope.workspaceId) || !safeId(scope.accountId)
    || draft.draftVersion !== 1 || !safeId(draft.draftId) || !safeId(draft.draftVersionId)
    || typeof draft.contentHash !== "string" || !HASH.test(draft.contentHash)
    || !safeText(draft.subject, MAX_SUBJECT_CHARS, true) || !safeText(draft.body, MAX_BODY_CHARS, true)) {
    return failure("MALFORMED_INPUT");
  }
  const tenantId = scope.tenantId;
  const workspaceId = scope.workspaceId;
  const accountId = scope.accountId;
  const subject = draft.subject;
  const body = draft.body;
  if (draft.contentHash !== contentHash(subject, body)) return failure("DRAFT_CONTENT_MISMATCH");

  const citations = new Map<string, ParsedCitation>();
  for (const rawCitation of rawCitations) {
    const item = exactRecord(rawCitation, CITATION_FIELDS);
    if (!item || item.citationVersion !== 1 || !safeId(item.citationId) || !safeId(item.evidenceId)
      || !safeId(item.tenantId) || !safeId(item.workspaceId)
      || (item.accountId !== null && !safeId(item.accountId))
      || typeof item.state !== "string" || !CITATION_STATES.has(item.state)
      || typeof item.quoteHash !== "string" || !HASH.test(item.quoteHash)
      || !safeText(item.locator, 2_048)) return failure("MALFORMED_INPUT");
    if (item.tenantId !== tenantId || item.workspaceId !== workspaceId
      || (item.accountId !== null && item.accountId !== accountId)) return failure("SCOPE_MISMATCH");
    if (citations.has(item.citationId)) return failure("DUPLICATE_ID");
    citations.set(item.citationId, Object.freeze({
      citationId: item.citationId, evidenceId: item.evidenceId, tenantId: item.tenantId,
      workspaceId: item.workspaceId, accountId: item.accountId, state: item.state,
      quoteHash: item.quoteHash, locator: item.locator,
    }));
  }

  const evidence = new Map<string, ParsedEvidence>();
  for (const rawItem of rawEvidence) {
    const item = exactRecord(rawItem, EVIDENCE_FIELDS);
    const revokedAt = item && isoTimestampOrNull(item.revokedAt);
    const sourceReceipt = item && parseSourceReceipt(item.sourceReceipt);
    if (!item || item.evidenceVersion !== 1 || !safeId(item.evidenceId)
      || (item.sourceKind !== "knowledge" && item.sourceKind !== "account")
      || !safeId(item.tenantId) || !safeId(item.workspaceId)
      || (item.accountId !== null && !safeId(item.accountId))
      || typeof item.approvalState !== "string" || !APPROVAL_STATES.has(item.approvalState)
      || typeof item.support !== "string" || !SUPPORT_STATES.has(item.support)
      || typeof item.freshness !== "string" || !FRESHNESS_STATES.has(item.freshness)
      || typeof item.conflict !== "string" || !CONFLICT_STATES.has(item.conflict)
      || revokedAt === undefined || typeof item.claimTextHash !== "string" || !HASH.test(item.claimTextHash)
      || !safeId(item.citationId) || !sourceReceipt) return failure("MALFORMED_INPUT");
    if (item.tenantId !== tenantId || item.workspaceId !== workspaceId
      || (item.sourceKind === "account" && item.accountId !== accountId)
      || (item.sourceKind === "knowledge" && item.accountId !== null)) return failure("SCOPE_MISMATCH");
    if (sourceReceipt.tenantId !== tenantId || sourceReceipt.workspaceId !== workspaceId
      || sourceReceipt.tenantId !== item.tenantId || sourceReceipt.workspaceId !== item.workspaceId
      || sourceReceipt.accountId !== item.accountId || sourceReceipt.sourceKind !== item.sourceKind) {
      return failure("SCOPE_MISMATCH");
    }
    if (sourceReceipt.evidenceId !== item.evidenceId || sourceReceipt.citationId !== item.citationId) {
      return failure("CITATION_UNRESOLVABLE");
    }
    if (evidence.has(item.evidenceId)) return failure("DUPLICATE_ID");
    evidence.set(item.evidenceId, Object.freeze({
      evidenceId: item.evidenceId, sourceKind: item.sourceKind, tenantId: item.tenantId,
      workspaceId: item.workspaceId, accountId: item.accountId, approvalState: item.approvalState,
      support: item.support, freshness: item.freshness, conflict: item.conflict,
      revokedAt, claimTextHash: item.claimTextHash, citationId: item.citationId, sourceReceipt,
    }));
  }

  // Without a trusted exhaustive claim-classification receipt, accepting content with
  // no declared claims would let a caller omit every material assertion.
  if ((subject.length > 0 || body.length > 0) && rawClaims.length === 0) {
    return failure("CITATION_REQUIRED");
  }

  const claimIds = new Set<string>();
  const usedCitationIds = new Set<string>();
  const usedEvidenceIds = new Set<string>();
  const spans: Array<Readonly<{ field: "subject" | "body"; start: number; end: number }>> = [];
  const claims: ValidatedOutreachClaim[] = [];
  for (const rawClaim of rawClaims) {
    const claim = exactRecord(rawClaim, CLAIM_FIELDS);
    const field = claim?.field;
    const sourceText = field === "subject" ? subject : field === "body" ? body : null;
    const start = sourceText === null ? null : integer(claim?.start, 0, sourceText.length);
    const end = sourceText === null ? null : integer(claim?.end, 1, sourceText.length);
    const citationIds = claim && exactArray(claim.citationIds, MAX_CITATIONS_PER_CLAIM);
    if (!claim || !safeId(claim.claimId) || (field !== "subject" && field !== "body")
      || start === null || end === null || end <= start || !safeText(claim.text, MAX_BODY_CHARS)
      || typeof claim.textHash !== "string" || !HASH.test(claim.textHash)
      || typeof claim.claimClass !== "string" || !CLAIM_CLASSES.has(claim.claimClass)
      || typeof claim.material !== "boolean" || !citationIds
      || (claim.uncertainty !== null && !safeText(claim.uncertainty, 2_000))) {
      return failure("MALFORMED_INPUT");
    }
    const validatedSourceText = field === "subject" ? subject : body;
    if (claimIds.has(claim.claimId)) return failure("DUPLICATE_ID");
    claimIds.add(claim.claimId);
    if (claim.text !== validatedSourceText.slice(start, end) || claim.textHash !== hash(claim.text)) {
      return failure("CLAIM_SPAN_MISMATCH");
    }
    if (!isCodePointBoundary(validatedSourceText, start) || !isCodePointBoundary(validatedSourceText, end)) {
      return failure("CLAIM_SPAN_MISMATCH");
    }
    if (spans.some((span) => span.field === field && start < span.end && end > span.start)) {
      return failure("CLAIM_SPAN_MISMATCH");
    }
    spans.push(Object.freeze({ field, start, end }));
    if (citationIds.length === 0) return failure("CITATION_REQUIRED");

    const normalizedCitationIds: string[] = [];
    const evidenceIds: string[] = [];
    for (const rawCitationId of citationIds) {
      if (!safeId(rawCitationId)) return failure("MALFORMED_INPUT");
      if (normalizedCitationIds.includes(rawCitationId)) return failure("DUPLICATE_ID");
      const linkedCitation = citations.get(rawCitationId);
      if (!linkedCitation) return failure("CITATION_UNRESOLVABLE");
      const citationFailure = citationStateFailure(linkedCitation.state);
      if (citationFailure) return failure(citationFailure);
      const linkedEvidence = evidence.get(linkedCitation.evidenceId);
      if (!linkedEvidence || linkedEvidence.citationId !== linkedCitation.citationId) {
        return failure("CITATION_UNRESOLVABLE");
      }
      if (linkedEvidence.sourceReceipt.quoteHash !== linkedCitation.quoteHash
        || linkedEvidence.sourceReceipt.locator !== linkedCitation.locator) {
        return failure("CITATION_UNRESOLVABLE");
      }
      if (linkedCitation.tenantId !== tenantId || linkedCitation.workspaceId !== workspaceId
        || linkedEvidence.tenantId !== tenantId || linkedEvidence.workspaceId !== workspaceId
        || linkedCitation.accountId !== linkedEvidence.accountId) return failure("SCOPE_MISMATCH");
      if ((linkedEvidence.sourceKind === "account" && linkedEvidence.accountId !== accountId)
        || (linkedEvidence.sourceKind === "knowledge" && linkedEvidence.accountId !== null)) {
        return failure("SCOPE_MISMATCH");
      }
      if (linkedEvidence.approvalState !== "approved") return failure("EVIDENCE_UNAPPROVED");
      if (linkedEvidence.revokedAt !== null || linkedEvidence.freshness === "revoked") return failure("EVIDENCE_REVOKED");
      if (linkedEvidence.freshness !== "current") return failure("EVIDENCE_STALE");
      if (linkedEvidence.conflict !== "none") return failure("EVIDENCE_CONFLICTED");
      if (linkedEvidence.support !== "direct" && linkedEvidence.support !== "corroborated") {
        return failure("EVIDENCE_UNSUPPORTED");
      }
      if (linkedEvidence.claimTextHash !== claim.textHash) return failure("CITATION_UNRESOLVABLE");
      normalizedCitationIds.push(rawCitationId);
      evidenceIds.push(linkedEvidence.evidenceId);
      usedCitationIds.add(linkedCitation.citationId);
      usedEvidenceIds.add(linkedEvidence.evidenceId);
    }
    normalizedCitationIds.sort();
    evidenceIds.sort();
    claims.push(Object.freeze({
      claimId: claim.claimId, field, start, end, text: claim.text, textHash: claim.textHash,
      claimClass: claim.claimClass, material: claim.material,
      citationIds: Object.freeze(normalizedCitationIds), evidenceIds: Object.freeze(evidenceIds),
      uncertainty: claim.uncertainty,
    }));
  }
  if (usedCitationIds.size !== citations.size || usedEvidenceIds.size !== evidence.size) {
    return failure("CITATION_UNRESOLVABLE");
  }
  claims.sort((left, right) => left.field.localeCompare(right.field) || left.start - right.start
    || left.end - right.end || left.claimId.localeCompare(right.claimId));

  return Object.freeze({
    ok: true,
    code: "OUTREACH_CITATIONS_VALID",
    value: Object.freeze({
      validatorVersion: 1,
      tenantId,
      workspaceId,
      accountId,
      draftId: draft.draftId,
      draftVersionId: draft.draftVersionId,
      contentHash: draft.contentHash,
      claims: Object.freeze(claims),
    }),
  });
}

/**
 * Validates the receipt's canonical shape and internal bindings. The caller owns
 * authorization and authentic resolution of sourceVersionId/sourceContentHash;
 * this pure boundary cannot prove that an external repository object exists.
 */
export function validateOutreachDraftCitations(value: unknown): OutreachCitationValidationResult {
  try {
    return validate(value);
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
