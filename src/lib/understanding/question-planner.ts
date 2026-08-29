import { isProxy } from "node:util/types";

export const ADAPTIVE_QUESTION_POLICY_VERSION = "adaptive-question-value-v1" as const;
export const MAX_ADAPTIVE_QUESTIONS_PER_SESSION = 5 as const;

export type FactStatus = "proposed" | "confirmed" | "corrected" | "disputed" | "rejected" | "unknown" | "expired";
export type FactFreshness = "current" | "stale" | "expired";
export type FactConflict = "none" | "conflicting";
export type UncertaintyKind = "unknown" | "conflict" | "stale" | "missing_threshold";
export type DecisionImpactArea = "icp" | "play" | "search_scope" | "qualification" | "buying_center" | "outreach_safety";
export type AnswerDisposition = "answered" | "corrected" | "deferred" | "unknown" | "not_applicable";
export type QuestionRepeatReason = "first_ask" | "stale_fact" | "conflicting_fact" | "different_decision";

/**
 * Producer-owned semantic key for the question's enduring business meaning.
 * Keep it stable across prompt rewording and uncertainty-record replacement;
 * this boundary canonicalizes formatting but never derives meaning from prose.
 */
export type QuestionIdentity = string;

export type QuestionAnswerRecord = Readonly<{
  version: 1;
  answerId: string;
  tenantRef: string;
  questionRef: string;
  uncertaintyId: string;
  questionIdentity: QuestionIdentity;
  decisionKey: string;
  disposition: AnswerDisposition;
  answerText: string | null;
  evidenceRefs: readonly string[];
  recordedAt: string;
  supersedesAnswerId: string | null;
}>;

export type QuestionAnswerRecordResult =
  | Readonly<{ ok: true; code: "ANSWER_RECORDED"; answer: QuestionAnswerRecord }>
  | Readonly<{ ok: false; code: "MALFORMED_ANSWER" }>;

export type AdaptiveQuestionScore = Readonly<{
  policyVersion: typeof ADAPTIVE_QUESTION_POLICY_VERSION;
  impactPoints: number;
  uncertaintyMultiplier: number;
  effortRiskDivisor: number;
  priorDeferralPenalty: number;
  expectedValue: number;
}>;

export type PlannedAdaptiveQuestion = Readonly<{
  questionRef: string;
  uncertaintyId: string;
  questionIdentity: QuestionIdentity;
  domain: string;
  subject: string;
  kind: UncertaintyKind;
  decisionKey: string;
  prompt: string;
  whyItMatters: string;
  unlocks: readonly string[];
  rank: number;
  repeatReason: QuestionRepeatReason;
  score: AdaptiveQuestionScore;
}>;

export type AdaptiveQuestionSession = Readonly<{
  version: 1;
  policyVersion: typeof ADAPTIVE_QUESTION_POLICY_VERSION;
  tenantRef: string;
  sessionRef: string;
  questions: readonly PlannedAdaptiveQuestion[];
}>;

export type AdaptiveQuestionPlanResult =
  | Readonly<{
    ok: true;
    code: "QUESTIONS_PLANNED" | "NO_ELIGIBLE_QUESTIONS";
    session: AdaptiveQuestionSession;
  }>
  | Readonly<{ ok: false; code: "MALFORMED_INPUT" }>;

type PlainRecord = Record<string, unknown>;

export type DecisionImpact = Readonly<{ area: DecisionImpactArea; magnitude: number }>;

export type AdaptiveQuestionCandidate = Readonly<{
  uncertaintyId: string;
  questionIdentity: QuestionIdentity;
  domain: string;
  subject: string;
  kind: UncertaintyKind;
  factStatus: FactStatus;
  freshness: FactFreshness;
  conflict: FactConflict;
  confirmedForDecision: string | null;
  decisionKey: string;
  prompt: string;
  whyItMatters: string;
  unlocks: readonly string[];
  impacts: readonly DecisionImpact[];
  uncertaintySeverity: number;
  userEffort: number;
  sensitivityRisk: number;
}>;

