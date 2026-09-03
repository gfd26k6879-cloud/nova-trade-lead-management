import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";

export const ACCOUNT_RESOLUTION_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string }>;

export type AccountSourceObservation = Scope & Readonly<{
  observationId: string;
  sourceKey: string;
  namespace: string;
  externalId: string;
  observedAt: string;
  payloadHash: string;
  provenanceHash: string;
}>;

export type AccountResolution = Scope & Readonly<{
  resolutionVersion: typeof ACCOUNT_RESOLUTION_VERSION;
  resolutionId: string;
  resolutionHash: string;
  state: "auto_resolved" | "human_review" | "canonical_candidate";
  ruleId:
    | "EXACT_SOURCE_ID_SAME_TENANT_NAMESPACE"
    | "CONFLICTING_EXACT_IDENTITY"
    | "NO_MATCH_OR_INSUFFICIENT_EVIDENCE";
  targetAccountId: string | null;
  canonicalCandidateId: string | null;
  candidateAccountIds: readonly string[];
  observations: readonly AccountSourceObservation[];
}>;

export type AccountResolutionFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "CAP_EXCEEDED"
  | "DUPLICATE_ITEM"
  | "STALE_STATE"
  | "INVALID_TRANSITION"
  | "HUMAN_REVIEW_REQUIRED";

export type AccountResolutionResult = Readonly<
  | { ok: true; code: "ACCOUNT_RESOLUTION_COMPLETED"; resolution: AccountResolution }
  | { ok: false; code: AccountResolutionFailureCode }
>;

export type AccountMergeEvent = Scope & Readonly<{
  eventId: string;
  action: "merge" | "unmerge";
  survivorAccountId: string;
  retiredAccountId: string;
  evidenceObservationIds: readonly string[];
  actor: Readonly<{ kind: "human"; actorId: string }>;
  at: string;
  reason: string;
}>;

export type AccountMergeMember = Readonly<{
  accountId: string;
  version: number;
  status: "active" | "merged";
  redirectToAccountId: string | null;
  observationRefs: readonly string[];
}>;

export type AccountMergeSnapshot = Scope & Readonly<{
  mergeVersion: 1;
  members: readonly AccountMergeMember[];
  events: readonly AccountMergeEvent[];
  stateHash: string;
}>;

export type AccountMergeResult = Readonly<
  | { ok: true; code: "ACCOUNT_MERGE_TRANSITIONED"; snapshot: AccountMergeSnapshot }
  | { ok: false; code: AccountResolutionFailureCode }
>;

export type AccountMergeCreateResult = Readonly<
  | { ok: true; code: "ACCOUNT_MERGE_SNAPSHOT_CREATED"; snapshot: AccountMergeSnapshot }
  | { ok: false; code: AccountResolutionFailureCode }
>;

type DataRecord = Record<string, unknown>;
type ExactKey = Readonly<{ sourceKey: string; namespace: string; externalId: string }>;
type Candidate = Scope & Readonly<{
  accountId: string;
  version: number;
  status: "active" | "merged";
  exactKeys: readonly ExactKey[];
  observationRefs: readonly string[];
}>;

const INPUT_FIELDS = ["version", "tenantId", "workspaceId", "observations", "candidates"] as const;
const OBSERVATION_FIELDS = [
  "observationId", "tenantId", "workspaceId", "sourceKey", "namespace", "externalId", "observedAt",
  "payloadHash", "provenanceHash",
] as const;
const CANDIDATE_FIELDS = [
  "accountId", "tenantId", "workspaceId", "version", "status", "exactKeys", "observationRefs",
] as const;
const KEY_FIELDS = ["sourceKey", "namespace", "externalId"] as const;
const MERGE_CREATE_FIELDS = ["version", "tenantId", "workspaceId", "members"] as const;
const MERGE_MEMBER_FIELDS = ["accountId", "version", "status", "redirectToAccountId", "observationRefs"] as const;
const MERGE_SNAPSHOT_FIELDS = ["mergeVersion", "tenantId", "workspaceId", "members", "events", "stateHash"] as const;
const MERGE_EVENT_FIELDS = [
  "eventId", "tenantId", "workspaceId", "action", "survivorAccountId", "retiredAccountId",
  "evidenceObservationIds", "actor", "at", "reason",
] as const;
const MERGE_TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "current", "expectedStateHash", "action", "survivorAccountId",
  "retiredAccountId", "evidenceObservationIds", "actor", "at", "reason",
] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._@/-]{0,299}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const MAX_OBSERVATIONS = 64;
const MAX_CANDIDATES = 128;
const MAX_KEYS = 32;
const MAX_OBSERVATION_REFS = 128;
const MAX_MERGE_EVENTS = 100;

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

