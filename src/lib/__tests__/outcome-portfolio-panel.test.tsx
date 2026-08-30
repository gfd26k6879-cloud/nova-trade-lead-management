import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  OutcomePortfolioPanel,
  type OutcomePortfolioItem,
} from "@/components/outcomes/outcome-portfolio-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function outcome(overrides: Partial<OutcomePortfolioItem> = {}): OutcomePortfolioItem {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    stableKey: "outcome:apex:meeting",
    versionId: `outcome-version:${"a".repeat(64)}`,
    account: { accountId: "account:apex", displayName: "Apex Industrial" },
    play: { versionId: `lead-play-version:${"b".repeat(64)}`, displayName: "Industrial coatings" },
    outreach: { versionId: `outreach-draft-version:${"c".repeat(64)}`, subject: "Apex corrosion program" },
    outcome: "meeting_set",
    channel: "email",
    occurredAt: "2026-08-29T16:10:00.000Z",
    recordedAt: "2026-08-29T16:20:00.000Z",
    revision: 2,
    attributionKind: "direct",
    correctionNeeded: false,
    eligibleActions: ["open"],
    ...overrides,
  };
}

describe("OutcomePortfolioPanel", () => {
  it("renders exact scope, bindings, current outcome, timing, revision, and attribution summaries", () => {
    const html = renderToStaticMarkup(
      <OutcomePortfolioPanel
        state="ready"
        scope={SCOPE}
        outcomes={[
          outcome(),
          outcome({
            stableKey: "outcome:orbit:reply",
            versionId: `outcome-version:${"d".repeat(64)}`,
            account: { accountId: "account:orbit", displayName: "Orbit Fabrication" },
            play: { versionId: `lead-play-version:${"e".repeat(64)}`, displayName: "Fabrication modernization" },
            outreach: null,
            outcome: "replied",
            channel: "phone",
            revision: 3,
            attributionKind: "assisted",
            correctionNeeded: true,
            eligibleActions: ["open", "correct"],
          }),
        ]}
      />,
    );

    expect(html).toContain('data-surface="outcome-portfolio-panel"');
    expect(html).toContain('aria-label="Exact outcome portfolio scope"');
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
    expect(html).toContain("2 outcomes · 1 need correction");
    expect(html).toContain("Apex Industrial");
    expect(html).toContain("Industrial coatings");
    expect(html).toContain("Apex corrosion program");
    expect(html).toContain("meeting set");
    expect(html).toContain("Revision 2");
    expect(html).toContain("Direct attribution");
    expect(html).toContain("Current record");
    expect(html).toContain("Orbit Fabrication");
    expect(html).toContain("No outreach linked");
    expect(html).toContain("Direct observation without an outreach version");
    expect(html).toContain("Assisted attribution");
    expect(html).toContain("Correction needed");
    expect(html).toContain("Aug 29, 2026, 4:10 PM UTC");
    expect(html).toContain("Aug 29, 2026, 4:20 PM UTC");
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<OutcomePortfolioPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading outcome history");

    const error = renderToStaticMarkup(<OutcomePortfolioPanel state="error" error="Outcome summaries unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Outcome history unavailable");
    expect(error).toContain("Outcome summaries unavailable.");

    const empty = renderToStaticMarkup(<OutcomePortfolioPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No outcomes recorded yet");

    const defensiveEmpty = renderToStaticMarkup(<OutcomePortfolioPanel state="ready" scope={SCOPE} outcomes={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("renders only supplied callbacks that remain valid for current correction state", () => {
    const html = renderToStaticMarkup(
      <OutcomePortfolioPanel
        state="ready"
        scope={SCOPE}
        outcomes={[
          outcome({ eligibleActions: ["open", "correct", "correct"] }),
          outcome({
            stableKey: "outcome:needs-correction",
            versionId: `outcome-version:${"d".repeat(64)}`,
            correctionNeeded: true,
            eligibleActions: ["open", "correct"],
          }),
          outcome({
            stableKey: "outcome:not-authorized",
            versionId: `outcome-version:${"e".repeat(64)}`,
            correctionNeeded: true,
            eligibleActions: ["open"],
          }),
        ]}
        onOpen={() => undefined}
        onCorrect={() => undefined}
      />,
    );

    expect(html.match(/>Open outcome</g)).toHaveLength(3);
    expect(html.match(/>Correct outcome</g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(4);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const readOnly = renderToStaticMarkup(<OutcomePortfolioPanel state="ready" scope={SCOPE} outcomes={[outcome()]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("fails closed without enumerating outcomes from a mismatched scope", () => {
    const html = renderToStaticMarkup(
      <OutcomePortfolioPanel
        state="ready"
        scope={SCOPE}
        outcomes={[outcome({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onOpen={() => undefined}
        onCorrect={() => undefined}
      />,
    );

    expect(html).toContain("The outcome portfolio scope could not be verified.");
    expect(html).not.toContain("Apex Industrial");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("uses ordered headings and responsive, break-safe cards", () => {
    const html = renderToStaticMarkup(
      <OutcomePortfolioPanel state="ready" scope={SCOPE} outcomes={[outcome()]} onOpen={() => undefined} />,
    );

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="outcome-portfolio-title"');
    expect(html).toContain("2xl:grid-cols-2");
    expect(html).toContain("sm:grid-cols-3");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>outcome-version:/u);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
  });
});
