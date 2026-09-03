import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BuyingCenterPanel } from "@/components/buying-center/buying-center-panel";
import type { BuyingCenter } from "@/lib/contacts/buying-center";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const ACCOUNT = "30000000-0000-4000-8000-000000000001";
const REVIEWER = "40000000-0000-4000-8000-000000000001";
const HASH = `sha256:${"a".repeat(64)}`;
const PLAY_VERSION = `lead-play-version:${"b".repeat(64)}`;
const CENTER_VERSION = `buying-center-version:${"c".repeat(64)}`;
const CONTACT_VERSION = `contact-version:${"d".repeat(64)}`;

function center(reviewStatus: BuyingCenter["review"]["status"] = "approved"): BuyingCenter {
  const reviewEvents: BuyingCenter["review"]["events"] = reviewStatus === "draft" ? [] : [
    {
      from: "draft",
      to: "in_review",
      actor: { kind: "human", actorId: REVIEWER },
      at: "2026-08-30T13:01:00.000Z",
      reason: "Review the evidence and preserve open uncertainty.",
    },
    ...(reviewStatus === "in_review" ? [] : [{
      from: "in_review" as const,
      to: reviewStatus,
      actor: { kind: "human" as const, actorId: REVIEWER },
      at: "2026-08-30T13:02:00.000Z",
      reason: reviewStatus === "approved"
        ? "The map is useful as a hypothesis, not as confirmed identity data."
        : "The evidence does not support using this map.",
    }]),
  ];

  return {
    schemaVersion: 1,
    versionId: CENTER_VERSION,
    versionHash: HASH,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    accountId: ACCOUNT,
    playVersionId: PLAY_VERSION,
    stableKey: "buying-center:synthetic-account",
    revision: 2,
    supersedesVersionId: `buying-center-version:${"e".repeat(64)}`,
    createdAt: "2026-08-30T13:00:00.000Z",
    hypotheses: [
      {
        status: "hypothesis",
        hypothesisKey: "role:procurement",
        roleKind: "standard",
        roleKey: "procurement",
        roleLabel: "Procurement",
        responsibility: "Evaluates commercial terms and supplier onboarding.",
        influence: "high",
        priority: 1,
        confidenceBasisPoints: 7_500,
        uncertainty: "The final approval authority is not yet established.",
        evidenceRefs: [{
          evidenceRefVersion: 1,
          tenantId: TENANT,
          workspaceId: WORKSPACE,
          accountId: ACCOUNT,
          playVersionId: PLAY_VERSION,
          evidenceId: "evidence:procurement-role",
          evidenceVersionId: "evidence-version:procurement-v1",
          evidenceContentHash: HASH,
          sourceReceiptHash: HASH,
          observedAt: "2026-08-30T12:00:00.000Z",
          evidenceRefHash: HASH,
        }],
        contactVersionRef: {
          contactRefVersion: 1,
          tenantId: TENANT,
          workspaceId: WORKSPACE,
          accountId: ACCOUNT,
          contactVersionId: CONTACT_VERSION,
          contactContentHash: HASH,
          contactReviewHash: HASH,
          verification: {
            kind: "human",
            actorId: REVIEWER,
            at: "2026-08-30T12:30:00.000Z",
            reason: "Reviewed the exact eligible contact version and supporting evidence.",
          },
          contactRefHash: HASH,
        },
      },
      {
        status: "hypothesis",
        hypothesisKey: "role:technical-evaluator",
        roleKind: "standard",
        roleKey: "technical_evaluator",
        roleLabel: "Technical evaluator",
        responsibility: "Assesses technical compatibility and operating constraints.",
        influence: "unknown",
        priority: 2,
        confidenceBasisPoints: 4_250,
        uncertainty: "The responsible team and individual contact remain unknown.",
        evidenceRefs: [{
          evidenceRefVersion: 1,
          tenantId: TENANT,
          workspaceId: WORKSPACE,
          accountId: ACCOUNT,
          playVersionId: PLAY_VERSION,
          evidenceId: "evidence:technical-role",
          evidenceVersionId: "evidence-version:technical-v1",
          evidenceContentHash: HASH,
          sourceReceiptHash: HASH,
          observedAt: "2026-08-30T12:10:00.000Z",
          evidenceRefHash: `sha256:${"f".repeat(64)}`,
        }],
        contactVersionRef: null,
      },
    ],
    contentHash: HASH,
    review: {
      reviewVersion: 1,
      versionId: CENTER_VERSION,
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      accountId: ACCOUNT,
      playVersionId: PLAY_VERSION,
      contentHash: HASH,
      status: reviewStatus,
      events: reviewEvents,
      reviewHash: HASH,
    },
  };
}

