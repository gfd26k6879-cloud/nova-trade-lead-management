import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DiscoveryPlansPanel, type DiscoveryPlanSummary } from "@/components/discovery/discovery-plans-panel";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT, workspaceId: WORKSPACE } as const;

function summary(overrides: Partial<DiscoveryPlanSummary> = {}): DiscoveryPlanSummary {
  return {
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    planId: "discovery-plan:approved-current",
    status: "plan_only",
    reviewStatus: "approved",
    binding: {
      playStableKey: "lead-play:industrial-change",
      playVersionId: `lead-play-version:${"a".repeat(64)}`,
      playRevision: 3,
      sourceKeys: ["google-places", "trade-directory"],
    },
    caps: { maxAccounts: 80, maxProviderRequests: 120, maxSpendCents: 2_500 },
    freshness: { state: "current", asOf: "2026-08-30T18:00:00.000Z" },
    readiness: { review: "not_required", run: "ready" },
    allowedActions: { open: true, review: false, run: true },
    ...overrides,
  };
}

describe("DiscoveryPlansPanel", () => {
  it("renders explicit loading, error, and empty states", () => {
    expect(renderToStaticMarkup(<DiscoveryPlansPanel state="loading" />)).toContain('data-discovery-plans-state="loading"');
    expect(renderToStaticMarkup(<DiscoveryPlansPanel state="error" error="Plan index is unavailable." />)).toContain("Plan index is unavailable.");
    expect(renderToStaticMarkup(<DiscoveryPlansPanel state="ready" scope={SCOPE} plans={[]} />)).toContain('data-discovery-plans-state="empty"');
  });

  it("shows exact scope, canonical bindings, approval, caps, freshness, and readiness", () => {
    const html = renderToStaticMarkup(<DiscoveryPlansPanel state="ready" scope={SCOPE} plans={[summary()]} />);

    expect(html).toContain('data-surface="discovery-plans-panel"');
    expect(html).toContain('aria-label="Canonical discovery plans"');
    expect(html).toContain(TENANT);
    expect(html).toContain(WORKSPACE);
    expect(html).toContain("discovery-plan:approved-current");
    expect(html).toContain("lead-play:industrial-change");
    expect(html).toContain(`lead-play-version:${"a".repeat(64)}`);
    expect(html).toContain("revision 3");
    expect(html).toContain("google-places, trade-directory");
    expect(html).toContain("Approved");
    expect(html).toContain("80");
    expect(html).toContain("120");
    expect(html).toContain("$25.00");
    expect(html).toContain('data-freshness="current"');
    expect(html).toContain('data-run-readiness="ready"');
    expect(html).toContain("Ready for bounded run");
  });

  it("renders only supplied actions that are valid for the canonical state", () => {
    const reviewable = summary({
      planId: "discovery-plan:reviewable",
      reviewStatus: "in_review",
      freshness: { state: "current", asOf: "2026-08-30T18:00:00.000Z" },
      readiness: { review: "ready", run: "blocked" },
      allowedActions: { open: true, review: true, run: true },
    });
    const stale = summary({
      planId: "discovery-plan:stale",
      freshness: { state: "stale", asOf: "2026-08-25T18:00:00.000Z" },
      allowedActions: { open: false, review: false, run: true },
    });
    const html = renderToStaticMarkup(
      <DiscoveryPlansPanel state="ready" scope={SCOPE} plans={[summary(), reviewable, stale]} onOpen={vi.fn()} onReview={vi.fn()} onRun={vi.fn()} />,
    );

    expect(html.match(/data-discovery-plans-action="open"/gu)).toHaveLength(2);
    expect(html.match(/data-discovery-plans-action="review"/gu)).toHaveLength(1);
    expect(html.match(/data-discovery-plans-action="run"/gu)).toHaveLength(1);
    expect(html).toContain("Stale snapshot");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);

    const readOnly = renderToStaticMarkup(<DiscoveryPlansPanel state="ready" scope={SCOPE} plans={[summary()]} />);
    expect(readOnly).not.toContain("<button");
  });

  it("fails closed without enumerating plans from a mismatched scope", () => {
    const html = renderToStaticMarkup(
      <DiscoveryPlansPanel
        state="ready"
        scope={SCOPE}
        plans={[summary({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onOpen={vi.fn()}
      />,
    );

    expect(html).toContain("The discovery-plan portfolio scope could not be verified.");
    expect(html).not.toContain("discovery-plan:approved-current");
    expect(html).not.toContain("<button");
  });

  it("supports tenant-wide scope and responsive semantic hierarchy", () => {
    const tenantWide = summary({ workspaceId: null });
    const html = renderToStaticMarkup(<DiscoveryPlansPanel state="ready" scope={{ tenantId: TENANT, workspaceId: null }} plans={[tenantWide]} />);

    expect(html).toContain("Tenant-wide (null)");
    expect(html.match(/<h2\b/gu)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="discovery-plans-title"');
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>discovery-plan:/u);
  });
});
