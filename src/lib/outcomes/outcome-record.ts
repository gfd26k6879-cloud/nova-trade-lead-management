import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export const OUTCOME_RECORD_SCHEMA_VERSION = 1 as const;

type Scope = Readonly<{
  tenantId: string;
  workspaceId: string;
  accountId: string;
  playVersionId: string;
}>;

export type OutcomeTaxonomy =
  | "copied"
  | "exported"
  | "sent_manually"
  | "delivery_unknown"
  | "bounced"
  | "unknown_bounce"
  | "opted_out"
  | "complaint"
  | "replied"
  | "meeting_set"
  | "opportunity"
  | "won"
  | "lost"
  | "not_interested"
  | "unknown";

export type OutcomeSource = Readonly<{
  sourceVersion: 1;
  tenantId: string;
  workspaceId: string;
  accountId: string;
  kind: "member_observation" | "approved_import";
  sourceId: string;
  sourceVersionId: string;
  sourceContentHash: string;
  sourceReceiptHash: string;
  observedAt: string;
  sourceHash: string;
}>;

export type OutreachDraftVersionRef = Scope & Readonly<{
  draftRefVersion: 1;
  versionId: string;
  contentHash: string;
  reviewHash: string;
  draftRefHash: string;
}>;

export type OutcomeAttributionEvidenceRef = Readonly<{
  kind: "play_version" | "outreach_draft_version" | "source_receipt";
  refId: string;
  refHash: string;
}>;

export type OutcomeAttribution = Readonly<{
  kind: "direct" | "assisted" | "unknown";
  confidenceBasisPoints: number;
  rationale: string;
  attributedAt: string;
  evidenceRefs: readonly OutcomeAttributionEvidenceRef[];
}>;

type HumanActor = Readonly<{ kind: "human"; actorId: string }>;

export type OutcomeAuditEvent = Readonly<{
  action: "recorded" | "corrected";
  revision: number;
  supersedesVersionId: string | null;
  actor: HumanActor;
  at: string;
  reason: string;
  eventHash: string;
}>;

export type OutcomeRecord = Scope & Readonly<{
  schemaVersion: typeof OUTCOME_RECORD_SCHEMA_VERSION;
  versionId: string;
  versionHash: string;
  stableKey: string;
  revision: number;
  supersedesVersionId: string | null;
  outcome: OutcomeTaxonomy;
  channel: "email" | "phone" | "sms" | "social" | "in_person" | "other" | "none";
  bounceClassification: "hard_bounce" | "soft_bounce" | "unknown_bounce" | null;
  occurredAt: string;
  recordedAt: string;
  notes: string;
  source: OutcomeSource;
  recordedBy: HumanActor;
  outreachDraftVersionRef: OutreachDraftVersionRef | null;
  attribution: OutcomeAttribution;
  audit: readonly OutcomeAuditEvent[];
  contentHash: string;
}>;

export type OutcomeFailureCode =
  | "MALFORMED_INPUT"
  | "SCOPE_MISMATCH"
  | "VERSION_CONFLICT"
  | "INVALID_CHRONOLOGY"
  | "HUMAN_CORRECTION_REQUIRED";

export type OutcomeRecordResult = Readonly<
  | { ok: true; code: "OUTCOME_RECORDED" | "OUTCOME_CORRECTED"; record: OutcomeRecord }
  | { ok: false; code: OutcomeFailureCode }
>;

type PlainRecord = Record<string, unknown>;
type ParseResult<T> = Readonly<{ value: T | null; code: OutcomeFailureCode | null }>;

