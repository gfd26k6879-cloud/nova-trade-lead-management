import { describe, expect, it } from "vitest";

import {
  executeQuarantineScan,
  reserveDocumentUpload,
  type DocumentStorageAdapter,
  type MalwareScannerAdapter,
  type QuarantinedDocumentVersion,
} from "@/lib/documents";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const CHECKSUM = "a".repeat(64);
const OBJECT_KEY = `tenants/${TENANT_ID}/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/original`;

const quarantinedVersion: QuarantinedDocumentVersion = {
  tenantId: TENANT_ID,
  documentId: DOCUMENT_ID,
  versionId: VERSION_ID,
  checksum: CHECKSUM,
  state: "quarantined",
  objectKey: OBJECT_KEY,
};

const cleanScannerResult = {
  verdict: "clean",
  scannerAdapterId: "scanner-test",
  scannerVersion: "1.2.3",
  scannedChecksum: CHECKSUM,
  scannedAt: new Date().toISOString(),
  policyVersion: "launch-v1",
} as const;

describe("document storage adapter boundary", () => {
  it("accepts only a private, exact-key, short-lived upload capability", async () => {
    const adapter: DocumentStorageAdapter = {
      reserveUpload: async (request) => ({
        objectKey: request.objectKey,
        uploadUrl: "https://private-storage.example/upload?signature=test",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        visibility: "private",
      }),
    };

    await expect(
      reserveDocumentUpload(
        {
          tenantId: TENANT_ID,
          documentId: DOCUMENT_ID,
          versionId: VERSION_ID,
          fileName: "product-sheet.pdf",
          declaredMediaType: "application/pdf",
          declaredByteSize: 1024,
        },
        adapter,
      ),
    ).resolves.toMatchObject({ objectKey: OBJECT_KEY, visibility: "private" });
  });

  it.each([
    {
      label: "public capability",
      response: {
        objectKey: OBJECT_KEY,
        uploadUrl: "https://storage.example/public-upload",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        visibility: "public",
      },
    },
    {
      label: "caller-selected key",
      response: {
        objectKey: `tenants/other/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/original`,
        uploadUrl: "https://storage.example/upload",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        visibility: "private",
      },
    },
    {
      label: "long-lived capability",
      response: {
        objectKey: OBJECT_KEY,
        uploadUrl: "https://storage.example/upload",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        visibility: "private",
      },
    },
  ])("fails closed when storage returns a $label", async ({ response }) => {
    const adapter: DocumentStorageAdapter = { reserveUpload: async () => response };

    await expect(
      reserveDocumentUpload(
        {
          tenantId: TENANT_ID,
          documentId: DOCUMENT_ID,
          versionId: VERSION_ID,
          fileName: "product-sheet.pdf",
          declaredMediaType: "application/pdf",
          declaredByteSize: 1024,
        },
        adapter,
      ),
    ).rejects.toMatchObject({ code: "storage_boundary_error" });
  });

  it("rejects an HTTPS upload capability containing userinfo credentials", async () => {
    const adapter: DocumentStorageAdapter = {
      reserveUpload: async () => ({
        objectKey: OBJECT_KEY,
        uploadUrl: "https://user:password@storage.example/upload",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        visibility: "private",
      }),
    };

    await expect(reserveDocumentUpload({
      tenantId: TENANT_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      fileName: "product-sheet.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: 1024,
    }, adapter)).rejects.toMatchObject({ code: "storage_boundary_error" });
  });

  it("rejects accessor and proxy storage responses without evaluating them", async () => {
    let reads = 0;
    const accessorResponse = {
      objectKey: OBJECT_KEY,
      get uploadUrl() {
        reads += 1;
        throw new Error("storage getter");
      },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      visibility: "private",
    };
    const proxyResponse = new Proxy({}, {
      ownKeys() {
        throw new Error("storage proxy");
      },
    });
    const input = {
      tenantId: TENANT_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      fileName: "product-sheet.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: 1024,
    };

    await expect(reserveDocumentUpload(input, { reserveUpload: async () => accessorResponse }))
      .rejects.toMatchObject({ code: "storage_boundary_error" });
    await expect(reserveDocumentUpload(input, { reserveUpload: async () => proxyResponse }))
      .rejects.toMatchObject({ code: "storage_boundary_error" });
    expect(reads).toBe(0);
  });
});

