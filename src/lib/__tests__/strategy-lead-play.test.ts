import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildIcpProposal,
  transitionIcpReview,
  type IcpReviewSnapshot,
} from "@/lib/strategy/icp";
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
const WORKSPACE_B = "20000000-0000-4000-8000-000000000002";
const REVIEWER_A = "30000000-0000-4000-8000-000000000001";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function understandingSource(
  tenantId = TENANT_A,
  workspaceId: string | null = WORKSPACE_A,
) {
  return {
    version: 1,
    tenantId,
    workspaceId,
    proposalRef: "understanding:lead-play-source-1",
    revision: 1,
    supersedesProposalRef: null,
    supersedesVersionId: null,
    createdAt: "2026-08-30T12:00:00.000Z",
    producer: {
      runRef: "agent-run:understanding-lead-play-source-1",
      runInputHash: HASH_A,
      agentVersion: "understanding-synthesizer:v1",
      modelRef: "fixture:openai-responses-stub",
      promptRef: "business-understanding@1",
      promptHash: HASH_A,
      policyRef: "evidence-policy:v1",
      policyHash: HASH_B,
    },
    evidence: [{
      evidenceId: "evidence:catalog-1",
      tenantId,
      workspaceId,
      sourceVersionRef: "document-version:catalog-1",
      locator: "page=2#segment",
      contentHash: HASH_A,
      grade: "direct_observation",
      freshness: "current",
    }],
    claims: [{
      claimId: "claim:industrial-buyers",
      claimVersion: 1,
      tenantId,
      workspaceId,
      domain: "customer_types",
      claimClass: "identity",
      subject: "Industrial buyers",
      statement: "The catalog targets industrial formulators.",
      origin: "observed",
      status: "supported",
      confidenceBasisPoints: 9_000,
      material: true,
      evidenceIds: ["evidence:catalog-1"],
      uncertaintyReason: null,
    }],
  };
}

function approvedUnderstanding(
  tenantId = TENANT_A,
  workspaceId: string | null = WORKSPACE_A,
): BusinessUnderstandingReviewSnapshot {
  const created = buildBusinessUnderstandingProposal(understandingSource(tenantId, workspaceId));
  if (!created.ok) throw new Error(`understanding fixture failed: ${created.code}`);
  const transition = (current: BusinessUnderstandingReviewSnapshot, to: "in_review" | "approved", at: string) =>
    transitionBusinessUnderstandingReview({
      version: 1,
      tenantId,
      workspaceId,
      current,
      expectedVersionId: current.versionId,
      expectedContentHash: current.contentHash,
      expectedReviewHash: current.reviewHash,
      to,
      actor: { kind: "human", actorId: REVIEWER_A },
      at,
      reason: `Human understanding decision: ${to}.`,
      replacement: null,
    });
  const inReview = transition(created.proposal.review, "in_review", "2026-08-30T12:01:00.000Z");
  if (!inReview.ok) throw new Error(`understanding review failed: ${inReview.code}`);
  const approved = transition(inReview.review, "approved", "2026-08-30T12:02:00.000Z");
  if (!approved.ok) throw new Error(`understanding approval failed: ${approved.code}`);
  return approved.review;
}

function rationaleRefs() {
  return [{ claimId: "claim:industrial-buyers", evidenceId: "evidence:catalog-1" }];
}

