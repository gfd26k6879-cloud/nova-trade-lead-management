import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import type { OutcomeRecord, OutcomeTaxonomy } from "@/lib/outcomes/outcome-record";

export const LEARNING_PROPOSAL_SCHEMA_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string; accountId: string; playVersionId: string }>;

export type LearningOutcomeRef = Scope & Readonly<{
  stableKey: string;
  versionId: string;
  versionHash: string;
  contentHash: string;
  outcome: OutcomeTaxonomy;
  occurredAt: string;
  recordedAt: string;
  sourceHash: string;
  attributionKind: "direct" | "assisted" | "unknown";
  attributionConfidenceBasisPoints: number;
  outcomeRefHash: string;
}>;

export type LearningProposalReviewEvent = Readonly<{
  from: "draft" | "in_review";
  to: "in_review" | "approved" | "rejected";
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
}>;

export type LearningProposalReview = Scope & Readonly<{
  reviewVersion: 1;
  versionId: string;
  contentHash: string;
  status: "draft" | "in_review" | "approved" | "rejected";
  events: readonly LearningProposalReviewEvent[];
  reviewHash: string;
}>;

type Cohort = Readonly<{
  cohortId: string;
  definitionHash: string;
  windowStart: string;
  windowEnd: string;
  denominator: number;
}>;

type MetricKey = "reply_rate" | "meeting_rate" | "opportunity_rate" | "win_rate" | "opt_out_rate" | "bounce_rate";

type Metric = Readonly<{
  metricKey: MetricKey;
  formulaVersion: string;
  numerator: number;
  denominator: number;
  valueBasisPoints: number;
}>;

type Target = Readonly<{
  kind: "play_policy";
  currentPlayVersionId: string;
  currentPolicyHash: string;
}>;

type Change = Readonly<{
  kind: "qualification_threshold_basis_points" | "score_weight_basis_points" | "query_family_status" | "outreach_guidance_status";
  targetKey: string;
  currentValue: number | "enabled" | "disabled";
  proposedValue: number | "enabled" | "disabled";
  rationale: string;
}>;

type Uncertainty = Readonly<{
  uncertaintyId: string;
  statement: string;
  impact: string;
  severity: number;
}>;

type ExpectedImpact = Readonly<{
  metricKey: MetricKey;
  direction: "increase" | "decrease";
  estimateBasisPoints: number;
  lowerBoundBasisPoints: number;
  upperBoundBasisPoints: number;
  horizonDays: number;
  rationale: string;
}>;

type Rollback = Readonly<{
  restorePlayVersionId: string;
  restorePolicyHash: string;
  triggerMetricKey: MetricKey;
  triggerThresholdBasisPoints: number;
  reason: string;
}>;

export type LearningProposal = Scope & Readonly<{
  schemaVersion: typeof LEARNING_PROPOSAL_SCHEMA_VERSION;
  versionId: string;
  versionHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  createdAt: string;
  outcomeRefs: readonly LearningOutcomeRef[];
  cohort: Cohort;
  metric: Metric;
  target: Target;
  change: Change;
  uncertainties: readonly Uncertainty[];
  expectedImpact: ExpectedImpact;
  rollback: Rollback;
  contentHash: string;
  review: LearningProposalReview;
}>;

export type LearningProposalFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "METRIC_MISMATCH"
  | "VERSION_CONFLICT"
  | "STALE_VERSION"
  | "INVALID_CHRONOLOGY"
  | "INVALID_TRANSITION"
  | "HUMAN_REVIEW_REQUIRED";

export type LearningProposalBuildResult = Readonly<
  | { ok: true; code: "LEARNING_PROPOSAL_CREATED" | "LEARNING_PROPOSAL_VERSION_CREATED"; proposal: LearningProposal }
  | { ok: false; code: LearningProposalFailureCode }
>;

export type LearningProposalReviewResult = Readonly<
  | { ok: true; code: "LEARNING_PROPOSAL_REVIEW_TRANSITIONED"; proposal: LearningProposal }
  | { ok: false; code: LearningProposalFailureCode }
>;

