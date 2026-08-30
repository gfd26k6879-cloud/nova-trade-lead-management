import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { simulateLeadPlay, type LeadPlaySimulation } from "@/lib/strategy/lead-play-simulation";

export const LEAD_PLAY_ACTIVATION_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string | null }>;
type HumanActor = Readonly<{ kind: "human"; actorId: string }>;

export type LeadPlaySimulationEligibilityReview = Scope & Readonly<{
  eligibilityVersion: typeof LEAD_PLAY_ACTIVATION_VERSION;
  decision: "eligible" | "ineligible";
  playVersionId: string;
  playContentHash: string;
  playReviewHash: string;
  simulationId: string;
  simulationHash: string;
  actor: HumanActor;
  reviewedAt: string;
  reason: string;
  eligibilityHash: string;
}>;

export type LeadPlayActivationBinding = Readonly<{
  versionId: string;
  contentHash: string;
  reviewHash: string;
  revision: number;
  supersedesVersionId: string | null;
  simulationId: string;
  simulationHash: string;
  simulationEligibilityHash: string;
}>;

export type LeadPlayActivationEvent = Readonly<{
  sequence: number;
  action: "activate" | "rollback";
  fromVersionId: string | null;
  to: LeadPlayActivationBinding;
  actor: HumanActor;
  at: string;
  reason: string;
}>;

export type LeadPlayActivationState = Scope & Readonly<{
  stateVersion: typeof LEAD_PLAY_ACTIVATION_VERSION;
  stableKey: string;
  createdAt: string;
  active: LeadPlayActivationBinding | null;
  inactive: readonly LeadPlayActivationBinding[];
  events: readonly LeadPlayActivationEvent[];
  stateHash: string;
}>;

export type LeadPlaySimulationEligibilityReviewResult =
  | Readonly<{ ok: true; code: "SIMULATION_ELIGIBILITY_REVIEWED"; review: LeadPlaySimulationEligibilityReview }>
  | Readonly<{ ok: false; code:
    | "MALFORMED_INPUT"
    | "SCOPE_MISMATCH"
    | "PLAY_NOT_APPROVED"
    | "STALE_PLAY"
    | "SIMULATION_MISMATCH"
    | "HUMAN_ACTOR_REQUIRED" }>;

export type LeadPlayActivationStateResult =
  | Readonly<{ ok: true; code: "LEAD_PLAY_ACTIVATION_STATE_CREATED"; state: LeadPlayActivationState }>
  | Readonly<{ ok: false; code: "MALFORMED_INPUT" }>;

export type LeadPlayActivationTransitionResult =
  | Readonly<{
    ok: true;
    code: "LEAD_PLAY_ACTIVATED" | "LEAD_PLAY_ROLLED_BACK";
    state: LeadPlayActivationState;
  }>
  | Readonly<{ ok: false; code:
    | "MALFORMED_INPUT"
    | "SCOPE_MISMATCH"
    | "PLAY_NOT_APPROVED"
    | "STALE_PLAY"
    | "STALE_STATE"
    | "SIMULATION_MISMATCH"
    | "SIMULATION_NOT_READY"
    | "SIMULATION_ELIGIBILITY_REQUIRED"
    | "HUMAN_ACTOR_REQUIRED"
    | "VERSION_CONFLICT"
    | "INVALID_TRANSITION" }>;

type PlainRecord = Record<string, unknown>;
type SafeValue = null | boolean | number | string | readonly SafeValue[] | SafeObject;
interface SafeObject { readonly [key: string]: SafeValue }

