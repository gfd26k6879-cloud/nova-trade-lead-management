import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

import {
  validateOutreachDraftCitations,
  type ValidatedOutreachCitations,
} from "@/lib/outreach/citation-validator";

export const OUTREACH_DRAFT_SCHEMA_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string; accountId: string }>;

export type OutreachDraftReviewStatus = "draft" | "in_review" | "approved" | "rejected";
export type OutreachDraftEligibleAction = "copy" | "export";

export type OutreachDraftReviewEvent = Readonly<{
  from: "draft" | "in_review";
  to: "in_review" | "approved" | "rejected";
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
}>;

export type OutreachDraftReviewSnapshot = Scope & Readonly<{
  reviewVersion: 1;
  versionId: string;
  versionHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  contentHash: string;
  validationHash: string;
  evidenceDigest: string;
  createdAt: string;
  status: OutreachDraftReviewStatus;
  events: readonly OutreachDraftReviewEvent[];
  eligibleActions: readonly OutreachDraftEligibleAction[];
  reviewHash: string;
}>;

export type OutreachDraftPredecessor = Readonly<{
  predecessorVersion: 1;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  review: OutreachDraftReviewSnapshot;
}>;

export type OutreachDraft = Scope & Readonly<{
  schemaVersion: typeof OUTREACH_DRAFT_SCHEMA_VERSION;
  versionId: string;
  versionHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  createdAt: string;
  subject: string;
  body: string;
  contentHash: string;
  validationHash: string;
  evidenceDigest: string;
  validation: ValidatedOutreachCitations;
  review: OutreachDraftReviewSnapshot;
}>;

export type OutreachDraftFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "CITATION_VALIDATION_FAILED"
  | "STALE_VERSION"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "HUMAN_REVIEW_REQUIRED";

export type OutreachDraftBuildResult = Readonly<
  | { ok: true; code: "OUTREACH_DRAFT_CREATED" | "OUTREACH_DRAFT_VERSION_CREATED"; draft: OutreachDraft }
  | { ok: false; code: OutreachDraftFailureCode }
>;

export type OutreachDraftReviewResult = Readonly<
  | { ok: true; code: "OUTREACH_DRAFT_REVIEW_TRANSITIONED"; review: OutreachDraftReviewSnapshot }
  | { ok: false; code: OutreachDraftFailureCode }
>;

export type OutreachDraftCurrentBinding = Scope & Readonly<{
  versionId: string;
  versionHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  contentHash: string;
  validationHash: string;
  evidenceDigest: string;
  reviewHash: string;
  status: OutreachDraftReviewStatus;
  eligibleActions: readonly OutreachDraftEligibleAction[];
  review: OutreachDraftReviewSnapshot;
}>;

export type OutreachDraftCurrentEvent = Readonly<{
  fromVersionId: string | null;
  to: OutreachDraftCurrentBinding;
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
}>;

export type OutreachDraftCurrentState = Scope & Readonly<{
  stateVersion: 1;
  stableKey: string;
  current: OutreachDraftCurrentBinding;
  events: readonly OutreachDraftCurrentEvent[];
  stateHash: string;
}>;

export type OutreachDraftCurrentStateResult = Readonly<
  | { ok: true; code: "OUTREACH_DRAFT_CURRENT_STATE_CREATED" | "OUTREACH_DRAFT_CURRENT_VERSION_SUPERSEDED" | "OUTREACH_DRAFT_CURRENT_REVIEW_REFRESHED"; state: OutreachDraftCurrentState }
  | { ok: false; code: OutreachDraftFailureCode }
>;