function bounded(value: unknown, maximum = 512): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value === value.trim()
    && isWellFormedUnicode(value)
    && !/[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value) ? value : null;
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
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId;
}

function key(value: ExactKey): string {
  return `${value.sourceKey}\u0000${value.namespace}\u0000${value.externalId}`;
}

function parseObservation(value: unknown): AccountSourceObservation | null {
  const record = exactRecord(value, OBSERVATION_FIELDS);
  const observationId = record && ref(record.observationId);
  const tenantId = record && typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = record && typeof record.workspaceId === "string" && UUID.test(record.workspaceId)
    ? record.workspaceId : null;
  const sourceKey = record && ref(record.sourceKey);
  const namespace = record && ref(record.namespace);
  const externalId = record && bounded(record.externalId);
  const observedAt = record && timestamp(record.observedAt);
  if (!record || !observationId || !tenantId || !workspaceId || !sourceKey || !namespace || !externalId
    || !observedAt || typeof record.payloadHash !== "string" || !HASH.test(record.payloadHash)
    || typeof record.provenanceHash !== "string" || !HASH.test(record.provenanceHash)) return null;
  return Object.freeze({
    observationId, tenantId, workspaceId, sourceKey, namespace, externalId, observedAt,
    payloadHash: record.payloadHash, provenanceHash: record.provenanceHash,
  });
}

function parseCandidate(value: unknown): Candidate | null | "cap" {
  const record = exactRecord(value, CANDIDATE_FIELDS);
  const accountId = record && ref(record.accountId);
  const tenantId = record && typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = record && typeof record.workspaceId === "string" && UUID.test(record.workspaceId)
    ? record.workspaceId : null;
  const version = record && integer(record.version, 1, 1_000_000);
  const rawKeys = record && exactArray(record.exactKeys, MAX_KEYS);
  const rawRefs = record && exactArray(record.observationRefs, MAX_OBSERVATION_REFS);
  if (rawKeys === "cap" || rawRefs === "cap") return "cap";
  if (!record || !accountId || !tenantId || !workspaceId || version === null
    || (record.status !== "active" && record.status !== "merged") || !rawKeys || !rawRefs) return null;
  const exactKeys: ExactKey[] = [];
  const seenKeys = new Set<string>();
  for (const raw of rawKeys) {
    const item = exactRecord(raw, KEY_FIELDS);
    const sourceKey = item && ref(item.sourceKey);
    const namespace = item && ref(item.namespace);
    const externalId = item && bounded(item.externalId);
    if (!item || !sourceKey || !namespace || !externalId) return null;
    const parsed = Object.freeze({ sourceKey, namespace, externalId });
    if (seenKeys.has(key(parsed))) return null;
    seenKeys.add(key(parsed));
    exactKeys.push(parsed);
  }
  const observationRefs: string[] = [];
  const seenRefs = new Set<string>();
  for (const raw of rawRefs) {
    const item = ref(raw);
    if (!item || seenRefs.has(item)) return null;
    seenRefs.add(item);
    observationRefs.push(item);
  }
  exactKeys.sort((left, right) => compare(key(left), key(right)));
  observationRefs.sort(compare);
  return Object.freeze({
    accountId, tenantId, workspaceId, version, status: record.status,
    exactKeys: Object.freeze(exactKeys), observationRefs: Object.freeze(observationRefs),
  }) as Candidate;
}

