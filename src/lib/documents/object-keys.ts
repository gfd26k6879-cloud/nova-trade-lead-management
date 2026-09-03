import { DocumentIntakeError } from "./errors";

const CANONICAL_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export type DocumentObjectKeyInput = Readonly<{
  tenantId: string;
  documentId: string;
  versionId: string;
  object:
    | Readonly<{ kind: "original" }>
    | Readonly<{ kind: "derivative"; derivativeId: string }>;
}>;

function canonicalId(value: string): string {
  if (typeof value !== "string" || !CANONICAL_UUID.test(value)) {
    throw new DocumentIntakeError(
      "unsafe_object_key",
      "Document object keys require server-issued canonical UUIDs.",
    );
  }
  return value.toLowerCase();
}

export function buildDocumentObjectKey(input: DocumentObjectKeyInput): string {
  const tenantId = canonicalId(input.tenantId);
  const documentId = canonicalId(input.documentId);
  const versionId = canonicalId(input.versionId);
  const prefix = `tenants/${tenantId}/documents/${documentId}/versions/${versionId}`;

  if (input.object.kind === "original") {
    return `${prefix}/original`;
  }

  return `${prefix}/derivatives/${canonicalId(input.object.derivativeId)}`;
}
