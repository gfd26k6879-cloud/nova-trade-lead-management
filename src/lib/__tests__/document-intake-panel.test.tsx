import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DocumentIntakePanel,
  type DocumentIntakePanelRecord,
} from "@/components/knowledge/document-intake-panel";
import type { DocumentLifecycleState } from "@/lib/documents/state-machine";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const DOCUMENT = "30000000-0000-4000-8000-000000000001";
const VERSION = "40000000-0000-4000-8000-000000000001";
const CHECKSUM = "a".repeat(64);
const OBJECT_KEY = `tenants/${TENANT}/documents/${DOCUMENT}/versions/${VERSION}/original`;

function record(state: DocumentLifecycleState = "ready"): DocumentIntakePanelRecord {
  const states: readonly DocumentLifecycleState[] = state === "upload_reserved"
    ? ["upload_reserved"]
    : state === "scanner_error"
      ? ["upload_reserved", "quarantined", "scanning", "scanner_error"]
      : ["upload_reserved", "quarantined", "scanning", "clean", "extracting", "ready"];
  return {
    reservation: {
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      versionId: VERSION,
      idempotencyKey: "document:intake:fixture",
      sourceIdentity: `tenant_upload:${DOCUMENT}`,
      requestFingerprint: "b".repeat(64),
      fileName: "market-brief.pdf",
      format: "pdf",
      mediaType: "application/pdf",
      declaredByteSize: 2 * 1024 * 1024,
      maxBytes: 50 * 1024 * 1024,
      scannerPolicyVersion: "launch-v1",
      objectKey: OBJECT_KEY,
      state: "upload_reserved",
    },
    snapshot: { versionId: VERSION, checksum: CHECKSUM, state },
    storageVisibility: "private",
    intakeKind: "created",
    completionKind: state === "upload_reserved" ? null : "quarantined",
    scanDispatch: state === "upload_reserved" ? null : "accepted",
    filePolicy: state === "upload_reserved" ? null : {
      decision: "eligible_for_scan",
      state: "quarantined",
      format: "pdf",
      mediaType: "application/pdf",
      byteSize: 2 * 1024 * 1024,
      maxBytes: 50 * 1024 * 1024,
      checksum: CHECKSUM,
      checksumAlgorithm: "sha256",
      scannerPolicyVersion: "launch-v1",
      scanRequired: true,
      releaseAllowed: false,
    },
    scanPolicy: state === "ready" ? {
      decision: "release_allowed",
      state: "clean",
      releaseAllowed: true,
      retryScheduled: false,
      checksum: CHECKSUM,
      scannerPolicyVersion: "launch-v1",
    } : state === "scanner_error" ? {
      decision: "release_denied",
      state: "scanner_error",
      reason: "scanner_reported_error",
      releaseAllowed: false,
      retryScheduled: true,
    } : null,
    retention: {
      contractVersion: 1,
      disposition: "retain",
      reason: "current_version",
      tenantId: TENANT,
      documentId: DOCUMENT,
      versionId: VERSION,
      objectKey: OBJECT_KEY,
      state,
      isCurrentVersion: true,
      policyVersion: "document-retention-v1",
      evaluatedAt: "2026-08-30T12:10:00.000Z",
      retentionExpiresAt: "2027-08-30T12:10:00.000Z",
      idempotencyKey: "retention:fixture:document",
      inputSha256: `sha256:${"c".repeat(64)}`,
    },
    auditTrail: states.map((to, index) => ({
      sequence: index + 1,
      at: `2026-08-30T12:0${index}:00.000Z`,
      actor: index === 0 ? "member" : "worker",
      from: index === 0 ? null : states[index - 1] ?? null,
      to,
      versionId: VERSION,
      checksum: CHECKSUM,
      reason: `Recorded exact ${to.replaceAll("_", " ")} transition.`,
    })),
  };
}

