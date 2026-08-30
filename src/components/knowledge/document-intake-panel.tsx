"use client";

import { AsyncState } from "@/components/async-state";
import type {
  CompleteDocumentUploadResult,
  DocumentUploadReservationRecord,
} from "@/lib/documents/intake-service";
import type {
  DocumentFilePolicyDecision,
  ScannerReleaseDecision,
} from "@/lib/documents/intake-policy";
import type { DocumentRetentionDisposition } from "@/lib/documents/retention";
import {
  transitionDocumentVersion,
  type DocumentLifecycleState,
  type DocumentVersionSnapshot,
} from "@/lib/documents/state-machine";

export type DocumentIntakeAuditEvent = Readonly<{
  sequence: number;
  at: string;
  actor: "member" | "worker" | "system";
  from: DocumentLifecycleState | null;
  to: DocumentLifecycleState;
  versionId: string;
  checksum: string;
  reason: string;
}>;

export type DocumentIntakePanelRecord = Readonly<{
  reservation: DocumentUploadReservationRecord;
  snapshot: DocumentVersionSnapshot;
  storageVisibility: "private";
  intakeKind: "created" | "replay";
  completionKind: CompleteDocumentUploadResult["kind"] | null;
  scanDispatch: CompleteDocumentUploadResult["scanDispatch"] | null;
  filePolicy: DocumentFilePolicyDecision | null;
  scanPolicy: ScannerReleaseDecision | null;
  retention: DocumentRetentionDisposition;
  auditTrail: readonly DocumentIntakeAuditEvent[];
}>;

type ReadyProps = Readonly<{
  state: "ready";
  record: DocumentIntakePanelRecord | null;
  onSelect?: () => void;
  onUpload?: (reservation: DocumentUploadReservationRecord) => void;
  onReviewRetry?: (snapshot: DocumentVersionSnapshot) => void;
  error?: never;
}>;

export type DocumentIntakePanelProps =
  | Readonly<{
    state: "loading";
    record?: never;
    onSelect?: never;
    onUpload?: never;
    onReviewRetry?: never;
    error?: never;
  }>
  | Readonly<{
    state: "error";
    error: string;
    record?: never;
    onSelect?: never;
    onUpload?: never;
    onReviewRetry?: never;
  }>
  | ReadyProps;

const STATE_LABEL: Readonly<Record<DocumentLifecycleState, string>> = Object.freeze({
  upload_reserved: "Upload reserved",
  quarantined: "Quarantined",
  scanning: "Scanning",
  clean: "Clean",
  extracting: "Extracting",
  ready: "Ready for review",
  infected: "Infected — release denied",
  scanner_error: "Scanner error",
  extraction_failed: "Extraction failed",
  rejected: "Rejected",
  expired: "Retention expired",
  deletion_pending: "Deletion pending",
  deletion_failed: "Deletion failed",
  deleted: "Deleted",
  retained_for_incident: "Retained for incident",
});

const REVIEWABLE_RETRY_STATES: ReadonlySet<DocumentLifecycleState> = new Set([
  "scanner_error",
  "extraction_failed",
  "deletion_failed",
]);