const INPUT_FIELDS = [
  "version", "tenantId", "workspaceId", "accountId", "playVersionId", "stableKey", "revision", "predecessor",
  "outcome", "channel", "bounceClassification", "occurredAt", "recordedAt", "notes", "source", "recordedBy",
  "outreachDraftVersionRef", "attribution", "correction",
] as const;
const RECORD_FIELDS = [
  "schemaVersion", "versionId", "versionHash", "tenantId", "workspaceId", "accountId", "playVersionId", "stableKey",
  "revision", "supersedesVersionId", "outcome", "channel", "bounceClassification", "occurredAt", "recordedAt",
  "notes", "source", "recordedBy", "outreachDraftVersionRef", "attribution", "audit", "contentHash",
] as const;
const SOURCE_FIELDS = [
  "sourceVersion", "tenantId", "workspaceId", "accountId", "kind", "sourceId", "sourceVersionId",
  "sourceContentHash", "sourceReceiptHash", "observedAt", "sourceHash",
] as const;
const DRAFT_FIELDS = [
  "draftRefVersion", "tenantId", "workspaceId", "accountId", "playVersionId", "versionId", "contentHash",
  "reviewHash", "draftRefHash",
] as const;
const ATTRIBUTION_FIELDS = ["kind", "confidenceBasisPoints", "rationale", "attributedAt", "evidenceRefs"] as const;
const ATTRIBUTION_REF_FIELDS = ["kind", "refId", "refHash"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;
const CORRECTION_FIELDS = ["kind", "actorId", "at", "reason"] as const;
const AUDIT_FIELDS = ["action", "revision", "supersedesVersionId", "actor", "at", "reason", "eventHash"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,299}$/u;
const HASH = /^sha256:[0-9a-f]{64}$/u;
const PLAY_VERSION = /^lead-play-version:[0-9a-f]{64}$/u;
const DRAFT_VERSION = /^outreach-draft-version:[0-9a-f]{64}$/u;
const OUTCOME_VERSION = /^outcome-version:[0-9a-f]{64}$/u;
const TAXONOMY = new Set<OutcomeTaxonomy>([
  "copied", "exported", "sent_manually", "delivery_unknown", "bounced", "unknown_bounce", "opted_out",
  "complaint", "replied", "meeting_set", "opportunity", "won", "lost", "not_interested", "unknown",
]);
const CHANNELS = new Set(["email", "phone", "sms", "social", "in_person", "other", "none"]);
const ATTRIBUTION_KINDS = new Set(["direct", "assisted", "unknown"]);
const ATTRIBUTION_REF_KINDS = new Set(["play_version", "outreach_draft_version", "source_receipt"]);
const MAX_ATTRIBUTION_REFS = 20;
const MAX_AUDIT_EVENTS = 100;

function failure(code: OutcomeFailureCode): OutcomeRecordResult {
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

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  if (!Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) return null;
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
    || typeof accountId !== "string" || !UUID.test(accountId) || typeof playVersionId !== "string"
    || !PLAY_VERSION.test(playVersionId)) return null;
  return { tenantId, workspaceId, accountId, playVersionId };
}

function sameScope(a: Scope, b: Scope): boolean {
  return a.tenantId === b.tenantId && a.workspaceId === b.workspaceId && a.accountId === b.accountId
    && a.playVersionId === b.playVersionId;
}

function sameSourceScope(scope: Scope, source: OutcomeSource): boolean {
  return scope.tenantId === source.tenantId && scope.workspaceId === source.workspaceId
    && scope.accountId === source.accountId;
}

function parseActor(value: unknown): HumanActor | null {
  const record = exactRecord(value, ACTOR_FIELDS);
  if (!record || record.kind !== "human" || typeof record.actorId !== "string" || !UUID.test(record.actorId)) return null;
  return deepFreeze({ kind: "human", actorId: record.actorId });
}

function parseSource(value: unknown): OutcomeSource | null {
  const record = exactRecord(value, SOURCE_FIELDS);
  const tenantId = record && typeof record.tenantId === "string" && UUID.test(record.tenantId) ? record.tenantId : null;
  const workspaceId = record && typeof record.workspaceId === "string" && UUID.test(record.workspaceId)
    ? record.workspaceId : null;
  const accountId = record && typeof record.accountId === "string" && UUID.test(record.accountId) ? record.accountId : null;
  if (!record || record.sourceVersion !== 1 || (record.kind !== "member_observation" && record.kind !== "approved_import")
    || !tenantId || !workspaceId || !accountId || !safeRef(record.sourceId) || !safeRef(record.sourceVersionId)
    || typeof record.sourceContentHash !== "string" || !HASH.test(record.sourceContentHash)
    || typeof record.sourceReceiptHash !== "string" || !HASH.test(record.sourceReceiptHash)
    || !safeDate(record.observedAt) || typeof record.sourceHash !== "string" || !HASH.test(record.sourceHash)) return null;
  const payload = {
    sourceVersion: 1 as const,
    tenantId,
    workspaceId,
    accountId,
    kind: record.kind as OutcomeSource["kind"],
    sourceId: record.sourceId,
    sourceVersionId: record.sourceVersionId,
    sourceContentHash: record.sourceContentHash,
    sourceReceiptHash: record.sourceReceiptHash,
    observedAt: record.observedAt,
  };
  if (hashJson(payload) !== record.sourceHash) return null;
  return deepFreeze({ ...payload, sourceHash: record.sourceHash });
}

