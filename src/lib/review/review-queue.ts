import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export const REVIEW_QUEUE_VERSION = 1 as const;

type Scope = Readonly<{ tenantId: string; workspaceId: string }>;
type HumanActor = Readonly<{ kind: "human"; actorId: string }>;
type ReviewKind = "ambiguous_account_resolution" | "qualification_review" | "buying_center_review";
type ReviewStatus = "queued" | "claimed" | "resolved";
type ReviewPriority = "low" | "normal" | "high" | "urgent";

export type ReviewQueueSubject = Readonly<{
  subjectId: string;
  versionId: string;
  contentHash: string;
}>;

export type ReviewResolution = Readonly<{
  decision: "confirmed" | "dismissed" | "changes_requested";
  note: string;
  resolvedBy: string;
  resolvedAt: string;
}>;

export type ReviewQueueItem = Readonly<{
  itemVersion: 1;
  itemId: string;
  kind: ReviewKind;
  subject: ReviewQueueSubject;
  priority: ReviewPriority;
  reason: string;
  uncertaintyIds: readonly string[];
  status: ReviewStatus;
  claimedBy: string | null;
  leaseExpiresAt: string | null;
  resolution: ReviewResolution | null;
  enqueuedAt: string;
  updatedAt: string;
}>;

export type ReviewQueueEvent = Readonly<{
  sequence: number;
  action: "enqueue" | "claim" | "release" | "resolve";
  itemId: string;
  fromStatus: ReviewStatus | null;
  to: ReviewQueueItem;
  actor: HumanActor | null;
  at: string;
  reason: string;
}>;

export type ReviewQueue = Scope & Readonly<{
  queueVersion: typeof REVIEW_QUEUE_VERSION;
  queueId: string;
  createdAt: string;
  items: readonly ReviewQueueItem[];
  events: readonly ReviewQueueEvent[];
  queueHash: string;
}>;

export type ReviewQueueResult =
  | Readonly<{ ok: true; code:
    | "REVIEW_QUEUE_CREATED"
    | "REVIEW_ITEM_ENQUEUED"
    | "REVIEW_ITEM_REPLAYED"
    | "REVIEW_ITEM_CLAIMED"
    | "REVIEW_ITEM_RELEASED"
    | "REVIEW_ITEM_RESOLVED"; queue: ReviewQueue }>
  | Readonly<{ ok: false; code:
    | "MALFORMED_INPUT"
    | "NOT_FOUND_OR_STALE"
    | "STALE_QUEUE"
    | "DUPLICATE_ITEM"
    | "INVALID_TRANSITION"
    | "INVALID_CHRONOLOGY"
    | "BOUNDS_EXCEEDED"
    | "HUMAN_ACTOR_REQUIRED" }>;

type PlainRecord = Record<string, unknown>;

const CREATE_FIELDS = ["version", "tenantId", "workspaceId", "createdAt"] as const;
const ENQUEUE_FIELDS = ["version", "tenantId", "workspaceId", "current", "expectedQueueHash", "item", "at"] as const;
const ENQUEUE_ITEM_FIELDS = ["itemVersion", "kind", "subject", "priority", "reason", "uncertaintyIds"] as const;
const TRANSITION_FIELDS = [
  "version", "tenantId", "workspaceId", "current", "expectedQueueHash", "itemId", "action", "actor", "at",
  "reason", "leaseExpiresAt", "resolution",
] as const;
const QUEUE_FIELDS = [
  "queueVersion", "queueId", "tenantId", "workspaceId", "createdAt", "items", "events", "queueHash",
] as const;
const ITEM_FIELDS = [
  "itemVersion", "itemId", "kind", "subject", "priority", "reason", "uncertaintyIds", "status", "claimedBy",
  "leaseExpiresAt", "resolution", "enqueuedAt", "updatedAt",
] as const;
const SUBJECT_FIELDS = ["subjectId", "versionId", "contentHash"] as const;
const EVENT_FIELDS = ["sequence", "action", "itemId", "fromStatus", "to", "actor", "at", "reason"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const RESOLUTION_INPUT_FIELDS = ["decision", "note"] as const;
const RESOLUTION_FIELDS = ["decision", "note", "resolvedBy", "resolvedAt"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._/@-]{0,299}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const ITEM_ID = /^review-item:[0-9a-f]{64}$/u;
const QUEUE_ID = /^review-queue:[0-9a-f]{64}$/u;
const MAX_ITEMS = 1_000;
const MAX_EVENTS = 2_000;
const MAX_UNCERTAINTIES = 16;
const MAX_LEASE_MS = 24 * 60 * 60 * 1_000;
const KINDS = new Set<ReviewKind>([
  "ambiguous_account_resolution", "qualification_review", "buying_center_review",
]);
const PRIORITIES = new Set<ReviewPriority>(["low", "normal", "high", "urgent"]);
const STATUSES = new Set<ReviewStatus>(["queued", "claimed", "resolved"]);
const PRIORITY_RANK: Readonly<Record<ReviewPriority, number>> = Object.freeze({ low: 0, normal: 1, high: 2, urgent: 3 });

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

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return null;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value ? value : null;
}

