import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  BusinessUnderstandingHistoryPanel,
  type BusinessUnderstandingVersionSummary,
} from "@/components/knowledge/business-understanding-history-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function version(overrides: Partial<BusinessUnderstandingVersionSummary> = {}): BusinessUnderstandingVersionSummary {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    versionId: `understanding-version:${"a".repeat(64)}`,
    proposalRef: "understanding:proposal-3",
    revision: 3,
    status: "current",
    evidenceCount: 18,
    uncertaintyCount: 2,
    questionCount: 1,
    recordedAt: "2026-08-30T15:00:00.000Z",
    lastReview: {
      reviewerId: "30000000-0000-4000-8000-000000000001",
      reviewerLabel: "Avery Reviewer",
      reviewedAt: "2026-08-30T15:05:00.000Z",
    },
    rollbackTargetVersionId: `understanding-version:${"b".repeat(64)}`,
    actions: { open: true, review: false, rollback: true },
    ...overrides,
  };
}

describe("BusinessUnderstandingHistoryPanel", () => {
  it("shows supplied canonical version status, counts, reviewer, time, and exact scope", () => {
    const html = renderToStaticMarkup(
      <BusinessUnderstandingHistoryPanel
        state="ready"
        scope={SCOPE}
        versions={[
          version(),
          version({
            versionId: `understanding-version:${"c".repeat(64)}`,
            proposalRef: "understanding:proposal-2",
            revision: 2,
            status: "approved",
            evidenceCount: 12,
            uncertaintyCount: 4,
            questionCount: 3,
            rollbackTargetVersionId: null,
            actions: { open: true, review: false, rollback: false },
          }),
          version({
            versionId: `understanding-version:${"d".repeat(64)}`,
            proposalRef: "understanding:proposal-1",
            revision: 1,
            status: "superseded",
            lastReview: null,
            rollbackTargetVersionId: null,
            actions: { open: false, review: false, rollback: false },
          }),
        ]}
      />,
    );

    expect(html).toContain('data-surface="business-understanding-history-panel"');
    expect(html).toContain('aria-label="Canonical business-understanding versions"');
    expect(html).toContain("3 versions · 1 current · 0 awaiting review");
    expect(html).toContain('data-version-status="current"');
    expect(html).toContain('data-version-status="approved"');
    expect(html).toContain('data-version-status="superseded"');
    expect(html).toContain("Evidence");
    expect(html).toContain("18");
    expect(html).toContain("Uncertainties");
    expect(html).toContain("Adaptive questions");
    expect(html).toContain("Avery Reviewer");
    expect(html).toContain("Aug 30, 2026, 3:05 PM UTC");
    expect(html).toContain("No human review recorded");
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
  });

  it("shows draft state and only supplied state-gated callbacks", () => {
    const html = renderToStaticMarkup(
      <BusinessUnderstandingHistoryPanel
        state="ready"
        scope={SCOPE}
        versions={[
          version({
            versionId: `understanding-version:${"e".repeat(64)}`,
            revision: 4,
            status: "draft",
            lastReview: null,
            rollbackTargetVersionId: null,
            actions: { open: true, review: true, rollback: false },
          }),
          version(),
          version({
            versionId: `understanding-version:${"f".repeat(64)}`,
            rollbackTargetVersionId: null,
            actions: { open: false, review: false, rollback: true },
          }),
        ]}
        onOpen={() => undefined}
        onReview={() => undefined}
        onRollback={() => undefined}
      />,
    );

    expect(html).toContain('data-version-status="draft"');
    expect(html.match(/>Open exact version</g)).toHaveLength(2);
    expect(html.match(/>Review exact version</g)).toHaveLength(1);
    expect(html.match(/>Request rollback</g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(4);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const readOnly = renderToStaticMarkup(<BusinessUnderstandingHistoryPanel state="ready" scope={SCOPE} versions={[version()]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<BusinessUnderstandingHistoryPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading understanding history");

    const error = renderToStaticMarkup(<BusinessUnderstandingHistoryPanel state="error" error="Canonical history unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Understanding history unavailable");
    expect(error).toContain("Canonical history unavailable.");

    const empty = renderToStaticMarkup(<BusinessUnderstandingHistoryPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No understanding versions yet");

    const defensiveEmpty = renderToStaticMarkup(<BusinessUnderstandingHistoryPanel state="ready" scope={SCOPE} versions={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("fails closed when a version does not match the supplied scope", () => {
    const html = renderToStaticMarkup(
      <BusinessUnderstandingHistoryPanel
        state="ready"
        scope={SCOPE}
        versions={[version({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onOpen={() => undefined}
        onRollback={() => undefined}
      />,
    );

    expect(html).toContain("The understanding history scope could not be verified.");
    expect(html).not.toContain("understanding:proposal-3");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("supports tenant-wide scope and keeps a responsive heading hierarchy", () => {
    const html = renderToStaticMarkup(
      <BusinessUnderstandingHistoryPanel
        state="ready"
        scope={{ tenantId: TENANT_ID, workspaceId: null }}
        versions={[version({ workspaceId: null })]}
      />,
    );

    expect(html).toContain("Tenant-wide (null)");
    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="business-understanding-history-title"');
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(15rem,.72fr)]");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>understanding-version:/u);
  });
});
