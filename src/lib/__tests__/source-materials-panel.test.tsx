import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  SourceMaterialsPanel,
  type SourceMaterialItem,
} from "@/components/knowledge/source-materials-panel";
import type { DocumentLifecycleState } from "@/lib/documents/state-machine";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "30000000-0000-4000-8000-000000000001";
const VERSION_ID = "40000000-0000-4000-8000-000000000001";
const CHECKSUM = "a".repeat(64);
const OBJECT_KEY = `tenants/${TENANT_ID}/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/original`;
const sha = (character: string): `sha256:${string}` => `sha256:${character.repeat(64)}`;
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function material(state: DocumentLifecycleState = "ready", reviewRequired = true): SourceMaterialItem {
  return {
    intake: {
      reservation: {
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        documentId: DOCUMENT_ID,
        versionId: VERSION_ID,
        idempotencyKey: "source-material:fixture",
        sourceIdentity: `tenant_upload:${DOCUMENT_ID}`,
        requestFingerprint: "b".repeat(64),
        fileName: "market-brief.csv",
        format: "csv",
        mediaType: "text/csv",
        declaredByteSize: 1024,
        maxBytes: 50 * 1024 * 1024,
        scannerPolicyVersion: "launch-v1",
        objectKey: OBJECT_KEY,
        state: "upload_reserved",
      },
      snapshot: { versionId: VERSION_ID, checksum: CHECKSUM, state },
      storageVisibility: "private",
      intakeKind: "created",
      completionKind: state === "upload_reserved" ? null : "quarantined",
      scanDispatch: state === "upload_reserved" ? null : "accepted",
      filePolicy: null,
      scanPolicy: null,
      retention: {
        contractVersion: 1,
        disposition: "retain",
        reason: "current_version",
        tenantId: TENANT_ID,
        documentId: DOCUMENT_ID,
        versionId: VERSION_ID,
        objectKey: OBJECT_KEY,
        state,
        isCurrentVersion: true,
        policyVersion: "document-retention-v1",
        evaluatedAt: "2026-08-30T12:00:00.000Z",
        retentionExpiresAt: "2027-08-30T12:00:00.000Z",
        idempotencyKey: "retention:source-material",
        inputSha256: sha("c"),
      },
      auditTrail: [],
    },
    extraction: state === "ready" ? {
      artifactVersion: 1,
      binding: {
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        documentId: DOCUMENT_ID,
        documentVersionId: VERSION_ID,
        checksum: CHECKSUM,
        scannerPolicyVersion: "launch-v1",
        format: "csv",
        mediaType: "text/csv",
        parserId: "csv",
        parserVersion: "1.0.0",
        chunkingAlgorithmVersion: "structural-v1",
        maxChunkUtf8Bytes: 4096,
        maxBlocksPerChunk: 8,
        documentIdentityHash: sha("d"),
        versionIdentityHash: sha("e"),
        parserIdentityHash: sha("f"),
        inputHash: sha("1"),
      },
      status: reviewRequired ? "review_required" : "complete",
      warnings: reviewRequired ? ["One table needs human confirmation."] : [],
      quality: { score: reviewRequired ? 78 : 96, reviewRequired },
      blocks: [{
        kind: "paragraph",
        ordinal: 0,
        text: "Render-safe source summary.",
        contentHash: sha("2"),
        sourceLocator: { kind: "line_range", label: "Page 1", startLine: 1, endLine: 1 },
      }],
      tables: [],
      chunks: [],
    } : null,
  };
}