type DataRecord = Record<string, unknown>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "stableKey", "revision", "predecessor",
  "createdAt", "subject", "body", "claims", "citations", "evidence",
] as const;
const PREDECESSOR_FIELDS = ["predecessorVersion", "stableKey", "revision", "supersedesVersionId", "review"] as const;
const REVIEW_FIELDS = [
  "reviewVersion", "versionId", "versionHash", "tenantId", "workspaceId", "accountId", "stableKey",
  "revision", "supersedesVersionId", "contentHash", "validationHash", "evidenceDigest", "createdAt", "status", "events",
  "eligibleActions", "reviewHash",
] as const;
const CURRENT_CREATE_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "review", "actor", "at", "reason",
] as const;
const CURRENT_TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "current", "expectedStateHash", "predecessorReview",
  "replacementReview", "actor", "at", "reason",
] as const;
const CURRENT_REFRESH_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "current", "expectedStateHash", "review", "actor", "at",
  "reason",
] as const;
const CURRENT_STATE_FIELDS = [
  "stateVersion", "tenantId", "workspaceId", "accountId", "stableKey", "current", "events", "stateHash",
] as const;
const CURRENT_BINDING_FIELDS = [
  "tenantId", "workspaceId", "accountId", "versionId", "versionHash", "stableKey", "revision",
  "supersedesVersionId", "contentHash", "validationHash", "evidenceDigest", "reviewHash", "status",
  "eligibleActions", "review",
] as const;
const CURRENT_EVENT_FIELDS = ["fromVersionId", "to", "actor", "at", "reason"] as const;
const EVENT_FIELDS = ["from", "to", "actor", "at", "reason"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "current", "expectedVersionId",
  "expectedContentHash", "expectedValidationHash", "expectedReviewHash", "to", "actor", "at", "reason",
] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,254}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const VERSION_ID = /^outreach-draft-version:[0-9a-f]{64}$/u;
const MAX_EVENTS = 100;
const MAX_CANONICAL_NODES = 10_000;

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

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  if (typeof value !== "object" || value === null || !Array.isArray(value) || utilTypes.isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) return null;
    const output: unknown[] = [];
    const keys = Reflect.ownKeys(value);
    if (keys.length !== value.length + 1) return null;
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

type CanonicalValue = null | boolean | number | string | readonly CanonicalValue[] | CanonicalObject;
interface CanonicalObject { readonly [key: string]: CanonicalValue }

function canonicalValue(
  value: unknown,
  budget = { nodes: 0 },
  seen = new Set<object>(),
): CanonicalValue | undefined {
  budget.nodes += 1;
  if (budget.nodes > MAX_CANONICAL_NODES) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "object" || seen.has(value) || utilTypes.isProxy(value)) return undefined;
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const items = exactArray(value, MAX_CANONICAL_NODES);
      if (!items) return undefined;
      const output: CanonicalValue[] = [];
      for (const item of items) {
        const parsed = canonicalValue(item, budget, seen);
        if (parsed === undefined) return undefined;
        output.push(parsed);
      }
      return Object.freeze(output);
    }
    const record = inspectRecord(value);
    if (!record) return undefined;
    const output: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(record).sort()) {
      const parsed = canonicalValue(record[key], budget, seen);
      if (parsed === undefined) return undefined;
      output[key] = parsed;
    }
    return Object.freeze(output);
  } finally {
    seen.delete(value);
  }
}