type PlainRecord = Record<string, unknown>;
type ParseResult<T> = Readonly<{ value: T | null; code: LearningProposalFailureCode | null }>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "playVersionId", "stableKey", "revision", "predecessor",
  "createdAt", "outcomeRecords", "cohort", "metric", "target", "change", "uncertainties", "expectedImpact", "rollback",
] as const;
const PROPOSAL_FIELDS = [
  "schemaVersion", "versionId", "versionHash", "tenantId", "workspaceId", "accountId", "playVersionId", "stableKey",
  "revision", "supersedesVersionId", "createdAt", "outcomeRefs", "cohort", "metric", "target", "change", "uncertainties",
  "expectedImpact", "rollback", "contentHash", "review",
] as const;
const OUTCOME_RECORD_FIELDS = [
  "schemaVersion", "versionId", "versionHash", "tenantId", "workspaceId", "accountId", "playVersionId", "stableKey",
  "revision", "supersedesVersionId", "outcome", "channel", "bounceClassification", "occurredAt", "recordedAt", "notes",
  "source", "recordedBy", "outreachDraftVersionRef", "attribution", "audit", "contentHash",
] as const;
const OUTCOME_REF_FIELDS = [
  "tenantId", "workspaceId", "accountId", "playVersionId", "stableKey", "versionId", "versionHash", "contentHash", "outcome",
  "occurredAt", "recordedAt", "sourceHash", "attributionKind", "attributionConfidenceBasisPoints", "outcomeRefHash",
] as const;
const OUTCOME_SOURCE_FIELDS = [
  "sourceVersion", "tenantId", "workspaceId", "accountId", "kind", "sourceId", "sourceVersionId", "sourceContentHash",
  "sourceReceiptHash", "observedAt", "sourceHash",
] as const;
const COHORT_FIELDS = ["cohortId", "definitionHash", "windowStart", "windowEnd", "denominator"] as const;
const METRIC_FIELDS = ["metricKey", "formulaVersion", "numerator", "denominator", "valueBasisPoints"] as const;
const TARGET_FIELDS = ["kind", "currentPlayVersionId", "currentPolicyHash"] as const;
const CHANGE_FIELDS = ["kind", "targetKey", "currentValue", "proposedValue", "rationale"] as const;
const UNCERTAINTY_FIELDS = ["uncertaintyId", "statement", "impact", "severity"] as const;
const IMPACT_FIELDS = [
  "metricKey", "direction", "estimateBasisPoints", "lowerBoundBasisPoints", "upperBoundBasisPoints", "horizonDays", "rationale",
] as const;
const ROLLBACK_FIELDS = [
  "restorePlayVersionId", "restorePolicyHash", "triggerMetricKey", "triggerThresholdBasisPoints", "reason",
] as const;
const REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "accountId", "playVersionId", "contentHash", "status", "events",
  "reviewHash",
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
const OUTCOME_VERSION = /^outcome-version:[0-9a-f]{64}$/u;
const PROPOSAL_VERSION = /^learning-proposal-version:[0-9a-f]{64}$/u;
const OUTCOMES = new Set<OutcomeTaxonomy>([
  "copied", "exported", "sent_manually", "delivery_unknown", "bounced", "unknown_bounce", "opted_out", "complaint",
  "replied", "meeting_set", "opportunity", "won", "lost", "not_interested", "unknown",
]);
const METRICS = new Set<MetricKey>(["reply_rate", "meeting_rate", "opportunity_rate", "win_rate", "opt_out_rate", "bounce_rate"]);
const CHANGE_KINDS = new Set(["qualification_threshold_basis_points", "score_weight_basis_points", "query_family_status", "outreach_guidance_status"]);
const MAX_OUTCOMES = 100;
const MAX_UNCERTAINTIES = 20;
const MAX_EVENTS = 100;

function failure(code: LearningProposalFailureCode): LearningProposalBuildResult {
  return Object.freeze({ ok: false, code });
}

function reviewFailure(code: LearningProposalFailureCode): LearningProposalReviewResult {
  return Object.freeze({ ok: false, code });
}

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

function exactArray(value: unknown, maximum: number, minimum = 0): readonly unknown[] | null {
  if (!Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(String(key)))) return null;
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output.push(descriptor.value);
    }
    return output;
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

function safeText(value: unknown, maximum = 2_000): value is string {
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
    || typeof accountId !== "string" || !UUID.test(accountId) || typeof playVersionId !== "string" || !PLAY_VERSION.test(playVersionId)) return null;
  return { tenantId, workspaceId, accountId, playVersionId };
}

function sameScope(a: Scope, b: Scope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId && a.accountId === b.accountId
    && a.playVersionId === b.playVersionId;
}