function wellFormed(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function text(value: unknown, maximum = 2_000): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum && value === value.trim()
    && wellFormed(value) && value === value.normalize("NFKC")
    && !/[\u0000-\u001f\u007f-\u009f]|\p{Default_Ignorable_Code_Point}/u.test(value) ? value : null;
}

function reference(value: unknown): string | null {
  return typeof value === "string" && REF.test(value) ? value : null;
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
    ? value : null;
}

function scope(record: PlainRecord): Scope | null {
  return typeof record.tenantId === "string" && UUID.test(record.tenantId)
    && typeof record.workspaceId === "string" && UUID.test(record.workspaceId)
    ? Object.freeze({ tenantId: record.tenantId, workspaceId: record.workspaceId }) : null;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId && left.workspaceId === right.workspaceId;
}

function actor(value: unknown): HumanActor | null {
  const record = exactRecord(value, ACTOR_FIELDS);
  const actorId = record && typeof record.actorId === "string" && UUID.test(record.actorId) ? record.actorId : null;
  return record && record.kind === "human" && actorId ? Object.freeze({ kind: "human" as const, actorId }) : null;
}

function subject(value: unknown): ReviewQueueSubject | null {
  const record = exactRecord(value, SUBJECT_FIELDS);
  const subjectId = record && reference(record.subjectId);
  const versionId = record && reference(record.versionId);
  const contentHash = record && typeof record.contentHash === "string" && HASH.test(record.contentHash)
    ? record.contentHash : null;
  return record && subjectId && versionId && contentHash ? Object.freeze({ subjectId, versionId, contentHash }) : null;
}

function uncertainties(value: unknown): readonly string[] | null {
  const items = exactArray(value, MAX_UNCERTAINTIES);
  if (!items) return null;
  const output: string[] = [];
  for (const item of items) {
    const id = reference(item);
    if (!id || output.includes(id)) return null;
    output.push(id);
  }
  output.sort();
  return Object.freeze(output);
}

function resolution(value: unknown): ReviewResolution | null | undefined {
  if (value === null) return null;
  const record = exactRecord(value, RESOLUTION_FIELDS);
  const decision = record?.decision === "confirmed" || record?.decision === "dismissed"
    || record?.decision === "changes_requested" ? record.decision : null;
  const note = record && text(record.note);
  const resolvedBy = record && typeof record.resolvedBy === "string" && UUID.test(record.resolvedBy)
    ? record.resolvedBy : null;
  const resolvedAt = record && timestamp(record.resolvedAt);
  return record && decision && note && resolvedBy && resolvedAt
    ? Object.freeze({ decision, note, resolvedBy, resolvedAt }) : undefined;
}

