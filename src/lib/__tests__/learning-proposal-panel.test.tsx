import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LearningProposalPanel } from "@/components/learning/learning-proposal-panel";
import type { LearningProposal } from "@/lib/outcomes/learning-proposal";

const hash = (character: string) => `sha256:${character.repeat(64)}`;
const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "40000000-0000-4000-8000-000000000001";
const PLAY_VERSION = `lead-play-version:${"a".repeat(64)}`;
const PROPOSAL_VERSION = `learning-proposal-version:${"b".repeat(64)}`;

function proposal(status: LearningProposal["review"]["status"] = "draft"): LearningProposal {
  const events = status === "draft" ? [] : status === "in_review" ? [{
    from: "draft" as const,
    to: "in_review" as const,
    actor: { kind: "human" as const, actorId: REVIEWER_ID },
    at: "2026-08-30T14:01:00.000Z",
    reason: "Submit the bounded proposal for human review.",
  }] : [{
    from: "draft" as const,
    to: "in_review" as const,
    actor: { kind: "human" as const, actorId: REVIEWER_ID },
    at: "2026-08-30T14:01:00.000Z",
    reason: "Submit the bounded proposal for human review.",
  }, {
    from: "in_review" as const,
    to: status,
    actor: { kind: "human" as const, actorId: REVIEWER_ID },
    at: "2026-08-30T14:02:00.000Z",
    reason: `Human reviewer ${status} the proposal without activating policy.`,
  }];
  return {
    schemaVersion: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    playVersionId: PLAY_VERSION,
    versionId: PROPOSAL_VERSION,
    versionHash: hash("c"),
    stableKey: "learning-proposal:reply-readiness",
    revision: 1,
    supersedesVersionId: null,
    createdAt: "2026-08-30T14:00:00.000Z",
    outcomeRefs: [{
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      playVersionId: PLAY_VERSION,
      stableKey: "outcome:reply-1",
      versionId: `outcome-version:${"d".repeat(64)}`,
      versionHash: hash("d"),
      contentHash: hash("e"),
      outcome: "replied",
      occurredAt: "2026-08-30T11:00:00.000Z",
      recordedAt: "2026-08-30T12:00:00.000Z",
      sourceHash: hash("f"),
      attributionKind: "assisted",
      attributionConfidenceBasisPoints: 6_000,
      outcomeRefHash: hash("1"),
    }],
    cohort: {
      cohortId: "cohort:august",
      definitionHash: hash("2"),
      windowStart: "2026-08-01T00:00:00.000Z",
      windowEnd: "2026-08-30T13:00:00.000Z",
      denominator: 1,
    },
    metric: { metricKey: "reply_rate", formulaVersion: "reply-rate:v1", numerator: 1, denominator: 1, valueBasisPoints: 10_000 },
    target: { kind: "play_policy", currentPlayVersionId: PLAY_VERSION, currentPolicyHash: hash("3") },
    change: {
      kind: "score_weight_basis_points",
      targetKey: "score-factor:reply-readiness",
      currentValue: 3_000,
      proposedValue: 3_500,
      rationale: "Test a modest reviewed increase without changing active policy.",
    },
    uncertainties: [{
      uncertaintyId: "uncertainty:small-cohort",
      statement: "The cohort is small.",
      impact: "The estimated effect may not generalize.",
      severity: 4,
    }],
    expectedImpact: {
      metricKey: "reply_rate",
      direction: "increase",
      estimateBasisPoints: 500,
      lowerBoundBasisPoints: 0,
      upperBoundBasisPoints: 1_000,
      horizonDays: 30,
      rationale: "The range remains wide because the cohort is small.",
    },
    rollback: {
      restorePlayVersionId: PLAY_VERSION,
      restorePolicyHash: hash("3"),
      triggerMetricKey: "reply_rate",
      triggerThresholdBasisPoints: 3_500,
      reason: "Restore the exact reviewed baseline if the metric degrades.",
    },
    contentHash: hash("4"),
    review: {
      reviewVersion: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      playVersionId: PLAY_VERSION,
      versionId: PROPOSAL_VERSION,
      contentHash: hash("4"),
      status,
      events,
      reviewHash: hash("5"),
    },
  };
}

describe("LearningProposalPanel", () => {
  it("shows the exact measured change, cohort, uncertainty, impact range, and rollback", () => {
    const html = renderToStaticMarkup(<LearningProposalPanel state="ready" proposal={proposal()} />);

    expect(html).toContain('data-surface="learning-proposal-panel"');
    expect(html).toContain("score weight basis points");
    expect(html).toContain("30.00%");
    expect(html).toContain("35.00%");
    expect(html).toContain("1 / 1");
    expect(html).toContain("Exact outcome lineage");
    expect(html).toContain("outcome:reply-1");
    expect(html).toContain("The cohort is small.");
    expect(html).toContain("Range 0.00%–10.00%");
    expect(html).toContain("Rollback descriptor");
    expect(html).toContain(PROPOSAL_VERSION);
  });

  it("shows only the review action allowed by the exact draft or in-review state", () => {
    const draft = renderToStaticMarkup(
      <LearningProposalPanel state="ready" proposal={proposal()} onSubmitForReview={() => undefined} onApprove={() => undefined} />,
    );
    expect(draft).toContain("Submit for human review");
    expect(draft).not.toContain("Approve proposal only");

    const reviewing = renderToStaticMarkup(
      <LearningProposalPanel state="ready" proposal={proposal("in_review")} onSubmitForReview={() => undefined} onApprove={() => undefined} onReject={() => undefined} />,
    );
    expect(reviewing).toContain("Approve proposal only");
    expect(reviewing).toContain("Reject proposal");
    expect(reviewing).not.toContain("Submit for human review");
    expect(reviewing).not.toMatch(/<button[^>]*>[^<]*(?:activate|apply policy|automatic approval)/iu);
  });

  it("removes controls after a terminal human decision and retains the review trail", () => {
    const html = renderToStaticMarkup(
      <LearningProposalPanel state="ready" proposal={proposal("approved")} onApprove={() => undefined} onReject={() => undefined} />,
    );
    expect(html).toContain('data-review-status="approved"');
    expect(html).toContain('aria-label="Learning proposal review events"');
    expect(html).toContain("draft → in review");
    expect(html).toContain("in review → approved");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("renders explicit accessible loading and error states", () => {
    const loading = renderToStaticMarkup(<LearningProposalPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading learning proposal");

    const error = renderToStaticMarkup(<LearningProposalPanel state="error" error="The exact proposal could not be loaded." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("The exact proposal could not be loaded.");
  });
});