function safeJson(value: unknown, depth = 0): unknown | undefined {
  if (depth > 10) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value === "string") return safeText(value, 4_000) ? value : undefined;
  if (Array.isArray(value)) {
    const array = exactArray(value, 100);
    if (!array) return undefined;
    const output: unknown[] = [];
    for (const item of array) {
      const parsed = safeJson(item, depth + 1);
      if (parsed === undefined) return undefined;
      output.push(parsed);
    }
    return output;
  }
  if (typeof value !== "object" || value === null || isProxy(value)) return undefined;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length > 50 || keys.some((key) => typeof key !== "string")) return undefined;
    const output: PlainRecord = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor) || !safeText(key, 200)) return undefined;
      const parsed = safeJson(descriptor.value, depth + 1);
      if (parsed === undefined) return undefined;
      output[key] = parsed;
    }
    return output;
  } catch {
    return undefined;
  }
}

function outcomeContentPayload(record: PlainRecord, scope: Scope, nested: Readonly<Record<string, unknown>>): unknown {
  return {
    ...scope,
    stableKey: record.stableKey,
    revision: record.revision,
    supersedesVersionId: record.supersedesVersionId,
    outcome: record.outcome,
    channel: record.channel,
    bounceClassification: record.bounceClassification,
    occurredAt: record.occurredAt,
    recordedAt: record.recordedAt,
    notes: record.notes,
    source: nested.source,
    recordedBy: nested.recordedBy,
    outreachDraftVersionRef: nested.outreachDraftVersionRef,
    attribution: nested.attribution,
    audit: nested.audit,
  };
}

function parseOutcomeRecord(value: unknown, scope: Scope): ParseResult<LearningOutcomeRef> {
  const record = exactRecord(value, OUTCOME_RECORD_FIELDS);
  if (!record || record.schemaVersion !== 1) return { value: null, code: "MALFORMED_INPUT" };
  const outcomeScope = parseScope(record);
  if (!outcomeScope) return { value: null, code: "MALFORMED_INPUT" };
  if (!sameScope(scope, outcomeScope)) return { value: null, code: "SCOPE_MISMATCH" };
  if (typeof record.versionId !== "string" || !OUTCOME_VERSION.test(record.versionId)
    || typeof record.versionHash !== "string" || !HASH.test(record.versionHash)
    || typeof record.contentHash !== "string" || !HASH.test(record.contentHash) || !safeRef(record.stableKey)
    || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1
    || (record.supersedesVersionId !== null && (typeof record.supersedesVersionId !== "string" || !OUTCOME_VERSION.test(record.supersedesVersionId)))
    || typeof record.outcome !== "string" || !OUTCOMES.has(record.outcome as OutcomeTaxonomy)
    || !safeDate(record.occurredAt) || !safeDate(record.recordedAt) || record.occurredAt > record.recordedAt || !safeText(record.notes)) {
    return { value: null, code: "MALFORMED_INPUT" };
  }
  const source = safeJson(record.source);
  const recordedBy = safeJson(record.recordedBy);
  const outreachDraftVersionRef = safeJson(record.outreachDraftVersionRef);
  const attribution = safeJson(record.attribution);
  const audit = safeJson(record.audit);
  if (!source || !recordedBy || outreachDraftVersionRef === undefined || !attribution || !audit
    || typeof source !== "object" || Array.isArray(source) || typeof attribution !== "object" || Array.isArray(attribution)) {
    return { value: null, code: "MALFORMED_INPUT" };
  }
  const sourceRecord = exactRecord(source, OUTCOME_SOURCE_FIELDS);
  const attributionRecord = attribution as PlainRecord;
  if (!sourceRecord || sourceRecord.sourceVersion !== 1 || sourceRecord.tenantId !== scope.tenantId
    || sourceRecord.workspaceId !== scope.workspaceId || sourceRecord.accountId !== scope.accountId
    || (sourceRecord.kind !== "member_observation" && sourceRecord.kind !== "approved_import")
    || !safeRef(sourceRecord.sourceId) || !safeRef(sourceRecord.sourceVersionId)
    || typeof sourceRecord.sourceContentHash !== "string" || !HASH.test(sourceRecord.sourceContentHash)
    || typeof sourceRecord.sourceReceiptHash !== "string" || !HASH.test(sourceRecord.sourceReceiptHash)
    || !safeDate(sourceRecord.observedAt) || typeof sourceRecord.sourceHash !== "string" || !HASH.test(sourceRecord.sourceHash)
    || (attributionRecord.kind !== "direct" && attributionRecord.kind !== "assisted" && attributionRecord.kind !== "unknown")
    || !Number.isSafeInteger(attributionRecord.confidenceBasisPoints) || (attributionRecord.confidenceBasisPoints as number) < 0
    || (attributionRecord.confidenceBasisPoints as number) > 10_000) return { value: null, code: "MALFORMED_INPUT" };
  const sourcePayload = {
    sourceVersion: 1,
    tenantId: sourceRecord.tenantId,
    workspaceId: sourceRecord.workspaceId,
    accountId: sourceRecord.accountId,
    kind: sourceRecord.kind,
    sourceId: sourceRecord.sourceId,
    sourceVersionId: sourceRecord.sourceVersionId,
    sourceContentHash: sourceRecord.sourceContentHash,
    sourceReceiptHash: sourceRecord.sourceReceiptHash,
    observedAt: sourceRecord.observedAt,
  };
  if (hashJson(sourcePayload) !== sourceRecord.sourceHash) return { value: null, code: "MALFORMED_INPUT" };
  const nested = { source, recordedBy, outreachDraftVersionRef, attribution, audit };
  const contentHash = hashJson(outcomeContentPayload(record, outcomeScope, nested));
  const versionHash = hashJson({ schemaVersion: 1, contentHash });
  if (contentHash !== record.contentHash || versionHash !== record.versionHash
    || record.versionId !== `outcome-version:${versionHash.slice(7)}`) return { value: null, code: "MALFORMED_INPUT" };
  const payload = {
    ...outcomeScope,
    stableKey: record.stableKey as string,
    versionId: record.versionId,
    versionHash,
    contentHash,
    outcome: record.outcome as OutcomeTaxonomy,
    occurredAt: record.occurredAt,
    recordedAt: record.recordedAt,
    sourceHash: sourceRecord.sourceHash,
    attributionKind: attributionRecord.kind,
    attributionConfidenceBasisPoints: attributionRecord.confidenceBasisPoints as number,
  } as const;
  return { value: deepFreeze({ ...payload, outcomeRefHash: hashJson(payload) }), code: null };
}

