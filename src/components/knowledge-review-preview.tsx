import Link from "next/link";

import type { AgentProposalClaim, AgentCitationStatus } from "@/lib/agent-runtime/output";
import type { LaunchDocumentFormat } from "@/lib/documents/validation";

type SourceProcessingState = "review_required" | "extraction_partial" | "ready" | "blocked_unsupported";
type UnderstandingDomainState = "supported" | "partial" | "unknown" | "conflict";
type StatusTone = "success" | "warning" | "danger" | "neutral";

type SourceSummary = Readonly<{
  name: string;
  format: LaunchDocumentFormat;
  version: string;
  state: SourceProcessingState;
  statusLabel: string;
  detail: string;
  processedAt: string;
}>;

type ExtractionExcerpt = Readonly<{
  locator: string;
  heading: string;
  text: string;
  status: AgentCitationStatus;
}>;

type SelectedSource = Readonly<{
  name: string;
  format: LaunchDocumentFormat;
  version: string;
  checksumLabel: string;
  policyVersion: string;
  parserBuild: string;
  qualityLabel: string;
  extractionState: SourceProcessingState;
  excerpts: readonly ExtractionExcerpt[];
}>;

type UnderstandingFixture = Readonly<{
  version: string;
  statusLabel: string;
  generatedAt: string;
  coverageLabel: string;
  domains: readonly Readonly<{
    name: string;
    summary: string;
    state: UnderstandingDomainState;
  }>[];
  claims: readonly AgentProposalClaim[];
  question: Readonly<{
    prompt: string;
    rationale: string;
    unlocks: string;
  }>;
}>;

export type KnowledgeReviewPreviewProps = Readonly<{
  intakeHref: string;
  sources: readonly SourceSummary[];
  selectedSource: SelectedSource;
  understanding: UnderstandingFixture;
}>;

const SOURCE_STATE: Record<SourceProcessingState, { canonical: string; symbol: string; tone: StatusTone }> = {
  review_required: { canonical: "STATE-PENDING", symbol: "○", tone: "neutral" },
  extraction_partial: { canonical: "STATE-PARTIAL", symbol: "!", tone: "warning" },
  ready: { canonical: "STATE-READY", symbol: "✓", tone: "success" },
  blocked_unsupported: { canonical: "STATE-UNSUPPORTED", symbol: "×", tone: "danger" },
};

const DOMAIN_STATE: Record<UnderstandingDomainState, { canonical: string; label: string; symbol: string }> = {
  supported: { canonical: "STATE-READY", label: "Supported", symbol: "✓" },
  partial: { canonical: "STATE-PARTIAL", label: "Partial", symbol: "!" },
  unknown: { canonical: "STATE-UNKNOWN", label: "Unknown", symbol: "?" },
  conflict: { canonical: "STATE-CONFLICT", label: "Conflict", symbol: "×" },
};

const STATUS_TONE_STYLE: Record<StatusTone, { background: string; borderColor: string; color: string }> = {
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
};

function citationState(status: AgentCitationStatus): string {
  if (status === "stale") return "STATE-STALE";
  if (status === "conflicted") return "STATE-CONFLICT";
  return "STATE-READY";
}

function statusColor(state: string): string {
  if (state === "STATE-READY") return "var(--success-text)";
  if (state === "STATE-STALE" || state === "STATE-PARTIAL" || state === "STATE-CONFLICT") {
    return "var(--warning-text)";
  }
  return "var(--text-secondary)";
}

function statusSymbol(state: string): string {
  if (state === "STATE-READY") return "✓";
  if (state === "STATE-CONFLICT" || state === "STATE-UNSUPPORTED") return "×";
  if (state === "STATE-UNKNOWN") return "?";
  if (state === "STATE-STALE" || state === "STATE-PARTIAL") return "!";
  return "○";
}

function claimSupportAccessibleLabel(supportLabel: string, state: string): string {
  if (state === "STATE-STALE") return `${supportLabel}; evidence is stale`;
  if (state === "STATE-CONFLICT") return `${supportLabel}; evidence is conflicted`;
  if (state === "STATE-UNKNOWN") return `${supportLabel}; evidence is unknown`;
  return supportLabel;
}

