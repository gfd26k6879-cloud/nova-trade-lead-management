import { describe, expect, it, vi } from "vitest";

import {
  DocumentRetentionError,
  evaluateDocumentRetentionDisposition,
  type DocumentRetentionInput,
} from "@/lib/documents/retention";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT_ID = "22222222-2222-4222-8222-222222222222";
const DOCUMENT_ID = "33333333-3333-4333-8333-333333333333";
const VERSION_ID = "44444444-4444-4444-8444-444444444444";
const OBJECT_KEY = `tenants/${TENANT_ID}/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/original`;

function input(overrides: Record<string, unknown> = {}): DocumentRetentionInput {
  return {
    contractVersion: 1,
    scopeTenantId: TENANT_ID,
    tenantId: TENANT_ID,
    documentId: DOCUMENT_ID,
    versionId: VERSION_ID,
    objectKey: OBJECT_KEY,
    state: "ready",
    isCurrentVersion: false,
    policyVersion: "document-retention-v1",
    evaluatedAt: "2026-08-30T12:00:00.000Z",
    retentionExpiresAt: "2026-08-29T12:00:00.000Z",
    legalHoldActive: false,
    supportHoldActive: false,
    idempotencyKey: "retention:document:44444444",
    priorInputSha256: null,
    ...overrides,
  } as DocumentRetentionInput;
}

describe("evaluateDocumentRetentionDisposition", () => {
  it("returns one deterministic immutable purge-eligible decision without live time or callbacks", () => {
    const liveTime = vi.spyOn(Date, "now").mockImplementation(() => {
      throw new Error("live time must not be read");
    });
    const first = evaluateDocumentRetentionDisposition(input());
    const replay = evaluateDocumentRetentionDisposition(input({ priorInputSha256: first.inputSha256 }));

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      disposition: "purge_eligible",
      reason: "retention_elapsed",
      tenantId: TENANT_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      objectKey: OBJECT_KEY,
      policyVersion: "document-retention-v1",
    });
    expect(first.inputSha256).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(Object.isFrozen(first)).toBe(true);
    expect(liveTime).not.toHaveBeenCalled();
    liveTime.mockRestore();
  });

  it.each([
    ["legalHoldActive", "legal_hold_active"],
    ["supportHoldActive", "support_hold_active"],
  ] as const)("retains an expired version when %s is true", (hold, reason) => {
    expect(evaluateDocumentRetentionDisposition(input({ [hold]: true }))).toMatchObject({
      disposition: "retain",
      reason,
    });
  });

  it.each([
    [{ state: "retained_for_incident" }, "incident_hold_active"],
    [{ isCurrentVersion: true }, "current_version"],
    [{ state: "clean" }, "clean_version"],
    [{ state: "upload_reserved" }, "workflow_in_flight"],
    [{ state: "quarantined" }, "workflow_in_flight"],
    [{ state: "scanning" }, "workflow_in_flight"],
    [{ state: "extracting" }, "workflow_in_flight"],
    [{ state: "deletion_pending" }, "deletion_in_progress"],
    [{ state: "deletion_failed" }, "deletion_in_progress"],
    [{ state: "deleted" }, "already_deleted"],
  ])("fails closed for protected lifecycle input %j", (overrides, reason) => {
    expect(evaluateDocumentRetentionDisposition(input(overrides))).toMatchObject({
      disposition: "retain",
      reason,
    });
  });

  it("retains when the explicit retention deadline has not elapsed", () => {
    expect(evaluateDocumentRetentionDisposition(input({
      retentionExpiresAt: "2026-08-31T12:00:00.000Z",
    }))).toMatchObject({ disposition: "retain", reason: "retention_active" });
  });

  it("fails closed on a conflicting replay hash", () => {
    const result = evaluateDocumentRetentionDisposition(input({
      priorInputSha256: `sha256:${"a".repeat(64)}`,
    }));

    expect(result).toMatchObject({ disposition: "retain", reason: "replay_conflict" });
  });

  it("rejects cross-tenant and unsafe object-key bindings", () => {
    expect(() => evaluateDocumentRetentionDisposition(input({
      scopeTenantId: OTHER_TENANT_ID,
    }))).toThrow(expect.objectContaining({ code: "tenant_scope_mismatch" }));
    expect(() => evaluateDocumentRetentionDisposition(input({
      objectKey: `tenants/${TENANT_ID}/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/../original`,
    }))).toThrow(expect.objectContaining({ code: "unsafe_object_key" }));
    expect(() => evaluateDocumentRetentionDisposition(input({
      objectKey: `tenants/${OTHER_TENANT_ID}/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/original`,
    }))).toThrow(expect.objectContaining({ code: "unsafe_object_key" }));
  });

  it.each([
    { evaluatedAt: "2026-08-30" },
    { evaluatedAt: "not-a-time" },
    { retentionExpiresAt: "2026-02-30T12:00:00.000Z" },
    { retentionExpiresAt: "2026-08-29T12:00:00Z" },
  ])("rejects malformed or non-canonical time input %j", (overrides) => {
    expect(() => evaluateDocumentRetentionDisposition(input(overrides))).toThrow(
      expect.objectContaining({ code: "malformed_input" }),
    );
  });

  it("rejects proxies, accessors, malformed replay values, and executable extra fields without invocation", () => {
    let reads = 0;
    const accessor = input() as unknown as Record<string, unknown>;
    Object.defineProperty(accessor, "objectKey", {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("must not execute");
      },
    });
    const deletionCallback = vi.fn();

    expect(() => evaluateDocumentRetentionDisposition(new Proxy(input(), {})))
      .toThrow(expect.objectContaining({ code: "malformed_input" }));
    expect(() => evaluateDocumentRetentionDisposition(accessor))
      .toThrow(expect.objectContaining({ code: "malformed_input" }));
    expect(() => evaluateDocumentRetentionDisposition(input({ priorInputSha256: "sha256:nope" })))
      .toThrow(expect.objectContaining({ code: "malformed_input" }));
    expect(() => evaluateDocumentRetentionDisposition({ ...input(), deleteObject: deletionCallback }))
      .toThrow(expect.objectContaining({ code: "malformed_input" }));
    expect(reads).toBe(0);
    expect(deletionCallback).not.toHaveBeenCalled();
  });

  it("uses a fixed safe error without reflecting private input", () => {
    const privateValue = "tenant secret/object value";
    let error: unknown;
    try {
      evaluateDocumentRetentionDisposition(input({ policyVersion: privateValue }));
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(DocumentRetentionError);
    expect((error as Error).message).not.toContain(privateValue);
  });
});