function parseOutcomeRef(value: unknown, scope: Scope): LearningOutcomeRef | null {
  const record = exactRecord(value, OUTCOME_REF_FIELDS);
  if (!record) return null;
  const refScope = parseScope(record);
  if (!refScope || !sameScope(scope, refScope) || typeof record.versionId !== "string" || !OUTCOME_VERSION.test(record.versionId)
    || !safeRef(record.stableKey)
    || typeof record.versionHash !== "string" || !HASH.test(record.versionHash) || typeof record.contentHash !== "string"
    || !HASH.test(record.contentHash) || typeof record.outcome !== "string" || !OUTCOMES.has(record.outcome as OutcomeTaxonomy)
    || !safeDate(record.occurredAt) || !safeDate(record.recordedAt) || typeof record.sourceHash !== "string" || !HASH.test(record.sourceHash)
    || (record.attributionKind !== "direct" && record.attributionKind !== "assisted" && record.attributionKind !== "unknown")
    || !Number.isSafeInteger(record.attributionConfidenceBasisPoints) || typeof record.outcomeRefHash !== "string" || !HASH.test(record.outcomeRefHash)) return null;
  const payload = {
    ...refScope,
    stableKey: record.stableKey as string,
    versionId: record.versionId,
    versionHash: record.versionHash,
    contentHash: record.contentHash,
    outcome: record.outcome as OutcomeTaxonomy,
    occurredAt: record.occurredAt,
    recordedAt: record.recordedAt,
    sourceHash: record.sourceHash,
    attributionKind: record.attributionKind as LearningOutcomeRef["attributionKind"],
    attributionConfidenceBasisPoints: record.attributionConfidenceBasisPoints as number,
  };
  return hashJson(payload) === record.outcomeRefHash ? deepFreeze({ ...payload, outcomeRefHash: record.outcomeRefHash }) : null;
}

function parseCohort(value: unknown, refs: readonly LearningOutcomeRef[]): Cohort | null {
  const record = exactRecord(value, COHORT_FIELDS);
  if (!record || !safeRef(record.cohortId) || typeof record.definitionHash !== "string" || !HASH.test(record.definitionHash)
    || !safeDate(record.windowStart) || !safeDate(record.windowEnd)) return null;
  const windowStart = record.windowStart as string;
  const windowEnd = record.windowEnd as string;
  if (windowStart >= windowEnd || record.denominator !== refs.length
    || refs.some((entry) => entry.occurredAt < windowStart || entry.occurredAt >= windowEnd)) return null;
  return deepFreeze({
    cohortId: record.cohortId,
    definitionHash: record.definitionHash,
    windowStart,
    windowEnd,
    denominator: record.denominator as number,
  });
}

