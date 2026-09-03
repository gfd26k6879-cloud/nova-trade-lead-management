import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { buildLeadPlayProposal, type LeadPlayRationaleReference } from "@/lib/strategy/lead-play";

export const DISCOVERY_PLAN_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;
type ActivationBinding = Readonly<{
  versionId: string;
  contentHash: string;
  reviewHash: string;
  revision: number;
  supersedesVersionId: string | null;
  simulationId: string;
  simulationHash: string;
  simulationEligibilityHash: string;
}>;

export type DiscoveryTask = Readonly<{
  taskVersion: 1;
  taskId: string;
  sourceKey: string;
  hypothesisId: string;
  queryFamily: string;
  statement: string;
  rationaleRefs: readonly LeadPlayRationaleReference[];
  uncertaintyIds: readonly string[];
  caps: Readonly<{ maxAccounts: number; maxProviderRequests: number; maxSpendCents: number }>;
}>;

export type DiscoveryPlan = Scope & Readonly<{
  planVersion: typeof DISCOVERY_PLAN_VERSION;
  planId: string;
  planHash: string;
  status: "plan_only";
  activationStateHash: string;
  play: Readonly<{
    stableKey: string;
    versionId: string;
    contentHash: string;
    reviewHash: string;
    revision: number;
  }>;
  limits: Readonly<{ maxAccounts: number; maxProviderRequests: number; maxSpendCents: number }>;
  tasks: readonly DiscoveryTask[];
}>;

export type DiscoveryPlanFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "INACTIVE_PLAY"
  | "PLAY_NOT_APPROVED"
  | "STALE_ACTIVATION"
  | "UNSUPPORTED_SOURCE"
  | "BOUNDS_EXCEEDED"
  | "DUPLICATE_ITEM";

export type DiscoveryPlanResult =
  | Readonly<{ ok: true; code: "DISCOVERY_PLAN_CREATED"; plan: DiscoveryPlan }>
  | Readonly<{ ok: false; code: DiscoveryPlanFailureCode }>;

type PlainRecord = Record<string, unknown>;
type ReviewStatus = "draft" | "in_review" | "approved" | "rejected" | "superseded";

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "activationState", "playReview", "playSource", "sourceKeys", "limits",
] as const;
const LIMIT_FIELDS = ["maxAccounts", "maxProviderRequests", "maxSpendCents"] as const;
const STATE_FIELDS = [
  "stateVersion", "tenantId", "workspaceId", "stableKey", "createdAt", "active", "inactive", "events", "stateHash",
] as const;
const BINDING_FIELDS = [
  "versionId", "contentHash", "reviewHash", "revision", "supersedesVersionId", "simulationId",
  "simulationHash", "simulationEligibilityHash",
] as const;
const ACTIVATION_EVENT_FIELDS = ["sequence", "action", "fromVersionId", "to", "actor", "at", "reason"] as const;
const REVIEW_FIELDS = [
  "reviewVersion", "versionId", "tenantId", "workspaceId", "contentHash", "stableKey", "revision",
  "supersedesVersionId", "icpVersionId", "icpContentHash", "icpReviewHash", "icpAuthorityHash",
  "understandingVersionId", "understandingContentHash", "understandingClaimSetHash", "understandingReviewHash",
  "createdAt", "status", "events", "replacementVersionId", "reviewHash",
] as const;
const REVIEW_EVENT_FIELDS = ["from", "to", "actor", "at", "reason", "replacementVersionId"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PLAY_VERSION = /^lead-play-version:[a-f0-9]{64}$/u;
const ICP_VERSION = /^icp-version:[a-f0-9]{64}$/u;
const UNDERSTANDING_VERSION = /^understanding-version:[a-f0-9]{64}$/u;
const SIMULATION_ID = /^lead-play-simulation:[a-f0-9]{64}$/u;
const SECRET = /(?:authorization\s*:\s*bearer\s+\S+|\bsk-[A-Za-z0-9_-]{20,}\b|(?:api[_ -]?key|password|passwd|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+)/iu;
const REVIEW_STATUSES = new Set<ReviewStatus>(["draft", "in_review", "approved", "rejected", "superseded"]);
const MAX_EVENTS = 1_000;
const MAX_SOURCES = 8;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== fields.length
      || keys.some((key) => typeof key !== "string" || !fields.includes(key))) return null;
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

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  if (typeof value !== "object" || value === null || !Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > maximum
      || Reflect.ownKeys(descriptors).length !== length + 1) return null;
    const output: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return null;
      output.push(descriptor.value);
    }
    return output;
  } catch {
    return null;
  }
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function text(value: unknown, maximum = 2_000): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value !== value.trim()
    || /[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value)) return null;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return null;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return null;
  }
  return value;
}