function parseDraftRef(value: unknown, scope: Scope): ParseResult<OutreachDraftVersionRef> {
  const record = exactRecord(value, DRAFT_FIELDS);
  if (!record || record.draftRefVersion !== 1) return { value: null, code: "MALFORMED_INPUT" };
  const draftScope = parseScope(record);
  if (!draftScope) return { value: null, code: "MALFORMED_INPUT" };
  if (!sameScope(scope, draftScope)) return { value: null, code: "SCOPE_MISMATCH" };
  if (typeof record.versionId !== "string" || !DRAFT_VERSION.test(record.versionId)
    || typeof record.contentHash !== "string" || !HASH.test(record.contentHash)
    || typeof record.reviewHash !== "string" || !HASH.test(record.reviewHash)
    || typeof record.draftRefHash !== "string" || !HASH.test(record.draftRefHash)) {
    return { value: null, code: "MALFORMED_INPUT" };
  }
  const payload = {
    draftRefVersion: 1 as const,
    ...draftScope,
    versionId: record.versionId,
    contentHash: record.contentHash,
    reviewHash: record.reviewHash,
  };
  if (hashJson(payload) !== record.draftRefHash) return { value: null, code: "MALFORMED_INPUT" };
  return { value: deepFreeze({ ...payload, draftRefHash: record.draftRefHash }), code: null };
}

function parseAttributionRef(value: unknown): OutcomeAttributionEvidenceRef | null {
  const record = exactRecord(value, ATTRIBUTION_REF_FIELDS);
  if (!record || typeof record.kind !== "string" || !ATTRIBUTION_REF_KINDS.has(record.kind) || !safeRef(record.refId)
    || typeof record.refHash !== "string" || !HASH.test(record.refHash)) return null;
  return deepFreeze({
    kind: record.kind as OutcomeAttributionEvidenceRef["kind"],
    refId: record.refId,
    refHash: record.refHash,
  });
}

function parseAttribution(
  value: unknown,
  occurredAt: string,
  recordedAt: string,
  scope: Scope,
  draftRef: OutreachDraftVersionRef | null,
): OutcomeAttribution | null {
  const record = exactRecord(value, ATTRIBUTION_FIELDS);
  if (!record || typeof record.kind !== "string" || !ATTRIBUTION_KINDS.has(record.kind)
    || !Number.isSafeInteger(record.confidenceBasisPoints) || (record.confidenceBasisPoints as number) < 0
    || (record.confidenceBasisPoints as number) > 10_000 || !safeText(record.rationale)
    || !safeDate(record.attributedAt) || record.attributedAt < occurredAt || record.attributedAt > recordedAt) return null;
  const rawRefs = exactArray(record.evidenceRefs, MAX_ATTRIBUTION_REFS);
  if (!rawRefs) return null;
  const evidenceRefs: OutcomeAttributionEvidenceRef[] = [];
  for (const candidate of rawRefs) {
    const parsed = parseAttributionRef(candidate);
    if (!parsed) return null;
    evidenceRefs.push(parsed);
  }
  const identities = evidenceRefs.map((entry) => `${entry.kind}\u0000${entry.refId}\u0000${entry.refHash}`);
  if (new Set(identities).size !== identities.length) return null;
  if (record.kind === "unknown") {
    if (record.confidenceBasisPoints !== 0 || evidenceRefs.length !== 0) return null;
  } else if ((record.confidenceBasisPoints as number) < 1 || evidenceRefs.length < 1) return null;
  for (const evidence of evidenceRefs) {
    if (evidence.kind === "play_version" && evidence.refId !== scope.playVersionId) return null;
    if (evidence.kind === "outreach_draft_version"
      && (!draftRef || evidence.refId !== draftRef.versionId || evidence.refHash !== draftRef.draftRefHash)) return null;
  }
  return deepFreeze({
    kind: record.kind as OutcomeAttribution["kind"],
    confidenceBasisPoints: record.confidenceBasisPoints as number,
    rationale: record.rationale,
    attributedAt: record.attributedAt,
    evidenceRefs,
  });
}