const CREATE_FIELDS = ["version", "tenantId", "workspaceId", "stableKey", "createdAt"] as const;
const ELIGIBILITY_INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "playSource", "playReview", "simulationInput", "simulation",
  "decision", "actor", "reviewedAt", "reason",
] as const;
const TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "current", "expectedStateHash", "action", "playSource",
  "playReview", "simulationInput", "simulation", "simulationEligibility", "actor", "at", "reason",
] as const;
const STATE_FIELDS = [
  "stateVersion", "tenantId", "workspaceId", "stableKey", "createdAt", "active", "inactive", "events",
  "stateHash",
] as const;
const BINDING_FIELDS = [
  "versionId", "contentHash", "reviewHash", "revision", "supersedesVersionId", "simulationId",
  "simulationHash", "simulationEligibilityHash",
] as const;
const EVENT_FIELDS = ["sequence", "action", "fromVersionId", "to", "actor", "at", "reason"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const ELIGIBILITY_FIELDS = [
  "eligibilityVersion", "tenantId", "workspaceId", "decision", "playVersionId", "playContentHash",
  "playReviewHash", "simulationId", "simulationHash", "actor", "reviewedAt", "reason", "eligibilityHash",
] as const;
const SIMULATION_INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "playReview", "playSource", "estimates", "accounts",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,299}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PLAY_VERSION = /^lead-play-version:[a-f0-9]{64}$/u;
const SIMULATION_ID = /^lead-play-simulation:[a-f0-9]{64}$/u;
const SECRET = /(?:authorization\s*:\s*bearer\s+\S+|\bsk-[A-Za-z0-9_-]{20,}\b|(?:api[_ -]?key|password|passwd|secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+)/iu;
const MAX_EVENTS = 1_000;
const MAX_SAFE_NODES = 50_000;

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

function safeValue(value: unknown, budget = { nodes: 0 }, depth = 0): SafeValue | undefined {
  budget.nodes += 1;
  if (budget.nodes > MAX_SAFE_NODES || depth > 64) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object" || isProxy(value)) return undefined;
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) return undefined;
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || Reflect.ownKeys(descriptors).length !== length + 1) {
        return undefined;
      }
      const output: SafeValue[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return undefined;
        const item = safeValue(descriptor.value, budget, depth + 1);
        if (item === undefined) return undefined;
        output.push(item);
      }
      return Object.freeze(output);
    }
    if (prototype !== Object.prototype) return undefined;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string")) return undefined;
    const output: Record<string, SafeValue> = {};
    for (const key of (keys as string[]).sort(compareAscii)) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) return undefined;
      const item = safeValue(descriptor.value, budget, depth + 1);
      if (item === undefined) return undefined;
      output[key] = item;
    }
    return Object.freeze(output);
  } catch {
    return undefined;
  }
}

