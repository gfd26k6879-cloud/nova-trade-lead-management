import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildOutcomeAttributionReport } from "@/lib/outcomes/outcome-attribution";
import { buildOutcomeRecord, type OutcomeRecord } from "@/lib/outcomes/outcome-record";

const TENANT = "10000000-0000-4000-8000-000000000001";
const FOREIGN = "10000000-0000-4000-8000-000000000002";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const ACCOUNT = "30000000-0000-4000-8000-000000000001";
const ACTOR = "40000000-0000-4000-8000-000000000001";
const PLAY = `lead-play-version:${"a".repeat(64)}`;
const DRAFT = `outreach-draft-version:${"b".repeat(64)}`;

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

function source(stableKey: string, observedAt: string) {
  const payload = { sourceVersion: 1, tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT,
    kind: "member_observation", sourceId: `observation:${stableKey}`,
    sourceVersionId: `observation-version:${stableKey}`, sourceContentHash: sha256(`content:${stableKey}`),
    sourceReceiptHash: sha256(`receipt:${stableKey}`), observedAt };
  return { ...payload, sourceHash: sha256(payload) };
}

function draftRef() {
  const payload = { draftRefVersion: 1, tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT,
    playVersionId: PLAY, versionId: DRAFT, contentHash: sha256("draft-content"), reviewHash: sha256("draft-review") };
  return { ...payload, draftRefHash: sha256(payload) };
}

function record(stableKey: string, kind: "direct" | "assisted" | "unknown", overrides: Record<string, unknown> = {}) {
  const direct = kind !== "unknown";
  const result = buildOutcomeRecord({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT,
    playVersionId: PLAY, stableKey, revision: 1, predecessor: null, outcome: "replied", channel: "email",
    bounceClassification: null, occurredAt: "2026-08-30T12:00:00.000Z", recordedAt: "2026-08-30T13:00:00.000Z",
    notes: `Canonical ${kind} outcome for attribution reporting.`,
    source: source(stableKey, "2026-08-30T12:30:00.000Z"), recordedBy: { kind: "human", actorId: ACTOR },
    outreachDraftVersionRef: draftRef(), attribution: { kind, confidenceBasisPoints: direct ? 7_500 : 0,
      rationale: direct ? `Human recorded ${kind} attribution.` : "Attribution remains unknown.",
      attributedAt: "2026-08-30T12:45:00.000Z", evidenceRefs: direct
        ? [{ kind: "outreach_draft_version", refId: DRAFT, refHash: draftRef().draftRefHash }] : [] },
    correction: null, ...overrides });
  if (!result.ok) throw new Error(result.code);
  return result.record;
}

function correction(previous: OutcomeRecord) {
  const result = buildOutcomeRecord({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT,
    playVersionId: PLAY, stableKey: previous.stableKey, revision: 2, predecessor: previous, outcome: "meeting_set",
    channel: "email", bounceClassification: null, occurredAt: "2026-08-30T12:10:00.000Z",
    recordedAt: "2026-08-30T14:00:00.000Z", notes: "Human corrected the outcome and attribution classification.",
    source: source(`${previous.stableKey}-v2`, "2026-08-30T13:30:00.000Z"),
    recordedBy: { kind: "human", actorId: ACTOR }, outreachDraftVersionRef: draftRef(),
    attribution: { kind: "assisted", confidenceBasisPoints: 6_000, rationale: "Human confirmed assisted attribution.",
      attributedAt: "2026-08-30T13:45:00.000Z",
      evidenceRefs: [{ kind: "outreach_draft_version", refId: DRAFT, refHash: draftRef().draftRefHash }] },
    correction: { kind: "human", actorId: ACTOR, at: "2026-08-30T14:00:00.000Z",
      reason: "Correct the original direct classification." } });
  if (!result.ok) throw new Error(result.code);
  return result.record;
}

function input(outcomes: readonly OutcomeRecord[], overrides: Record<string, unknown> = {}) {
  return { version: 1, tenantId: TENANT, workspaceId: WORKSPACE, reportKey: "outcome-attribution:launch",
    window: { from: "2026-08-30T00:00:00.000Z", to: "2026-08-31T00:00:00.000Z",
      asOf: "2026-08-31T01:00:00.000Z" }, outcomes, ...overrides };
}

