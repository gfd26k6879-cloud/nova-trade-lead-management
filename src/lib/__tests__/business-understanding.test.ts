import { describe, expect, it } from "vitest";

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

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    evidenceId: "evidence:catalog-page-2",
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    sourceVersionRef: "document-version:catalog-v3",
    locator: "page=2#section=product-range",
    contentHash: HASH_A,
    grade: "direct_observation",
    freshness: "current",
    ...overrides,
  };
}

function claim(overrides: Record<string, unknown> = {}) {
  return {
    claimId: "claim:product-range",
    claimVersion: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    domain: "products",
    claimClass: "product_technical_specification",
    subject: "Industrial product range",
    statement: "The catalog lists epoxy resin systems and metalworking-fluid components.",
    origin: "observed",
    status: "supported",
    confidenceBasisPoints: 9_000,
    material: true,
    evidenceIds: ["evidence:catalog-page-2"],
    uncertaintyReason: null,
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    proposalRef: "understanding:proposal-1",
    revision: 1,
    supersedesProposalRef: null,
    supersedesVersionId: null,
    createdAt: "2026-08-29T19:00:00.000Z",
    producer: {
      runRef: "agent-run:understanding-1",
      runInputHash: HASH_A,
      agentVersion: "understanding-synthesizer:v1",
      modelRef: "fixture:openai-responses-stub",
      promptRef: "business-understanding@1",
      promptHash: HASH_A,
      policyRef: "evidence-policy:v1",
      policyHash: HASH_B,
    },
    evidence: [evidence()],
    claims: [claim()],
    ...overrides,
  };
}

function reviewTransition(
  current: BusinessUnderstandingReviewSnapshot,
  to: "in_review" | "approved" | "rejected" | "superseded",
  at: string,
  overrides: Record<string, unknown> = {},
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
    reason: `Human decision to move the version to ${to}.`,
    replacement: null,
    ...overrides,
  };
}

function approvedReview(
  proposalOverrides: Record<string, unknown>,
  inReviewAt: string,
  approvedAt: string,
): BusinessUnderstandingReviewSnapshot {
  const created = buildBusinessUnderstandingProposal(input(proposalOverrides));
  if (!created.ok) throw new Error(created.code);
  const inReview = transitionBusinessUnderstandingReview(reviewTransition(
    created.proposal.review,
    "in_review",
    inReviewAt,
  ));
  if (!inReview.ok) throw new Error(inReview.code);
  const approved = transitionBusinessUnderstandingReview(reviewTransition(
    inReview.review,
    "approved",
    approvedAt,
  ));
  if (!approved.ok) throw new Error(approved.code);
  return approved.review;
}