function parseItem(value: unknown): ReviewQueueItem | null {
  const record = exactRecord(value, ITEM_FIELDS);
  const itemId = record && typeof record.itemId === "string" && ITEM_ID.test(record.itemId) ? record.itemId : null;
  const kind = record && typeof record.kind === "string" && KINDS.has(record.kind as ReviewKind)
    ? record.kind as ReviewKind : null;
  const itemSubject = record && subject(record.subject);
  const priority = record && typeof record.priority === "string" && PRIORITIES.has(record.priority as ReviewPriority)
    ? record.priority as ReviewPriority : null;
  const itemReason = record && text(record.reason);
  const uncertaintyIds = record && uncertainties(record.uncertaintyIds);
  const status = record && typeof record.status === "string" && STATUSES.has(record.status as ReviewStatus)
    ? record.status as ReviewStatus : null;
  const claimedBy = record?.claimedBy === null ? null
    : record && typeof record.claimedBy === "string" && UUID.test(record.claimedBy) ? record.claimedBy : undefined;
  const leaseExpiresAt = record?.leaseExpiresAt === null ? null : record && timestamp(record.leaseExpiresAt) || undefined;
  const itemResolution = record && resolution(record.resolution);
  const enqueuedAt = record && timestamp(record.enqueuedAt);
  const updatedAt = record && timestamp(record.updatedAt);
  if (!record || record.itemVersion !== 1 || !itemId || !kind || !itemSubject || !priority || !itemReason
    || !uncertaintyIds || !status || claimedBy === undefined || leaseExpiresAt === undefined
    || itemResolution === undefined || !enqueuedAt || !updatedAt || Date.parse(updatedAt) < Date.parse(enqueuedAt)) return null;
  if ((status === "queued" && (claimedBy !== null || leaseExpiresAt !== null || itemResolution !== null))
    || (status === "claimed" && (!claimedBy || !leaseExpiresAt || itemResolution !== null))
    || (status === "resolved" && (!claimedBy || leaseExpiresAt !== null || !itemResolution
      || itemResolution.resolvedBy !== claimedBy || itemResolution.resolvedAt !== updatedAt))) return null;
  const idPayload = Object.freeze({ kind, subject: itemSubject });
  if (itemId !== `review-item:${sha256(idPayload).slice("sha256:".length)}`) return null;
  return Object.freeze({ itemVersion: 1, itemId, kind, subject: itemSubject, priority, reason: itemReason,
    uncertaintyIds, status, claimedBy, leaseExpiresAt, resolution: itemResolution, enqueuedAt, updatedAt });
}

function sameMetadata(left: ReviewQueueItem, right: ReviewQueueItem): boolean {
  return left.itemId === right.itemId && left.kind === right.kind && JSON.stringify(left.subject) === JSON.stringify(right.subject)
    && left.priority === right.priority && left.reason === right.reason
    && JSON.stringify(left.uncertaintyIds) === JSON.stringify(right.uncertaintyIds)
    && left.enqueuedAt === right.enqueuedAt;
}

function orderedItems(items: Iterable<ReviewQueueItem>): readonly ReviewQueueItem[] {
  return Object.freeze([...items].sort((left, right) => PRIORITY_RANK[right.priority] - PRIORITY_RANK[left.priority]
    || (left.enqueuedAt < right.enqueuedAt ? -1 : left.enqueuedAt > right.enqueuedAt ? 1
      : left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0)));
}

function buildQueue(payload: Omit<ReviewQueue, "queueHash">): ReviewQueue {
  return Object.freeze({ ...payload, queueHash: sha256(payload) });
}