function auditEventPayload(event: Omit<OutcomeAuditEvent, "eventHash">): unknown {
  return event;
}

function parseAudit(value: unknown, revision: number, supersedesVersionId: string | null, recordedAt: string): readonly OutcomeAuditEvent[] | null {
  const rawEvents = exactArray(value, MAX_AUDIT_EVENTS);
  if (!rawEvents || rawEvents.length !== revision) return null;
  const events: OutcomeAuditEvent[] = [];
  let lastAt = "0000-01-01T00:00:00.000Z";
  for (let index = 0; index < rawEvents.length; index += 1) {
    const record = exactRecord(rawEvents[index], AUDIT_FIELDS);
    const actor = record ? parseActor(record.actor) : null;
    const expectedAction = index === 0 ? "recorded" : "corrected";
    if (!record || !actor || record.action !== expectedAction || record.revision !== index + 1
      || (index === 0 ? record.supersedesVersionId !== null : typeof record.supersedesVersionId !== "string"
        || !OUTCOME_VERSION.test(record.supersedesVersionId))
      || !safeDate(record.at) || record.at <= lastAt || !safeText(record.reason, 1_000)
      || typeof record.eventHash !== "string" || !HASH.test(record.eventHash)) return null;
    const payload: Omit<OutcomeAuditEvent, "eventHash"> = {
      action: expectedAction,
      revision: index + 1,
      supersedesVersionId: record.supersedesVersionId as string | null,
      actor,
      at: record.at,
      reason: record.reason,
    };
    if (hashJson(auditEventPayload(payload)) !== record.eventHash) return null;
    events.push(deepFreeze({ ...payload, eventHash: record.eventHash }));
    lastAt = record.at;
  }
  if (events.at(-1)?.supersedesVersionId !== supersedesVersionId || events.at(-1)?.at !== recordedAt) return null;
  return deepFreeze(events);
}

function validTaxonomy(outcome: unknown, bounce: unknown): outcome is OutcomeTaxonomy {
  if (typeof outcome !== "string" || !TAXONOMY.has(outcome as OutcomeTaxonomy)) return false;
  if (outcome === "bounced") return bounce === "hard_bounce" || bounce === "soft_bounce";
  if (outcome === "unknown_bounce") return bounce === "unknown_bounce";
  return bounce === null;
}

function contentPayload(record: Pick<OutcomeRecord,
  "tenantId" | "workspaceId" | "accountId" | "playVersionId" | "stableKey" | "revision" | "supersedesVersionId"
  | "outcome" | "channel" | "bounceClassification" | "occurredAt" | "recordedAt" | "notes" | "source"
  | "recordedBy" | "outreachDraftVersionRef" | "attribution" | "audit">): unknown {
  return record;
}

