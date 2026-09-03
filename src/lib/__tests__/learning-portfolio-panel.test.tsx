import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  LearningPortfolioPanel,
  type LearningPortfolioSummary,
} from "@/components/learning/learning-portfolio-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function proposal(overrides: Partial<LearningPortfolioSummary> = {}): LearningPortfolioSummary {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: "30000000-0000-4000-8000-000000000001",
    stableKey: "learning-proposal:reply-readiness",
    versionId: `learning-proposal-version:${"a".repeat(64)}`,
    revision: 2,
    createdAt: "2026-08-29T15:00:00.000Z",
    cohort: {
      cohortId: "cohort:industrial-august",
      windowStart: "2026-08-01T00:00:00.000Z",
      windowEnd: "2026-08-29T00:00:00.000Z",
      denominator: 40,
    },
    metric: { metricKey: "reply_rate", numerator: 8, denominator: 40, valueBasisPoints: 2_000 },
    change: {
      kind: "score_weight_basis_points",
      targetKey: "score-factor:reply-readiness",
      currentValue: 3_000,
      proposedValue: 3_500,
    },
    uncertainty: { count: 2, highestSeverity: 4, headline: "The newest outcomes may not generalize." },
    expectedImpact: {
      metricKey: "reply_rate",
      direction: "increase",
      estimateBasisPoints: 500,
      lowerBoundBasisPoints: 100,
      upperBoundBasisPoints: 900,
      horizonDays: 30,
    },
    rollback: {
      restorePlayVersionId: `lead-play-version:${"b".repeat(64)}`,
      triggerMetricKey: "reply_rate",
      triggerThresholdBasisPoints: 1_500,
      readiness: "ready",
    },
    readiness: "ready",
    reviewStatus: "in_review",
    eligibleActions: ["open", "review"],
    ...overrides,
  };
}

describe("LearningPortfolioPanel", () => {
  it("shows exact scope and the supplied cohort, metric, delta, uncertainty, impact, rollback, and review status", () => {
    const html = renderToStaticMarkup(<LearningPortfolioPanel state="ready" scope={SCOPE} proposals={[proposal()]} />);

    expect(html).toContain('data-surface="learning-portfolio-panel"');
    expect(html).toContain('aria-label="Exact learning proposal portfolio scope"');
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
    expect(html).toContain("cohort:industrial-august");
    expect(html).toContain("40 records");
    expect(html).toContain("reply rate · 20.00%");
    expect(html).toContain("30.00% → 35.00%");
    expect(html).toContain("2 uncertainties");
    expect(html).toContain("The newest outcomes may not generalize.");
    expect(html).toContain("Highest severity 4/5");
    expect(html).toContain("+5.00% reply rate");
    expect(html).toContain("Range 1.00%–9.00% over 30 days");
    expect(html).toContain("Rollback ready");
    expect(html).toContain("Trigger reply rate at 15.00%");
    expect(html).toContain("Proposal ready");
    expect(html).toContain("In review");
  });

  it("renders accessible loading, error, empty, and defensive empty states", () => {
    const loading = renderToStaticMarkup(<LearningPortfolioPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading learning proposals");

    const error = renderToStaticMarkup(<LearningPortfolioPanel state="error" error="Proposal summaries unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Learning proposals unavailable");
    expect(error).toContain("Proposal summaries unavailable.");

    const empty = renderToStaticMarkup(<LearningPortfolioPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No learning proposals yet");

    const defensiveEmpty = renderToStaticMarkup(<LearningPortfolioPanel state="ready" scope={SCOPE} proposals={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("renders only supplied open and valid review callbacks, with no activation surface", () => {
    const html = renderToStaticMarkup(
      <LearningPortfolioPanel
        state="ready"
        scope={SCOPE}
        proposals={[
          proposal(),
          proposal({
            stableKey: "learning-proposal:blocked",
            versionId: `learning-proposal-version:${"c".repeat(64)}`,
            readiness: "blocked",
            reviewStatus: "draft",
          }),
          proposal({
            stableKey: "learning-proposal:approved",
            versionId: `learning-proposal-version:${"d".repeat(64)}`,
            reviewStatus: "approved",
          }),
          proposal({
            stableKey: "learning-proposal:read-only",
            versionId: `learning-proposal-version:${"e".repeat(64)}`,
            eligibleActions: [],
          }),
        ]}
        onOpen={() => undefined}
        onReview={() => undefined}
      />,
    );

    expect(html.match(/>Open exact proposal</g)).toHaveLength(3);
    expect(html.match(/>Review exact proposal</g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(4);
    expect(html).not.toMatch(/<button[^>]*>[^<]*(?:activate|apply|rollback)/iu);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const noCallbacks = renderToStaticMarkup(<LearningPortfolioPanel state="ready" scope={SCOPE} proposals={[proposal()]} />);
    expect(noCallbacks).not.toMatch(/<button\b/u);
  });

  it("fails closed before rendering summaries or callbacks when scope differs", () => {
    const html = renderToStaticMarkup(
      <LearningPortfolioPanel
        state="ready"
        scope={SCOPE}
        proposals={[proposal({ workspaceId: "20000000-0000-4000-8000-000000000099" })]}
        onOpen={() => undefined}
        onReview={() => undefined}
      />,
    );

    expect(html).toContain("The learning proposal portfolio scope could not be verified.");
    expect(html).not.toContain("cohort:industrial-august");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("uses ordered headings, break-safe cards, responsive grids, and touch-sized controls", () => {
    const html = renderToStaticMarkup(
      <LearningPortfolioPanel state="ready" scope={SCOPE} proposals={[proposal()]} onOpen={() => undefined} onReview={() => undefined} />,
    );

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="learning-portfolio-title"');
    expect(html).toContain("2xl:grid-cols-2");
    expect(html).toContain("xl:grid-cols-4");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>learning-proposal-version:/u);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*min-h-11[^>]*focus-visible:outline-2/u);
  });
});