function parseQueue(value: unknown): ReviewQueue | null {
  const record = exactRecord(value, QUEUE_FIELDS);
  const queueScope = record && scope(record);
  const queueId = record && typeof record.queueId === "string" && QUEUE_ID.test(record.queueId) ? record.queueId : null;
  const createdAt = record && timestamp(record.createdAt);
  const itemInputs = record && exactArray(record.items, MAX_ITEMS);
  const eventInputs = record && exactArray(record.events, MAX_EVENTS);
  const queueHash = record && typeof record.queueHash === "string" && HASH.test(record.queueHash) ? record.queueHash : null;
  if (!record || record.queueVersion !== 1 || !queueScope || !queueId || !createdAt || !itemInputs || !eventInputs
    || !queueHash) return null;
  const suppliedItems = itemInputs.map(parseItem);
  if (suppliedItems.some((item) => !item)) return null;
  const replay = new Map<string, ReviewQueueItem>();
  const events: ReviewQueueEvent[] = [];
  let lastAt = createdAt;
  for (let index = 0; index < eventInputs.length; index += 1) {
    const raw = exactRecord(eventInputs[index], EVENT_FIELDS);
    const sequence = raw && integer(raw.sequence, 1, MAX_EVENTS);
    const action = raw?.action === "enqueue" || raw?.action === "claim" || raw?.action === "release"
      || raw?.action === "resolve" ? raw.action : null;
    const itemId = raw && typeof raw.itemId === "string" && ITEM_ID.test(raw.itemId) ? raw.itemId : null;
    const fromStatus = raw?.fromStatus === null ? null
      : raw && typeof raw.fromStatus === "string" && STATUSES.has(raw.fromStatus as ReviewStatus)
        ? raw.fromStatus as ReviewStatus : undefined;
    const to = raw && parseItem(raw.to);
    const eventActor = raw?.actor === null ? null : raw ? actor(raw.actor) : null;
    const at = raw && timestamp(raw.at);
    const eventReason = raw && text(raw.reason);
    const previous = itemId ? replay.get(itemId) : undefined;
    if (!raw || sequence !== index + 1 || !action || !itemId || fromStatus === undefined || !to || !at || !eventReason
      || to.itemId !== itemId || Date.parse(at) <= Date.parse(lastAt) || to.updatedAt !== at) return null;
    if (action === "enqueue") {
      if (previous || fromStatus !== null || eventActor !== null || to.status !== "queued"
        || to.enqueuedAt !== at || to.reason !== eventReason || replay.size >= MAX_ITEMS) return null;
    } else {
      if (!previous || fromStatus !== previous.status || !eventActor || !sameMetadata(previous, to)) return null;
      if (action === "claim") {
        const claimable = previous.status === "queued" || (previous.status === "claimed" && previous.leaseExpiresAt
          && Date.parse(at) >= Date.parse(previous.leaseExpiresAt));
        if (!claimable || to.status !== "claimed" || to.claimedBy !== eventActor.actorId || !to.leaseExpiresAt
          || Date.parse(to.leaseExpiresAt) <= Date.parse(at)
          || Date.parse(to.leaseExpiresAt) - Date.parse(at) > MAX_LEASE_MS) return null;
      } else if (action === "release") {
        if (previous.status !== "claimed" || previous.claimedBy !== eventActor.actorId || !previous.leaseExpiresAt
          || Date.parse(at) >= Date.parse(previous.leaseExpiresAt) || to.status !== "queued") return null;
      } else if (action === "resolve") {
        if (previous.status !== "claimed" || previous.claimedBy !== eventActor.actorId || !previous.leaseExpiresAt
          || Date.parse(at) >= Date.parse(previous.leaseExpiresAt) || to.status !== "resolved"
          || to.resolution?.resolvedBy !== eventActor.actorId || to.resolution.resolvedAt !== at) return null;
      }
    }
    replay.set(itemId, to);
    events.push(Object.freeze({ sequence, action, itemId, fromStatus, to, actor: eventActor, at, reason: eventReason }));
    lastAt = at;
  }
  const items = orderedItems(replay.values());
  if (JSON.stringify(items) !== JSON.stringify(suppliedItems)) return null;
  const idHash = sha256({ ...queueScope, createdAt });
  if (queueId !== `review-queue:${idHash.slice("sha256:".length)}`) return null;
  const parsed = buildQueue(Object.freeze({ queueVersion: 1, queueId, ...queueScope, createdAt,
    items, events: Object.freeze(events) }));
  return parsed.queueHash === queueHash ? parsed : null;
}

function failure(code: Extract<ReviewQueueResult, { ok: false }>["code"]): ReviewQueueResult {
  return Object.freeze({ ok: false, code });
}

