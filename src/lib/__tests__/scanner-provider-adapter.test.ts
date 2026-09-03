import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ScannerProviderAdapter,
  type ScannerProviderCapability,
  type ScannerProviderScanRequest,
} from "@/lib/documents/scanner-provider-adapter";
import {
  executeQuarantineScan,
  type QuarantinedDocumentVersion,
  type ScannerRequest,
} from "@/lib/documents/adapters";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const OBJECT_KEY =
  `tenants/${TENANT_ID}/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/original`;
const CHECKSUM = "a".repeat(64);
const POLICY_VERSION = "launch-v1";
const SCANNER_ID = "approved-scanner";
const SCANNER_VERSION = "1.2.3";
const NOW = new Date("2026-08-29T12:00:00.000Z");
const SAFE_ERROR = "The scanner provider did not return a safe, exact verdict.";

const scannerRequest: ScannerRequest = {
  quarantineObject: {
    tenantId: TENANT_ID,
    documentId: DOCUMENT_ID,
    versionId: VERSION_ID,
    objectKey: OBJECT_KEY,
  },
  checksum: CHECKSUM,
  policyVersion: POLICY_VERSION,
};

const quarantinedVersion: QuarantinedDocumentVersion = {
  ...scannerRequest.quarantineObject,
  checksum: CHECKSUM,
  state: "quarantined",
};

function providerResponse(
  request: ScannerProviderScanRequest,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    data: {
      quarantineObject: request.quarantineObject,
      verdict: "clean",
      scannerAdapterId: request.scannerAdapterId,
      scannerVersion: request.scannerVersion,
      scannedChecksum: request.checksum,
      scannedAt: NOW.toISOString(),
      policyVersion: request.policyVersion,
      ...overrides,
    },
    error: null,
  };
}

function providerWith(
  scanQuarantinedObject: (request: ScannerProviderScanRequest) => Promise<unknown>,
) {
  const scan = vi.fn(scanQuarantinedObject);
  const grant = vi.fn();
  const list = vi.fn();
  const readRawContent = vi.fn();
  const provider: ScannerProviderCapability = {
    scanQuarantinedObject: scan,
    ...({ grant, list, readRawContent } as object),
  };
  return { provider, grant, list, readRawContent, scan };
}