describe("DocumentIntakePanel", () => {
  it("renders the secure intake policy, private quarantine path, scan verdict, retention, and exact chronology", () => {
    const html = renderToStaticMarkup(<DocumentIntakePanel state="ready" record={record()} />);

    expect(html).toContain('data-surface="document-intake-panel"');
    expect(html).toContain('data-document-intake-state="ready"');
    expect(html).toContain('data-chronology-valid="true"');
    expect(html).toContain("market-brief.pdf");
    expect(html).toContain("PDF, DOCX, XLSX, CSV, TXT, Markdown, JPEG, and PNG");
    expect(html).toContain("Documents are limited to 50 MB; images to 20 MB");
    expect(html).toContain("Signature and stored bytes verified");
    expect(html).toContain("Unique version quarantined");
    expect(html).toContain("private tenant object");
    expect(html).toContain("Clean verdict · release allowed");
    expect(html).toContain("Retained · current version");
    expect(html).toContain('aria-label="Document intake audit chronology"');
    expect(html.match(/data-audit-sequence=/g)).toHaveLength(6);
    expect(html.indexOf("Created as Upload reserved")).toBeLessThan(html.indexOf("Upload reserved → Quarantined"));
    expect(html.indexOf("Scanning → Clean")).toBeLessThan(html.indexOf("Extracting → Ready for review"));
    expect(html).toContain(`Version: ${VERSION}`);
    expect(html).toContain(`SHA-256: ${CHECKSUM}`);
    expect(html).not.toContain(OBJECT_KEY);
    expect(html).not.toContain("uploadUrl");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("offers only the state-authorized select, private-upload, and retry-review callbacks", () => {
    const empty = renderToStaticMarkup(
      <DocumentIntakePanel state="ready" record={null} onSelect={() => undefined} onUpload={() => undefined} onReviewRetry={() => undefined} />,
    );
    expect(empty).toContain('data-document-action="select"');
    expect(empty.match(/<button\b/g)).toHaveLength(1);

    const reserved = renderToStaticMarkup(
      <DocumentIntakePanel state="ready" record={record("upload_reserved")} onSelect={() => undefined} onUpload={() => undefined} onReviewRetry={() => undefined} />,
    );
    expect(reserved).toContain('data-document-action="upload"');
    expect(reserved).toContain("Continue to private upload");
    expect(reserved).not.toContain('data-document-action="select"');
    expect(reserved).not.toContain('data-document-action="review-retry"');

    const retry = renderToStaticMarkup(
      <DocumentIntakePanel state="ready" record={record("scanner_error")} onSelect={() => undefined} onUpload={() => undefined} onReviewRetry={() => undefined} />,
    );
    expect(retry).toContain('data-document-action="review-retry"');
    expect(retry).toContain("Review retry");
    expect(retry).not.toContain('data-document-action="upload"');
    expect(retry).not.toContain('data-document-action="select"');
    expect(`${empty}${reserved}${retry}`).toContain("focus-visible:outline-2");
    expect(`${empty}${reserved}${retry}`).not.toMatch(/<(?:form|input|textarea|select)\b/u);
    expect(`${reserved}${retry}`).toContain("performs no upload, scan, retry, retention, or provider operation");
  });

  it("fails closed and removes actions when audit chronology is not exact", () => {
    const current = record("scanner_error");
    const invalid = {
      ...current,
      auditTrail: current.auditTrail.map((event, index) => index === 1 ? { ...event, sequence: 9 } : event),
    };
    const html = renderToStaticMarkup(
      <DocumentIntakePanel state="ready" record={invalid} onUpload={() => undefined} onReviewRetry={() => undefined} />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('data-chronology-valid="false"');
    expect(html).toContain("Audit chronology could not be verified");
    expect(html).not.toMatch(/<button\b/u);
    expect(html).not.toContain("market-brief.pdf");

    const repeatedTime = {
      ...current,
      auditTrail: current.auditTrail.map((event, index) => index === 1
        ? { ...event, at: current.auditTrail[0]?.at ?? event.at }
        : event),
    };
    const repeatedTimeHtml = renderToStaticMarkup(
      <DocumentIntakePanel state="ready" record={repeatedTime} onReviewRetry={() => undefined} />,
    );
    expect(repeatedTimeHtml).toContain('data-chronology-valid="false"');
    expect(repeatedTimeHtml).not.toMatch(/<button\b/u);
  });

  it("renders explicit accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<DocumentIntakePanel state="loading" />);
    expect(loading).toContain('data-document-intake-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading secure document intake");

    const error = renderToStaticMarkup(
      <DocumentIntakePanel state="error" error="Exact intake ledger unavailable." />,
    );
    expect(error).toContain('data-document-intake-state="error"');
    expect(error).toContain('role="alert"');
    expect(error).toContain("Exact intake ledger unavailable.");

    const empty = renderToStaticMarkup(<DocumentIntakePanel state="ready" record={null} />);
    expect(empty).toContain('data-document-intake-state="empty"');
    expect(empty).toContain("No document selected");
    expect(`${loading}${error}${empty}`).not.toMatch(/<button\b/u);
  });
});