export function createReviewQueue(value: unknown): ReviewQueueResult {
  try {
    const input = exactRecord(value, CREATE_FIELDS);
    if (!input || input.version !== REVIEW_QUEUE_VERSION) return failure("MALFORMED_INPUT");
    const queueScope = scope(input);
    const createdAt = timestamp(input.createdAt);
    if (!queueScope || !createdAt) return failure("MALFORMED_INPUT");
    const idHash = sha256({ ...queueScope, createdAt });
    const queue = buildQueue(Object.freeze({ queueVersion: REVIEW_QUEUE_VERSION,
      queueId: `review-queue:${idHash.slice("sha256:".length)}`, ...queueScope, createdAt,
      items: Object.freeze([]), events: Object.freeze([]) }));
    return Object.freeze({ ok: true, code: "REVIEW_QUEUE_CREATED", queue });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

export function enqueueReviewQueueItem(value: unknown): ReviewQueueResult {
  try {
    const input = exactRecord(value, ENQUEUE_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const inputScope = scope(input);
    const current = parseQueue(input.current);
    const expectedQueueHash = typeof input.expectedQueueHash === "string" && HASH.test(input.expectedQueueHash)
      ? input.expectedQueueHash : null;
    const itemInput = exactRecord(input.item, ENQUEUE_ITEM_FIELDS);
    const kind = itemInput && typeof itemInput.kind === "string" && KINDS.has(itemInput.kind as ReviewKind)
      ? itemInput.kind as ReviewKind : null;
    const itemSubject = itemInput && subject(itemInput.subject);
    const priority = itemInput && typeof itemInput.priority === "string" && PRIORITIES.has(itemInput.priority as ReviewPriority)
      ? itemInput.priority as ReviewPriority : null;
    const itemReason = itemInput && text(itemInput.reason);
    const uncertaintyIds = itemInput && uncertainties(itemInput.uncertaintyIds);
    const at = timestamp(input.at);
    if (!inputScope || !current || !expectedQueueHash || !itemInput || itemInput.itemVersion !== 1 || !kind
      || !itemSubject || !priority || !itemReason || !uncertaintyIds || !at) return failure("MALFORMED_INPUT");
    if (!sameScope(inputScope, current)) return failure("NOT_FOUND_OR_STALE");
    if (current.queueHash !== expectedQueueHash) return failure("STALE_QUEUE");
    const idHash = sha256({ kind, subject: itemSubject });
    const itemId = `review-item:${idHash.slice("sha256:".length)}`;
    const existing = current.items.find((item) => item.itemId === itemId);
    if (existing) {
      const same = existing.kind === kind && JSON.stringify(existing.subject) === JSON.stringify(itemSubject)
        && existing.priority === priority && existing.reason === itemReason
        && JSON.stringify(existing.uncertaintyIds) === JSON.stringify(uncertaintyIds);
      return same ? Object.freeze({ ok: true, code: "REVIEW_ITEM_REPLAYED", queue: current })
        : failure("DUPLICATE_ITEM");
    }
    const lastAt = current.events.at(-1)?.at ?? current.createdAt;
    if (Date.parse(at) <= Date.parse(lastAt)) return failure("INVALID_CHRONOLOGY");
    if (current.items.length >= MAX_ITEMS || current.events.length >= MAX_EVENTS) return failure("BOUNDS_EXCEEDED");
    const item: ReviewQueueItem = Object.freeze({ itemVersion: 1, itemId, kind, subject: itemSubject, priority,
      reason: itemReason, uncertaintyIds, status: "queued", claimedBy: null, leaseExpiresAt: null,
      resolution: null, enqueuedAt: at, updatedAt: at });
    const event: ReviewQueueEvent = Object.freeze({ sequence: current.events.length + 1, action: "enqueue",
      itemId, fromStatus: null, to: item, actor: null, at, reason: itemReason });
    const queue = buildQueue(Object.freeze({ queueVersion: 1, queueId: current.queueId, ...inputScope,
      createdAt: current.createdAt, items: orderedItems([...current.items, item]),
      events: Object.freeze([...current.events, event]) }));
    return Object.freeze({ ok: true, code: "REVIEW_ITEM_ENQUEUED", queue });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}

export function transitionReviewQueueItem(value: unknown): ReviewQueueResult {
  try {
    const input = exactRecord(value, TRANSITION_FIELDS);
    if (!input || input.version !== 1) return failure("MALFORMED_INPUT");
    const inputScope = scope(input);
    const current = parseQueue(input.current);
    const expectedQueueHash = typeof input.expectedQueueHash === "string" && HASH.test(input.expectedQueueHash)
      ? input.expectedQueueHash : null;
    const itemId = typeof input.itemId === "string" && ITEM_ID.test(input.itemId) ? input.itemId : null;
    const action = input.action === "claim" || input.action === "release" || input.action === "resolve"
      ? input.action : null;
    const eventActor = actor(input.actor);
    const at = timestamp(input.at);
    const eventReason = text(input.reason);
    if (!inputScope || !current || !expectedQueueHash || !itemId || !action || !at || !eventReason) {
      return failure("MALFORMED_INPUT");
    }
    if (!eventActor) return failure("HUMAN_ACTOR_REQUIRED");
    const itemIndex = current.items.findIndex((item) => item.itemId === itemId);
    if (!sameScope(inputScope, current) || itemIndex < 0) return failure("NOT_FOUND_OR_STALE");
    if (current.queueHash !== expectedQueueHash) return failure("STALE_QUEUE");
    if (current.events.length >= MAX_EVENTS) return failure("BOUNDS_EXCEEDED");
    const lastAt = current.events.at(-1)?.at ?? current.createdAt;
    if (Date.parse(at) <= Date.parse(lastAt)) return failure("INVALID_CHRONOLOGY");
    const item = current.items[itemIndex] as ReviewQueueItem;
    let next: ReviewQueueItem;
    if (action === "claim") {
      if (input.resolution !== null) return failure("MALFORMED_INPUT");
      const leaseExpiresAt = timestamp(input.leaseExpiresAt);
      if (!leaseExpiresAt) return failure("MALFORMED_INPUT");
      if (Date.parse(leaseExpiresAt) <= Date.parse(at)
        || Date.parse(leaseExpiresAt) - Date.parse(at) > MAX_LEASE_MS) return failure("BOUNDS_EXCEEDED");
      const claimable = item.status === "queued" || (item.status === "claimed" && item.leaseExpiresAt
        && Date.parse(at) >= Date.parse(item.leaseExpiresAt));
      if (!claimable) return failure("INVALID_TRANSITION");
      next = Object.freeze({ ...item, status: "claimed", claimedBy: eventActor.actorId,
        leaseExpiresAt, resolution: null, updatedAt: at });
    } else if (action === "release") {
      if (input.leaseExpiresAt !== null || input.resolution !== null) return failure("MALFORMED_INPUT");
      if (item.status !== "claimed" || item.claimedBy !== eventActor.actorId || !item.leaseExpiresAt
        || Date.parse(at) >= Date.parse(item.leaseExpiresAt)) return failure("INVALID_TRANSITION");
      next = Object.freeze({ ...item, status: "queued", claimedBy: null, leaseExpiresAt: null,
        resolution: null, updatedAt: at });
    } else {
      if (input.leaseExpiresAt !== null || item.status !== "claimed" || item.claimedBy !== eventActor.actorId
        || !item.leaseExpiresAt || Date.parse(at) >= Date.parse(item.leaseExpiresAt)) return failure("INVALID_TRANSITION");
      const rawResolution = exactRecord(input.resolution, RESOLUTION_INPUT_FIELDS);
      const decision = rawResolution?.decision === "confirmed" || rawResolution?.decision === "dismissed"
        || rawResolution?.decision === "changes_requested" ? rawResolution.decision : null;
      const note = rawResolution && text(rawResolution.note);
      if (!rawResolution || !decision || !note) return failure("MALFORMED_INPUT");
      const resolved = Object.freeze({ decision, note, resolvedBy: eventActor.actorId, resolvedAt: at });
      next = Object.freeze({ ...item, status: "resolved", claimedBy: eventActor.actorId,
        leaseExpiresAt: null, resolution: resolved, updatedAt: at });
    }
    const event: ReviewQueueEvent = Object.freeze({ sequence: current.events.length + 1, action, itemId,
      fromStatus: item.status, to: next, actor: eventActor, at, reason: eventReason });
    const items = current.items.map((candidate, index) => index === itemIndex ? next : candidate);
    const queue = buildQueue(Object.freeze({ queueVersion: 1, queueId: current.queueId, ...inputScope,
      createdAt: current.createdAt, items: orderedItems(items), events: Object.freeze([...current.events, event]) }));
    const code = action === "claim" ? "REVIEW_ITEM_CLAIMED" : action === "release"
      ? "REVIEW_ITEM_RELEASED" : "REVIEW_ITEM_RESOLVED";
    return Object.freeze({ ok: true, code, queue });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