describe("SourceMaterialsPanel", () => {
  it("renders exact scope plus intake, quarantine, scan, extraction, review, and retention summaries", () => {
    const html = renderToStaticMarkup(<SourceMaterialsPanel state="ready" scope={SCOPE} materials={[material()]} />);

    expect(html).toContain('data-surface="source-materials-panel"');
    expect(html).toContain('aria-label="Exact source-material scope"');
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
    expect(html).toContain("market-brief.csv");
    expect(html).toContain("CSV · text/csv");
    expect(html).toContain("Ready");
    expect(html).toContain("Quarantine recorded");
    expect(html).toContain("Clean verdict");
    expect(html).toContain("Extracted · review required");
    expect(html).toContain("Human review required");
    expect(html).toContain("Retained · current version");
    expect(html).toContain("Extraction quality 78/100 · 1 normalized block");
    expect(html).toContain("1 material · 1 review required");
    expect(html).not.toContain(OBJECT_KEY);
    expect(html).not.toContain(CHECKSUM);
  });

  it("shows explicit accessible loading, error, empty, and defensive empty states", () => {
    const loading = renderToStaticMarkup(<SourceMaterialsPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading source materials");

    const error = renderToStaticMarkup(<SourceMaterialsPanel state="error" error="Portfolio snapshot unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Source materials unavailable");
    expect(error).toContain("Portfolio snapshot unavailable.");

    const empty = renderToStaticMarkup(<SourceMaterialsPanel state="empty" />);
    const defensiveEmpty = renderToStaticMarkup(<SourceMaterialsPanel state="ready" scope={SCOPE} materials={[]} />);
    expect(empty).toContain("No source materials yet");
    expect(defensiveEmpty).toContain("No source materials yet");
  });

  it("renders only supplied callbacks allowed by canonical lifecycle and review state", () => {
    const ready = material("ready", true);
    const complete = material("ready", false);
    const scanning = material("scanning");
    const html = renderToStaticMarkup(
      <SourceMaterialsPanel
        state="ready"
        scope={SCOPE}
        materials={[
          ready,
          { ...complete, intake: { ...complete.intake, reservation: { ...complete.intake.reservation, documentId: "30000000-0000-4000-8000-000000000002" }, retention: { ...complete.intake.retention, documentId: "30000000-0000-4000-8000-000000000002" } }, extraction: complete.extraction ? { ...complete.extraction, binding: { ...complete.extraction.binding, documentId: "30000000-0000-4000-8000-000000000002" } } : null },
          { ...scanning, intake: { ...scanning.intake, reservation: { ...scanning.intake.reservation, documentId: "30000000-0000-4000-8000-000000000003" }, retention: { ...scanning.intake.retention, documentId: "30000000-0000-4000-8000-000000000003" } } },
        ]}
        onOpen={() => undefined}
        onReview={() => undefined}
      />,
    );

    expect(html.match(/data-source-material-action="open"/g)).toHaveLength(2);
    expect(html.match(/data-source-material-action="review"/g)).toHaveLength(1);
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toContain("focus-visible:outline-2");
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const readOnly = renderToStaticMarkup(<SourceMaterialsPanel state="ready" scope={SCOPE} materials={[ready]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("fails closed without enumerating mismatched tenant, workspace, or extraction bindings", () => {
    const tenantMismatch = material();
    const wrongTenant = { ...tenantMismatch, intake: { ...tenantMismatch.intake, reservation: { ...tenantMismatch.intake.reservation, tenantId: "10000000-0000-4000-8000-000000000099" } } };
    const extractionMismatch = material();
    const wrongExtraction = { ...extractionMismatch, extraction: extractionMismatch.extraction ? { ...extractionMismatch.extraction, binding: { ...extractionMismatch.extraction.binding, documentVersionId: "40000000-0000-4000-8000-000000000099" } } : null };
    const scanning = material("scanning");
    const prematureExtraction = { ...scanning, extraction: material().extraction };

    for (const item of [wrongTenant, wrongExtraction, prematureExtraction]) {
      const html = renderToStaticMarkup(<SourceMaterialsPanel state="ready" scope={SCOPE} materials={[item]} onOpen={() => undefined} onReview={() => undefined} />);
      expect(html).toContain("The source-material scope or document bindings could not be verified.");
      expect(html).not.toContain("market-brief.csv");
      expect(html).not.toMatch(/<button\b/u);
    }
  });

  it("keeps one ordered heading hierarchy and a responsive, break-safe list", () => {
    const html = renderToStaticMarkup(<SourceMaterialsPanel state="ready" scope={SCOPE} materials={[material()]} />);
    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="source-materials-title"');
    expect(html).toContain("2xl:grid-cols-2");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("break-all");
  });
});
