import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ExtractionReviewPanel,
  type ExtractionReviewClaim,
} from "@/components/knowledge/extraction-review-panel";
import type { CitedKnowledgeClaimVersion } from "@/lib/knowledge/claims";
import type {
  KnowledgeEvidenceRecord,
  RenderSafeKnowledgeCitation,
} from "@/lib/knowledge/evidence-citations";
import type { KnowledgeExtractionArtifact } from "@/lib/knowledge/extraction-pipeline";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "30000000-0000-4000-8000-000000000001";
const DOCUMENT_VERSION_ID = "40000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "50000000-0000-4000-8000-000000000001";
const sha = (character: string) => `sha256:${character.repeat(64)}`;

const lineLocator = { kind: "line_range" as const, label: "Lines 2-3", startLine: 2, endLine: 3 };
const rowLocator = { kind: "row" as const, label: "Row 2", row: 2 };

const EXTRACTION: KnowledgeExtractionArtifact = {
  artifactVersion: 1,
  binding: {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    documentVersionId: DOCUMENT_VERSION_ID,
    checksum: "a".repeat(64),
    scannerPolicyVersion: "launch-v1",
    format: "csv",
    mediaType: "text/csv",
    parserId: "csv",
    parserVersion: "1.0.0",
    chunkingAlgorithmVersion: "structural-v1",
    maxChunkUtf8Bytes: 4096,
    maxBlocksPerChunk: 8,
    documentIdentityHash: sha("b"),
    versionIdentityHash: sha("c"),
    parserIdentityHash: sha("d"),
    inputHash: sha("e"),
  },
  status: "review_required",
  warnings: ["One row contains an unsupported date format."],
  quality: { score: 78, reviewRequired: true },
  blocks: [
    {
      kind: "paragraph",
      ordinal: 0,
      text: "Viscosity is <script>alert('unsafe')</script> 120 mPa·s.",
      contentHash: sha("f"),
      sourceLocator: lineLocator,
    },
    {
      kind: "table_row",
      ordinal: 1,
      text: "ER-120,120 mPa·s",
      contentHash: sha("1"),
      sourceLocator: rowLocator,
    },
  ],
  tables: [{
    ordinal: 0,
    startBlockOrdinal: 1,
    endBlockOrdinal: 1,
    rowCount: 1,
    contentHash: sha("2"),
    rows: [{
      ordinal: 0,
      blockOrdinal: 1,
      text: "ER-120,120 mPa·s",
      contentHash: sha("3"),
      sourceLocator: rowLocator,
    }],
  }],
  chunks: [{
    id: "chunk:fixture",
    contentHash: sha("4"),
    ordinal: 0,
    startBlockOrdinal: 0,
    endBlockOrdinal: 1,
    blockCount: 2,
    utf8Bytes: 72,
    text: "Viscosity is 120 mPa·s.\nER-120,120 mPa·s",
    blockOrdinals: [0, 1],
    sourceLocators: [lineLocator, rowLocator],
  }],
};

const EVIDENCE: KnowledgeEvidenceRecord = {
  evidenceVersion: 1,
  evidenceId: `evidence:${"5".repeat(64)}`,
  tenantId: TENANT_ID,
  workspaceId: WORKSPACE_ID,
  documentId: DOCUMENT_ID,
  documentVersionId: DOCUMENT_VERSION_ID,
  checksum: "a".repeat(64),
  scannerPolicyVersion: "launch-v1",
  extractionInputHash: sha("e"),
  parserId: "csv",
  parserVersion: "1.0.0",
  evidenceGrade: "extracted",
  origin: "parser_output",
  blockOrdinal: 1,
  blockContentHash: sha("1"),
  sourceLocator: rowLocator,
  quoteStart: 7,
  quoteEnd: 16,
  quote: "120 mPa·s",
  quoteHash: sha("6"),
};

const CITATION: RenderSafeKnowledgeCitation = {
  citationVersion: 1,
  citationId: `citation:${"7".repeat(64)}`,
  evidenceId: EVIDENCE.evidenceId,
  state: "resolved",
  tenantId: TENANT_ID,
  workspaceId: WORKSPACE_ID,
  documentId: DOCUMENT_ID,
  documentVersionId: DOCUMENT_VERSION_ID,
  quote: EVIDENCE.quote,
  quoteHash: EVIDENCE.quoteHash,
  sourceLocator: rowLocator,
  display: { sourceLabel: "Private document", locatorLabel: "Row 2" },
};

function claim(reviewState: CitedKnowledgeClaimVersion["reviewState"] = "proposed"): CitedKnowledgeClaimVersion {
  return {
    claimSchemaVersion: 1,
    claimId: `claim:${"8".repeat(64)}`,
    claimVersionId: `claim-version:${"9".repeat(64)}`,
    claimVersion: reviewState === "proposed" ? 1 : 2,
    supersedesClaimVersionId: reviewState === "proposed" ? null : `claim-version:${"0".repeat(64)}`,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    documentVersionId: DOCUMENT_VERSION_ID,
    checksum: "a".repeat(64),
    scannerPolicyVersion: "launch-v1",
    claimClass: "product_technical_specification",
    subject: "Epoxy resin ER-120",
    predicate: "viscosity",
    value: "120",
    unit: "mPa·s",
    polarity: "positive",
    material: true,
    confidenceBasisPoints: 7600,
    uncertainty: "The source does not state the test temperature.",
    origin: "extracted",
    evidenceGrade: "extracted",
    claimStatus: "proposed",
    reviewState,
    reviewerId: reviewState === "proposed" ? null : REVIEWER_ID,
    reviewReason: reviewState === "proposed" ? null : `Human ${reviewState} after checking Row 2.`,
    citationIds: [CITATION.citationId],
    evidenceIds: [EVIDENCE.evidenceId],
  };
}

