import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { buildOutcomeRecord, type OutcomeRecord } from "@/lib/outcomes/outcome-record";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "20000000-0000-4000-8000-000000000001";
const ACCOUNT_A = "30000000-0000-4000-8000-000000000001";
const ACTOR = "40000000-0000-4000-8000-000000000001";
const PLAY_VERSION = `lead-play-version:${"a".repeat(64)}`;
const DRAFT_VERSION = `outreach-draft-version:${"b".repeat(64)}`;

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

function source(overrides: Record<string, unknown> = {}) {
  const payload = {
    sourceVersion: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    kind: "member_observation",
    sourceId: "manual-observation:fixture",
    sourceVersionId: "manual-observation-version:fixture-v1",
    sourceContentHash: sha256("synthetic manual observation"),
    sourceReceiptHash: sha256("synthetic source receipt"),
    observedAt: "2026-08-30T12:30:00.000Z",
    ...overrides,
  };
  return { ...payload, sourceHash: sha256(payload) };
}

function draftRef(overrides: Record<string, unknown> = {}) {
  const payload = {
    draftRefVersion: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    playVersionId: PLAY_VERSION,
    versionId: DRAFT_VERSION,
    contentHash: sha256("synthetic draft content"),
    reviewHash: sha256("synthetic draft review"),
    ...overrides,
  };
  return { ...payload, draftRefHash: sha256(payload) };
}

function attribution(overrides: Record<string, unknown> = {}) {
  return {
    kind: "direct",
    confidenceBasisPoints: 8_000,
    rationale: "The operator explicitly linked the response to this play and draft.",
    attributedAt: "2026-08-30T12:45:00.000Z",
    evidenceRefs: [
      { kind: "outreach_draft_version", refId: DRAFT_VERSION, refHash: draftRef().draftRefHash },
    ],
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    playVersionId: PLAY_VERSION,
    stableKey: "outcome:synthetic-reply",
    revision: 1,
    predecessor: null,
    outcome: "replied",
    channel: "email",
    bounceClassification: null,
    occurredAt: "2026-08-30T12:15:00.000Z",
    recordedAt: "2026-08-30T13:00:00.000Z",
    notes: "Operator recorded a synthetic reply for contract testing.",
    source: source(),
    recordedBy: { kind: "human", actorId: ACTOR },
    outreachDraftVersionRef: draftRef(),
    attribution: attribution(),
    correction: null,
    ...overrides,
  };
}

function created(value: unknown = input()): OutcomeRecord {
  const result = buildOutcomeRecord(value);
  if (!result.ok) throw new Error(result.code);
  return result.record;
}