function failure(code: AccountResolutionFailureCode): Readonly<{ ok: false; code: AccountResolutionFailureCode }> {
  return Object.freeze({ ok: false, code });
}

export function resolveAccountObservations(value: unknown): AccountResolutionResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== ACCOUNT_RESOLUTION_VERSION) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const rawObservations = exactArray(input.observations, MAX_OBSERVATIONS);
    const rawCandidates = exactArray(input.candidates, MAX_CANDIDATES);
    if (rawObservations === "cap" || rawCandidates === "cap") return failure("CAP_EXCEEDED");
    if (!tenantId || !workspaceId || !rawObservations || !rawCandidates || rawObservations.length === 0) {
      return failure("MALFORMED_INPUT");
    }
    const scope = Object.freeze({ tenantId, workspaceId });
    const observations: AccountSourceObservation[] = [];
    const observationIds = new Set<string>();
    for (const raw of rawObservations) {
      const parsed = parseObservation(raw);
      if (!parsed) return failure("MALFORMED_INPUT");
      if (!sameScope(scope, parsed)) return failure("SCOPE_MISMATCH");
      if (observationIds.has(parsed.observationId)) return failure("DUPLICATE_ITEM");
      observationIds.add(parsed.observationId);
      observations.push(parsed);
    }
    const candidates: Candidate[] = [];
    const candidateIds = new Set<string>();
    for (const raw of rawCandidates) {
      const parsed = parseCandidate(raw);
      if (parsed === "cap") return failure("CAP_EXCEEDED");
      if (!parsed) return failure("MALFORMED_INPUT");
      if (!sameScope(scope, parsed)) return failure("SCOPE_MISMATCH");
      if (candidateIds.has(parsed.accountId)) return failure("DUPLICATE_ITEM");
      candidateIds.add(parsed.accountId);
      candidates.push(parsed);
    }
    observations.sort((left, right) => compare(left.observationId, right.observationId));
    candidates.sort((left, right) => compare(left.accountId, right.accountId));

    const matchesByObservation = observations.map((item) => {
      const observationKey = key(item);
      return candidates.filter((candidate) => candidate.exactKeys.some((candidateKey) => key(candidateKey) === observationKey));
    });
    const matchedIds = [...new Set(matchesByObservation.flatMap((items) => items.map((item) => item.accountId)))].sort(compare);
    const exactOne = matchedIds.length === 1
      && matchesByObservation.every((items) => items.length === 1 && items[0]?.accountId === matchedIds[0])
      && candidates.find((candidate) => candidate.accountId === matchedIds[0])?.status === "active";
    const noMatches = matchedIds.length === 0;
    const oneUnmatchedIdentity = noMatches && new Set(observations.map((item) => key(item))).size === 1;
    const state = exactOne ? "auto_resolved" as const
      : oneUnmatchedIdentity ? "canonical_candidate" as const : "human_review" as const;
    const ruleId = exactOne ? "EXACT_SOURCE_ID_SAME_TENANT_NAMESPACE" as const
      : oneUnmatchedIdentity ? "NO_MATCH_OR_INSUFFICIENT_EVIDENCE" as const : "CONFLICTING_EXACT_IDENTITY" as const;
    const targetAccountId = exactOne ? matchedIds[0] ?? null : null;
    const canonicalCandidateId = oneUnmatchedIdentity
      ? `account-candidate:${sha256({ tenantId, workspaceId, observations }).slice("sha256:".length)}` : null;
    const payload = Object.freeze({
      resolutionVersion: ACCOUNT_RESOLUTION_VERSION,
      tenantId,
      workspaceId,
      state,
      ruleId,
      targetAccountId,
      canonicalCandidateId,
      candidateAccountIds: Object.freeze(matchedIds),
      observations: Object.freeze(observations),
    });
    const resolutionHash = sha256(payload);
    const resolutionId = `account-resolution:${resolutionHash.slice("sha256:".length)}`;
    const resolution: AccountResolution = Object.freeze({ ...payload, resolutionId, resolutionHash });
    return Object.freeze({ ok: true, code: "ACCOUNT_RESOLUTION_COMPLETED", resolution });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