function canonicalEvidenceDigest(citations: unknown, evidence: unknown): string | null {
  const rawCitations = exactArray(citations, 256);
  const rawEvidence = exactArray(evidence, 256);
  if (!rawCitations || !rawEvidence) return null;
  const parseAndSort = (items: readonly unknown[]): readonly CanonicalValue[] | null => {
    const parsed = items.map((item) => canonicalValue(item));
    if (parsed.some((item) => item === undefined)) return null;
    return Object.freeze((parsed as CanonicalValue[]).sort((left, right) => {
      const leftJson = JSON.stringify(left);
      const rightJson = JSON.stringify(right);
      return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
    }));
  };
  const canonicalCitations = parseAndSort(rawCitations);
  const canonicalEvidence = parseAndSort(rawEvidence);
  return canonicalCitations && canonicalEvidence
    ? sha256({ citations: canonicalCitations, evidence: canonicalEvidence }) : null;
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function boundedText(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value === value.trim()
    && !/[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value) ? value : null;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number : null;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId
    && left.accountId === right.accountId;
}

function eligibleActions(status: OutreachDraftReviewStatus): readonly OutreachDraftEligibleAction[] {
  return status === "approved" ? Object.freeze(["copy", "export"] as const) : Object.freeze([]);
}

function createReview(input: Omit<OutreachDraftReviewSnapshot, "reviewVersion" | "eligibleActions" | "reviewHash">): OutreachDraftReviewSnapshot {
  const payload = Object.freeze({
    reviewVersion: 1 as const,
    ...input,
    eligibleActions: eligibleActions(input.status),
  });
  return Object.freeze({ ...payload, reviewHash: sha256(payload) });
}

function parseReview(value: unknown): OutreachDraftReviewSnapshot | null {
  const record = exactRecord(value, REVIEW_FIELDS);
  if (!record) return null;
  const tenantId = typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = typeof record.workspaceId === "string" && UUID.test(record.workspaceId) ? record.workspaceId : null;
  const accountId = typeof record.accountId === "string" && UUID.test(record.accountId) ? record.accountId : null;
  const stableKey = typeof record.stableKey === "string" && SAFE_REF.test(record.stableKey) ? record.stableKey : null;
  const versionId = typeof record.versionId === "string" && VERSION_ID.test(record.versionId) ? record.versionId : null;
  const versionHash = typeof record.versionHash === "string" && HASH.test(record.versionHash) ? record.versionHash : null;
  const contentHash = typeof record.contentHash === "string" && HASH.test(record.contentHash) ? record.contentHash : null;
  const validationHash = typeof record.validationHash === "string" && HASH.test(record.validationHash)
    ? record.validationHash : null;
  const evidenceDigest = typeof record.evidenceDigest === "string" && HASH.test(record.evidenceDigest)
    ? record.evidenceDigest : null;
  const revision = integer(record.revision, 1, 1_000_000);
  const supersedesVersionId = record.supersedesVersionId === null
    ? null : typeof record.supersedesVersionId === "string" && VERSION_ID.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const createdAt = timestamp(record.createdAt);
  const rawEvents = exactArray(record.events, MAX_EVENTS);
  if (record.reviewVersion !== 1 || !tenantId || !workspaceId || !accountId || !stableKey || !versionId
    || !versionHash || versionId !== `outreach-draft-version:${versionHash.slice("sha256:".length)}`
    || !contentHash || !validationHash || !evidenceDigest || revision === null || supersedesVersionId === undefined || !createdAt
    || (revision === 1 ? supersedesVersionId !== null : supersedesVersionId === null) || !rawEvents) return null;
  const canonicalVersionHash = sha256({
    tenantId, workspaceId, accountId, stableKey, revision, supersedesVersionId, createdAt, contentHash, evidenceDigest,
  });
  if (versionHash !== canonicalVersionHash) return null;

  const events: OutreachDraftReviewEvent[] = [];
  let status: OutreachDraftReviewStatus = "draft";
  let lastAt = createdAt;
  for (const rawEvent of rawEvents) {
    const event = exactRecord(rawEvent, EVENT_FIELDS);
    const actor = event && exactRecord(event.actor, ACTOR_FIELDS);
    const actorId = actor && typeof actor.actorId === "string" && UUID.test(actor.actorId) ? actor.actorId : null;
    const at = event && timestamp(event.at);
    const reason = event && boundedText(event.reason, 2_000);
    const to = event?.to;
    const allowed = (status === "draft" && to === "in_review")
      || (status === "in_review" && (to === "approved" || to === "rejected"));
    if (!event || !actor || actor.kind !== "human" || !actorId || !at || !reason
      || event.from !== status || !allowed || Date.parse(at) <= Date.parse(lastAt)) return null;
    events.push(Object.freeze({
      from: status as "draft" | "in_review",
      to: to as "in_review" | "approved" | "rejected",
      actor: Object.freeze({ kind: "human", actorId }),
      at,
      reason,
    }));
    status = to as OutreachDraftReviewStatus;
    lastAt = at;
  }
  const actionsInput = exactArray(record.eligibleActions, 2);
  const actions = eligibleActions(status);
  if (record.status !== status || !actionsInput || actionsInput.length !== actions.length
    || actionsInput.some((action, index) => action !== actions[index])) return null;
  const parsed = createReview({
    versionId,
    versionHash,
    tenantId,
    workspaceId,
    accountId,
    stableKey,
    revision,
    supersedesVersionId,
    contentHash,
    validationHash,
    evidenceDigest,
    createdAt,
    status,
    events: Object.freeze(events),
  });
  return parsed.reviewHash === record.reviewHash ? parsed : null;
}

function parsePredecessor(value: unknown): OutreachDraftPredecessor | null {
  const record = exactRecord(value, PREDECESSOR_FIELDS);
  const stableKey = record && typeof record.stableKey === "string" && SAFE_REF.test(record.stableKey)
    ? record.stableKey : null;
  const revision = record && integer(record.revision, 1, 1_000_000);
  const supersedesVersionId = record?.supersedesVersionId === null
    ? null : typeof record?.supersedesVersionId === "string" && VERSION_ID.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const review = record && parseReview(record.review);
  if (!record || record.predecessorVersion !== 1 || !stableKey || revision === null
    || supersedesVersionId === undefined || !review || stableKey !== review.stableKey
    || revision !== review.revision || supersedesVersionId !== review.supersedesVersionId) return null;
  return Object.freeze({ predecessorVersion: 1, stableKey, revision, supersedesVersionId, review });
}

function humanActor(value: unknown): Readonly<{ kind: "human"; actorId: string }> | null {
  const record = exactRecord(value, ACTOR_FIELDS);
  const actorId = record && typeof record.actorId === "string" && UUID.test(record.actorId)
    ? record.actorId : null;
  return record && record.kind === "human" && actorId
    ? Object.freeze({ kind: "human" as const, actorId }) : null;
}

function bindingFromReview(review: OutreachDraftReviewSnapshot): OutreachDraftCurrentBinding {
  return Object.freeze({
    tenantId: review.tenantId,
    workspaceId: review.workspaceId,
    accountId: review.accountId,
    versionId: review.versionId,
    versionHash: review.versionHash,
    stableKey: review.stableKey,
    revision: review.revision,
    supersedesVersionId: review.supersedesVersionId,
    contentHash: review.contentHash,
    validationHash: review.validationHash,
    evidenceDigest: review.evidenceDigest,
    reviewHash: review.reviewHash,
    status: review.status,
    eligibleActions: Object.freeze([...review.eligibleActions]),
    review,
  });
}

function parseCurrentBinding(value: unknown): OutreachDraftCurrentBinding | null {
  const record = exactRecord(value, CURRENT_BINDING_FIELDS);
  if (!record) return null;
  const tenantId = typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = typeof record.workspaceId === "string" && UUID.test(record.workspaceId) ? record.workspaceId : null;
  const accountId = typeof record.accountId === "string" && UUID.test(record.accountId) ? record.accountId : null;
  const versionId = typeof record.versionId === "string" && VERSION_ID.test(record.versionId) ? record.versionId : null;
  const versionHash = typeof record.versionHash === "string" && HASH.test(record.versionHash) ? record.versionHash : null;
  const stableKey = typeof record.stableKey === "string" && SAFE_REF.test(record.stableKey) ? record.stableKey : null;
  const revision = integer(record.revision, 1, 1_000_000);
  const supersedesVersionId = record.supersedesVersionId === null ? null
    : typeof record.supersedesVersionId === "string" && VERSION_ID.test(record.supersedesVersionId)
      ? record.supersedesVersionId : undefined;
  const contentHash = typeof record.contentHash === "string" && HASH.test(record.contentHash) ? record.contentHash : null;
  const validationHash = typeof record.validationHash === "string" && HASH.test(record.validationHash)
    ? record.validationHash : null;
  const evidenceDigest = typeof record.evidenceDigest === "string" && HASH.test(record.evidenceDigest)
    ? record.evidenceDigest : null;
  const reviewHash = typeof record.reviewHash === "string" && HASH.test(record.reviewHash) ? record.reviewHash : null;
  const status = record.status === "draft" || record.status === "in_review" || record.status === "approved"
    || record.status === "rejected" ? record.status : null;
  const actionsInput = exactArray(record.eligibleActions, 2);
  const actions = status ? eligibleActions(status) : Object.freeze([]);
  const review = parseReview(record.review);
  if (!tenantId || !workspaceId || !accountId || !versionId || !versionHash
    || versionId !== `outreach-draft-version:${versionHash.slice("sha256:".length)}` || !stableKey
    || revision === null || supersedesVersionId === undefined || !contentHash || !validationHash
    || !evidenceDigest || !reviewHash || !status || !actionsInput || actionsInput.length !== actions.length
    || actionsInput.some((item, index) => item !== actions[index]) || !review
    || tenantId !== review.tenantId || workspaceId !== review.workspaceId || accountId !== review.accountId
    || versionId !== review.versionId || versionHash !== review.versionHash || stableKey !== review.stableKey
    || revision !== review.revision || supersedesVersionId !== review.supersedesVersionId
    || contentHash !== review.contentHash || validationHash !== review.validationHash
    || evidenceDigest !== review.evidenceDigest || reviewHash !== review.reviewHash || status !== review.status) return null;
  return bindingFromReview(review);
}

function sameDraftVersion(left: OutreachDraftCurrentBinding, right: OutreachDraftReviewSnapshot): boolean {
  return sameScope(left, right) && left.versionId === right.versionId && left.versionHash === right.versionHash
    && left.stableKey === right.stableKey && left.revision === right.revision
    && left.supersedesVersionId === right.supersedesVersionId && left.contentHash === right.contentHash
    && left.validationHash === right.validationHash && left.evidenceDigest === right.evidenceDigest;
}

function reviewExtends(
  previous: OutreachDraftReviewSnapshot,
  next: OutreachDraftReviewSnapshot,
): boolean {
  return next.events.length > previous.events.length
    && previous.events.every((event, index) => JSON.stringify(event) === JSON.stringify(next.events[index]));
}

function parseCurrentEvent(value: unknown): OutreachDraftCurrentEvent | null {
  const record = exactRecord(value, CURRENT_EVENT_FIELDS);
  const fromVersionId = record?.fromVersionId === null ? null
    : typeof record?.fromVersionId === "string" && VERSION_ID.test(record.fromVersionId)
      ? record.fromVersionId : undefined;
  const to = record && parseCurrentBinding(record.to);
  const actor = record && humanActor(record.actor);
  const at = record && timestamp(record.at);
  const reason = record && boundedText(record.reason, 2_000);
  return record && fromVersionId !== undefined && to && actor && at && reason
    ? Object.freeze({ fromVersionId, to, actor, at, reason }) : null;
}

function createCurrentState(
  scope: Scope,
  stableKey: string,
  current: OutreachDraftCurrentBinding,
  events: readonly OutreachDraftCurrentEvent[],
): OutreachDraftCurrentState {
  const payload = Object.freeze({
    stateVersion: 1 as const,
    ...scope,
    stableKey,
    current,
    events: Object.freeze([...events]),
  });
  return Object.freeze({ ...payload, stateHash: sha256(payload) });
}

function parseCurrentState(value: unknown): OutreachDraftCurrentState | null {
  const record = exactRecord(value, CURRENT_STATE_FIELDS);
  if (!record || record.stateVersion !== 1) return null;
  const tenantId = typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = typeof record.workspaceId === "string" && UUID.test(record.workspaceId) ? record.workspaceId : null;
  const accountId = typeof record.accountId === "string" && UUID.test(record.accountId) ? record.accountId : null;
  const stableKey = typeof record.stableKey === "string" && SAFE_REF.test(record.stableKey) ? record.stableKey : null;
  const current = parseCurrentBinding(record.current);
  const rawEvents = exactArray(record.events, MAX_EVENTS);
  const stateHash = typeof record.stateHash === "string" && HASH.test(record.stateHash) ? record.stateHash : null;
  if (!tenantId || !workspaceId || !accountId || !stableKey || !current || !rawEvents?.length || !stateHash) return null;
  const scope = Object.freeze({ tenantId, workspaceId, accountId });
  const events = rawEvents.map(parseCurrentEvent);
  if (events.some((event) => !event)) return null;
  let replay: OutreachDraftCurrentBinding | null = null;
  let lastAt: string | null = null;
  for (const parsed of events) {
    const event = parsed as OutreachDraftCurrentEvent;
    const destinationReviewAt = event.to.review.events.at(-1)?.at ?? event.to.review.createdAt;
    if (!sameScope(scope, event.to) || event.to.stableKey !== stableKey
      || event.fromVersionId !== replay?.versionId && !(event.fromVersionId === null && replay === null)
      || Date.parse(event.at) <= Date.parse(destinationReviewAt)
      || (lastAt !== null && Date.parse(event.at) <= Date.parse(lastAt))) return null;
    if (!replay && (event.to.revision !== 1 || event.to.supersedesVersionId !== null)) return null;
    if (replay) {
      const refreshesReview = event.to.versionId === replay.versionId;
      if (refreshesReview) {
        if (!sameDraftVersion(replay, event.to.review) || !reviewExtends(replay.review, event.to.review)) return null;
      } else if (event.to.revision !== replay.revision + 1
        || event.to.supersedesVersionId !== replay.versionId) return null;
    }
    replay = event.to;
    lastAt = event.at;
  }
  if (!replay || JSON.stringify(replay) !== JSON.stringify(current)) return null;
  const parsedState = createCurrentState(scope, stableKey, current, events as OutreachDraftCurrentEvent[]);
  return parsedState.stateHash === stateHash ? parsedState : null;
}

function failure(code: OutreachDraftFailureCode): Readonly<{ ok: false; code: OutreachDraftFailureCode }> {
  return Object.freeze({ ok: false, code });
}

export function buildOutreachDraft(value: unknown): OutreachDraftBuildResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== OUTREACH_DRAFT_SCHEMA_VERSION) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const accountId = typeof input.accountId === "string" && UUID.test(input.accountId) ? input.accountId : null;
    const stableKey = typeof input.stableKey === "string" && SAFE_REF.test(input.stableKey) ? input.stableKey : null;
    const revision = integer(input.revision, 1, 1_000_000);
    const createdAt = timestamp(input.createdAt);
    const predecessor = input.predecessor === null ? null : parsePredecessor(input.predecessor);
    if (!tenantId || !workspaceId || !accountId || !stableKey || revision === null || !createdAt
      || typeof input.subject !== "string" || typeof input.body !== "string") return failure("MALFORMED_INPUT");
    if (input.predecessor !== null && !predecessor) return failure("MALFORMED_INPUT");
    const scope = Object.freeze({ tenantId, workspaceId, accountId });
    if (predecessor && !sameScope(scope, predecessor.review)) return failure("SCOPE_MISMATCH");
    if ((revision === 1 && predecessor !== null) || (revision > 1 && predecessor === null)
      || (predecessor && (predecessor.stableKey !== stableKey || predecessor.revision + 1 !== revision
        || Date.parse(createdAt) <= Date.parse(predecessor.review.events.at(-1)?.at ?? predecessor.review.createdAt)))) {
      return failure("VERSION_CONFLICT");
    }

    const contentHash = sha256({ subject: input.subject, body: input.body });
    const evidenceDigest = canonicalEvidenceDigest(input.citations, input.evidence);
    if (!evidenceDigest) return failure("CITATION_VALIDATION_FAILED");
    const supersedesVersionId = predecessor?.review.versionId ?? null;
    const versionHash = sha256({
      tenantId, workspaceId, accountId, stableKey, revision, supersedesVersionId, createdAt, contentHash, evidenceDigest,
    });
    const versionId = `outreach-draft-version:${versionHash.slice("sha256:".length)}`;
    const validation = validateOutreachDraftCitations({
      version: 1,
      scope: { tenantId, workspaceId, accountId },
      draft: {
        draftVersion: 1,
        draftId: stableKey,
        draftVersionId: versionId,
        contentHash,
        subject: input.subject,
        body: input.body,
        claims: input.claims,
      },
      citations: input.citations,
      evidence: input.evidence,
    });
    if (!validation.ok) return failure("CITATION_VALIDATION_FAILED");
    const validationHash = sha256(validation.value);
    const review = createReview({
      versionId,
      versionHash,
      tenantId,
      workspaceId,
      accountId,
      stableKey,
      revision,
      supersedesVersionId,
      contentHash,
      validationHash,
      evidenceDigest,
      createdAt,
      status: "draft",
      events: Object.freeze([]),
    });
    const draft: OutreachDraft = Object.freeze({
      schemaVersion: OUTREACH_DRAFT_SCHEMA_VERSION,
      versionId,
      versionHash,
      tenantId,
      workspaceId,
      accountId,
      stableKey,
      revision,
      supersedesVersionId,
      createdAt,
      subject: input.subject,
      body: input.body,
      contentHash,
      validationHash,
      evidenceDigest,
      validation: validation.value,
      review,
    });
    return Object.freeze({
      ok: true,
      code: predecessor ? "OUTREACH_DRAFT_VERSION_CREATED" : "OUTREACH_DRAFT_CREATED",
      draft,
    });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

