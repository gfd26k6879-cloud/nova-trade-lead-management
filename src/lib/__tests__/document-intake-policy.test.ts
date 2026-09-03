import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  evaluateDocumentFilePolicy,
  evaluateScannerReleasePolicy,
} from "@/lib/documents/intake-policy";

const CHECKSUM = "d8e3f0dc303c6f99aee1b95aaaabf3650f563d852cc253900bda2d2dfac38d83";
const EVALUATED_AT = "2026-08-29T18:00:00.000Z";
const pdfBytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF");
const malformedPdfBytes = new TextEncoder().encode("not a pdf");
const activePdfBytes = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n/JavaScript\n%%EOF");

function scannerInput(overrides: Record<string, unknown> = {}) {
  return {
    checksum: CHECKSUM,
    scannerPolicyVersion: "launch-v1",
    attempt: 1,
    maxAttempts: 3,
    evaluatedAt: EVALUATED_AT,
    observation: {
      verdict: "clean",
      scannerAdapterId: "fixture-scanner",
      scannerVersion: "1.0.0",
      scannedChecksum: CHECKSUM,
      scannedAt: "2026-08-29T17:59:00.000Z",
      policyVersion: "launch-v1",
    },
    ...overrides,
  };
}

describe("document intake policy decisions", () => {
  it("admits an exactly matching signed file only into quarantine with scanning required", () => {
    const result = evaluateDocumentFilePolicy({
      fileName: "brief.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: pdfBytes.byteLength,
      storedMediaType: "application/pdf",
      storedByteSize: pdfBytes.byteLength,
      bytes: pdfBytes,
      scannerPolicyVersion: "launch-v1",
    });

    expect(result).toMatchObject({
      decision: "eligible_for_scan",
      state: "quarantined",
      format: "pdf",
      mediaType: "application/pdf",
      byteSize: pdfBytes.byteLength,
      scanRequired: true,
      releaseAllowed: false,
      scannerPolicyVersion: "launch-v1",
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    [{ storedMediaType: "text/plain" }, "stored_media_mismatch"],
    [{ storedByteSize: pdfBytes.byteLength + 1 }, "stored_size_mismatch"],
    [{ declaredByteSize: pdfBytes.byteLength + 1 }, "size_mismatch"],
    [{
      bytes: malformedPdfBytes,
      declaredByteSize: malformedPdfBytes.byteLength,
      storedByteSize: malformedPdfBytes.byteLength,
    }, "malformed_signature"],
    [{
      bytes: activePdfBytes,
      declaredByteSize: activePdfBytes.byteLength,
      storedByteSize: activePdfBytes.byteLength,
    }, "active_content"],
  ] as const)("fails closed for untrusted file mismatch %#", (override, reason) => {
    const result = evaluateDocumentFilePolicy({
      fileName: "brief.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: pdfBytes.byteLength,
      storedMediaType: "application/pdf",
      storedByteSize: pdfBytes.byteLength,
      bytes: pdfBytes,
      scannerPolicyVersion: "launch-v1",
      ...override,
    });

    expect(result).toEqual({
      decision: "rejected",
      state: "rejected",
      reason,
      retryable: false,
      disposition: "discard_untrusted_object",
      scanRequired: false,
      releaseAllowed: false,
    });
  });

  it("rejects hostile or inexact file envelopes without evaluating accessors", () => {
    let reads = 0;
    const accessor = {
      fileName: "brief.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: pdfBytes.byteLength,
      storedMediaType: "application/pdf",
      storedByteSize: pdfBytes.byteLength,
      get bytes() { reads += 1; throw new Error("getter must not run"); },
      scannerPolicyVersion: "launch-v1",
    };
    const proxy = new Proxy({}, { ownKeys: () => { throw new Error("trap must not run"); } });

    expect(evaluateDocumentFilePolicy(accessor as never)).toMatchObject({ reason: "malformed_input" });
    expect(evaluateDocumentFilePolicy(proxy as never)).toMatchObject({ reason: "malformed_input" });
    expect(evaluateDocumentFilePolicy({
      fileName: "brief.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: pdfBytes.byteLength,
      storedMediaType: "application/pdf",
      storedByteSize: pdfBytes.byteLength,
      bytes: pdfBytes,
      scannerPolicyVersion: "launch-v1",
      unexpected: true,
    } as never)).toMatchObject({ reason: "malformed_input" });
    class BytesSubclass extends Uint8Array {}
    expect(evaluateDocumentFilePolicy({
      fileName: "brief.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: pdfBytes.byteLength,
      storedMediaType: "application/pdf",
      storedByteSize: pdfBytes.byteLength,
      bytes: new BytesSubclass(pdfBytes),
      scannerPolicyVersion: "launch-v1",
    })).toMatchObject({ reason: "malformed_input" });
    if (typeof SharedArrayBuffer !== "undefined") {
      const sharedBytes = new Uint8Array(new SharedArrayBuffer(pdfBytes.byteLength));
      sharedBytes.set(pdfBytes);
      expect(evaluateDocumentFilePolicy({
        fileName: "brief.pdf",
        declaredMediaType: "application/pdf",
        declaredByteSize: sharedBytes.byteLength,
        storedMediaType: "application/pdf",
        storedByteSize: sharedBytes.byteLength,
        bytes: sharedBytes,
        scannerPolicyVersion: "launch-v1",
      })).toMatchObject({ reason: "malformed_input" });
      const foreignSharedBuffer = runInNewContext("new SharedArrayBuffer(64)") as SharedArrayBuffer;
      expect(evaluateDocumentFilePolicy({
        fileName: "brief.pdf",
        declaredMediaType: "application/pdf",
        declaredByteSize: foreignSharedBuffer.byteLength,
        storedMediaType: "application/pdf",
        storedByteSize: foreignSharedBuffer.byteLength,
        bytes: new Uint8Array(foreignSharedBuffer),
        scannerPolicyVersion: "launch-v1",
      })).toMatchObject({ reason: "malformed_input" });
    }
    expect(reads).toBe(0);
  });
});

describe("scanner release policy decisions", () => {
  it("allows release only for an exact, current clean observation", () => {
    const result = evaluateScannerReleasePolicy(scannerInput());
    expect(result).toEqual({
      decision: "release_allowed",
      state: "clean",
      releaseAllowed: true,
      retryScheduled: false,
      checksum: CHECKSUM,
      scannerPolicyVersion: "launch-v1",
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    { retryable: true },
    { reasonCode: "adapter_timeout" },
  ])("denies clean observations carrying contradictory error metadata %#", (metadata) => {
    expect(evaluateScannerReleasePolicy(scannerInput({
      observation: { ...scannerInput().observation, ...metadata },
    }))).toMatchObject({ decision: "release_denied", reason: "malformed_verdict" });
  });

  it.each(["infected", "error"] as const)("requires explicit failure metadata for %s observations", (verdict) => {
    expect(evaluateScannerReleasePolicy(scannerInput({
      observation: { ...scannerInput().observation, verdict },
    }))).toMatchObject({ decision: "release_denied", reason: "malformed_verdict" });
  });

  it("keeps infected files quarantined and terminal even if the adapter marks them retryable", () => {
    const result = evaluateScannerReleasePolicy(scannerInput({
      observation: {
        ...scannerInput().observation,
        verdict: "infected",
        retryable: true,
        reasonCode: "malware_detected",
      },
    }));
    expect(result).toEqual({
      decision: "release_denied",
      state: "infected",
      reason: "infected",
      releaseAllowed: false,
      retryScheduled: false,
    });
  });

  it.each([
    [1, true],
    [3, false],
  ])("bounds adapter-requested scanner error retry at attempt %i", (attempt, retryScheduled) => {
    const result = evaluateScannerReleasePolicy(scannerInput({
      attempt,
      observation: {
        ...scannerInput().observation,
        verdict: "error",
        retryable: true,
        reasonCode: "adapter_timeout",
      },
    }));
    expect(result).toEqual({
      decision: "release_denied",
      state: "scanner_error",
      reason: "scanner_reported_error",
      releaseAllowed: false,
      retryScheduled,
    });
  });

  it.each([
    [{ scannedChecksum: "f".repeat(64) }, "checksum_mismatch"],
    [{ policyVersion: "other-policy" }, "policy_mismatch"],
    [{ scannedAt: "2026-08-29T18:06:00.000Z" }, "timestamp_invalid"],
  ] as const)("denies malformed scanner trust evidence %#", (observationOverride, reason) => {
    const result = evaluateScannerReleasePolicy(scannerInput({
      observation: { ...scannerInput().observation, ...observationOverride },
    }));
    expect(result).toEqual({
      decision: "release_denied",
      state: "scanner_error",
      reason,
      releaseAllowed: false,
      retryScheduled: false,
    });
  });

  it("rejects hostile scanner envelopes without evaluating accessors", () => {
    let reads = 0;
    const input = scannerInput();
    Object.defineProperty(input, "observation", {
      enumerable: true,
      get() { reads += 1; throw new Error("getter must not run"); },
    });
    const result = evaluateScannerReleasePolicy(input as never);
    expect(result).toEqual({
      decision: "release_denied",
      state: "scanner_error",
      reason: "malformed_input",
      releaseAllowed: false,
      retryScheduled: false,
    });
    expect(reads).toBe(0);
  });

  it.each([
    [{ evaluatedAt: "0" }, "malformed_input"],
    [{ evaluatedAt: "2026-02-31T18:00:00.000Z" }, "malformed_input"],
    [{ observation: { ...scannerInput().observation, scannedAt: "0" } }, "malformed_verdict"],
    [{ observation: { ...scannerInput().observation, scannerAdapterId: "fixture\u0085scanner" } }, "malformed_verdict"],
    [{ observation: { ...scannerInput().observation, scannerVersion: " 1.0.0" } }, "malformed_verdict"],
  ])("rejects non-canonical scanner evidence %#", (override, reason) => {
    expect(evaluateScannerReleasePolicy(scannerInput(override))).toMatchObject({
      decision: "release_denied",
      reason,
    });
  });
});