function metricMatch(metricKey: MetricKey, outcome: OutcomeTaxonomy): boolean {
  if (metricKey === "reply_rate") return outcome === "replied";
  if (metricKey === "meeting_rate") return outcome === "meeting_set";
  if (metricKey === "opportunity_rate") return outcome === "opportunity";
  if (metricKey === "win_rate") return outcome === "won";
  if (metricKey === "opt_out_rate") return outcome === "opted_out";
  return outcome === "bounced" || outcome === "unknown_bounce";
}

function parseMetric(value: unknown, refs: readonly LearningOutcomeRef[]): ParseResult<Metric> {
  const record = exactRecord(value, METRIC_FIELDS);
  if (!record || typeof record.metricKey !== "string" || !METRICS.has(record.metricKey as MetricKey) || !safeRef(record.formulaVersion)
    || !Number.isSafeInteger(record.numerator) || !Number.isSafeInteger(record.denominator) || !Number.isSafeInteger(record.valueBasisPoints)) {
    return { value: null, code: "MALFORMED_INPUT" };
  }
  const numerator = refs.filter((entry) => metricMatch(record.metricKey as MetricKey, entry.outcome)).length;
  const valueBasisPoints = Math.round((numerator * 10_000) / refs.length);
  if (record.numerator !== numerator || record.denominator !== refs.length || record.valueBasisPoints !== valueBasisPoints)
    return { value: null, code: "METRIC_MISMATCH" };
  return { value: deepFreeze({
    metricKey: record.metricKey as MetricKey,
    formulaVersion: record.formulaVersion,
    numerator,
    denominator: refs.length,
    valueBasisPoints,
  }), code: null };
}

function parseTarget(value: unknown, scope: Scope): Target | null {
  const record = exactRecord(value, TARGET_FIELDS);
  if (!record || record.kind !== "play_policy" || record.currentPlayVersionId !== scope.playVersionId
    || typeof record.currentPolicyHash !== "string" || !HASH.test(record.currentPolicyHash)) return null;
  return deepFreeze({ kind: "play_policy", currentPlayVersionId: scope.playVersionId, currentPolicyHash: record.currentPolicyHash });
}

function parseChange(value: unknown): Change | null {
  const record = exactRecord(value, CHANGE_FIELDS);
  if (!record || typeof record.kind !== "string" || !CHANGE_KINDS.has(record.kind) || !safeRef(record.targetKey)
    || !safeText(record.rationale) || record.currentValue === record.proposedValue) return null;
  const basisPoints = record.kind === "qualification_threshold_basis_points" || record.kind === "score_weight_basis_points";
  if (basisPoints) {
    if (!Number.isSafeInteger(record.currentValue) || (record.currentValue as number) < 0 || (record.currentValue as number) > 10_000
      || !Number.isSafeInteger(record.proposedValue) || (record.proposedValue as number) < 0 || (record.proposedValue as number) > 10_000) return null;
  } else if ((record.currentValue !== "enabled" && record.currentValue !== "disabled")
    || (record.proposedValue !== "enabled" && record.proposedValue !== "disabled")) return null;
  return deepFreeze({
    kind: record.kind as Change["kind"],
    targetKey: record.targetKey,
    currentValue: record.currentValue as Change["currentValue"],
    proposedValue: record.proposedValue as Change["proposedValue"],
    rationale: record.rationale,
  });
}

function parseUncertainties(value: unknown): readonly Uncertainty[] | null {
  const array = exactArray(value, MAX_UNCERTAINTIES, 1);
  if (!array) return null;
  const output: Uncertainty[] = [];
  for (const candidate of array) {
    const record = exactRecord(candidate, UNCERTAINTY_FIELDS);
    if (!record || !safeRef(record.uncertaintyId) || !safeText(record.statement) || !safeText(record.impact)
      || !Number.isSafeInteger(record.severity) || (record.severity as number) < 1 || (record.severity as number) > 5) return null;
    output.push(deepFreeze({
      uncertaintyId: record.uncertaintyId,
      statement: record.statement,
      impact: record.impact,
      severity: record.severity as number,
    }));
  }
  return new Set(output.map((item) => item.uncertaintyId)).size === output.length ? deepFreeze(output) : null;
}

