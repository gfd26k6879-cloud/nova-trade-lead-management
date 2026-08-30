import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLeadPlayActivationState,
  reviewLeadPlaySimulationEligibility,
  transitionLeadPlayActivation,
  type LeadPlayActivationState,
} from "@/lib/strategy/lead-play-activation";
import { simulateLeadPlay, type LeadPlaySimulation } from "@/lib/strategy/lead-play-simulation";
import { buildIcpProposal, transitionIcpReview, type IcpReviewSnapshot } from "@/lib/strategy/icp";
import {
  buildLeadPlayProposal,
  transitionLeadPlayReview,
  type LeadPlayReviewSnapshot,
} from "@/lib/strategy/lead-play";
import {
  buildBusinessUnderstandingProposal,
  transitionBusinessUnderstandingReview,
  type BusinessUnderstandingReviewSnapshot,
} from "@/lib/understanding/business-understanding";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "20000000-0000-4000-8000-000000000001";
const REVIEWER = "30000000-0000-4000-8000-000000000001";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const REFS = [{ claimId: "claim:buyers", evidenceId: "evidence:catalog" }];

function understandingSource() {
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    proposalRef: "understanding:activation-fixture",
    revision: 1,
    supersedesProposalRef: null,
    supersedesVersionId: null,
    createdAt: "2026-08-30T12:00:00.000Z",
    producer: {
      runRef: "agent-run:activation-fixture",
      runInputHash: HASH_A,
      agentVersion: "understanding-synthesizer:v1",
      modelRef: "fixture:deterministic",
      promptRef: "business-understanding@1",
      promptHash: HASH_A,
      policyRef: "evidence-policy:v1",
      policyHash: HASH_B,
    },
    evidence: [{
      evidenceId: "evidence:catalog",
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      sourceVersionRef: "document-version:catalog",
      locator: "page=2#buyers",
      contentHash: HASH_A,
      grade: "direct_observation",
      freshness: "current",
    }],
    claims: [{
      claimId: "claim:buyers",
      claimVersion: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      domain: "customer_types",
      claimClass: "identity",
      subject: "Industrial buyers",
      statement: "The catalog targets industrial formulators.",
      origin: "observed",
      status: "supported",
      confidenceBasisPoints: 9_000,
      material: true,
      evidenceIds: ["evidence:catalog"],
      uncertaintyReason: null,
    }],
  };
}