describe("business-understanding proposal service", () => {
  it("builds a versioned industrial proposal with resolvable citations and mandatory review", () => {
    const result = buildBusinessUnderstandingProposal(input({
      evidence: [
        evidence(),
        evidence({
          evidenceId: "evidence:route-note",
          sourceVersionRef: "note-version:route-v1",
          locator: "paragraph=1",
          contentHash: HASH_B,
          grade: "tenant_client_provided",
        }),
      ],
      claims: [
        claim(),
        claim({
          claimId: "claim:route-to-market",
          domain: "channel_positions",
          claimClass: "customer_provided_strategic_fact",
          subject: "Route to market",
          statement: "Direct and distributor channels are both in scope.",
          origin: "client_provided",
          status: "proposed",
          evidenceIds: ["evidence:route-note"],
        }),
        claim({
          claimId: "claim:buying-process-unknown",
          domain: "buying_process",
          claimClass: "customer_provided_strategic_fact",
          subject: "Technical buying process",
          statement: "The technical approval sequence is not yet known.",
          origin: "unknown",
          status: "unknown",
          confidenceBasisPoints: 0,
          evidenceIds: [],
          uncertaintyReason: "No eligible evidence describes technical approval roles or sequence.",
        }),
      ],
    }));

    expect(result).toMatchObject({
      ok: true,
      code: "PROPOSAL_CREATED",
      proposal: {
        version: 1,
        proposalRef: "understanding:proposal-1",
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        revision: 1,
        supersedesProposalRef: null,
        status: "review_required",
        reviewState: "pending",
        producer: { runRef: "agent-run:understanding-1", runInputHash: HASH_A, promptHash: HASH_A },
        review: { status: "draft", events: [], replacementVersionId: null },
        domains: [
          { domain: "buying_process", state: "unknown", facts: [] },
          { domain: "channel_positions", state: "partial" },
          { domain: "products", state: "supported" },
        ],
        uncertainties: [{ claimId: "claim:buying-process-unknown", domain: "buying_process" }],
        coverage: {
          materialClaims: 3,
          materialClaimsWithCurrentEvidence: 2,
          explicitUnknowns: 1,
          currentEvidenceBasisPoints: 6666,
          materialConfidenceBasisPoints: 6000,
        },
      },
    });
    if (!result.ok) return;
    expect(result.proposal.domains[2]?.facts[0]?.citations).toEqual([{
      evidenceId: "evidence:catalog-page-2",
      sourceVersionRef: "document-version:catalog-v3",
      locator: "page=2#section=product-range",
      contentHash: HASH_A,
      grade: "direct_observation",
      freshness: "current",
    }]);
    expect(result.proposal.claimSetHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.proposal.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(result.proposal.versionId).toBe(
      `understanding-version:${result.proposal.contentHash.slice("sha256:".length)}`,
    );
    expect(result.proposal.domains[2]?.facts[0]?.confidenceBasisPoints).toBe(9_000);
    expect(JSON.stringify(result.proposal)).not.toMatch(/approvedAt|approvedBy|storage|raw/i);
  });

  it("uses the same ontology for a materially different non-industrial consultancy fixture", () => {
    const result = buildBusinessUnderstandingProposal(input({
      evidence: [evidence({ locator: "heading=Engagement models" })],
      claims: [claim({
        domain: "products",
        claimClass: "customer_provided_strategic_fact",
        subject: "Consulting engagements",
        statement: "Buyers begin with an assessment before a retained engagement.",
        origin: "client_provided",
      })],
    }));

    expect(result).toMatchObject({
      ok: true,
      proposal: { domains: [{ domain: "products", facts: [{ subject: "Consulting engagements" }] }] },
    });
    expect(JSON.stringify(result)).not.toMatch(/epoxy|formulator|chemical|distributor/i);
  });

  it("is semantically stable for the same versioned inputs regardless of array order", () => {
    const evidenceA = evidence();
    const evidenceB = evidence({
      evidenceId: "evidence:second",
      sourceVersionRef: "document-version:second",
      contentHash: HASH_B,
    });
    const claimA = claim();
    const claimB = claim({
      claimId: "claim:second",
      domain: "applications",
      subject: "Application range",
      evidenceIds: ["evidence:second"],
    });
    const first = buildBusinessUnderstandingProposal(input({ evidence: [evidenceA, evidenceB], claims: [claimA, claimB] }));
    const reordered = buildBusinessUnderstandingProposal(input({ evidence: [evidenceB, evidenceA], claims: [claimB, claimA] }));

    expect(first).toEqual(reordered);
  });

  it("requires explicit supersession for later revisions and forbids it on revision one", () => {
    expect(buildBusinessUnderstandingProposal(input({
      proposalRef: "understanding:proposal-2",
      revision: 2,
      supersedesProposalRef: "understanding:proposal-1",
      supersedesVersionId: `understanding-version:${"c".repeat(64)}`,
    }))).toMatchObject({
      ok: true,
      proposal: {
        revision: 2,
        supersedesProposalRef: "understanding:proposal-1",
        supersedesVersionId: `understanding-version:${"c".repeat(64)}`,
      },
    });
    expect(buildBusinessUnderstandingProposal(input({ revision: 2 }))).toEqual({ ok: false, code: "VERSION_CONFLICT" });
    expect(buildBusinessUnderstandingProposal(input({ supersedesProposalRef: "understanding:proposal-0" }))).toEqual({ ok: false, code: "VERSION_CONFLICT" });
    expect(buildBusinessUnderstandingProposal(input({
      revision: 2,
      supersedesProposalRef: "understanding:proposal-1",
      supersedesVersionId: `understanding-version:${"c".repeat(64)}`,
      proposalRef: "understanding:proposal-1",
    }))).toEqual({ ok: false, code: "VERSION_CONFLICT" });
  });

  it.each([
    ["evidence tenant", { evidence: [evidence({ tenantId: TENANT_B })] }],
    ["claim tenant", { claims: [claim({ tenantId: TENANT_B })] }],
    ["evidence workspace", { evidence: [evidence({ workspaceId: WORKSPACE_B })] }],
    ["claim workspace", { claims: [claim({ workspaceId: WORKSPACE_B })] }],
    ["tenant-wide evidence in workspace proposal", { evidence: [evidence({ workspaceId: null })] }],
  ])("fails closed for a cross-scope %s", (_label, overrides) => {
    expect(buildBusinessUnderstandingProposal(input(overrides))).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
  });

  it("rejects unresolved, duplicate, and cross-linked evidence references", () => {
    expect(buildBusinessUnderstandingProposal(input({
      claims: [claim({ evidenceIds: ["evidence:missing"] })],
    }))).toEqual({ ok: false, code: "EVIDENCE_UNRESOLVABLE" });
    expect(buildBusinessUnderstandingProposal(input({
      evidence: [evidence(), evidence()],
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBusinessUnderstandingProposal(input({
      claims: [claim({ evidenceIds: ["evidence:catalog-page-2", "evidence:catalog-page-2"] })],
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it.each([
    ["stale", evidence({ freshness: "stale" })],
    ["revoked", evidence({ freshness: "revoked" })],
    ["extracted-only technical support", evidence({ grade: "extracted" })],
    ["client-provided-only technical support", evidence({ grade: "tenant_client_provided" })],
    ["inferred grade", evidence({ grade: "inferred" })],
    ["conflicted grade", evidence({ grade: "conflicted" })],
  ])("does not accept a supported claim on %s evidence", (_label, invalidEvidence) => {
    expect(buildBusinessUnderstandingProposal(input({ evidence: [invalidEvidence] })))
      .toEqual({ ok: false, code: "EVIDENCE_INELIGIBLE" });
  });

  it.each(["identity", "geography", "contact_role"] as const)(
    "requires direct or corroborated evidence before supporting %s claims",
    (claimClass) => {
      expect(buildBusinessUnderstandingProposal(input({
        evidence: [evidence({ grade: "tenant_client_provided" })],
        claims: [claim({ claimClass })],
      }))).toEqual({ ok: false, code: "EVIDENCE_INELIGIBLE" });
    },
  );

  it.each([
    ["revoked", evidence({ freshness: "revoked" })],
    ["stale", evidence({ freshness: "stale" })],
    ["unknown", evidence({ grade: "unknown" })],
    ["conflicted", evidence({ grade: "conflicted" })],
  ])("does not hide %s evidence inside an ordinary proposed fact", (_label, weakEvidence) => {
    expect(buildBusinessUnderstandingProposal(input({
      evidence: [weakEvidence],
      claims: [claim({ status: "proposed" })],
    }))).toEqual({ ok: false, code: "EVIDENCE_INELIGIBLE" });
  });

  it("preserves a conflict for review instead of converting it into a supported fact", () => {
    const result = buildBusinessUnderstandingProposal(input({
      evidence: [evidence({ grade: "conflicted" })],
      claims: [claim({ status: "conflicted" })],
    }));

    expect(result).toMatchObject({
      ok: true,
      proposal: {
        status: "review_required",
        review: { status: "draft" },
        domains: [{ state: "conflict", facts: [{ claimStatus: "conflicted", reviewState: "pending" }] }],
        coverage: { materialClaimsWithCurrentEvidence: 0, currentEvidenceBasisPoints: 0 },
      },
    });
  });

  it.each([
    ["supported without evidence", claim({ evidenceIds: [] })],
    ["proposed without evidence", claim({ status: "proposed", evidenceIds: [] })],
    ["unknown without reason", claim({ status: "unknown", origin: "unknown", evidenceIds: [], uncertaintyReason: null })],
    ["unknown with evidence", claim({ status: "unknown", origin: "unknown", uncertaintyReason: "Unresolved.", evidenceIds: ["evidence:catalog-page-2"] })],
    ["unknown with confidence", claim({ status: "unknown", origin: "unknown", confidenceBasisPoints: 1, uncertaintyReason: "Unresolved.", evidenceIds: [] })],
    ["inferred marked supported", claim({ origin: "inferred" })],
    ["unbounded negative absence marked supported", claim({ claimClass: "negative_absence" })],
    ["unbounded negative absence marked proposed", claim({ claimClass: "negative_absence", status: "proposed" })],
  ])("rejects %s rather than inventing understanding", (_label, invalidClaim) => {
    expect(buildBusinessUnderstandingProposal(input({ claims: [invalidClaim] })))
      .toEqual({ ok: false, code: "EVIDENCE_INELIGIBLE" });
  });

  it.each([
    ["extra top-level field", { ...input(), approve: true }],
    ["extra evidence field", input({ evidence: [{ ...evidence(), rawText: "private" }] })],
    ["extra claim field", input({ claims: [{ ...claim(), confidence: 0.99 }] })],
    ["invalid time", input({ createdAt: "2026-08-29T19:00:00Z" })],
    ["invalid content hash", input({ evidence: [evidence({ contentHash: "a".repeat(64) })] })],
    ["control-bearing subject", input({ claims: [claim({ subject: "Acme\u0000Corp" })] })],
    ["lone-surrogate locator", input({ evidence: [evidence({ locator: "page:\ud800" })] })],
    ["empty claims", input({ claims: [] })],
  ])("rejects malformed %s exactly", (_label, malformed) => {
    expect(buildBusinessUnderstandingProposal(malformed)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("rejects accessor-backed and proxy-backed inputs without executing accessors", () => {
    let reads = 0;
    const accessor = input();
    Object.defineProperty(accessor, "claims", {
      enumerable: true,
      get() {
        reads += 1;
        return [claim()];
      },
    });
    const hostile = new Proxy(input(), { ownKeys() { throw new Error("hostile"); } });
    const nestedEvidence = evidence();
    Object.defineProperty(nestedEvidence, "locator", {
      enumerable: true,
      get() {
        reads += 1;
        return "unsafe";
      },
    });

    expect(buildBusinessUnderstandingProposal(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(reads).toBe(0);
    expect(() => buildBusinessUnderstandingProposal(hostile)).not.toThrow();
    expect(buildBusinessUnderstandingProposal(hostile)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBusinessUnderstandingProposal(input({ evidence: [nestedEvidence] })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBusinessUnderstandingProposal(input({ claims: [new Proxy(claim(), {})] })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(reads).toBe(0);
  });

  it("requires explicit human review transitions and preserves every immutable version state", () => {
    const created = buildBusinessUnderstandingProposal(input());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const inReview = transitionBusinessUnderstandingReview(reviewTransition(
      created.proposal.review,
      "in_review",
      "2026-08-29T19:01:00.000Z",
    ));
    expect(inReview).toMatchObject({ ok: true, review: { status: "in_review", events: [{ to: "in_review" }] } });
    if (!inReview.ok) return;

    const rejected = transitionBusinessUnderstandingReview(reviewTransition(
      inReview.review,
      "rejected",
      "2026-08-29T19:02:00.000Z",
    ));
    expect(rejected).toMatchObject({ ok: true, review: { status: "rejected", events: [{}, { to: "rejected" }] } });

    const approved = transitionBusinessUnderstandingReview(reviewTransition(
      inReview.review,
      "approved",
      "2026-08-29T19:02:00.000Z",
    ));
    expect(approved).toMatchObject({
      ok: true,
      review: {
        status: "approved",
        events: [
          { from: "draft", to: "in_review", actor: { kind: "human", actorId: REVIEWER_A } },
          { from: "in_review", to: "approved", actor: { kind: "human", actorId: REVIEWER_A } },
        ],
      },
    });
    if (!approved.ok) return;

    const replacementCreated = buildBusinessUnderstandingProposal(input({
      proposalRef: "understanding:proposal-2",
      revision: 2,
      supersedesProposalRef: "understanding:proposal-1",
      supersedesVersionId: approved.review.versionId,
      createdAt: "2026-08-29T19:03:00.000Z",
    }));
    if (!replacementCreated.ok) throw new Error(replacementCreated.code);
    const replacementInReview = transitionBusinessUnderstandingReview(reviewTransition(
      replacementCreated.proposal.review,
      "in_review",
      "2026-08-29T19:04:00.000Z",
    ));
    if (!replacementInReview.ok) throw new Error(replacementInReview.code);
    const replacementApproved = transitionBusinessUnderstandingReview(reviewTransition(
      replacementInReview.review,
      "approved",
      "2026-08-29T19:05:00.000Z",
    ));
    if (!replacementApproved.ok) throw new Error(replacementApproved.code);

    const superseded = transitionBusinessUnderstandingReview(reviewTransition(
      approved.review,
      "superseded",
      "2026-08-29T19:06:00.000Z",
      {
        replacement: {
          replacementVersion: 1,
          supersedesVersionId: approved.review.versionId,
          review: replacementApproved.review,
        },
      },
    ));
    expect(superseded).toMatchObject({
      ok: true,
      review: { status: "superseded", replacementVersionId: replacementApproved.review.versionId },
    });
    if (!superseded.ok) return;
    expect(superseded.review.events.at(-1)).toMatchObject({
      to: "superseded",
      replacementVersionId: replacementApproved.review.versionId,
    });
    expect(superseded.review.events.at(-1)).not.toHaveProperty("supersedesVersionId");
    expect(superseded.review.events.at(-1)).not.toHaveProperty("review");
    expect(created.proposal.review.status).toBe("draft");
    expect(inReview.review.status).toBe("in_review");
    expect(approved.review.status).toBe("approved");
    expect(Object.isFrozen(superseded.ok && superseded.review)).toBe(true);
  });

  it("requires a canonical linked approved replacement before superseding", () => {
    const current = approvedReview({}, "2026-08-29T19:01:00.000Z", "2026-08-29T19:02:00.000Z");
    const replacement = approvedReview({
      proposalRef: "understanding:proposal-2",
      revision: 2,
      supersedesProposalRef: "understanding:proposal-1",
      supersedesVersionId: current.versionId,
      createdAt: "2026-08-29T19:03:00.000Z",
    }, "2026-08-29T19:04:00.000Z", "2026-08-29T19:05:00.000Z");
    const descriptor = {
      replacementVersion: 1,
      supersedesVersionId: current.versionId,
      review: replacement,
    };
    const attempt = (candidate: unknown, at = "2026-08-29T19:06:00.000Z") => (
      transitionBusinessUnderstandingReview(reviewTransition(current, "superseded", at, {
        replacement: candidate,
      }))
    );

    expect(attempt(descriptor)).toMatchObject({
      ok: true,
      review: { replacementVersionId: replacement.versionId },
    });
    expect(transitionBusinessUnderstandingReview(reviewTransition(current, "superseded", "2026-08-29T19:06:00.000Z", {
      replacementVersionId: `understanding-version:${"f".repeat(64)}`,
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });

    const fabricatedReview = {
      ...structuredClone(replacement),
      versionId: `understanding-version:${"f".repeat(64)}`,
    };
    expect(attempt({ ...descriptor, review: fabricatedReview }), "fabricated version")
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(attempt({
      ...descriptor,
      review: { ...structuredClone(replacement), reviewHash: HASH_B },
    }), "stale replacement review hash").toEqual({ ok: false, code: "MALFORMED_INPUT" });

    const replacementDraft = buildBusinessUnderstandingProposal(input({
      proposalRef: "understanding:proposal-draft",
      revision: 2,
      supersedesProposalRef: "understanding:proposal-1",
      supersedesVersionId: current.versionId,
      createdAt: "2026-08-29T19:03:00.000Z",
    }));
    if (!replacementDraft.ok) throw new Error(replacementDraft.code);
    expect(attempt({ ...descriptor, review: replacementDraft.proposal.review }), "not approved")
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(attempt({
      ...descriptor,
      supersedesVersionId: `understanding-version:${"c".repeat(64)}`,
    }), "descriptor lineage drift").toEqual({ ok: false, code: "MALFORMED_INPUT" });

    const otherPredecessor = `understanding-version:${"c".repeat(64)}`;
    const nonLinkingReplacement = approvedReview({
      proposalRef: "understanding:non-linking-proposal",
      revision: 2,
      supersedesProposalRef: "understanding:different-prior",
      supersedesVersionId: otherPredecessor,
      createdAt: "2026-08-29T19:03:00.000Z",
    }, "2026-08-29T19:04:00.000Z", "2026-08-29T19:05:00.000Z");
    expect(attempt({
      replacementVersion: 1,
      supersedesVersionId: otherPredecessor,
      review: nonLinkingReplacement,
    }), "hash-bound non-linking replacement").toEqual({ ok: false, code: "INVALID_TRANSITION" });

    const olderReplacement = approvedReview({
      proposalRef: "understanding:older-proposal",
      revision: 2,
      supersedesProposalRef: "understanding:proposal-1",
      supersedesVersionId: current.versionId,
      createdAt: "2026-08-29T18:00:00.000Z",
    }, "2026-08-29T18:01:00.000Z", "2026-08-29T18:02:00.000Z");
    expect(attempt({ ...descriptor, review: olderReplacement }), "older replacement")
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(attempt(descriptor, "2026-08-29T19:05:00.000Z"), "replacement approval not yet committed")
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });

    const crossScopeReplacement = approvedReview({
      tenantId: TENANT_B,
      workspaceId: WORKSPACE_B,
      proposalRef: "understanding:other-scope-proposal",
      revision: 2,
      supersedesProposalRef: "understanding:other-scope-prior",
      supersedesVersionId: current.versionId,
      createdAt: "2026-08-29T19:03:00.000Z",
      evidence: [evidence({ tenantId: TENANT_B, workspaceId: WORKSPACE_B })],
      claims: [claim({ tenantId: TENANT_B, workspaceId: WORKSPACE_B })],
    }, "2026-08-29T19:04:00.000Z", "2026-08-29T19:05:00.000Z");
    expect(attempt({ ...descriptor, review: crossScopeReplacement }), "cross-scope replacement")
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });
  });

  it("rejects replacement proxies and accessors without executing them", () => {
    const current = approvedReview({}, "2026-08-29T19:01:00.000Z", "2026-08-29T19:02:00.000Z");
    const replacement = approvedReview({
      proposalRef: "understanding:proposal-2",
      revision: 2,
      supersedesProposalRef: "understanding:proposal-1",
      supersedesVersionId: current.versionId,
      createdAt: "2026-08-29T19:03:00.000Z",
    }, "2026-08-29T19:04:00.000Z", "2026-08-29T19:05:00.000Z");
    const descriptor = {
      replacementVersion: 1,
      supersedesVersionId: current.versionId,
      review: replacement,
    };
    let executions = 0;
    const trap = (): never => {
      executions += 1;
      throw new Error("must not execute");
    };
    const proxy = new Proxy(descriptor, { getPrototypeOf: trap });
    const accessor = structuredClone(descriptor) as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "review", { enumerable: true, get: trap });

    for (const hostile of [proxy, accessor]) {
      expect(transitionBusinessUnderstandingReview(reviewTransition(
        current,
        "superseded",
        "2026-08-29T19:06:00.000Z",
        { replacement: hostile },
      ))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }
    expect(executions).toBe(0);
  });

  it("rejects automatic, illegal, stale, cross-scope, proxy, and accessor review decisions", () => {
    const created = buildBusinessUnderstandingProposal(input());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const draft = created.proposal.review;

    expect(transitionBusinessUnderstandingReview(reviewTransition(
      draft,
      "approved",
      "2026-08-29T19:01:00.000Z",
    ))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(transitionBusinessUnderstandingReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-29T19:01:00.000Z",
      { actor: { kind: "agent", actorId: REVIEWER_A } },
    ))).toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
    expect(transitionBusinessUnderstandingReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-29T19:01:00.000Z",
      { expectedReviewHash: HASH_B },
    ))).toEqual({ ok: false, code: "STALE_VERSION" });
    expect(transitionBusinessUnderstandingReview(reviewTransition(
      draft,
      "in_review",
      "2026-08-29T19:01:00.000Z",
      { tenantId: TENANT_B },
    ))).toEqual({ ok: false, code: "SCOPE_MISMATCH" });

    let executions = 0;
    const hostile = new Proxy(draft, {
      getPrototypeOf() {
        executions += 1;
        throw new Error("must not execute");
      },
    });
    const accessor = structuredClone(draft) as Record<string, unknown>;
    Object.defineProperty(accessor, "status", {
      enumerable: true,
      get() {
        executions += 1;
        return "draft";
      },
    });
    expect(transitionBusinessUnderstandingReview(reviewTransition(
      hostile,
      "in_review",
      "2026-08-29T19:01:00.000Z",
    ))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(transitionBusinessUnderstandingReview(reviewTransition(
      accessor as unknown as BusinessUnderstandingReviewSnapshot,
      "in_review",
      "2026-08-29T19:01:00.000Z",
    ))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(executions).toBe(0);
  });

  it("deeply snapshots and freezes proposal output", () => {
    const mutableEvidence = evidence();
    const mutableClaim = claim();
    const source = input({ evidence: [mutableEvidence], claims: [mutableClaim] });
    const result = buildBusinessUnderstandingProposal(source);
    mutableEvidence.locator = "mutated";
    mutableClaim.statement = "Mutated after proposal creation.";

    expect(result).toMatchObject({
      ok: true,
      proposal: { domains: [{ facts: [{ statement: "The catalog lists epoxy resin systems and metalworking-fluid components." }] }] },
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.proposal)).toBe(true);
    expect(Object.isFrozen(result.proposal.domains)).toBe(true);
    expect(Object.isFrozen(result.proposal.domains[0]?.facts)).toBe(true);
    expect(Object.isFrozen(result.proposal.domains[0]?.facts[0]?.citations)).toBe(true);
  });
});
