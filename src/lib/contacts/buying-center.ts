import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export const BUYING_CENTER_SCHEMA_VERSION = 1 as const;

type Scope = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
  playVersionId: string;
}>;

export type BuyingCenterEvidenceRef = Scope & Readonly<{
  evidenceRefVersion: 1;
  evidenceId: string;
  evidenceVersionId: string;
  evidenceContentHash: string;
  sourceReceiptHash: string;
  observedAt: string;
  evidenceRefHash: string;
}>;

export type BuyingCenterContactVersionRef = Readonly<{
  contactRefVersion: 1;
  tenantId: string;
  workspaceId: string;
  accountId: string;
  contactVersionId: string;
  contactContentHash: string;
  contactReviewHash: string;
  verification: Readonly<{
    kind: "human";
    actorId: string;
    at: string;
    reason: string;
  }>;
  contactRefHash: string;
}>;

export type BuyingCenterHypothesis = Readonly<{
  status: "hypothesis";
  hypothesisKey: string;
  roleKind: "standard" | "tenant_custom";
  roleKey: string;
  roleLabel: string;
  responsibility: string;
  influence: "unknown" | "low" | "medium" | "high";
  priority: number;
  confidenceBasisPoints: number;
  uncertainty: string;
  evidenceRefs: readonly BuyingCenterEvidenceRef[];
  contactVersionRef: BuyingCenterContactVersionRef | null;
}>;

export type BuyingCenterReviewEvent = Readonly<{
  from: "draft" | "in_review";
  to: "in_review" | "approved" | "rejected";
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
}>;

export type BuyingCenterReview = Scope & Readonly<{
  reviewVersion: 1;
  versionId: string;
  contentHash: string;
  status: "draft" | "in_review" | "approved" | "rejected";
  events: readonly BuyingCenterReviewEvent[];
  reviewHash: string;
}>;

export type BuyingCenter = Scope & Readonly<{
  schemaVersion: typeof BUYING_CENTER_SCHEMA_VERSION;
  versionId: string;
  versionHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  createdAt: string;
  hypotheses: readonly BuyingCenterHypothesis[];
  contentHash: string;
  review: BuyingCenterReview;
}>;

export type BuyingCenterFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "VERSION_CONFLICT"
  | "STALE_VERSION"
  | "INVALID_TRANSITION"
  | "HUMAN_REVIEW_REQUIRED";

export type BuyingCenterBuildResult = Readonly<
  | { ok: true; code: "BUYING_CENTER_CREATED" | "BUYING_CENTER_VERSION_CREATED"; center: BuyingCenter }
  | { ok: false; code: BuyingCenterFailureCode }
>;

export type BuyingCenterReviewResult = Readonly<
  | { ok: true; code: "BUYING_CENTER_REVIEW_TRANSITIONED"; center: BuyingCenter }
  | { ok: false; code: BuyingCenterFailureCode }
>;

type PlainRecord = Record<string, unknown>;
type ParseResult<T> = Readonly<{ value: T | null; code: BuyingCenterFailureCode | null }>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "playVersionId", "stableKey", "revision", "predecessor",
  "createdAt", "hypotheses",
] as const;
const CENTER_FIELDS = [
  "schemaVersion", "versionId", "versionHash", "tenantId", "workspaceId", "accountId", "playVersionId",
  "stableKey", "revision", "supersedesVersionId", "createdAt", "hypotheses", "contentHash", "review",
] as const;
const HYPOTHESIS_FIELDS = [
  "status", "hypothesisKey", "roleKind", "roleKey", "roleLabel", "responsibility", "influence", "priority",
  "confidenceBasisPoints", "uncertainty", "evidenceRefs", "contactVersionRef",
] as const;
const EVIDENCE_FIELDS = [
  "evidenceRefVersion", "tenantId", "workspaceId", "accountId", "playVersionId", "evidenceId",
  "evidenceVersionId", "evidenceContentHash", "sourceReceiptHash", "observedAt", "evidenceRefHash",
] as const;
const CONTACT_FIELDS = [
  "contactRefVersion", "tenantId", "workspaceId", "accountId", "contactVersionId", "contactContentHash",
  "contactReviewHash", "verification", "contactRefHash",
] as const;
const VERIFICATION_FIELDS = ["kind", "actorId", "at", "reason"] as const;
const REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "accountId", "playVersionId", "contentHash", "status",
  "events", "reviewHash",
] as const;
const EVENT_FIELDS = ["from", "to", "actor", "at", "reason"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "playVersionId", "current", "expectedVersionId",
  "expectedContentHash", "expectedReviewHash", "to", "actor", "at", "reason",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,299}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const PLAY_VERSION = /^lead-play-version:[0-9a-f]{64}$/u;