function reviewedClaim(
  support: ExtractionReviewClaim["support"] = "current",
  reviewState: CitedKnowledgeClaimVersion["reviewState"] = "proposed",
): ExtractionReviewClaim {
  return {
    claim: claim(reviewState),
    support,
    evidence: [{ record: EVIDENCE, citation: CITATION, health: support === "uncertain" ? "stale" : support }],
  };
}

describe("ExtractionReviewPanel", () => {
  it("shows render-safe blocks and tables with exact evidence and citation locators", () => {
    const html = renderToStaticMarkup(
      <ExtractionReviewPanel state="ready" documentLabel="ER-120 specification" extraction={EXTRACTION} claims={[reviewedClaim()]} />,
    );

    expect(html).toContain('data-surface="extraction-review-panel"');
    expect(html).toContain("ER-120 specification");
    expect(html).toContain("One row contains an unsupported date format.");
    expect(html).toContain("Exact locator: Lines 2-3 · lines 2–3");
    expect(html).toContain("Exact citation locator:");
    expect(html).toContain("Exact evidence locator:");
    expect(html).toContain(CITATION.citationId);
    expect(html).toContain(EVIDENCE.evidenceId);
    expect(html).toContain("Table 1 · 1 rows · blocks 2–2");
    expect(html).toContain("&lt;script&gt;alert(&#x27;unsafe&#x27;)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("keeps uncertainty and stale or conflicted support visible", () => {
    const html = renderToStaticMarkup(
      <ExtractionReviewPanel
        state="ready"
        documentLabel="ER-120 specification"
        extraction={EXTRACTION}
        claims={[reviewedClaim("stale"), { ...reviewedClaim("conflicted"), claim: { ...claim(), claimVersionId: `claim-version:${"a".repeat(64)}` } }]}
      />,
    );

    expect(html).toContain("Stale support");
    expect(html).toContain("Conflicting support");
    expect(html).toContain('data-state="STATE-STALE"');
    expect(html).toContain('data-state="STATE-CONFLICT"');
    expect(html).toContain("The source does not state the test temperature.");
    expect(html).toContain("Awaiting human review");
  });

  it("offers callbacks only for proposed claims and gates acceptance on exact current support", () => {
    const onReview = vi.fn();
    const current = renderToStaticMarkup(
      <ExtractionReviewPanel state="ready" documentLabel="ER-120 specification" extraction={EXTRACTION} claims={[reviewedClaim()]} onReview={onReview} />,
    );
    expect(current.match(/<button\b/g)).toHaveLength(2);
    expect(current).toContain("Reject claim");
    expect(current).toContain("Accept supported claim");

    const stale = renderToStaticMarkup(
      <ExtractionReviewPanel state="ready" documentLabel="ER-120 specification" extraction={EXTRACTION} claims={[reviewedClaim("stale")]} onReview={onReview} />,
    );
    expect(stale.match(/<button\b/g)).toHaveLength(1);
    expect(stale).toContain("Reject claim");
    expect(stale).not.toContain("Accept supported claim");

    const mismatched = reviewedClaim();
    const foreignCitation = {
      ...mismatched,
      evidence: [{
        ...mismatched.evidence[0],
        citation: { ...mismatched.evidence[0]?.citation, citationId: `citation:${"b".repeat(64)}` },
      }],
    } as ExtractionReviewClaim;
    const mismatchedHtml = renderToStaticMarkup(
      <ExtractionReviewPanel state="ready" documentLabel="ER-120 specification" extraction={EXTRACTION} claims={[foreignCitation]} onReview={onReview} />,
    );
    expect(mismatchedHtml).toContain("Exact claim, evidence, citation, and extraction bindings do not match.");
    expect(mismatchedHtml).not.toContain("Accept supported claim");

    const accepted = renderToStaticMarkup(
      <ExtractionReviewPanel state="ready" documentLabel="ER-120 specification" extraction={EXTRACTION} claims={[reviewedClaim("current", "accepted")]} onReview={onReview} />,
    );
    expect(accepted).toContain("Human accepted");
    expect(accepted).toContain(REVIEWER_ID);
    expect(accepted).not.toMatch(/<button\b/u);
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<ExtractionReviewPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading extraction review");

    const error = renderToStaticMarkup(<ExtractionReviewPanel state="error" error="The exact artifact could not be loaded." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("The exact artifact could not be loaded.");

    const empty = renderToStaticMarkup(<ExtractionReviewPanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No extraction to review");
  });

  it("uses labelled regions, semantic tables, disclosures, and native review controls", () => {
    const html = renderToStaticMarkup(
      <ExtractionReviewPanel state="ready" documentLabel="ER-120 specification" extraction={EXTRACTION} claims={[reviewedClaim()]} onReview={() => undefined} />,
    );

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="extraction-review-title"');
    expect(html).toContain('aria-label="Normalized extraction blocks"');
    expect(html).toContain("<table");
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect(html).toContain("<details");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
  });
});
