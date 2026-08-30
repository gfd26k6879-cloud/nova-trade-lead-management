import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { buildOutcomeRecord, type OutcomeRecord, type OutcomeTaxonomy } from "@/lib/outcomes/outcome-record";
import {
  buildLearningProposal,
  transitionLearningProposalReview,
  type LearningProposal,
} from "@/lib/outcomes/learning-proposal";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "20000000-0000-4000-8000-000000000001";
const ACCOUNT_A = "30000000-0000-4000-8000-000000000001";
const REVIEWER = "40000000-0000-4000-8000-000000000001";
const PLAY_VERSION = `lead-play-version:${"a".repeat(64)}`;

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

function outcome(kind: OutcomeTaxonomy, index: number) {
  const minute = String(index).padStart(2, "0");
  const sourcePayload = {
    sourceVersion: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    kind: "member_observation",
    sourceId: `manual-observation:fixture-${index}`,
    sourceVersionId: `manual-observation-version:fixture-${index}`,
    sourceContentHash: sha256(`outcome ${index}`),
    sourceReceiptHash: sha256(`receipt ${index}`),
    observedAt: `2026-08-30T12:${minute}:00.000Z`,
  };
  const result = buildOutcomeRecord({
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    playVersionId: PLAY_VERSION,
    stableKey: `outcome:fixture-${index}`,
    revision: 1,
    predecessor: null,
    outcome: kind,
    channel: "email",
    bounceClassification: kind === "bounced" ? "soft_bounce" : kind === "unknown_bounce" ? "unknown_bounce" : null,
    occurredAt: `2026-08-30T11:${minute}:00.000Z`,
    recordedAt: `2026-08-30T13:${minute}:00.000Z`,
    notes: `Synthetic outcome ${index} for deterministic learning tests.`,
    source: { ...sourcePayload, sourceHash: sha256(sourcePayload) },
    recordedBy: { kind: "human", actorId: REVIEWER },
    outreachDraftVersionRef: null,
    attribution: {
      kind: "unknown",
      confidenceBasisPoints: 0,
      rationale: "No causal attribution is asserted for this synthetic fixture.",
      attributedAt: `2026-08-30T12:${minute}:30.000Z`,
      evidenceRefs: [],
    },
    correction: null,
  });
  if (!result.ok) throw new Error(result.code);
  return result.record;
}

function outcomes() {
  return [outcome("replied", 1), outcome("replied", 2), outcome("meeting_set", 3), outcome("lost", 4), outcome("unknown", 5)];
}

function correctedOutcome(predecessor: OutcomeRecord): OutcomeRecord {
  const sourcePayload = {
    sourceVersion: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    kind: "member_observation",
    sourceId: "manual-observation:fixture-1-correction",
    sourceVersionId: "manual-observation-version:fixture-1-correction",
    sourceContentHash: sha256("corrected outcome 1"),
    sourceReceiptHash: sha256("corrected receipt 1"),
    observedAt: "2026-08-30T13:05:00.000Z",
  } as const;
  const result = buildOutcomeRecord({
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    playVersionId: PLAY_VERSION,
    stableKey: predecessor.stableKey,
    revision: 2,
    predecessor,
    outcome: "meeting_set",
    channel: "email",
    bounceClassification: null,
    occurredAt: predecessor.occurredAt,
    recordedAt: "2026-08-30T13:10:00.000Z",
    notes: "Human correction of the first synthetic outcome.",
    source: { ...sourcePayload, sourceHash: sha256(sourcePayload) },
    recordedBy: { kind: "human", actorId: REVIEWER },
    outreachDraftVersionRef: null,
    attribution: {
      kind: "unknown",
      confidenceBasisPoints: 0,
      rationale: "No causal attribution is asserted for this corrected fixture.",
      attributedAt: "2026-08-30T13:06:00.000Z",
      evidenceRefs: [],
    },
    correction: {
      kind: "human",
      actorId: REVIEWER,
      at: "2026-08-30T13:10:00.000Z",
      reason: "Correct the observed outcome after human verification.",
    },
  });
  if (!result.ok) throw new Error(result.code);
  return result.record;
}

