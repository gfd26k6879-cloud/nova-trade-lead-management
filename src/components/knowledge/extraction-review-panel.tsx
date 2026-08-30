"use client";

import { AsyncState } from "@/components/async-state";
import type { CitedKnowledgeClaimVersion } from "@/lib/knowledge/claims";
import type {
  KnowledgeEvidenceRecord,
  RenderSafeKnowledgeCitation,
} from "@/lib/knowledge/evidence-citations";
import type {
  KnowledgeExtractionArtifact,
  RenderSafeSourceLocator,
} from "@/lib/knowledge/extraction-pipeline";

export type ExtractionEvidenceHealth = "current" | "stale" | "conflicted";
export type ExtractionClaimSupport = ExtractionEvidenceHealth | "uncertain";
export type ExtractionReviewDecision = "accepted" | "rejected";

export type ExtractionReviewClaim = Readonly<{
  claim: CitedKnowledgeClaimVersion;
  support: ExtractionClaimSupport;
  evidence: readonly Readonly<{
    record: KnowledgeEvidenceRecord;
    citation: RenderSafeKnowledgeCitation;
    health: ExtractionEvidenceHealth;
  }>[];
}>;

type ReadyProps = Readonly<{
  state: "ready";
  documentLabel: string;
  extraction: KnowledgeExtractionArtifact;
  claims: readonly ExtractionReviewClaim[];
  onReview?: (
    decision: ExtractionReviewDecision,
    claim: CitedKnowledgeClaimVersion,
  ) => void;
}>;

export type ExtractionReviewPanelProps =
  | Readonly<{ state: "loading"; error?: never }>
  | Readonly<{ state: "error"; error: string }>
  | Readonly<{ state: "empty"; error?: never }>
  | ReadyProps;

const SUPPORT_META = {
  current: {
    label: "Current support",
    symbol: "✓",
    state: "STATE-READY",
    style: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  },
  stale: {
    label: "Stale support",
    symbol: "!",
    state: "STATE-STALE",
    style: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  },
  conflicted: {
    label: "Conflicting support",
    symbol: "×",
    state: "STATE-CONFLICT",
    style: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  },
  uncertain: {
    label: "Support uncertain",
    symbol: "?",
    state: "STATE-UNKNOWN",
    style: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  },
} as const;

const REVIEW_META = {
  proposed: { label: "Awaiting human review", symbol: "?", style: SUPPORT_META.uncertain.style },
  accepted: { label: "Human accepted", symbol: "✓", style: SUPPORT_META.current.style },
  rejected: { label: "Human rejected", symbol: "×", style: SUPPORT_META.conflicted.style },
} as const;

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function locatorLabel(locator: RenderSafeSourceLocator): string {
  return locator.kind === "line_range"
    ? `${locator.label} · lines ${locator.startLine}–${locator.endLine}`
    : `${locator.label} · row ${locator.row}`;
}

function confidenceLabel(basisPoints: number): string {
  const percentage = basisPoints / 100;
  return `${Number.isInteger(percentage) ? percentage.toFixed(0) : percentage.toFixed(2)}%`;
}

function evidenceIsBound(
  item: ExtractionReviewClaim["evidence"][number],
  claim: CitedKnowledgeClaimVersion,
  extraction: KnowledgeExtractionArtifact,
): boolean {
  const { record, citation } = item;
  return claim.evidenceIds.includes(record.evidenceId)
    && claim.citationIds.includes(citation.citationId)
    && citation.state === "resolved"
    && citation.evidenceId === record.evidenceId
    && citation.quote === record.quote
    && citation.quoteHash === record.quoteHash
    && record.extractionInputHash === extraction.binding.inputHash
    && record.tenantId === claim.tenantId && citation.tenantId === claim.tenantId
    && record.workspaceId === claim.workspaceId && citation.workspaceId === claim.workspaceId
    && record.documentId === claim.documentId && citation.documentId === claim.documentId
    && record.documentVersionId === claim.documentVersionId && citation.documentVersionId === claim.documentVersionId
    && extraction.blocks.some((block) => block.ordinal === record.blockOrdinal && block.contentHash === record.blockContentHash);
}

