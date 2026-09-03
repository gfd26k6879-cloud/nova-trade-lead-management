import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BusinessUnderstandingReviewPanel } from "@/components/knowledge/business-understanding-review-panel";
import {
  buildBusinessUnderstandingProposal,
  transitionBusinessUnderstandingReview,
  type BusinessUnderstandingProposal,
  type BusinessUnderstandingReviewSnapshot,
  type BusinessUnderstandingReviewStatus,
} from "@/lib/understanding/business-understanding";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "30000000-0000-4000-8000-000000000001";
const hash = (character: string) => `sha256:${character.repeat(64)}`;

function source() {
  return {
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    proposalRef: "understanding:proposal-ui-1",
    revision: 1,
    supersedesProposalRef: null,
    supersedesVersionId: null,
    createdAt: "2026-08-30T15:00:00.000Z",
    producer: {
      runRef: "run:understanding-ui-1",
      runInputHash: hash("1"),
      agentVersion: "agent:v1",
      modelRef: "model:review-safe",
      promptRef: "prompt:understanding-v1",
      promptHash: hash("2"),
      policyRef: "policy:understanding-v1",
      policyHash: hash("3"),
    },
    evidence: [{
      evidenceId: "evidence:catalog-1",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      sourceVersionRef: "catalog-version:2026-08",
      locator: "products[0].applications[2]",
      contentHash: hash("4"),
      grade: "direct_observation",
      freshness: "current",
    }],
    claims: [{
      claimId: "claim:industrial-additive",
      claimVersion: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      domain: "products",
      claimClass: "product_technical_specification",
      subject: "Low-emission additive",
      statement: "The catalog contains an additive for industrial formulations.",
      origin: "observed",
      status: "supported",
      confidenceBasisPoints: 9_200,
      material: true,
      evidenceIds: ["evidence:catalog-1"],
      uncertaintyReason: null,
    }, {
      claimId: "claim:approval-sequence",
      claimVersion: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      domain: "buying_process",
      claimClass: "customer_provided_strategic_fact",
      subject: "Technical approval sequence",
      statement: "The technical approval sequence is not established.",
      origin: "unknown",
      status: "unknown",
      confidenceBasisPoints: 0,
      material: true,
      evidenceIds: [],
      uncertaintyReason: "No eligible evidence identifies the approval roles or sequence.",
    }],
  };
}

function transition(current: BusinessUnderstandingReviewSnapshot, to: Exclude<BusinessUnderstandingReviewStatus, "draft">, at: string) {
  const result = transitionBusinessUnderstandingReview({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    current,
    expectedVersionId: current.versionId,
    expectedContentHash: current.contentHash,
    expectedReviewHash: current.reviewHash,
    to,
    actor: { kind: "human", actorId: REVIEWER_ID },
    at,
    reason: `Human decision to move this understanding to ${to}.`,
    replacement: null,
  });
  if (!result.ok) throw new Error(result.code);
  return result.review;
}

function proposal(status: "draft" | "in_review" | "approved" = "draft"): BusinessUnderstandingProposal {
  const built = buildBusinessUnderstandingProposal(source());
  if (!built.ok) throw new Error(built.code);
  if (status === "draft") return built.proposal;
  const inReview = transition(built.proposal.review, "in_review", "2026-08-30T15:01:00.000Z");
  if (status === "in_review") return { ...built.proposal, review: inReview };
  const approved = transition(inReview, "approved", "2026-08-30T15:02:00.000Z");
  return { ...built.proposal, review: approved };
}

describe("BusinessUnderstandingReviewPanel", () => {
  it("shows the exact claim, citation, uncertainty, coverage, and adaptive-question handoff", () => {
    const current = proposal();
    const html = renderToStaticMarkup(<BusinessUnderstandingReviewPanel state="ready" proposal={current} />);

    expect(html).toContain('data-surface="business-understanding-review-panel"');
    expect(html).toContain('data-binding-valid="true"');
    expect(html).toContain("The catalog contains an additive for industrial formulations.");
    expect(html).toContain("evidence:catalog-1");
    expect(html).toContain("catalog-version:2026-08");
    expect(html).toContain("products[0].applications[2]");
    expect(html).toContain(hash("4"));
    expect(html).toContain("92% confidence");
    expect(html).toContain("The technical approval sequence is not established.");
    expect(html).toContain("Adaptive-question handoff");
    expect(html).toContain(`Handoff version: ${current.versionId}`);
    expect(html).toContain(`Exact understanding version: ${current.versionId}`);
  });

  it("offers only the human transition permitted by the canonical review status", () => {
    const draft = renderToStaticMarkup(
      <BusinessUnderstandingReviewPanel state="ready" proposal={proposal()} onSubmitForReview={() => undefined} onApprove={() => undefined} onReject={() => undefined} />,
    );
    expect(draft).toContain("Submit for human review");
    expect(draft).not.toContain("Approve understanding version only");
    expect(draft).not.toContain("Reject understanding version");

    const reviewing = renderToStaticMarkup(
      <BusinessUnderstandingReviewPanel state="ready" proposal={proposal("in_review")} onSubmitForReview={() => undefined} onApprove={() => undefined} onReject={() => undefined} />,
    );
    expect(reviewing).toContain("Approve understanding version only");
    expect(reviewing).toContain("Reject understanding version");
    expect(reviewing).not.toContain("Submit for human review");
    expect(reviewing).not.toMatch(/<button[^>]*>[^<]*(?:activate|launch|publish|send)/iu);
  });

  it("removes controls after approval and preserves the human chronology", () => {
    const html = renderToStaticMarkup(
      <BusinessUnderstandingReviewPanel state="ready" proposal={proposal("approved")} onSubmitForReview={() => undefined} onApprove={() => undefined} onReject={() => undefined} />,
    );

    expect(html).toContain('data-review-status="approved"');
    expect(html).toContain('aria-label="Business understanding review events"');
    expect(html).toContain("draft → in review");
    expect(html).toContain("in review → approved");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("fails closed on a mismatched binding or invalid event chronology", () => {
    const current = proposal("in_review");
    const mismatched = { ...current, review: { ...current.review, contentHash: hash("9") } } as BusinessUnderstandingProposal;
    const mismatchedHtml = renderToStaticMarkup(
      <BusinessUnderstandingReviewPanel state="ready" proposal={mismatched} onApprove={() => undefined} onReject={() => undefined} />,
    );
    expect(mismatchedHtml).toContain('data-binding-valid="false"');
    expect(mismatchedHtml).toContain("Exact version validation failed");
    expect(mismatchedHtml).not.toMatch(/<button\b/u);

    const invalidChronology = {
      ...current,
      review: {
        ...current.review,
        events: current.review.events.map((event) => ({ ...event, at: current.createdAt })),
      },
    } as BusinessUnderstandingProposal;
    const chronologyHtml = renderToStaticMarkup(
      <BusinessUnderstandingReviewPanel state="ready" proposal={invalidChronology} onApprove={() => undefined} onReject={() => undefined} />,
    );
    expect(chronologyHtml).toContain('data-binding-valid="false"');
    expect(chronologyHtml).not.toMatch(/<button\b/u);
  });

  it("renders explicit accessible loading and error states", () => {
    const loading = renderToStaticMarkup(<BusinessUnderstandingReviewPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading business understanding");

    const error = renderToStaticMarkup(<BusinessUnderstandingReviewPanel state="error" error="The exact understanding version could not be loaded." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("The exact understanding version could not be loaded.");
  });
});
