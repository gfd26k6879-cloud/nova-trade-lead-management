import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BuyingCenterPortfolioPanel,
  type BuyingCenterPortfolioItem,
} from "@/components/buying-center/buying-center-portfolio-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function account(overrides: Partial<BuyingCenterPortfolioItem> = {}): BuyingCenterPortfolioItem {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: "30000000-0000-4000-8000-000000000001",
    accountName: "Synthetic Manufacturing",
    mapVersionId: `buying-center-version:${"a".repeat(64)}`,
    roleCoverage: { covered: 3, expected: 5 },
    people: { verified: 1, hypotheses: 2 },
    evidence: {
      freshness: "current",
      latestObservedAt: "2026-08-30T12:00:00.000Z",
      uncertainty: "low",
    },
    review: { status: "draft", needed: true },
    actions: { open: "available", review: "available" },
    ...overrides,
  };
}

describe("BuyingCenterPortfolioPanel", () => {
  it("renders supplied role coverage, people, hypotheses, evidence, uncertainty, and review summaries", () => {
    const html = renderToStaticMarkup(
      <BuyingCenterPortfolioPanel
        state="ready"
        scope={SCOPE}
        accounts={[
          account(),
          account({
            accountId: "30000000-0000-4000-8000-000000000002",
            accountName: "Example Distribution",
            mapVersionId: `buying-center-version:${"b".repeat(64)}`,
            roleCoverage: { covered: 2, expected: 4 },
            people: { verified: 0, hypotheses: 4 },
            evidence: { freshness: "stale", latestObservedAt: null, uncertainty: "high" },
            review: { status: "approved", needed: false },
            actions: { open: "available", review: "blocked" },
          }),
        ]}
      />,
    );

    expect(html).toContain('data-surface="buying-center-portfolio-panel"');
    expect(html).toContain('aria-label="Buying-center account portfolio"');
    expect(html).toContain("2 accounts · 1 review needed");
    expect(html).toContain("Synthetic Manufacturing");
    expect(html).toContain("3 of 5");
    expect(html).toContain("1 human-verified person");
    expect(html).toContain("2 role hypotheses");
    expect(html).toContain("Current");
    expect(html).toContain("Latest evidence");
    expect(html).toContain("Aug 30, 2026");
    expect(html).toContain("Low uncertainty");
    expect(html).toContain("Example Distribution");
    expect(html).toContain("0 human-verified people");
    expect(html).toContain("4 role hypotheses");
    expect(html).toContain("Stale");
    expect(html).toContain("No observation time supplied");
    expect(html).toContain("High uncertainty");
    expect(html).toContain('data-review-needed="true"');
    expect(html).toContain('data-review-needed="false"');
  });

  it("renders explicit accessible loading, error, empty, and defensive-empty states", () => {
    const loading = renderToStaticMarkup(<BuyingCenterPortfolioPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading buying-center portfolio");

    const error = renderToStaticMarkup(<BuyingCenterPortfolioPanel state="error" error="Portfolio snapshot unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Buying-center portfolio unavailable");
    expect(error).toContain("Portfolio snapshot unavailable.");

    const empty = renderToStaticMarkup(<BuyingCenterPortfolioPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No buying-center maps yet");

    const defensiveEmpty = renderToStaticMarkup(<BuyingCenterPortfolioPanel state="ready" scope={SCOPE} accounts={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("shows only supplied state-gated open and review callbacks", () => {
    const html = renderToStaticMarkup(
      <BuyingCenterPortfolioPanel
        state="ready"
        scope={SCOPE}
        accounts={[
          account(),
          account({
            accountId: "30000000-0000-4000-8000-000000000002",
            mapVersionId: `buying-center-version:${"c".repeat(64)}`,
            review: { status: "approved", needed: false },
            actions: { open: "available", review: "blocked" },
          }),
          account({
            accountId: "30000000-0000-4000-8000-000000000003",
            mapVersionId: `buying-center-version:${"d".repeat(64)}`,
            actions: { open: "blocked", review: "blocked" },
          }),
          account({
            accountId: "30000000-0000-4000-8000-000000000004",
            mapVersionId: `buying-center-version:${"e".repeat(64)}`,
            review: { status: "approved", needed: false },
            actions: { open: "blocked", review: "available" },
          }),
        ]}
        onOpen={() => undefined}
        onRequestReview={() => undefined}
      />,
    );

    expect(html.match(/>Open buying center</g)).toHaveLength(2);
    expect(html.match(/>Review buying center</g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const readOnly = renderToStaticMarkup(<BuyingCenterPortfolioPanel state="ready" scope={SCOPE} accounts={[account()]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("exposes exact scope and responsive, labelled, break-safe cards", () => {
    const html = renderToStaticMarkup(<BuyingCenterPortfolioPanel state="ready" scope={SCOPE} accounts={[account()]} />);

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="buying-center-portfolio-title"');
    expect(html).toContain("Exact portfolio scope");
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("xl:grid-cols-4");
    expect(html).toContain("2xl:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>Map version buying-center-version:/u);
  });

  it("fails closed without enumerating accounts from a mismatched scope", () => {
    const html = renderToStaticMarkup(
      <BuyingCenterPortfolioPanel
        state="ready"
        scope={SCOPE}
        accounts={[account({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onOpen={() => undefined}
      />,
    );

    expect(html).toContain("The buying-center portfolio scope could not be verified.");
    expect(html).not.toContain("Synthetic Manufacturing");
    expect(html).not.toMatch(/<button\b/u);
  });
});