function adapterFor(provider: ScannerProviderCapability, enabled: boolean) {
  return new ScannerProviderAdapter(provider, {
    enabled,
    approvedScannerId: SCANNER_ID,
    approvedScannerVersion: SCANNER_VERSION,
    approvedPolicyVersion: POLICY_VERSION,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ScannerProviderAdapter", () => {
  it("is disabled unless explicitly enabled and maps safely through executeQuarantineScan", async () => {
    const provider = providerWith(async (request) => providerResponse(request));
    const adapter = adapterFor(provider.provider, false);

    await expect(executeQuarantineScan(quarantinedVersion, POLICY_VERSION, adapter)).resolves.toMatchObject({
      version: { state: "scanner_error" },
      scan: {
        verdict: "error",
        scannerAdapterId: SCANNER_ID,
        scannerVersion: SCANNER_VERSION,
        reasonCode: "scanner_disabled",
        retryable: false,
      },
    });
    expect(provider.scan).not.toHaveBeenCalled();
  });

  it("sends only the exact quarantine identity and returns a normalized clean observation", async () => {
    const provider = providerWith(async (request) => providerResponse(request));
    const adapter = adapterFor(provider.provider, true);

    await expect(executeQuarantineScan(quarantinedVersion, POLICY_VERSION, adapter)).resolves.toMatchObject({
      version: { state: "clean" },
      scan: {
        verdict: "clean",
        scannerAdapterId: SCANNER_ID,
        scannerVersion: SCANNER_VERSION,
        scannedChecksum: CHECKSUM,
        policyVersion: POLICY_VERSION,
      },
    });
    expect(provider.scan).toHaveBeenCalledWith({
      quarantineObject: scannerRequest.quarantineObject,
      checksum: CHECKSUM,
      policyVersion: POLICY_VERSION,
      scannerAdapterId: SCANNER_ID,
      scannerVersion: SCANNER_VERSION,
    });
    expect(Object.keys(provider.scan.mock.calls[0]?.[0] ?? {}).sort()).toEqual([
      "checksum",
      "policyVersion",
      "quarantineObject",
      "scannerAdapterId",
      "scannerVersion",
    ]);
    expect(provider.grant).not.toHaveBeenCalled();
    expect(provider.list).not.toHaveBeenCalled();
    expect(provider.readRawContent).not.toHaveBeenCalled();
  });

  it.each([
    ["infected", "malware_detected", false],
    ["error", "provider_timeout", true],
  ] as const)("normalizes an allowlisted %s verdict", async (verdict, reasonCode, retryable) => {
    const provider = providerWith(async (request) => providerResponse(request, {
      verdict,
      reasonCode,
      retryable,
    }));
    const adapter = adapterFor(provider.provider, true);

    await expect(executeQuarantineScan(quarantinedVersion, POLICY_VERSION, adapter)).resolves.toMatchObject({
      version: { state: verdict === "infected" ? "infected" : "scanner_error" },
      scan: { verdict, reasonCode, retryable },
    });
  });

  it("rejects an inactive policy without contacting the provider", async () => {
    const provider = providerWith(async (request) => providerResponse(request));
    const adapter = adapterFor(provider.provider, true);

    await expect(adapter.scan({ ...scannerRequest, policyVersion: "launch-v0" })).resolves.toMatchObject({
      verdict: "error",
      policyVersion: "launch-v0",
      reasonCode: "scanner_policy_inactive",
      retryable: false,
    });
    expect(provider.scan).not.toHaveBeenCalled();
  });

  it.each([
    ["traversal key", {
      ...scannerRequest,
      quarantineObject: { ...scannerRequest.quarantineObject, objectKey: `${OBJECT_KEY}/../other` },
    }],
    ["cross-tenant key", {
      ...scannerRequest,
      quarantineObject: {
        ...scannerRequest.quarantineObject,
        objectKey: OBJECT_KEY.replace(TENANT_ID, "44444444-4444-4444-8444-444444444444"),
      },
    }],
    ["uppercase checksum", { ...scannerRequest, checksum: CHECKSUM.toUpperCase() }],
    ["proxied request", new Proxy(scannerRequest, {})],
  ])("rejects a malformed %s before provider access", async (_label, request) => {
    const provider = providerWith(async (candidate) => providerResponse(candidate));
    const adapter = adapterFor(provider.provider, true);

    await expect(adapter.scan(request as ScannerRequest)).rejects.toThrowError(SAFE_ERROR);
    expect(provider.scan).not.toHaveBeenCalled();
  });

  it.each([
    ["plausible data beside provider error", (request: ScannerProviderScanRequest) => ({
      ...(providerResponse(request) as Record<string, unknown>),
      error: { message: "secret provider payload" },
    })],
    ["wrong tenant binding", (request: ScannerProviderScanRequest) => providerResponse(request, {
      quarantineObject: {
        ...request.quarantineObject,
        tenantId: "44444444-4444-4444-8444-444444444444",
      },
    })],
    ["wrong checksum binding", (request: ScannerProviderScanRequest) => providerResponse(request, {
      scannedChecksum: "b".repeat(64),
    })],
    ["wrong policy binding", (request: ScannerProviderScanRequest) => providerResponse(request, {
      policyVersion: "launch-v0",
    })],
    ["unapproved scanner identity", (request: ScannerProviderScanRequest) => providerResponse(request, {
      scannerAdapterId: "other-scanner",
    })],
    ["raw result field", (request: ScannerProviderScanRequest) => providerResponse(request, {
      rawProviderResult: { content: "private bytes" },
    })],
    ["unknown reason code", (request: ScannerProviderScanRequest) => providerResponse(request, {
      verdict: "error",
      reasonCode: "provider_secret_detail",
      retryable: false,
    })],
    ["stale timestamp", (request: ScannerProviderScanRequest) => providerResponse(request, {
      scannedAt: "2026-08-29T11:54:59.999Z",
    })],
    ["proxied data", (request: ScannerProviderScanRequest) => ({
      data: new Proxy((providerResponse(request) as { data: object }).data, {}),
      error: null,
    })],
  ])("fails closed on %s", async (_label, response) => {
    const provider = providerWith(async (request) => response(request));
    const adapter = adapterFor(provider.provider, true);

    await expect(adapter.scan(scannerRequest)).rejects.toThrowError(SAFE_ERROR);
  });

  it("rejects accessor responses without reading them", async () => {
    let reads = 0;
    const provider = providerWith(async () => ({
      get data() {
        reads += 1;
        throw new Error("unsafe getter");
      },
      error: null,
    }));
    const adapter = adapterFor(provider.provider, true);

    await expect(adapter.scan(scannerRequest)).rejects.toThrowError(SAFE_ERROR);
    expect(reads).toBe(0);
  });

  it("redacts provider exceptions and executeQuarantineScan keeps the object non-clean", async () => {
    const provider = providerWith(async () => {
      throw new Error("provider token: scanner-secret");
    });
    const adapter = adapterFor(provider.provider, true);

    const directError = await adapter.scan(scannerRequest).catch((error: unknown) => error);
    expect(directError).toMatchObject({
      name: "ScannerProviderBoundaryError",
      message: SAFE_ERROR,
    });
    expect(String(directError)).not.toContain("scanner-secret");

    await expect(executeQuarantineScan(quarantinedVersion, POLICY_VERSION, adapter)).resolves.toMatchObject({
      version: { state: "scanner_error" },
      scan: { verdict: "error", reasonCode: "adapter_error", retryable: true },
    });
  });

  it("requires explicit exact scanner approval configuration", () => {
    const provider = providerWith(async (request) => providerResponse(request));
    const base = {
      enabled: true,
      approvedScannerId: SCANNER_ID,
      approvedScannerVersion: SCANNER_VERSION,
      approvedPolicyVersion: POLICY_VERSION,
    };

    for (const options of [
      { ...base, enabled: "true" },
      { ...base, approvedScannerId: " scanner" },
      { ...base, approvedScannerVersion: "" },
      { ...base, approvedPolicyVersion: "launch v1" },
    ]) {
      expect(
        () => new ScannerProviderAdapter(
          provider.provider,
          options as unknown as ConstructorParameters<typeof ScannerProviderAdapter>[1],
        ),
      ).toThrowError(SAFE_ERROR);
    }
    expect(provider.scan).not.toHaveBeenCalled();
  });
});