function words(value: string): string {
  return value.replaceAll("_", " ");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes % (1024 * 1024) === 0 ? 0 : 1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes.toLocaleString("en-US")} B`;
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

function chronologyIsExact(record: DocumentIntakePanelRecord): boolean {
  if (record.auditTrail.length === 0) return false;
  const exactEvents = record.auditTrail.every((event, index) => {
    const predecessor = record.auditTrail[index - 1];
    const epoch = Date.parse(event.at);
    const predecessorEpoch = predecessor ? Date.parse(predecessor.at) : Number.NEGATIVE_INFINITY;
    if (event.sequence !== index + 1
      || event.versionId !== record.snapshot.versionId
      || event.checksum !== record.snapshot.checksum
      || (index === 0 ? event.from !== null : event.from !== predecessor?.to)) return false;
    if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== event.at
      || (predecessor && epoch <= predecessorEpoch)) return false;
    if (index === 0) return event.from === null && event.to === "upload_reserved";
    try {
      return transitionDocumentVersion(
        { versionId: event.versionId, checksum: event.checksum, state: predecessor?.to ?? "upload_reserved" },
        { expectedVersionId: event.versionId, expectedChecksum: event.checksum, to: event.to },
      ).state === event.to;
    } catch {
      return false;
    }
  });
  return exactEvents && record.auditTrail.at(-1)?.to === record.snapshot.state;
}

function bindingIsExact(record: DocumentIntakePanelRecord): boolean {
  const { reservation, snapshot, retention } = record;
  if (reservation.versionId !== snapshot.versionId
    || retention.tenantId !== reservation.tenantId
    || retention.documentId !== reservation.documentId
    || retention.versionId !== snapshot.versionId
    || retention.objectKey !== reservation.objectKey
    || retention.state !== snapshot.state) return false;
  if (record.filePolicy?.decision === "eligible_for_scan"
    && (record.filePolicy.checksum !== snapshot.checksum
      || record.filePolicy.scannerPolicyVersion !== reservation.scannerPolicyVersion)) return false;
  return record.scanPolicy?.decision !== "release_allowed"
    || (record.scanPolicy.checksum === snapshot.checksum
      && record.scanPolicy.scannerPolicyVersion === reservation.scannerPolicyVersion);
}

function SecurityCheck({
  label,
  value,
  state,
}: Readonly<{ label: string; value: string; state: "pass" | "pending" | "blocked" }>) {
  const colors = state === "pass"
    ? { background: "var(--success-bg)", border: "var(--success-border)", text: "var(--success-text)" }
    : state === "blocked"
      ? { background: "var(--danger-bg)", border: "var(--danger-border)", text: "var(--danger-text)" }
      : { background: "var(--status-muted-bg)", border: "var(--status-muted-border)", text: "var(--status-muted-text)" };
  return (
    <div
      className="min-w-0 rounded-xl border p-3"
      data-security-check={label.toLowerCase().replaceAll(" ", "-")}
      data-check-state={state}
      style={{ background: colors.background, borderColor: colors.border }}
    >
      <dt className="section-label">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold" style={{ color: colors.text }}>{value}</dd>
    </div>
  );
}

function signatureStatus(decision: DocumentFilePolicyDecision | null) {
  if (!decision) return { state: "pending" as const, label: "Awaiting uploaded bytes" };
  if (decision.decision === "eligible_for_scan") {
    return { state: "pass" as const, label: "Signature and stored bytes verified" };
  }
  return { state: "blocked" as const, label: `Rejected · ${words(decision.reason)}` };
}

function dedupeStatus(record: DocumentIntakePanelRecord): string {
  if (record.completionKind === "duplicate") return "Tenant-local duplicate reused";
  if (record.completionKind === "replay" || record.intakeKind === "replay") return "Idempotent replay verified";
  if (record.completionKind === "quarantined") return "Unique version quarantined";
  return "Pending tenant-local checksum check";
}

function scanStatus(record: DocumentIntakePanelRecord) {
  if (record.scanPolicy?.decision === "release_allowed") {
    return { state: "pass" as const, label: "Clean verdict · release allowed" };
  }
  if (record.scanPolicy?.decision === "release_denied") {
    return {
      state: "blocked" as const,
      label: `${words(record.scanPolicy.state)} · ${words(record.scanPolicy.reason)}`,
    };
  }
  if (record.snapshot.state === "scanning") return { state: "pending" as const, label: "Scan in progress" };
  return { state: "pending" as const, label: "Clean scanner verdict required" };
}

function retentionStatus(retention: DocumentRetentionDisposition) {
  return {
    state: retention.disposition === "retain" ? "pending" as const : "pass" as const,
    label: retention.disposition === "retain"
      ? `Retained · ${words(retention.reason)}`
      : `Purge eligible · ${words(retention.reason)}`,
  };
}

function EmptyDocumentIntake({ onSelect }: Readonly<{ onSelect?: () => void }>) {
  return (
    <div data-document-intake-state="empty">
      <AsyncState
        variant="empty"
        title="No document selected"
        description="Choose an approved file to begin an authenticated, private upload reservation. File bytes stay outside this panel."
        action={onSelect ? (
          <button
            type="button"
            className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
            data-document-action="select"
            onClick={onSelect}
          >
            Select a document
          </button>
        ) : undefined}
      />
    </div>
  );
}

function InvalidChronology() {
  return (
    <section
      className="rounded-2xl border p-5 sm:p-6"
      role="alert"
      data-document-intake-state="invalid-chronology"
      data-chronology-valid="false"
      style={{ background: "var(--danger-bg)", borderColor: "var(--danger-border)" }}
    >
      <p className="section-label">Document intake · Verification blocked</p>
      <h2 className="mt-2 text-lg font-semibold" style={{ color: "var(--danger-text)" }}>
        Audit chronology could not be verified
      </h2>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        This view will not expose upload or retry controls until every event binds to the exact version, checksum, sequence, and current lifecycle state.
      </p>
    </section>
  );
}

function ReadyDocumentIntake({
  record,
  onUpload,
  onReviewRetry,
}: Readonly<{
  record: DocumentIntakePanelRecord;
  onUpload?: (reservation: DocumentUploadReservationRecord) => void;
  onReviewRetry?: (snapshot: DocumentVersionSnapshot) => void;
}>) {
  if (!bindingIsExact(record) || !chronologyIsExact(record)) return <InvalidChronology />;

  const signature = signatureStatus(record.filePolicy);
  const scan = scanStatus(record);
  const retention = retentionStatus(record.retention);
  const uploadAllowed = record.snapshot.state === "upload_reserved" && Boolean(onUpload);
  const retryReviewAllowed = REVIEWABLE_RETRY_STATES.has(record.snapshot.state) && Boolean(onReviewRetry);

  return (
    <section
      className="space-y-4"
      aria-labelledby="document-intake-panel-title"
      data-surface="document-intake-panel"
      data-document-intake-state={record.snapshot.state}
      data-chronology-valid="true"
    >
      <header className="glass-heavy rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">Knowledge · Secure intake</p>
            <h2 id="document-intake-panel-title" className="mt-2 break-words text-2xl font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              {record.reservation.fileName}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Authenticated tenant scope, private storage, and quarantine remain enforced before extraction can begin.
            </p>
          </div>
          <div
            className="self-start rounded-xl border px-3 py-2"
            aria-label={`Document status: ${STATE_LABEL[record.snapshot.state]}`}
            style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}
          >
            <p className="section-label">Current state</p>
            <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{STATE_LABEL[record.snapshot.state]}</p>
          </div>
        </div>

        <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Format</dt>
            <dd className="mt-1 text-sm font-semibold uppercase" style={{ color: "var(--text-primary)" }}>{record.reservation.format}</dd>
          </div>
          <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Declared size</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatBytes(record.reservation.declaredByteSize)}</dd>
          </div>
          <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Format limit</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>{formatBytes(record.reservation.maxBytes)}</dd>
          </div>
          <div className="min-w-0 rounded-xl border p-3" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)" }}>
            <dt className="section-label">Scanner policy</dt>
            <dd className="mt-1 break-all font-mono text-xs" style={{ color: "var(--text-primary)" }}>{record.reservation.scannerPolicyVersion}</dd>
          </div>
        </dl>
      </header>

      <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="document-security-title">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="section-label">Fail-closed controls</p>
            <h3 id="document-security-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Intake security checks</h3>
          </div>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>No file content or signed URL is shown.</p>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <SecurityCheck label="Private storage" value={`${record.storageVisibility} tenant object`} state="pass" />
          <SecurityCheck label="File signature" value={signature.label} state={signature.state} />
          <SecurityCheck label="Tenant dedupe" value={dedupeStatus(record)} state={record.completionKind ? "pass" : "pending"} />
          <SecurityCheck label="Quarantine" value={record.snapshot.state === "upload_reserved" ? "Required after upload" : "Lifecycle gate recorded"} state={record.snapshot.state === "upload_reserved" ? "pending" : "pass"} />
          <SecurityCheck label="Malware scan" value={scan.label} state={scan.state} />
          <SecurityCheck label="Retention" value={retention.label} state={retention.state} />
        </dl>

        <div className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--surface-info-border)", background: "var(--accent-light)" }}>
          <p className="section-label">Launch policy</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            PDF, DOCX, XLSX, CSV, TXT, Markdown, JPEG, and PNG are approved. Documents are limited to 50 MB; images to 20 MB. Extension, media type, byte size, stored metadata, and file signature must agree. Active or encrypted content is rejected.
          </p>
        </div>
      </section>

      <section className="glass rounded-2xl p-4 sm:p-5" aria-labelledby="document-audit-title">
        <p className="section-label">Immutable activity</p>
        <h3 id="document-audit-title" className="mt-1 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Exact audit chronology</h3>
        <ol className="mt-4 space-y-3" aria-label="Document intake audit chronology">
          {record.auditTrail.map((event) => (
            <li
              key={event.sequence}
              className="grid min-w-0 gap-3 rounded-xl border p-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-start"
              data-audit-sequence={event.sequence}
              style={{ background: "var(--surface-muted)", borderColor: "var(--table-row-border)" }}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold tabular-nums" aria-hidden="true" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-secondary)" }}>
                {event.sequence}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                  {event.from ? `${STATE_LABEL[event.from]} → ` : "Created as "}{STATE_LABEL[event.to]}
                </p>
                <p className="mt-1 break-words text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{event.reason}</p>
                <p className="mt-1 text-xs capitalize" style={{ color: "var(--text-tertiary)" }}>{event.actor}</p>
              </div>
              <time className="text-xs sm:text-right" dateTime={event.at} style={{ color: "var(--text-tertiary)" }}>
                {formatTimestamp(event.at)} UTC
              </time>
            </li>
          ))}
        </ol>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <p className="break-all rounded-lg border p-2 font-mono text-[0.65rem]" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-tertiary)" }}>Version: {record.snapshot.versionId}</p>
          <p className="break-all rounded-lg border p-2 font-mono text-[0.65rem]" style={{ borderColor: "var(--surface-card-border)", color: "var(--text-tertiary)" }}>SHA-256: {record.snapshot.checksum}</p>
        </div>
      </section>

      {uploadAllowed || retryReviewAllowed ? (
        <footer className="glass rounded-2xl p-4 sm:p-5">
          <p id="document-intake-actions-help" className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            These controls only request the next authorized step. This panel performs no upload, scan, retry, retention, or provider operation.
          </p>
          <div className="mt-3 flex flex-col justify-end gap-2 sm:flex-row">
            {uploadAllowed ? (
              <button
                type="button"
                className="btn-primary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                aria-describedby="document-intake-actions-help"
                data-document-action="upload"
                onClick={() => onUpload?.(record.reservation)}
              >
                Continue to private upload
              </button>
            ) : null}
            {retryReviewAllowed ? (
              <button
                type="button"
                className="btn-secondary min-h-11 w-full focus-visible:outline-2 focus-visible:outline-offset-2 sm:w-auto"
                aria-describedby="document-intake-actions-help"
                data-document-action="review-retry"
                onClick={() => onReviewRetry?.(record.snapshot)}
              >
                Review retry
              </button>
            ) : null}
          </div>
        </footer>
      ) : null}
    </section>
  );
}

export function DocumentIntakePanel(props: DocumentIntakePanelProps) {
  if (props.state === "loading") {
    return (
      <div data-document-intake-state="loading">
        <AsyncState
          variant="loading"
          title="Loading secure document intake"
          description="Verifying the exact tenant, version, quarantine, scan, and retention records."
        />
      </div>
    );
  }
  if (props.state === "error") {
    return (
      <div data-document-intake-state="error">
        <AsyncState
          variant="error"
          title="Document intake unavailable"
          description={props.error}
        />
      </div>
    );
  }
  if (!props.record) return <EmptyDocumentIntake onSelect={props.onSelect} />;
  return <ReadyDocumentIntake record={props.record} onUpload={props.onUpload} onReviewRetry={props.onReviewRetry} />;
}
