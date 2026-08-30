import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import {
  buildLeadPlayProposal,
  type LeadPlayProposal,
  type LeadPlayRationaleReference,
  type LeadPlayReviewSnapshot,
} from "@/lib/strategy/lead-play";

export const LEAD_PLAY_SIMULATION_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;

export type LeadPlaySimulationAssessment = "supported" | "contradicted" | "ambiguous";

export type LeadPlaySimulationObservationInput = Readonly<{
  observationId: string;
  sourceKey: string;
  hypothesisId: string;
  assessment: LeadPlaySimulationAssessment;
  rationaleRefs: readonly LeadPlayRationaleReference[];
  uncertaintyIds: readonly string[];
}>;

export type LeadPlaySimulationAccountInput = Readonly<{
  accountId: string;
  observations: readonly LeadPlaySimulationObservationInput[];
}>;

export type LeadPlaySimulationFactorKind =
  | "supported"
  | "contradicted"
  | "ambiguous"
  | "unsupported_source"
  | "unsupported_hypothesis"
  | "unsupported_rationale"
  | "missing_hypothesis"
  | "no_evidence";

export type LeadPlaySimulationFactor = Readonly<{
  factorId: string;
  observationId: string | null;
  kind: LeadPlaySimulationFactorKind;
  sourceKey: string | null;
  hypothesisId: string | null;
  rationaleRefs: readonly LeadPlayRationaleReference[];
  uncertaintyIds: readonly string[];
}>;

export type LeadPlaySimulationAccountResult = Readonly<{
  accountId: string;
  disposition: "included" | "excluded" | "needs_review";
  factors: readonly LeadPlaySimulationFactor[];
  rationaleRefs: readonly LeadPlayRationaleReference[];
  uncertaintyIds: readonly string[];
}>;

export type LeadPlaySimulation = Scope & Readonly<{
  simulationVersion: typeof LEAD_PLAY_SIMULATION_VERSION;
  simulationId: string;
  simulationHash: string;
  playVersionId: string;
  playContentHash: string;
  playReviewHash: string;
  estimates: Readonly<{ providerRequests: number; spendCents: number }>;
  accounts: readonly LeadPlaySimulationAccountResult[];
  summary: Readonly<{
    total: number;
    included: number;
    excluded: number;
    needsReview: number;
    providerRequests: number;
    spendCents: number;
  }>;
}>;

export type LeadPlaySimulationFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "PLAY_NOT_APPROVED"
  | "STALE_PLAY"
  | "BOUNDS_EXCEEDED"
  | "DUPLICATE_ITEM";

export type LeadPlaySimulationResult =
  | Readonly<{ ok: true; code: "LEAD_PLAY_SIMULATED"; simulation: LeadPlaySimulation }>
  | Readonly<{ ok: false; code: LeadPlaySimulationFailureCode }>;