describe("malware scanner adapter boundary", () => {
  it("accepts clean only when checksum and active policy are bound to this version", async () => {
    const adapter: MalwareScannerAdapter = { scan: async () => cleanScannerResult };

    await expect(
      executeQuarantineScan(quarantinedVersion, "launch-v1", adapter),
    ).resolves.toMatchObject({
      version: { state: "clean", versionId: VERSION_ID, checksum: CHECKSUM },
      scan: cleanScannerResult,
    });
  });

  it.each([
    {
      label: "checksum from replaced bytes",
      result: { ...cleanScannerResult, scannedChecksum: "b".repeat(64) },
      reasonCode: "checksum_mismatch",
    },
    {
      label: "stale policy verdict",
      result: { ...cleanScannerResult, policyVersion: "launch-v0" },
      reasonCode: "policy_mismatch",
    },
    {
      label: "malformed clean verdict",
      result: { verdict: "clean" },
      reasonCode: "malformed_verdict",
    },
  ])("maps a $label to scanner_error instead of clean", async ({ result, reasonCode }) => {
    const adapter: MalwareScannerAdapter = { scan: async () => result };

    await expect(
      executeQuarantineScan(quarantinedVersion, "launch-v1", adapter),
    ).resolves.toMatchObject({
      version: { state: "scanner_error" },
      scan: { verdict: "error", reasonCode },
    });
  });

  it("maps scanner exceptions to scanner_error instead of misleading success", async () => {
    const adapter: MalwareScannerAdapter = {
      scan: async () => {
        throw new Error("provider timeout");
      },
    };

    await expect(
      executeQuarantineScan(quarantinedVersion, "launch-v1", adapter),
    ).resolves.toMatchObject({
      version: { state: "scanner_error" },
      scan: { verdict: "error", reasonCode: "adapter_error", retryable: true },
    });
  });

  it("maps accessor and proxy scanner responses to scanner_error without evaluating them", async () => {
    let reads = 0;
    const accessorObservation = {
      get verdict() {
        reads += 1;
        throw new Error("scanner getter");
      },
      scannerAdapterId: "scanner-test",
      scannerVersion: "1.2.3",
      scannedChecksum: CHECKSUM,
      scannedAt: new Date().toISOString(),
      policyVersion: "launch-v1",
    };
    const proxyObservation = new Proxy({}, {
      ownKeys() {
        throw new Error("scanner proxy");
      },
    });

    await expect(executeQuarantineScan(quarantinedVersion, "launch-v1", {
      scan: async () => accessorObservation,
    })).resolves.toMatchObject({
      version: { state: "scanner_error" },
      scan: { verdict: "error", reasonCode: "malformed_verdict" },
    });
    await expect(executeQuarantineScan(quarantinedVersion, "launch-v1", {
      scan: async () => proxyObservation,
    })).resolves.toMatchObject({
      version: { state: "scanner_error" },
      scan: { verdict: "error", reasonCode: "malformed_verdict" },
    });
    expect(reads).toBe(0);
  });

  it("maps an infected verdict to infected without exposing a clean state", async () => {
    const adapter: MalwareScannerAdapter = {
      scan: async () => ({ ...cleanScannerResult, verdict: "infected", reasonCode: "malware_detected" }),
    };

    await expect(
      executeQuarantineScan(quarantinedVersion, "launch-v1", adapter),
    ).resolves.toMatchObject({
      version: { state: "infected" },
      scan: { verdict: "infected", reasonCode: "malware_detected" },
    });
  });

  it("never accepts an empty checksum or far-future clean verdict", async () => {
    const emptyChecksumVersion = { ...quarantinedVersion, checksum: "" };
    const emptyAdapter: MalwareScannerAdapter = {
      scan: async () => ({ ...cleanScannerResult, scannedChecksum: "" }),
    };
    const futureAdapter: MalwareScannerAdapter = {
      scan: async () => ({ ...cleanScannerResult, scannedAt: "2100-01-01T00:00:00.000Z" }),
    };

    await expect(executeQuarantineScan(emptyChecksumVersion, "launch-v1", emptyAdapter)).resolves.toMatchObject({
      version: { state: "scanner_error" },
      scan: { verdict: "error", reasonCode: "malformed_request" },
    });
    await expect(executeQuarantineScan(quarantinedVersion, "launch-v1", futureAdapter)).resolves.toMatchObject({
      version: { state: "scanner_error" },
      scan: { verdict: "error", reasonCode: "timestamp_invalid" },
    });
  });
});