function parseImpact(value: unknown, metric: Metric): ExpectedImpact | null {
  const record = exactRecord(value, IMPACT_FIELDS);
  if (!record || record.metricKey !== metric.metricKey || (record.direction !== "increase" && record.direction !== "decrease")
    || !Number.isSafeInteger(record.estimateBasisPoints) || !Number.isSafeInteger(record.lowerBoundBasisPoints)
    || !Number.isSafeInteger(record.upperBoundBasisPoints) || (record.lowerBoundBasisPoints as number) > (record.estimateBasisPoints as number)
    || (record.estimateBasisPoints as number) > (record.upperBoundBasisPoints as number)
    || !Number.isSafeInteger(record.horizonDays) || (record.horizonDays as number) < 1 || (record.horizonDays as number) > 365
    || !safeText(record.rationale)) return null;
  return deepFreeze({
    metricKey: record.metricKey as MetricKey,
    direction: record.direction,
    estimateBasisPoints: record.estimateBasisPoints as number,
    lowerBoundBasisPoints: record.lowerBoundBasisPoints as number,
    upperBoundBasisPoints: record.upperBoundBasisPoints as number,
    horizonDays: record.horizonDays as number,
    rationale: record.rationale,
  });
}

function parseRollback(value: unknown, target: Target): Rollback | null {
  const record = exactRecord(value, ROLLBACK_FIELDS);
  if (!record || record.restorePlayVersionId !== target.currentPlayVersionId || record.restorePolicyHash !== target.currentPolicyHash
    || typeof record.triggerMetricKey !== "string" || !METRICS.has(record.triggerMetricKey as MetricKey)
    || !Number.isSafeInteger(record.triggerThresholdBasisPoints) || (record.triggerThresholdBasisPoints as number) < 0
    || (record.triggerThresholdBasisPoints as number) > 10_000 || !safeText(record.reason)) return null;
  return deepFreeze({
    restorePlayVersionId: record.restorePlayVersionId,
    restorePolicyHash: record.restorePolicyHash,
    triggerMetricKey: record.triggerMetricKey as MetricKey,
    triggerThresholdBasisPoints: record.triggerThresholdBasisPoints as number,
    reason: record.reason,
  });
}

function parseActor(value: unknown): Readonly<{ kind: "human"; actorId: string }> | null {
  const record = exactRecord(value, ACTOR_FIELDS);
  return record?.kind === "human" && typeof record.actorId === "string" && UUID.test(record.actorId)
    ? deepFreeze({ kind: "human", actorId: record.actorId }) : null;
}

function parseReview(value: unknown, scope: Scope, versionId: string, contentHash: string, createdAt: string): LearningProposalReview | null {
  const record = exactRecord(value, REVIEW_FIELDS);
  if (!record || record.reviewVersion !== 1 || record.versionId !== versionId || record.contentHash !== contentHash) return null;
  const reviewScope = parseScope(record);
  if (!reviewScope || !sameScope(scope, reviewScope) || typeof record.reviewHash !== "string" || !HASH.test(record.reviewHash)) return null;
  const rawEvents = exactArray(record.events, MAX_EVENTS);
  if (!rawEvents) return null;
  const events: LearningProposalReviewEvent[] = [];
  let status: LearningProposalReview["status"] = "draft";
  let lastAt = createdAt;
  for (const candidate of rawEvents) {
    const event = exactRecord(candidate, EVENT_FIELDS);
    const actor = event ? parseActor(event.actor) : null;
    if (!event || !actor || event.from !== status || !safeDate(event.at) || event.at <= lastAt || !safeText(event.reason, 1_000)) return null;
    if ((status === "draft" && event.to !== "in_review")
      || (status === "in_review" && event.to !== "approved" && event.to !== "rejected")) return null;
    const next = event.to as LearningProposalReviewEvent["to"];
    events.push(deepFreeze({ from: event.from as LearningProposalReviewEvent["from"], to: next, actor, at: event.at, reason: event.reason }));
    status = next;
    lastAt = event.at;
  }
  if (record.status !== status) return null;
  const base: Omit<LearningProposalReview, "reviewHash"> = {
    reviewVersion: 1, versionId, ...scope, contentHash, status, events: deepFreeze(events),
  };
  return hashJson(base) === record.reviewHash ? deepFreeze({ ...base, reviewHash: record.reviewHash }) : null;
}