function parseOutcomeRecord(value: unknown): OutcomeRecord | null {
  const record = exactRecord(value, RECORD_FIELDS);
  if (!record || record.schemaVersion !== OUTCOME_RECORD_SCHEMA_VERSION) return null;
  const scope = parseScope(record);
  const source = parseSource(record.source);
  const recordedBy = parseActor(record.recordedBy);
  if (!scope || !source || !recordedBy || typeof record.versionId !== "string" || !OUTCOME_VERSION.test(record.versionId)
    || typeof record.versionHash !== "string" || !HASH.test(record.versionHash) || !safeRef(record.stableKey)
    || !Number.isSafeInteger(record.revision) || (record.revision as number) < 1 || (record.revision as number) > MAX_AUDIT_EVENTS
    || (record.supersedesVersionId !== null && (typeof record.supersedesVersionId !== "string"
      || !OUTCOME_VERSION.test(record.supersedesVersionId))) || !validTaxonomy(record.outcome, record.bounceClassification)
    || typeof record.channel !== "string" || !CHANNELS.has(record.channel) || !safeDate(record.occurredAt)
    || !safeDate(record.recordedAt) || record.occurredAt > source.observedAt || source.observedAt > record.recordedAt
    || !safeText(record.notes) || typeof record.contentHash !== "string" || !HASH.test(record.contentHash)) return null;
  if (!sameSourceScope(scope, source)) return null;
  let draftRef: OutreachDraftVersionRef | null = null;
  if (record.outreachDraftVersionRef !== null) {
    const parsed = parseDraftRef(record.outreachDraftVersionRef, scope);
    if (!parsed.value) return null;
    draftRef = parsed.value;
  }
  const attribution = parseAttribution(record.attribution, record.occurredAt, record.recordedAt, scope, draftRef);
  const audit = parseAudit(record.audit, record.revision as number, record.supersedesVersionId as string | null, record.recordedAt);
  if (!attribution || !audit) return null;
  const base = {
    ...scope,
    stableKey: record.stableKey,
    revision: record.revision as number,
    supersedesVersionId: record.supersedesVersionId as string | null,
    outcome: record.outcome,
    channel: record.channel as OutcomeRecord["channel"],
    bounceClassification: record.bounceClassification as OutcomeRecord["bounceClassification"],
    occurredAt: record.occurredAt,
    recordedAt: record.recordedAt,
    notes: record.notes,
    source,
    recordedBy,
    outreachDraftVersionRef: draftRef,
    attribution,
    audit,
  };
  const contentHash = hashJson(contentPayload(base));
  const versionHash = hashJson({ schemaVersion: OUTCOME_RECORD_SCHEMA_VERSION, contentHash });
  if (contentHash !== record.contentHash || versionHash !== record.versionHash
    || record.versionId !== `outcome-version:${versionHash.slice(7)}`) return null;
  return deepFreeze({
    schemaVersion: OUTCOME_RECORD_SCHEMA_VERSION,
    versionId: record.versionId,
    versionHash,
    ...base,
    contentHash,
  });
}

function parseCorrection(value: unknown, recordedAt: string, recordedBy: HumanActor): ParseResult<Readonly<{
  kind: "human";
  actorId: string;
  at: string;
  reason: string;
}>> {
  const record = exactRecord(value, CORRECTION_FIELDS);
  if (!record) return { value: null, code: "MALFORMED_INPUT" };
  if (record.kind !== "human") return { value: null, code: "HUMAN_CORRECTION_REQUIRED" };
  if (typeof record.actorId !== "string" || !UUID.test(record.actorId) || record.actorId !== recordedBy.actorId
    || !safeDate(record.at) || record.at !== recordedAt || !safeText(record.reason, 1_000)) {
    return { value: null, code: "MALFORMED_INPUT" };
  }
  return {
    value: deepFreeze({ kind: "human", actorId: record.actorId, at: record.at, reason: record.reason }),
    code: null,
  };
}

