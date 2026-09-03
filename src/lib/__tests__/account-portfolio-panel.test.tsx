import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AccountPortfolioPanel,
  type AccountPortfolioItem,
} from "@/components/accounts/account-portfolio-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function account(overrides: Partial<AccountPortfolioItem> = {}): AccountPortfolioItem {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: "account:apex-industrial",
    displayName: "Apex Industrial",
    status: "active",
    updatedAt: "2026-08-30T15:15:00.000Z",
    freshness: "current",
    reviewNeeded: false,
    qualification: {
      versionId: `account-qualification:${"a".repeat(64)}`,
      weightedScore: 82,
      decision: "qualified",
      uncertainty: "low",
      reviewStatus: "confirmed",
      evaluatedAt: "2026-08-30T15:10:00.000Z",
    },
    ...overrides,
  };
}

describe("AccountPortfolioPanel", () => {
  it("renders canonical account, qualification, uncertainty, freshness, and review summaries", () => {
    const html = renderToStaticMarkup(
      <AccountPortfolioPanel
        state="ready"
        scope={SCOPE}
        accounts={[
          account(),
          account({
            accountId: "account:orbit-fabrication",
            displayName: "Orbit Fabrication",
            freshness: "stale",
            reviewNeeded: true,
            qualification: {
              versionId: `account-qualification:${"b".repeat(64)}`,
              weightedScore: 61,
              decision: "needs_review",
              uncertainty: "high",
              reviewStatus: "unreviewed",
              evaluatedAt: "2026-08-29T11:00:00.000Z",
            },
          }),
        ]}
      />,
    );

    expect(html).toContain('data-surface="account-portfolio-panel"');
    expect(html).toContain('aria-label="Canonical account portfolio"');
    expect(html).toContain("2 accounts · 1 review needed");
    expect(html).toContain("Apex Industrial");
    expect(html).toContain("82/100");
    expect(html).toContain("Low uncertainty");
    expect(html).toContain("Current");
    expect(html).toContain('data-review-needed="true"');
    expect(html).toContain("Orbit Fabrication");
    expect(html).toContain("Needs review");
    expect(html).toContain("High uncertainty");
    expect(html).toContain("Stale");
    expect(html).toContain("Human review: unreviewed");
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<AccountPortfolioPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading account portfolio");

    const error = renderToStaticMarkup(<AccountPortfolioPanel state="error" error="Portfolio snapshot unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Account portfolio unavailable");
    expect(error).toContain("Portfolio snapshot unavailable.");

    const empty = renderToStaticMarkup(<AccountPortfolioPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No accounts yet");

    const defensiveEmpty = renderToStaticMarkup(<AccountPortfolioPanel state="ready" scope={SCOPE} accounts={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("shows only state-gated select and review actions", () => {
    const html = renderToStaticMarkup(
      <AccountPortfolioPanel
        state="ready"
        scope={SCOPE}
        accounts={[
          account({ reviewNeeded: true }),
          account({ accountId: "account:steady", displayName: "Steady Works", reviewNeeded: false }),
          account({ accountId: "account:merged", displayName: "Merged Record", status: "merged", reviewNeeded: true }),
        ]}
        onSelect={() => undefined}
        onRequestReview={() => undefined}
      />,
    );

    expect(html.match(/>Open account</g)).toHaveLength(2);
    expect(html.match(/>Review qualification</g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const readOnly = renderToStaticMarkup(<AccountPortfolioPanel state="ready" scope={SCOPE} accounts={[account({ reviewNeeded: true })]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("handles an unevaluated account without inventing a score or review decision", () => {
    const html = renderToStaticMarkup(
      <AccountPortfolioPanel
        state="ready"
        scope={SCOPE}
        accounts={[account({ qualification: null, freshness: "unknown", reviewNeeded: true })]}
      />,
    );

    expect(html).toContain("Not evaluated");
    expect(html).toContain("No score");
    expect(html).toContain("Uncertainty not assessed");
    expect(html).toContain("Unknown");
    expect(html).not.toContain("Human review: unreviewed");
  });

  it("uses one ordered heading hierarchy and responsive, break-safe layout", () => {
    const html = renderToStaticMarkup(<AccountPortfolioPanel state="ready" scope={SCOPE} accounts={[account()]} />);

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="account-portfolio-title"');
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain("sm:grid-cols-3");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>account:apex-industrial</u);
  });

  it("fails closed without enumerating accounts from a mismatched scope", () => {
    const html = renderToStaticMarkup(
      <AccountPortfolioPanel
        state="ready"
        scope={SCOPE}
        accounts={[account({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onSelect={() => undefined}
      />,
    );

    expect(html).toContain("The account portfolio scope could not be verified.");
    expect(html).not.toContain("Apex Industrial");
    expect(html).not.toMatch(/<button\b/u);
  });
});
