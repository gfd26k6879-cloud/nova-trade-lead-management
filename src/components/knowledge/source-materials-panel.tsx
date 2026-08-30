"use client";

import type { CSSProperties } from "react";

import { AsyncState } from "@/components/async-state";
import type { DocumentIntakePanelRecord } from "@/components/knowledge/document-intake-panel";
import type { DocumentLifecycleState } from "@/lib/documents/state-machine";
import type { KnowledgeExtractionArtifact } from "@/lib/knowledge/extraction-pipeline";

export type SourceMaterialItem = Readonly<{
  intake: DocumentIntakePanelRecord;
  extraction: KnowledgeExtractionArtifact | null;
}>;

type ReadyProps = Readonly<{
  state: "ready";
  scope: Readonly<{ tenantId: string; workspaceId: string }>;
  materials: readonly SourceMaterialItem[];
  onOpen?: (material: SourceMaterialItem) => void;
  onReview?: (material: SourceMaterialItem) => void;
  error?: never;
}>;

export type SourceMaterialsPanelProps =
  | Readonly<{ state: "loading"; scope?: never; materials?: never; error?: never }>
  | Readonly<{ state: "error"; error: string; scope?: never; materials?: never }>
  | Readonly<{ state: "empty"; scope?: never; materials?: never; error?: never }>
  | ReadyProps;

type Tone = "success" | "warning" | "danger" | "neutral";

const TONE_STYLE: Readonly<Record<Tone, CSSProperties>> = Object.freeze({
  success: { background: "var(--success-bg)", borderColor: "var(--success-border)", color: "var(--success-text)" },
  warning: { background: "var(--warning-bg)", borderColor: "var(--warning-border)", color: "var(--warning-text)" },
  danger: { background: "var(--danger-bg)", borderColor: "var(--danger-border)", color: "var(--danger-text)" },
  neutral: { background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" },
});

const LIFECYCLE_LABEL: Readonly<Record<DocumentLifecycleState, string>> = Object.freeze({
  upload_reserved: "Upload reserved",
  quarantined: "Quarantined",
  scanning: "Scanning",
  clean: "Clean",
  extracting: "Extracting",
  ready: "Ready",
  infected: "Infected",
  scanner_error: "Scanner error",
  extraction_failed: "Extraction failed",
  rejected: "Rejected",
  expired: "Expired",
  deletion_pending: "Deletion pending",
  deletion_failed: "Deletion failed",
  deleted: "Deleted",
  retained_for_incident: "Incident hold",
});

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function formatTimestamp(value: string): string {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return "Unrecognized time";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(epoch);
}

function statusForLifecycle(state: DocumentLifecycleState): Readonly<{ tone: Tone; symbol: string }> {
  if (state === "ready" || state === "clean") return { tone: "success", symbol: "✓" };
  if (state === "infected" || state === "rejected" || state === "deleted") return { tone: "danger", symbol: "×" };
  if (state === "scanner_error" || state === "extraction_failed" || state === "deletion_failed") return { tone: "warning", symbol: "!" };
  return { tone: "neutral", symbol: "•" };
}

function quarantineStatus(state: DocumentLifecycleState) {
  if (state === "upload_reserved") return { label: "Awaiting quarantine", tone: "neutral" as const, symbol: "•" };
  if (state === "rejected") return { label: "Intake rejected", tone: "danger" as const, symbol: "×" };
  if (state === "deleted") return { label: "Material deleted", tone: "neutral" as const, symbol: "—" };
  return { label: "Quarantine recorded", tone: "success" as const, symbol: "✓" };
}

function scanStatus(state: DocumentLifecycleState) {
  if (state === "scanning") return { label: "Scan in progress", tone: "warning" as const, symbol: "•" };
  if (state === "infected") return { label: "Infection detected", tone: "danger" as const, symbol: "×" };
  if (state === "scanner_error") return { label: "Scanner error", tone: "warning" as const, symbol: "!" };
  if (["clean", "extracting", "ready", "extraction_failed", "expired", "deletion_pending", "deletion_failed"].includes(state)) {
    return { label: "Clean verdict", tone: "success" as const, symbol: "✓" };
  }
  return { label: "Clean verdict pending", tone: "neutral" as const, symbol: "•" };
}

function extractionStatus(material: SourceMaterialItem) {
  if (material.extraction) {
    return material.extraction.status === "review_required"
      ? { label: "Extracted · review required", tone: "warning" as const, symbol: "!" }
      : { label: "Extraction complete", tone: "success" as const, symbol: "✓" };
  }
  if (material.intake.snapshot.state === "extracting") return { label: "Extraction in progress", tone: "warning" as const, symbol: "•" };
  if (material.intake.snapshot.state === "extraction_failed") return { label: "Extraction failed", tone: "danger" as const, symbol: "×" };
  return { label: "No extraction artifact", tone: "neutral" as const, symbol: "—" };
}

function reviewStatus(extraction: KnowledgeExtractionArtifact | null) {
  if (!extraction) return { label: "Review unavailable", tone: "neutral" as const, symbol: "—" };
  return extraction.quality.reviewRequired || extraction.status === "review_required"
    ? { label: "Human review required", tone: "warning" as const, symbol: "!" }
    : { label: "No review required", tone: "success" as const, symbol: "✓" };
}

function Badge({ label, tone, symbol }: Readonly<{ label: string; tone: Tone; symbol: string }>) {
  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" style={TONE_STYLE[tone]}>
      <span aria-hidden="true">{symbol}</span>{label}
    </span>
  );
}