function activationReason(value: unknown): string | null {
  const reason = text(value);
  if (!reason || reason.length < 8) return null;
  const securityView = reason.normalize("NFKD").replace(/\p{M}+/gu, "").normalize("NFKC");
  return SECRET.test(securityView) ? null : reason;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId;
}

function actor(value: unknown): Readonly<{ kind: "human"; actorId: string }> | null {
  const record = exactRecord(value, ACTOR_FIELDS);
  const actorId = record && uuid(record.actorId);
  return record && record.kind === "human" && actorId ? Object.freeze({ kind: "human" as const, actorId }) : null;
}

function parseBinding(value: unknown): ActivationBinding | null {
  const record = exactRecord(value, BINDING_FIELDS);
  const versionId = record && typeof record.versionId === "string" && PLAY_VERSION.test(record.versionId)
    ? record.versionId : null;
  const contentHash = record && typeof record.contentHash === "string" && HASH.test(record.contentHash)
    ? record.contentHash : null;
  const reviewHash = record && typeof record.reviewHash === "string" && HASH.test(record.reviewHash)
    ? record.reviewHash : null;
  const revision = record && integer(record.revision, 1, 1_000_000);
  const supersedesVersionId = record?.supersedesVersionId === null ? null
    : record && typeof record.supersedesVersionId === "string" && PLAY_VERSION.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const simulationId = record && typeof record.simulationId === "string" && SIMULATION_ID.test(record.simulationId)
    ? record.simulationId : null;
  const simulationHash = record && typeof record.simulationHash === "string" && HASH.test(record.simulationHash)
    ? record.simulationHash : null;
  const simulationEligibilityHash = record && typeof record.simulationEligibilityHash === "string"
    && HASH.test(record.simulationEligibilityHash) ? record.simulationEligibilityHash : null;
  return record && versionId && contentHash && reviewHash && revision !== null
    && supersedesVersionId !== undefined && simulationId && simulationHash && simulationEligibilityHash
    ? Object.freeze({ versionId, contentHash, reviewHash, revision, supersedesVersionId,
      simulationId, simulationHash, simulationEligibilityHash }) : null;
}

function bindingIdentity(left: ActivationBinding | null, right: ActivationBinding | null): boolean {
  return left === null || right === null ? left === right
    : left.versionId === right.versionId && left.contentHash === right.contentHash
      && left.reviewHash === right.reviewHash && left.revision === right.revision
      && left.supersedesVersionId === right.supersedesVersionId
      && left.simulationId === right.simulationId && left.simulationHash === right.simulationHash
      && left.simulationEligibilityHash === right.simulationEligibilityHash;
}

type ParsedActivationState = Scope & Readonly<{
  stableKey: string;
  stateHash: string;
  active: ActivationBinding | null;
}>;

