import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { buildOutcomeRecord, type OutcomeAttribution, type OutcomeRecord, type OutcomeTaxonomy } from "@/lib/outcomes/outcome-record";

export const OUTCOME_ATTRIBUTION_REPORT_VERSION = 1 as const;

type AttributionKind = OutcomeAttribution["kind"];
type Counts = Readonly<{ total: number; direct: number; assisted: number; unknown: number }>;
type Rates = Readonly<{ direct: number; assisted: number; unknown: number }>;

export type OutcomeAttributionSourceRef = Readonly<{
  stableKey: string;
  versionId: string;
  contentHash: string;
  outcome: OutcomeTaxonomy;
  occurredAt: string;
  attributionKind: AttributionKind;
}>;

export type OutcomeAttributionGroup = Readonly<{
  accountId: string;
  playVersionId: string;
  outreachVersionId: string | null;
  counts: Counts;
  ratesBasisPoints: Rates;
  sourceOutcomeRefs: readonly OutcomeAttributionSourceRef[];
}>;

export type OutcomeAttributionReport = Readonly<{
  reportVersion: typeof OUTCOME_ATTRIBUTION_REPORT_VERSION;
  tenantId: string;
  workspaceId: string;
  reportKey: string;
  window: Readonly<{ from: string; to: string; asOf: string }>;
  summary: Counts & Readonly<{ ratesBasisPoints: Rates }>;
  groups: readonly OutcomeAttributionGroup[];
  reportHash: string;
}>;

export type OutcomeAttributionReportResult =
  | Readonly<{ ok: true; code: "OUTCOME_ATTRIBUTION_REPORTED"; report: OutcomeAttributionReport }>
  | Readonly<{ ok: false; code:
    | "MALFORMED_INPUT"
    | "SCOPE_MISMATCH"
    | "INVALID_CHRONOLOGY"
    | "BOUNDS_EXCEEDED"
    | "DUPLICATE_OUTCOME"
    | "LINEAGE_CONFLICT" }>;

type PlainRecord = Record<string, unknown>;

const INPUT_FIELDS = ["version", "tenantId", "workspaceId", "reportKey", "window", "outcomes"] as const;
const WINDOW_FIELDS = ["from", "to", "asOf"] as const;
const RECORD_FIELDS = [
  "schemaVersion", "versionId", "versionHash", "tenantId", "workspaceId", "accountId", "playVersionId", "stableKey",
  "revision", "supersedesVersionId", "outcome", "channel", "bounceClassification", "occurredAt", "recordedAt",
  "notes", "source", "recordedBy", "outreachDraftVersionRef", "attribution", "audit", "contentHash",
] as const;
const AUDIT_FIELDS = ["action", "revision", "supersedesVersionId", "actor", "at", "reason", "eventHash"] as const;
const ACTOR_FIELDS = ["kind", "actorId"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const REF = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,299}$/u;
const OUTCOME_VERSION = /^outcome-version:[0-9a-f]{64}$/u;
const PLAY_VERSION = /^lead-play-version:[0-9a-f]{64}$/u;
const MAX_OUTCOMES = 10_000;
const MAX_AUDIT = 100;

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

function arrayLength(value: unknown): number | null {
  if (typeof value !== "object" || value === null || !Array.isArray(value) || isProxy(value)) return null;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, "length");
    return descriptor && "value" in descriptor && Number.isSafeInteger(descriptor.value) && descriptor.value >= 0
      ? descriptor.value as number : null;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  const length = arrayLength(value);
  if (length === null || length > maximum) return null;
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value as object) as unknown as Record<PropertyKey, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== length + 1) return null;
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

