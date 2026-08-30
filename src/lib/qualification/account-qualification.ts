import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

export const ACCOUNT_QUALIFICATION_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string; accountId: string }>;
type DataRecord = Record<string, unknown>;

export type QualificationDecision = "qualified" | "needs_review" | "unqualified";
export type QualificationReviewStatus = "unreviewed" | "confirmed" | "overridden";

export type QualificationObservation = Scope & Readonly<{
  observationId: string;
  observedAt: string;
  payloadHash: string;
  provenanceHash: string;
}>;

export type QualificationPolicyFactor = Readonly<{ factorId: string; weight: number }>;
export type QualificationPolicy = Readonly<{
  policyVersion: 1;
  policyId: string;
  qualifiedThreshold: number;
  reviewThreshold: number;
  factors: readonly QualificationPolicyFactor[];
}>;

export type QualificationFactor = Readonly<{
  factorId: string;
  weight: number;
  score: number;
  reason: string;
  evidenceObservationIds: readonly string[];
  uncertainty: Readonly<{ level: "none" | "low" | "high"; reason: string | null }>;
}>;

export type QualificationContactContext = Readonly<{
  status: "present";
  contactRecordId: string;
  observedAt: string;
  evidenceObservationIds: readonly string[];
}>;

export type QualificationReviewEvent = Readonly<{
  eventId: string;
  fromQualificationHash: string;
  action: "confirm" | "override";
  fromDecision: QualificationDecision;
  toDecision: QualificationDecision;
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
}>;

export type AccountQualification = Scope & Readonly<{
  qualificationVersion: typeof ACCOUNT_QUALIFICATION_VERSION;
  versionId: string;
  qualificationHash: string;
  playVersionId: string;
  playContentHash: string;
  evaluatedAt: string;
  policy: QualificationPolicy;
  policyHash: string;
  observations: readonly QualificationObservation[];
  factors: readonly QualificationFactor[];
  contactContext: QualificationContactContext | null;
  weightedScore: number;
  automatedDecision: QualificationDecision;
  decision: QualificationDecision;
  reviewStatus: QualificationReviewStatus;
  reviewEvents: readonly QualificationReviewEvent[];
}>;

export type AccountQualificationFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "CAP_EXCEEDED"
  | "DUPLICATE_ITEM"
  | "EVIDENCE_MISMATCH"
  | "STALE_VERSION"
  | "INVALID_TRANSITION"
  | "HUMAN_REVIEW_REQUIRED";

export type AccountQualificationResult = Readonly<
  | { ok: true; code: "ACCOUNT_QUALIFIED"; qualification: AccountQualification }
  | { ok: false; code: AccountQualificationFailureCode }
>;

export type AccountQualificationReviewResult = Readonly<
  | { ok: true; code: "ACCOUNT_QUALIFICATION_REVIEWED"; qualification: AccountQualification }
  | { ok: false; code: AccountQualificationFailureCode }
>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "playVersionId", "playContentHash", "evaluatedAt",
  "policy", "observations", "factors", "contactContext",
] as const;
const POLICY_FIELDS = ["policyVersion", "policyId", "qualifiedThreshold", "reviewThreshold", "factors"] as const;
const POLICY_FACTOR_FIELDS = ["factorId", "weight"] as const;
const OBSERVATION_FIELDS = [
  "observationId", "tenantId", "workspaceId", "accountId", "observedAt", "payloadHash", "provenanceHash",
] as const;
const FACTOR_FIELDS = ["factorId", "score", "reason", "evidenceObservationIds", "uncertainty"] as const;
const OUTPUT_FACTOR_FIELDS = ["factorId", "weight", "score", "reason", "evidenceObservationIds", "uncertainty"] as const;
const UNCERTAINTY_FIELDS = ["level", "reason"] as const;
const CONTACT_FIELDS = ["status", "contactRecordId", "observedAt", "evidenceObservationIds"] as const;
const QUALIFICATION_FIELDS = [
  "qualificationVersion", "tenantId", "workspaceId", "accountId", "playVersionId", "playContentHash",
  "evaluatedAt", "policy", "policyHash", "observations", "factors", "contactContext", "weightedScore",
  "automatedDecision", "decision", "reviewStatus", "reviewEvents", "versionId", "qualificationHash",
] as const;
const REVIEW_INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "current", "expectedQualificationHash", "action",
  "decision", "actor", "at", "reason",
] as const;
const REVIEW_EVENT_FIELDS = [
  "eventId", "fromQualificationHash", "action", "fromDecision", "toDecision", "actor", "at", "reason",
] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._@/-]{0,299}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const PLAY_VERSION = /^lead-play-version:[0-9a-f]{64}$/u;
const QUALIFICATION_ID = /^account-qualification:[0-9a-f]{64}$/u;
const MAX_OBSERVATIONS = 64;
const MAX_FACTORS = 32;
const MAX_EVIDENCE_REFS = 64;
const MAX_REVIEW_EVENTS = 50;