/** Records an observation only; this function performs no delivery, suppression, policy, or learning mutation. */
export function buildOutcomeRecord(input: unknown): OutcomeRecordResult {
  const raw = exactRecord(input, INPUT_FIELDS);
  if (!raw || raw.version !== 1) return failure("MALFORMED_INPUT");
  const scope = parseScope(raw);
  const source = parseSource(raw.source);
  const recordedBy = parseActor(raw.recordedBy);
  if (!scope || !source || !recordedBy || !safeRef(raw.stableKey) || !Number.isSafeInteger(raw.revision)
    || (raw.revision as number) < 1 || (raw.revision as number) > MAX_AUDIT_EVENTS
    || !validTaxonomy(raw.outcome, raw.bounceClassification) || typeof raw.channel !== "string" || !CHANNELS.has(raw.channel)
    || !safeDate(raw.occurredAt) || !safeDate(raw.recordedAt) || !safeText(raw.notes)) return failure("MALFORMED_INPUT");
  if (!sameSourceScope(scope, source)) return failure("SCOPE_MISMATCH");
  if (raw.occurredAt > source.observedAt || source.observedAt > raw.recordedAt) return failure("INVALID_CHRONOLOGY");

  let draftRef: OutreachDraftVersionRef | null = null;
  if (raw.outreachDraftVersionRef !== null) {
    const parsed = parseDraftRef(raw.outreachDraftVersionRef, scope);
    if (!parsed.value) return failure(parsed.code ?? "MALFORMED_INPUT");
    draftRef = parsed.value;
  }
  const attribution = parseAttribution(raw.attribution, raw.occurredAt, raw.recordedAt, scope, draftRef);
  if (!attribution) return failure("MALFORMED_INPUT");

  let supersedesVersionId: string | null = null;
  let audit: readonly OutcomeAuditEvent[];
  if (raw.revision === 1) {
    if (raw.predecessor !== null) return failure("VERSION_CONFLICT");
    if (raw.correction !== null) return failure("VERSION_CONFLICT");
    const payload: Omit<OutcomeAuditEvent, "eventHash"> = {
      action: "recorded",
      revision: 1,
      supersedesVersionId: null,
      actor: recordedBy,
      at: raw.recordedAt,
      reason: "Outcome recorded from declared source.",
    };
    audit = deepFreeze([{ ...payload, eventHash: hashJson(auditEventPayload(payload)) }]);
  } else {
    const predecessor = parseOutcomeRecord(raw.predecessor);
    if (!predecessor) return failure("MALFORMED_INPUT");
    if (!sameScope(scope, predecessor)) return failure("SCOPE_MISMATCH");
    if (predecessor.stableKey !== raw.stableKey || raw.revision !== predecessor.revision + 1)
      return failure("VERSION_CONFLICT");
    if (raw.correction === null) return failure("HUMAN_CORRECTION_REQUIRED");
    if (predecessor.audit.length >= MAX_AUDIT_EVENTS) return failure("VERSION_CONFLICT");
    if (raw.recordedAt <= predecessor.recordedAt) return failure("INVALID_CHRONOLOGY");
    const correction = parseCorrection(raw.correction, raw.recordedAt, recordedBy);
    if (!correction.value) return failure(correction.code ?? "MALFORMED_INPUT");
    supersedesVersionId = predecessor.versionId;
    const payload: Omit<OutcomeAuditEvent, "eventHash"> = {
      action: "corrected",
      revision: raw.revision as number,
      supersedesVersionId,
      actor: recordedBy,
      at: raw.recordedAt,
      reason: correction.value.reason,
    };
    audit = deepFreeze([...predecessor.audit, { ...payload, eventHash: hashJson(auditEventPayload(payload)) }]);
  }

  const base = {
    ...scope,
    stableKey: raw.stableKey as string,
    revision: raw.revision as number,
    supersedesVersionId,
    outcome: raw.outcome as OutcomeTaxonomy,
    channel: raw.channel as OutcomeRecord["channel"],
    bounceClassification: raw.bounceClassification as OutcomeRecord["bounceClassification"],
    occurredAt: raw.occurredAt as string,
    recordedAt: raw.recordedAt as string,
    notes: raw.notes as string,
    source,
    recordedBy,
    outreachDraftVersionRef: draftRef,
    attribution,
    audit,
  };
  const contentHash = hashJson(contentPayload(base));
  const versionHash = hashJson({ schemaVersion: OUTCOME_RECORD_SCHEMA_VERSION, contentHash });
  const versionId = `outcome-version:${versionHash.slice(7)}`;
  const record = deepFreeze({
    schemaVersion: OUTCOME_RECORD_SCHEMA_VERSION,
    versionId,
    versionHash,
    ...base,
    contentHash,
  });
  return deepFreeze({
    ok: true,
    code: raw.revision === 1 ? "OUTCOME_RECORDED" : "OUTCOME_CORRECTED",
    record,
  });
}