function reference(value: unknown): string | null {
  return typeof value === "string" && REF.test(value) ? value : null;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function counts(records: readonly OutcomeRecord[]): Counts {
  return Object.freeze({
    total: records.length,
    direct: records.filter((record) => record.attribution.kind === "direct").length,
    assisted: records.filter((record) => record.attribution.kind === "assisted").length,
    unknown: records.filter((record) => record.attribution.kind === "unknown").length,
  });
}

function rates(value: Counts): Rates {
  const rate = (count: number) => value.total === 0 ? 0 : Math.floor(count * 10_000 / value.total);
  return Object.freeze({ direct: rate(value.direct), assisted: rate(value.assisted), unknown: rate(value.unknown) });
}

function failure(code: Extract<OutcomeAttributionReportResult, { ok: false }>["code"]): OutcomeAttributionReportResult {
  return Object.freeze({ ok: false, code });
}

type Candidate = Readonly<{
  raw: unknown;
  snapshot: PlainRecord;
  tenantId: string;
  workspaceId: string;
  accountId: string;
  playVersionId: string;
  stableKey: string;
  revision: number;
  versionId: string;
  recordedAt: string;
}>;

function candidate(value: unknown): Candidate | null {
  const snapshot = exactRecord(value, RECORD_FIELDS);
  const tenantId = snapshot && typeof snapshot.tenantId === "string" && UUID.test(snapshot.tenantId)
    ? snapshot.tenantId : null;
  const workspaceId = snapshot && typeof snapshot.workspaceId === "string" && UUID.test(snapshot.workspaceId)
    ? snapshot.workspaceId : null;
  const accountId = snapshot && typeof snapshot.accountId === "string" && UUID.test(snapshot.accountId)
    ? snapshot.accountId : null;
  const playVersionId = snapshot && typeof snapshot.playVersionId === "string" && PLAY_VERSION.test(snapshot.playVersionId)
    ? snapshot.playVersionId : null;
  const stableKey = snapshot && reference(snapshot.stableKey);
  const revision = snapshot && typeof snapshot.revision === "number" && Number.isSafeInteger(snapshot.revision)
    && snapshot.revision >= 1 && snapshot.revision <= MAX_AUDIT ? snapshot.revision : null;
  const versionId = snapshot && typeof snapshot.versionId === "string" && OUTCOME_VERSION.test(snapshot.versionId)
    ? snapshot.versionId : null;
  const recordedAt = snapshot && timestamp(snapshot.recordedAt);
  return snapshot && snapshot.schemaVersion === 1 && tenantId && workspaceId && accountId && playVersionId
    && stableKey && revision !== null && versionId && recordedAt
    ? Object.freeze({ raw: value, snapshot, tenantId, workspaceId, accountId, playVersionId,
      stableKey, revision, versionId, recordedAt }) : null;
}

function correctionFrom(candidateValue: Candidate): Readonly<{ kind: "human"; actorId: string; at: string; reason: string }> | null {
  const events = exactArray(candidateValue.snapshot.audit, MAX_AUDIT);
  const last = events?.length ? exactRecord(events.at(-1), AUDIT_FIELDS) : null;
  const eventActor = last && exactRecord(last.actor, ACTOR_FIELDS);
  const actorId = eventActor && eventActor.kind === "human" && typeof eventActor.actorId === "string"
    && UUID.test(eventActor.actorId) ? eventActor.actorId : null;
  const at = last && timestamp(last.at);
  const reason = last && reference(last.reason) ? last.reason as string
    : last && typeof last.reason === "string" && last.reason.length > 0 ? last.reason : null;
  return last && last.action === "corrected" && actorId && at && reason
    ? Object.freeze({ kind: "human" as const, actorId, at, reason }) : null;
}

function rebuild(candidateValue: Candidate, predecessor: OutcomeRecord | null): OutcomeRecord | null {
  const record = candidateValue.snapshot;
  const correction = candidateValue.revision === 1 ? null : correctionFrom(candidateValue);
  if (candidateValue.revision > 1 && !correction) return null;
  const result = buildOutcomeRecord({ version: 1, tenantId: record.tenantId, workspaceId: record.workspaceId,
    accountId: record.accountId, playVersionId: record.playVersionId, stableKey: record.stableKey,
    revision: record.revision, predecessor, outcome: record.outcome, channel: record.channel,
    bounceClassification: record.bounceClassification, occurredAt: record.occurredAt, recordedAt: record.recordedAt,
    notes: record.notes, source: record.source, recordedBy: record.recordedBy,
    outreachDraftVersionRef: record.outreachDraftVersionRef, attribution: record.attribution, correction });
  return result.ok && JSON.stringify(result.record) === JSON.stringify(candidateValue.raw) ? result.record : null;
}

/** Builds an immutable report only; it performs no dashboard, persistence, I/O, policy, or learning mutation. */
export function buildOutcomeAttributionReport(value: unknown): OutcomeAttributionReportResult {
  try {
    const input = exactRecord(value, INPUT_FIELDS);
    if (!input || input.version !== OUTCOME_ATTRIBUTION_REPORT_VERSION) return failure("MALFORMED_INPUT");
    const tenantId = typeof input.tenantId === "string" && UUID.test(input.tenantId) ? input.tenantId : null;
    const workspaceId = typeof input.workspaceId === "string" && UUID.test(input.workspaceId) ? input.workspaceId : null;
    const reportKey = reference(input.reportKey);
    const windowInput = exactRecord(input.window, WINDOW_FIELDS);
    const from = windowInput && timestamp(windowInput.from);
    const to = windowInput && timestamp(windowInput.to);
    const asOf = windowInput && timestamp(windowInput.asOf);
    const outcomeCount = arrayLength(input.outcomes);
    if (outcomeCount !== null && outcomeCount > MAX_OUTCOMES) return failure("BOUNDS_EXCEEDED");
    const rawOutcomes = exactArray(input.outcomes, MAX_OUTCOMES);
    if (!tenantId || !workspaceId || !reportKey || !windowInput || !from || !to || !asOf || !rawOutcomes) {
      return failure("MALFORMED_INPUT");
    }
    if (Date.parse(from) > Date.parse(to) || Date.parse(to) > Date.parse(asOf)) return failure("INVALID_CHRONOLOGY");
    const candidates = rawOutcomes.map(candidate);
    if (candidates.some((item) => !item)) return failure("MALFORMED_INPUT");
    const parsedCandidates = candidates as Candidate[];
    if (parsedCandidates.some((item) => item.tenantId !== tenantId || item.workspaceId !== workspaceId)) {
      return failure("SCOPE_MISMATCH");
    }
    const versionIds = parsedCandidates.map((item) => item.versionId);
    if (new Set(versionIds).size !== versionIds.length) return failure("DUPLICATE_OUTCOME");

    const chains = new Map<string, Candidate[]>();
    for (const item of parsedCandidates) {
      const key = `${item.accountId}\0${item.playVersionId}\0${item.stableKey}`;
      const chain = chains.get(key) ?? [];
      chain.push(item);
      chains.set(key, chain);
    }
    const selected: OutcomeRecord[] = [];
    for (const chain of chains.values()) {
      chain.sort((left, right) => left.revision - right.revision || compare(left.versionId, right.versionId));
      let predecessor: OutcomeRecord | null = null;
      const rebuilt: OutcomeRecord[] = [];
      for (let index = 0; index < chain.length; index += 1) {
        const item = chain[index] as Candidate;
        if (item.revision !== index + 1) return failure("LINEAGE_CONFLICT");
        const canonical = rebuild(item, predecessor);
        if (!canonical) return failure("MALFORMED_INPUT");
        predecessor = canonical;
        rebuilt.push(canonical);
      }
      const currentAsOf = rebuilt.filter((record) => Date.parse(record.recordedAt) <= Date.parse(asOf)).at(-1);
      if (currentAsOf && Date.parse(currentAsOf.occurredAt) >= Date.parse(from)
        && Date.parse(currentAsOf.occurredAt) <= Date.parse(to)) selected.push(currentAsOf);
    }
    selected.sort((left, right) => compare(left.accountId, right.accountId) || compare(left.playVersionId, right.playVersionId)
      || compare(left.outreachDraftVersionRef?.versionId ?? "", right.outreachDraftVersionRef?.versionId ?? "")
      || compare(left.stableKey, right.stableKey) || compare(left.versionId, right.versionId));

    const grouped = new Map<string, OutcomeRecord[]>();
    for (const record of selected) {
      const key = `${record.accountId}\0${record.playVersionId}\0${record.outreachDraftVersionRef?.versionId ?? ""}`;
      const group = grouped.get(key) ?? [];
      group.push(record);
      grouped.set(key, group);
    }
    const groups: OutcomeAttributionGroup[] = [];
    for (const records of grouped.values()) {
      const first = records[0] as OutcomeRecord;
      const groupCounts = counts(records);
      const sourceOutcomeRefs = Object.freeze(records.map((record) => Object.freeze({ stableKey: record.stableKey,
        versionId: record.versionId, contentHash: record.contentHash, outcome: record.outcome,
        occurredAt: record.occurredAt, attributionKind: record.attribution.kind })));
      groups.push(Object.freeze({ accountId: first.accountId, playVersionId: first.playVersionId,
        outreachVersionId: first.outreachDraftVersionRef?.versionId ?? null, counts: groupCounts,
        ratesBasisPoints: rates(groupCounts), sourceOutcomeRefs }));
    }
    groups.sort((left, right) => compare(left.accountId, right.accountId) || compare(left.playVersionId, right.playVersionId)
      || compare(left.outreachVersionId ?? "", right.outreachVersionId ?? ""));
    const summaryCounts = counts(selected);
    const summary = Object.freeze({ ...summaryCounts, ratesBasisPoints: rates(summaryCounts) });
    const window = Object.freeze({ from, to, asOf });
    const payload = Object.freeze({ reportVersion: OUTCOME_ATTRIBUTION_REPORT_VERSION, tenantId, workspaceId,
      reportKey, window, summary, groups: Object.freeze(groups) });
    const report = Object.freeze({ ...payload, reportHash: sha256(payload) });
    return Object.freeze({ ok: true, code: "OUTCOME_ATTRIBUTION_REPORTED", report });
  } catch {
    return failure("MALFORMED_INPUT");
  }
}
