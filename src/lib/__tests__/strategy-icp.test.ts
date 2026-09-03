import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildIcpProposal,
  transitionIcpReview,
  type IcpReviewSnapshot,
} from "@/lib/strategy/icp";
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
    proposalRef: "understanding:icp-source-1",
    revision: 1,
    supersedesProposalRef: null,
    supersedesVersionId: null,
    createdAt: "2026-08-30T12:00:00.000Z",
    producer: {
      runRef: "agent-run:understanding-icp-source-1",
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

function draftUnderstanding(
  tenantId = TENANT_A,
  workspaceId: string | null = WORKSPACE_A,
): BusinessUnderstandingReviewSnapshot {
  const result = buildBusinessUnderstandingProposal(understandingSource(tenantId, workspaceId));
  if (!result.ok) throw new Error(`understanding fixture failed: ${result.code}`);
  return result.proposal.review;
}

function understandingTransition(
  current: BusinessUnderstandingReviewSnapshot,
  to: "in_review" | "approved",
  at: string,
) {
  return {
    version: 1,
    tenantId: current.tenantId,
    workspaceId: current.workspaceId,
    current,
    expectedVersionId: current.versionId,
    expectedContentHash: current.contentHash,
    expectedReviewHash: current.reviewHash,
    to,
    actor: { kind: "human", actorId: REVIEWER_A },
    at,
    reason: `Human understanding decision: ${to}.`,
    replacement: null,
  };
}

function approvedUnderstanding(
  tenantId = TENANT_A,
  workspaceId: string | null = WORKSPACE_A,
): BusinessUnderstandingReviewSnapshot {
  const draft = draftUnderstanding(tenantId, workspaceId);
  const inReview = transitionBusinessUnderstandingReview(understandingTransition(
    draft,
    "in_review",
    "2026-08-30T12:01:00.000Z",
  ));
  if (!inReview.ok) throw new Error(`understanding review fixture failed: ${inReview.code}`);
  const approved = transitionBusinessUnderstandingReview(understandingTransition(
    inReview.review,
    "approved",
    "2026-08-30T12:02:00.000Z",
  ));
  if (!approved.ok) throw new Error(`understanding approval fixture failed: ${approved.code}`);
  return approved.review;
}

function understandingBinding(snapshot = approvedUnderstanding()) {
  return {
    tenantId: snapshot.tenantId,
    workspaceId: snapshot.workspaceId,
    versionId: snapshot.versionId,
    contentHash: snapshot.contentHash,
    claimSetHash: snapshot.claimSetHash,
    reviewHash: snapshot.reviewHash,
    snapshot,
    authority: {
      authorityVersion: 1,
      tenantId: snapshot.tenantId,
      workspaceId: snapshot.workspaceId,
      understandingVersionId: snapshot.versionId,
      understandingContentHash: snapshot.contentHash,
      understandingClaimSetHash: snapshot.claimSetHash,
      understandingReviewHash: snapshot.reviewHash,
      source: understandingSource(snapshot.tenantId, snapshot.workspaceId),
    },
  };
}

function rationaleRefs() {
  return [{ claimId: "claim:industrial-buyers", evidenceId: "evidence:catalog-1" }];
}

function positive(overrides: Record<string, unknown> = {}) {
  return {
    criterionId: "criterion:buying-trigger",
    ruleKey: "buying-trigger:formulation-change",
    domain: "buying_trigger",
    rule: "A formulation change creates an active need for a replacement component.",
    rationale: "The approved understanding identifies industrial formulators as supported buyers.",
    confidenceBasisPoints: 8_500,
    rationaleRefs: rationaleRefs(),
    ...overrides,
  };
}

function exclusion(overrides: Record<string, unknown> = {}) {
  return {
    criterionId: "exclusion:consumer-only",
    ruleKey: "disqualifier:consumer-only",
    domain: "disqualifier",
    rule: "Exclude organizations serving only consumer retail demand.",
    rationale: "The approved evidence supports an industrial, not consumer-only, buyer profile.",
    confidenceBasisPoints: 8_000,
    rationaleRefs: rationaleRefs(),
    ...overrides,
  };
}

function uncertainty(overrides: Record<string, unknown> = {}) {
  return {
    uncertaintyId: "uncertainty:minimum-capability",
    domain: "size_capability",
    statement: "The minimum technical evaluation capability is not yet known.",
    impact: "Qualification must retain review when capability cannot be established.",
    relatedClaimIds: ["claim:industrial-buyers"],
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    stableKey: "icp:industrial-formulators",
    revision: 1,
    predecessor: null,
    createdAt: "2026-08-30T13:00:00.000Z",
    understanding: understandingBinding(),
    title: "Industrial formulators in an active product-change cycle",
    segment: "Industrial formulators evaluating component or formulation changes",
    useCase: "Prioritize evidence-backed replacement and reformulation opportunities",
    positiveCriteria: [
      positive(),
      positive({
        criterionId: "criterion:geography",
        ruleKey: "geography:approved-market",
        domain: "geography",
        rule: "The organization operates in a market explicitly approved for this ICP.",
      }),
    ],
    exclusions: [exclusion()],
    uncertainties: [uncertainty()],
    ...overrides,
  };
}

function reviewTransition(
  current: IcpReviewSnapshot,
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
    reason: `Human ICP decision: ${to}.`,
    replacement: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ICP proposal and review boundary", () => {
  it("builds one deterministic immutable draft from an approved understanding without side effects", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const source = input();
    const first = buildIcpProposal(source);
    const reordered = buildIcpProposal({
      ...source,
      positiveCriteria: [...source.positiveCriteria].reverse(),
    });

    expect(first).toEqual(reordered);
    expect(first).toMatchObject({
      ok: true,
      code: "ICP_PROPOSAL_CREATED",
      proposal: {
        schemaVersion: 1,
        stableKey: "icp:industrial-formulators",
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        revision: 1,
        status: "review_required",
        title: "Industrial formulators in an active product-change cycle",
        positiveCriteria: [
          { ruleKey: "buying-trigger:formulation-change", rationaleRefs: rationaleRefs() },
          { ruleKey: "geography:approved-market" },
        ],
        exclusions: [{ ruleKey: "disqualifier:consumer-only" }],
        uncertainties: [{ uncertaintyId: "uncertainty:minimum-capability" }],
        review: { status: "draft", events: [] },
      },
    });
    if (!first.ok) return;
    expect(first.proposal.versionId).toBe(`icp-version:${first.proposal.contentHash.slice("sha256:".length)}`);
    expect(first.proposal.understanding.status).toBe("approved");
    expect(Object.isFrozen(first.proposal)).toBe(true);
    expect(Object.isFrozen(first.proposal.positiveCriteria)).toBe(true);
    expect(Object.isFrozen(first.proposal.positiveCriteria[0]?.rationaleRefs)).toBe(true);
    expect(first.proposal).not.toHaveProperty("activation");
    expect(first.proposal).not.toHaveProperty("provider");
    expect(first.proposal).not.toHaveProperty("tools");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the same generic contract for a non-industrial advisory ICP", () => {
    const result = buildIcpProposal(input({
      stableKey: "icp:advisory-operators",
      title: "Advisory operators preparing a process redesign",
      segment: "Professional-services operators with a documented redesign job",
      useCase: "Prioritize assessment-led advisory engagements",
      positiveCriteria: [positive({
        criterionId: "criterion:job",
        ruleKey: "job:process-redesign",
        domain: "job",
        rule: "A documented process-redesign job is active.",
        rationale: "The approved understanding supports a documented operator job.",
      })],
      exclusions: [exclusion({
        criterionId: "exclusion:no-decision-owner",
        ruleKey: "disqualifier:no-decision-owner",
        rule: "Exclude opportunities with no identified process decision owner.",
        rationale: "The approved rationale requires an accountable decision role.",
      })],
      uncertainties: [],
    }));

    expect(result).toMatchObject({
      ok: true,
      proposal: { positiveCriteria: [{ domain: "job" }], exclusions: [{ domain: "disqualifier" }] },
    });
    expect(JSON.stringify(result)).not.toMatch(/chemical|epoxy|formulator/i);
  });

  it("requires an internally valid approved understanding and exact binding", () => {
    const draft = draftUnderstanding();
    expect(buildIcpProposal(input({ understanding: understandingBinding(draft) })))
      .toEqual({ ok: false, code: "UNDERSTANDING_NOT_APPROVED" });

    const stale = structuredClone(input());
    stale.understanding.reviewHash = HASH_B;
    expect(buildIcpProposal(stale)).toEqual({ ok: false, code: "STALE_UNDERSTANDING" });

    const wrongScope = structuredClone(input());
    wrongScope.understanding.tenantId = TENANT_B;
    expect(buildIcpProposal(wrongScope)).toEqual({ ok: false, code: "SCOPE_MISMATCH" });

    const foreign = approvedUnderstanding(TENANT_B, WORKSPACE_B);
    expect(buildIcpProposal(input({ understanding: understandingBinding(foreign) })))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });
  });

  it("rejects duplicate, contradictory, and missing rationale references", () => {
    const duplicate = structuredClone(input());
    duplicate.positiveCriteria.push(structuredClone(duplicate.positiveCriteria[0]));
    expect(buildIcpProposal(duplicate)).toEqual({ ok: false, code: "DUPLICATE_RULE" });

    const contradiction = structuredClone(input());
    contradiction.exclusions[0].ruleKey = contradiction.positiveCriteria[0].ruleKey;
    expect(buildIcpProposal(contradiction)).toEqual({ ok: false, code: "CONTRADICTORY_RULE" });

    const missing = structuredClone(input());
    missing.positiveCriteria[0].rationaleRefs = [];
    expect(buildIcpProposal(missing)).toEqual({ ok: false, code: "MISSING_RATIONALE_REFERENCE" });

    const duplicateReference = structuredClone(input());
    duplicateReference.exclusions[0].rationaleRefs.push(
      structuredClone(duplicateReference.exclusions[0].rationaleRefs[0]),
    );
    expect(buildIcpProposal(duplicateReference)).toEqual({ ok: false, code: "DUPLICATE_RULE" });
  });

  it("rejects unresolved claim/evidence pairs and uncertainty claims against the bound authority", () => {
    const unknownEvidence = structuredClone(input());
    unknownEvidence.positiveCriteria[0].rationaleRefs[0].evidenceId = "evidence:invented";
    expect(buildIcpProposal(unknownEvidence)).toEqual({ ok: false, code: "MISSING_RATIONALE_REFERENCE" });

    const forgedCatalog = structuredClone(input());
    forgedCatalog.understanding.authority.source.claims[0].claimId = "claim:invented";
    expect(buildIcpProposal(forgedCatalog)).toEqual({ ok: false, code: "MALFORMED_INPUT" });

    const unknownClaim = structuredClone(input());
    unknownClaim.uncertainties[0].relatedClaimIds = ["claim:invented"];
    expect(buildIcpProposal(unknownClaim)).toEqual({ ok: false, code: "MISSING_RATIONALE_REFERENCE" });

    const staleAuthority = structuredClone(input());
    staleAuthority.understanding.authority.understandingReviewHash = HASH_B;
    expect(buildIcpProposal(staleAuthority)).toEqual({ ok: false, code: "STALE_UNDERSTANDING" });
  });

  it("uses canonical text fingerprints across keys and positive/exclusion sets", () => {
    const duplicateText = structuredClone(input());
    duplicateText.positiveCriteria.push(positive({
      criterionId: "criterion:copy",
      ruleKey: "buying-trigger:different-key",
    }));
    expect(buildIcpProposal(duplicateText)).toEqual({ ok: false, code: "DUPLICATE_RULE" });

    const crossSetText = structuredClone(input());
    crossSetText.exclusions[0].rule = crossSetText.positiveCriteria[0].rule.toUpperCase();
    expect(buildIcpProposal(crossSetText)).toEqual({ ok: false, code: "CONTRADICTORY_RULE" });
  });

  it.each([
    ["extra field", { ...input(), activate: true }],
    ["empty positive criteria", input({ positiveCriteria: [] })],
    ["empty exclusions", input({ exclusions: [] })],
    ["unsafe targeting", input({ positiveCriteria: [positive({ rule: "Target buyers by race and religion." })] })],
    ["secret-bearing rationale", input({ exclusions: [exclusion({ rationale: "API_KEY=not-a-real-secret" })] })],
    ["invalid confidence", input({ positiveCriteria: [positive({ confidenceBasisPoints: 10_001 })] })],
    ["default ignorable", input({ title: "Industrial\u034fformulators" })],
    ["bidi control", input({ segment: "Industrial\u202eformulators" })],
    ["NFKC secret", input({ useCase: "ＡＰＩ＿ＫＥＹ＝not-a-real-secret" })],
  ])("fails closed on malformed or unsafe %s", (_label, malformed) => {
    expect(buildIcpProposal(malformed).ok).toBe(false);
  });

  it("rejects proxies and accessors without invoking their traps or getters", () => {
    let executions = 0;
    const trap = (): never => {
      executions += 1;
      throw new Error("must not execute");
    };
    const topProxy = new Proxy(input(), { getPrototypeOf: trap });
    const nestedProxy = input();
    nestedProxy.positiveCriteria[0] = new Proxy(nestedProxy.positiveCriteria[0], { getPrototypeOf: trap });
    const accessor = input();
    Object.defineProperty(accessor.exclusions[0], "rule", { enumerable: true, get: trap });

    const authorityProxy = input();
    authorityProxy.understanding.authority = new Proxy(authorityProxy.understanding.authority, { getPrototypeOf: trap });
    const authorityAccessor = input();
    Object.defineProperty(authorityAccessor.understanding.authority.source.claims[0], "claimId", {
      enumerable: true,
      get: trap,
    });

    for (const value of [topProxy, nestedProxy, accessor, authorityProxy, authorityAccessor]) {
      expect(buildIcpProposal(value)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }
    expect(executions).toBe(0);
  });

  it("records immutable human review, rejection, approval, and supersession branches", () => {
    const created = buildIcpProposal(input());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const inReview = transitionIcpReview(reviewTransition(
      created.proposal.review,
      "in_review",
      "2026-08-30T13:01:00.000Z",
    ));
    expect(inReview).toMatchObject({ ok: true, review: { status: "in_review", events: [{ to: "in_review" }] } });
    if (!inReview.ok) return;
    expect(transitionIcpReview(reviewTransition(
      inReview.review,
      "rejected",
      "2026-08-30T13:02:00.000Z",
    ))).toMatchObject({ ok: true, review: { status: "rejected" } });

    const approved = transitionIcpReview(reviewTransition(
      inReview.review,
      "approved",
      "2026-08-30T13:02:00.000Z",
    ));
    expect(approved).toMatchObject({
      ok: true,
      review: { status: "approved", events: [{}, { actor: { kind: "human", actorId: REVIEWER_A } }] },
    });
    if (!approved.ok) return;
    const replacement = buildIcpProposal(input({
      revision: 2,
      predecessor: {
        predecessorVersion: 1,
        stableKey: created.proposal.stableKey,
        revision: created.proposal.revision,
        supersedesVersionId: created.proposal.supersedesVersionId,
        review: approved.review,
      },
      createdAt: "2026-08-30T13:03:00.000Z",
      title: "Industrial formulators in a verified product-change cycle",
    }));
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) return;
    const replacementInReview = transitionIcpReview(reviewTransition(
      replacement.proposal.review,
      "in_review",
      "2026-08-30T13:04:00.000Z",
    ));
    if (!replacementInReview.ok) throw new Error(replacementInReview.code);
    const replacementApproved = transitionIcpReview(reviewTransition(
      replacementInReview.review,
      "approved",
      "2026-08-30T13:05:00.000Z",
    ));
    if (!replacementApproved.ok) throw new Error(replacementApproved.code);
    expect(transitionIcpReview(reviewTransition(
      approved.review,
      "superseded",
      "2026-08-30T13:06:00.000Z",
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
    expect(created.proposal.review.status).toBe("draft");
    expect(inReview.review.status).toBe("in_review");
  });

  it("requires canonical predecessor and replacement descriptors with exact lineage and chronology", () => {
    const created = buildIcpProposal(input());
    if (!created.ok) throw new Error(created.code);
    const inReview = transitionIcpReview(reviewTransition(
      created.proposal.review,
      "in_review",
      "2026-08-30T13:01:00.000Z",
    ));
    if (!inReview.ok) throw new Error(inReview.code);
    const approved = transitionIcpReview(reviewTransition(
      inReview.review,
      "approved",
      "2026-08-30T13:02:00.000Z",
    ));
    if (!approved.ok) throw new Error(approved.code);
    const descriptor = {
      predecessorVersion: 1,
      stableKey: created.proposal.stableKey,
      revision: 1,
      supersedesVersionId: null,
      review: approved.review,
    };
    expect(buildIcpProposal(input({
      revision: 2,
      predecessor: descriptor,
      createdAt: "2026-08-30T13:03:00.000Z",
    }))).toMatchObject({
      ok: true,
      proposal: { revision: 2, supersedesVersionId: approved.review.versionId },
    });
    expect(buildIcpProposal(input({ revision: 2, predecessor: null })))
      .toEqual({ ok: false, code: "VERSION_CONFLICT" });
    expect(buildIcpProposal(input({
      revision: 2,
      predecessor: { ...descriptor, stableKey: "icp:other" },
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildIcpProposal(input({
      revision: 3,
      predecessor: descriptor,
    }))).toEqual({ ok: false, code: "VERSION_CONFLICT" });
    expect(buildIcpProposal(input({
      revision: 2,
      predecessor: descriptor,
      createdAt: "2026-08-30T13:02:00.000Z",
    }))).toEqual({ ok: false, code: "VERSION_CONFLICT" });

    let executions = 0;
    const trap = (): never => {
      executions += 1;
      throw new Error("must not execute");
    };
    const proxy = new Proxy(descriptor, { getPrototypeOf: trap });
    const accessor = structuredClone(descriptor) as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "review", { enumerable: true, get: trap });
    for (const predecessor of [proxy, accessor]) {
      expect(buildIcpProposal(input({ revision: 2, predecessor })))
        .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }
    expect(executions).toBe(0);
  });

  it("rejects fabricated, unapproved, stale, and hostile replacement descriptors", () => {
    const created = buildIcpProposal(input());
    if (!created.ok) throw new Error(created.code);
    const currentInReview = transitionIcpReview(reviewTransition(
      created.proposal.review,
      "in_review",
      "2026-08-30T13:01:00.000Z",
    ));
    if (!currentInReview.ok) throw new Error(currentInReview.code);
    const currentApproved = transitionIcpReview(reviewTransition(
      currentInReview.review,
      "approved",
      "2026-08-30T13:02:00.000Z",
    ));
    if (!currentApproved.ok) throw new Error(currentApproved.code);
    const replacement = buildIcpProposal(input({
      revision: 2,
      predecessor: {
        predecessorVersion: 1,
        stableKey: created.proposal.stableKey,
        revision: 1,
        supersedesVersionId: null,
        review: currentApproved.review,
      },
      createdAt: "2026-08-30T13:03:00.000Z",
    }));
    if (!replacement.ok) throw new Error(replacement.code);
    const replacementInReview = transitionIcpReview(reviewTransition(
      replacement.proposal.review,
      "in_review",
      "2026-08-30T13:04:00.000Z",
    ));
    if (!replacementInReview.ok) throw new Error(replacementInReview.code);
    const replacementApproved = transitionIcpReview(reviewTransition(
      replacementInReview.review,
      "approved",
      "2026-08-30T13:05:00.000Z",
    ));
    if (!replacementApproved.ok) throw new Error(replacementApproved.code);
    const descriptor = {
      replacementVersion: 1,
      supersedesVersionId: currentApproved.review.versionId,
      review: replacementApproved.review,
    };
    const attempt = (candidate: unknown, at = "2026-08-30T13:06:00.000Z") => transitionIcpReview(reviewTransition(
      currentApproved.review,
      "superseded",
      at,
      { replacement: candidate },
    ));

    expect(attempt({ ...descriptor, supersedesVersionId: `icp-version:${"f".repeat(64)}` }))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(attempt({ ...descriptor, review: replacement.proposal.review }))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(attempt({
      ...descriptor,
      review: { ...structuredClone(replacementApproved.review), reviewHash: HASH_B },
    })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(attempt(descriptor, "2026-08-30T13:05:00.000Z"))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });

    let executions = 0;
    const trap = (): never => {
      executions += 1;
      throw new Error("must not execute");
    };
    const proxy = new Proxy(descriptor, { getPrototypeOf: trap });
    const accessor = structuredClone(descriptor) as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "review", { enumerable: true, get: trap });
    expect(attempt(proxy)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(attempt(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(executions).toBe(0);
  });

  it("blocks automatic, direct, stale, and cross-scope review transitions", () => {
    const created = buildIcpProposal(input());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const draft = created.proposal.review;

    expect(transitionIcpReview(reviewTransition(
      draft,
      "approved",
      "2026-08-30T13:01:00.000Z",
    ))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(transitionIcpReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-30T13:01:00.000Z",
      { actor: { kind: "agent", actorId: REVIEWER_A } },
    ))).toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
    expect(transitionIcpReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-30T13:01:00.000Z",
      { expectedReviewHash: HASH_B },
    ))).toEqual({ ok: false, code: "STALE_VERSION" });
    expect(transitionIcpReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-30T13:01:00.000Z",
      { tenantId: TENANT_B },
    ))).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
  });
});
