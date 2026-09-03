import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  OutreachReviewPanel,
  type OutreachReviewPanelProps,
} from "@/components/outreach/outreach-review-panel";

const FIXTURE: OutreachReviewPanelProps = {
  draft: {
    versionLabel: "Draft v3",
    status: "approved",
    statusLabel: "Human approved",
    subject: "A possible industrial flooring fit",
    body: "Your public catalog describes epoxy systems for industrial flooring.",
  },
  claims: [
    {
      claimId: "claim:catalog-fit",
      statement: "The catalog lists epoxy systems for industrial flooring.",
      material: true,
      support: "current",
      evidence: [
        {
          evidenceId: "evidence:catalog-1",
          sourceLabel: "Public product catalog · v4",
          quote: "Industrial flooring epoxy systems",
          locator: "catalog:v4:section:flooring",
          status: "current",
        },
      ],
    },
    {
      claimId: "claim:timing",
      statement: "A formulation change is currently planned.",
      material: true,
      support: "uncertain",
      evidence: [],
    },
  ],
  uncertainties: [
    {
      uncertaintyId: "uncertainty:change-timing",
      statement: "The timing of any formulation change is not known.",
      impact: "Confirm timing before relying on urgency language.",
    },
  ],
  approval: {
    status: "approved",
    label: "Approved by a human reviewer",
    decidedAtLabel: "August 30, 2026 at 9:06 AM MDT",
  },
  policy: { result: "allow", reasons: [] },
  eligibleActions: ["copy", "export"],
};

describe("OutreachReviewPanel", () => {
  it("presents the exact draft, material claims, evidence, uncertainty, and human approval state", () => {
    const html = renderToStaticMarkup(<OutreachReviewPanel {...FIXTURE} />);

    expect(html).toContain('data-surface="outreach-review-panel"');
    expect(html).toContain("Draft v3");
    expect(html).toContain("Human approved");
    expect(html).toContain("A possible industrial flooring fit");
    expect(html).toContain("The catalog lists epoxy systems for industrial flooring.");
    expect(html).toContain("Public product catalog · v4");
    expect(html).toContain("Industrial flooring epoxy systems");
    expect(html).toContain("catalog:v4:section:flooring");
    expect(html).toContain("The timing of any formulation change is not known.");
    expect(html).toContain("Confirm timing before relying on urgency language.");
    expect(html).toContain("Approved by a human reviewer");
    expect(html).toContain("August 30, 2026 at 9:06 AM MDT");
  });

  it("renders only eligible native copy/export buttons with keyboard-visible control styling", () => {
    const html = renderToStaticMarkup(<OutreachReviewPanel {...FIXTURE} />);

    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="btn-primary min-h-11[^>]*focus-visible:outline-2[^>]*aria-describedby="outreach-actions-help"[^>]*>Copy approved draft<\/button>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="btn-glass min-h-11[^>]*focus-visible:outline-2[^>]*aria-describedby="outreach-actions-help"[^>]*>Export approved draft<\/button>/);
    expect(html).not.toMatch(/<button[^>]*(?:disabled|tabindex="-1")/u);
    expect(html).toContain("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end");
    expect(html).toContain("w-full whitespace-normal text-center");

    const copyOnly = renderToStaticMarkup(
      <OutreachReviewPanel {...FIXTURE} eligibleActions={["copy"]} />,
    );
    expect(copyOnly.match(/<button\b/g)).toHaveLength(1);
    expect(copyOnly).toContain("Copy approved draft");
    expect(copyOnly).not.toContain("Export approved draft");
  });

  it("shows policy deny reasons and structurally omits every action and messaging control", () => {
    const html = renderToStaticMarkup(
      <OutreachReviewPanel
        {...FIXTURE}
        policy={{
          result: "deny",
          reasons: [
            {
              code: "CONTACT_REVIEW_REQUIRED",
              label: "Contact review required",
              detail: "The governed contact record needs a current human review.",
            },
            {
              code: "ACTION_NOT_PERMITTED",
              label: "Action is not permitted",
              detail: "The active policy does not permit this use.",
            },
          ],
        }}
      />,
    );

    expect(html).toContain('data-policy-result="deny"');
    expect(html).toContain("Use is blocked");
    expect(html).toContain("Contact review required");
    expect(html).toContain("Action is not permitted");
    expect(html).not.toMatch(/<button\b/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
    expect(html).not.toMatch(/>[^<]*(?:send|recipient)[^<]*</iu);
  });

  it("keeps eligible-looking actions absent until both draft and human approval are final", () => {
    const pending = renderToStaticMarkup(
      <OutreachReviewPanel
        {...FIXTURE}
        draft={{ ...FIXTURE.draft, status: "in_review", statusLabel: "Human review pending" }}
        approval={{ status: "pending", label: "Awaiting a human decision", decidedAtLabel: null }}
      />,
    );

    expect(pending).toContain("Human review pending");
    expect(pending).toContain("Awaiting a human decision");
    expect(pending).not.toMatch(/<button\b/u);
  });

  it("uses ordered landmarks, labelled regions, and keyboard-operable evidence disclosures", () => {
    const html = renderToStaticMarkup(<OutreachReviewPanel {...FIXTURE} />);

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="outreach-review-title"');
    expect(html).toContain('aria-labelledby="material-claims-title"');
    expect(html).toContain('aria-label="Review decisions"');
    expect(html).toContain('<details class="rounded-lg border px-3 py-2"');
    expect(html).toMatch(/<summary class="min-h-11 cursor-pointer[^>]*>Public product catalog · v4 · current evidence<\/summary>/);
    expect(html).toContain('aria-label="Claim support: Current evidence"');
    expect(html).toContain('aria-label="Claim support: Evidence unresolved"');
  });
});
