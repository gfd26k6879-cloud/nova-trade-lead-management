import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  StrategyPortfolioPanel,
  type StrategyPortfolioSummary,
} from "@/components/strategy/strategy-portfolio-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function icp(overrides: Partial<StrategyPortfolioSummary> = {}): StrategyPortfolioSummary {
  return {
    kind: "icp",
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    stableKey: "icp:industrial-formulators",
    versionId: `icp-version:${"a".repeat(64)}`,
    revision: 2,
    title: "Industrial formulators with evaluation capacity",
    lifecycle: "active",
    reviewStatus: "approved",
    evidenceReadiness: "ready",
    exclusionCount: 3,
    budgetPolicy: null,
    actions: { open: true, review: false, rollback: true },
    rollbackTargetVersionId: `icp-version:${"b".repeat(64)}`,
    ...overrides,
  } as StrategyPortfolioSummary;
}

function leadPlay(overrides: Partial<StrategyPortfolioSummary> = {}): StrategyPortfolioSummary {
  return {
    kind: "lead_play",
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    stableKey: "lead-play:evaluation-capacity",
    versionId: `lead-play-version:${"c".repeat(64)}`,
    revision: 1,
    title: "Evaluation-capacity discovery",
    lifecycle: "draft",
    reviewStatus: "in_review",
    evidenceReadiness: "needs_review",
    exclusionCount: 7,
    budgetPolicy: {
      maxAccounts: 80,
      maxProviderRequests: 120,
      maxSpendCents: 2500,
      outreachMode: "draft_only",
    },
    actions: { open: true, review: true, rollback: false },
    rollbackTargetVersionId: null,
    ...overrides,
  } as StrategyPortfolioSummary;
}

describe("StrategyPortfolioPanel", () => {
  it("renders canonical ICP and lead-play summaries without deriving policy decisions", () => {
    const html = renderToStaticMarkup(<StrategyPortfolioPanel state="ready" scope={SCOPE} versions={[icp(), leadPlay()]} />);

    expect(html).toContain('data-surface="strategy-portfolio-panel"');
    expect(html).toContain('aria-label="Canonical strategy versions"');
    expect(html).toContain("2 versions · 1 active · 1 review action");
    expect(html).toContain("Industrial formulators with evaluation capacity");
    expect(html).toContain("icp:industrial-formulators");
    expect(html).toContain('data-lifecycle="active"');
    expect(html).toContain("Evidence ready");
    expect(html).toContain("3");
    expect(html).toContain("Not applicable to ICP definitions.");
    expect(html).toContain("Evaluation-capacity discovery");
    expect(html).toContain("lead-play:evaluation-capacity");
    expect(html).toContain('data-lifecycle="draft"');
    expect(html).toContain("Evidence needs review");
    expect(html).toContain("80");
    expect(html).toContain("120");
    expect(html).toContain("$25.00");
    expect(html).toContain("Draft only");
    expect(html).toContain("Rollback available");
    expect(html).toContain("Rollback unavailable");
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<StrategyPortfolioPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading strategy portfolio");

    const error = renderToStaticMarkup(<StrategyPortfolioPanel state="error" error="Portfolio snapshot unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Strategy portfolio unavailable");
    expect(error).toContain("Portfolio snapshot unavailable.");

    const empty = renderToStaticMarkup(<StrategyPortfolioPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No strategy versions yet");

    const defensiveEmpty = renderToStaticMarkup(<StrategyPortfolioPanel state="ready" scope={SCOPE} versions={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("shows only supplied state-gated open, review, and rollback callbacks", () => {
    const html = renderToStaticMarkup(
      <StrategyPortfolioPanel
        state="ready"
        scope={SCOPE}
        versions={[
          icp(),
          leadPlay(),
          leadPlay({
            versionId: `lead-play-version:${"d".repeat(64)}`,
            lifecycle: "active",
            reviewStatus: "approved",
            actions: { open: false, review: false, rollback: false },
          }),
          icp({
            versionId: `icp-version:${"e".repeat(64)}`,
            rollbackTargetVersionId: null,
            actions: { open: false, review: false, rollback: true },
          }),
        ]}
        onOpen={() => undefined}
        onReview={() => undefined}
        onRollback={() => undefined}
      />,
    );

    expect(html.match(/>Open exact version</g)).toHaveLength(2);
    expect(html.match(/>Review exact version</g)).toHaveLength(1);
    expect(html.match(/>Request rollback</g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(4);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const readOnly = renderToStaticMarkup(<StrategyPortfolioPanel state="ready" scope={SCOPE} versions={[icp(), leadPlay()]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("shows the exact tenant and workspace scope and fails closed on a mismatch", () => {
    const ready = renderToStaticMarkup(<StrategyPortfolioPanel state="ready" scope={SCOPE} versions={[icp()]} />);
    expect(ready).toContain(TENANT_ID);
    expect(ready).toContain(WORKSPACE_ID);

    const mismatched = renderToStaticMarkup(
      <StrategyPortfolioPanel
        state="ready"
        scope={SCOPE}
        versions={[leadPlay({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onOpen={() => undefined}
      />,
    );
    expect(mismatched).toContain("The strategy portfolio scope could not be verified.");
    expect(mismatched).not.toContain("Evaluation-capacity discovery");
    expect(mismatched).not.toMatch(/<button\b/u);
  });

  it("supports nullable tenant-wide workspace scope and a responsive heading hierarchy", () => {
    const tenantWide = icp({ workspaceId: null });
    const html = renderToStaticMarkup(
      <StrategyPortfolioPanel state="ready" scope={{ tenantId: TENANT_ID, workspaceId: null }} versions={[tenantWide]} />,
    );

    expect(html).toContain("Tenant-wide (null)");
    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="strategy-portfolio-title"');
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.65fr)]");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>icp-version:/u);
  });
});