const CONTACT_VERSION = /^contact-version:[0-9a-f]{64}$/u;
const CENTER_VERSION = /^buying-center-version:[0-9a-f]{64}$/u;
const STANDARD_ROLES = new Set([
  "economic_buyer", "technical_evaluator", "user_operator", "procurement", "quality_regulatory",
  "executive_sponsor", "distributor_channel_partner",
]);
const INFLUENCE = new Set(["unknown", "low", "medium", "high"]);
const REVIEW_STATUSES = new Set(["draft", "in_review", "approved", "rejected"]);
const MAX_HYPOTHESES = 50;
const MAX_EVIDENCE_REFS = 20;
const MAX_EVENTS = 100;

function failure(code: BuyingCenterFailureCode): BuyingCenterBuildResult {
  return Object.freeze({ ok: false, code });
}

function reviewFailure(code: BuyingCenterFailureCode): BuyingCenterReviewResult {
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

function exactArray(value: unknown, maximum: number, minimum = 0): readonly unknown[] | null {
  if (!Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(String(key)))) return null;
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function safeText(value: unknown, maximum = 1_000): value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum || value.trim() !== value) return false;
  if (!wellFormed(value) || value.normalize("NFKC") !== value) return false;
  return !/[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}]/u.test(value);
}

function safeRef(value: unknown): value is string {
  return typeof value === "string" && REF.test(value) && safeText(value, 300);
}

function safeDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value;
}

