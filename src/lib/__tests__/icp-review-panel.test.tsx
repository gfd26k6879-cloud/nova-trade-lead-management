import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IcpReviewPanel } from "@/components/strategy/icp-review-panel";
import type { IcpProposal, IcpReviewEvent, IcpReviewStatus } from "@/lib/strategy/icp";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "30000000-0000-4000-8000-000000000001";
const hash = (character: string) => `sha256:${character.repeat(64)}`;
const CONTENT_HASH = hash("a");
const VERSION_ID = `icp-version:${CONTENT_HASH.slice("sha256:".length)}`;
const UNDERSTANDING_CONTENT_HASH = hash("b");
const UNDERSTANDING_VERSION_ID = `understanding-version:${UNDERSTANDING_CONTENT_HASH.slice("sha256:".length)}`;

function reviewEvents(status: IcpReviewStatus): readonly IcpReviewEvent[] {
  const submitted: IcpReviewEvent = {
    from: "draft",
    to: "in_review",
    actor: { kind: "human", actorId: REVIEWER_ID },
    at: "2026-08-30T15:01:00.000Z",
    reason: "Submit the exact ICP version for human review.",
    replacementVersionId: null,
  };
  if (status === "draft") return [];
  if (status === "in_review") return [submitted];
  if (status === "approved" || status === "rejected") {
    return [submitted, {
      from: "in_review",
      to: status,
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:02:00.000Z",
      reason: `Human reviewer ${status} this exact ICP version.`,
      replacementVersionId: null,
    }];
  }
  return [submitted, {
    from: "in_review",
    to: "approved",
    actor: { kind: "human", actorId: REVIEWER_ID },
    at: "2026-08-30T15:02:00.000Z",
    reason: "Human reviewer approved this exact ICP version.",
    replacementVersionId: null,
  }, {
    from: "approved",
    to: "superseded",
    actor: { kind: "human", actorId: REVIEWER_ID },
    at: "2026-08-30T15:03:00.000Z",
    reason: "A later reviewed version replaced this ICP version.",
    replacementVersionId: `icp-version:${"c".repeat(64)}`,
  }];
}

function proposal(status: IcpReviewStatus = "draft"): IcpProposal {
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    versionId: VERSION_ID,
    stableKey: "icp:industrial-specialty-chemicals",
    revision: 1,
    supersedesVersionId: null,
    status: "review_required",
    contentHash: CONTENT_HASH,
    createdAt: "2026-08-30T15:00:00.000Z",
    understanding: {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      versionId: UNDERSTANDING_VERSION_ID,
      contentHash: UNDERSTANDING_CONTENT_HASH,
      claimSetHash: hash("d"),
      reviewHash: hash("e"),
      authorityHash: hash("f"),
      status: "approved",
    },
    title: "Industrial formulators with evaluation capacity",
    segment: "North American specialty-chemical formulators",
    useCase: "Prioritize teams evaluating lower-emission performance additives.",
    positiveCriteria: [{
      criterionId: "criterion:technical-evaluation",
      ruleKey: "include:technical-evaluation",
      domain: "size_capability",
      rule: "Has an internal technical evaluation team.",
      rationale: "Evaluation capacity supports a credible product qualification process.",
      confidenceBasisPoints: 8_500,
      rationaleRefs: [{ claimId: "claim:evaluation-capacity", evidenceId: "evidence:catalog-1" }],
    }],
    exclusions: [{
      criterionId: "criterion:consumer-only",
      ruleKey: "exclude:consumer-only",
      domain: "disqualifier",
      rule: "Sells only finished consumer products.",
      rationale: "The approved understanding targets formulators, not finished-goods retailers.",
      confidenceBasisPoints: 9_100,
      rationaleRefs: [{ claimId: "claim:formulator-focus", evidenceId: "evidence:interview-2" }],
    }],
    uncertainties: [{
      uncertaintyId: "uncertainty:minimum-capability",
      domain: "size_capability",
      statement: "The minimum viable laboratory capacity is not established.",
      impact: "Borderline accounts must remain in human qualification review.",
      relatedClaimIds: ["claim:evaluation-capacity"],
    }],
    review: {
      reviewVersion: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      versionId: VERSION_ID,
      contentHash: CONTENT_HASH,
      stableKey: "icp:industrial-specialty-chemicals",
      revision: 1,
      supersedesVersionId: null,
      understandingVersionId: UNDERSTANDING_VERSION_ID,
      understandingContentHash: UNDERSTANDING_CONTENT_HASH,
      understandingReviewHash: hash("e"),
      createdAt: "2026-08-30T15:00:00.000Z",
      status,
      events: reviewEvents(status),
      replacementVersionId: status === "superseded" ? `icp-version:${"c".repeat(64)}` : null,
      reviewHash: hash("1"),
    },
  };
}