describe("outcome record lifecycle", () => {
  it("builds a deterministic immutable sourced observation bound to exact play and draft versions", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = buildOutcomeRecord(input());
    expect(first).toEqual(buildOutcomeRecord(input()));
    expect(first).toMatchObject({
      ok: true,
      code: "OUTCOME_RECORDED",
      record: {
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        accountId: ACCOUNT_A,
        playVersionId: PLAY_VERSION,
        outcome: "replied",
        revision: 1,
        outreachDraftVersionRef: { versionId: DRAFT_VERSION },
        attribution: { kind: "direct", confidenceBasisPoints: 8_000 },
        audit: [{ action: "recorded", revision: 1 }],
      },
    });
    if (!first.ok) return;
    expect(first.record.versionId).toBe(`outcome-version:${first.record.versionHash.slice(7)}`);
    expect(Object.isFrozen(first.record)).toBe(true);
    expect(Object.isFrozen(first.record.audit)).toBe(true);
    expect(Object.isFrozen(first.record.attribution.evidenceRefs)).toBe(true);
    expect(JSON.stringify(first.record)).not.toMatch(/learningMutation|policyMutation|provider|sendAction/iu);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps the launch taxonomy bounded and preserves truthful bounce classifications", () => {
    expect(buildOutcomeRecord(input({ outcome: "delivered" }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeRecord(input({ outcome: "bounced", bounceClassification: null })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeRecord(input({ outcome: "bounced", bounceClassification: "hard_bounce" })))
      .toMatchObject({ ok: true, record: { outcome: "bounced", bounceClassification: "hard_bounce" } });
    expect(buildOutcomeRecord(input({ outcome: "unknown_bounce", bounceClassification: "unknown_bounce" })))
      .toMatchObject({ ok: true, record: { outcome: "unknown_bounce", bounceClassification: "unknown_bounce" } });
    expect(buildOutcomeRecord(input({ outcome: "won", bounceClassification: "soft_bounce" })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("records a human correction as exact +1 immutable lineage with appended audit", () => {
    const prior = created();
    const correction = buildOutcomeRecord(input({
      revision: 2,
      predecessor: prior,
      outcome: "meeting_set",
      occurredAt: "2026-08-30T12:20:00.000Z",
      recordedAt: "2026-08-30T14:00:00.000Z",
      source: source({ observedAt: "2026-08-30T13:30:00.000Z", sourceVersionId: "manual-observation-version:fixture-v2" }),
      notes: "Human corrected the reply to a meeting set after reviewing the source.",
      attribution: attribution({ attributedAt: "2026-08-30T13:45:00.000Z" }),
      correction: {
        kind: "human",
        actorId: ACTOR,
        at: "2026-08-30T14:00:00.000Z",
        reason: "The original outcome classification was incomplete.",
      },
    }));
    expect(correction).toMatchObject({
      ok: true,
      code: "OUTCOME_CORRECTED",
      record: {
        revision: 2,
        supersedesVersionId: prior.versionId,
        audit: [
          { action: "recorded", revision: 1 },
          { action: "corrected", revision: 2, supersedesVersionId: prior.versionId },
        ],
      },
    });
    expect(prior.outcome).toBe("replied");
    expect(prior.audit).toHaveLength(1);
    expect(buildOutcomeRecord(input({ revision: 3, predecessor: prior })))
      .toEqual({ ok: false, code: "VERSION_CONFLICT" });
    expect(buildOutcomeRecord(input({ revision: 2, predecessor: prior, correction: null })))
      .toEqual({ ok: false, code: "HUMAN_CORRECTION_REQUIRED" });
  });

  it("fails closed on chronology, ambiguous attribution, stale hashes, and scope", () => {
    expect(buildOutcomeRecord(input({ recordedAt: "2026-08-30T12:00:00.000Z" })))
      .toEqual({ ok: false, code: "INVALID_CHRONOLOGY" });
    expect(buildOutcomeRecord(input({ attribution: attribution({ kind: "unknown" }) })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeRecord(input({
      attribution: attribution({ kind: "unknown", confidenceBasisPoints: 0, evidenceRefs: [] }),
    }))).toMatchObject({ ok: true, record: { attribution: { kind: "unknown", confidenceBasisPoints: 0 } } });
    expect(buildOutcomeRecord(input({ tenantId: TENANT_B }))).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(buildOutcomeRecord(input({ source: source({ tenantId: TENANT_B }) })))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(buildOutcomeRecord(input({ outreachDraftVersionRef: { ...draftRef(), contentHash: sha256("changed") } })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("rejects caps, duplicates, Unicode confusables, proxies, accessors, and extra authority fields", () => {
    expect(buildOutcomeRecord(input({
      attribution: attribution({ evidenceRefs: [attribution().evidenceRefs[0], attribution().evidenceRefs[0]] }),
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeRecord(input({
      attribution: attribution({
        evidenceRefs: Array.from({ length: 21 }, (_, index) => ({
          kind: "source_receipt",
          refId: `receipt:synthetic-${index}`,
          refHash: sha256(`receipt ${index}`),
        })),
      }),
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeRecord(input({ notes: "Synthetic\u200b note." }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeRecord(input({ notes: "Ｓynthetic note." }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeRecord(input({ notes: "Synthetic note.\ud800" }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeRecord(new Proxy(input(), {}))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const accessor = input();
    Object.defineProperty(accessor, "recordedAt", { enumerable: true, get: vi.fn(() => "2026-08-30T13:00:00.000Z") });
    expect(buildOutcomeRecord(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildOutcomeRecord({ ...input(), automaticLearning: true })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });
});
