import {
  KnowledgeReviewPreview,
  type KnowledgeReviewPreviewProps,
} from "@/components/knowledge-review-preview";

const KNOWLEDGE_FIXTURE = {
  intakeHref: "/onboarding",
  sources: [
    {
      name: "Product catalog 2026.pdf",
      format: "pdf",
      version: "v7",
      state: "review_required",
      statusLabel: "Needs review",
      detail: "42 pages · 188 evidence items",
      processedAt: "August 29, 2026 at 9:24 AM MDT",
    },
    {
      name: "Application compatibility.xlsx",
      format: "xlsx",
      version: "v3",
      state: "extraction_partial",
      statusLabel: "Partial extraction",
      detail: "4,812 rows complete · 16 rows need review",
      processedAt: "August 29, 2026 at 9:18 AM MDT",
    },
    {
      name: "Capabilities overview.pdf",
      format: "pdf",
      version: "v2",
      state: "ready",
      statusLabel: "Ready for review",
      detail: "12 pages · 37 evidence items",
      processedAt: "August 29, 2026 at 8:52 AM MDT",
    },
  ],
  selectedSource: {
    name: "Product catalog 2026.pdf",
    format: "pdf",
    version: "v7",
    checksumLabel: "SHA-256 · 94ae…60c2",
    policyVersion: "document-policy v3.4",
    parserBuild: "fixture-parser 2026.08",
    qualityLabel: "Medium parser confidence · review required",
    extractionState: "review_required",
    excerpts: [
      {
        locator: "doc:fixture-product-catalog:v7:page:14:sec:temperature-range",
        heading: "Operating range",
        text: "The HX-24 blend is listed for continuous operation between −20 °C and 145 °C under the stated test method.",
        status: "current",
      },
      {
        locator: "doc:fixture-product-catalog:v7:page:31:table:markets",
        heading: "Market availability table",
        text: "The table names North American availability but does not provide an effective date for every row.",
        status: "stale",
      },
    ],
  },
  understanding: {
    version: "Understanding v12",
    statusLabel: "Needs review · not approved",
    generatedAt: "August 29, 2026 at 9:31 AM MDT",
    coverageLabel: "3 of 5 material claims have current evidence",
    domains: [
      { name: "Offerings", summary: "Specialty blends and application support for controlled industrial uses", state: "supported" },
      { name: "Applications", summary: "High-temperature process equipment is supported by current product literature", state: "supported" },
      { name: "Differentiators", summary: "Performance range is evidenced; comparative advantage still needs corroboration", state: "partial" },
      { name: "Markets and constraints", summary: "Current regional availability and exclusions remain unknown", state: "unknown" },
    ],
    claims: [
      {
        statement: "The HX-24 blend supports continuous operation up to 145 °C under the documented test method.",
        kind: "fact",
        support: "supported",
        citations: [
          { locator: "doc:fixture-product-catalog:v7:page:14:sec:temperature-range", status: "current" },
        ],
      },
      {
        statement: "Every listed blend is currently available throughout North America.",
        kind: "fact",
        support: "unsupported",
        citations: [
          { locator: "doc:fixture-product-catalog:v7:page:31:table:markets", status: "stale" },
        ],
      },
      {
        statement: "HX-24 is certified for direct food contact.",
        kind: "regulatory",
        support: "unsupported",
        citations: [
          { locator: "doc:fixture-product-catalog:v7:page:18:sec:certifications", status: "conflicted" },
        ],
      },
    ],
    question: {
      prompt: "Which products and regions are covered by the current distribution agreement?",
      rationale: "The catalog includes availability labels, but several rows lack an effective date and conflict with an older capabilities document.",
      unlocks: "Current market constraints, account eligibility, and a reviewable regional availability claim",
    },
  },
} satisfies KnowledgeReviewPreviewProps;

export default function KnowledgePage() {
  return <KnowledgeReviewPreview {...KNOWLEDGE_FIXTURE} />;
}