describe("IcpReviewPanel", () => {
  it("shows the exact ICP version, inclusion and exclusion evidence, uncertainty, and validation", () => {
    const html = renderToStaticMarkup(<IcpReviewPanel state="ready" proposal={proposal()} />);

    expect(html).toContain('data-surface="icp-review-panel"');
    expect(html).toContain('data-binding-valid="true"');
    expect(html).toContain("North American specialty-chemical formulators");
    expect(html).toContain("Inclusion criteria");
    expect(html).toContain("Has an internal technical evaluation team.");
    expect(html).toContain("evidence:catalog-1");
    expect(html).toContain("Exclusion criteria");
    expect(html).toContain("Sells only finished consumer products.");
    expect(html).toContain("evidence:interview-2");
    expect(html).toContain("The minimum viable laboratory capacity is not established.");
    expect(html).toContain("Proposal and review snapshot match");
    expect(html).toContain(VERSION_ID);
  });

  it("offers only the human transition permitted by the exact draft or in-review state", () => {
    const draft = renderToStaticMarkup(
      <IcpReviewPanel state="ready" proposal={proposal()} onSubmitForReview={() => undefined} onApprove={() => undefined} onReject={() => undefined} />,
    );
    expect(draft).toContain("Submit for human review");
    expect(draft).not.toContain("Approve ICP version only");
    expect(draft).not.toContain("Reject ICP version");

    const reviewing = renderToStaticMarkup(
      <IcpReviewPanel state="ready" proposal={proposal("in_review")} onSubmitForReview={() => undefined} onApprove={() => undefined} onReject={() => undefined} />,
    );
    expect(reviewing).toContain("Approve ICP version only");
    expect(reviewing).toContain("Reject ICP version");
    expect(reviewing).not.toContain("Submit for human review");
    expect(reviewing).not.toMatch(/<button[^>]*>[^<]*(?:activate|launch|publish)/iu);
  });

  it("removes controls after approval and retains the human chronology", () => {
    const html = renderToStaticMarkup(
      <IcpReviewPanel state="ready" proposal={proposal("approved")} onSubmitForReview={() => undefined} onApprove={() => undefined} onReject={() => undefined} />,
    );

    expect(html).toContain('data-review-status="approved"');
    expect(html).toContain('aria-label="ICP review events"');
    expect(html).toContain("draft → in review");
    expect(html).toContain("in review → approved");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("fails closed when the exact proposal and review binding disagree", () => {
    const current = proposal("in_review");
    const mismatched = {
      ...current,
      review: { ...current.review, contentHash: hash("9") },
    } as IcpProposal;
    const html = renderToStaticMarkup(
      <IcpReviewPanel state="ready" proposal={mismatched} onApprove={() => undefined} onReject={() => undefined} />,
    );

    expect(html).toContain('data-binding-valid="false"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Exact version validation failed");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("renders explicit accessible loading and error states", () => {
    const loading = renderToStaticMarkup(<IcpReviewPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading ICP version");

    const error = renderToStaticMarkup(<IcpReviewPanel state="error" error="The exact ICP version could not be loaded." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("The exact ICP version could not be loaded.");
  });
});