function inspectRecord(value: unknown): DataRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || utilTypes.isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const output: DataRecord = Object.create(null) as DataRecord;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output[key] = descriptor.value;
    }
    return output;
  } catch {
    return null;
  }
}

function exactRecord(value: unknown, fields: readonly string[]): DataRecord | null {
  const record = inspectRecord(value);
  if (!record) return null;
  const keys = Object.keys(record);
  return keys.length === fields.length && keys.every((key) => fields.includes(key)) ? record : null;
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | "cap" | null {
  if (typeof value !== "object" || value === null || !Array.isArray(value) || utilTypes.isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    if (value.length > maximum) return "cap";
    if (Reflect.ownKeys(value).length !== value.length + 1) return null;
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function boundedText(value: unknown, maximum = 2_000): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value === value.trim()
    && isWellFormedUnicode(value)
    && !/[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value) ? value : null;
}

function ref(value: unknown): string | null {
  return typeof value === "string" && REF.test(value) ? value : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number : null;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId
    && left.accountId === right.accountId;
}

function failure(code: AccountQualificationFailureCode): Readonly<{ ok: false; code: AccountQualificationFailureCode }> {
  return Object.freeze({ ok: false, code });
}

function parsePolicy(value: unknown): QualificationPolicy | null | "cap" | "duplicate" {
  const record = exactRecord(value, POLICY_FIELDS);
  const policyId = record && ref(record.policyId);
  const qualifiedThreshold = record && integer(record.qualifiedThreshold, 1, 100);
  const reviewThreshold = record && integer(record.reviewThreshold, 0, 99);
  const rawFactors = record && exactArray(record.factors, MAX_FACTORS);
  if (rawFactors === "cap") return "cap";
  if (!record || record.policyVersion !== 1 || !policyId || qualifiedThreshold === null || reviewThreshold === null
    || reviewThreshold >= qualifiedThreshold || !rawFactors || rawFactors.length === 0) return null;
  const factors: QualificationPolicyFactor[] = [];
  const ids = new Set<string>();
  let totalWeight = 0;
  for (const raw of rawFactors) {
    const factor = exactRecord(raw, POLICY_FACTOR_FIELDS);
    const factorId = factor && ref(factor.factorId);
    const weight = factor && integer(factor.weight, 1, 100);
    if (!factor || !factorId || weight === null) return null;
    if (ids.has(factorId)) return "duplicate";
    ids.add(factorId);
    totalWeight += weight;
    factors.push(Object.freeze({ factorId, weight }));
  }
  if (totalWeight > 1_000) return "cap";
  factors.sort((left, right) => compare(left.factorId, right.factorId));
  return Object.freeze({
    policyVersion: 1,
    policyId,
    qualifiedThreshold,
    reviewThreshold,
    factors: Object.freeze(factors),
  });
}

function parseObservation(value: unknown): QualificationObservation | null {
  const record = exactRecord(value, OBSERVATION_FIELDS);
  const observationId = record && ref(record.observationId);
  const tenantId = record && typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = record && typeof record.workspaceId === "string" && UUID.test(record.workspaceId)
    ? record.workspaceId : null;
  const accountId = record && typeof record.accountId === "string" && UUID.test(record.accountId) ? record.accountId : null;
  const observedAt = record && timestamp(record.observedAt);
  if (!record || !observationId || !tenantId || !workspaceId || !accountId || !observedAt
    || typeof record.payloadHash !== "string" || !HASH.test(record.payloadHash)
    || typeof record.provenanceHash !== "string" || !HASH.test(record.provenanceHash)) return null;
  return Object.freeze({
    observationId, tenantId, workspaceId, accountId, observedAt,
    payloadHash: record.payloadHash, provenanceHash: record.provenanceHash,
  });
}

function parseRefs(value: unknown): readonly string[] | null | "cap" | "duplicate" {
  const raw = exactArray(value, MAX_EVIDENCE_REFS);
  if (raw === "cap") return "cap";
  if (!raw) return null;
  const output: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = ref(item);
    if (!parsed) return null;
    if (seen.has(parsed)) return "duplicate";
    seen.add(parsed);
    output.push(parsed);
  }
  output.sort(compare);
  return Object.freeze(output);
}

function parseContactContext(
  value: unknown,
  observationIds: ReadonlySet<string>,
  evaluatedAt: string,
): QualificationContactContext | null | "malformed" | "cap" | "duplicate" | "evidence" {
  if (value === null) return null;
  const record = exactRecord(value, CONTACT_FIELDS);
  const contactRecordId = record && ref(record.contactRecordId);
  const observedAt = record && timestamp(record.observedAt);
  const evidenceObservationIds = record && parseRefs(record.evidenceObservationIds);
  if (evidenceObservationIds === "cap") return "cap";
  if (evidenceObservationIds === "duplicate") return "duplicate";
  if (!record || record.status !== "present" || !contactRecordId || !observedAt || !evidenceObservationIds?.length
    || Date.parse(observedAt) > Date.parse(evaluatedAt)) return "malformed";
  if (evidenceObservationIds.some((id) => !observationIds.has(id))) return "evidence";
  return Object.freeze({ status: "present", contactRecordId, observedAt, evidenceObservationIds });
}

function createQualification(
  base: Omit<AccountQualification, "qualificationVersion" | "versionId" | "qualificationHash">,
): AccountQualification {
  const payload = Object.freeze({ qualificationVersion: ACCOUNT_QUALIFICATION_VERSION, ...base });
  const qualificationHash = sha256(payload);
  return Object.freeze({
    ...payload,
    versionId: `account-qualification:${qualificationHash.slice("sha256:".length)}`,
    qualificationHash,
  });
}

function rebuildQualification(
  current: AccountQualification,
  decision: QualificationDecision,
  reviewStatus: QualificationReviewStatus,
  reviewEvents: readonly QualificationReviewEvent[],
): AccountQualification {
  return createQualification({
    tenantId: current.tenantId,
    workspaceId: current.workspaceId,
    accountId: current.accountId,
    playVersionId: current.playVersionId,
    playContentHash: current.playContentHash,
    evaluatedAt: current.evaluatedAt,
    policy: current.policy,
    policyHash: current.policyHash,
    observations: current.observations,
    factors: current.factors,
    contactContext: current.contactContext,
    weightedScore: current.weightedScore,
    automatedDecision: current.automatedDecision,
    decision,
    reviewStatus,
    reviewEvents: Object.freeze([...reviewEvents]),
  });
}

function automatedDecisionFor(
  weightedScore: number,
  policy: QualificationPolicy,
  hasHighUncertainty: boolean,
): QualificationDecision {
  return hasHighUncertainty ? "needs_review"
    : weightedScore >= policy.qualifiedThreshold ? "qualified"
      : weightedScore >= policy.reviewThreshold ? "needs_review" : "unqualified";
}

export function qualifyAccount(value: unknown): AccountQualificationResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== ACCOUNT_QUALIFICATION_VERSION) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const accountId = typeof input.accountId === "string" && UUID.test(input.accountId) ? input.accountId : null;
    const playContentHash = typeof input.playContentHash === "string" && HASH.test(input.playContentHash)
      ? input.playContentHash : null;
    const playVersionId = typeof input.playVersionId === "string" && PLAY_VERSION.test(input.playVersionId)
      ? input.playVersionId : null;
    const evaluatedAt = timestamp(input.evaluatedAt);
    const policy = parsePolicy(input.policy);
    const rawObservations = exactArray(input.observations, MAX_OBSERVATIONS);
    const rawFactors = exactArray(input.factors, MAX_FACTORS);
    if (policy === "cap" || rawObservations === "cap" || rawFactors === "cap") return failure("CAP_EXCEEDED");
    if (policy === "duplicate") return failure("DUPLICATE_ITEM");
    if (!tenantId || !workspaceId || !accountId || !playContentHash || !playVersionId
      || playVersionId !== `lead-play-version:${playContentHash.slice("sha256:".length)}` || !evaluatedAt
      || !policy || !rawObservations?.length || !rawFactors) {
      return failure("MALFORMED_INPUT");
    }
    const scope = Object.freeze({ tenantId, workspaceId, accountId });
    const observations: QualificationObservation[] = [];
    const observationIds = new Set<string>();
    for (const raw of rawObservations) {
      const parsed = parseObservation(raw);
      if (!parsed) return failure("MALFORMED_INPUT");
      if (!sameScope(scope, parsed)) return failure("SCOPE_MISMATCH");
      if (observationIds.has(parsed.observationId)) return failure("DUPLICATE_ITEM");
      if (Date.parse(parsed.observedAt) > Date.parse(evaluatedAt)) return failure("MALFORMED_INPUT");
      observationIds.add(parsed.observationId);
      observations.push(parsed);
    }
    observations.sort((left, right) => compare(left.observationId, right.observationId));
    const contactContext = parseContactContext(input.contactContext, observationIds, evaluatedAt);
    if (contactContext === "cap") return failure("CAP_EXCEEDED");
    if (contactContext === "duplicate") return failure("DUPLICATE_ITEM");
    if (contactContext === "evidence") return failure("EVIDENCE_MISMATCH");
    if (contactContext === "malformed") return failure("MALFORMED_INPUT");
    if (rawFactors.length !== policy.factors.length) return failure("MALFORMED_INPUT");
    const policyById = new Map(policy.factors.map((factor) => [factor.factorId, factor]));
    const factors: QualificationFactor[] = [];
    const factorIds = new Set<string>();
    let weightedTotal = 0;
    let totalWeight = 0;
    let hasHighUncertainty = false;
    for (const raw of rawFactors) {
      const record = exactRecord(raw, FACTOR_FIELDS);
      const factorId = record && ref(record.factorId);
      const score = record && integer(record.score, 0, 100);
      const reason = record && boundedText(record.reason);
      const evidenceRefs = record && parseRefs(record.evidenceObservationIds);
      const uncertaintyRecord = record && exactRecord(record.uncertainty, UNCERTAINTY_FIELDS);
      const level = uncertaintyRecord && (uncertaintyRecord.level === "none" || uncertaintyRecord.level === "low"
        || uncertaintyRecord.level === "high") ? uncertaintyRecord.level : null;
      const uncertaintyReason = uncertaintyRecord?.reason === null ? null
        : uncertaintyRecord && boundedText(uncertaintyRecord.reason);
      const policyFactor = factorId ? policyById.get(factorId) : undefined;
      if (evidenceRefs === "cap") return failure("CAP_EXCEEDED");
      if (evidenceRefs === "duplicate" || (factorId && factorIds.has(factorId))) return failure("DUPLICATE_ITEM");
      if (!record || !factorId || score === null || !reason || !evidenceRefs || !uncertaintyRecord || !level
        || (level === "none" ? uncertaintyRecord.reason !== null : !uncertaintyReason)
        || !policyFactor || (evidenceRefs.length === 0 && level === "none")) return failure("MALFORMED_INPUT");
      if (evidenceRefs.some((id) => !observationIds.has(id))) return failure("EVIDENCE_MISMATCH");
      factorIds.add(factorId);
      weightedTotal += score * policyFactor.weight;
      totalWeight += policyFactor.weight;
      hasHighUncertainty ||= level === "high";
      factors.push(Object.freeze({
        factorId,
        weight: policyFactor.weight,
        score,
        reason,
        evidenceObservationIds: evidenceRefs,
        uncertainty: Object.freeze({ level, reason: uncertaintyReason }),
      }));
    }
    factors.sort((left, right) => compare(left.factorId, right.factorId));
    const weightedScore = Math.round(weightedTotal / totalWeight);
    const automatedDecision = automatedDecisionFor(weightedScore, policy, hasHighUncertainty);
    const qualification = createQualification({
      ...scope,
      playVersionId,
      playContentHash,
      evaluatedAt,
      policy,
      policyHash: sha256(policy),
      observations: Object.freeze(observations),
      factors: Object.freeze(factors),
      contactContext,
      weightedScore,
      automatedDecision,
      decision: automatedDecision,
      reviewStatus: "unreviewed",
      reviewEvents: Object.freeze([]),
    });
    return Object.freeze({ ok: true, code: "ACCOUNT_QUALIFIED", qualification });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

