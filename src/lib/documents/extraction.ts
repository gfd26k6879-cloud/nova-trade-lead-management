import type { DocumentVersionSnapshot } from "./state-machine";
import type { LaunchDocumentFormat } from "./validation";

export const DOCUMENT_PDF_MAX_PAGES = 500;
export const DOCUMENT_SPREADSHEET_MAX_ROWS = 100_000;

export type DocumentExtractionBinding = Readonly<{
  versionId: string;
  checksum: string;
  policyVersion: string;
}>;

export type DocumentExtractionParserMetadata = DocumentExtractionBinding &
  Readonly<{
    validated: boolean;
    pageCount?: unknown;
    rowCount?: unknown;
    metadata?: unknown;
  }>;

export type DocumentExtractionCandidate = Readonly<{
  version: DocumentVersionSnapshot;
  immutable: boolean;
  format: LaunchDocumentFormat;
  cleanBinding: DocumentExtractionBinding;
  expectedBinding: DocumentExtractionBinding;
  parserMetadata: DocumentExtractionParserMetadata;
}>;

export type DocumentExtractionEligibilityReason =
  | "eligible"
  | "binding_malformed"
  | "version_mismatch"
  | "checksum_mismatch"
  | "policy_mismatch"
  | "state_not_clean"
  | "mutable_version"
  | "parser_metadata_unvalidated"
  | "parser_metadata_malformed"
  | "page_limit_exceeded"
  | "row_limit_exceeded";

export type DocumentExtractionEligibility = Readonly<
  | { result: "eligible"; reason: "eligible" }
  | { result: "rejected"; reason: Exclude<DocumentExtractionEligibilityReason, "eligible"> }
>;

const eligible: DocumentExtractionEligibility = { result: "eligible", reason: "eligible" };

function rejected(
  reason: Exclude<DocumentExtractionEligibilityReason, "eligible">,
): DocumentExtractionEligibility {
  return { result: "rejected", reason };
}

function isBindingValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveCount(value: unknown): value is number {
  return isValidCount(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const LAUNCH_FORMATS: ReadonlySet<string> = new Set([
  "pdf",
  "docx",
  "xlsx",
  "csv",
  "txt",
  "markdown",
  "jpeg",
  "png",
]);

export function assessDocumentExtractionEligibility(
  candidateValue: DocumentExtractionCandidate,
): DocumentExtractionEligibility {
  if (!isRecord(candidateValue)
    || !isRecord(candidateValue.version)
    || !isRecord(candidateValue.cleanBinding)
    || !isRecord(candidateValue.expectedBinding)
    || !isRecord(candidateValue.parserMetadata)
    || typeof candidateValue.format !== "string"
    || !LAUNCH_FORMATS.has(candidateValue.format)) {
    return rejected("binding_malformed");
  }
  const candidate = candidateValue as DocumentExtractionCandidate;
  if (candidate.version.state !== "clean") return rejected("state_not_clean");
  if (candidate.immutable !== true) return rejected("mutable_version");

  const bindings = [candidate.version, candidate.cleanBinding, candidate.expectedBinding, candidate.parserMetadata];
  if (
    bindings.some(
      (binding) => !isBindingValue(binding.versionId) || !isBindingValue(binding.checksum),
    ) ||
    !isBindingValue(candidate.cleanBinding.policyVersion) ||
    !isBindingValue(candidate.expectedBinding.policyVersion) ||
    !isBindingValue(candidate.parserMetadata.policyVersion)
  ) {
    return rejected("binding_malformed");
  }

  if (
    candidate.version.versionId !== candidate.expectedBinding.versionId ||
    candidate.cleanBinding.versionId !== candidate.expectedBinding.versionId ||
    candidate.parserMetadata.versionId !== candidate.expectedBinding.versionId
  ) {
    return rejected("version_mismatch");
  }

  if (
    candidate.version.checksum !== candidate.expectedBinding.checksum ||
    candidate.cleanBinding.checksum !== candidate.expectedBinding.checksum ||
    candidate.parserMetadata.checksum !== candidate.expectedBinding.checksum
  ) {
    return rejected("checksum_mismatch");
  }

  if (
    candidate.cleanBinding.policyVersion !== candidate.expectedBinding.policyVersion ||
    candidate.parserMetadata.policyVersion !== candidate.expectedBinding.policyVersion
  ) {
    return rejected("policy_mismatch");
  }

  if (candidate.parserMetadata.validated !== true) {
    return rejected("parser_metadata_unvalidated");
  }

  const { pageCount, rowCount } = candidate.parserMetadata;
  if (
    (pageCount !== undefined && !isValidCount(pageCount)) ||
    (rowCount !== undefined && !isValidCount(rowCount))
  ) {
    return rejected("parser_metadata_malformed");
  }

  if (candidate.format === "pdf") {
    if (!isPositiveCount(pageCount)) return rejected("parser_metadata_malformed");
    if (pageCount > DOCUMENT_PDF_MAX_PAGES) return rejected("page_limit_exceeded");
  }

  if (candidate.format === "xlsx" || candidate.format === "csv") {
    if (!isPositiveCount(rowCount)) return rejected("parser_metadata_malformed");
    if (rowCount > DOCUMENT_SPREADSHEET_MAX_ROWS) return rejected("row_limit_exceeded");
  }

  return eligible;
}
