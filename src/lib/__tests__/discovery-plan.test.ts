import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDiscoveryPlan } from "@/lib/discovery/discovery-plan";
import { buildIcpProposal, transitionIcpReview, type IcpReviewSnapshot } from "@/lib/strategy/icp";
import { buildLeadPlayProposal, transitionLeadPlayReview, type LeadPlayReviewSnapshot } from "@/lib/strategy/lead-play";
import { buildBusinessUnderstandingProposal, transitionBusinessUnderstandingReview, type BusinessUnderstandingReviewSnapshot } from "@/lib/understanding/business-understanding";

const TENANT = "10000000-0000-4000-8000-000000000001";
const FOREIGN = "10000000-0000-4000-8000-000000000002";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const REVIEWER = "30000000-0000-4000-8000-000000000001";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;
const HASH_C = `sha256:${"c".repeat(64)}`;
const REFS = [{ claimId: "claim:buyers", evidenceId: "evidence:catalog" }];

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function understandingSource() {
  return {
    version: 1, tenantId: TENANT, workspaceId: WORKSPACE, proposalRef: "understanding:discovery",
    revision: 1, supersedesProposalRef: null, supersedesVersionId: null, createdAt: "2026-08-30T12:00:00.000Z",
    producer: { runRef: "agent-run:discovery", runInputHash: HASH_A, agentVersion: "understanding:v1",
      modelRef: "fixture:model", promptRef: "understanding@1", promptHash: HASH_A,
      policyRef: "evidence-policy:v1", policyHash: HASH_B },
    evidence: [{ evidenceId: "evidence:catalog", tenantId: TENANT, workspaceId: WORKSPACE,
      sourceVersionRef: "document-version:catalog", locator: "page=2#buyers", contentHash: HASH_A,
      grade: "direct_observation", freshness: "current" }],
    claims: [{ claimId: "claim:buyers", claimVersion: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      domain: "customer_types", claimClass: "identity", subject: "Industrial buyers",
      statement: "The catalog targets industrial formulators.", origin: "observed", status: "supported",
      confidenceBasisPoints: 9_000, material: true, evidenceIds: ["evidence:catalog"], uncertaintyReason: null }],
  };
}

