import { describe, expect, it } from "vitest";

import { buildDocumentObjectKey } from "@/lib/documents";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const DERIVATIVE_ID = "44444444-4444-4444-8444-444444444444";

describe("document object keys", () => {
  it("builds the accepted tenant-namespaced original key from server IDs", () => {
    expect(
      buildDocumentObjectKey({
        tenantId: TENANT_ID,
        documentId: DOCUMENT_ID,
        versionId: VERSION_ID,
        object: { kind: "original" },
      }),
    ).toBe(
      "tenants/11111111-1111-4111-8111-111111111111/documents/22222222-2222-4222-8222-222222222222/versions/33333333-3333-4333-8333-333333333333/original",
    );
  });

  it("builds a derivative key without using a filename", () => {
    expect(
      buildDocumentObjectKey({
        tenantId: TENANT_ID,
        documentId: DOCUMENT_ID,
        versionId: VERSION_ID,
        object: { kind: "derivative", derivativeId: DERIVATIVE_ID },
      }),
    ).toBe(
      "tenants/11111111-1111-4111-8111-111111111111/documents/22222222-2222-4222-8222-222222222222/versions/33333333-3333-4333-8333-333333333333/derivatives/44444444-4444-4444-8444-444444444444",
    );
  });

  it.each([
    { label: "path separator", tenantId: `${TENANT_ID}/other` },
    { label: "dot segment", tenantId: ".." },
    { label: "null byte", tenantId: `${TENANT_ID}\u0000` },
    { label: "Unicode confusable", tenantId: `11111111-1111-4111-8111-11111111111\u0430` },
  ])("rejects unsafe tenant IDs containing a $label", ({ tenantId }) => {
    expect(() =>
      buildDocumentObjectKey({
        tenantId,
        documentId: DOCUMENT_ID,
        versionId: VERSION_ID,
        object: { kind: "original" },
      }),
    ).toThrow(expect.objectContaining({ code: "unsafe_object_key" }));
  });
});