function canonicalJson(value: unknown): string | null {
  const safe = safeValue(value);
  return safe === undefined ? null : JSON.stringify(safe);
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

function hash(value: unknown): string | null {
  return typeof value === "string" && HASH.test(value) ? value : null;
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

function boundedReason(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 8 || value.length > 2_000 || value !== value.trim()
    || /[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value)) return null;
  const securityView = value.normalize("NFKD").replace(/\p{M}+/gu, "").normalize("NFKC");
  return SECRET.test(securityView) ? null : value;
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

function actor(value: unknown): HumanActor | null {
  const record = exactRecord(value, ACTOR_FIELDS);
  const actorId = record && uuid(record.actorId);
  return record && record.kind === "human" && actorId
    ? Object.freeze({ kind: "human" as const, actorId }) : null;
}

function freezeBinding(value: LeadPlayActivationBinding): LeadPlayActivationBinding {
  return Object.freeze({ ...value });
}

type CanonicalSimulation = Readonly<{
  play: Readonly<{
    tenantId: string;
    workspaceId: string | null;
    stableKey: string;
    revision: number;
    supersedesVersionId: string | null;
    versionId: string;
    contentHash: string;
    reviewHash: string;
  }>;
  simulation: LeadPlaySimulation;
}>;

type CanonicalSimulationResult =
  | Readonly<{ ok: true; value: CanonicalSimulation }>
  | Readonly<{ ok: false; code: "MALFORMED_INPUT" | "SCOPE_MISMATCH" | "PLAY_NOT_APPROVED" | "STALE_PLAY" | "SIMULATION_MISMATCH" }>;

function canonicalSimulation(
  scope: Scope,
  playSource: unknown,
  playReview: unknown,
  simulationInput: unknown,
  simulation: unknown,
): CanonicalSimulationResult {
  const input = exactRecord(simulationInput, SIMULATION_INPUT_FIELDS);
  const reviewData = safeValue(playReview);
  const sourceData = safeValue(playSource);
  const inputReviewData = input && safeValue(input.playReview);
  const inputSourceData = input && safeValue(input.playSource);
  const providedSimulation = safeValue(simulation);
  if (!input || reviewData === undefined || sourceData === undefined || inputReviewData === undefined
    || inputSourceData === undefined || providedSimulation === undefined) {
    return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  }
  if (JSON.stringify(reviewData) !== JSON.stringify(inputReviewData)
    || JSON.stringify(sourceData) !== JSON.stringify(inputSourceData)) {
    return Object.freeze({ ok: false, code: "SIMULATION_MISMATCH" });
  }
  const simulated = simulateLeadPlay(simulationInput);
  if (!simulated.ok) {
    const code = simulated.code === "SCOPE_MISMATCH" ? "SCOPE_MISMATCH"
      : simulated.code === "PLAY_NOT_APPROVED" ? "PLAY_NOT_APPROVED"
        : simulated.code === "STALE_PLAY" ? "STALE_PLAY" : "MALFORMED_INPUT";
    return Object.freeze({ ok: false, code });
  }
  const rebuiltSimulation = safeValue(simulated.simulation);
  if (rebuiltSimulation === undefined || JSON.stringify(providedSimulation) !== JSON.stringify(rebuiltSimulation)) {
    return Object.freeze({ ok: false, code: "SIMULATION_MISMATCH" });
  }
  const review = reviewData as Readonly<Record<string, SafeValue>>;
  const tenantId = typeof review.tenantId === "string" && uuid(review.tenantId);
  const workspaceId = workspace(review.workspaceId);
  const stableKey = reference(review.stableKey);
  const revision = integer(review.revision, 1, 1_000_000);
  const supersedesVersionId = review.supersedesVersionId === null ? null
    : typeof review.supersedesVersionId === "string" && PLAY_VERSION.test(review.supersedesVersionId)
      ? review.supersedesVersionId : undefined;
  const versionId = typeof review.versionId === "string" && PLAY_VERSION.test(review.versionId)
    ? review.versionId : null;
  const contentHash = hash(review.contentHash);
  const reviewHash = hash(review.reviewHash);
  if (!tenantId || workspaceId === undefined || !stableKey || revision === null
    || supersedesVersionId === undefined || !versionId || !contentHash || !reviewHash) {
    return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  }
  const play = Object.freeze({
    tenantId,
    workspaceId,
    stableKey,
    revision,
    supersedesVersionId,
    versionId,
    contentHash,
    reviewHash,
  });
  if (!sameScope(scope, play) || !sameScope(scope, simulated.simulation)) {
    return Object.freeze({ ok: false, code: "SCOPE_MISMATCH" });
  }
  return Object.freeze({ ok: true, value: Object.freeze({ play, simulation: simulated.simulation }) });
}

function eligibilityFailure(
  code: Exclude<LeadPlaySimulationEligibilityReviewResult, { ok: true }>["code"],
): LeadPlaySimulationEligibilityReviewResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Records a deterministic human review of a hypothetical fixture simulation.
 * This record is not authentication, RBAC authorization, durable audit, live
 * evidence, or budget attestation; callers must enforce and persist those
 * controls before treating an `eligible` decision as activation authority.
 */
export function reviewLeadPlaySimulationEligibility(value: unknown): LeadPlaySimulationEligibilityReviewResult {
  try {
    const input = exactRecord(value, ELIGIBILITY_INPUT_FIELDS);
    if (!input || input.version !== LEAD_PLAY_ACTIVATION_VERSION) return eligibilityFailure("MALFORMED_INPUT");
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const reviewer = actor(input.actor);
    const reviewedAt = timestamp(input.reviewedAt);
    const reason = boundedReason(input.reason);
    const decision = input.decision === "eligible" || input.decision === "ineligible" ? input.decision : null;
    if (!tenantId || workspaceId === undefined || !reviewedAt || !reason || !decision) {
      return eligibilityFailure("MALFORMED_INPUT");
    }
    if (!reviewer) return eligibilityFailure("HUMAN_ACTOR_REQUIRED");
    const scope = Object.freeze({ tenantId, workspaceId });
    const canonical = canonicalSimulation(
      scope,
      input.playSource,
      input.playReview,
      input.simulationInput,
      input.simulation,
    );
    if (!canonical.ok) return eligibilityFailure(canonical.code);
    const payload = Object.freeze({
      eligibilityVersion: LEAD_PLAY_ACTIVATION_VERSION,
      tenantId,
      workspaceId,
      decision,
      playVersionId: canonical.value.play.versionId,
      playContentHash: canonical.value.play.contentHash,
      playReviewHash: canonical.value.play.reviewHash,
      simulationId: canonical.value.simulation.simulationId,
      simulationHash: canonical.value.simulation.simulationHash,
      actor: reviewer,
      reviewedAt,
      reason,
    });
    const review = Object.freeze({ ...payload, eligibilityHash: sha256(payload) });
    return Object.freeze({ ok: true, code: "SIMULATION_ELIGIBILITY_REVIEWED", review });
  } catch {
    return eligibilityFailure("MALFORMED_INPUT");
  }
}

function parseEligibility(value: unknown): LeadPlaySimulationEligibilityReview | null {
  const record = exactRecord(value, ELIGIBILITY_FIELDS);
  if (!record || record.eligibilityVersion !== LEAD_PLAY_ACTIVATION_VERSION) return null;
  const tenantId = uuid(record.tenantId);
  const workspaceId = workspace(record.workspaceId);
  const decision = record.decision === "eligible" || record.decision === "ineligible" ? record.decision : null;
  const playVersionId = typeof record.playVersionId === "string" && PLAY_VERSION.test(record.playVersionId)
    ? record.playVersionId : null;
  const playContentHash = hash(record.playContentHash);
  const playReviewHash = hash(record.playReviewHash);
  const simulationId = typeof record.simulationId === "string" && SIMULATION_ID.test(record.simulationId)
    ? record.simulationId : null;
  const simulationHash = hash(record.simulationHash);
  const reviewer = actor(record.actor);
  const reviewedAt = timestamp(record.reviewedAt);
  const reason = boundedReason(record.reason);
  const eligibilityHash = hash(record.eligibilityHash);
  if (!tenantId || workspaceId === undefined || !decision || !playVersionId || !playContentHash
    || !playReviewHash || !simulationId || !simulationHash || !reviewer || !reviewedAt || !reason
    || !eligibilityHash) return null;
  const payload = Object.freeze({
    eligibilityVersion: LEAD_PLAY_ACTIVATION_VERSION,
    tenantId,
    workspaceId,
    decision,
    playVersionId,
    playContentHash,
    playReviewHash,
    simulationId,
    simulationHash,
    actor: reviewer,
    reviewedAt,
    reason,
  });
  return sha256(payload) === eligibilityHash
    ? Object.freeze({ ...payload, eligibilityHash }) : null;
}

function parseBinding(value: unknown): LeadPlayActivationBinding | null {
  const record = exactRecord(value, BINDING_FIELDS);
  const versionId = record && typeof record.versionId === "string" && PLAY_VERSION.test(record.versionId)
    ? record.versionId : null;
  const contentHash = record && hash(record.contentHash);
  const reviewHash = record && hash(record.reviewHash);
  const revision = record && integer(record.revision, 1, 1_000_000);
  const supersedesVersionId = record?.supersedesVersionId === null ? null
    : record && typeof record.supersedesVersionId === "string" && PLAY_VERSION.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const simulationId = record && typeof record.simulationId === "string" && SIMULATION_ID.test(record.simulationId)
    ? record.simulationId : null;
  const simulationHash = record && hash(record.simulationHash);
  const simulationEligibilityHash = record && hash(record.simulationEligibilityHash);
  return record && versionId && contentHash && reviewHash && revision !== null
    && supersedesVersionId !== undefined && simulationId && simulationHash && simulationEligibilityHash
    ? freezeBinding({
      versionId,
      contentHash,
      reviewHash,
      revision,
      supersedesVersionId,
      simulationId,
      simulationHash,
      simulationEligibilityHash,
    }) : null;
}

function bindingIdentityEqual(left: LeadPlayActivationBinding, right: LeadPlayActivationBinding): boolean {
  return left.versionId === right.versionId && left.contentHash === right.contentHash
    && left.reviewHash === right.reviewHash && left.revision === right.revision
    && left.supersedesVersionId === right.supersedesVersionId;
}

function freezeEvent(value: LeadPlayActivationEvent): LeadPlayActivationEvent {
  return Object.freeze({ ...value, to: freezeBinding(value.to), actor: Object.freeze({ ...value.actor }) });
}

function parseEvent(value: unknown): LeadPlayActivationEvent | null {
  const record = exactRecord(value, EVENT_FIELDS);
  const sequence = record && integer(record.sequence, 1, MAX_EVENTS);
  const action = record?.action === "activate" || record?.action === "rollback" ? record.action : null;
  const fromVersionId = record?.fromVersionId === null ? null
    : record && typeof record.fromVersionId === "string" && PLAY_VERSION.test(record.fromVersionId)
      ? record.fromVersionId : undefined;
  const to = record && parseBinding(record.to);
  const eventActor = record && actor(record.actor);
  const at = record && timestamp(record.at);
  const reason = record && boundedReason(record.reason);
  return record && sequence !== null && action && fromVersionId !== undefined && to && eventActor && at && reason
    ? freezeEvent({ sequence, action, fromVersionId, to, actor: eventActor, at, reason }) : null;
}

function sortedBindings(values: Iterable<LeadPlayActivationBinding>): readonly LeadPlayActivationBinding[] {
  return Object.freeze([...values].sort((left, right) => left.revision - right.revision
    || compareAscii(left.versionId, right.versionId)));
}

function statePayload(input: Omit<LeadPlayActivationState, "stateHash">): Omit<LeadPlayActivationState, "stateHash"> {
  return Object.freeze({
    stateVersion: LEAD_PLAY_ACTIVATION_VERSION,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    stableKey: input.stableKey,
    createdAt: input.createdAt,
    active: input.active ? freezeBinding(input.active) : null,
    inactive: sortedBindings(input.inactive),
    events: Object.freeze(input.events.map(freezeEvent)),
  });
}

function createState(input: Omit<LeadPlayActivationState, "stateHash">): LeadPlayActivationState {
  const payload = statePayload(input);
  return Object.freeze({ ...payload, stateHash: sha256(payload) });
}

function parseState(value: unknown): LeadPlayActivationState | null {
  const record = exactRecord(value, STATE_FIELDS);
  if (!record || record.stateVersion !== LEAD_PLAY_ACTIVATION_VERSION) return null;
  const tenantId = uuid(record.tenantId);
  const workspaceId = workspace(record.workspaceId);
  const stableKey = reference(record.stableKey);
  const createdAt = timestamp(record.createdAt);
  const stateHash = hash(record.stateHash);
  const activeInput = record.active === null ? null : parseBinding(record.active);
  const inactiveInput = exactArray(record.inactive, MAX_EVENTS);
  const eventsInput = exactArray(record.events, MAX_EVENTS);
  if (!tenantId || workspaceId === undefined || !stableKey || !createdAt || !stateHash
    || (record.active !== null && !activeInput) || !inactiveInput || !eventsInput) return null;
  const inactive = inactiveInput.map(parseBinding);
  const events = eventsInput.map(parseEvent);
  if (inactive.some((item) => !item) || events.some((item) => !item)) return null;

  let replayActive: LeadPlayActivationBinding | null = null;
  const replayInactive = new Map<string, LeadPlayActivationBinding>();
  let lastAt = createdAt;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index] as LeadPlayActivationEvent;
    if (event.sequence !== index + 1 || Date.parse(event.at) <= Date.parse(lastAt)
      || event.fromVersionId !== (replayActive?.versionId ?? null)) return null;
    if (event.action === "activate") {
      if (replayInactive.has(event.to.versionId)) return null;
      if (replayActive === null) {
        if (event.to.revision !== 1 || event.to.supersedesVersionId !== null) return null;
      } else if (event.to.revision !== replayActive.revision + 1
        || event.to.supersedesVersionId !== replayActive.versionId) return null;
    } else {
      const prior = replayInactive.get(event.to.versionId);
      if (!replayActive || !prior || event.to.revision >= replayActive.revision
        || !bindingIdentityEqual(prior, event.to)) return null;
      replayInactive.delete(event.to.versionId);
    }
    if (replayActive) replayInactive.set(replayActive.versionId, replayActive);
    replayActive = event.to;
    lastAt = event.at;
  }
  const parsedInactive = inactive as LeadPlayActivationBinding[];
  const replayInactiveSorted = sortedBindings(replayInactive.values());
  const inputInactiveSorted = sortedBindings(parsedInactive);
  if (canonicalJson(replayActive) !== canonicalJson(activeInput)
    || canonicalJson(replayInactiveSorted) !== canonicalJson(inputInactiveSorted)) return null;
  const payload = statePayload({
    stateVersion: LEAD_PLAY_ACTIVATION_VERSION,
    tenantId,
    workspaceId,
    stableKey,
    createdAt,
    active: activeInput,
    inactive: inputInactiveSorted,
    events: events as LeadPlayActivationEvent[],
  });
  return sha256(payload) === stateHash ? Object.freeze({ ...payload, stateHash }) : null;
}