function approvedUnderstanding(): BusinessUnderstandingReviewSnapshot {
  const built = buildBusinessUnderstandingProposal(understandingSource());
  if (!built.ok) throw new Error(built.code);
  const transition = (current: BusinessUnderstandingReviewSnapshot, to: "in_review" | "approved", at: string) =>
    transitionBusinessUnderstandingReview({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      current,
      expectedVersionId: current.versionId,
      expectedContentHash: current.contentHash,
      expectedReviewHash: current.reviewHash,
      to,
      actor: { kind: "human", actorId: REVIEWER },
      at,
      reason: `Human understanding decision: ${to}.`,
      replacement: null,
    });
  const reviewing = transition(built.proposal.review, "in_review", "2026-08-30T12:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const approved = transition(reviewing.review, "approved", "2026-08-30T12:02:00.000Z");
  if (!approved.ok) throw new Error(approved.code);
  return approved.review;
}

function approvedIcp() {
  const understanding = approvedUnderstanding();
  const source = {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    stableKey: "icp:activation-fixture",
    revision: 1,
    predecessor: null,
    createdAt: "2026-08-30T13:00:00.000Z",
    understanding: {
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      versionId: understanding.versionId,
      contentHash: understanding.contentHash,
      claimSetHash: understanding.claimSetHash,
      reviewHash: understanding.reviewHash,
      snapshot: understanding,
      authority: {
        authorityVersion: 1,
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        understandingVersionId: understanding.versionId,
        understandingContentHash: understanding.contentHash,
        understandingClaimSetHash: understanding.claimSetHash,
        understandingReviewHash: understanding.reviewHash,
        source: understandingSource(),
      },
    },
    title: "Industrial formulation-change accounts",
    segment: "Industrial formulators",
    useCase: "Prioritize evidence-backed formulation changes",
    positiveCriteria: [{
      criterionId: "criterion:change",
      ruleKey: "trigger:formulation-change",
      domain: "buying_trigger",
      rule: "A formulation change creates an active need.",
      rationale: "The approved understanding identifies industrial buyers.",
      confidenceBasisPoints: 8_500,
      rationaleRefs: REFS,
    }],
    exclusions: [{
      criterionId: "exclusion:consumer",
      ruleKey: "disqualifier:consumer-only",
      domain: "disqualifier",
      rule: "Exclude consumer-only organizations.",
      rationale: "The evidence supports an industrial profile.",
      confidenceBasisPoints: 8_000,
      rationaleRefs: REFS,
    }],
    uncertainties: [],
  };
  const built = buildIcpProposal(source);
  if (!built.ok) throw new Error(built.code);
  const transition = (current: IcpReviewSnapshot, to: "in_review" | "approved", at: string) =>
    transitionIcpReview({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      current,
      expectedVersionId: current.versionId,
      expectedContentHash: current.contentHash,
      expectedReviewHash: current.reviewHash,
      to,
      actor: { kind: "human", actorId: REVIEWER },
      at,
      reason: `Human ICP decision: ${to}.`,
      replacement: null,
    });
  const reviewing = transition(built.proposal.review, "in_review", "2026-08-30T13:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const approved = transition(reviewing.review, "approved", "2026-08-30T13:02:00.000Z");
  if (!approved.ok) throw new Error(approved.code);
  return { source, review: approved.review };
}

type ApprovedPlay = Readonly<{
  source: ReturnType<typeof playSource>;
  review: LeadPlayReviewSnapshot;
}>;

function playSource(icp = approvedIcp(), revision = 1, predecessor: unknown = null) {
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    stableKey: "lead-play:activation-fixture",
    revision,
    predecessor,
    createdAt: revision === 1 ? "2026-08-30T14:00:00.000Z" : "2026-08-30T15:00:00.000Z",
    icp: {
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      stableKey: icp.review.stableKey,
      revision: icp.review.revision,
      supersedesVersionId: icp.review.supersedesVersionId,
      versionId: icp.review.versionId,
      contentHash: icp.review.contentHash,
      reviewHash: icp.review.reviewHash,
      understandingVersionId: icp.review.understandingVersionId,
      understandingContentHash: icp.review.understandingContentHash,
      understandingReviewHash: icp.review.understandingReviewHash,
      snapshot: icp.review,
      source: icp.source,
    },
    title: revision === 1 ? "Formulation-change discovery" : "Formulation-change discovery, revised",
    objective: "Find evidence-backed formulation-change accounts for human review.",
    motion: "Discover accounts with current formulation-change signals.",
    searchHypotheses: [{
      hypothesisId: "hypothesis:change",
      queryFamily: "industrial-formulation-change",
      statement: "Organizations announcing formulation changes may have an active need.",
      rationale: "The approved ICP identifies formulation change as a buying trigger.",
      rationaleRefs: REFS,
    }],
    sourceAllowlist: ["customer-list", "google-places"],
    bounds: { maxAccounts: 4, maxProviderRequests: 3, maxSpendCents: 500 },
    outreachMode: "draft_only" as const,
    rationaleRefs: REFS,
    uncertainties: [{
      uncertaintyId: "uncertainty:timing",
      statement: "The timing of each formulation change is not yet known.",
      impact: "Keep ambiguous timing in human review.",
      relatedClaimIds: ["claim:buyers"],
    }],
  };
}

function approvePlay(source: ReturnType<typeof playSource>, offsetHours = 0): ApprovedPlay {
  const built = buildLeadPlayProposal(source);
  if (!built.ok) throw new Error(built.code);
  const transition = (current: LeadPlayReviewSnapshot, to: "in_review" | "approved", at: string) =>
    transitionLeadPlayReview({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      current,
      expectedVersionId: current.versionId,
      expectedContentHash: current.contentHash,
      expectedReviewHash: current.reviewHash,
      to,
      actor: { kind: "human", actorId: REVIEWER },
      at,
      reason: `Human lead-play decision: ${to}.`,
      replacement: null,
    });
  const reviewingAt = new Date(Date.UTC(2026, 7, 30, 14 + offsetHours, 1)).toISOString();
  const approvedAt = new Date(Date.UTC(2026, 7, 30, 14 + offsetHours, 2)).toISOString();
  const reviewing = transition(built.proposal.review, "in_review", reviewingAt);
  if (!reviewing.ok) throw new Error(reviewing.code);
  const approved = transition(reviewing.review, "approved", approvedAt);
  if (!approved.ok) throw new Error(approved.code);
  return { source, review: approved.review };
}

function approvedPlayV1(): ApprovedPlay {
  return approvePlay(playSource());
}

function approvedPlayV2(v1: ApprovedPlay): ApprovedPlay {
  return approvePlay(playSource(approvedIcp(), 2, {
    predecessorVersion: 1,
    stableKey: v1.review.stableKey,
    revision: v1.review.revision,
    supersedesVersionId: v1.review.supersedesVersionId,
    review: v1.review,
  }), 1);
}

function simulationInput(play: ApprovedPlay, disposition: "included" | "excluded" | "needs_review" = "included") {
  const assessment = disposition === "included" ? "supported" : disposition === "excluded" ? "contradicted" : "ambiguous";
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    playReview: play.review,
    playSource: play.source,
    estimates: { providerRequests: 1, spendCents: 100 },
    accounts: [{
      accountId: "account:fixture",
      observations: [{
        observationId: "observation:fixture",
        sourceKey: "google-places",
        hypothesisId: "hypothesis:change",
        assessment,
        rationaleRefs: REFS,
        uncertaintyIds: disposition === "needs_review" ? ["uncertainty:timing"] : [],
      }],
    }],
  };
}

