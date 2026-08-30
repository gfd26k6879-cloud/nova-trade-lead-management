import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ReviewOverviewPanel,
  type ReviewQueueSummary,
  type ReviewWorkloadKind,
} from "@/components/review/review-overview-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function queue(kind: ReviewWorkloadKind, overrides: Partial<ReviewQueueSummary> = {}): ReviewQueueSummary {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    kind,
    ready: 2,
    claimed: 1,
    blocked: 0,
    overdue: 1,
    oldestAgeMinutes: 125,
    actions: { open: "available" },
    ...overrides,
  };
}

describe("ReviewOverviewPanel", () => {
  it("renders every canonical queue family with totals, exact scope, and oldest age", () => {
    const html = renderToStaticMarkup(
      <ReviewOverviewPanel
        state="ready"
        scope={SCOPE}
        queues={[
          queue("document_extraction"),
          queue("icp_and_play", { oldestAgeMinutes: 45 }),
          queue("account_and_qualification", { oldestAgeMinutes: 1_440 }),
          queue("contact_and_buying_center", { oldestAgeMinutes: null }),
          queue("outreach"),
          queue("controlled_learning"),
        ]}
      />,
    );

    expect(html).toContain('data-surface="review-overview-panel"');
    expect(html).toContain('aria-label="Canonical review queues"');
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
    expect(html).toContain("Extraction");
    expect(html).toContain("ICP &amp; play");
    expect(html).toContain("Accounts &amp; qualification");
    expect(html).toContain("Contacts &amp; buying center");
    expect(html).toContain("Outreach");
    expect(html).toContain("Controlled learning");
    expect(html).toContain("2h 5m");
    expect(html).toContain("45m");
    expect(html).toContain("1d");
    expect(html).toContain("No waiting items");
    expect(html).toMatch(/data-workload-total="ready"[^>]*>[\s\S]*?<dd[^>]*>12<\/dd>/u);
    expect(html).toMatch(/data-workload-total="claimed"[^>]*>[\s\S]*?<dd[^>]*>6<\/dd>/u);
    expect(html).toMatch(/data-workload-total="blocked"[^>]*>[\s\S]*?<dd[^>]*>0<\/dd>/u);
    expect(html).toMatch(/data-workload-total="overdue"[^>]*>[\s\S]*?<dd[^>]*>6<\/dd>/u);
  });

  it("renders accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<ReviewOverviewPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading review workload");

    const error = renderToStaticMarkup(<ReviewOverviewPanel state="error" error="Queue summaries unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Review workload unavailable");
    expect(error).toContain("Queue summaries unavailable.");

    const empty = renderToStaticMarkup(<ReviewOverviewPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No review queues yet");

    const defensiveEmpty = renderToStaticMarkup(<ReviewOverviewPanel state="ready" scope={SCOPE} queues={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("shows only supplied state-gated open-queue callbacks", () => {
    const html = renderToStaticMarkup(
      <ReviewOverviewPanel
        state="ready"
        scope={SCOPE}
        queues={[
          queue("document_extraction"),
          queue("icp_and_play", { actions: { open: "blocked" } }),
          queue("outreach"),
        ]}
        onOpenQueue={() => undefined}
      />,
    );

    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).toContain("Open Extraction queue");
    expect(html).toContain("Open Outreach queue");
    expect(html).not.toContain("Open ICP &amp; play queue");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*min-h-11[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const readOnly = renderToStaticMarkup(
      <ReviewOverviewPanel state="ready" scope={SCOPE} queues={[queue("document_extraction")]} />,
    );
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("fails closed without enumerating queues from a mismatched exact scope", () => {
    const html = renderToStaticMarkup(
      <ReviewOverviewPanel
        state="ready"
        scope={SCOPE}
        queues={[
          queue("document_extraction"),
          queue("outreach", { workspaceId: "20000000-0000-4000-8000-000000000099" }),
        ]}
        onOpenQueue={() => undefined}
      />,
    );

    expect(html).toContain("The review workload scope could not be verified.");
    expect(html).not.toContain("Extraction");
    expect(html).not.toContain("Outreach");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("uses a responsive, ordered heading hierarchy with touch-sized actions", () => {
    const html = renderToStaticMarkup(
      <ReviewOverviewPanel
        state="ready"
        scope={SCOPE}
        queues={[queue("document_extraction")]}
        onOpenQueue={() => undefined}
      />,
    );

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="review-overview-title"');
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain("sm:grid-cols-4");
    expect(html).toContain("break-all font-mono");
    expect(html).toContain("min-h-11 w-full");
  });
});