function parseStringRefs(value: unknown, maximum: number, requireOne = false): readonly string[] | null | "cap" {
  const raw = exactArray(value, maximum);
  if (raw === "cap") return "cap";
  if (!raw || (requireOne && raw.length === 0)) return null;
  const output: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const parsed = ref(value);
    if (!parsed || seen.has(parsed)) return null;
    seen.add(parsed);
    output.push(parsed);
  }
  output.sort(compare);
  return Object.freeze(output);
}

function parseMergeMember(value: unknown): AccountMergeMember | null | "cap" {
  const record = exactRecord(value, MERGE_MEMBER_FIELDS);
  const accountId = record && ref(record.accountId);
  const version = record && integer(record.version, 1, 1_000_000);
  const observationRefs = record && parseStringRefs(record.observationRefs, MAX_OBSERVATION_REFS);
  if (observationRefs === "cap") return "cap";
  const redirectToAccountId = record?.redirectToAccountId === null
    ? null : record && ref(record.redirectToAccountId);
  if (!record || !accountId || version === null || !observationRefs
    || (record.status !== "active" && record.status !== "merged")
    || redirectToAccountId === undefined
    || (record.status === "active" ? redirectToAccountId !== null : !redirectToAccountId)) return null;
  return Object.freeze({ accountId, version, status: record.status, redirectToAccountId, observationRefs });
}

function parseMergeEvent(value: unknown): AccountMergeEvent | null | "cap" {
  const record = exactRecord(value, MERGE_EVENT_FIELDS);
  const tenantId = record && typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = record && typeof record.workspaceId === "string" && UUID.test(record.workspaceId)
    ? record.workspaceId : null;
  const survivorAccountId = record && ref(record.survivorAccountId);
  const retiredAccountId = record && ref(record.retiredAccountId);
  const evidenceObservationIds = record && parseStringRefs(record.evidenceObservationIds, MAX_OBSERVATIONS, true);
  if (evidenceObservationIds === "cap") return "cap";
  const actor = record && exactRecord(record.actor, ACTOR_FIELDS);
  const actorId = actor && typeof actor.actorId === "string" && UUID.test(actor.actorId) ? actor.actorId : null;
  const at = record && timestamp(record.at);
  const reason = record && bounded(record.reason, 2_000);
  if (!record || !tenantId || !workspaceId || !survivorAccountId || !retiredAccountId
    || survivorAccountId === retiredAccountId || !evidenceObservationIds || !actor || actor.kind !== "human"
    || !actorId || !at || !reason || (record.action !== "merge" && record.action !== "unmerge")) return null;
  const payload = Object.freeze({
    tenantId, workspaceId, action: record.action, survivorAccountId, retiredAccountId,
    evidenceObservationIds, actor: Object.freeze({ kind: "human" as const, actorId }), at, reason,
  });
  const eventId = `account-merge-event:${sha256(payload).slice("sha256:".length)}`;
  return record.eventId === eventId ? Object.freeze({ ...payload, eventId }) : null;
}

function createMergeSnapshot(scope: Scope, members: readonly AccountMergeMember[], events: readonly AccountMergeEvent[]): AccountMergeSnapshot {
  const payload = Object.freeze({
    mergeVersion: 1 as const,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    members: Object.freeze([...members]),
    events: Object.freeze([...events]),
  });
  return Object.freeze({ ...payload, stateHash: sha256(payload) });
}