describe("BuyingCenterPanel", () => {
  it("keeps every role visibly hypothetical while showing evidence and uncertainty", () => {
    const html = renderToStaticMarkup(<BuyingCenterPanel state="ready" center={center()} />);

    expect(html).toContain('data-buying-center-state="ready"');
    expect(html).toContain("Role hypotheses");
    expect(html).toContain("working interpretation of evidence");
    expect(html.match(/data-hypothesis-status="hypothesis"/g)).toHaveLength(2);
    expect(html.match(/Status: Hypothesis, not a confirmed role/g)).toHaveLength(2);
    expect(html).toContain("Procurement");
    expect(html).toContain("High influence estimate");
    expect(html).toContain("75%");
    expect(html).toContain("The final approval authority is not yet established.");
    expect(html).toContain("evidence:procurement-role");
    expect(html).toContain("Observed Aug 30, 2026");
    expect(html).toContain("Technical evaluator");
    expect(html).toContain("Influence unknown");
    expect(html).toContain("42.50%");
  });

  it("distinguishes map review from exact contact attestation", () => {
    const html = renderToStaticMarkup(<BuyingCenterPanel state="ready" center={center()} />);

    expect(html).toContain('data-review-status="approved"');
    expect(html).toContain("Human-reviewed map");
    expect(html).toContain("every role still remains a hypothesis");
    expect(html).toContain('data-contact-state="human-attested"');
    expect(html).toContain("Human-attested contact version");
    expect(html).toContain(CONTACT_VERSION);
    expect(html).toContain("Reviewed the exact eligible contact version and supporting evidence.");
    expect(html).toContain('data-contact-state="unlinked"');
    expect(html).toContain("No human-attested contact linked");
    expect(html).toContain('data-review-event-count="2"');
    expect(html).toContain("The map is useful as a hypothesis, not as confirmed identity data.");
  });

  it("uses responsive, labelled, break-safe regions without action or messaging controls", () => {
    const html = renderToStaticMarkup(<BuyingCenterPanel state="ready" center={center()} />);

    expect(html).toContain('aria-labelledby="buying-center-title"');
    expect(html).toContain('aria-label="Evidence for Procurement hypothesis"');
    expect(html).toContain('aria-label="Human buying-center review decisions"');
    expect(html).toContain("grid grid-cols-1 gap-2 sm:grid-cols-3");
    expect(html).toContain("grid gap-4 xl:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>buying-center-version:/);
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>lead-play-version:/);
    expect(html).not.toMatch(/<(?:button|form|input|textarea|select)\b/u);
    expect(html).not.toMatch(/>[^<]*(?:send|recipient)[^<]*</iu);
  });

  it("renders explicit loading, error, empty, and rejected-review states", () => {
    const loading = renderToStaticMarkup(<BuyingCenterPanel state="loading" />);
    expect(loading).toContain('data-buying-center-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading buying-center hypotheses");

    const error = renderToStaticMarkup(<BuyingCenterPanel state="error" error="Fixture map unavailable." />);
    expect(error).toContain('data-buying-center-state="error"');
    expect(error).toContain('role="alert"');
    expect(error).toContain("Fixture map unavailable.");

    const empty = renderToStaticMarkup(<BuyingCenterPanel state="empty" />);
    expect(empty).toContain('data-buying-center-state="empty"');
    expect(empty).toContain("No buying-center map yet");

    const rejected = renderToStaticMarkup(<BuyingCenterPanel state="ready" center={center("rejected")} />);
    expect(rejected).toContain('data-review-status="rejected"');
    expect(rejected).toContain("Map rejected");
    expect(rejected).toContain("Do not rely on this version");
    expect(rejected.match(/data-hypothesis-status="hypothesis"/g)).toHaveLength(2);
  });
});