function PanelState({ state, error }: Readonly<{ state: "loading" | "error" | "empty"; error?: string }>) {
  if (state === "loading") {
    return <AsyncState variant="loading" title="Loading source materials" description="Retrieving canonical intake, extraction, review, and retention summaries." />;
  }
  if (state === "error") {
    return <AsyncState variant="error" title="Source materials unavailable" description={error ?? "The source-material portfolio could not be loaded."} />;
  }
  return <AsyncState variant="empty" title="No source materials yet" description="Add an approved document through secure intake to begin the knowledge workflow." />;
}

function bindingsAreExact(material: SourceMaterialItem, scope: ReadyProps["scope"]): boolean {
  const { reservation, snapshot, retention } = material.intake;
  if (reservation.tenantId !== scope.tenantId || reservation.workspaceId !== scope.workspaceId
    || snapshot.versionId !== reservation.versionId
    || retention.tenantId !== reservation.tenantId
    || retention.documentId !== reservation.documentId
    || retention.versionId !== reservation.versionId
    || retention.objectKey !== reservation.objectKey
    || retention.state !== snapshot.state
    || (snapshot.state === "ready") !== Boolean(material.extraction)) return false;

  const binding = material.extraction?.binding;
  return !binding || (
    binding.tenantId === reservation.tenantId
    && binding.workspaceId === reservation.workspaceId
    && binding.documentId === reservation.documentId
    && binding.documentVersionId === reservation.versionId
    && binding.checksum === snapshot.checksum
    && binding.scannerPolicyVersion === reservation.scannerPolicyVersion
  );
}