function parseMergeSnapshot(value: unknown): AccountMergeSnapshot | null | "cap" {
  const record = exactRecord(value, MERGE_SNAPSHOT_FIELDS);
  const tenantId = record && typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = record && typeof record.workspaceId === "string" && UUID.test(record.workspaceId)
    ? record.workspaceId : null;
  const rawMembers = record && exactArray(record.members, MAX_CANDIDATES);
  const rawEvents = record && exactArray(record.events, MAX_MERGE_EVENTS);
  if (rawMembers === "cap" || rawEvents === "cap") return "cap";
  if (!record || record.mergeVersion !== 1 || !tenantId || !workspaceId || !rawMembers || !rawEvents
    || typeof record.stateHash !== "string" || !HASH.test(record.stateHash)) return null;
  const members: AccountMergeMember[] = [];
  const memberIds = new Set<string>();
  for (const raw of rawMembers) {
    const parsed = parseMergeMember(raw);
    if (parsed === "cap") return "cap";
    if (!parsed || memberIds.has(parsed.accountId)) return null;
    memberIds.add(parsed.accountId);
    members.push(parsed);
  }
  const events: AccountMergeEvent[] = [];
  const eventIds = new Set<string>();
  let lastAt: string | null = null;
  for (const raw of rawEvents) {
    const parsed = parseMergeEvent(raw);
    if (parsed === "cap") return "cap";
    if (!parsed || !sameScope({ tenantId, workspaceId }, parsed) || eventIds.has(parsed.eventId)
      || (lastAt !== null && Date.parse(parsed.at) <= Date.parse(lastAt))) return null;
    eventIds.add(parsed.eventId);
    events.push(parsed);
    lastAt = parsed.at;
  }
  members.sort((left, right) => compare(left.accountId, right.accountId));
  const replay = new Map(members.map((member) => [member.accountId, {
    status: "active" as "active" | "merged",
    redirectToAccountId: null as string | null,
  }]));
  for (const event of events) {
    const survivor = replay.get(event.survivorAccountId);
    const retired = replay.get(event.retiredAccountId);
    const survivorMember = members.find((member) => member.accountId === event.survivorAccountId);
    const retiredMember = members.find((member) => member.accountId === event.retiredAccountId);
    if (!survivor || !retired || !survivorMember || !retiredMember
      || !survivorMember.observationRefs.some((id) => event.evidenceObservationIds.includes(id))
      || !retiredMember.observationRefs.some((id) => event.evidenceObservationIds.includes(id))) return null;
    if (event.action === "merge") {
      if (survivor.status !== "active" || retired.status !== "active") return null;
      retired.status = "merged";
      retired.redirectToAccountId = event.survivorAccountId;
    } else {
      if (survivor.status !== "active" || retired.status !== "merged"
        || retired.redirectToAccountId !== event.survivorAccountId) return null;
      retired.status = "active";
      retired.redirectToAccountId = null;
    }
  }
  if (members.some((member) => {
    const expected = replay.get(member.accountId);
    return !expected || member.status !== expected.status || member.redirectToAccountId !== expected.redirectToAccountId;
  })) return null;
  const snapshot = createMergeSnapshot({ tenantId, workspaceId }, members, events);
  return snapshot.stateHash === record.stateHash ? snapshot : null;
}