function parseActivationState(value: unknown): ParsedActivationState | null {
  const record = exactRecord(value, STATE_FIELDS);
  const tenantId = record && uuid(record.tenantId);
  const workspaceId = record && workspace(record.workspaceId);
  const stableKey = record && reference(record.stableKey);
  const createdAt = record && timestamp(record.createdAt);
  const active = record?.active === null ? null : record ? parseBinding(record.active) : null;
  const inactiveInput = record && exactArray(record.inactive, MAX_EVENTS);
  const eventsInput = record && exactArray(record.events, MAX_EVENTS);
  const stateHash = record && typeof record.stateHash === "string" && HASH.test(record.stateHash)
    ? record.stateHash : null;
  if (!record || record.stateVersion !== 1 || !tenantId || workspaceId === undefined || !stableKey || !createdAt
    || (record.active !== null && !active) || !inactiveInput || !eventsInput || !stateHash) return null;
  const inactive = inactiveInput.map(parseBinding);
  if (inactive.some((item) => !item)) return null;
  let replayActive: ActivationBinding | null = null;
  const replayInactive = new Map<string, ActivationBinding>();
  const canonicalEvents: Array<Readonly<Record<string, unknown>>> = [];
  let lastAt = createdAt;
  for (let index = 0; index < eventsInput.length; index += 1) {
    const eventRecord = exactRecord(eventsInput[index], ACTIVATION_EVENT_FIELDS);
    const sequence = eventRecord && integer(eventRecord.sequence, 1, MAX_EVENTS);
    const action = eventRecord?.action === "activate" || eventRecord?.action === "rollback" ? eventRecord.action : null;
    const fromVersionId = eventRecord?.fromVersionId === null ? null
      : eventRecord && typeof eventRecord.fromVersionId === "string" && PLAY_VERSION.test(eventRecord.fromVersionId)
        ? eventRecord.fromVersionId : undefined;
    const to = eventRecord && parseBinding(eventRecord.to);
    const eventActor = eventRecord && actor(eventRecord.actor);
    const at = eventRecord && timestamp(eventRecord.at);
    const reason = eventRecord && activationReason(eventRecord.reason);
    if (!eventRecord || sequence !== index + 1 || !action || fromVersionId === undefined || !to || !eventActor
      || !at || !reason || Date.parse(at) <= Date.parse(lastAt)
      || fromVersionId !== (replayActive?.versionId ?? null)) return null;
    if (action === "activate") {
      if (replayInactive.has(to.versionId)) return null;
      if (replayActive === null ? to.revision !== 1 || to.supersedesVersionId !== null
        : to.revision !== replayActive.revision + 1 || to.supersedesVersionId !== replayActive.versionId) return null;
    } else {
      const prior = replayInactive.get(to.versionId);
      if (!replayActive || !prior || to.revision >= replayActive.revision || !bindingIdentity(prior, to)) return null;
      replayInactive.delete(to.versionId);
    }
    if (replayActive) replayInactive.set(replayActive.versionId, replayActive);
    replayActive = to;
    lastAt = at;
    canonicalEvents.push(Object.freeze({ sequence, action, fromVersionId, to, actor: eventActor, at, reason }));
  }
  const canonicalInactive = [...replayInactive.values()].sort((left, right) => left.revision - right.revision
    || compareAscii(left.versionId, right.versionId));
  const suppliedInactive = (inactive as ActivationBinding[]).sort((left, right) => left.revision - right.revision
    || compareAscii(left.versionId, right.versionId));
  if (!bindingIdentity(active, replayActive) || JSON.stringify(suppliedInactive) !== JSON.stringify(canonicalInactive)) return null;
  const payload = Object.freeze({ stateVersion: 1, tenantId, workspaceId, stableKey, createdAt,
    active, inactive: Object.freeze(suppliedInactive), events: Object.freeze(canonicalEvents) });
  return sha256(payload) === stateHash ? Object.freeze({ tenantId, workspaceId, stableKey, stateHash, active }) : null;
}

type ParsedPlayReview = Scope & Readonly<{
  stableKey: string;
  versionId: string;
  contentHash: string;
  reviewHash: string;
  revision: number;
  supersedesVersionId: string | null;
  createdAt: string;
  status: ReviewStatus;
}>;

