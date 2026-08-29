import type { LaunchDocumentFormat } from "@/lib/documents/validation";

export type DocumentParserCapability = Readonly<{
  parserId: string;
  parserVersion: string;
  formats: readonly LaunchDocumentFormat[];
  mediaTypes: readonly string[];
  maxBytes: number;
  maxBlocks: number;
  timeBudgetMs: number;
  networkAccess: "forbidden";
}>;

export type ParserLineLocator = Readonly<{
  kind: "line_range";
  startLine: number;
  endLine: number;
  headingPath: readonly string[];
}>;

export type ParserPageLocator = Readonly<{
  kind: "page";
  page: number;
  block: number;
}>;

export type ParserSectionLocator = Readonly<{
  kind: "section";
  sectionPath: readonly string[];
  block: number;
}>;

export type ParserRowLocator = Readonly<{
  kind: "row";
  sheet: string;
  row: number;
}>;

export type ParserCellLocator = Readonly<{
  kind: "cell";
  sheet: string;
  row: number;
  column: string;
}>;

export type ParserLocator =
  | ParserLineLocator
  | ParserPageLocator
  | ParserSectionLocator
  | ParserRowLocator
  | ParserCellLocator;

export type NormalizedDocumentBlock = Readonly<{
  kind: "heading" | "paragraph" | "list_item" | "table_row" | "code_block";
  ordinal: number;
  text: string;
  contentHash: string;
  locator: ParserLocator;
}>;

export type ParserOutput = Readonly<{
  parserId: string;
  parserVersion: string;
  status: "complete" | "review_required";
  blocks: readonly NormalizedDocumentBlock[];
  warnings: readonly string[];
  quality: Readonly<{ score: number; reviewRequired: boolean }>;
}>;

export type DocumentParserContext = Readonly<{
  documentVersionId: string;
  checksum: string;
  format: LaunchDocumentFormat;
  mediaType: string;
  bytes: Uint8Array;
  signal: AbortSignal;
}>;

export interface DocumentParser {
  readonly capability: DocumentParserCapability;
  parse(context: DocumentParserContext): Promise<unknown>;
}

export type ParseDocumentRequest = Readonly<{
  version: 1;
  documentVersionId: string;
  checksum: string;
  format: LaunchDocumentFormat;
  mediaType: string;
  bytes: Uint8Array;
}>;

export type ParserFailureCode =
  | "MALFORMED_REQUEST"
  | "UNSUPPORTED_FORMAT"
  | "SIGNATURE_MISMATCH"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "CANCELED"
  | "TIME_BUDGET_EXCEEDED"
  | "PARSER_FAILED"
  | "INVALID_PARSER_OUTPUT";

export type ParseDocumentResult = Readonly<
  | {
    ok: true;
    code: "PARSED";
    binding: Readonly<{
      documentVersionId: string;
      checksum: string;
      format: LaunchDocumentFormat;
      mediaType: string;
    }>;
    output: ParserOutput;
  }
  | { ok: false; code: ParserFailureCode }
>;

export interface DocumentParserRegistry {
  /**
   * Bounds the caller wait and cooperatively aborts the parser. Forced process
   * termination and no-network isolation belong to the durable extraction worker.
   */
  parse(request: unknown, options?: unknown): Promise<ParseDocumentResult>;
}