export function createAccountMergeSnapshot(value: unknown): AccountMergeCreateResult {
  try {
    const input = exactRecord(value, MERGE_CREATE_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const rawMembers = exactArray(input.members, MAX_CANDIDATES);
    if (rawMembers === "cap") return failure("CAP_EXCEEDED");
    if (!tenantId || !workspaceId || !rawMembers || rawMembers.length < 2) return failure("MALFORMED_INPUT");
    const members: AccountMergeMember[] = [];
    const ids = new Set<string>();
    for (const raw of rawMembers) {
      const parsed = parseMergeMember(raw);
      if (parsed === "cap") return failure("CAP_EXCEEDED");
      if (!parsed || parsed.status !== "active" || ids.has(parsed.accountId)) return failure("MALFORMED_INPUT");
      ids.add(parsed.accountId);
      members.push(parsed);
    }
    members.sort((left, right) => compare(left.accountId, right.accountId));
    const snapshot = createMergeSnapshot({ tenantId, workspaceId }, members, Object.freeze([]));
    return Object.freeze({ ok: true, code: "ACCOUNT_MERGE_SNAPSHOT_CREATED", snapshot });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

export function transitionAccountMerge(value: unknown): AccountMergeResult {
  try {
    const input = exactRecord(value, MERGE_TRANSITION_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const current = parseMergeSnapshot(input.current);
    if (current === "cap") return failure("CAP_EXCEEDED");
    const actor = exactRecord(input.actor, ACTOR_FIELDS);
    const actorId = actor && typeof actor.actorId === "string" && UUID.test(actor.actorId) ? actor.actorId : null;
    const survivorAccountId = ref(input.survivorAccountId);
    const retiredAccountId = ref(input.retiredAccountId);
    const evidenceObservationIds = parseStringRefs(input.evidenceObservationIds, MAX_OBSERVATIONS, true);
    if (evidenceObservationIds === "cap") return failure("CAP_EXCEEDED");
    const at = timestamp(input.at);
    const reason = bounded(input.reason, 2_000);
    if (!tenantId || !workspaceId || !current || !actor || !actorId || !survivorAccountId || !retiredAccountId
      || survivorAccountId === retiredAccountId || !evidenceObservationIds || !at || !reason
      || typeof input.expectedStateHash !== "string" || !HASH.test(input.expectedStateHash)
      || (input.action !== "merge" && input.action !== "unmerge")) return failure("MALFORMED_INPUT");
    const scope = Object.freeze({ tenantId, workspaceId });
    if (!sameScope(scope, current)) return failure("SCOPE_MISMATCH");
    if (input.expectedStateHash !== current.stateHash) return failure("STALE_STATE");
    if (actor.kind !== "human") return failure("HUMAN_REVIEW_REQUIRED");
    if (current.events.length >= MAX_MERGE_EVENTS) return failure("INVALID_TRANSITION");
    const lastAt = current.events.at(-1)?.at;
    if (lastAt && Date.parse(at) <= Date.parse(lastAt)) return failure("INVALID_TRANSITION");
    const survivor = current.members.find((member) => member.accountId === survivorAccountId);
    const retired = current.members.find((member) => member.accountId === retiredAccountId);
    if (!survivor || !retired) return failure("INVALID_TRANSITION");
    const evidenceSet = new Set([...survivor.observationRefs, ...retired.observationRefs]);
    if (evidenceObservationIds.some((id) => !evidenceSet.has(id))) return failure("INVALID_TRANSITION");
    if (!survivor.observationRefs.some((id) => evidenceObservationIds.includes(id))
      || !retired.observationRefs.some((id) => evidenceObservationIds.includes(id))) {
      return failure("INVALID_TRANSITION");
    }
    const lastPairEvent = [...current.events].reverse().find((event) => event.survivorAccountId === survivorAccountId
      && event.retiredAccountId === retiredAccountId);
    const valid = input.action === "merge"
      ? survivor.status === "active" && retired.status === "active"
      : survivor.status === "active" && retired.status === "merged"
        && retired.redirectToAccountId === survivorAccountId && lastPairEvent?.action === "merge";
    if (!valid) return failure("INVALID_TRANSITION");
    const members = current.members.map((member): AccountMergeMember => {
      if (member.accountId === survivorAccountId) return Object.freeze({ ...member, version: member.version + 1 });
      if (member.accountId === retiredAccountId) return Object.freeze({
        ...member,
        version: member.version + 1,
        status: input.action === "merge" ? "merged" : "active",
        redirectToAccountId: input.action === "merge" ? survivorAccountId : null,
      });
      return member;
    }).sort((left, right) => compare(left.accountId, right.accountId));
    const eventPayload = Object.freeze({
      tenantId,
      workspaceId,
      action: input.action,
      survivorAccountId,
      retiredAccountId,
      evidenceObservationIds,
      actor: Object.freeze({ kind: "human" as const, actorId }),
      at,
      reason,
    });
    const event: AccountMergeEvent = Object.freeze({
      ...eventPayload,
      eventId: `account-merge-event:${sha256(eventPayload).slice("sha256:".length)}`,
    });
    const snapshot = createMergeSnapshot(scope, members, Object.freeze([...current.events, event]));
    return Object.freeze({ ok: true, code: "ACCOUNT_MERGE_TRANSITIONED", snapshot });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