function parseQualification(value: unknown): AccountQualification | null | "cap" | "duplicate" | "scope" | "evidence" {
  const record = exactRecord(value, QUALIFICATION_FIELDS);
  if (!record || record.qualificationVersion !== ACCOUNT_QUALIFICATION_VERSION) return null;
  const tenantId = typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = typeof record.workspaceId === "string" && UUID.test(record.workspaceId) ? record.workspaceId : null;
  const accountId = typeof record.accountId === "string" && UUID.test(record.accountId) ? record.accountId : null;
  const playContentHash = typeof record.playContentHash === "string" && HASH.test(record.playContentHash)
    ? record.playContentHash : null;
  const playVersionId = typeof record.playVersionId === "string" && PLAY_VERSION.test(record.playVersionId)
    ? record.playVersionId : null;
  const evaluatedAt = timestamp(record.evaluatedAt);
  const policy = parsePolicy(record.policy);
  const rawObservations = exactArray(record.observations, MAX_OBSERVATIONS);
  const rawFactors = exactArray(record.factors, MAX_FACTORS);
  const rawEvents = exactArray(record.reviewEvents, MAX_REVIEW_EVENTS);
  if (policy === "cap" || rawObservations === "cap" || rawFactors === "cap" || rawEvents === "cap") return "cap";
  if (policy === "duplicate") return "duplicate";
  if (!tenantId || !workspaceId || !accountId || !playContentHash || !playVersionId
    || playVersionId !== `lead-play-version:${playContentHash.slice("sha256:".length)}` || !evaluatedAt || !policy
    || typeof record.policyHash !== "string" || record.policyHash !== sha256(policy)
    || !rawObservations?.length || !rawFactors || !rawEvents) return null;
  const scope = Object.freeze({ tenantId, workspaceId, accountId });
  const observations: QualificationObservation[] = [];
  const observationIds = new Set<string>();
  for (const raw of rawObservations) {
    const parsed = parseObservation(raw);
    if (!parsed) return null;
    if (!sameScope(scope, parsed)) return "scope";
    if (observationIds.has(parsed.observationId)) return "duplicate";
    if (Date.parse(parsed.observedAt) > Date.parse(evaluatedAt)) return null;
    observationIds.add(parsed.observationId);
    observations.push(parsed);
  }
  observations.sort((left, right) => compare(left.observationId, right.observationId));
  const contactContext = parseContactContext(record.contactContext, observationIds, evaluatedAt);
  if (contactContext === "cap") return "cap";
  if (contactContext === "duplicate") return "duplicate";
  if (contactContext === "evidence") return "evidence";
  if (contactContext === "malformed") return null;
  if (rawFactors.length !== policy.factors.length) return null;
  const policyById = new Map(policy.factors.map((factor) => [factor.factorId, factor]));
  const factors: QualificationFactor[] = [];
  const factorIds = new Set<string>();
  let weightedTotal = 0;
  let totalWeight = 0;
  let hasHighUncertainty = false;
  for (const raw of rawFactors) {
    const factor = exactRecord(raw, OUTPUT_FACTOR_FIELDS);
    const factorId = factor && ref(factor.factorId);
    const score = factor && integer(factor.score, 0, 100);
    const weight = factor && integer(factor.weight, 1, 100);
    const reason = factor && boundedText(factor.reason);
    const evidenceRefs = factor && parseRefs(factor.evidenceObservationIds);
    const uncertaintyRecord = factor && exactRecord(factor.uncertainty, UNCERTAINTY_FIELDS);
    const level = uncertaintyRecord && (uncertaintyRecord.level === "none" || uncertaintyRecord.level === "low"
      || uncertaintyRecord.level === "high") ? uncertaintyRecord.level : null;
    const uncertaintyReason = uncertaintyRecord?.reason === null ? null
      : uncertaintyRecord && boundedText(uncertaintyRecord.reason);
    const policyFactor = factorId ? policyById.get(factorId) : undefined;
    if (evidenceRefs === "cap") return "cap";
    if (evidenceRefs === "duplicate" || (factorId && factorIds.has(factorId))) return "duplicate";
    if (!factor || !factorId || score === null || weight === null || !reason || !evidenceRefs || !uncertaintyRecord
      || !level || (level === "none" ? uncertaintyRecord.reason !== null : !uncertaintyReason)
      || !policyFactor || weight !== policyFactor.weight || (evidenceRefs.length === 0 && level === "none")) return null;
    if (evidenceRefs.some((id) => !observationIds.has(id))) return "evidence";
    factorIds.add(factorId);
    weightedTotal += score * weight;
    totalWeight += weight;
    hasHighUncertainty ||= level === "high";
    factors.push(Object.freeze({
      factorId, weight, score, reason, evidenceObservationIds: evidenceRefs,
      uncertainty: Object.freeze({ level, reason: uncertaintyReason }),
    }));
  }
  factors.sort((left, right) => compare(left.factorId, right.factorId));
  const weightedScore = Math.round(weightedTotal / totalWeight);
  const automatedDecision = automatedDecisionFor(weightedScore, policy, hasHighUncertainty);
  if (record.weightedScore !== weightedScore || record.automatedDecision !== automatedDecision) return null;
  let replay = createQualification({
    ...scope,
    playVersionId,
    playContentHash,
    evaluatedAt,
    policy,
    policyHash: sha256(policy),
    observations: Object.freeze(observations),
    factors: Object.freeze(factors),
    contactContext,
    weightedScore,
    automatedDecision,
    decision: automatedDecision,
    reviewStatus: "unreviewed",
    reviewEvents: Object.freeze([]),
  });
  let lastAt = evaluatedAt;
  for (const raw of rawEvents) {
    const event = exactRecord(raw, REVIEW_EVENT_FIELDS);
    const fromQualificationHash = event && typeof event.fromQualificationHash === "string"
      && HASH.test(event.fromQualificationHash) ? event.fromQualificationHash : null;
    const action = event?.action === "confirm" || event?.action === "override" ? event.action : null;
    const fromDecision = event?.fromDecision === "qualified" || event?.fromDecision === "needs_review"
      || event?.fromDecision === "unqualified" ? event.fromDecision : null;
    const toDecision = event?.toDecision === "qualified" || event?.toDecision === "needs_review"
      || event?.toDecision === "unqualified" ? event.toDecision : null;
    const actorRecord = event && exactRecord(event.actor, ACTOR_FIELDS);
    const actorId = actorRecord && typeof actorRecord.actorId === "string" && UUID.test(actorRecord.actorId)
      ? actorRecord.actorId : null;
    const at = event && timestamp(event.at);
    const reason = event && boundedText(event.reason);
    if (!event || !fromQualificationHash || fromQualificationHash !== replay.qualificationHash || !action
      || !fromDecision || fromDecision !== replay.decision || !toDecision || !actorRecord || actorRecord.kind !== "human"
      || !actorId || !at || Date.parse(at) <= Date.parse(lastAt) || !reason
      || (action === "confirm" ? toDecision !== fromDecision : toDecision === fromDecision)) return null;
    const eventPayload = Object.freeze({
      fromQualificationHash,
      action,
      fromDecision,
      toDecision,
      actor: Object.freeze({ kind: "human" as const, actorId }),
      at,
      reason,
    });
    const eventId = `qualification-review-event:${sha256(eventPayload).slice("sha256:".length)}`;
    if (event.eventId !== eventId) return null;
    const parsedEvent: QualificationReviewEvent = Object.freeze({ eventId, ...eventPayload });
    replay = rebuildQualification(
      replay,
      toDecision,
      action === "confirm" ? "confirmed" : "overridden",
      Object.freeze([...replay.reviewEvents, parsedEvent]),
    );
    lastAt = at;
  }
  return typeof record.versionId === "string" && QUALIFICATION_ID.test(record.versionId)
    && record.versionId === replay.versionId && typeof record.qualificationHash === "string"
    && record.qualificationHash === replay.qualificationHash && record.decision === replay.decision
    && record.reviewStatus === replay.reviewStatus ? replay : null;
}

