import { afterEach, describe, expect, it, vi } from "vitest";

import {
  simulateLeadPlay,
  type LeadPlaySimulationAccountInput,
} from "@/lib/strategy/lead-play-simulation";
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
    proposalRef: "understanding:simulation-fixture",
    revision: 1,
    supersedesProposalRef: null,
    supersedesVersionId: null,
    createdAt: "2026-08-30T12:00:00.000Z",
    producer: {
      runRef: "agent-run:simulation-fixture",
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
    stableKey: "icp:simulation-fixture",
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

function approvedLeadPlay(additionalHypotheses: Array<Record<string, unknown>> = []) {
  const icp = approvedIcp();
  const source = {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    stableKey: "lead-play:simulation-fixture",
    revision: 1,
    predecessor: null,
    createdAt: "2026-08-30T14:00:00.000Z",
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
    title: "Formulation-change discovery",
    objective: "Find evidence-backed formulation-change accounts for human review.",
    motion: "Discover accounts with current formulation-change signals.",
    searchHypotheses: [{
      hypothesisId: "hypothesis:change",
      queryFamily: "industrial-formulation-change",
      statement: "Organizations announcing formulation changes may have an active need.",
      rationale: "The approved ICP identifies formulation change as a buying trigger.",
      rationaleRefs: REFS,
    }, ...additionalHypotheses],
    sourceAllowlist: ["customer-list", "google-places"],
    bounds: { maxAccounts: 4, maxProviderRequests: 3, maxSpendCents: 500 },
    outreachMode: "draft_only",
    rationaleRefs: REFS,
    uncertainties: [{
      uncertaintyId: "uncertainty:timing",
      statement: "The timing of each formulation change is not yet known.",
      impact: "Keep ambiguous timing in human review.",
      relatedClaimIds: ["claim:buyers"],
    }],
  };
  const built = buildLeadPlayProposal(source);
  if (!built.ok) throw new Error(built.code);
  const draftReview = built.proposal.review;
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
  const reviewing = transition(built.proposal.review, "in_review", "2026-08-30T14:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const approved = transition(reviewing.review, "approved", "2026-08-30T14:02:00.000Z");
  if (!approved.ok) throw new Error(approved.code);
  return { source, review: approved.review, draftReview };
}

function observation(
  observationId: string,
  assessment: "supported" | "contradicted" | "ambiguous",
  overrides: Record<string, unknown> = {},
) {
  return {
    observationId,
    sourceKey: "google-places",
    hypothesisId: "hypothesis:change",
    assessment,
    rationaleRefs: REFS,
    uncertaintyIds: assessment === "ambiguous" ? ["uncertainty:timing"] : [],
    ...overrides,
  };
}

function account(
  accountId: string,
  observations: unknown[],
): LeadPlaySimulationAccountInput {
  return { accountId, observations } as LeadPlaySimulationAccountInput;
}

function simulationInput(overrides: Record<string, unknown> = {}) {
  const play = approvedLeadPlay();
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    playReview: play.review,
    playSource: play.source,
    estimates: { providerRequests: 2, spendCents: 200 },
    accounts: [
      account("account:included", [observation("observation:supported", "supported")]),
      account("account:review", [observation("observation:ambiguous", "ambiguous")]),
      account("account:excluded", [observation("observation:contradicted", "contradicted")]),
      account("account:unsupported", [observation("observation:unsupported", "supported", {
        sourceKey: "unapproved-source",
      })]),
    ],
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("lead-play fixture simulation boundary", () => {
  it("deterministically returns immutable, traceable, fail-closed account outcomes without side effects", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const source = simulationInput();
    const first = simulateLeadPlay(source);
    const reordered = simulateLeadPlay({ ...source, accounts: [...source.accounts].reverse() });

    expect(first).toEqual(reordered);
    expect(first).toMatchObject({
      ok: true,
      code: "LEAD_PLAY_SIMULATED",
      simulation: {
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        estimates: { providerRequests: 2, spendCents: 200 },
        summary: { total: 4, included: 1, excluded: 2, needsReview: 1 },
        accounts: [
          { accountId: "account:excluded", disposition: "excluded", factors: [{ kind: "contradicted" }] },
          { accountId: "account:included", disposition: "included", factors: [{ kind: "supported" }] },
          { accountId: "account:review", disposition: "needs_review", uncertaintyIds: ["uncertainty:timing"] },
          { accountId: "account:unsupported", disposition: "excluded", factors: [{ kind: "unsupported_source" }] },
        ],
      },
    });
    if (!first.ok) return;
    expect(first.simulation.simulationId)
      .toBe(`lead-play-simulation:${first.simulation.simulationHash.slice("sha256:".length)}`);
    expect(first.simulation.accounts[0]?.factors[0]?.rationaleRefs).toEqual(REFS);
    expect(Object.isFrozen(first.simulation)).toBe(true);
    expect(Object.isFrozen(first.simulation.accounts)).toBe(true);
    expect(Object.isFrozen(first.simulation.accounts[0]?.factors)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(source.accounts[0]?.accountId).toBe("account:included");
  });

  it("requires the exact approved, canonical, same-scope play authority", () => {
    const baseline = simulationInput();
    const play = approvedLeadPlay();
    expect(simulateLeadPlay({ ...baseline, tenantId: TENANT_B }))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(simulateLeadPlay({ ...baseline, playReview: play.draftReview }))
      .toEqual({ ok: false, code: "PLAY_NOT_APPROVED" });
    expect(simulateLeadPlay({ ...baseline, playReview: { ...baseline.playReview, status: "draft" } }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(simulateLeadPlay({ ...baseline, playReview: { ...baseline.playReview, reviewHash: HASH_B } }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(simulateLeadPlay({ ...baseline, playSource: { ...baseline.playSource, title: "Forged title" } }))
      .toEqual({ ok: false, code: "STALE_PLAY" });
  });

  it("enforces the approved play account, request, and spend bounds", () => {
    const baseline = simulationInput();
    expect(simulateLeadPlay({ ...baseline, accounts: [...baseline.accounts, account("account:too-many", [])] }))
      .toEqual({ ok: false, code: "BOUNDS_EXCEEDED" });
    expect(simulateLeadPlay({ ...baseline, estimates: { providerRequests: 4, spendCents: 200 } }))
      .toEqual({ ok: false, code: "BOUNDS_EXCEEDED" });
    expect(simulateLeadPlay({ ...baseline, estimates: { providerRequests: 2, spendCents: 501 } }))
      .toEqual({ ok: false, code: "BOUNDS_EXCEEDED" });
  });

  it("defaults empty, ambiguous, and unsupported matches away from inclusion", () => {
    const baseline = simulationInput();
    const result = simulateLeadPlay({
      ...baseline,
      accounts: [
        account("account:empty", []),
        account("account:bad-hypothesis", [observation("observation:bad-hypothesis", "supported", {
          hypothesisId: "hypothesis:not-approved",
        })]),
        account("account:bad-reference", [observation("observation:bad-reference", "supported", {
          rationaleRefs: [{ claimId: "claim:forged", evidenceId: "evidence:catalog" }],
        })]),
        account("account:ambiguous", [observation("observation:ambiguous-two", "ambiguous")]),
      ],
    });
    expect(result).toMatchObject({
      ok: true,
      simulation: {
        summary: { total: 4, included: 0, excluded: 3, needsReview: 1 },
        accounts: [
          { accountId: "account:ambiguous", disposition: "needs_review" },
          {
            accountId: "account:bad-hypothesis",
            disposition: "excluded",
            factors: [{ kind: "unsupported_hypothesis" }, { kind: "missing_hypothesis" }],
          },
          { accountId: "account:bad-reference", disposition: "excluded", factors: [{ kind: "unsupported_rationale" }] },
          {
            accountId: "account:empty",
            disposition: "excluded",
            factors: [{ kind: "no_evidence" }, { kind: "missing_hypothesis" }],
          },
        ],
      },
    });
  });

  it("excludes partial coverage when any approved search hypothesis is unobserved", () => {
    const play = approvedLeadPlay([{
      hypothesisId: "hypothesis:second-signal",
      queryFamily: "industrial-second-signal",
      statement: "A second independent signal is required before inclusion.",
      rationale: "The approved evidence supports requiring an independent signal.",
      rationaleRefs: REFS,
    }]);
    const result = simulateLeadPlay({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      playReview: play.review,
      playSource: play.source,
      estimates: { providerRequests: 1, spendCents: 100 },
      accounts: [account("account:partial", [observation("observation:only-first", "supported")])],
    });
    expect(result).toMatchObject({
      ok: true,
      simulation: {
        summary: { total: 1, included: 0, excluded: 1, needsReview: 0 },
        accounts: [{
          accountId: "account:partial",
          disposition: "excluded",
          factors: [
            { kind: "supported", hypothesisId: "hypothesis:change" },
            { kind: "missing_hypothesis", hypothesisId: "hypothesis:second-signal", rationaleRefs: REFS },
          ],
        }],
      },
    });
  });

  it("rejects duplicates, extra fields, proxies, and accessors without invoking traps", () => {
    const baseline = simulationInput();
    expect(simulateLeadPlay({ ...baseline, accounts: [baseline.accounts[0], baseline.accounts[0]] }))
      .toEqual({ ok: false, code: "DUPLICATE_ITEM" });
    expect(simulateLeadPlay({ ...baseline, activate: true }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });

    let trapCalls = 0;
    const trap = (): never => {
      trapCalls += 1;
      throw new Error("must not invoke");
    };
    const proxied = new Proxy(baseline, { getPrototypeOf: trap });
    const accessor = simulationInput();
    Object.defineProperty(accessor.estimates, "spendCents", { enumerable: true, get: trap });
    expect(simulateLeadPlay(proxied)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(simulateLeadPlay(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(trapCalls).toBe(0);
  });
});