function icpSource(
  tenantId = TENANT_A,
  workspaceId: string | null = WORKSPACE_A,
) {
  const understanding = approvedUnderstanding(tenantId, workspaceId);
  return {
    version: 1,
    tenantId,
    workspaceId,
    stableKey: "icp:industrial-formulators",
    revision: 1,
    predecessor: null,
    createdAt: "2026-08-30T13:00:00.000Z",
    understanding: {
      tenantId,
      workspaceId,
      versionId: understanding.versionId,
      contentHash: understanding.contentHash,
      claimSetHash: understanding.claimSetHash,
      reviewHash: understanding.reviewHash,
      snapshot: understanding,
      authority: {
        authorityVersion: 1,
        tenantId,
        workspaceId,
        understandingVersionId: understanding.versionId,
        understandingContentHash: understanding.contentHash,
        understandingClaimSetHash: understanding.claimSetHash,
        understandingReviewHash: understanding.reviewHash,
        source: understandingSource(tenantId, workspaceId),
      },
    },
    title: "Industrial formulators in an active product-change cycle",
    segment: "Industrial formulators evaluating formulation changes",
    useCase: "Prioritize evidence-backed reformulation opportunities",
    positiveCriteria: [{
      criterionId: "criterion:buying-trigger",
      ruleKey: "buying-trigger:formulation-change",
      domain: "buying_trigger",
      rule: "A formulation change creates an active need.",
      rationale: "The approved understanding identifies supported industrial buyers.",
      confidenceBasisPoints: 8_500,
      rationaleRefs: rationaleRefs(),
    }],
    exclusions: [{
      criterionId: "exclusion:consumer-only",
      ruleKey: "disqualifier:consumer-only",
      domain: "disqualifier",
      rule: "Exclude consumer-only organizations.",
      rationale: "The cited evidence supports an industrial buyer profile.",
      confidenceBasisPoints: 8_000,
      rationaleRefs: rationaleRefs(),
    }],
    uncertainties: [],
  };
}

function approvedIcp(
  tenantId = TENANT_A,
  workspaceId: string | null = WORKSPACE_A,
): Readonly<{ source: ReturnType<typeof icpSource>; review: IcpReviewSnapshot }> {
  const source = icpSource(tenantId, workspaceId);
  const created = buildIcpProposal(source);
  if (!created.ok) throw new Error(`ICP fixture failed: ${created.code}`);
  const transition = (current: IcpReviewSnapshot, to: "in_review" | "approved", at: string) =>
    transitionIcpReview({
      version: 1,
      tenantId,
      workspaceId,
      current,
      expectedVersionId: current.versionId,
      expectedContentHash: current.contentHash,
      expectedReviewHash: current.reviewHash,
      to,
      actor: { kind: "human", actorId: REVIEWER_A },
      at,
      reason: `Human ICP decision: ${to}.`,
      replacement: null,
    });
  const inReview = transition(created.proposal.review, "in_review", "2026-08-30T13:01:00.000Z");
  if (!inReview.ok) throw new Error(`ICP review failed: ${inReview.code}`);
  const approved = transition(inReview.review, "approved", "2026-08-30T13:02:00.000Z");
  if (!approved.ok) throw new Error(`ICP approval failed: ${approved.code}`);
  return Object.freeze({ source, review: approved.review });
}

function icpBinding(approved = approvedIcp()) {
  const snapshot = approved.review;
  return {
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    stableKey: snapshot.stableKey,
    revision: snapshot.revision,
    supersedesVersionId: snapshot.supersedesVersionId,
    versionId: snapshot.versionId,
    contentHash: snapshot.contentHash,
    reviewHash: snapshot.reviewHash,
    understandingVersionId: snapshot.understandingVersionId,
    understandingContentHash: snapshot.understandingContentHash,
    understandingReviewHash: snapshot.understandingReviewHash,
    snapshot,
    source: approved.source,
  };
}

function hypothesis(overrides: Record<string, unknown> = {}) {
  return {
    hypothesisId: "hypothesis:formulation-change",
    queryFamily: "industrial-formulators-with-active-product-change",
    statement: "Organizations announcing formulation changes may have an active replacement need.",
    rationale: "The approved ICP identifies formulation change as a buying trigger.",
    rationaleRefs: rationaleRefs(),
    ...overrides,
  };
}