function contentPayload(proposal: Pick<LearningProposal,
  "tenantId" | "workspaceId" | "accountId" | "playVersionId" | "stableKey" | "revision" | "supersedesVersionId"
  | "createdAt" | "outcomeRefs" | "cohort" | "metric" | "target" | "change" | "uncertainties" | "expectedImpact"
  | "rollback">): unknown {
  return proposal;
}

function parseProposal(value: unknown): LearningProposal | null {
  const record = exactRecord(value, PROPOSAL_FIELDS);
  if (!record || record.schemaVersion !== LEARNING_PROPOSAL_SCHEMA_VERSION) return null;
  const scope = parseScope(record);
  if (!scope || typeof record.versionId !== "string" || !PROPOSAL_VERSION.test(record.versionId)
    || typeof record.versionHash !== "string" || !HASH.test(record.versionHash) || !safeRef(record.stableKey)
    || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1
    || (record.supersedesVersionId !== null && (typeof record.supersedesVersionId !== "string" || !PROPOSAL_VERSION.test(record.supersedesVersionId)))
    || !safeDate(record.createdAt) || typeof record.contentHash !== "string" || !HASH.test(record.contentHash)) return null;
  const rawRefs = exactArray(record.outcomeRefs, MAX_OUTCOMES, 1);
  if (!rawRefs) return null;
  const refs = rawRefs.map((item) => parseOutcomeRef(item, scope));
  if (refs.some((item) => item === null)) return null;
  const outcomeRefs = refs as LearningOutcomeRef[];
  if (new Set(outcomeRefs.map((item) => item.versionId)).size !== outcomeRefs.length
    || new Set(outcomeRefs.map((item) => item.stableKey)).size !== outcomeRefs.length) return null;
  const cohort = parseCohort(record.cohort, outcomeRefs);
  const metricResult = parseMetric(record.metric, outcomeRefs);
  const target = parseTarget(record.target, scope);
  const change = parseChange(record.change);
  const uncertainties = parseUncertainties(record.uncertainties);
  if (!cohort || !metricResult.value || !target || !change || !uncertainties) return null;
  const expectedImpact = parseImpact(record.expectedImpact, metricResult.value);
  const rollback = parseRollback(record.rollback, target);
  if (!expectedImpact || !rollback) return null;
  const base = {
    ...scope,
    stableKey: record.stableKey,
    revision: record.revision as number,
    supersedesVersionId: record.supersedesVersionId as string | null,
    createdAt: record.createdAt,
    outcomeRefs,
    cohort,
    metric: metricResult.value,
    target,
    change,
    uncertainties,
    expectedImpact,
    rollback,
  };
  const contentHash = hashJson(contentPayload(base));
  const versionHash = hashJson({ schemaVersion: LEARNING_PROPOSAL_SCHEMA_VERSION, contentHash });
  if (contentHash !== record.contentHash || versionHash !== record.versionHash
    || record.versionId !== `learning-proposal-version:${versionHash.slice(7)}`) return null;
  const review = parseReview(record.review, scope, record.versionId, contentHash, record.createdAt);
  return review ? deepFreeze({
    schemaVersion: LEARNING_PROPOSAL_SCHEMA_VERSION,
    versionId: record.versionId,
    versionHash,
    ...base,
    contentHash,
    review,
  }) : null;
}

function lastReviewAt(proposal: LearningProposal): string {
  return proposal.review.events.at(-1)?.at ?? proposal.createdAt;
}