function MaterialCard({ material, index, onOpen, onReview }: Readonly<{
  material: SourceMaterialItem;
  index: number;
  onOpen?: ReadyProps["onOpen"];
  onReview?: ReadyProps["onReview"];
}>) {
  const { reservation, snapshot, retention } = material.intake;
  const lifecycle = statusForLifecycle(snapshot.state);
  const quarantine = quarantineStatus(snapshot.state);
  const scan = scanStatus(snapshot.state);
  const extraction = extractionStatus(material);
  const review = reviewStatus(material.extraction);
  const canOpen = snapshot.state === "ready" && Boolean(material.extraction) && Boolean(onOpen);
  const canReview = snapshot.state === "ready" && Boolean(material.extraction)
    && review.tone === "warning" && Boolean(onReview);
  const titleId = `source-material-${index}-title`;

  return (
    <li className="glass min-w-0 rounded-2xl p-4 sm:p-5" data-document-state={snapshot.state} data-review-required={review.tone === "warning"}>
      <article aria-labelledby={titleId}>
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="section-label">{reservation.format.toUpperCase()} · {reservation.mediaType}</p>
            <h3 id={titleId} className="mt-1 break-words text-base font-semibold" style={{ color: "var(--text-primary)" }}>{reservation.fileName}</h3>
            <p className="mt-1 break-all font-mono text-[0.68rem]" style={{ color: "var(--text-tertiary)" }}>Document {reservation.documentId} · version {reservation.versionId}</p>
          </div>
          <Badge label={LIFECYCLE_LABEL[snapshot.state]} tone={lifecycle.tone} symbol={lifecycle.symbol} />
        </header>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-xl border p-3" style={TONE_STYLE[quarantine.tone]}><dt className="section-label">Quarantine</dt><dd className="mt-2"><Badge {...quarantine} /></dd></div>
          <div className="rounded-xl border p-3" style={TONE_STYLE[scan.tone]}><dt className="section-label">Malware scan</dt><dd className="mt-2"><Badge {...scan} /></dd></div>
          <div className="rounded-xl border p-3" style={TONE_STYLE[extraction.tone]}><dt className="section-label">Extraction</dt><dd className="mt-2"><Badge {...extraction} /></dd></div>
          <div className="rounded-xl border p-3" style={TONE_STYLE[review.tone]}><dt className="section-label">Human review</dt><dd className="mt-2"><Badge {...review} /></dd></div>
          <div className="rounded-xl border p-3 sm:col-span-2" style={TONE_STYLE[retention.disposition === "retain" ? "neutral" : "success"]}>
            <dt className="section-label">Retention</dt>
            <dd className="mt-2 text-sm font-semibold">{retention.disposition === "retain" ? "Retained" : "Purge eligible"} · {words(retention.reason)}</dd>
            <dd className="mt-1 text-xs">Policy expiry <time dateTime={retention.retentionExpiresAt}>{formatTimestamp(retention.retentionExpiresAt)} UTC</time></dd>
          </div>
        </dl>

        {material.extraction ? (
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            Extraction quality {material.extraction.quality.score}/100 · {material.extraction.blocks.length} normalized {material.extraction.blocks.length === 1 ? "block" : "blocks"}
          </p>
        ) : null}

        {canOpen || canReview ? (
          <footer className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:flex-wrap" style={{ borderColor: "var(--surface-card-border)" }}>
            {canOpen ? <button type="button" className="btn-glass min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" data-source-material-action="open" onClick={() => onOpen?.(material)}>Open source material</button> : null}
            {canReview ? <button type="button" className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto" data-source-material-action="review" onClick={() => onReview?.(material)}>Review extraction</button> : null}
          </footer>
        ) : null}
      </article>
    </li>
  );
}

export function SourceMaterialsPanel(props: SourceMaterialsPanelProps) {
  if (props.state === "loading") return <PanelState state="loading" />;
  if (props.state === "error") return <PanelState state="error" error={props.error} />;
  if (props.state === "empty" || props.materials.length === 0) return <PanelState state="empty" />;
  if (props.materials.some((material) => !bindingsAreExact(material, props.scope))) {
    return <PanelState state="error" error="The source-material scope or document bindings could not be verified." />;
  }

  const reviewCount = props.materials.filter((material) => reviewStatus(material.extraction).tone === "warning").length;
  return (
    <section className="space-y-4" data-surface="source-materials-panel" aria-labelledby="source-materials-title">
      <header className="glass-heavy rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="section-label">Knowledge · Governed sources</p>
            <h2 id="source-materials-title" className="mt-2 text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>Source materials</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>Secure intake, scanning, extraction, human review, and retention status in one canonical portfolio.</p>
          </div>
          <p className="text-sm font-semibold" style={{ color: reviewCount > 0 ? "var(--warning-text)" : "var(--text-secondary)" }}>{props.materials.length} {props.materials.length === 1 ? "material" : "materials"} · {reviewCount} {reviewCount === 1 ? "review" : "reviews"} required</p>
        </div>
        <dl className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Exact source-material scope">
          <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}><dt className="section-label">Tenant scope</dt><dd className="mt-1 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{props.scope.tenantId}</dd></div>
          <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}><dt className="section-label">Workspace scope</dt><dd className="mt-1 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{props.scope.workspaceId}</dd></div>
        </dl>
      </header>

      <ul className="grid grid-cols-1 gap-4 2xl:grid-cols-2" aria-label="Canonical source materials">
        {props.materials.map((material, index) => (
          <MaterialCard key={`${material.intake.reservation.documentId}:${material.intake.reservation.versionId}`} material={material} index={index} onOpen={props.onOpen} onReview={props.onReview} />
        ))}
      </ul>
    </section>
  );
}
