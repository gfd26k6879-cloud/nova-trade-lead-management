import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  KnowledgeReviewPreview,
  type KnowledgeReviewPreviewProps,
} from "@/components/knowledge-review-preview";

const FIXTURE: KnowledgeReviewPreviewProps = {
  intakeHref: "/onboarding",
  sources: [
    {
      name: "Service delivery handbook.pdf",
      format: "pdf",
      version: "v4",
      state: "review_required",
      statusLabel: "Needs review",
      detail: "18 pages · 14 evidence items",
      processedAt: "August 29, 2026 at 9:24 AM MDT",
    },
    {
      name: "Archived product table.csv",
      format: "csv",
      version: "v2",
      state: "extraction_partial",
      statusLabel: "Partial extraction",
      detail: "8,302 rows complete · 14 rows need review",
      processedAt: "August 29, 2026 at 9:18 AM MDT",
    },
  ],
  selectedSource: {
    name: "Service delivery handbook.pdf",
    format: "pdf",
    version: "v4",
    checksumLabel: "SHA-256 · 7d92…b184",
    policyVersion: "document-policy v3.4",
    parserBuild: "fixture-parser 2026.08",
    qualityLabel: "Medium parser confidence · review required",
    extractionState: "review_required",
    excerpts: [
      {
        locator: "doc:fixture-service-handbook:v4:page:7:sec:response-times",
        heading: "Response times",
        text: "Standard support requests receive an initial response within one business day.",
        status: "current",
      },
    ],
  },
  understanding: {
    version: "Understanding v6",
    statusLabel: "Needs review · not approved",
    generatedAt: "August 29, 2026 at 9:31 AM MDT",
    coverageLabel: "2 of 3 material claims have current evidence",
    domains: [
      { name: "Services", summary: "Implementation and advisory support", state: "supported" },
      { name: "Constraints", summary: "Regional delivery limits remain unknown", state: "unknown" },
    ],
    claims: [
      {
        statement: "Initial support response is available within one business day.",
        kind: "fact",
        support: "supported",
        citations: [
          { locator: "doc:fixture-service-handbook:v4:page:7:sec:response-times", status: "current" },
        ],
      },
      {
        statement: "Delivery is available in every market.",
        kind: "fact",
        support: "unsupported",
        citations: [
          { locator: "doc:fixture-service-handbook:v4:page:11:sec:regions", status: "stale" },
        ],
      },
    ],
    question: {
      prompt: "Which regions can receive on-site delivery this quarter?",
      rationale: "The current source names regions but does not give an effective date.",
      unlocks: "Regional fit decisions and a current constraints claim",
    },
  },
};

