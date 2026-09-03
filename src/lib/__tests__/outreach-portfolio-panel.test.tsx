import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  OutreachPortfolioPanel,
  type OutreachPortfolioItem,
} from "@/components/outreach/outreach-portfolio-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function draft(overrides: Partial<OutreachPortfolioItem> = {}): OutreachPortfolioItem {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    draftId: "outreach-draft:apex-jordan",
    subject: "A corrosion-protection program for Apex",
    account: { accountId: "account:apex", displayName: "Apex Industrial" },
    contact: { contactId: "contact:jordan-lee", displayName: "Jordan Lee" },
    play: {
      playId: "lead-play:industrial-coatings",
      displayName: "Industrial coatings",
      versionId: "lead-play-version:v4",
    },
    version: {
      versionId: `outreach-draft-version:${"a".repeat(64)}`,
      revision: 4,
      label: "Version 4",
    },
    draftStatus: "approved",
    reviewStatus: "approved",
    policyStatus: "ready",
    suppressionStatus: "clear",
    citationStatus: "ready",
    updatedAt: "2026-08-30T16:25:00.000Z",
    eligibleActions: ["open", "copy", "export"],
    ...overrides,
  };
}

describe("OutreachPortfolioPanel", () => {
  it("renders exact account, contact, play, version, and readiness summaries", () => {
    const html = renderToStaticMarkup(
      <OutreachPortfolioPanel
        state="ready"
        scope={SCOPE}
        drafts={[
          draft(),
          draft({
            draftId: "outreach-draft:orbit-sam",
            subject: "Review required for Orbit",
            account: { accountId: "account:orbit", displayName: "Orbit Fabrication" },
            contact: { contactId: "contact:sam-rivera", displayName: "Sam Rivera" },
            version: { versionId: `outreach-draft-version:${"b".repeat(64)}`, revision: 1, label: "Version 1" },
            draftStatus: "in_review",
            reviewStatus: "pending",
            policyStatus: "blocked",
            suppressionStatus: "unknown",
            citationStatus: "incomplete",
            eligibleActions: ["open", "review"],
          }),
        ]}
      />,
    );

    expect(html).toContain('data-surface="outreach-portfolio-panel"');
    expect(html).toContain('aria-label="Canonical outreach draft portfolio"');
    expect(html).toContain("2 drafts · 1 awaiting review · 1 blocked");
    expect(html).toContain("Apex Industrial");
    expect(html).toContain("Jordan Lee");
    expect(html).toContain("Industrial coatings");
    expect(html).toContain("lead-play-version:v4");
    expect(html).toContain("Version 4 · revision 4");
    expect(html).toContain(`outreach-draft-version:${"a".repeat(64)}`);
    expect(html).toContain("Review approved");
    expect(html).toContain("Policy ready");
    expect(html).toContain("Suppression clear");
    expect(html).toContain("Citations ready");
    expect(html).toContain("Review pending");
    expect(html).toContain("Policy blocked");
    expect(html).toContain("Suppression unknown");
    expect(html).toContain("Citations incomplete");
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<OutreachPortfolioPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading outreach drafts");

    const error = renderToStaticMarkup(<OutreachPortfolioPanel state="error" error="Draft summaries unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Outreach drafts unavailable");
    expect(error).toContain("Draft summaries unavailable.");

    const empty = renderToStaticMarkup(<OutreachPortfolioPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No outreach drafts yet");

    const defensiveEmpty = renderToStaticMarkup(<OutreachPortfolioPanel state="ready" scope={SCOPE} drafts={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("renders only supplied callbacks that remain valid for the exact draft state", () => {
    const html = renderToStaticMarkup(
      <OutreachPortfolioPanel
        state="ready"
        scope={SCOPE}
        drafts={[
          draft({ eligibleActions: ["open", "review", "copy", "copy", "export"] }),
          draft({
            draftId: "outreach-draft:pending",
            version: { versionId: `outreach-draft-version:${"b".repeat(64)}`, revision: 2, label: "Version 2" },
            draftStatus: "in_review",
            reviewStatus: "pending",
            eligibleActions: ["open", "review", "copy", "export"],
          }),
          draft({
            draftId: "outreach-draft:blocked",
            version: { versionId: `outreach-draft-version:${"c".repeat(64)}`, revision: 3, label: "Version 3" },
            policyStatus: "blocked",
            suppressionStatus: "blocked",
            citationStatus: "conflicted",
            eligibleActions: ["open", "review", "copy", "export"],
          }),
        ]}
        onOpen={() => undefined}
        onReview={() => undefined}
        onCopy={() => undefined}
        onExport={() => undefined}
      />,
    );

    expect(html.match(/>Open draft</g)).toHaveLength(3);
    expect(html.match(/>Review draft</g)).toHaveLength(1);
    expect(html.match(/>Copy approved draft</g)).toHaveLength(1);
    expect(html.match(/>Export approved draft</g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(6);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
    expect(html).not.toMatch(/>[^<]*send[^<]*</iu);

    const readOnly = renderToStaticMarkup(<OutreachPortfolioPanel state="ready" scope={SCOPE} drafts={[draft()]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("uses ordered headings and responsive, break-safe cards", () => {
    const html = renderToStaticMarkup(
      <OutreachPortfolioPanel state="ready" scope={SCOPE} drafts={[draft()]} onOpen={() => undefined} />,
    );

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html.indexOf("<h3")).toBeLessThan(html.indexOf("<h4"));
    expect(html).toContain('aria-labelledby="outreach-portfolio-title"');
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>outreach-draft:apex-jordan</u);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
  });

  it("fails closed without enumerating drafts from a mismatched scope", () => {
    const html = renderToStaticMarkup(
      <OutreachPortfolioPanel
        state="ready"
        scope={SCOPE}
        drafts={[draft({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onOpen={() => undefined}
      />,
    );

    expect(html).toContain("The outreach portfolio scope could not be verified.");
    expect(html).not.toContain("Apex Industrial");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("accepts a tenant-wide canonical scope without broadening it", () => {
    const tenantWide = draft({ workspaceId: null });
    const html = renderToStaticMarkup(
      <OutreachPortfolioPanel
        state="ready"
        scope={{ tenantId: TENANT_ID, workspaceId: null }}
        drafts={[tenantWide]}
      />,
    );

    expect(html).toContain("Apex Industrial");
    expect(html).not.toContain("scope could not be verified");
  });
});
