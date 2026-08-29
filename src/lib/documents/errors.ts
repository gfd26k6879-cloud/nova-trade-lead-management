export type DocumentIntakeErrorCode =
  | "active_content"
  | "empty_file"
  | "encrypted_document"
  | "illegal_transition"
  | "incident_hold_active"
  | "malformed_signature"
  | "size_limit_exceeded"
  | "size_mismatch"
  | "stale_checksum"
  | "stale_version"
  | "storage_boundary_error"
  | "type_mismatch"
  | "unsafe_object_key"
  | "unsupported_type";

export class DocumentIntakeError extends Error {
  readonly code: DocumentIntakeErrorCode;

  constructor(code: DocumentIntakeErrorCode, message: string) {
    super(message);
    this.name = "DocumentIntakeError";
    this.code = code;
  }
}
