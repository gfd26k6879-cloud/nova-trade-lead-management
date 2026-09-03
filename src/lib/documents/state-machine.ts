import { DocumentIntakeError } from "./errors";

export const DOCUMENT_LIFECYCLE_STATES = [
  "upload_reserved",
  "quarantined",
  "scanning",
  "clean",
  "extracting",
  "ready",
  "infected",
  "scanner_error",
  "extraction_failed",
  "rejected",
  "expired",
  "deletion_pending",
  "deletion_failed",
  "deleted",
  "retained_for_incident",
] as const;

export type DocumentLifecycleState = (typeof DOCUMENT_LIFECYCLE_STATES)[number];

export type DocumentVersionSnapshot = Readonly<{
  versionId: string;
  checksum: string;
  state: DocumentLifecycleState;
}>;

export type DocumentTransitionRequest = Readonly<{
  to: DocumentLifecycleState;
  expectedVersionId: string;
  expectedChecksum: string;
}>;

export type DocumentIncidentHoldReleaseRequest = Readonly<{
  expectedVersionId: string;
  expectedChecksum: string;
  reasonCode: string;
  evidenceReference: string;
}>;

const INCIDENT_HOLD_REASON_CODE_REGEX = /^[a-z][a-z0-9_]{2,63}$/;
const INCIDENT_HOLD_EVIDENCE_REFERENCE_REGEX =
  /^[a-z][a-z0-9_-]{1,31}:[A-Za-z0-9][A-Za-z0-9:_-]{2,254}$/;

const ALLOWED_TRANSITIONS: Readonly<Record<DocumentLifecycleState, ReadonlySet<DocumentLifecycleState>>> = {
  upload_reserved: new Set(["quarantined", "rejected", "expired", "deletion_pending"]),
  quarantined: new Set(["scanning", "rejected", "deletion_pending"]),
  scanning: new Set(["clean", "infected", "scanner_error", "quarantined", "deletion_pending"]),
  clean: new Set(["extracting", "expired", "deletion_pending"]),
  extracting: new Set(["ready", "extraction_failed", "deletion_pending"]),
  ready: new Set(["expired", "deletion_pending"]),
  infected: new Set(["retained_for_incident", "deletion_pending"]),
  scanner_error: new Set(["quarantined", "rejected", "deletion_pending"]),
  extraction_failed: new Set(["extracting", "ready", "deletion_pending"]),
  rejected: new Set(["deletion_pending"]),
  expired: new Set(["retained_for_incident", "deletion_pending"]),
  deletion_pending: new Set(["deleted", "deletion_failed", "retained_for_incident"]),
  deletion_failed: new Set(["deletion_pending", "retained_for_incident"]),
  deleted: new Set(),
  retained_for_incident: new Set(),
};

function assertCurrentVersion(
  snapshot: DocumentVersionSnapshot,
  expectedVersionId: string,
  expectedChecksum: string,
): void {
  if (snapshot.versionId !== expectedVersionId) {
    throw new DocumentIntakeError("stale_version", "The lifecycle command targets a stale version.");
  }
  if (snapshot.checksum !== expectedChecksum) {
    throw new DocumentIntakeError(
      "stale_checksum",
      "The lifecycle command targets bytes that no longer match this version.",
    );
  }
}

export function transitionDocumentVersion(
  snapshot: DocumentVersionSnapshot,
  request: DocumentTransitionRequest,
): DocumentVersionSnapshot {
  assertCurrentVersion(snapshot, request.expectedVersionId, request.expectedChecksum);

  if (snapshot.state === request.to) return snapshot;
  if (!ALLOWED_TRANSITIONS[snapshot.state].has(request.to)) {
    throw new DocumentIntakeError(
      "illegal_transition",
      `Document lifecycle cannot transition from ${snapshot.state} to ${request.to}.`,
    );
  }

  return { ...snapshot, state: request.to };
}

export function requestDocumentDeletion(
  snapshot: DocumentVersionSnapshot,
  expected: Readonly<{ expectedVersionId: string; expectedChecksum: string }>,
): DocumentVersionSnapshot {
  assertCurrentVersion(snapshot, expected.expectedVersionId, expected.expectedChecksum);
  if (snapshot.state === "retained_for_incident") {
    throw new DocumentIntakeError(
      "incident_hold_active",
      "An incident-held document cannot be deleted until the hold is released.",
    );
  }
  return transitionDocumentVersion(snapshot, { ...expected, to: "deletion_pending" });
}

export function releaseDocumentIncidentHold(
  snapshot: DocumentVersionSnapshot,
  request: DocumentIncidentHoldReleaseRequest,
): DocumentVersionSnapshot {
  assertCurrentVersion(snapshot, request.expectedVersionId, request.expectedChecksum);
  if (snapshot.state !== "retained_for_incident") {
    throw new DocumentIntakeError(
      "illegal_transition",
      "Only an incident-held document can have its hold released.",
    );
  }
  if (
    typeof request.reasonCode !== "string" ||
    !INCIDENT_HOLD_REASON_CODE_REGEX.test(request.reasonCode) ||
    typeof request.evidenceReference !== "string" ||
    !INCIDENT_HOLD_EVIDENCE_REFERENCE_REGEX.test(request.evidenceReference)
  ) {
    throw new DocumentIntakeError(
      "incident_hold_active",
      "An incident hold remains active without reason-coded release evidence.",
    );
  }
  return { ...snapshot, state: "deletion_pending" };
}