function simulationFor(play: ApprovedPlay, disposition: "included" | "excluded" | "needs_review" = "included") {
  const source = simulationInput(play, disposition);
  const result = simulateLeadPlay(source);
  if (!result.ok) throw new Error(result.code);
  return { source, simulation: result.simulation };
}

function eligibilityFor(
  play: ApprovedPlay,
  simulation: Readonly<{ source: ReturnType<typeof simulationInput>; simulation: LeadPlaySimulation }>,
) {
  const result = reviewLeadPlaySimulationEligibility({
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    playSource: play.source,
    playReview: play.review,
    simulationInput: simulation.source,
    simulation: simulation.simulation,
    decision: "eligible",
    actor: { kind: "human", actorId: REVIEWER },
    reviewedAt: "2026-08-30T15:30:00.000Z",
    reason: "Human reviewed the hypothetical fixture outcomes for activation eligibility.",
  });
  if (!result.ok) throw new Error(result.code);
  return result.review;
}

function initialState(): LeadPlayActivationState {
  const result = createLeadPlayActivationState({
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    stableKey: "lead-play:activation-fixture",
    createdAt: "2026-08-30T16:00:00.000Z",
  });
  if (!result.ok) throw new Error(result.code);
  return result.state;
}

function transitionInput(
  current: LeadPlayActivationState,
  play: ApprovedPlay,
  simulation = simulationFor(play),
  overrides: Record<string, unknown> = {},
) {
  const simulationEligibility = eligibilityFor(play, simulation);
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    current,
    expectedStateHash: current.stateHash,
    action: "activate",
    playSource: play.source,
    playReview: play.review,
    simulationInput: simulation.source,
    simulation: simulation.simulation,
    simulationEligibility,
    actor: { kind: "human", actorId: REVIEWER },
    at: "2026-08-30T16:01:00.000Z",
    reason: "Human activation after reviewing the exact simulation receipt.",
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("lead-play activation and rollback eligibility", () => {
  it("deterministically activates one exact approved, simulation-clean version without side effects", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const play = approvedPlayV1();
    const current = initialState();
    const source = transitionInput(current, play);
    const first = transitionLeadPlayActivation(source);
    const second = transitionLeadPlayActivation(source);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      ok: true,
      code: "LEAD_PLAY_ACTIVATED",
      state: {
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        stableKey: "lead-play:activation-fixture",
        active: { versionId: play.review.versionId, revision: 1 },
        inactive: [],
        events: [{ action: "activate", fromVersionId: null, to: { versionId: play.review.versionId } }],
      },
    });
    if (!first.ok) return;
    expect(Object.isFrozen(first.state)).toBe(true);
    expect(Object.isFrozen(first.state.active)).toBe(true);
    expect(Object.isFrozen(first.state.events)).toBe(true);
    expect(Object.isFrozen(first.state.events[0]?.actor)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("blocks non-clean, empty, mismatched, fabricated, and stale simulation receipts", () => {
    const play = approvedPlayV1();
    const current = initialState();
    for (const disposition of ["excluded", "needs_review"] as const) {
      expect(transitionLeadPlayActivation(transitionInput(current, play, simulationFor(play, disposition))))
        .toEqual({ ok: false, code: "SIMULATION_NOT_READY" });
    }
    const emptySource = { ...simulationInput(play), accounts: [] };
    const emptyResult = simulateLeadPlay(emptySource);
    if (!emptyResult.ok) throw new Error(emptyResult.code);
    expect(transitionLeadPlayActivation(transitionInput(current, play, {
      source: emptySource,
      simulation: emptyResult.simulation,
    }))).toEqual({ ok: false, code: "SIMULATION_NOT_READY" });

    const valid = simulationFor(play);
    expect(transitionLeadPlayActivation(transitionInput(current, play, valid, {
      simulation: { ...valid.simulation, simulationHash: HASH_A },
    }))).toEqual({ ok: false, code: "SIMULATION_MISMATCH" });
    expect(transitionLeadPlayActivation(transitionInput(current, play, valid, {
      simulationInput: { ...valid.source, estimates: { providerRequests: 2, spendCents: 100 } },
    }))).toEqual({ ok: false, code: "SIMULATION_MISMATCH" });
    expect(transitionLeadPlayActivation(transitionInput(current, play, valid, {
      simulationEligibility: { ...eligibilityFor(play, valid), eligibilityHash: HASH_A },
    }))).toEqual({ ok: false, code: "SIMULATION_ELIGIBILITY_REQUIRED" });
    expect(transitionLeadPlayActivation(transitionInput(current, play, valid, {
      expectedStateHash: HASH_A,
    }))).toEqual({ ok: false, code: "STALE_STATE" });
  });

  it("fails closed on cross-scope, automatic, proxy, accessor, and non-human input", () => {
    const play = approvedPlayV1();
    const current = initialState();
    expect(transitionLeadPlayActivation(transitionInput(current, play, undefined, { tenantId: TENANT_B })))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(transitionLeadPlayActivation(transitionInput(current, play, undefined, {
      actor: { kind: "agent", actorId: REVIEWER },
    }))).toEqual({ ok: false, code: "HUMAN_ACTOR_REQUIRED" });
    const valid = simulationFor(play);
    const eligibility = eligibilityFor(play, valid);
    expect(transitionLeadPlayActivation(transitionInput(current, play, valid, {
      simulationEligibility: { ...eligibility, decision: "ineligible" },
    }))).toEqual({ ok: false, code: "SIMULATION_ELIGIBILITY_REQUIRED" });
    expect(transitionLeadPlayActivation({ ...transitionInput(current, play), automatic: true }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });

    let trapCalls = 0;
    const trap = (): never => {
      trapCalls += 1;
      throw new Error("must not execute");
    };
    const proxied = new Proxy(transitionInput(current, play), { getPrototypeOf: trap });
    const accessor = transitionInput(current, play);
    Object.defineProperty(accessor.actor, "actorId", { enumerable: true, get: trap });
    expect(transitionLeadPlayActivation(proxied)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(transitionLeadPlayActivation(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(trapCalls).toBe(0);
  });

  it("activates only a newer direct successor and rolls back only to a canonical previously active version", () => {
    const v1 = approvedPlayV1();
    const v2 = approvedPlayV2(v1);
    const activatedV1 = transitionLeadPlayActivation(transitionInput(initialState(), v1));
    if (!activatedV1.ok) throw new Error(activatedV1.code);

    expect(transitionLeadPlayActivation(transitionInput(activatedV1.state, v1, undefined, {
      at: "2026-08-30T16:02:00.000Z",
    }))).toEqual({ ok: false, code: "VERSION_CONFLICT" });

    const activatedV2 = transitionLeadPlayActivation(transitionInput(activatedV1.state, v2, undefined, {
      at: "2026-08-30T16:02:00.000Z",
    }));
    expect(activatedV2).toMatchObject({
      ok: true,
      code: "LEAD_PLAY_ACTIVATED",
      state: {
        active: { versionId: v2.review.versionId, revision: 2 },
        inactive: [{ versionId: v1.review.versionId, revision: 1 }],
      },
    });
    if (!activatedV2.ok) return;

    const rollback = transitionLeadPlayActivation(transitionInput(activatedV2.state, v1, undefined, {
      action: "rollback",
      at: "2026-08-30T16:03:00.000Z",
      reason: "Human rollback to the previously active canonical version after review.",
    }));
    expect(rollback).toMatchObject({
      ok: true,
      code: "LEAD_PLAY_ROLLED_BACK",
      state: {
        active: { versionId: v1.review.versionId, revision: 1 },
        inactive: [{ versionId: v2.review.versionId, revision: 2 }],
        events: [
          { action: "activate", to: { versionId: v1.review.versionId } },
          { action: "activate", to: { versionId: v2.review.versionId } },
          { action: "rollback", fromVersionId: v2.review.versionId, to: { versionId: v1.review.versionId } },
        ],
      },
    });
    if (!rollback.ok) return;
    expect(rollback.state.events[2]?.reason).toContain("rollback");
  });
});