export function reviewAccountQualification(value: unknown): AccountQualificationReviewResult {
  try {
    const input = exactRecord(value, REVIEW_INPUT_FIELDS);
    if (!input || input.version !== ACCOUNT_QUALIFICATION_VERSION) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const accountId = typeof input.accountId === "string" && UUID.test(input.accountId) ? input.accountId : null;
    const current = parseQualification(input.current);
    const expectedQualificationHash = typeof input.expectedQualificationHash === "string"
      && HASH.test(input.expectedQualificationHash) ? input.expectedQualificationHash : null;
    const action = input.action === "confirm" || input.action === "override" ? input.action : null;
    const decision = input.decision === "qualified" || input.decision === "needs_review"
      || input.decision === "unqualified" ? input.decision : null;
    const actorRecord = exactRecord(input.actor, ACTOR_FIELDS);
    const actorId = actorRecord && typeof actorRecord.actorId === "string" && UUID.test(actorRecord.actorId)
      ? actorRecord.actorId : null;
    const at = timestamp(input.at);
    const reason = boundedText(input.reason);
    if (current === "cap") return failure("CAP_EXCEEDED");
    if (current === "duplicate") return failure("DUPLICATE_ITEM");
    if (current === "scope") return failure("SCOPE_MISMATCH");
    if (current === "evidence") return failure("EVIDENCE_MISMATCH");
    if (!tenantId || !workspaceId || !accountId || !current || !expectedQualificationHash || !action || !decision
      || !actorRecord || !actorId || !at || !reason) return failure("MALFORMED_INPUT");
    if (!sameScope({ tenantId, workspaceId, accountId }, current)) return failure("SCOPE_MISMATCH");
    if (expectedQualificationHash !== current.qualificationHash) return failure("STALE_VERSION");
    if (actorRecord.kind !== "human") return failure("HUMAN_REVIEW_REQUIRED");
    if (current.reviewEvents.length >= MAX_REVIEW_EVENTS) return failure("CAP_EXCEEDED");
    if ((action === "confirm" && decision !== current.decision)
      || (action === "override" && decision === current.decision)) return failure("INVALID_TRANSITION");
    const lastAt = current.reviewEvents.at(-1)?.at ?? current.evaluatedAt;
    if (Date.parse(at) <= Date.parse(lastAt)) return failure("INVALID_TRANSITION");
    const eventPayload = Object.freeze({
      fromQualificationHash: current.qualificationHash,
      action,
      fromDecision: current.decision,
      toDecision: decision,
      actor: Object.freeze({ kind: "human" as const, actorId }),
      at,
      reason,
    });
    const event: QualificationReviewEvent = Object.freeze({
      eventId: `qualification-review-event:${sha256(eventPayload).slice("sha256:".length)}`,
      ...eventPayload,
    });
    const qualification = rebuildQualification(
      current,
      decision,
      action === "confirm" ? "confirmed" : "overridden",
      Object.freeze([...current.reviewEvents, event]),
    );
    return Object.freeze({ ok: true, code: "ACCOUNT_QUALIFICATION_REVIEWED", qualification });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