/** Creates the supplied-state boundary; it does not persist or reserve a play. */
export function createLeadPlayActivationState(value: unknown): LeadPlayActivationStateResult {
  try {
    const input = exactRecord(value, CREATE_FIELDS);
    if (!input || input.version !== LEAD_PLAY_ACTIVATION_VERSION) {
      return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
    }
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const stableKey = reference(input.stableKey);
    const createdAt = timestamp(input.createdAt);
    if (!tenantId || workspaceId === undefined || !stableKey || !createdAt) {
      return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
    }
    const state = createState({
      stateVersion: LEAD_PLAY_ACTIVATION_VERSION,
      tenantId,
      workspaceId,
      stableKey,
      createdAt,
      active: null,
      inactive: Object.freeze([]),
      events: Object.freeze([]),
    });
    return Object.freeze({ ok: true, code: "LEAD_PLAY_ACTIVATION_STATE_CREATED", state });
  } catch {
    return Object.freeze({ ok: false, code: "MALFORMED_INPUT" });
  }
}

function transitionFailure(
  code: Exclude<LeadPlayActivationTransitionResult, { ok: true }>["code"],
): LeadPlayActivationTransitionResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Pure eligibility/state transition only. The simulation is hypothetical and
 * advisory until separately reviewed by a human. Callers remain responsible
 * for authenticated RBAC, separation of duty, current policy/connector/budget
 * attestations, durable audit, transactional one-current-version uniqueness,
 * persistence, pause/kill-switch state, and rollback coordination. This
 * function performs no I/O, discovery, provider/model call, outreach, or run.
 */