function sameScope(a: Scope, b: Scope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId && a.accountId === b.accountId
    && a.playVersionId === b.playVersionId;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function parseScope(record: PlainRecord): Scope | null {
  const { tenantId, workspaceId, accountId, playVersionId } = record;
  if (typeof tenantId !== "string" || !UUID.test(tenantId) || typeof workspaceId !== "string" || !UUID.test(workspaceId)
    || typeof accountId !== "string" || !UUID.test(accountId) || typeof playVersionId !== "string"
    || !PLAY_VERSION.test(playVersionId)) return null;
  return { tenantId, workspaceId, accountId, playVersionId };
}

function parseEvidence(value: unknown, scope: Scope, createdAt: string): ParseResult<BuyingCenterEvidenceRef> {
  const record = exactRecord(value, EVIDENCE_FIELDS);
  if (!record || record.evidenceRefVersion !== 1) return { value: null, code: "MALFORMED_INPUT" };
  const evidenceScope = parseScope(record);
  if (!evidenceScope) return { value: null, code: "MALFORMED_INPUT" };
  if (!sameScope(scope, evidenceScope)) return { value: null, code: "SCOPE_MISMATCH" };
  const { evidenceId, evidenceVersionId, evidenceContentHash, sourceReceiptHash, observedAt, evidenceRefHash } = record;
  if (!safeRef(evidenceId) || !safeRef(evidenceVersionId) || typeof evidenceContentHash !== "string" || !HASH.test(evidenceContentHash)
    || typeof sourceReceiptHash !== "string" || !HASH.test(sourceReceiptHash) || !safeDate(observedAt)
    || observedAt >= createdAt || typeof evidenceRefHash !== "string" || !HASH.test(evidenceRefHash)) {
    return { value: null, code: "MALFORMED_INPUT" };
  }
  const payload = {
    evidenceRefVersion: 1 as const, ...evidenceScope, evidenceId, evidenceVersionId, evidenceContentHash,
    sourceReceiptHash, observedAt,
  };
  if (hashJson(payload) !== evidenceRefHash) return { value: null, code: "MALFORMED_INPUT" };
  return { value: deepFreeze({ ...payload, evidenceRefHash }), code: null };
}

function parseVerification(value: unknown, createdAt: string): ParseResult<BuyingCenterContactVersionRef["verification"]> {
  const record = exactRecord(value, VERIFICATION_FIELDS);
  if (!record) return { value: null, code: "MALFORMED_INPUT" };
  if (record.kind !== "human") return { value: null, code: "HUMAN_REVIEW_REQUIRED" };
  if (typeof record.actorId !== "string" || !UUID.test(record.actorId) || !safeDate(record.at) || record.at >= createdAt
    || !safeText(record.reason, 1_000)) return { value: null, code: "MALFORMED_INPUT" };
  return { value: deepFreeze({ kind: "human", actorId: record.actorId, at: record.at, reason: record.reason }), code: null };
}

function parseContactRef(value: unknown, scope: Scope, createdAt: string): ParseResult<BuyingCenterContactVersionRef> {
  const record = exactRecord(value, CONTACT_FIELDS);
  if (!record || record.contactRefVersion !== 1) return { value: null, code: "MALFORMED_INPUT" };
  const contactScope = parseScope({ ...record, playVersionId: scope.playVersionId });
  if (!contactScope) return { value: null, code: "MALFORMED_INPUT" };
  if (scope.tenantId !== contactScope.tenantId || scope.workspaceId !== contactScope.workspaceId
    || scope.accountId !== contactScope.accountId) return { value: null, code: "SCOPE_MISMATCH" };
  const verification = parseVerification(record.verification, createdAt);
  if (!verification.value) return { value: null, code: verification.code };
  const { contactVersionId, contactContentHash, contactReviewHash, contactRefHash } = record;
  if (typeof contactVersionId !== "string" || !CONTACT_VERSION.test(contactVersionId)
    || typeof contactContentHash !== "string" || !HASH.test(contactContentHash)
    || typeof contactReviewHash !== "string" || !HASH.test(contactReviewHash)
    || typeof contactRefHash !== "string" || !HASH.test(contactRefHash)) return { value: null, code: "MALFORMED_INPUT" };
  const payload = {
    contactRefVersion: 1 as const,
    tenantId: contactScope.tenantId,
    workspaceId: contactScope.workspaceId,
    accountId: contactScope.accountId,
    contactVersionId,
    contactContentHash,
    contactReviewHash,
    verification: verification.value,
  };
  if (hashJson(payload) !== contactRefHash) return { value: null, code: "MALFORMED_INPUT" };
  return { value: deepFreeze({ ...payload, contactRefHash }), code: null };
}

function parseHypothesis(value: unknown, scope: Scope, createdAt: string): ParseResult<BuyingCenterHypothesis> {
  const record = exactRecord(value, HYPOTHESIS_FIELDS);
  if (!record || record.status !== "hypothesis" || !safeRef(record.hypothesisKey)
    || (record.roleKind !== "standard" && record.roleKind !== "tenant_custom") || !safeRef(record.roleKey)
    || !safeText(record.roleLabel, 200) || !safeText(record.responsibility, 2_000)
    || typeof record.influence !== "string" || !INFLUENCE.has(record.influence)
    || !Number.isSafeInteger(record.priority) || (record.priority as number) < 1 || (record.priority as number) > 100
    || !Number.isSafeInteger(record.confidenceBasisPoints) || (record.confidenceBasisPoints as number) < 0
    || (record.confidenceBasisPoints as number) > 10_000 || !safeText(record.uncertainty, 2_000)) {
    return { value: null, code: "MALFORMED_INPUT" };
  }
  if ((record.roleKind === "standard" && !STANDARD_ROLES.has(record.roleKey as string))
    || (record.roleKind === "tenant_custom" && !(record.roleKey as string).startsWith("custom:"))) {
    return { value: null, code: "MALFORMED_INPUT" };
  }
  const rawEvidence = exactArray(record.evidenceRefs, MAX_EVIDENCE_REFS, 1);
  if (!rawEvidence) return { value: null, code: "MALFORMED_INPUT" };
  const evidenceRefs: BuyingCenterEvidenceRef[] = [];
  for (const candidate of rawEvidence) {
    const parsed = parseEvidence(candidate, scope, createdAt);
    if (!parsed.value) return { value: null, code: parsed.code };
    evidenceRefs.push(parsed.value);
  }
  if (new Set(evidenceRefs.map((entry) => entry.evidenceRefHash)).size !== evidenceRefs.length
    || new Set(evidenceRefs.map((entry) => entry.evidenceId)).size !== evidenceRefs.length) {
    return { value: null, code: "MALFORMED_INPUT" };
  }
  let contactVersionRef: BuyingCenterContactVersionRef | null = null;
  if (record.contactVersionRef !== null) {
    const parsed = parseContactRef(record.contactVersionRef, scope, createdAt);
    if (!parsed.value) return { value: null, code: parsed.code };
    contactVersionRef = parsed.value;
  }
  return {
    value: deepFreeze({
      status: "hypothesis",
      hypothesisKey: record.hypothesisKey,
      roleKind: record.roleKind,
      roleKey: record.roleKey,
      roleLabel: record.roleLabel,
      responsibility: record.responsibility,
      influence: record.influence,
      priority: record.priority,
      confidenceBasisPoints: record.confidenceBasisPoints,
      uncertainty: record.uncertainty,
      evidenceRefs,
      contactVersionRef,
    } as BuyingCenterHypothesis),
    code: null,
  };
}

function reviewPayload(review: Omit<BuyingCenterReview, "reviewHash">): unknown {
  return review;
}

function parseActor(value: unknown): Readonly<{ kind: "human"; actorId: string }> | null {
  const record = exactRecord(value, ACTOR_FIELDS);
  return record?.kind === "human" && typeof record.actorId === "string" && UUID.test(record.actorId)
    ? deepFreeze({ kind: "human", actorId: record.actorId }) : null;
}

function parseReview(value: unknown, scope: Scope, versionId: string, contentHash: string, createdAt: string): BuyingCenterReview | null {
  const record = exactRecord(value, REVIEW_FIELDS);
  if (!record || record.reviewVersion !== 1 || record.versionId !== versionId || record.contentHash !== contentHash) return null;
  const reviewScope = parseScope(record);
  if (!reviewScope || !sameScope(scope, reviewScope) || typeof record.status !== "string" || !REVIEW_STATUSES.has(record.status)
    || typeof record.reviewHash !== "string" || !HASH.test(record.reviewHash)) return null;
  const rawEvents = exactArray(record.events, MAX_EVENTS);
  if (!rawEvents) return null;
  const events: BuyingCenterReviewEvent[] = [];
  let status: BuyingCenterReview["status"] = "draft";
  let lastAt = createdAt;
  for (const candidate of rawEvents) {
    const event = exactRecord(candidate, EVENT_FIELDS);
    const actor = event ? parseActor(event.actor) : null;
    if (!event || !actor || event.from !== status || !safeDate(event.at) || event.at <= lastAt || !safeText(event.reason, 1_000)) return null;
    if ((status === "draft" && event.to !== "in_review")
      || (status === "in_review" && event.to !== "approved" && event.to !== "rejected")) return null;
    const next = event.to as BuyingCenterReviewEvent["to"];
    events.push(deepFreeze({ from: event.from as BuyingCenterReviewEvent["from"], to: next, actor, at: event.at, reason: event.reason }));
    status = next;
    lastAt = event.at;
  }
  if (record.status !== status) return null;
  const review: Omit<BuyingCenterReview, "reviewHash"> = {
    reviewVersion: 1, versionId, ...scope, contentHash, status, events: deepFreeze(events),
  };
  if (hashJson(reviewPayload(review)) !== record.reviewHash) return null;
  return deepFreeze({ ...review, reviewHash: record.reviewHash });
}

function centerContentPayload(center: Pick<BuyingCenter,
  "tenantId" | "workspaceId" | "accountId" | "playVersionId" | "stableKey" | "revision" | "supersedesVersionId"
  | "createdAt" | "hypotheses">): unknown {
  return {
    tenantId: center.tenantId,
    workspaceId: center.workspaceId,
    accountId: center.accountId,
    playVersionId: center.playVersionId,
    stableKey: center.stableKey,
    revision: center.revision,
    supersedesVersionId: center.supersedesVersionId,
    createdAt: center.createdAt,
    hypotheses: center.hypotheses,
  };
}

function parseCenter(value: unknown): BuyingCenter | null {
  const record = exactRecord(value, CENTER_FIELDS);
  if (!record || record.schemaVersion !== BUYING_CENTER_SCHEMA_VERSION) return null;
  const scope = parseScope(record);
  if (!scope || typeof record.versionId !== "string" || !CENTER_VERSION.test(record.versionId)
    || typeof record.versionHash !== "string" || !HASH.test(record.versionHash) || !safeRef(record.stableKey)
    || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1
    || (record.supersedesVersionId !== null && (typeof record.supersedesVersionId !== "string"
      || !CENTER_VERSION.test(record.supersedesVersionId))) || !safeDate(record.createdAt)
    || typeof record.contentHash !== "string" || !HASH.test(record.contentHash)) return null;
  const rawHypotheses = exactArray(record.hypotheses, MAX_HYPOTHESES, 1);
  if (!rawHypotheses) return null;
  const hypotheses: BuyingCenterHypothesis[] = [];
  for (const candidate of rawHypotheses) {
    const parsed = parseHypothesis(candidate, scope, record.createdAt);
    if (!parsed.value) return null;
    hypotheses.push(parsed.value);
  }
  if (!uniqueHypotheses(hypotheses)) return null;
  const base = {
    ...scope,
    stableKey: record.stableKey,
    revision: record.revision as number,
    supersedesVersionId: record.supersedesVersionId,
    createdAt: record.createdAt,
    hypotheses,
  } as const;
  if (hashJson(centerContentPayload(base)) !== record.contentHash) return null;
  const versionHash = hashJson({ schemaVersion: BUYING_CENTER_SCHEMA_VERSION, contentHash: record.contentHash });
  if (versionHash !== record.versionHash || record.versionId !== `buying-center-version:${versionHash.slice(7)}`) return null;
  const review = parseReview(record.review, scope, record.versionId, record.contentHash, record.createdAt);
  if (!review) return null;
  return deepFreeze({
    schemaVersion: BUYING_CENTER_SCHEMA_VERSION,
    versionId: record.versionId,
    versionHash,
    ...base,
    contentHash: record.contentHash,
    review,
  });
}

function uniqueHypotheses(hypotheses: readonly BuyingCenterHypothesis[]): boolean {
  const keys = hypotheses.map((entry) => entry.hypothesisKey);
  const labels = hypotheses.map((entry) => entry.roleLabel.toLocaleLowerCase("en-US"));
  return new Set(keys).size === keys.length && new Set(labels).size === labels.length;
}

function lastReviewAt(center: BuyingCenter): string {
  return center.review.events.at(-1)?.at ?? center.createdAt;
}

/** Approval confirms only the reviewed role map; every role remains a hypothesis and grants no action authority. */
export function buildBuyingCenter(input: unknown): BuyingCenterBuildResult {
  const record = exactRecord(input, INPUT_FIELDS);
  if (!record || record.version !== 1) return failure("MALFORMED_INPUT");
  const scope = parseScope(record);
  if (!scope || !safeRef(record.stableKey) || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1
    || !safeDate(record.createdAt)) return failure("MALFORMED_INPUT");
  const rawHypotheses = exactArray(record.hypotheses, MAX_HYPOTHESES, 1);
  if (!rawHypotheses) return failure("MALFORMED_INPUT");
  const hypotheses: BuyingCenterHypothesis[] = [];
  for (const candidate of rawHypotheses) {
    const parsed = parseHypothesis(candidate, scope, record.createdAt);
    if (!parsed.value) return failure(parsed.code ?? "MALFORMED_INPUT");
    hypotheses.push(parsed.value);
  }
  if (!uniqueHypotheses(hypotheses)) return failure("MALFORMED_INPUT");

  let supersedesVersionId: string | null = null;
  if (record.revision === 1) {
    if (record.predecessor !== null) return failure("VERSION_CONFLICT");
  } else {
    const predecessor = parseCenter(record.predecessor);
    if (!predecessor) return failure("MALFORMED_INPUT");
    if (!sameScope(scope, predecessor)) return failure("SCOPE_MISMATCH");
    if (predecessor.stableKey !== record.stableKey || record.revision !== predecessor.revision + 1)
      return failure("VERSION_CONFLICT");
    if (predecessor.review.status !== "approved") return failure("INVALID_TRANSITION");
    if (record.createdAt <= lastReviewAt(predecessor)) return failure("INVALID_TRANSITION");
    supersedesVersionId = predecessor.versionId;
  }

  const base = {
    ...scope,
    stableKey: record.stableKey as string,
    revision: record.revision as number,
    supersedesVersionId,
    createdAt: record.createdAt as string,
    hypotheses: deepFreeze(hypotheses),
  };
  const contentHash = hashJson(centerContentPayload(base));
  const versionHash = hashJson({ schemaVersion: BUYING_CENTER_SCHEMA_VERSION, contentHash });
  const versionId = `buying-center-version:${versionHash.slice(7)}`;
  const reviewBase: Omit<BuyingCenterReview, "reviewHash"> = {
    reviewVersion: 1, versionId, ...scope, contentHash, status: "draft", events: deepFreeze([]),
  };
  const review = deepFreeze({ ...reviewBase, reviewHash: hashJson(reviewPayload(reviewBase)) });
  const center = deepFreeze({
    schemaVersion: BUYING_CENTER_SCHEMA_VERSION,
    versionId,
    versionHash,
    ...base,
    contentHash,
    review,
  });
  return deepFreeze({
    ok: true,
    code: record.revision === 1 ? "BUYING_CENTER_CREATED" : "BUYING_CENTER_VERSION_CREATED",
    center,
  });
}

export function transitionBuyingCenterReview(input: unknown): BuyingCenterReviewResult {
  const record = exactRecord(input, TRANSITION_FIELDS);
  if (!record || record.version !== 1) return reviewFailure("MALFORMED_INPUT");
  const scope = parseScope(record);
  if (!scope) return reviewFailure("MALFORMED_INPUT");
  const current = parseCenter(record.current);
  if (!current) return reviewFailure("MALFORMED_INPUT");
  if (!sameScope(scope, current)) return reviewFailure("SCOPE_MISMATCH");
  if (record.expectedVersionId !== current.versionId || record.expectedContentHash !== current.contentHash
    || record.expectedReviewHash !== current.review.reviewHash) return reviewFailure("STALE_VERSION");
  const actorRecord = exactRecord(record.actor, ACTOR_FIELDS);
  if (!actorRecord) return reviewFailure("MALFORMED_INPUT");
  if (actorRecord.kind !== "human") return reviewFailure("HUMAN_REVIEW_REQUIRED");
  const actor = parseActor(record.actor);
  if (!actor || !safeDate(record.at) || !safeText(record.reason, 1_000)) return reviewFailure("MALFORMED_INPUT");
  if (current.review.events.length >= MAX_EVENTS || record.at <= lastReviewAt(current)) return reviewFailure("INVALID_TRANSITION");
  const { status } = current.review;
  if ((status === "draft" && record.to !== "in_review")
    || (status === "in_review" && record.to !== "approved" && record.to !== "rejected")
    || (status !== "draft" && status !== "in_review")) return reviewFailure("INVALID_TRANSITION");
  const event = deepFreeze({
    from: status,
    to: record.to,
    actor,
    at: record.at,
    reason: record.reason,
  } as BuyingCenterReviewEvent);
  const events = deepFreeze([...current.review.events, event]);
  const reviewBase: Omit<BuyingCenterReview, "reviewHash"> = {
    reviewVersion: 1,
    versionId: current.versionId,
    ...scope,
    contentHash: current.contentHash,
    status: record.to as "in_review" | "approved" | "rejected",
    events,
  };
  const review = deepFreeze({ ...reviewBase, reviewHash: hashJson(reviewPayload(reviewBase)) });
  return deepFreeze({
    ok: true,
    code: "BUYING_CENTER_REVIEW_TRANSITIONED",
    center: deepFreeze({ ...current, review }),
  });
}