afterEach(() => vi.restoreAllMocks());

describe("outcome attribution report", () => {
  it("groups direct, assisted, and unknown distinctly with bounded rates and source refs", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const outcomes = [record("outcome:direct", "direct"), record("outcome:assisted", "assisted"),
      record("outcome:unknown", "unknown")];
    const first = buildOutcomeAttributionReport(input(outcomes));
    expect(first).toEqual(buildOutcomeAttributionReport(input([...outcomes].reverse())));
    expect(first).toMatchObject({ ok: true, code: "OUTCOME_ATTRIBUTION_REPORTED", report: {
      summary: { total: 3, direct: 1, assisted: 1, unknown: 1,
        ratesBasisPoints: { direct: 3333, assisted: 3333, unknown: 3333 } },
      groups: [{ accountId: ACCOUNT, playVersionId: PLAY, outreachVersionId: DRAFT,
        counts: { total: 3, direct: 1, assisted: 1, unknown: 1 }, sourceOutcomeRefs: [{}, {}, {}] }],
    } });
    if (!first.ok) return;
    expect(Object.isFrozen(first.report.groups[0]?.sourceOutcomeRefs)).toBe(true);
    expect(first.report.reportHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(JSON.stringify(first.report)).not.toMatch(/notes|sourceReceipt|learning|dashboard|provider/iu);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses only the latest correction as of the report without double counting", () => {
    const original = record("outcome:corrected", "direct");
    const corrected = correction(original);
    const report = buildOutcomeAttributionReport(input([corrected, original]));
    expect(report).toMatchObject({ ok: true, report: { summary: { total: 1, direct: 0, assisted: 1, unknown: 0 },
      groups: [{ counts: { total: 1, direct: 0, assisted: 1, unknown: 0 },
        sourceOutcomeRefs: [{ versionId: corrected.versionId, outcome: "meeting_set", attributionKind: "assisted" }] }] } });
  });

  it("fails closed on scope, hash, chronology, caps, duplicates, and incomplete correction lineage", () => {
    const valid = record("outcome:valid", "direct");
    expect(buildOutcomeAttributionReport(input([valid], { tenantId: FOREIGN })))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(buildOutcomeAttributionReport(input([{ ...valid, contentHash: sha256("forged") } as OutcomeRecord])))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeAttributionReport(input([valid, valid])))
      .toEqual({ ok: false, code: "DUPLICATE_OUTCOME" });
    const corrected = correction(valid);
    expect(buildOutcomeAttributionReport(input([corrected])))
      .toEqual({ ok: false, code: "LINEAGE_CONFLICT" });
    expect(buildOutcomeAttributionReport(input([valid], { window: { from: "2026-08-31T00:00:00.000Z",
      to: "2026-08-30T00:00:00.000Z", asOf: "2026-08-31T01:00:00.000Z" } })))
      .toEqual({ ok: false, code: "INVALID_CHRONOLOGY" });
    expect(buildOutcomeAttributionReport(input(Array.from({ length: 10_001 }, () => valid))))
      .toEqual({ ok: false, code: "BOUNDS_EXCEEDED" });
  });

  it("rejects extra fields, Unicode ambiguity, proxies, and accessors without invoking traps", () => {
    const valid = record("outcome:valid", "unknown");
    expect(buildOutcomeAttributionReport({ ...input([valid]), automaticLearning: true }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    for (const reportKey of ["outcome\u200b:report", "ｏutcome:report", "outcome:\ud800"]) {
      expect(buildOutcomeAttributionReport(input([valid], { reportKey })))
        .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }
    let traps = 0;
    const trap = (): never => { traps += 1; throw new Error("must not execute"); };
    const accessor = input([valid]);
    Object.defineProperty(accessor.window, "asOf", { enumerable: true, get: trap });
    const proxied = new Proxy(input([valid]), { getPrototypeOf: trap });
    for (const hostile of [accessor, proxied]) {
      expect(buildOutcomeAttributionReport(hostile)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }
    expect(traps).toBe(0);
  });
});