type PlainRecord = Record<string, unknown>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "playReview", "playSource", "estimates", "accounts",
] as const;
const ESTIMATE_FIELDS = ["providerRequests", "spendCents"] as const;
const ACCOUNT_FIELDS = ["accountId", "observations"] as const;
const OBSERVATION_FIELDS = [
  "observationId", "sourceKey", "hypothesisId", "assessment", "rationaleRefs", "uncertaintyIds",
] as const;
const REFERENCE_FIELDS = ["claimId", "evidenceId"] as const;
const REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "contentHash", "stableKey", "revision",
  "supersedesVersionId", "icpVersionId", "icpContentHash", "icpReviewHash", "icpAuthorityHash",
  "understandingVersionId", "understandingContentHash", "understandingClaimSetHash",
  "understandingReviewHash", "createdAt", "status", "events", "replacementVersionId", "reviewHash",
] as const;
const REVIEW_EVENT_FIELDS = ["from", "to", "actor", "at", "reason", "replacementVersionId"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PLAY_VERSION = /^lead-play-version:[a-f0-9]{64}$/u;
const ICP_VERSION = /^icp-version:[a-f0-9]{64}$/u;
const UNDERSTANDING_VERSION = /^understanding-version:[a-f0-9]{64}$/u;
const ASSESSMENTS = new Set<LeadPlaySimulationAssessment>(["supported", "contradicted", "ambiguous"]);
const MAX_OBSERVATIONS_PER_ACCOUNT = 32;
const MAX_REFERENCES = 16;
const MAX_UNCERTAINTIES = 16;
const MAX_REVIEW_EVENTS = 100;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return null;
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
  if (typeof value !== "object" || value === null || !Array.isArray(value) || isProxy(value)) return null;
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

function uuid(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}

function workspace(value: unknown): string | null | undefined {
  return value === null ? null : uuid(value) ?? undefined;
}

function reference(value: unknown): string | null {
  return typeof value === "string" && REF.test(value) ? value : null;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 40 || value !== value.trim()) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function boundedText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value === value.trim()
    && !/[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value) ? value : null;
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

function parseApprovedReview(value: unknown): LeadPlayReviewSnapshot | null {
  const record = exactRecord(value, REVIEW_FIELDS);
  if (!record) return null;
  const tenantId = uuid(record.tenantId);
  const workspaceId = workspace(record.workspaceId);
  const versionId = typeof record.versionId === "string" && PLAY_VERSION.test(record.versionId)
    ? record.versionId : null;
  const contentHash = typeof record.contentHash === "string" && HASH.test(record.contentHash)
    ? record.contentHash : null;
  const stableKey = reference(record.stableKey);
  const revision = integer(record.revision, 1, 1_000_000);
  const supersedesVersionId = record.supersedesVersionId === null
    ? null
    : typeof record.supersedesVersionId === "string" && PLAY_VERSION.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const icpVersionId = typeof record.icpVersionId === "string" && ICP_VERSION.test(record.icpVersionId)
    ? record.icpVersionId : null;
  const understandingVersionId = typeof record.understandingVersionId === "string"
    && UNDERSTANDING_VERSION.test(record.understandingVersionId) ? record.understandingVersionId : null;
  const createdAt = timestamp(record.createdAt);
  const eventsInput = exactArray(record.events, MAX_REVIEW_EVENTS);
  const hashes = [record.icpContentHash, record.icpReviewHash, record.icpAuthorityHash,
    record.understandingContentHash, record.understandingClaimSetHash, record.understandingReviewHash,
    record.reviewHash];
  if (record.reviewVersion !== 1 || !tenantId || workspaceId === undefined || !versionId || !contentHash
    || versionId !== `lead-play-version:${contentHash.slice("sha256:".length)}` || !stableKey
    || revision === null || supersedesVersionId === undefined
    || (revision === 1 ? supersedesVersionId !== null : supersedesVersionId === null)
    || !icpVersionId || !understandingVersionId || !createdAt || !eventsInput
    || hashes.some((hash) => typeof hash !== "string" || !HASH.test(hash))) return null;

  const events = [] as Array<LeadPlayReviewSnapshot["events"][number]>;
  let status: "draft" | "in_review" | "approved" | "rejected" | "superseded" = "draft";
  let lastAt = createdAt;
  let replacementVersionId: string | null = null;
  for (const rawEvent of eventsInput) {
    const eventRecord = exactRecord(rawEvent, REVIEW_EVENT_FIELDS);
    const actor = eventRecord && exactRecord(eventRecord.actor, ACTOR_FIELDS);
    const actorId = actor && uuid(actor.actorId);
    const at = eventRecord && timestamp(eventRecord.at);
    const reason = eventRecord && boundedText(eventRecord.reason, 2_000);
    const to = eventRecord?.to;
    const validTo = to === "in_review" || to === "approved" || to === "rejected" || to === "superseded";
    const replacement = eventRecord?.replacementVersionId === null
      ? null
      : typeof eventRecord?.replacementVersionId === "string" && PLAY_VERSION.test(eventRecord.replacementVersionId)
        ? eventRecord.replacementVersionId : undefined;
    const transitionAllowed = (status === "draft" && to === "in_review")
      || (status === "in_review" && (to === "approved" || to === "rejected"))
      || (status === "approved" && to === "superseded");
    if (!eventRecord || !actor || actor.kind !== "human" || !actorId || !at || !reason || !validTo
      || eventRecord.from !== status || !transitionAllowed || Date.parse(at) <= Date.parse(lastAt)
      || replacement === undefined || (to === "superseded" ? !replacement || replacement === versionId : replacement !== null)) {
      return null;
    }
    const event = Object.freeze({
      from: status,
      to,
      actor: Object.freeze({ kind: "human" as const, actorId }),
      at,
      reason,
      replacementVersionId: replacement,
    });
    events.push(event);
    status = to;
    lastAt = at;
    replacementVersionId = replacement;
  }
  if (record.status !== status || record.replacementVersionId !== replacementVersionId) return null;
  const payload = Object.freeze({
    reviewVersion: 1 as const,
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
  if (sha256(payload) !== record.reviewHash) return null;
  return Object.freeze({ ...payload, reviewHash: record.reviewHash as string });
}

type ParsedObservation = LeadPlaySimulationObservationInput;

function parseReferences(value: unknown): readonly LeadPlayRationaleReference[] | null {
  const input = exactArray(value, MAX_REFERENCES);
  if (!input || input.length === 0) return null;
  const output: LeadPlayRationaleReference[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const record = exactRecord(raw, REFERENCE_FIELDS);
    const claimId = record && reference(record.claimId);
    const evidenceId = record && reference(record.evidenceId);
    if (!record || !claimId || !evidenceId) return null;
    const key = `${claimId}\u0000${evidenceId}`;
    if (seen.has(key)) return null;
    seen.add(key);
    output.push(Object.freeze({ claimId, evidenceId }));
  }
  output.sort((left, right) => compareAscii(left.claimId, right.claimId)
    || compareAscii(left.evidenceId, right.evidenceId));
  return Object.freeze(output);
}

function parseStringReferences(value: unknown, maximum: number): readonly string[] | null {
  const input = exactArray(value, maximum);
  if (!input) return null;
  const output: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const item = reference(raw);
    if (!item || seen.has(item)) return null;
    seen.add(item);
    output.push(item);
  }
  output.sort(compareAscii);
  return Object.freeze(output);
}

function parseObservation(value: unknown): ParsedObservation | null {
  const record = exactRecord(value, OBSERVATION_FIELDS);
  const observationId = record && reference(record.observationId);
  const sourceKey = record && reference(record.sourceKey);
  const hypothesisId = record && reference(record.hypothesisId);
  const assessment = record && typeof record.assessment === "string" && ASSESSMENTS.has(record.assessment as LeadPlaySimulationAssessment)
    ? record.assessment as LeadPlaySimulationAssessment : null;
  const rationaleRefs = record && parseReferences(record.rationaleRefs);
  const uncertaintyIds = record && parseStringReferences(record.uncertaintyIds, MAX_UNCERTAINTIES);
  return record && observationId && sourceKey && hypothesisId && assessment && rationaleRefs && uncertaintyIds
    ? Object.freeze({ observationId, sourceKey, hypothesisId, assessment, rationaleRefs, uncertaintyIds })
    : null;
}

function refKey(value: LeadPlayRationaleReference): string {
  return `${value.claimId}\u0000${value.evidenceId}`;
}

function freezeFactor(input: LeadPlaySimulationFactor): LeadPlaySimulationFactor {
  return Object.freeze({
    ...input,
    rationaleRefs: Object.freeze([...input.rationaleRefs]),
    uncertaintyIds: Object.freeze([...input.uncertaintyIds]),
  });
}

function evaluateAccount(
  accountId: string,
  observations: readonly ParsedObservation[],
  play: LeadPlayProposal,
): LeadPlaySimulationAccountResult {
  const hypotheses = new Map(play.searchHypotheses.map((item) => [item.hypothesisId, item]));
  const sources = new Set(play.sourceAllowlist);
  const uncertainties = new Set(play.uncertainties.map((item) => item.uncertaintyId));
  const factors: LeadPlaySimulationFactor[] = [];
  if (observations.length === 0) {
    factors.push(freezeFactor({
      factorId: `account:${accountId}:no-evidence`,
      observationId: null,
      kind: "no_evidence",
      sourceKey: null,
      hypothesisId: null,
      rationaleRefs: Object.freeze([]),
      uncertaintyIds: Object.freeze([]),
    }));
  }
  for (const observation of observations) {
    const hypothesis = hypotheses.get(observation.hypothesisId);
    const hypothesisRefs = new Set(hypothesis?.rationaleRefs.map(refKey) ?? []);
    const supportedRationale = observation.rationaleRefs.every((item) => hypothesisRefs.has(refKey(item)));
    const supportedUncertainty = observation.uncertaintyIds.every((item) => uncertainties.has(item));
    const kind: LeadPlaySimulationFactorKind = !sources.has(observation.sourceKey)
      ? "unsupported_source"
      : !hypothesis
        ? "unsupported_hypothesis"
        : !supportedRationale || !supportedUncertainty
          ? "unsupported_rationale"
          : observation.assessment;
    factors.push(freezeFactor({
      factorId: `observation:${observation.observationId}`,
      observationId: observation.observationId,
      kind,
      sourceKey: observation.sourceKey,
      hypothesisId: observation.hypothesisId,
      rationaleRefs: observation.rationaleRefs,
      uncertaintyIds: observation.uncertaintyIds,
    }));
  }
  const observedHypothesisIds = new Set(observations.map((item) => item.hypothesisId));
  for (const hypothesis of play.searchHypotheses) {
    if (observedHypothesisIds.has(hypothesis.hypothesisId)) continue;
    factors.push(freezeFactor({
      factorId: `unobserved-hypothesis:${hypothesis.hypothesisId}`,
      observationId: null,
      kind: "missing_hypothesis",
      sourceKey: null,
      hypothesisId: hypothesis.hypothesisId,
      rationaleRefs: hypothesis.rationaleRefs,
      uncertaintyIds: Object.freeze([]),
    }));
  }
  factors.sort((left, right) => compareAscii(left.factorId, right.factorId));
  const deny = factors.some((item) => item.kind === "contradicted" || item.kind === "no_evidence"
    || item.kind === "missing_hypothesis" || item.kind.startsWith("unsupported_"));
  const review = !deny && factors.some((item) => item.kind === "ambiguous" || item.uncertaintyIds.length > 0);
  const disposition = deny ? "excluded" as const : review ? "needs_review" as const : "included" as const;
  const rationale = new Map<string, LeadPlayRationaleReference>();
  const uncertaintyIds = new Set<string>();
  for (const factor of factors) {
    for (const item of factor.rationaleRefs) rationale.set(refKey(item), item);
    for (const item of factor.uncertaintyIds) uncertaintyIds.add(item);
  }
  const rationaleRefs = [...rationale.values()].sort((left, right) => compareAscii(left.claimId, right.claimId)
    || compareAscii(left.evidenceId, right.evidenceId));
  return Object.freeze({
    accountId,
    disposition,
    factors: Object.freeze(factors),
    rationaleRefs: Object.freeze(rationaleRefs),
    uncertaintyIds: Object.freeze([...uncertaintyIds].sort(compareAscii)),
  });
}

function failure(code: LeadPlaySimulationFailureCode): LeadPlaySimulationResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Pure fixture evaluation only. It performs no discovery, provider calls,
 * persistence, activation, contact resolution, or outreach. Provider request
 * and spend values are caller-supplied estimates; this boundary validates and
 * enforces their approved caps but does not derive them from execution.
 */
export function simulateLeadPlay(value: unknown): LeadPlaySimulationResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== LEAD_PLAY_SIMULATION_VERSION) return failure("MALFORMED_INPUT");
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const review = parseApprovedReview(input.playReview);
    const estimatesInput = exactRecord(input.estimates, ESTIMATE_FIELDS);
    const providerRequests = estimatesInput && integer(estimatesInput.providerRequests, 0, 10_000);
    const spendCents = estimatesInput && integer(estimatesInput.spendCents, 0, 100_000_000);
    if (!tenantId || workspaceId === undefined || !review || !estimatesInput
      || providerRequests === null || spendCents === null) return failure("MALFORMED_INPUT");
    const scope = Object.freeze({ tenantId, workspaceId });
    if (!sameScope(scope, review)) return failure("SCOPE_MISMATCH");
    if (review.status !== "approved") return failure("PLAY_NOT_APPROVED");

    const rebuilt = buildLeadPlayProposal(input.playSource);
    if (!rebuilt.ok) return failure("MALFORMED_INPUT");
    const play = rebuilt.proposal;
    if (!sameScope(scope, play)) return failure("SCOPE_MISMATCH");
    if (play.versionId !== review.versionId || play.contentHash !== review.contentHash
      || play.stableKey !== review.stableKey || play.revision !== review.revision
      || play.supersedesVersionId !== review.supersedesVersionId || play.createdAt !== review.createdAt
      || play.icp.versionId !== review.icpVersionId || play.icp.contentHash !== review.icpContentHash
      || play.icp.reviewHash !== review.icpReviewHash || play.icp.authorityHash !== review.icpAuthorityHash
      || play.icp.understandingVersionId !== review.understandingVersionId
      || play.icp.understandingContentHash !== review.understandingContentHash
      || play.icp.understandingClaimSetHash !== review.understandingClaimSetHash
      || play.icp.understandingReviewHash !== review.understandingReviewHash) return failure("STALE_PLAY");

    const rawAccounts = exactArray(input.accounts, play.bounds.maxAccounts);
    if (!rawAccounts) {
      const unboundedAccounts = exactArray(input.accounts, 10_000);
      return failure(unboundedAccounts ? "BOUNDS_EXCEEDED" : "MALFORMED_INPUT");
    }
    if (providerRequests > play.bounds.maxProviderRequests || spendCents > play.bounds.maxSpendCents) {
      return failure("BOUNDS_EXCEEDED");
    }

    const accounts: LeadPlaySimulationAccountResult[] = [];
    const accountIds = new Set<string>();
    const observationIds = new Set<string>();
    for (const rawAccount of rawAccounts) {
      const accountRecord = exactRecord(rawAccount, ACCOUNT_FIELDS);
      const accountId = accountRecord && reference(accountRecord.accountId);
      const rawObservations = accountRecord && exactArray(accountRecord.observations, MAX_OBSERVATIONS_PER_ACCOUNT);
      if (!accountRecord || !accountId || !rawObservations) return failure("MALFORMED_INPUT");
      if (accountIds.has(accountId)) return failure("DUPLICATE_ITEM");
      accountIds.add(accountId);
      const observations: ParsedObservation[] = [];
      for (const rawObservation of rawObservations) {
        const observation = parseObservation(rawObservation);
        if (!observation) return failure("MALFORMED_INPUT");
        if (observationIds.has(observation.observationId)) return failure("DUPLICATE_ITEM");
        observationIds.add(observation.observationId);
        observations.push(observation);
      }
      observations.sort((left, right) => compareAscii(left.observationId, right.observationId));
      accounts.push(evaluateAccount(accountId, observations, play));
    }
    accounts.sort((left, right) => compareAscii(left.accountId, right.accountId));

    const included = accounts.filter((item) => item.disposition === "included").length;
    const excluded = accounts.filter((item) => item.disposition === "excluded").length;
    const needsReview = accounts.filter((item) => item.disposition === "needs_review").length;
    const estimates = Object.freeze({ providerRequests, spendCents });
    const summary = Object.freeze({
      total: accounts.length,
      included,
      excluded,
      needsReview,
      providerRequests,
      spendCents,
    });
    const payload = Object.freeze({
      simulationVersion: LEAD_PLAY_SIMULATION_VERSION,
      tenantId,
      workspaceId,
      playVersionId: play.versionId,
      playContentHash: play.contentHash,
      playReviewHash: review.reviewHash,
      estimates,
      accounts: Object.freeze(accounts),
      summary,
    });
    const simulationHash = sha256(payload);
    const simulationId = `lead-play-simulation:${simulationHash.slice("sha256:".length)}`;
    const simulation: LeadPlaySimulation = Object.freeze({ ...payload, simulationId, simulationHash });
    return Object.freeze({ ok: true, code: "LEAD_PLAY_SIMULATED", simulation });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