export type AdaptiveQuestionPlanInput = Readonly<{
  version: 1;
  policyVersion: typeof ADAPTIVE_QUESTION_POLICY_VERSION;
  tenantRef: string;
  sessionRef: string;
  maxQuestions: number;
  uncertainties: readonly AdaptiveQuestionCandidate[];
  answerHistory: readonly QuestionAnswerRecord[];
}>;

const PLAN_FIELDS = ["version", "policyVersion", "tenantRef", "sessionRef", "maxQuestions", "uncertainties", "answerHistory"] as const;
const CANDIDATE_FIELDS = [
  "uncertaintyId", "questionIdentity", "domain", "subject", "kind", "factStatus", "freshness", "conflict",
  "confirmedForDecision", "decisionKey", "prompt", "whyItMatters", "unlocks", "impacts",
  "uncertaintySeverity", "userEffort", "sensitivityRisk",
] as const;
const IMPACT_FIELDS = ["area", "magnitude"] as const;
const ANSWER_FIELDS = [
  "version", "answerId", "tenantRef", "questionRef", "uncertaintyId", "questionIdentity", "decisionKey", "disposition", "answerText",
  "evidenceRefs", "recordedAt", "supersedesAnswerId",
] as const;

const FACT_STATUSES = new Set<FactStatus>(["proposed", "confirmed", "corrected", "disputed", "rejected", "unknown", "expired"]);
const FRESHNESS_STATES = new Set<FactFreshness>(["current", "stale", "expired"]);
const CONFLICT_STATES = new Set<FactConflict>(["none", "conflicting"]);
const UNCERTAINTY_KINDS = new Set<UncertaintyKind>(["unknown", "conflict", "stale", "missing_threshold"]);
const ANSWER_DISPOSITIONS = new Set<AnswerDisposition>(["answered", "corrected", "deferred", "unknown", "not_applicable"]);
const IMPACT_AREAS = new Set<DecisionImpactArea>([
  "icp", "play", "search_scope", "qualification", "buying_center", "outreach_safety",
]);
const REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/u;

function malformedPlan(): AdaptiveQuestionPlanResult {
  return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
}

function malformedAnswer(): QuestionAnswerRecordResult {
  return Object.freeze({ ok: false, code: "MALFORMED_ANSWER" });
}

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
    const copy: PlainRecord = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      copy[field] = descriptor.value;
    }
    return copy;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maxLength: number): readonly unknown[] | null {
  if (typeof value !== "object" || value === null || isProxy(value) || !Array.isArray(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const lengthDescriptor = descriptors.length;
    const arrayLength = lengthDescriptor?.value;
    if (typeof arrayLength !== "number" || !Number.isSafeInteger(arrayLength) || arrayLength < 0 || arrayLength > maxLength) return null;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== arrayLength + 1) return null;
    const copy: unknown[] = [];
    for (let index = 0; index < arrayLength; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      copy.push(descriptor.value);
    }
    return copy;
  } catch {
    return null;
  }
}

function boundedText(value: unknown, maxLength = 1_000): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || value !== value.trim()) return null;
  return value;
}

function reference(value: unknown, maxLength = 200): string | null {
  return typeof value === "string" && value.length <= maxLength && REF.test(value) ? value : null;
}

function normalizedQuestionIdentity(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 300) return null;
  try {
    const normalized = value
      .normalize("NFKC")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "");
    return normalized.length > 0 && normalized.length <= 200 ? normalized : null;
  } catch {
    return null;
  }
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null;
}

function enumValue<T extends string>(value: unknown, values: ReadonlySet<T>): T | null {
  return typeof value === "string" && values.has(value as T) ? value as T : null;
}

function parseTextArray(value: unknown, minLength: number, maxLength: number): readonly string[] | null {
  const array = exactArray(value, maxLength);
  if (!array || array.length < minLength) return null;
  const parsed: string[] = [];
  const seen = new Set<string>();
  for (const item of array) {
    const text = boundedText(item, 500);
    if (!text || seen.has(text)) return null;
    seen.add(text);
    parsed.push(text);
  }
  return Object.freeze(parsed);
}