function uncertainty(overrides: Record<string, unknown> = {}) {
  return {
    uncertaintyId: "uncertainty:change-timing",
    statement: "The timing of each formulation change is not yet known.",
    impact: "Keep accounts in human review until current timing evidence is available.",
    relatedClaimIds: ["claim:industrial-buyers"],
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    stableKey: "lead-play:formulation-change",
    revision: 1,
    predecessor: null,
    createdAt: "2026-08-30T14:00:00.000Z",
    icp: icpBinding(),
    title: "Formulation-change discovery",
    objective: "Find evidence-backed industrial formulation-change opportunities for human review.",
    motion: "Discover and qualify accounts with current formulation-change signals.",
    searchHypotheses: [hypothesis()],
    sourceAllowlist: ["google-places", "customer-approved-url"],
    bounds: { maxAccounts: 100, maxProviderRequests: 25, maxSpendCents: 2_500 },
    outreachMode: "draft_only",
    rationaleRefs: rationaleRefs(),
    uncertainties: [uncertainty()],
    ...overrides,
  };
}

function reviewTransition(
  current: LeadPlayReviewSnapshot,
  to: "in_review" | "approved" | "rejected" | "superseded",
  at: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    current,
    expectedVersionId: current.versionId,
    expectedContentHash: current.contentHash,
    expectedReviewHash: current.reviewHash,
    to,
    actor: { kind: "human", actorId: REVIEWER_A },
    at,
    reason: `Human lead-play decision: ${to}.`,
    replacement: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lead-play proposal and review boundary", () => {
  it("builds a deterministic immutable bounded draft from one approved ICP without side effects", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const source = input();
    const first = buildLeadPlayProposal(source);
    const reordered = buildLeadPlayProposal({
      ...source,
      sourceAllowlist: [...source.sourceAllowlist].reverse(),
    });

    expect(first).toEqual(reordered);
    expect(first).toMatchObject({
      ok: true,
      code: "LEAD_PLAY_PROPOSAL_CREATED",
      proposal: {
        schemaVersion: 1,
        stableKey: "lead-play:formulation-change",
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        revision: 1,
        status: "review_required",
        outreachMode: "draft_only",
        sourceAllowlist: ["customer-approved-url", "google-places"],
        bounds: { maxAccounts: 100, maxProviderRequests: 25, maxSpendCents: 2_500 },
        searchHypotheses: [{ hypothesisId: "hypothesis:formulation-change" }],
        uncertainties: [{ uncertaintyId: "uncertainty:change-timing" }],
        review: { status: "draft", events: [] },
      },
    });
    if (!first.ok) return;
    expect(first.proposal.versionId)
      .toBe(`lead-play-version:${first.proposal.contentHash.slice("sha256:".length)}`);
    expect(first.proposal.icp.status).toBe("approved");
    expect(Object.isFrozen(first.proposal)).toBe(true);
    expect(Object.isFrozen(first.proposal.searchHypotheses)).toBe(true);
    expect(Object.isFrozen(first.proposal.searchHypotheses[0]?.rationaleRefs)).toBe(true);
    expect(first.proposal).not.toHaveProperty("activation");
    expect(first.proposal).not.toHaveProperty("providerResult");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("requires a valid approved ICP, exact scope, hash, and understanding lineage", () => {
    const binding = icpBinding();
    const draft = structuredClone(binding.snapshot) as unknown as {
      status: string;
      events: unknown[];
      replacementVersionId: null;
    };
    draft.status = "draft";
    draft.events = [];
    draft.replacementVersionId = null;
    expect(buildLeadPlayProposal(input({ icp: { ...binding, snapshot: draft } })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });

    expect(buildLeadPlayProposal(input({ icp: { ...binding, reviewHash: HASH_B } })))
      .toEqual({ ok: false, code: "STALE_ICP" });
    expect(buildLeadPlayProposal(input({ icp: { ...binding, understandingReviewHash: HASH_B } })))
      .toEqual({ ok: false, code: "STALE_ICP" });
    const staleSource = structuredClone(binding);
    staleSource.source.title = "A different ICP source payload";
    expect(buildLeadPlayProposal(input({ icp: staleSource })))
      .toEqual({ ok: false, code: "STALE_ICP" });
    expect(buildLeadPlayProposal(input({ tenantId: TENANT_B })))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });

    const foreign = approvedIcp(TENANT_B, WORKSPACE_B);
    expect(buildLeadPlayProposal(input({ icp: icpBinding(foreign) })))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });
  });

  it("requires explicit source, budget, evidence, and uncertainty bounds", () => {
    expect(buildLeadPlayProposal(input({ sourceAllowlist: [] })))
      .toEqual({ ok: false, code: "UNBOUNDED_PLAY" });
    expect(buildLeadPlayProposal(input({ bounds: { maxAccounts: 0, maxProviderRequests: 25, maxSpendCents: 0 } })))
      .toEqual({ ok: false, code: "UNBOUNDED_PLAY" });
    expect(buildLeadPlayProposal(input({ searchHypotheses: [] })))
      .toEqual({ ok: false, code: "UNBOUNDED_PLAY" });
    expect(buildLeadPlayProposal(input({ rationaleRefs: [] })))
      .toEqual({ ok: false, code: "MISSING_RATIONALE_REFERENCE" });
    expect(buildLeadPlayProposal(input({
      rationaleRefs: [{ claimId: "claim:fabricated", evidenceId: "evidence:catalog-1" }],
    }))).toEqual({ ok: false, code: "MISSING_RATIONALE_REFERENCE" });
    expect(buildLeadPlayProposal(input({ uncertainties: Array.from({ length: 17 }, (_, index) => uncertainty({ uncertaintyId: `uncertainty:${index}` })) })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildLeadPlayProposal(input({ outreachMode: "automatic_send" }))).toEqual({
      ok: false,
      code: "AUTOMATIC_OUTREACH_FORBIDDEN",
    });
  });

  it("fails closed on duplicates, unsafe content, proxies, and accessors", () => {
    expect(buildLeadPlayProposal(input({ sourceAllowlist: ["google-places", "google-places"] })))
      .toEqual({ ok: false, code: "DUPLICATE_ITEM" });
    expect(buildLeadPlayProposal(input({
      searchHypotheses: [hypothesis(), hypothesis()],
    }))).toEqual({ ok: false, code: "DUPLICATE_ITEM" });
    expect(buildLeadPlayProposal(input({
      searchHypotheses: [
        hypothesis({ hypothesisId: "hypothesis:first", queryFamily: "family:first" }),
        hypothesis({
          hypothesisId: "hypothesis:second",
          queryFamily: "family:second",
          statement: "ORGANIZATIONS ANNOUNCING FORMULATION CHANGES MAY HAVE AN ACTIVE REPLACEMENT NEED.",
        }),
      ],
    }))).toEqual({ ok: false, code: "DUPLICATE_ITEM" });
    expect(buildLeadPlayProposal(input({ title: "Target buyers by religion" })))
      .toEqual({ ok: false, code: "UNSAFE_PLAY" });
    expect(buildLeadPlayProposal(input({ title: "Target buyers by ｒｅｌｉｇｉｏｎ" })))
      .toEqual({ ok: false, code: "UNSAFE_PLAY" });
    expect(buildLeadPlayProposal(input({ title: "Target buyers by rel\u034figion" })).ok).toBe(false);
    expect(buildLeadPlayProposal(input({ title: "Target buyers by reli\u0301gion" })))
      .toEqual({ ok: false, code: "UNSAFE_PLAY" });
    expect(buildLeadPlayProposal(input({
      searchHypotheses: [hypothesis({ hypothesisId: "hypothesis:religion" })],
    }))).toEqual({ ok: false, code: "UNSAFE_PLAY" });
    expect(buildLeadPlayProposal(input({
      searchHypotheses: [hypothesis({ queryFamily: "target-buyers-by-religion" })],
    }))).toEqual({ ok: false, code: "UNSAFE_PLAY" });
    expect(buildLeadPlayProposal(input({
      searchHypotheses: [hypothesis({ hypothesisId: "hypothesis:ordinary-market", queryFamily: "ordinary-market" })],
    }))).toMatchObject({ ok: true, code: "LEAD_PLAY_PROPOSAL_CREATED" });
    expect(buildLeadPlayProposal({ ...input(), activate: true })).toEqual({ ok: false, code: "MALFORMED_INPUT" });

    let executions = 0;
    const trap = (): never => {
      executions += 1;
      throw new Error("must not execute");
    };
    const topProxy = new Proxy(input(), { getPrototypeOf: trap });
    const nestedProxy = input();
    nestedProxy.searchHypotheses[0] = new Proxy(nestedProxy.searchHypotheses[0], { getPrototypeOf: trap });
    const accessor = input();
    Object.defineProperty(accessor.bounds, "maxAccounts", { enumerable: true, get: trap });
    for (const value of [topProxy, nestedProxy, accessor]) {
      expect(buildLeadPlayProposal(value)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }
    expect(executions).toBe(0);
  });

  it("records only ordered human review branches and protects stale versions", () => {
    const created = buildLeadPlayProposal(input());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const draft = created.proposal.review;

    expect(transitionLeadPlayReview(reviewTransition(
      draft,
      "approved",
      "2026-08-30T14:01:00.000Z",
    ))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(transitionLeadPlayReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-30T14:01:00.000Z",
      { actor: { kind: "agent", actorId: REVIEWER_A } },
    ))).toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
    expect(transitionLeadPlayReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-30T14:01:00.000Z",
      { expectedReviewHash: HASH_B },
    ))).toEqual({ ok: false, code: "STALE_VERSION" });
    expect(transitionLeadPlayReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-30T14:01:00.000Z",
      { tenantId: TENANT_B },
    ))).toEqual({ ok: false, code: "SCOPE_MISMATCH" });

    const inReview = transitionLeadPlayReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-30T14:01:00.000Z",
    ));
    expect(inReview).toMatchObject({ ok: true, review: { status: "in_review" } });
    if (!inReview.ok) return;
    expect(transitionLeadPlayReview(reviewTransition(
      inReview.review,
      "rejected",
      "2026-08-30T14:02:00.000Z",
    ))).toMatchObject({ ok: true, review: { status: "rejected" } });
    const approved = transitionLeadPlayReview(reviewTransition(
      inReview.review,
      "approved",
      "2026-08-30T14:02:00.000Z",
    ));
    expect(approved).toMatchObject({ ok: true, review: { status: "approved" } });
    if (!approved.ok) return;

    for (const predecessor of [{
      predecessorVersion: 1,
      stableKey: "lead-play:unrelated",
      revision: 1,
      supersedesVersionId: null,
      review: approved.review,
    }, {
      predecessorVersion: 1,
      stableKey: "lead-play:formulation-change",
      revision: 999,
      supersedesVersionId: null,
      review: approved.review,
    }]) {
      expect(buildLeadPlayProposal(input({
        revision: 2,
        predecessor,
        createdAt: "2026-08-30T14:03:00.000Z",
      }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }

    const replacementDraft = buildLeadPlayProposal(input({
      revision: 2,
      predecessor: {
        predecessorVersion: 1,
        stableKey: "lead-play:formulation-change",
        revision: 1,
        supersedesVersionId: null,
        review: approved.review,
      },
      createdAt: "2026-08-30T14:03:00.000Z",
      title: "Formulation-change discovery, revised",
    }));
    expect(replacementDraft.ok).toBe(true);
    if (!replacementDraft.ok) return;
    const replacementInReview = transitionLeadPlayReview(reviewTransition(
      replacementDraft.proposal.review,
      "in_review",
      "2026-08-30T14:04:00.000Z",
    ));
    expect(replacementInReview.ok).toBe(true);
    if (!replacementInReview.ok) return;
    const replacementApproved = transitionLeadPlayReview(reviewTransition(
      replacementInReview.review,
      "approved",
      "2026-08-30T14:05:00.000Z",
    ));
    expect(replacementApproved.ok).toBe(true);
    if (!replacementApproved.ok) return;
    expect(transitionLeadPlayReview(reviewTransition(
      approved.review,
      "superseded",
      "2026-08-30T14:06:00.000Z",
      {
        replacement: {
          replacementVersion: 1,
          supersedesVersionId: approved.review.versionId,
          review: replacementApproved.review,
        },
      },
    ))).toMatchObject({
      ok: true,
      review: { status: "superseded", replacementVersionId: replacementApproved.review.versionId },
    });
    expect(draft.status).toBe("draft");
  });
});