describe("KnowledgeReviewPreview", () => {
  it("keeps extraction review traceable without exposing storage locations", () => {
    const html = renderToStaticMarkup(<KnowledgeReviewPreview {...FIXTURE} />);

    expect(html).toContain('data-surface="knowledge-review-preview"');
    expect(html).toContain("Preview fixture · no live knowledge data");
    expect(html).toContain('data-state="STATE-PARTIAL"');
    expect(html).toContain("8,302 rows complete · 14 rows need review");
    expect(html).toContain("Medium parser confidence · review required");
    expect(html).toContain("doc:fixture-service-handbook:v4:page:7:sec:response-times");
    expect(html).toContain("Response times");
    expect(html).toContain('data-state="STATE-INACCESSIBLE"');
    expect(html).toContain("Protected original is unavailable in this fixture preview");
    expect(html).not.toMatch(/storage[._-]?key/i);
    expect(html).not.toMatch(/https?:\/\//i);
  });

  it("shows evidence state, uncertainty, and the exact unapproved understanding version", () => {
    const html = renderToStaticMarkup(<KnowledgeReviewPreview {...FIXTURE} />);

    expect(html).toContain("Understanding v6");
    expect(html).toContain("Needs review · not approved");
    expect(html).toContain("2 of 3 material claims have current evidence");
    expect(html).toContain('data-state="STATE-STALE"');
    expect(html).toContain('data-state="STATE-UNKNOWN"');
    expect(html).toContain("Delivery is available in every market.");
    expect(html).toContain("Unsupported claim");
  });

  it("explains the next question but cannot pretend to approve or submit fixture data", () => {
    const html = renderToStaticMarkup(<KnowledgeReviewPreview {...FIXTURE} />);

    expect(html).toContain("Which regions can receive on-site delivery this quarter?");
    expect(html).toContain("Why this matters");
    expect(html).toContain("What this unlocks");
    expect(html).toContain("Request another question round");
    expect(html).toContain("Approve understanding");
    expect(html).toContain("Actions are unavailable because this is a read-only fixture");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="fixture-review-actions-explanation"[^>]*>Approve understanding<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-describedby="fixture-review-actions-explanation"[^>]*>Request another question round<\/button>/);
  });

  it("keeps landmark headings ordered and fragment targets keyboard-focusable", () => {
    const html = renderToStaticMarkup(<KnowledgeReviewPreview {...FIXTURE} />);

    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html.match(/<h2\b/g)).toHaveLength(3);
    expect(html.indexOf("<h1")).toBeLessThan(html.indexOf("<h2"));
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html.indexOf("<h3")).toBeLessThan(html.indexOf("<h4"));
    expect(html).toContain('<nav aria-label="Knowledge review sections"');
    for (const id of ["source-library", "extraction-review", "understanding-review"]) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toMatch(new RegExp(`<section id="${id}"[^>]*scroll-mt-4[^>]*tabindex="-1"`));
    }
  });

  it("keeps actions touch-sized and narrow layouts wrapping instead of overflowing", () => {
    const html = renderToStaticMarkup(<KnowledgeReviewPreview {...FIXTURE} />);

    expect(html.match(/class="btn-glass min-h-11 text-xs" href="#[^"]+"/g)).toHaveLength(3);
    expect(html).toMatch(/href="\/onboarding"[^>]*>Review intake<\/a>/);
    expect(html).toMatch(/class="btn-glass min-h-11 w-full[^\"]*sm:w-auto"[^>]*href="\/onboarding"/);
    expect(html).toMatch(/class="btn-glass min-h-11 w-full whitespace-normal text-center sm:w-auto"/);
    expect(html).toMatch(/class="btn-primary min-h-11 w-full whitespace-normal text-center sm:w-auto"/);
  });

  it.each([
    ["ready", "Ready for review", "success", "✓"],
    ["extraction_partial", "Partial extraction", "warning", "!"],
    ["blocked_unsupported", "Unsupported source", "danger", "×"],
  ] as const)(
    "maps selected-source %s to its own semantic status treatment",
    (extractionState, qualityLabel, tone, symbol) => {
      const html = renderToStaticMarkup(
        <KnowledgeReviewPreview
          {...FIXTURE}
          selectedSource={{ ...FIXTURE.selectedSource, extractionState, qualityLabel }}
        />,
      );

      expect(html).toMatch(new RegExp(`data-selected-source-status="true"[^>]*data-tone="${tone}"`));
      expect(html).toContain(`aria-label="Extraction status: ${qualityLabel}"`);
      expect(html).toMatch(new RegExp(`data-selected-source-status="true"[^>]*>[\\s\\S]*?<span aria-hidden="true">${symbol}<\\/span>`));
    },
  );

  it("pairs every material status color with visible text and a non-color symbol", () => {
    const html = renderToStaticMarkup(<KnowledgeReviewPreview {...FIXTURE} />);

    expect(html).toMatch(/data-partial-status="true"[^>]*aria-label="Evidence coverage status: Partial"[^>]*>[\s\S]*?<span aria-hidden="true">!<\/span>/);
    expect(html).toMatch(/data-domain-status="true"[^>]*aria-label="Services status: Supported"[^>]*>[\s\S]*?<span aria-hidden="true">✓<\/span>/);
    expect(html).toMatch(/data-domain-status="true"[^>]*aria-label="Constraints status: Unknown"[^>]*>[\s\S]*?<span aria-hidden="true">\?<\/span>/);
    expect(html).toMatch(/data-claim-support-status="true"[^>]*aria-label="Claim support status: Supported claim"[^>]*>[\s\S]*?<span aria-hidden="true">✓<\/span>/);
    expect(html).toMatch(/data-claim-support-status="true"[^>]*aria-label="Claim support status: Unsupported claim; evidence is stale"[^>]*>[\s\S]*?<span aria-hidden="true">!<\/span>/);
    expect(html).toMatch(/data-state="STATE-UNKNOWN"[^>]*data-uncertainty-status="true"[^>]*aria-label="Question uncertainty status: Unresolved"[^>]*>[\s\S]*?<span aria-hidden="true">\?<\/span> Uncertainty · unresolved/);
  });
});