export function KnowledgeReviewPreview({
  intakeHref,
  sources,
  selectedSource,
  understanding,
}: KnowledgeReviewPreviewProps) {
  const partialSources = sources.filter((source) => source.state === "extraction_partial").length;
  const selectedSourceStatus = SOURCE_STATE[selectedSource.extractionState];
  const selectedSourceTone = STATUS_TONE_STYLE[selectedSourceStatus.tone];

  return (
    <section className="space-y-5" data-surface="knowledge-review-preview" aria-labelledby="knowledge-review-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Knowledge · Review workspace</p>
            <h1 id="knowledge-review-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Trace sources into business understanding
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Inspect extraction quality, exact evidence locators, and unresolved claims before any understanding can be approved.
            </p>
          </div>
          <div className="rounded-xl border px-3 py-2 text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Preview fixture · no live knowledge data</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Read-only examples; nothing here can submit or approve.</p>
          </div>
        </div>

        <nav aria-label="Knowledge review sections" className="mt-4 flex flex-wrap gap-2">
          <a className="btn-glass min-h-11 text-xs" href="#source-library">Sources</a>
          <a className="btn-glass min-h-11 text-xs" href="#extraction-review">Extraction</a>
          <a className="btn-glass min-h-11 text-xs" href="#understanding-review">Understanding</a>
        </nav>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)]">
        <section id="source-library" className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="source-library-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="source-library-title" className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Source library</h2>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                {sources.length} fixture sources · tenant-wide · {partialSources} partial
              </p>
            </div>
            <Link className="btn-glass min-h-11 shrink-0 text-xs" href={intakeHref}>Review intake</Link>
          </div>

          <ul className="mt-4 space-y-2" aria-label="Fixture knowledge sources">
            {sources.map((source, index) => {
              const meta = SOURCE_STATE[source.state];
              return (
                <li
                  key={`${source.name}-${source.version}`}
                  data-state={meta.canonical}
                  className="rounded-xl border p-3"
                  style={{ background: index === 0 ? "var(--selection-bg)" : "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{source.name}</p>
                      <p className="mt-1 text-xs uppercase" style={{ color: "var(--text-tertiary)" }}>{source.format} · {source.version}</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold" style={{ color: statusColor(meta.canonical) }}>
                      <span aria-hidden="true">{meta.symbol}</span> {source.statusLabel}
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{source.detail}</p>
                  <p className="mt-2 text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>Processed {source.processedAt}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section id="extraction-review" className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="extraction-review-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="section-label">Selected immutable source</p>
              <h2 id="extraction-review-title" className="mt-1 break-words text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                {selectedSource.name}
              </h2>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{selectedSource.format.toUpperCase()} · {selectedSource.version}</p>
            </div>
            <span
              className="rounded-full border px-2.5 py-1 text-xs font-semibold"
              data-selected-source-status="true"
              data-tone={selectedSourceStatus.tone}
              data-state={selectedSourceStatus.canonical}
              aria-label={`Extraction status: ${selectedSource.qualityLabel}`}
              style={selectedSourceTone}
            >
              <span aria-hidden="true">{selectedSourceStatus.symbol}</span> {selectedSource.qualityLabel}
            </span>
          </div>

          <dl className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              ["Integrity", selectedSource.checksumLabel],
              ["Policy", selectedSource.policyVersion],
              ["Parser", selectedSource.parserBuild],
            ].map(([term, value]) => (
              <div key={term} className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                <dt className="section-label">{term}</dt>
                <dd className="mt-1 break-words text-xs font-medium" style={{ color: "var(--text-primary)" }}>{value}</dd>
              </div>
            ))}
          </dl>

          <div
            className="mt-3 rounded-xl border px-3 py-2"
            data-state="STATE-INACCESSIBLE"
            style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}
          >
            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Protected original access</p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Protected original is unavailable in this fixture preview. Permitted extracted evidence remains visible without a raw storage location.
            </p>
          </div>

          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Located extraction</h3>
            {selectedSource.excerpts.map((excerpt) => (
              <details key={excerpt.locator} className="rounded-xl border p-3" data-state={citationState(excerpt.status)} style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {excerpt.heading} · {excerpt.status} evidence
                </summary>
                <blockquote className="mt-2 border-l-2 pl-3 text-sm leading-relaxed" style={{ borderColor: "var(--accent)", color: "var(--text-secondary)" }}>
                  {excerpt.text}
                </blockquote>
                <p className="mt-3 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>
                  Exact locator: {excerpt.locator}
                </p>
              </details>
            ))}
          </div>
        </section>
      </div>

      <section id="understanding-review" className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="understanding-review-title">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-label">Versioned synthesis</p>
            <h2 id="understanding-review-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>{understanding.version}</h2>
            <p className="mt-1 text-sm font-medium" style={{ color: "var(--warning-text)" }}>{understanding.statusLabel}</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Generated {understanding.generatedAt}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button className="btn-glass min-h-11" type="button" disabled>Request another question round</button>
            <button className="btn-primary min-h-11" type="button" disabled>Approve understanding</button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border p-3" data-state="STATE-PARTIAL" style={{ background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" }}>
          <p className="text-sm font-semibold" data-partial-status="true" aria-label="Evidence coverage status: Partial">
            <span aria-hidden="true">!</span> Evidence coverage is partial
          </p>
          <p className="mt-1 text-xs leading-relaxed">{understanding.coverageLabel}. Partial and stale evidence never receives approved styling.</p>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
          <div className="space-y-4">
            <section aria-labelledby="understanding-domains-title">
              <h3 id="understanding-domains-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Understanding domains</h3>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {understanding.domains.map((domain) => {
                  const meta = DOMAIN_STATE[domain.state];
                  return (
                    <article key={domain.name} data-state={meta.canonical} className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{domain.name}</h4>
                        <span
                          className="text-xs font-semibold"
                          data-domain-status="true"
                          aria-label={`${domain.name} status: ${meta.label}`}
                          style={{ color: statusColor(meta.canonical) }}
                        >
                          <span aria-hidden="true">{meta.symbol}</span> {meta.label}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{domain.summary}</p>
                    </article>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="material-claims-title">
              <h3 id="material-claims-title" className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Material claim review</h3>
              <div className="mt-2 space-y-2">
                {understanding.claims.map((claim) => {
                  const strongestState = claim.citations.some((citation) => citation.status === "conflicted")
                    ? "STATE-CONFLICT"
                    : claim.citations.some((citation) => citation.status === "stale")
                      ? "STATE-STALE"
                      : claim.support === "unsupported"
                        ? "STATE-UNKNOWN"
                        : "STATE-READY";
                  const supportLabel = claim.support === "supported" ? "Supported claim" : "Unsupported claim";
                  return (
                    <article key={claim.statement} data-state={strongestState} className="rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <p className="text-sm font-medium leading-relaxed" style={{ color: "var(--text-primary)" }}>{claim.statement}</p>
                        <span
                          className="shrink-0 text-xs font-semibold"
                          data-claim-support-status="true"
                          aria-label={`Claim support status: ${claimSupportAccessibleLabel(supportLabel, strongestState)}`}
                          style={{ color: statusColor(strongestState) }}
                        >
                          <span aria-hidden="true">{statusSymbol(strongestState)}</span> {supportLabel}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {claim.citations.map((citation) => (
                          <details key={citation.locator} data-state={citationState(citation.status)} className="rounded-lg border px-3 py-1" style={{ borderColor: "var(--surface-card-border)" }}>
                            <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                              View {citation.status} citation
                            </summary>
                            <p className="break-all pb-3 font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>{citation.locator}</p>
                          </details>
                        ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="rounded-xl border p-4" data-state="STATE-PENDING" aria-labelledby="next-question-title" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <p className="section-label">Adaptive question preview</p>
            <h3 id="next-question-title" className="mt-2 text-base font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>{understanding.question.prompt}</h3>
            <div className="mt-4 space-y-3">
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>Why this matters</p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{understanding.question.rationale}</p>
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>What this unlocks</p>
                <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{understanding.question.unlocks}</p>
              </div>
            </div>
            <label className="mt-4 block text-xs font-semibold" htmlFor="fixture-question-answer">Answer</label>
            <textarea id="fixture-question-answer" className="input-glass mt-2 min-h-24 w-full resize-y" disabled placeholder="Fixture preview cannot save an answer" />
            <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>No fixed total is shown; the server would choose the next question from current evidence.</p>
          </aside>
        </div>
      </section>
    </section>
  );
}