function parseReferenceArray(value: unknown): readonly string[] | null {
  const array = exactArray(value, 20);
  if (!array) return null;
  const parsed: string[] = [];
  const seen = new Set<string>();
  for (const item of array) {
    const ref = reference(item);
    if (!ref || seen.has(ref)) return null;
    seen.add(ref);
    parsed.push(ref);
  }
  return Object.freeze(parsed);
}

function parseAnswer(value: unknown): QuestionAnswerRecord | null {
  const record = exactRecord(value, ANSWER_FIELDS);
  if (!record || record.version !== 1) return null;
  const answerId = reference(record.answerId);
  const tenantRef = reference(record.tenantRef);
  const questionRef = reference(record.questionRef, 700);
  const uncertaintyId = reference(record.uncertaintyId);
  const questionIdentity = normalizedQuestionIdentity(record.questionIdentity);
  const decisionKey = reference(record.decisionKey);
  const disposition = enumValue(record.disposition, ANSWER_DISPOSITIONS);
  const evidenceRefs = parseReferenceArray(record.evidenceRefs);
  const recordedAt = boundedText(record.recordedAt, 40);
  const answerText = record.answerText === null ? null : boundedText(record.answerText, 10_000);
  const supersedesAnswerId = record.supersedesAnswerId === null ? null : reference(record.supersedesAnswerId);
  if (!answerId || !tenantRef || !questionRef || !uncertaintyId || !questionIdentity
    || !decisionKey || !disposition || !evidenceRefs || !recordedAt) return null;
  if (record.answerText !== null && answerText === null) return null;
  if (record.supersedesAnswerId !== null && supersedesAnswerId === null) return null;
  const epoch = Date.parse(recordedAt);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== recordedAt) return null;
  if ((disposition === "answered" || disposition === "corrected" || disposition === "not_applicable") && !answerText) return null;
  if (disposition === "corrected" ? !supersedesAnswerId : supersedesAnswerId !== null) return null;
  if (supersedesAnswerId === answerId) return null;
  return Object.freeze({
    version: 1,
    answerId,
    tenantRef,
    questionRef,
    uncertaintyId,
    questionIdentity,
    decisionKey,
    disposition,
    answerText,
    evidenceRefs,
    recordedAt,
    supersedesAnswerId,
  });
}