function input(overrides: Record<string, unknown> = {}) {
  const records = outcomes();
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    playVersionId: PLAY_VERSION,
    stableKey: "learning-proposal:reply-weight",
    revision: 1,
    predecessor: null,
    createdAt: "2026-08-30T14:00:00.000Z",
    outcomeRecords: records,
    cohort: {
      cohortId: "cohort:synthetic-august",
      definitionHash: sha256("same play, synthetic August fixture"),
      windowStart: "2026-08-30T00:00:00.000Z",
      windowEnd: "2026-08-30T14:00:00.000Z",
      denominator: records.length,
    },
    metric: {
      metricKey: "reply_rate",
      formulaVersion: "reply-rate:v1",
      numerator: 2,
      denominator: records.length,
      valueBasisPoints: 4_000,
    },
    target: {
      kind: "play_policy",
      currentPlayVersionId: PLAY_VERSION,
      currentPolicyHash: sha256("current play policy"),
    },
    change: {
      kind: "score_weight_basis_points",
      targetKey: "score-factor:reply-readiness",
      currentValue: 3_000,
      proposedValue: 3_500,
      rationale: "Increase the reviewed reply-readiness factor modestly for this play.",
    },
    uncertainties: [{
      uncertaintyId: "uncertainty:small-cohort",
      statement: "The synthetic cohort is small and may not generalize.",
      impact: "A larger holdout could change the estimated reply effect.",
      severity: 4,
    }],
    expectedImpact: {
      metricKey: "reply_rate",
      direction: "increase",
      estimateBasisPoints: 500,
      lowerBoundBasisPoints: 0,
      upperBoundBasisPoints: 1_000,
      horizonDays: 30,
      rationale: "The estimate remains bounded because the cohort is small.",
    },
    rollback: {
      restorePlayVersionId: PLAY_VERSION,
      restorePolicyHash: sha256("current play policy"),
      triggerMetricKey: "reply_rate",
      triggerThresholdBasisPoints: 3_500,
      reason: "Restore the exact reviewed baseline if reply rate falls below threshold.",
    },
    ...overrides,
  };
}

function created(value: unknown = input()): LearningProposal {
  const result = buildLearningProposal(value);
  if (!result.ok) throw new Error(result.code);
  return result.proposal;
}

function transition(current: LearningProposal, to: "in_review" | "approved" | "rejected", at: string) {
  return transitionLearningProposalReview({
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    playVersionId: PLAY_VERSION,
    current,
    expectedVersionId: current.versionId,
    expectedContentHash: current.contentHash,
    expectedReviewHash: current.review.reviewHash,
    to,
    actor: { kind: "human", actorId: REVIEWER },
    at,
    reason: `Human learning proposal decision: ${to}.`,
  });
}