/** Produces proposal state only; neither build nor review mutates or activates a play policy. */
export function buildLearningProposal(input: unknown): LearningProposalBuildResult {
  const record = exactRecord(input, INPUT_FIELDS);
  if (!record || record.version !== 1) return failure("MALFORMED_INPUT");
  const scope = parseScope(record);
  if (!scope || !safeRef(record.stableKey) || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1
    || !safeDate(record.createdAt)) return failure("MALFORMED_INPUT");
  const createdAt = record.createdAt as string;
  const rawOutcomes = exactArray(record.outcomeRecords, MAX_OUTCOMES, 1);
  if (!rawOutcomes) return failure("MALFORMED_INPUT");
  const outcomeRefs: LearningOutcomeRef[] = [];
  for (const candidate of rawOutcomes) {
    const parsed = parseOutcomeRecord(candidate as OutcomeRecord, scope);
    if (!parsed.value) return failure(parsed.code ?? "MALFORMED_INPUT");
    outcomeRefs.push(parsed.value);
  }
  if (new Set(outcomeRefs.map((item) => item.versionId)).size !== outcomeRefs.length
    || new Set(outcomeRefs.map((item) => item.stableKey)).size !== outcomeRefs.length) return failure("MALFORMED_INPUT");
  if (outcomeRefs.some((item) => item.recordedAt >= createdAt)) return failure("INVALID_CHRONOLOGY");
  const cohort = parseCohort(record.cohort, outcomeRefs);
  if (!cohort || cohort.windowEnd > createdAt) return failure("INVALID_CHRONOLOGY");
  const metricResult = parseMetric(record.metric, outcomeRefs);
  if (!metricResult.value) return failure(metricResult.code ?? "MALFORMED_INPUT");
  const target = parseTarget(record.target, scope);
  const change = parseChange(record.change);
  const uncertainties = parseUncertainties(record.uncertainties);
  if (!target || !change || !uncertainties) return failure("MALFORMED_INPUT");
  const expectedImpact = parseImpact(record.expectedImpact, metricResult.value);
  const rollback = parseRollback(record.rollback, target);
  if (!expectedImpact || !rollback) return failure("MALFORMED_INPUT");

  let supersedesVersionId: string | null = null;
  if (record.revision === 1) {
    if (record.predecessor !== null) return failure("VERSION_CONFLICT");
  } else {
    const predecessor = parseProposal(record.predecessor);
    if (!predecessor) return failure("MALFORMED_INPUT");
    if (!sameScope(scope, predecessor)) return failure("SCOPE_MISMATCH");
    if (predecessor.stableKey !== record.stableKey || record.revision !== predecessor.revision + 1)
      return failure("VERSION_CONFLICT");
    if (predecessor.review.status !== "approved") return failure("INVALID_TRANSITION");
    if (createdAt <= lastReviewAt(predecessor)) return failure("INVALID_CHRONOLOGY");
    supersedesVersionId = predecessor.versionId;
  }
  const base = {
    ...scope,
    stableKey: record.stableKey as string,
    revision: record.revision as number,
    supersedesVersionId,
    createdAt,
    outcomeRefs: deepFreeze(outcomeRefs),
    cohort,
    metric: metricResult.value,
    target,
    change,
    uncertainties,
    expectedImpact,
    rollback,
  };
  const contentHash = hashJson(contentPayload(base));
  const versionHash = hashJson({ schemaVersion: LEARNING_PROPOSAL_SCHEMA_VERSION, contentHash });
  const versionId = `learning-proposal-version:${versionHash.slice(7)}`;
  const reviewBase: Omit<LearningProposalReview, "reviewHash"> = {
    reviewVersion: 1, versionId, ...scope, contentHash, status: "draft", events: deepFreeze([]),
  };
  const review = deepFreeze({ ...reviewBase, reviewHash: hashJson(reviewBase) });
  const proposal = deepFreeze({
    schemaVersion: LEARNING_PROPOSAL_SCHEMA_VERSION,
    versionId,
    versionHash,
    ...base,
    contentHash,
    review,
  });
  return deepFreeze({
    ok: true,
    code: record.revision === 1 ? "LEARNING_PROPOSAL_CREATED" : "LEARNING_PROPOSAL_VERSION_CREATED",
    proposal,
  });
}

export function transitionLearningProposalReview(input: unknown): LearningProposalReviewResult {
  const record = exactRecord(input, TRANSITION_FIELDS);
  if (!record || record.version !== 1) return reviewFailure("MALFORMED_INPUT");
  const scope = parseScope(record);
  if (!scope) return reviewFailure("MALFORMED_INPUT");
  const current = parseProposal(record.current);
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
  } as LearningProposalReviewEvent);
  const events = deepFreeze([...current.review.events, event]);
  const reviewBase: Omit<LearningProposalReview, "reviewHash"> = {
    reviewVersion: 1,
    versionId: current.versionId,
    ...scope,
    contentHash: current.contentHash,
    status: record.to as "in_review" | "approved" | "rejected",
    events,
  };
  const review = deepFreeze({ ...reviewBase, reviewHash: hashJson(reviewBase) });
  return deepFreeze({
    ok: true,
    code: "LEARNING_PROPOSAL_REVIEW_TRANSITIONED",
    proposal: deepFreeze({ ...current, review }),
  });
}