export function transitionOutreachDraftReview(value: unknown): OutreachDraftReviewResult {
  try {
    const input = exactRecord(value, TRANSITION_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const current = parseReview(input.current);
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const accountId = typeof input.accountId === "string" && UUID.test(input.accountId) ? input.accountId : null;
    const actor = exactRecord(input.actor, ACTOR_FIELDS);
    const actorId = actor && typeof actor.actorId === "string" && UUID.test(actor.actorId) ? actor.actorId : null;
    const to = input.to === "in_review" || input.to === "approved" || input.to === "rejected" ? input.to : null;
    const at = timestamp(input.at);
    const reason = boundedText(input.reason, 2_000);
    if (!current || !tenantId || !workspaceId || !accountId || !actor || !actorId || !to || !at || !reason
      || typeof input.expectedVersionId !== "string" || !VERSION_ID.test(input.expectedVersionId)
      || typeof input.expectedContentHash !== "string" || !HASH.test(input.expectedContentHash)
      || typeof input.expectedValidationHash !== "string" || !HASH.test(input.expectedValidationHash)
      || typeof input.expectedReviewHash !== "string" || !HASH.test(input.expectedReviewHash)) {
      return failure("MALFORMED_INPUT");
    }
    if (!sameScope({ tenantId, workspaceId, accountId }, current)) return failure("SCOPE_MISMATCH");
    if (input.expectedVersionId !== current.versionId || input.expectedContentHash !== current.contentHash
      || input.expectedValidationHash !== current.validationHash || input.expectedReviewHash !== current.reviewHash) {
      return failure("STALE_VERSION");
    }
    if (actor.kind !== "human") return failure("HUMAN_REVIEW_REQUIRED");
    const allowed = (current.status === "draft" && to === "in_review")
      || (current.status === "in_review" && (to === "approved" || to === "rejected"));
    const lastAt = current.events.at(-1)?.at ?? current.createdAt;
    if (!allowed || Date.parse(at) <= Date.parse(lastAt)) return failure("INVALID_TRANSITION");
    const event: OutreachDraftReviewEvent = Object.freeze({
      from: current.status as "draft" | "in_review",
      to,
      actor: Object.freeze({ kind: "human", actorId }),
      at,
      reason,
    });
    const review = createReview({
      versionId: current.versionId,
      versionHash: current.versionHash,
      tenantId: current.tenantId,
      workspaceId: current.workspaceId,
      accountId: current.accountId,
      stableKey: current.stableKey,
      revision: current.revision,
      supersedesVersionId: current.supersedesVersionId,
      contentHash: current.contentHash,
      validationHash: current.validationHash,
      evidenceDigest: current.evidenceDigest,
      createdAt: current.createdAt,
      status: to,
      events: Object.freeze([...current.events, event]),
    });
    return Object.freeze({ ok: true, code: "OUTREACH_DRAFT_REVIEW_TRANSITIONED", review });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

/**
 * Creates a pure current-version projection from one approved review. This does
 * not authenticate the actor, persist state, export content, or grant delivery
 * authority; callers own RBAC, audit, and transactional current-row uniqueness.
 */
export function createOutreachDraftCurrentVersionState(value: unknown): OutreachDraftCurrentStateResult {
  try {
    const input = exactRecord(value, CURRENT_CREATE_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const accountId = typeof input.accountId === "string" && UUID.test(input.accountId) ? input.accountId : null;
    const review = parseReview(input.review);
    const actor = humanActor(input.actor);
    const at = timestamp(input.at);
    const reason = boundedText(input.reason, 2_000);
    if (!tenantId || !workspaceId || !accountId || !review || !actor || !at || !reason) {
      return failure("MALFORMED_INPUT");
    }
    const scope = Object.freeze({ tenantId, workspaceId, accountId });
    if (!sameScope(scope, review)) return failure("SCOPE_MISMATCH");
    if (review.revision !== 1 || review.supersedesVersionId !== null) return failure("VERSION_CONFLICT");
    if (review.status !== "approved") return failure("INVALID_TRANSITION");
    const lastReviewAt = review.events.at(-1)?.at ?? review.createdAt;
    if (Date.parse(at) <= Date.parse(lastReviewAt)) return failure("INVALID_TRANSITION");
    const current = bindingFromReview(review);
    const event: OutreachDraftCurrentEvent = Object.freeze({
      fromVersionId: null,
      to: current,
      actor,
      at,
      reason,
    });
    const state = createCurrentState(scope, review.stableKey, current, Object.freeze([event]));
    return Object.freeze({ ok: true, code: "OUTREACH_DRAFT_CURRENT_STATE_CREATED", state });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

/** Registers N+1 as current and thereby removes all copy/export eligibility from N. */
export function supersedeOutreachDraftCurrentVersion(value: unknown): OutreachDraftCurrentStateResult {
  try {
    const input = exactRecord(value, CURRENT_TRANSITION_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const accountId = typeof input.accountId === "string" && UUID.test(input.accountId) ? input.accountId : null;
    const state = parseCurrentState(input.current);
    const predecessor = parseReview(input.predecessorReview);
    const replacement = parseReview(input.replacementReview);
    const expectedStateHash = typeof input.expectedStateHash === "string" && HASH.test(input.expectedStateHash)
      ? input.expectedStateHash : null;
    const actor = humanActor(input.actor);
    const at = timestamp(input.at);
    const reason = boundedText(input.reason, 2_000);
    if (!tenantId || !workspaceId || !accountId || !state || !predecessor || !replacement
      || !expectedStateHash || !actor || !at || !reason) return failure("MALFORMED_INPUT");
    const scope = Object.freeze({ tenantId, workspaceId, accountId });
    if (!sameScope(scope, state) || !sameScope(scope, predecessor) || !sameScope(scope, replacement)) {
      return failure("SCOPE_MISMATCH");
    }
    if (expectedStateHash !== state.stateHash) return failure("STALE_VERSION");
    if (state.events.length >= MAX_EVENTS) return failure("INVALID_TRANSITION");
    if (JSON.stringify(bindingFromReview(predecessor)) !== JSON.stringify(state.current)) {
      return failure("STALE_VERSION");
    }
    if (predecessor.status !== "approved" || replacement.stableKey !== state.stableKey
      || replacement.revision !== predecessor.revision + 1
      || replacement.supersedesVersionId !== predecessor.versionId) return failure("VERSION_CONFLICT");
    const lastAt = state.events.at(-1)?.at;
    const replacementReviewAt = replacement.events.at(-1)?.at ?? replacement.createdAt;
    if (!lastAt || Date.parse(at) <= Date.parse(lastAt) || Date.parse(at) <= Date.parse(replacementReviewAt)) {
      return failure("INVALID_TRANSITION");
    }
    const current = bindingFromReview(replacement);
    const event: OutreachDraftCurrentEvent = Object.freeze({
      fromVersionId: predecessor.versionId,
      to: current,
      actor,
      at,
      reason,
    });
    const next = createCurrentState(scope, state.stableKey, current, Object.freeze([...state.events, event]));
    return Object.freeze({ ok: true, code: "OUTREACH_DRAFT_CURRENT_VERSION_SUPERSEDED", state: next });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

/** Refreshes the exact current version's review projection without replacing its version history. */
export function refreshOutreachDraftCurrentReview(value: unknown): OutreachDraftCurrentStateResult {
  try {
    const input = exactRecord(value, CURRENT_REFRESH_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const accountId = typeof input.accountId === "string" && UUID.test(input.accountId) ? input.accountId : null;
    const state = parseCurrentState(input.current);
    const review = parseReview(input.review);
    const expectedStateHash = typeof input.expectedStateHash === "string" && HASH.test(input.expectedStateHash)
      ? input.expectedStateHash : null;
    const actor = humanActor(input.actor);
    const at = timestamp(input.at);
    const reason = boundedText(input.reason, 2_000);
    if (!tenantId || !workspaceId || !accountId || !state || !review || !expectedStateHash || !actor || !at
      || !reason) return failure("MALFORMED_INPUT");
    const scope = Object.freeze({ tenantId, workspaceId, accountId });
    if (!sameScope(scope, state) || !sameScope(scope, review)) return failure("SCOPE_MISMATCH");
    if (expectedStateHash !== state.stateHash) return failure("STALE_VERSION");
    if (state.events.length >= MAX_EVENTS) return failure("INVALID_TRANSITION");
    if (!sameDraftVersion(state.current, review)) return failure("VERSION_CONFLICT");
    if (!reviewExtends(state.current.review, review)) return failure("INVALID_TRANSITION");
    const lastAt = state.events.at(-1)?.at;
    const lastReviewAt = review.events.at(-1)?.at ?? review.createdAt;
    if (!lastAt || Date.parse(at) <= Date.parse(lastAt) || Date.parse(at) <= Date.parse(lastReviewAt)) {
      return failure("INVALID_TRANSITION");
    }
    const current = bindingFromReview(review);
    const event: OutreachDraftCurrentEvent = Object.freeze({
      fromVersionId: state.current.versionId,
      to: current,
      actor,
      at,
      reason,
    });
    const next = createCurrentState(scope, state.stableKey, current, Object.freeze([...state.events, event]));
    return Object.freeze({ ok: true, code: "OUTREACH_DRAFT_CURRENT_REVIEW_REFRESHED", state: next });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

/** Only the exact current approved version is eligible for copy/export. */
export function outreachDraftEligibleActionsForVersion(
  stateValue: unknown,
  versionIdValue: unknown,
): readonly OutreachDraftEligibleAction[] {
  const state = parseCurrentState(stateValue);
  const versionId = typeof versionIdValue === "string" && VERSION_ID.test(versionIdValue)
    ? versionIdValue : null;
  return state && versionId === state.current.versionId
    ? Object.freeze([...state.current.eligibleActions]) : Object.freeze([]);
}