function approved(): LearningProposal {
  const reviewing = transition(created(), "in_review", "2026-08-30T14:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const result = transition(reviewing.proposal, "approved", "2026-08-30T14:02:00.000Z");
  if (!result.ok) throw new Error(result.code);
  return result.proposal;
}

describe("controlled learning proposal lifecycle", () => {
  it("deterministically binds a reviewable typed change to canonical outcome versions and a reconciled metric", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = buildLearningProposal(input());
    expect(first).toEqual(buildLearningProposal(input()));
    expect(first).toMatchObject({
      ok: true,
      code: "LEARNING_PROPOSAL_CREATED",
      proposal: {
        playVersionId: PLAY_VERSION,
        revision: 1,
        outcomeRefs: { length: 5 },
        cohort: { denominator: 5 },
        metric: { metricKey: "reply_rate", numerator: 2, denominator: 5, valueBasisPoints: 4_000 },
        change: { kind: "score_weight_basis_points", currentValue: 3_000, proposedValue: 3_500 },
        review: { status: "draft" },
      },
    });
    if (!first.ok) return;
    expect(first.proposal.versionId).toBe(`learning-proposal-version:${first.proposal.versionHash.slice(7)}`);
    expect(Object.isFrozen(first.proposal)).toBe(true);
    expect(Object.isFrozen(first.proposal.outcomeRefs)).toBe(true);
    expect(JSON.stringify(first.proposal)).not.toMatch(/activePolicy|activate|mutation|provider|send/iu);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("recomputes cohort metrics and rejects duplicates, drift, or fabricated outcome bindings", () => {
    expect(buildLearningProposal(input({ metric: { ...input().metric as object, numerator: 3 } })))
      .toEqual({ ok: false, code: "METRIC_MISMATCH" });
    const records = outcomes();
    expect(buildLearningProposal(input({ outcomeRecords: [...records, records[0]], cohort: { ...input().cohort as object, denominator: 6 }, metric: { ...input().metric as object, denominator: 6 } })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const correction = correctedOutcome(records[0]);
    expect(buildLearningProposal(input({
      outcomeRecords: [records[0], correction, ...records.slice(1)],
      cohort: { ...input().cohort as object, denominator: 6 },
      metric: { ...input().metric as object, denominator: 6 },
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildLearningProposal(input({
      outcomeRecords: [{ ...records[0], contentHash: sha256("fabricated") }, ...records.slice(1)],
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("allows only ordered human review and approval remains proposal-only", () => {
    const draft = created();
    expect(transition(draft, "approved", "2026-08-30T14:01:00.000Z"))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(transition(draft, "in_review", draft.createdAt)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    const reviewing = transition(draft, "in_review", "2026-08-30T14:01:00.000Z");
    if (!reviewing.ok) throw new Error(reviewing.code);
    const result = transition(reviewing.proposal, "approved", "2026-08-30T14:02:00.000Z");
    expect(result).toMatchObject({ ok: true, proposal: { review: { status: "approved" }, target: { currentPlayVersionId: PLAY_VERSION } } });
    if (!result.ok) return;
    expect(JSON.stringify(result.proposal)).not.toMatch(/activated|activeVersion|policyMutation/iu);
    expect(transitionLearningProposalReview({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      accountId: ACCOUNT_A,
      playVersionId: PLAY_VERSION,
      current: draft,
      expectedVersionId: draft.versionId,
      expectedContentHash: draft.contentHash,
      expectedReviewHash: draft.review.reviewHash,
      to: "in_review",
      actor: { kind: "agent", actorId: REVIEWER },
      at: "2026-08-30T14:01:00.000Z",
      reason: "Automatic proposal approval is forbidden.",
    })).toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
  });

  it("requires exact +1 approved proposal lineage and rejects stale review bindings", () => {
    const prior = approved();
    const correction = buildLearningProposal(input({
      revision: 2,
      predecessor: prior,
      createdAt: "2026-08-30T15:00:00.000Z",
      change: { ...input().change as object, proposedValue: 3_250 },
    }));
    expect(correction).toMatchObject({
      ok: true,
      code: "LEARNING_PROPOSAL_VERSION_CREATED",
      proposal: { revision: 2, supersedesVersionId: prior.versionId, review: { status: "draft" } },
    });
    expect(buildLearningProposal(input({ revision: 3, predecessor: prior })))
      .toEqual({ ok: false, code: "VERSION_CONFLICT" });
    if (!correction.ok) return;
    expect(transitionLearningProposalReview({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      accountId: ACCOUNT_A,
      playVersionId: PLAY_VERSION,
      current: correction.proposal,
      expectedVersionId: prior.versionId,
      expectedContentHash: prior.contentHash,
      expectedReviewHash: prior.review.reviewHash,
      to: "in_review",
      actor: { kind: "human", actorId: REVIEWER },
      at: "2026-08-30T15:01:00.000Z",
      reason: "Stale bindings cannot review a correction.",
    })).toEqual({ ok: false, code: "STALE_VERSION" });
  });

  it("fails closed on scope, chronology, caps, Unicode, proxy, accessor, and extra authority", () => {
    expect(buildLearningProposal(input({ tenantId: TENANT_B }))).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(buildLearningProposal(input({ createdAt: "2026-08-30T12:00:00.000Z" })))
      .toEqual({ ok: false, code: "INVALID_CHRONOLOGY" });
    expect(buildLearningProposal(input({ outcomeRecords: Array.from({ length: 101 }, (_, index) => outcome("unknown", index % 60)) })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildLearningProposal(input({ uncertainties: Array.from({ length: 21 }, (_, index) => ({
      uncertaintyId: `uncertainty:item-${index}`,
      statement: `Uncertainty item ${index}.`,
      impact: `Impact item ${index}.`,
      severity: 1,
    })) }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildLearningProposal(input({ change: { ...input().change as object, rationale: "Increase\u200b weight." } })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildLearningProposal(input({ change: { ...input().change as object, rationale: "Ｉncrease weight." } })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildLearningProposal(new Proxy(input(), {}))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const accessor = input();
    Object.defineProperty(accessor, "createdAt", { enumerable: true, get: vi.fn(() => "2026-08-30T14:00:00.000Z") });
    expect(buildLearningProposal(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildLearningProposal({ ...input(), activate: true })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });
});