function parsePlayReview(value: unknown): ParsedPlayReview | null {
  const record = exactRecord(value, REVIEW_FIELDS);
  const tenantId = record && uuid(record.tenantId);
  const workspaceId = record && workspace(record.workspaceId);
  const stableKey = record && reference(record.stableKey);
  const versionId = record && typeof record.versionId === "string" && PLAY_VERSION.test(record.versionId)
    ? record.versionId : null;
  const contentHash = record && typeof record.contentHash === "string" && HASH.test(record.contentHash)
    ? record.contentHash : null;
  const revision = record && integer(record.revision, 1, 1_000_000);
  const supersedesVersionId = record?.supersedesVersionId === null ? null
    : record && typeof record.supersedesVersionId === "string" && PLAY_VERSION.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const icpVersionId = record && typeof record.icpVersionId === "string" && ICP_VERSION.test(record.icpVersionId)
    ? record.icpVersionId : null;
  const understandingVersionId = record && typeof record.understandingVersionId === "string"
    && UNDERSTANDING_VERSION.test(record.understandingVersionId) ? record.understandingVersionId : null;
  const createdAt = record && timestamp(record.createdAt);
  const eventsInput = record && exactArray(record.events, 100);
  const suppliedStatus = record && typeof record.status === "string" && REVIEW_STATUSES.has(record.status as ReviewStatus)
    ? record.status as ReviewStatus : null;
  const hashes = [record?.icpContentHash, record?.icpReviewHash, record?.icpAuthorityHash,
    record?.understandingContentHash, record?.understandingClaimSetHash, record?.understandingReviewHash, record?.reviewHash];
  if (!record || record.reviewVersion !== 1 || !tenantId || workspaceId === undefined || !stableKey || !versionId
    || !contentHash || versionId !== `lead-play-version:${contentHash.slice("sha256:".length)}` || revision === null
    || supersedesVersionId === undefined || (revision === 1 ? supersedesVersionId !== null : supersedesVersionId === null)
    || !icpVersionId || !understandingVersionId || !createdAt || !eventsInput || !suppliedStatus
    || hashes.some((item) => typeof item !== "string" || !HASH.test(item))) return null;
  let status: ReviewStatus = "draft";
  let lastAt = createdAt;
  let replacementVersionId: string | null = null;
  const events: Array<Readonly<Record<string, unknown>>> = [];
  for (const rawEvent of eventsInput) {
    const eventRecord = exactRecord(rawEvent, REVIEW_EVENT_FIELDS);
    const eventActor = eventRecord && actor(eventRecord.actor);
    const at = eventRecord && timestamp(eventRecord.at);
    const reason = eventRecord && text(eventRecord.reason);
    const to = eventRecord && typeof eventRecord.to === "string" && REVIEW_STATUSES.has(eventRecord.to as ReviewStatus)
      ? eventRecord.to as ReviewStatus : null;
    const replacement = eventRecord?.replacementVersionId === null ? null
      : eventRecord && typeof eventRecord.replacementVersionId === "string" && PLAY_VERSION.test(eventRecord.replacementVersionId)
        ? eventRecord.replacementVersionId : undefined;
    const allowed = (status === "draft" && to === "in_review")
      || (status === "in_review" && (to === "approved" || to === "rejected"))
      || (status === "approved" && to === "superseded");
    if (!eventRecord || eventRecord.from !== status || !to || to === "draft" || !allowed || !eventActor || !at || !reason
      || Date.parse(at) <= Date.parse(lastAt) || replacement === undefined
      || (to === "superseded" ? !replacement || replacement === versionId : replacement !== null)) return null;
    events.push(Object.freeze({ from: status, to, actor: eventActor, at, reason, replacementVersionId: replacement }));
    status = to;
    lastAt = at;
    replacementVersionId = replacement;
  }
  if (status !== suppliedStatus || record.replacementVersionId !== replacementVersionId) return null;
  const payload = Object.freeze({ reviewVersion: 1, versionId, tenantId, workspaceId, contentHash, stableKey, revision,
    supersedesVersionId, icpVersionId, icpContentHash: record.icpContentHash, icpReviewHash: record.icpReviewHash,
    icpAuthorityHash: record.icpAuthorityHash, understandingVersionId,
    understandingContentHash: record.understandingContentHash, understandingClaimSetHash: record.understandingClaimSetHash,
    understandingReviewHash: record.understandingReviewHash, createdAt, status, events: Object.freeze(events), replacementVersionId });
  if (sha256(payload) !== record.reviewHash) return null;
  return Object.freeze({ tenantId, workspaceId, stableKey, versionId, contentHash,
    reviewHash: record.reviewHash as string, revision, supersedesVersionId, createdAt, status });
}

function allocated(total: number, count: number, index: number): number {
  return Math.floor(total / count) + (index < total % count ? 1 : 0);
}

function failure(code: DiscoveryPlanFailureCode): DiscoveryPlanResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Compiles a caller-attested active play into a plan only. State authenticity,
 * connector policy, and execution authorization remain caller responsibilities;
 * simulation receipts are intentionally neither accepted nor emitted here.
 */
