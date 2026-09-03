import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OutcomeReportPanel } from "@/components/outcomes/outcome-report-panel";
import type { OutcomeAttributionReport } from "@/lib/outcomes/outcome-attribution";

const HASH = `sha256:${"a".repeat(64)}`;
const PLAY = `lead-play-version:${"b".repeat(64)}`;
const DRAFT = `outreach-draft-version:${"c".repeat(64)}`;

function report(groups = true): OutcomeAttributionReport {
  return {
    reportVersion: 1,
    tenantId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    reportKey: "outcome-attribution:fixture",
    window: {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-31T00:00:00.000Z",
      asOf: "2026-08-31T01:00:00.000Z",
    },
    summary: groups
      ? { total: 6, direct: 3, assisted: 2, unknown: 1,
        ratesBasisPoints: { direct: 5000, assisted: 3333, unknown: 1666 } }
      : { total: 0, direct: 0, assisted: 0, unknown: 0,
        ratesBasisPoints: { direct: 0, assisted: 0, unknown: 0 } },
    groups: groups ? [{
      accountId: "30000000-0000-4000-8000-000000000001",
      playVersionId: PLAY,
      outreachVersionId: DRAFT,
      counts: { total: 6, direct: 3, assisted: 2, unknown: 1 },
      ratesBasisPoints: { direct: 5000, assisted: 3333, unknown: 1666 },
      sourceOutcomeRefs: [{
        stableKey: "outcome:reply",
        versionId: `outcome-version:${"d".repeat(64)}`,
        contentHash: HASH,
        outcome: "replied",
        occurredAt: "2026-08-20T14:00:00.000Z",
        attributionKind: "direct",
      }],
    }] : [],
    reportHash: HASH,
  };
}

describe("outcome report panel", () => {
  it("renders an accessible correction-aware attribution report with non-color labels", () => {
    const html = renderToStaticMarkup(<OutcomeReportPanel state="ready" report={report()} />);

    expect(html).toContain("Outcome attribution");
    expect(html).toContain("Latest corrections only");
    expect(html).toContain("Superseded outcome versions are not double-counted");
    expect(html).toContain('dateTime="2026-08-31T01:00:00.000Z"');
    expect(html).toContain(PLAY);
    expect(html).toContain(DRAFT);
    expect(html).toContain("1 current source outcome");
    for (const [kind, label, count, rate] of [
      ["direct", "Direct", "3", "50%"],
      ["assisted", "Assisted", "2", "33.33%"],
      ["unknown", "Unknown", "1", "16.66%"],
    ] as const) {
      expect(html).toContain(`data-attribution-kind="${kind}"`);
      expect(html).toContain(`aria-label="${label} attribution: ${count} outcomes, ${rate}"`);
    }
    expect(html).toContain('aria-label="Source outcome versions for account 30000000-0000-4000-8000-000000000001"');
  });

  it("uses responsive cards and break-safe version references", () => {
    const html = renderToStaticMarkup(<OutcomeReportPanel state="ready" report={report()} />);

    expect(html).toContain("grid grid-cols-1 gap-3 sm:grid-cols-3");
    expect(html).toContain("grid gap-4 xl:grid-cols-2");
    expect(html).toMatch(/class="[^\"]*break-all[^\"]*"[^>]*>lead-play-version:/);
    expect(html).toMatch(/class="[^\"]*break-all[^\"]*"[^>]*>outreach-draft-version:/);
  });

  it("renders explicit loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<OutcomeReportPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading outcome attribution report");

    const error = renderToStaticMarkup(<OutcomeReportPanel state="error" error="Fixture report unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Fixture report unavailable.");

    const empty = renderToStaticMarkup(<OutcomeReportPanel state="ready" report={report(false)} />);
    expect(empty).toContain('data-report-state="empty"');
    expect(empty).toContain("No outcomes fall inside this as-of window");
  });
});
