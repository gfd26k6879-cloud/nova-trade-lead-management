import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  OutreachHistoryPanel,
  type OutreachHistoryVersionSummary,
} from "@/components/outreach/outreach-history-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const DRAFT_ID = "outreach-draft:apex-jordan";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function version(overrides: Partial<OutreachHistoryVersionSummary> = {}): OutreachHistoryVersionSummary {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    draftId: DRAFT_ID,
    version: {
      versionId: `outreach-draft-version:${"a".repeat(64)}`,
      revision: 3,
      label: "Version 3",
      supersedesVersionId: `outreach-draft-version:${"b".repeat(64)}`,
    },
    account: { accountId: "account:apex", displayName: "Apex Industrial" },
    contact: { contactId: "contact:jordan-lee", displayName: "Jordan Lee" },
    play: {
      playId: "lead-play:industrial-coatings",
      versionId: "lead-play-version:v4",
      displayName: "Industrial coatings",
    },
    versionState: "current",
    reviewStatus: "approved",
    citationStatus: "ready",
    policyStatus: "ready",
    suppressionStatus: "clear",
    createdAt: "2026-08-30T16:25:00.000Z",
    lastReview: {
      reviewerId: "30000000-0000-4000-8000-000000000001",
      reviewerLabel: "Avery Reviewer",
      reviewedAt: "2026-08-30T16:30:00.000Z",
    },
    actions: { open: true, copy: true, export: true },
    ...overrides,
  };
}

describe("OutreachHistoryPanel", () => {
  it("shows exact bindings, revision state, readiness, reviewer, time, and scope", () => {
    const html = renderToStaticMarkup(
      <OutreachHistoryPanel
        state="ready"
        scope={SCOPE}
        draftId={DRAFT_ID}
        versions={[
          version(),
          version({
            version: {
              versionId: `outreach-draft-version:${"b".repeat(64)}`,
              revision: 2,
              label: "Version 2",
              supersedesVersionId: null,
            },
            versionState: "superseded",
            citationStatus: "stale",
            policyStatus: "stale",
            suppressionStatus: "unknown",
            lastReview: null,
            actions: { open: true, copy: false, export: false },
          }),
        ]}
      />,
    );

    expect(html).toContain('data-surface="outreach-history-panel"');
    expect(html).toContain('aria-label="Canonical outreach draft versions"');
    expect(html).toContain("2 versions · 1 current · 2 approved");
    expect(html).toContain('data-version-state="current"');
    expect(html).toContain('data-version-state="superseded"');
    expect(html).toContain("Version 3 · Revision 3");
    expect(html).toContain("Apex Industrial");
    expect(html).toContain("account:apex");
    expect(html).toContain("Jordan Lee");
    expect(html).toContain("contact:jordan-lee");
    expect(html).toContain("Industrial coatings");
    expect(html).toContain("lead-play-version:v4");
    expect(html).toContain("Review approved");
    expect(html).toContain("Citations stale");
    expect(html).toContain("Policy stale");
    expect(html).toContain("Suppression unknown");
    expect(html).toContain("Avery Reviewer");
    expect(html).toContain("Aug 30, 2026, 4:30 PM UTC");
    expect(html).toContain("No human review recorded");
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
  });

  it("offers only supplied actions that are valid for the exact current approved version", () => {
    const html = renderToStaticMarkup(
      <OutreachHistoryPanel
        state="ready"
        scope={SCOPE}
        draftId={DRAFT_ID}
        versions={[
          version(),
          version({
            version: {
              versionId: `outreach-draft-version:${"b".repeat(64)}`,
              revision: 2,
              label: "Version 2",
              supersedesVersionId: null,
            },
            versionState: "superseded",
          }),
          version({
            version: {
              versionId: `outreach-draft-version:${"c".repeat(64)}`,
              revision: 4,
              label: "Version 4",
              supersedesVersionId: `outreach-draft-version:${"a".repeat(64)}`,
            },
            reviewStatus: "in_review",
            citationStatus: "incomplete",
            policyStatus: "blocked",
            suppressionStatus: "blocked",
          }),
        ]}
        onOpen={() => undefined}
        onCopy={() => undefined}
        onExport={() => undefined}
      />,
    );

    expect(html.match(/>Open exact version</g)).toHaveLength(3);
    expect(html.match(/>Copy approved version</g)).toHaveLength(1);
    expect(html.match(/>Export approved version</g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(5);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
    expect(html).not.toMatch(/>\s*Send\b/iu);

    const readOnly = renderToStaticMarkup(
      <OutreachHistoryPanel state="ready" scope={SCOPE} draftId={DRAFT_ID} versions={[version()]} />,
    );
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<OutreachHistoryPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading draft history");

    const error = renderToStaticMarkup(<OutreachHistoryPanel state="error" error="Canonical history unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Draft history unavailable");
    expect(error).toContain("Canonical history unavailable.");

    const empty = renderToStaticMarkup(<OutreachHistoryPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No draft versions yet");

    const defensiveEmpty = renderToStaticMarkup(
      <OutreachHistoryPanel state="ready" scope={SCOPE} draftId={DRAFT_ID} versions={[]} />,
    );
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("fails closed for a mismatched scope or draft lineage", () => {
    const scopeMismatch = renderToStaticMarkup(
      <OutreachHistoryPanel
        state="ready"
        scope={SCOPE}
        draftId={DRAFT_ID}
        versions={[version({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onOpen={() => undefined}
      />,
    );
    expect(scopeMismatch).toContain("The outreach history scope or draft lineage could not be verified.");
    expect(scopeMismatch).not.toContain("Apex Industrial");
    expect(scopeMismatch).not.toMatch(/<button\b/u);

    const draftMismatch = renderToStaticMarkup(
      <OutreachHistoryPanel
        state="ready"
        scope={SCOPE}
        draftId={DRAFT_ID}
        versions={[version({ draftId: "outreach-draft:other" })]}
        onCopy={() => undefined}
      />,
    );
    expect(draftMismatch).toContain("The outreach history scope or draft lineage could not be verified.");
    expect(draftMismatch).not.toMatch(/<button\b/u);
  });

  it("supports tenant-wide scope and keeps a responsive heading hierarchy", () => {
    const html = renderToStaticMarkup(
      <OutreachHistoryPanel
        state="ready"
        scope={{ tenantId: TENANT_ID, workspaceId: null }}
        draftId={DRAFT_ID}
        versions={[version({ workspaceId: null })]}
      />,
    );

    expect(html).toContain("Tenant-wide (null)");
    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="outreach-history-title"');
    expect(html).toContain("2xl:grid-cols-2");
    expect(html).toContain("lg:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>outreach-draft-version:/u);
  });
});