function parseCandidate(value: unknown): AdaptiveQuestionCandidate | null {
  const record = exactRecord(value, CANDIDATE_FIELDS);
  if (!record) return null;
  const uncertaintyId = reference(record.uncertaintyId);
  const questionIdentity = normalizedQuestionIdentity(record.questionIdentity);
  const domain = boundedText(record.domain, 100);
  const subject = boundedText(record.subject, 300);
  const kind = enumValue(record.kind, UNCERTAINTY_KINDS);
  const factStatus = enumValue(record.factStatus, FACT_STATUSES);
  const freshness = enumValue(record.freshness, FRESHNESS_STATES);
  const conflict = enumValue(record.conflict, CONFLICT_STATES);
  const confirmedForDecision = record.confirmedForDecision === null ? null : reference(record.confirmedForDecision);
  const decisionKey = reference(record.decisionKey);
  const prompt = boundedText(record.prompt, 1_000);
  const whyItMatters = boundedText(record.whyItMatters, 2_000);
  const unlocks = parseTextArray(record.unlocks, 1, 5);
  const impactValues = exactArray(record.impacts, 6);
  const uncertaintySeverity = integer(record.uncertaintySeverity, 1, 5);
  const userEffort = integer(record.userEffort, 1, 5);
  const sensitivityRisk = integer(record.sensitivityRisk, 0, 5);
  if (!uncertaintyId || !questionIdentity || !domain || !subject || !kind || !factStatus || !freshness || !conflict
    || !decisionKey || !prompt || !whyItMatters || !unlocks || !impactValues?.length
    || uncertaintySeverity === null || userEffort === null || sensitivityRisk === null) return null;
  if (record.confirmedForDecision !== null && confirmedForDecision === null) return null;
  if (kind === "conflict" && conflict !== "conflicting") return null;
  if (kind === "stale" && freshness === "current" && factStatus !== "expired") return null;

  const impacts: DecisionImpact[] = [];
  const seenAreas = new Set<DecisionImpactArea>();
  for (const impactValue of impactValues) {
    const impactRecord = exactRecord(impactValue, IMPACT_FIELDS);
    if (!impactRecord) return null;
    const area = enumValue(impactRecord.area, IMPACT_AREAS);
    const magnitude = integer(impactRecord.magnitude, 1, 5);
    if (!area || magnitude === null || seenAreas.has(area)) return null;
    seenAreas.add(area);
    impacts.push(Object.freeze({ area, magnitude }));
  }
  return Object.freeze({
    uncertaintyId,
    questionIdentity,
    domain,
    subject,
    kind,
    factStatus,
    freshness,
    conflict,
    confirmedForDecision,
    decisionKey,
    prompt,
    whyItMatters,
    unlocks,
    impacts: Object.freeze(impacts),
    uncertaintySeverity,
    userEffort,
    sensitivityRisk,
  });
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseAnswerHistory(value: unknown, expectedTenantRef: string | null): readonly QuestionAnswerRecord[] | null {
  const rawHistory = exactArray(value, 1_000);
  if (!rawHistory) return null;
  const history: QuestionAnswerRecord[] = [];
  const byId = new Map<string, QuestionAnswerRecord>();
  for (const rawAnswer of rawHistory) {
    const answer = parseAnswer(rawAnswer);
    if (!answer || byId.has(answer.answerId) || (expectedTenantRef !== null && answer.tenantRef !== expectedTenantRef)) return null;
    byId.set(answer.answerId, answer);
    history.push(answer);
  }
  for (const answer of history) {
    if (answer.disposition !== "corrected") continue;
    const predecessor = answer.supersedesAnswerId === null ? undefined : byId.get(answer.supersedesAnswerId);
    if (!predecessor
      || Date.parse(predecessor.recordedAt) >= Date.parse(answer.recordedAt)
      || predecessor.tenantRef !== answer.tenantRef
      || predecessor.questionRef !== answer.questionRef
      || predecessor.uncertaintyId !== answer.uncertaintyId
      || predecessor.questionIdentity !== answer.questionIdentity
      || predecessor.decisionKey !== answer.decisionKey) return null;
  }
  return Object.freeze(history);
}

export function recordQuestionAnswer(input: unknown, answerHistory: unknown = []): QuestionAnswerRecordResult {
  try {
    const answer = parseAnswer(input);
    if (!answer) return malformedAnswer();
    const history = parseAnswerHistory(answerHistory, answer.tenantRef);
    if (!history || history.some((prior) => prior.answerId === answer.answerId)) return malformedAnswer();
    if (answer.disposition === "corrected") {
      const predecessor = history.find((prior) => prior.answerId === answer.supersedesAnswerId);
      if (!predecessor
        || Date.parse(predecessor.recordedAt) >= Date.parse(answer.recordedAt)
        || predecessor.questionRef !== answer.questionRef
        || predecessor.uncertaintyId !== answer.uncertaintyId
        || predecessor.questionIdentity !== answer.questionIdentity
        || predecessor.decisionKey !== answer.decisionKey) return malformedAnswer();
    }
    return Object.freeze({ ok: true, code: "ANSWER_RECORDED", answer });
  } catch {
    return malformedAnswer();
  }
}

export function planAdaptiveQuestionSession(input: unknown): AdaptiveQuestionPlanResult {
  try {
    const record = exactRecord(input, PLAN_FIELDS);
    if (!record || record.version !== 1 || record.policyVersion !== ADAPTIVE_QUESTION_POLICY_VERSION) return malformedPlan();
    const tenantRef = reference(record.tenantRef);
    const sessionRef = reference(record.sessionRef);
    const maxQuestions = integer(record.maxQuestions, 1, MAX_ADAPTIVE_QUESTIONS_PER_SESSION);
    const rawCandidates = exactArray(record.uncertainties, 100);
    if (!tenantRef || !sessionRef || maxQuestions === null || !rawCandidates) return malformedPlan();

    const candidates: AdaptiveQuestionCandidate[] = [];
    const candidateIds = new Set<string>();
    for (const rawCandidate of rawCandidates) {
      const candidate = parseCandidate(rawCandidate);
      if (!candidate || candidateIds.has(candidate.uncertaintyId)) return malformedPlan();
      candidateIds.add(candidate.uncertaintyId);
      candidates.push(candidate);
    }
    const history = parseAnswerHistory(record.answerHistory, tenantRef);
    if (!history) return malformedPlan();

    const ranked: Omit<PlannedAdaptiveQuestion, "rank">[] = [];
    for (const candidate of candidates) {
      const sameQuestion = history.filter((answer) => answer.uncertaintyId === candidate.uncertaintyId
        || answer.questionIdentity === candidate.questionIdentity);
      const sameDecision = sameQuestion.filter((answer) => answer.decisionKey === candidate.decisionKey);
      const stale = candidate.freshness !== "current" || candidate.factStatus === "expired" || candidate.kind === "stale";
      const conflicting = candidate.conflict === "conflicting" || candidate.kind === "conflict" || candidate.factStatus === "disputed";
      const currentConfirmed = (candidate.factStatus === "confirmed" || candidate.factStatus === "corrected") && !stale && !conflicting;
      const explicitlyDifferentDecision = currentConfirmed
        && candidate.confirmedForDecision !== null
        && candidate.confirmedForDecision !== candidate.decisionKey;
      if (currentConfirmed && !explicitlyDifferentDecision) continue;
      if (sameDecision.length > 0 && !stale && !conflicting) continue;

      const repeatReason: QuestionRepeatReason = conflicting
        ? "conflicting_fact"
        : stale
          ? "stale_fact"
          : explicitlyDifferentDecision || sameQuestion.length > 0
            ? "different_decision"
            : "first_ask";
      const impactPoints = candidate.impacts.reduce((total, impact) => total + impact.magnitude, 0);
      const uncertaintyMultiplier = candidate.uncertaintySeverity;
      const priorDeferrals = sameQuestion.filter((answer) => answer.disposition === "deferred").length;
      const priorDeferralPenalty = priorDeferrals;
      const effortRiskDivisor = candidate.userEffort + candidate.sensitivityRisk + priorDeferralPenalty;
      const expectedValue = Math.floor((impactPoints * uncertaintyMultiplier * 1_000) / effortRiskDivisor);
      const score: AdaptiveQuestionScore = Object.freeze({
        policyVersion: ADAPTIVE_QUESTION_POLICY_VERSION,
        impactPoints,
        uncertaintyMultiplier,
        effortRiskDivisor,
        priorDeferralPenalty,
        expectedValue,
      });
      ranked.push(Object.freeze({
        questionRef: `${sessionRef}/${candidate.uncertaintyId}/${candidate.decisionKey}`,
        uncertaintyId: candidate.uncertaintyId,
        questionIdentity: candidate.questionIdentity,
        domain: candidate.domain,
        subject: candidate.subject,
        kind: candidate.kind,
        decisionKey: candidate.decisionKey,
        prompt: candidate.prompt,
        whyItMatters: candidate.whyItMatters,
        unlocks: candidate.unlocks,
        repeatReason,
        score,
      }));
    }
    ranked.sort((left, right) => right.score.expectedValue - left.score.expectedValue
      || right.score.impactPoints - left.score.impactPoints
      || compareAscii(left.uncertaintyId, right.uncertaintyId));
    const seenQuestionIdentities = new Set<string>();
    const deduplicated = ranked.filter((question) => {
      if (seenQuestionIdentities.has(question.questionIdentity)) return false;
      seenQuestionIdentities.add(question.questionIdentity);
      return true;
    });
    const questions = Object.freeze(deduplicated.slice(0, maxQuestions).map((question, index) => Object.freeze({ ...question, rank: index + 1 })));
    const session: AdaptiveQuestionSession = Object.freeze({
      version: 1,
      policyVersion: ADAPTIVE_QUESTION_POLICY_VERSION,
      tenantRef,
      sessionRef,
      questions,
    });
    return Object.freeze({
      ok: true,
      code: questions.length > 0 ? "QUESTIONS_PLANNED" : "NO_ELIGIBLE_QUESTIONS",
      session,
    });
  } catch {
    return malformedPlan();
  }
}