function ReadyExtractionReview({ documentLabel, extraction, claims, onReview }: ReadyProps) {
  const needsReview = claims.filter(({ claim }) => claim.reviewState === "proposed").length;

  return (
    <section
      className="space-y-5"
      data-surface="extraction-review-panel"
      data-extraction-status={extraction.status}
      aria-labelledby="extraction-review-title"
    >
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Knowledge extraction · Human review</p>
            <h2 id="extraction-review-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Review extracted evidence and claims
            </h2>
            <p className="mt-2 max-w-3xl break-words text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {documentLabel}. Inspect normalized content, exact source locations, and uncertainty before deciding each proposed claim.
            </p>
          </div>
          <div
            className="shrink-0 rounded-xl border px-3 py-2"
            data-state={extraction.quality.reviewRequired ? "STATE-UNKNOWN" : "STATE-READY"}
            style={extraction.quality.reviewRequired ? SUPPORT_META.uncertain.style : SUPPORT_META.current.style}
          >
            <p className="text-sm font-semibold">
              <span aria-hidden="true">{extraction.quality.reviewRequired ? "?" : "✓"}</span>{" "}
              {extraction.quality.reviewRequired ? "Extraction review required" : "Extraction complete"}
            </p>
            <p className="mt-1 text-xs">Quality {extraction.quality.score}/100 · {needsReview} claims pending</p>
          </div>
        </div>
      </header>

      {extraction.warnings.length > 0 ? (
        <section className="rounded-2xl border p-4 sm:p-5" aria-labelledby="extraction-warnings-title" style={SUPPORT_META.uncertain.style}>
          <p className="section-label">Extraction warnings</p>
          <h3 id="extraction-warnings-title" className="mt-1 text-base font-semibold">Review limitations</h3>
          <ul className="mt-3 space-y-2">
            {extraction.warnings.map((warning, index) => (
              <li key={`${warning}:${index}`} className="text-sm leading-relaxed"><span aria-hidden="true">!</span> {warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,.9fr)]">
        <div className="space-y-5">
          <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="extraction-content-title">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <div>
                <p className="section-label">Render-safe output</p>
                <h3 id="extraction-content-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Normalized blocks</h3>
              </div>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{extraction.blocks.length} blocks</p>
            </div>
            <ol className="mt-4 space-y-3" aria-label="Normalized extraction blocks">
              {extraction.blocks.map((block) => (
                <li key={block.contentHash} className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold capitalize" style={{ color: "var(--text-primary)" }}>{words(block.kind)} · block {block.ordinal + 1}</p>
                    <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>Exact locator: {locatorLabel(block.sourceLocator)}</p>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{block.text}</p>
                </li>
              ))}
            </ol>
          </section>

          {extraction.tables.length > 0 ? (
            <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="extraction-tables-title">
              <p className="section-label">Structured output</p>
              <h3 id="extraction-tables-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Extracted tables</h3>
              <div className="mt-4 space-y-4">
                {extraction.tables.map((table) => (
                  <div key={table.contentHash} className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--surface-card-border)" }}>
                    <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
                      <caption className="px-3 py-3 text-left text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                        Table {table.ordinal + 1} · {table.rowCount} rows · blocks {table.startBlockOrdinal + 1}–{table.endBlockOrdinal + 1}
                      </caption>
                      <thead>
                        <tr style={{ background: "var(--surface-muted)" }}>
                          <th scope="col" className="border-t px-3 py-2 text-xs" style={{ borderColor: "var(--surface-card-border)" }}>Source</th>
                          <th scope="col" className="border-t px-3 py-2 text-xs" style={{ borderColor: "var(--surface-card-border)" }}>Normalized row</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row) => (
                          <tr key={row.contentHash}>
                            <th scope="row" className="border-t px-3 py-2 align-top text-xs font-semibold" style={{ borderColor: "var(--table-row-border)", color: "var(--text-tertiary)" }}>
                              {locatorLabel(row.sourceLocator)}
                            </th>
                            <td className="whitespace-pre-wrap break-words border-t px-3 py-2 align-top" style={{ borderColor: "var(--table-row-border)", color: "var(--text-secondary)" }}>{row.text}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="extraction-claims-title">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div>
              <p className="section-label">Claim support</p>
              <h3 id="extraction-claims-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Evidence review</h3>
            </div>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{claims.length} claims</p>
          </div>

          <div className="mt-4 space-y-4">
            {claims.map(({ claim, support, evidence }, claimIndex) => {
              const supportMeta = SUPPORT_META[support];
              const reviewMeta = REVIEW_META[claim.reviewState];
              const isProposed = claim.reviewState === "proposed";
              const evidenceBound = evidence.length > 0
                && evidence.every((item) => evidenceIsBound(item, claim, extraction));
              const canAccept = isProposed && support === "current" && evidence.length > 0
                && evidenceBound && evidence.every((item) => item.health === "current");
              const titleId = `extraction-claim-${claimIndex}-title`;

              return (
                <article key={claim.claimVersionId} className="rounded-xl border p-3 sm:p-4" aria-labelledby={titleId} data-review-state={claim.reviewState} style={{ borderColor: "var(--surface-card-border)", background: "var(--surface-muted)" }}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="section-label">{words(claim.claimClass)} · {claim.material ? "material" : "supporting"}</p>
                      <h4 id={titleId} className="mt-1 break-words text-sm font-semibold leading-relaxed" style={{ color: "var(--text-primary)" }}>
                        {claim.subject} · {words(claim.predicate)} · {claim.value}{claim.unit ? ` ${claim.unit}` : ""}
                      </h4>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Confidence {confidenceLabel(claim.confidenceBasisPoints)}</p>
                    </div>
                    <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold" data-state={supportMeta.state} style={supportMeta.style} aria-label={`Claim support: ${supportMeta.label}`}>
                      <span aria-hidden="true">{supportMeta.symbol}</span> {supportMeta.label}
                    </span>
                  </div>

                  {claim.uncertainty ? (
                    <div className="mt-3 rounded-lg border p-3" data-state="STATE-UNKNOWN" style={SUPPORT_META.uncertain.style}>
                      <p className="text-xs font-semibold">? Stated uncertainty</p>
                      <p className="mt-1 text-xs leading-relaxed">{claim.uncertainty}</p>
                    </div>
                  ) : null}

                  {evidence.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {evidence.map(({ record, citation, health }) => {
                        const healthMeta = SUPPORT_META[health];
                        return (
                          <details key={citation.citationId} className="rounded-lg border" style={{ borderColor: "var(--surface-card-border)" }}>
                            <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                              {citation.display.sourceLabel} · {citation.display.locatorLabel} · {healthMeta.label}
                            </summary>
                            <div className="border-t px-3 py-3" style={{ borderColor: "var(--surface-card-border)" }}>
                              <blockquote className="border-l-2 pl-3 text-sm leading-relaxed" style={{ borderColor: "var(--accent)", color: "var(--text-secondary)" }}>{citation.quote}</blockquote>
                              <dl className="mt-3 space-y-1 text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
                                <div><dt className="inline font-semibold">Exact citation locator: </dt><dd className="inline">{locatorLabel(citation.sourceLocator)}</dd></div>
                                <div><dt className="inline font-semibold">Exact evidence locator: </dt><dd className="inline">{locatorLabel(record.sourceLocator)}</dd></div>
                                <div className="break-all"><dt className="inline font-semibold">Citation: </dt><dd className="inline font-mono">{citation.citationId}</dd></div>
                                <div className="break-all"><dt className="inline font-semibold">Evidence: </dt><dd className="inline font-mono">{record.evidenceId}</dd></div>
                              </dl>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs font-semibold" data-state="STATE-UNKNOWN" style={{ color: "var(--warning-text)" }}>No cited evidence is attached.</p>
                  )}

                  {evidence.length > 0 && !evidenceBound ? (
                    <p className="mt-3 rounded-lg border p-3 text-xs font-semibold" role="alert" data-state="STATE-CONFLICT" style={SUPPORT_META.conflicted.style}>
                      Exact claim, evidence, citation, and extraction bindings do not match. Acceptance is blocked.
                    </p>
                  ) : null}

                  <div className="mt-3 rounded-lg border p-3" style={reviewMeta.style}>
                    <p className="text-xs font-semibold"><span aria-hidden="true">{reviewMeta.symbol}</span> {reviewMeta.label}</p>
                    {claim.reviewerId ? <p className="mt-1 break-all text-xs">Reviewer {claim.reviewerId}</p> : null}
                    {claim.reviewReason ? <p className="mt-1 text-xs leading-relaxed">{claim.reviewReason}</p> : null}
                  </div>

                  {isProposed && onReview ? (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end" aria-label={`Review actions for ${claim.subject}`}>
                      <button type="button" className="btn-glass min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onReview("rejected", claim)}>
                        Reject claim
                      </button>
                      {canAccept ? (
                        <button type="button" className="btn-primary min-h-11 w-full whitespace-normal text-center focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" onClick={() => onReview("accepted", claim)}>
                          Accept supported claim
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <p className="break-all px-1 font-mono text-[0.65rem]" style={{ color: "var(--text-tertiary)" }}>
        Exact extraction: {extraction.binding.inputHash}
      </p>
    </section>
  );
}

export function ExtractionReviewPanel(props: ExtractionReviewPanelProps) {
  if (props.state === "loading") {
    return <AsyncState variant="loading" title="Loading extraction review" description="Retrieving normalized blocks, exact evidence, citations, and human review state." />;
  }
  if (props.state === "error") {
    return <AsyncState variant="error" title="Extraction review unavailable" description={props.error} />;
  }
  if (props.state === "empty") {
    return <AsyncState variant="empty" title="No extraction to review" description="Complete a supported document extraction before reviewing evidence-backed claims." />;
  }
  return <ReadyExtractionReview {...props} />;
}