export function transitionLeadPlayActivation(value: unknown): LeadPlayActivationTransitionResult {
  try {
    const input = exactRecord(value, TRANSITION_FIELDS);
    if (!input || input.version !== LEAD_PLAY_ACTIVATION_VERSION) return transitionFailure("MALFORMED_INPUT");
    const tenantId = uuid(input.tenantId);
    const workspaceId = workspace(input.workspaceId);
    const current = parseState(input.current);
    const expectedStateHash = hash(input.expectedStateHash);
    const action = input.action === "activate" || input.action === "rollback" ? input.action : null;
    const actorRecord = exactRecord(input.actor, ACTOR_FIELDS);
    const transitionActor = actor(input.actor);
    const at = timestamp(input.at);
    const reason = boundedReason(input.reason);
    if (!tenantId || workspaceId === undefined || !current || !expectedStateHash || !action || !actorRecord
      || !at || !reason) {
      return transitionFailure("MALFORMED_INPUT");
    }
    if (!transitionActor) return transitionFailure("HUMAN_ACTOR_REQUIRED");
    const scope = Object.freeze({ tenantId, workspaceId });
    if (!sameScope(scope, current)) return transitionFailure("SCOPE_MISMATCH");
    if (expectedStateHash !== current.stateHash) return transitionFailure("STALE_STATE");
    const lastAt = current.events.at(-1)?.at ?? current.createdAt;
    if (Date.parse(at) <= Date.parse(lastAt)) return transitionFailure("INVALID_TRANSITION");

    const canonical = canonicalSimulation(
      scope,
      input.playSource,
      input.playReview,
      input.simulationInput,
      input.simulation,
    );
    if (!canonical.ok) return transitionFailure(canonical.code);
    if (canonical.value.play.stableKey !== current.stableKey) return transitionFailure("VERSION_CONFLICT");
    const eligibility = parseEligibility(input.simulationEligibility);
    if (!eligibility || eligibility.decision !== "eligible" || !sameScope(scope, eligibility)
      || eligibility.playVersionId !== canonical.value.play.versionId
      || eligibility.playContentHash !== canonical.value.play.contentHash
      || eligibility.playReviewHash !== canonical.value.play.reviewHash
      || eligibility.simulationId !== canonical.value.simulation.simulationId
      || eligibility.simulationHash !== canonical.value.simulation.simulationHash
      || Date.parse(eligibility.reviewedAt) >= Date.parse(at)) {
      return transitionFailure("SIMULATION_ELIGIBILITY_REQUIRED");
    }
    const summary = canonical.value.simulation.summary;
    if (summary.total === 0 || summary.included !== summary.total
      || summary.excluded !== 0 || summary.needsReview !== 0) {
      return transitionFailure("SIMULATION_NOT_READY");
    }

    const target = freezeBinding({
      versionId: canonical.value.play.versionId,
      contentHash: canonical.value.play.contentHash,
      reviewHash: canonical.value.play.reviewHash,
      revision: canonical.value.play.revision,
      supersedesVersionId: canonical.value.play.supersedesVersionId,
      simulationId: canonical.value.simulation.simulationId,
      simulationHash: canonical.value.simulation.simulationHash,
      simulationEligibilityHash: eligibility.eligibilityHash,
    });
    const inactive = new Map(current.inactive.map((item) => [item.versionId, item]));
    if (action === "activate") {
      if (inactive.has(target.versionId)) return transitionFailure("VERSION_CONFLICT");
      if (current.active === null) {
        if (target.revision !== 1 || target.supersedesVersionId !== null) {
          return transitionFailure("VERSION_CONFLICT");
        }
      } else if (target.revision !== current.active.revision + 1
        || target.supersedesVersionId !== current.active.versionId) {
        return transitionFailure("VERSION_CONFLICT");
      }
    } else {
      const prior = inactive.get(target.versionId);
      if (!current.active || !prior || target.revision >= current.active.revision
        || !bindingIdentityEqual(prior, target)) return transitionFailure("INVALID_TRANSITION");
      inactive.delete(target.versionId);
    }
    if (current.active) inactive.set(current.active.versionId, current.active);
    const event = freezeEvent({
      sequence: current.events.length + 1,
      action,
      fromVersionId: current.active?.versionId ?? null,
      to: target,
      actor: transitionActor,
      at,
      reason,
    });
    const state = createState({
      stateVersion: LEAD_PLAY_ACTIVATION_VERSION,
      tenantId,
      workspaceId,
      stableKey: current.stableKey,
      createdAt: current.createdAt,
      active: target,
      inactive: sortedBindings(inactive.values()),
      events: Object.freeze([...current.events, event]),
    });
    return Object.freeze({
      ok: true,
      code: action === "activate" ? "LEAD_PLAY_ACTIVATED" : "LEAD_PLAY_ROLLED_BACK",
      state,
    });
  } catch {
    return transitionFailure("MALFORMED_INPUT");
  }
}