function approvedUnderstanding(): BusinessUnderstandingReviewSnapshot {
  const built = buildBusinessUnderstandingProposal(understandingSource());
  if (!built.ok) throw new Error(built.code);
  const move = (current: BusinessUnderstandingReviewSnapshot, to: "in_review" | "approved", at: string) =>
    transitionBusinessUnderstandingReview({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE, current,
      expectedVersionId: current.versionId, expectedContentHash: current.contentHash,
      expectedReviewHash: current.reviewHash, to, actor: { kind: "human", actorId: REVIEWER }, at,
      reason: `Human understanding decision: ${to}.`, replacement: null });
  const reviewing = move(built.proposal.review, "in_review", "2026-08-30T12:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const approved = move(reviewing.review, "approved", "2026-08-30T12:02:00.000Z");
  if (!approved.ok) throw new Error(approved.code);
  return approved.review;
}

function approvedIcp() {
  const understanding = approvedUnderstanding();
  const source = {
    version: 1, tenantId: TENANT, workspaceId: WORKSPACE, stableKey: "icp:discovery", revision: 1,
    predecessor: null, createdAt: "2026-08-30T13:00:00.000Z",
    understanding: { tenantId: TENANT, workspaceId: WORKSPACE, versionId: understanding.versionId,
      contentHash: understanding.contentHash, claimSetHash: understanding.claimSetHash,
      reviewHash: understanding.reviewHash, snapshot: understanding,
      authority: { authorityVersion: 1, tenantId: TENANT, workspaceId: WORKSPACE,
        understandingVersionId: understanding.versionId, understandingContentHash: understanding.contentHash,
        understandingClaimSetHash: understanding.claimSetHash, understandingReviewHash: understanding.reviewHash,
        source: understandingSource() } },
    title: "Industrial formulation accounts", segment: "Industrial formulators",
    useCase: "Prioritize formulation changes",
    positiveCriteria: [{ criterionId: "criterion:change", ruleKey: "trigger:change", domain: "buying_trigger",
      rule: "A formulation change creates an active need.", rationale: "The understanding supports industrial buyers.",
      confidenceBasisPoints: 8_500, rationaleRefs: REFS }],
    exclusions: [{ criterionId: "exclusion:consumer", ruleKey: "exclude:consumer", domain: "disqualifier",
      rule: "Exclude consumer-only organizations.", rationale: "The evidence supports an industrial profile.",
      confidenceBasisPoints: 8_000, rationaleRefs: REFS }], uncertainties: [],
  };
  const built = buildIcpProposal(source);
  if (!built.ok) throw new Error(built.code);
  const move = (current: IcpReviewSnapshot, to: "in_review" | "approved", at: string) => transitionIcpReview({
    version: 1, tenantId: TENANT, workspaceId: WORKSPACE, current, expectedVersionId: current.versionId,
    expectedContentHash: current.contentHash, expectedReviewHash: current.reviewHash, to,
    actor: { kind: "human", actorId: REVIEWER }, at, reason: `Human ICP decision: ${to}.`, replacement: null });
  const reviewing = move(built.proposal.review, "in_review", "2026-08-30T13:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const approved = move(reviewing.review, "approved", "2026-08-30T13:02:00.000Z");
  if (!approved.ok) throw new Error(approved.code);
  return { source, review: approved.review };
}

function approvedPlay() {
  const icp = approvedIcp();
  const source = {
    version: 1, tenantId: TENANT, workspaceId: WORKSPACE, stableKey: "lead-play:discovery", revision: 1,
    predecessor: null, createdAt: "2026-08-30T14:00:00.000Z",
    icp: { tenantId: TENANT, workspaceId: WORKSPACE, stableKey: icp.review.stableKey,
      revision: icp.review.revision, supersedesVersionId: icp.review.supersedesVersionId,
      versionId: icp.review.versionId, contentHash: icp.review.contentHash, reviewHash: icp.review.reviewHash,
      understandingVersionId: icp.review.understandingVersionId,
      understandingContentHash: icp.review.understandingContentHash,
      understandingReviewHash: icp.review.understandingReviewHash, snapshot: icp.review, source: icp.source },
    title: "Formulation-change discovery", objective: "Find evidence-backed accounts for human review.",
    motion: "Discover accounts with current formulation-change signals.",
    searchHypotheses: [{ hypothesisId: "hypothesis:change", queryFamily: "industrial-formulation-change",
      statement: "Organizations announcing formulation changes may have an active need.",
      rationale: "The approved ICP identifies formulation change as a buying trigger.", rationaleRefs: REFS }],
    sourceAllowlist: ["customer-list", "google-places"],
    bounds: { maxAccounts: 4, maxProviderRequests: 3, maxSpendCents: 500 }, outreachMode: "draft_only" as const,
    rationaleRefs: REFS, uncertainties: [{ uncertaintyId: "uncertainty:timing",
      statement: "The timing is not yet known.", impact: "Retain review until timing evidence exists.",
      relatedClaimIds: ["claim:buyers"] }],
  };
  const built = buildLeadPlayProposal(source);
  if (!built.ok) throw new Error(built.code);
  const draftReview = built.proposal.review;
  const move = (current: LeadPlayReviewSnapshot, to: "in_review" | "approved", at: string) =>
    transitionLeadPlayReview({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE, current,
      expectedVersionId: current.versionId, expectedContentHash: current.contentHash,
      expectedReviewHash: current.reviewHash, to, actor: { kind: "human", actorId: REVIEWER }, at,
      reason: `Human lead-play decision: ${to}.`, replacement: null });
  const reviewing = move(draftReview, "in_review", "2026-08-30T14:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const approved = move(reviewing.review, "approved", "2026-08-30T14:02:00.000Z");
  if (!approved.ok) throw new Error(approved.code);
  return { source, review: approved.review, draftReview };
}

function activeState(play = approvedPlay()) {
  const binding = Object.freeze({ versionId: play.review.versionId, contentHash: play.review.contentHash,
    reviewHash: play.review.reviewHash, revision: 1, supersedesVersionId: null,
    simulationId: `lead-play-simulation:${"c".repeat(64)}`, simulationHash: HASH_C,
    simulationEligibilityHash: HASH_B });
  const event = Object.freeze({ sequence: 1, action: "activate", fromVersionId: null, to: binding,
    actor: Object.freeze({ kind: "human", actorId: REVIEWER }), at: "2026-08-30T16:01:00.000Z",
    reason: "Human activation after reviewed eligibility and caller-owned checks." });
  const payload = Object.freeze({ stateVersion: 1, tenantId: TENANT, workspaceId: WORKSPACE,
    stableKey: play.review.stableKey, createdAt: "2026-08-30T16:00:00.000Z", active: binding,
    inactive: Object.freeze([]), events: Object.freeze([event]) });
  return Object.freeze({ ...payload, stateHash: sha256(payload) });
}

function inactiveState() {
  const payload = Object.freeze({ stateVersion: 1, tenantId: TENANT, workspaceId: WORKSPACE,
    stableKey: "lead-play:discovery", createdAt: "2026-08-30T16:00:00.000Z", active: null,
    inactive: Object.freeze([]), events: Object.freeze([]) });
  return Object.freeze({ ...payload, stateHash: sha256(payload) });
}

function input(overrides: Record<string, unknown> = {}) {
  const play = approvedPlay();
  return { version: 1, tenantId: TENANT, workspaceId: WORKSPACE, activationState: activeState(play),
    playReview: play.review, playSource: play.source, sourceKeys: ["google-places", "customer-list"],
    limits: { maxAccounts: 4, maxProviderRequests: 2, maxSpendCents: 200 }, ...overrides };
}

afterEach(() => vi.restoreAllMocks());

describe("bounded discovery plan boundary", () => {
  it("deterministically compiles immutable capped tasks without executing anything", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const source = input();
    const first = buildDiscoveryPlan(source);
    expect(first).toEqual(buildDiscoveryPlan({ ...source, sourceKeys: [...source.sourceKeys].reverse() }));
    expect(first).toMatchObject({ ok: true, code: "DISCOVERY_PLAN_CREATED", plan: { status: "plan_only",
      limits: { maxAccounts: 4, maxProviderRequests: 2, maxSpendCents: 200 }, tasks: [
        { sourceKey: "customer-list", hypothesisId: "hypothesis:change", caps: { maxAccounts: 2, maxProviderRequests: 1, maxSpendCents: 100 } },
        { sourceKey: "google-places", hypothesisId: "hypothesis:change", caps: { maxAccounts: 2, maxProviderRequests: 1, maxSpendCents: 100 } },
      ] } });
    if (!first.ok) return;
    expect(first.plan.planId).toBe(`discovery-plan:${first.plan.planHash.slice("sha256:".length)}`);
    expect(first.plan.tasks[0]?.rationaleRefs).toEqual(REFS);
    expect(first.plan.tasks[0]?.uncertaintyIds).toEqual(["uncertainty:timing"]);
    expect(Object.isFrozen(first.plan.tasks[0]?.caps)).toBe(true);
    expect(first.plan).not.toHaveProperty("simulation");
    expect(first.plan).not.toHaveProperty("activationAuthority");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires an exact active approved same-scope play", () => {
    const baseline = input();
    expect(buildDiscoveryPlan({ ...baseline, activationState: inactiveState() })).toEqual({ ok: false, code: "INACTIVE_PLAY" });
    expect(buildDiscoveryPlan({ ...baseline, tenantId: FOREIGN })).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(buildDiscoveryPlan({ ...baseline, activationState: { ...baseline.activationState, stateHash: HASH_A } }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildDiscoveryPlan({ ...baseline, playSource: { ...baseline.playSource, title: "Fabricated title" } }))
      .toEqual({ ok: false, code: "STALE_ACTIVATION" });
    const play = approvedPlay();
    expect(buildDiscoveryPlan({ ...baseline, playReview: play.draftReview })).toEqual({ ok: false, code: "PLAY_NOT_APPROVED" });
  });

  it("rejects unsupported, duplicate, and over-budget plans", () => {
    const baseline = input();
    expect(buildDiscoveryPlan({ ...baseline, sourceKeys: ["unsupported-provider"] })).toEqual({ ok: false, code: "UNSUPPORTED_SOURCE" });
    expect(buildDiscoveryPlan({ ...baseline, sourceKeys: ["google-places", "google-places"] })).toEqual({ ok: false, code: "DUPLICATE_ITEM" });
    for (const limits of [
      { maxAccounts: 5, maxProviderRequests: 2, maxSpendCents: 200 },
      { maxAccounts: 4, maxProviderRequests: 4, maxSpendCents: 200 },
      { maxAccounts: 4, maxProviderRequests: 2, maxSpendCents: 501 },
      { maxAccounts: 1, maxProviderRequests: 2, maxSpendCents: 200 },
    ]) expect(buildDiscoveryPlan({ ...baseline, limits })).toEqual({ ok: false, code: "BOUNDS_EXCEEDED" });
  });

  it("rejects extra fields, accessors, and proxies without invoking traps", () => {
    const baseline = input();
    expect(buildDiscoveryPlan({ ...baseline, simulation: {} })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    let traps = 0;
    const trap = (): never => { traps += 1; throw new Error("must not execute"); };
    const proxied = new Proxy(baseline, { getPrototypeOf: trap });
    const accessor = input();
    Object.defineProperty(accessor.limits, "maxSpendCents", { enumerable: true, get: trap });
    for (const hostile of [proxied, accessor]) expect(buildDiscoveryPlan(hostile)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(traps).toBe(0);
  });
});
