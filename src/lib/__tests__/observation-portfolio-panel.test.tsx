import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ObservationPortfolioPanel,
  type DiscoveryObservationSummary,
} from "@/components/discovery/observation-portfolio-panel";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const RECEIPT_HASH = `sha256:${"a".repeat(64)}`;

function observation(overrides: Partial<DiscoveryObservationSummary> = {}): DiscoveryObservationSummary {
  return {
    observationId: "observation:google:one",
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    sourceCardId: "google_places_legacy",
    sourceCardVersion: 3,
    observedAt: "2026-08-30T16:00:00.000Z",
    freshness: "current",
    freshnessEvaluatedAt: "2026-08-30T17:00:00.000Z",
    accountBinding: {
      state: "resolved",
      accountId: "account:apex",
      resolutionId: "account-resolution:one",
      reviewRequired: false,
    },
    permittedFields: ["business_name", "formatted_address", "website"],
    evidenceReceipt: {
      receiptId: "source-receipt:one",
      receiptHash: RECEIPT_HASH,
      receivedAt: "2026-08-30T16:01:00.000Z",
    },
    ...overrides,
  };
}

describe("ObservationPortfolioPanel", () => {
  it("shows canonical source, scope, account, freshness, permitted fields, and evidence receipt without raw values", () => {
    const html = renderToStaticMarkup(
      <ObservationPortfolioPanel
        state="ready"
        tenantId={TENANT}
        workspaceId={WORKSPACE}
        observations={[observation()]}
      />,
    );

    expect(html).toContain('data-surface="observation-portfolio-panel"');
    expect(html).toContain('data-observation-portfolio-state="ready"');
    expect(html).toContain('aria-labelledby="observation-portfolio-title"');
    expect(html).toContain("google_places_legacy · source card v3");
    expect(html).toContain("observation:google:one");
    expect(html).toContain('aria-label="Freshness: Current"');
    expect(html).toContain("Canonical account linked");
    expect(html).toContain("account:apex");
    expect(html).toContain("account-resolution:one");
    expect(html).toContain('aria-label="Permitted field names"');
    expect(html).toContain("business_name");
    expect(html).toContain("formatted_address");
    expect(html).toContain("website");
    expect(html).toContain("source-receipt:one");
    expect(html).toContain(RECEIPT_HASH);
    expect(html).toContain(TENANT);
    expect(html).toContain(WORKSPACE);
    expect(html).toContain("Raw provider payloads are not shown here.");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("makes ambiguity and review need explicit and exposes only supplied eligible callbacks", () => {
    const ambiguous = observation({
      observationId: "observation:list:two",
      sourceCardId: "customer_list_csv_upload",
      sourceCardVersion: 1,
      freshness: "stale",
      accountBinding: {
        state: "ambiguous",
        accountId: null,
        resolutionId: "account-resolution:ambiguous",
        reviewRequired: true,
      },
    });
    const html = renderToStaticMarkup(
      <ObservationPortfolioPanel
        state="ready"
        tenantId={TENANT}
        workspaceId={WORKSPACE}
        observations={[ambiguous]}
        onOpenObservation={vi.fn()}
        onReviewObservation={vi.fn()}
      />,
    );

    expect(html).toContain('data-observation-state="ambiguous"');
    expect(html).toContain('data-review-required="true"');
    expect(html).toContain('aria-label="Freshness: Stale"');
    expect(html).toContain("Ambiguous identity");
    expect(html).toContain("Review needed");
    expect(html).toContain("No account selected");
    expect(html).toContain('data-observation-action="open"');
    expect(html).toContain('data-observation-action="review"');
    expect(html).toContain("Review account identity");
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);

    const noReviewCallback = renderToStaticMarkup(
      <ObservationPortfolioPanel
        state="ready"
        tenantId={TENANT}
        workspaceId={WORKSPACE}
        observations={[ambiguous]}
        onOpenObservation={vi.fn()}
      />,
    );
    expect(noReviewCallback).toContain('data-observation-action="open"');
    expect(noReviewCallback).not.toContain('data-observation-action="review"');
  });

  it("withholds review for resolved or not-reviewable observations even when a callback is supplied", () => {
    const resolved = renderToStaticMarkup(
      <ObservationPortfolioPanel
        state="ready"
        tenantId={TENANT}
        workspaceId={WORKSPACE}
        observations={[observation()]}
        onReviewObservation={vi.fn()}
      />,
    );
    expect(resolved).not.toContain('data-observation-action="review"');
    expect(resolved).not.toMatch(/<button\b/u);

    const unresolved = renderToStaticMarkup(
      <ObservationPortfolioPanel
        state="ready"
        tenantId={TENANT}
        workspaceId={WORKSPACE}
        observations={[observation({
          accountBinding: {
            state: "unresolved",
            accountId: null,
            resolutionId: null,
            reviewRequired: false,
          },
        })]}
        onReviewObservation={vi.fn()}
      />,
    );
    expect(unresolved).toContain("Not yet resolved");
    expect(unresolved).not.toContain('data-observation-action="review"');
  });

  it("fails closed for duplicate or cross-scope records and withholds every action", () => {
    const foreign = observation({ workspaceId: "20000000-0000-4000-8000-000000000099" });
    const html = renderToStaticMarkup(
      <ObservationPortfolioPanel
        state="ready"
        tenantId={TENANT}
        workspaceId={WORKSPACE}
        observations={[foreign]}
        onOpenObservation={vi.fn()}
        onReviewObservation={vi.fn()}
      />,
    );
    expect(html).toContain('data-observation-portfolio-state="invalid"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("Observation portfolio withheld");
    expect(html).not.toMatch(/<button\b/u);

    const duplicate = observation({
      accountBinding: { state: "ambiguous", accountId: null, resolutionId: "resolution:two", reviewRequired: true },
    });
    const duplicateHtml = renderToStaticMarkup(
      <ObservationPortfolioPanel
        state="ready"
        tenantId={TENANT}
        workspaceId={WORKSPACE}
        observations={[duplicate, duplicate]}
        onReviewObservation={vi.fn()}
      />,
    );
    expect(duplicateHtml).toContain('data-observation-portfolio-state="invalid"');
    expect(duplicateHtml).not.toMatch(/<button\b/u);
  });

  it("renders accessible loading, error, empty, tenant-wide, and responsive ready states", () => {
    const loading = renderToStaticMarkup(<ObservationPortfolioPanel state="loading" />);
    expect(loading).toContain('data-observation-portfolio-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading source observations");

    const error = renderToStaticMarkup(<ObservationPortfolioPanel state="error" error="Scoped observations are unavailable." />);
    expect(error).toContain('data-observation-portfolio-state="error"');
    expect(error).toContain('role="alert"');
    expect(error).toContain("Scoped observations are unavailable.");

    const empty = renderToStaticMarkup(
      <ObservationPortfolioPanel state="empty" tenantId={TENANT} workspaceId={WORKSPACE} />,
    );
    expect(empty).toContain('data-observation-portfolio-state="empty"');
    expect(empty).toContain("No source observations yet");
    expect(empty).toContain(TENANT);

    const tenantWide = renderToStaticMarkup(
      <ObservationPortfolioPanel
        state="ready"
        tenantId={TENANT}
        workspaceId={null}
        observations={[observation({ workspaceId: null, freshness: "unknown", freshnessEvaluatedAt: null })]}
      />,
    );
    expect(tenantWide).toContain("Tenant-wide");
    expect(tenantWide).toContain('aria-label="Freshness: Unknown freshness"');
    expect(tenantWide).toContain("Freshness has not been evaluated");
    expect(tenantWide).toContain("grid gap-4 xl:grid-cols-2");
    expect(tenantWide).toContain("sm:flex-row");

    const emptyReady = renderToStaticMarkup(
      <ObservationPortfolioPanel state="ready" tenantId={TENANT} workspaceId={WORKSPACE} observations={[]} />,
    );
    expect(emptyReady).toContain('data-observation-portfolio-state="empty"');
    expect(emptyReady).toContain("Complete a bounded discovery page");
  });
});