export function buildDiscoveryPlan(value: unknown): DiscoveryPlanResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== DISCOVERY_PLAN_VERSION) return failure("MALFORMED_INPUT");
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const state = parseActivationState(input.activationState);
    const review = parsePlayReview(input.playReview);
    const limitsInput = exactRecord(input.limits, LIMIT_FIELDS);
    const maxAccounts = limitsInput && integer(limitsInput.maxAccounts, 1, 10_000);
    const maxProviderRequests = limitsInput && integer(limitsInput.maxProviderRequests, 1, 10_000);
    const maxSpendCents = limitsInput && integer(limitsInput.maxSpendCents, 0, 100_000_000);
    const rawSources = exactArray(input.sourceKeys, MAX_SOURCES);
    if (!tenantId || workspaceId === undefined || !state || !review || !limitsInput
      || maxAccounts === null || maxProviderRequests === null || maxSpendCents === null || !rawSources?.length) {
      return failure("MALFORMED_INPUT");
    }
    const scope = Object.freeze({ tenantId, workspaceId });
    if (!sameScope(scope, state) || !sameScope(scope, review)) return failure("SCOPE_MISMATCH");
    if (!state.active) return failure("INACTIVE_PLAY");
    if (review.status !== "approved") return failure("PLAY_NOT_APPROVED");
    const rebuilt = buildLeadPlayProposal(input.playSource);
    if (!rebuilt.ok) return failure("MALFORMED_INPUT");
    const play = rebuilt.proposal;
    if (!sameScope(scope, play)) return failure("SCOPE_MISMATCH");
    if (state.stableKey !== play.stableKey || review.stableKey !== play.stableKey
      || state.active.versionId !== play.versionId || state.active.contentHash !== play.contentHash
      || state.active.reviewHash !== review.reviewHash || state.active.revision !== play.revision
      || state.active.supersedesVersionId !== play.supersedesVersionId
      || review.versionId !== play.versionId || review.contentHash !== play.contentHash
      || review.revision !== play.revision || review.supersedesVersionId !== play.supersedesVersionId
      || review.createdAt !== play.createdAt) return failure("STALE_ACTIVATION");

    const sourceKeys: string[] = [];
    const sourceSet = new Set<string>();
    const approvedSources = new Set(play.sourceAllowlist);
    for (const rawSource of rawSources) {
      const sourceKey = reference(rawSource);
      if (!sourceKey) return failure("MALFORMED_INPUT");
      if (sourceSet.has(sourceKey)) return failure("DUPLICATE_ITEM");
      if (!approvedSources.has(sourceKey)) return failure("UNSUPPORTED_SOURCE");
      sourceSet.add(sourceKey);
      sourceKeys.push(sourceKey);
    }
    sourceKeys.sort(compareAscii);
    const taskCount = sourceKeys.length * play.searchHypotheses.length;
    if (maxAccounts > play.bounds.maxAccounts || maxProviderRequests > play.bounds.maxProviderRequests
      || maxSpendCents > play.bounds.maxSpendCents || taskCount > maxAccounts || taskCount > maxProviderRequests) {
      return failure("BOUNDS_EXCEEDED");
    }

    const tasks: DiscoveryTask[] = [];
    const uncertaintyIds = Object.freeze(play.uncertainties.map((item) => item.uncertaintyId).sort(compareAscii));
    let index = 0;
    for (const sourceKey of sourceKeys) {
      for (const hypothesis of play.searchHypotheses) {
        const rationaleRefs = Object.freeze(hypothesis.rationaleRefs.map((item) => Object.freeze({ ...item })));
        const caps = Object.freeze({
          maxAccounts: allocated(maxAccounts, taskCount, index),
          maxProviderRequests: allocated(maxProviderRequests, taskCount, index),
          maxSpendCents: allocated(maxSpendCents, taskCount, index),
        });
        const taskPayload = Object.freeze({ taskVersion: 1 as const, playVersionId: play.versionId,
          sourceKey, hypothesisId: hypothesis.hypothesisId, queryFamily: hypothesis.queryFamily,
          statement: hypothesis.statement, rationaleRefs, uncertaintyIds, caps });
        const taskHash = sha256(taskPayload);
        tasks.push(Object.freeze({
          taskVersion: 1,
          taskId: `discovery-task:${taskHash.slice("sha256:".length)}`,
          sourceKey,
          hypothesisId: hypothesis.hypothesisId,
          queryFamily: hypothesis.queryFamily,
          statement: hypothesis.statement,
          rationaleRefs,
          uncertaintyIds,
          caps,
        }));
        index += 1;
      }
    }
    const limits = Object.freeze({ maxAccounts, maxProviderRequests, maxSpendCents });
    const playBinding = Object.freeze({ stableKey: play.stableKey, versionId: play.versionId,
      contentHash: play.contentHash, reviewHash: review.reviewHash, revision: play.revision });
    const payload = Object.freeze({ planVersion: DISCOVERY_PLAN_VERSION, status: "plan_only" as const,
      tenantId, workspaceId, activationStateHash: state.stateHash, play: playBinding, limits, tasks: Object.freeze(tasks) });
    const planHash = sha256(payload);
    const planId = `discovery-plan:${planHash.slice("sha256:".length)}`;
    const plan: DiscoveryPlan = Object.freeze({ ...payload, planId, planHash });
    return Object.freeze({ ok: true, code: "DISCOVERY_PLAN_CREATED", plan });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
