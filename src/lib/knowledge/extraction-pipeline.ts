import { createHash } from "node:crypto";
import { isProxy, isSharedArrayBuffer } from "node:util/types";

import {
  assessDocumentExtractionEligibility,
  type DocumentExtractionCandidate,
  type DocumentExtractionEligibilityReason,
} from "@/lib/documents/extraction";
import { DOCUMENT_MAX_BYTES, type LaunchDocumentFormat } from "@/lib/documents/validation";

import {
  chunkNormalizedDocument,
  STRUCTURAL_CHUNKING_ALGORITHM_VERSION,
  STRUCTURAL_CHUNK_MAX_BLOCKS,
  STRUCTURAL_CHUNK_MAX_UTF8_BYTES,
} from "./chunking";
import {
  createDocumentParserRegistry,
  CSV_DOCUMENT_PARSER,
  MARKDOWN_DOCUMENT_PARSER,
  TEXT_DOCUMENT_PARSER,
  type NormalizedDocumentBlock,
  type ParserFailureCode,
  type ParserLocator,
} from "./parsers";

export const KNOWLEDGE_EXTRACTION_ARTIFACT_VERSION = 1;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;
const LAUNCH_MEDIA_TYPES = Object.freeze({
  csv: "text/csv",
  markdown: "text/markdown",
  txt: "text/plain",
} as const);
const LAUNCH_FORMATS = new Set<string>(Object.keys(LAUNCH_MEDIA_TYPES));
const ALL_FORMATS = new Set<string>(["pdf", "docx", "xlsx", "csv", "txt", "markdown", "jpeg", "png"]);
const REQUEST_FIELDS = [
  "version", "tenantId", "workspaceId", "documentId", "candidate", "mediaType", "bytes", "chunking",
] as const;
const CANDIDATE_FIELDS = ["version", "immutable", "format", "cleanBinding", "expectedBinding", "parserMetadata"];
const VERSION_FIELDS = ["versionId", "checksum", "state"];
const BINDING_FIELDS = ["versionId", "checksum", "policyVersion"];
const PARSER_METADATA_FIELDS = ["versionId", "checksum", "policyVersion", "validated"];
const PARSER_METADATA_OPTIONAL_FIELDS = ["pageCount", "rowCount", "metadata"];
const CHUNKING_FIELDS = ["algorithmVersion", "maxUtf8Bytes", "maxBlocksPerChunk"];
const ABORTED_GETTER = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")?.get;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(TYPED_ARRAY_PROTOTYPE, "buffer")?.get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  "byteLength",
)?.get;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;
const INVALID_SIGNAL = Symbol("invalid signal");

const LAUNCH_PARSER_REGISTRY = createDocumentParserRegistry(Object.freeze([
  CSV_DOCUMENT_PARSER,
  MARKDOWN_DOCUMENT_PARSER,
  TEXT_DOCUMENT_PARSER,
]));

type PlainRecord = Record<string, unknown>;
type LaunchTextFormat = keyof typeof LAUNCH_MEDIA_TYPES;

export type KnowledgeExtractionPipelineInput = Readonly<{
  version: 1;
  tenantId: string;
  workspaceId: string;
  documentId: string;
  candidate: DocumentExtractionCandidate;
  mediaType: string;
  bytes: Uint8Array;
  chunking: Readonly<{
    algorithmVersion: typeof STRUCTURAL_CHUNKING_ALGORITHM_VERSION;
    maxUtf8Bytes: number;
    maxBlocksPerChunk: number;
  }>;
}>;

export type RenderSafeSourceLocator = Readonly<
  | { kind: "line_range"; label: string; startLine: number; endLine: number }
  | { kind: "row"; label: string; row: number }
>;

export type KnowledgeExtractionBlock = Readonly<{
  kind: NormalizedDocumentBlock["kind"];
  ordinal: number;
  text: string;
  contentHash: string;
  sourceLocator: RenderSafeSourceLocator;
}>;

export type KnowledgeExtractionTableSegment = Readonly<{
  ordinal: number;
  startBlockOrdinal: number;
  endBlockOrdinal: number;
  rowCount: number;
  contentHash: string;
  rows: readonly Readonly<{
    ordinal: number;
    blockOrdinal: number;
    text: string;
    contentHash: string;
    sourceLocator: RenderSafeSourceLocator;
  }>[];
}>;

export type KnowledgeExtractionChunk = Readonly<{
  id: string;
  contentHash: string;
  ordinal: number;
  startBlockOrdinal: number;
  endBlockOrdinal: number;
  blockCount: number;
  utf8Bytes: number;
  text: string;
  blockOrdinals: readonly number[];
  sourceLocators: readonly RenderSafeSourceLocator[];
}>;

export type KnowledgeExtractionArtifact = Readonly<{
  artifactVersion: typeof KNOWLEDGE_EXTRACTION_ARTIFACT_VERSION;
  binding: Readonly<{
    tenantId: string;
    workspaceId: string;
    documentId: string;
    documentVersionId: string;
    checksum: string;
    scannerPolicyVersion: string;
    format: LaunchTextFormat;
    mediaType: string;
    parserId: string;
    parserVersion: string;
    chunkingAlgorithmVersion: typeof STRUCTURAL_CHUNKING_ALGORITHM_VERSION;
    maxChunkUtf8Bytes: number;
    maxBlocksPerChunk: number;
    documentIdentityHash: string;
    versionIdentityHash: string;
    parserIdentityHash: string;
    inputHash: string;
  }>;
  status: "complete" | "review_required";
  warnings: readonly string[];
  quality: Readonly<{ score: number; reviewRequired: boolean }>;
  blocks: readonly KnowledgeExtractionBlock[];
  tables: readonly KnowledgeExtractionTableSegment[];
  chunks: readonly KnowledgeExtractionChunk[];
}>;

export type KnowledgeExtractionPipelineResult =
  | Readonly<{ ok: true; code: "EXTRACTED"; artifact: KnowledgeExtractionArtifact }>
  | Readonly<{ ok: false; stage: "input"; code: "MALFORMED_INPUT" | "UNSUPPORTED_LAUNCH_FORMAT" }>
  | Readonly<{
    ok: false;
    stage: "eligibility";
    code: "DOCUMENT_NOT_ELIGIBLE";
    reason: Exclude<DocumentExtractionEligibilityReason, "eligible">;
  }>
  | Readonly<{ ok: false; stage: "parser"; code: ParserFailureCode }>
  | Readonly<{
    ok: false;
    stage: "chunking";
    code: "MALFORMED_INPUT" | "UNSUPPORTED_ALGORITHM" | "RESOURCE_LIMIT_EXCEEDED" | "REVIEW_BLOCK_TOO_LARGE";
    blockOrdinal?: number;
  }>
  | Readonly<{ ok: false; stage: "pipeline"; code: "INVALID_PIPELINE_OUTPUT" }>;

type ParsedInput = Readonly<{
  tenantId: string;
  workspaceId: string;
  documentId: string;
  candidate: DocumentExtractionCandidate;
  mediaType: string;
  bytes: Uint8Array;
  chunking: Readonly<{
    algorithmVersion: typeof STRUCTURAL_CHUNKING_ALGORITHM_VERSION;
    maxUtf8Bytes: number;
    maxBlocksPerChunk: number;
  }>;
}>;

function exactRecord(
  value: unknown,
  requiredFields: readonly string[],
  optionalFields: readonly string[] = [],
): PlainRecord | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = new Set([...requiredFields, ...optionalFields]);
    if (requiredFields.some((field) => !Object.hasOwn(descriptors, field))
      || keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
    const record: PlainRecord = {};
    for (const key of keys) {
      if (typeof key !== "string") return null;
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      record[key] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number
    : null;
}

function snapshotBytes(value: unknown): Uint8Array | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value)
      || !(value instanceof Uint8Array)
      || Object.getPrototypeOf(value) !== Uint8Array.prototype
      || !TYPED_ARRAY_BUFFER_GETTER || !TYPED_ARRAY_BYTE_LENGTH_GETTER
      || ["buffer", "byteLength", "byteOffset", "length", "constructor"].some((field) =>
        Object.getOwnPropertyDescriptor(value, field) !== undefined)
      || Object.getOwnPropertyDescriptor(value, Symbol.iterator) !== undefined) return null;
    const buffer = TYPED_ARRAY_BUFFER_GETTER.call(value) as ArrayBufferLike;
    const byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER.call(value) as number;
    if (isSharedArrayBuffer(buffer) || byteLength < 1 || byteLength > DOCUMENT_MAX_BYTES) return null;
    const snapshot = new Uint8Array(byteLength);
    UINT8_ARRAY_SET.call(snapshot, value);
    return snapshot;
  } catch {
    return null;
  }
}

function binding(value: unknown): Readonly<{ versionId: string; checksum: string; policyVersion: string }> | null {
  const record = exactRecord(value, BINDING_FIELDS);
  return record && typeof record.versionId === "string" && UUID.test(record.versionId)
    && typeof record.checksum === "string" && SHA256.test(record.checksum)
    && typeof record.policyVersion === "string" && POLICY_VERSION.test(record.policyVersion)
    ? Object.freeze({
      versionId: record.versionId,
      checksum: record.checksum,
      policyVersion: record.policyVersion,
    })
    : null;
}

function candidate(value: unknown): DocumentExtractionCandidate | null {
  const record = exactRecord(value, CANDIDATE_FIELDS);
  const version = record && exactRecord(record.version, VERSION_FIELDS);
  const cleanBinding = record && binding(record.cleanBinding);
  const expectedBinding = record && binding(record.expectedBinding);
  const metadata = record && exactRecord(
    record.parserMetadata,
    PARSER_METADATA_FIELDS,
    PARSER_METADATA_OPTIONAL_FIELDS,
  );
  if (!record || !version || !cleanBinding || !expectedBinding || !metadata
    || typeof version.versionId !== "string" || !UUID.test(version.versionId)
    || typeof version.checksum !== "string" || !SHA256.test(version.checksum)
    || typeof version.state !== "string" || version.state.length > 64
    || typeof record.immutable !== "boolean" || typeof record.format !== "string"
    || !ALL_FORMATS.has(record.format)
    || typeof metadata.versionId !== "string" || !UUID.test(metadata.versionId)
    || typeof metadata.checksum !== "string" || !SHA256.test(metadata.checksum)
    || typeof metadata.policyVersion !== "string" || !POLICY_VERSION.test(metadata.policyVersion)
    || typeof metadata.validated !== "boolean"
    || (metadata.pageCount !== undefined && integer(metadata.pageCount, 0, 1_000_000) === null)
    || (metadata.rowCount !== undefined && integer(metadata.rowCount, 0, 1_000_000) === null)
    || metadata.metadata !== undefined) return null;

  return Object.freeze({
    version: Object.freeze({
      versionId: version.versionId,
      checksum: version.checksum,
      state: version.state as DocumentExtractionCandidate["version"]["state"],
    }),
    immutable: record.immutable,
    format: record.format as LaunchDocumentFormat,
    cleanBinding,
    expectedBinding,
    parserMetadata: Object.freeze({
      versionId: metadata.versionId,
      checksum: metadata.checksum,
      policyVersion: metadata.policyVersion,
      validated: metadata.validated,
      ...(metadata.pageCount === undefined ? {} : { pageCount: metadata.pageCount }),
      ...(metadata.rowCount === undefined ? {} : { rowCount: metadata.rowCount }),
    }),
  });
}

function parseInput(value: unknown): ParsedInput | KnowledgeExtractionPipelineResult {
  const record = exactRecord(value, REQUEST_FIELDS);
  const parsedCandidate = record && candidate(record.candidate);
  const chunking = record && exactRecord(record.chunking, CHUNKING_FIELDS);
  const bytes = record && snapshotBytes(record.bytes);
  if (!record || record.version !== 1 || !parsedCandidate || !chunking
    || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || typeof record.workspaceId !== "string" || !UUID.test(record.workspaceId)
    || typeof record.documentId !== "string" || !UUID.test(record.documentId)
    || typeof record.mediaType !== "string" || !MEDIA_TYPE.test(record.mediaType)
    || record.mediaType !== record.mediaType.toLowerCase()
    || !bytes
    || chunking.algorithmVersion !== STRUCTURAL_CHUNKING_ALGORITHM_VERSION) {
    return Object.freeze({ ok: false, stage: "input", code: "MALFORMED_INPUT" });
  }
  if (!LAUNCH_FORMATS.has(parsedCandidate.format)) {
    return Object.freeze({ ok: false, stage: "input", code: "UNSUPPORTED_LAUNCH_FORMAT" });
  }
  const format = parsedCandidate.format as LaunchTextFormat;
  if (record.mediaType !== LAUNCH_MEDIA_TYPES[format]) {
    return Object.freeze({ ok: false, stage: "input", code: "MALFORMED_INPUT" });
  }
  const maxUtf8Bytes = integer(chunking.maxUtf8Bytes, 1, STRUCTURAL_CHUNK_MAX_UTF8_BYTES);
  const maxBlocksPerChunk = integer(chunking.maxBlocksPerChunk, 1, STRUCTURAL_CHUNK_MAX_BLOCKS);
  if (maxUtf8Bytes === null || maxBlocksPerChunk === null) {
    return Object.freeze({ ok: false, stage: "input", code: "MALFORMED_INPUT" });
  }
  if (createHash("sha256").update(bytes).digest("hex") !== parsedCandidate.expectedBinding.checksum) {
    return Object.freeze({ ok: false, stage: "input", code: "MALFORMED_INPUT" });
  }
  return Object.freeze({
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    candidate: parsedCandidate,
    mediaType: record.mediaType,
    bytes,
    chunking: Object.freeze({
      algorithmVersion: STRUCTURAL_CHUNKING_ALGORITHM_VERSION,
      maxUtf8Bytes,
      maxBlocksPerChunk,
    }),
  });
}

function safeSignal(value: unknown): AbortSignal | typeof INVALID_SIGNAL | undefined {
  if (value === undefined) return undefined;
  const options = exactRecord(value, ["signal"]);
  const signal = options?.signal;
  try {
    if (typeof signal !== "object" || signal === null || isProxy(signal)
      || !(signal instanceof AbortSignal)
      || Object.getPrototypeOf(signal) !== AbortSignal.prototype || !ABORTED_GETTER
      || Reflect.ownKeys(Object.getOwnPropertyDescriptors(signal)).some((key) => typeof key === "string")) {
      return INVALID_SIGNAL;
    }
    ABORTED_GETTER.call(signal);
    return signal;
  } catch {
    return INVALID_SIGNAL;
  }
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal !== undefined && ABORTED_GETTER?.call(signal) === true;
}

function hashReference(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    const bytes = Buffer.from(part, "utf8");
    hash.update(String(bytes.byteLength));
    hash.update(":");
    hash.update(bytes);
    hash.update(";");
  }
  return `sha256:${hash.digest("hex")}`;
}

function renderSafeLocator(locator: ParserLocator): RenderSafeSourceLocator | null {
  if (locator.kind === "line_range") {
    return Object.freeze({
      kind: "line_range",
      label: locator.startLine === locator.endLine
        ? `Line ${locator.startLine}` : `Lines ${locator.startLine}-${locator.endLine}`,
      startLine: locator.startLine,
      endLine: locator.endLine,
    });
  }
  if (locator.kind === "row") {
    return Object.freeze({ kind: "row", label: `Row ${locator.row}`, row: locator.row });
  }
  return null;
}

function tableSegments(
  blocks: readonly KnowledgeExtractionBlock[],
  inputHash: string,
): readonly KnowledgeExtractionTableSegment[] {
  const tables: KnowledgeExtractionTableSegment[] = [];
  let pending: KnowledgeExtractionBlock[] = [];
  const flush = (): void => {
    if (pending.length === 0) return;
    const ordinal = tables.length;
    const rows = Object.freeze(pending.map((block, rowOrdinal) => Object.freeze({
      ordinal: rowOrdinal,
      blockOrdinal: block.ordinal,
      text: block.text,
      contentHash: block.contentHash,
      sourceLocator: block.sourceLocator,
    })));
    tables.push(Object.freeze({
      ordinal,
      startBlockOrdinal: pending[0].ordinal,
      endBlockOrdinal: pending.at(-1)!.ordinal,
      rowCount: rows.length,
      contentHash: hashReference([
        "table-segment-v1", inputHash, String(ordinal),
        ...rows.flatMap((row) => [row.contentHash, JSON.stringify(row.sourceLocator)]),
      ]),
      rows,
    }));
    pending = [];
  };
  for (const block of blocks) {
    if (block.kind === "table_row") pending.push(block);
    else flush();
  }
  flush();
  return Object.freeze(tables);
}

/**
 * Pure launch extraction boundary. Source bytes and parser text are untrusted
 * data; this function never interprets them as instructions or performs I/O.
 */
export async function runKnowledgeExtractionPipeline(
  value: unknown,
  options?: unknown,
): Promise<KnowledgeExtractionPipelineResult> {
  const signal = safeSignal(options);
  if (signal === INVALID_SIGNAL) {
    return Object.freeze({ ok: false, stage: "input", code: "MALFORMED_INPUT" });
  }
  const input = parseInput(value);
  if ("ok" in input) return input;

  const eligibility = assessDocumentExtractionEligibility(input.candidate);
  if (eligibility.result !== "eligible") {
    return Object.freeze({
      ok: false,
      stage: "eligibility",
      code: "DOCUMENT_NOT_ELIGIBLE",
      reason: eligibility.reason,
    });
  }

  const parsed = await LAUNCH_PARSER_REGISTRY.parse({
    version: 1,
    documentVersionId: input.candidate.expectedBinding.versionId,
    checksum: input.candidate.expectedBinding.checksum,
    format: input.candidate.format,
    mediaType: input.mediaType,
    bytes: input.bytes,
  }, signal ? { signal } : undefined);
  if (!parsed.ok) return Object.freeze({ ok: false, stage: "parser", code: parsed.code });
  if (aborted(signal)) return Object.freeze({ ok: false, stage: "parser", code: "CANCELED" });

  const chunked = chunkNormalizedDocument({
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    documentVersionId: parsed.binding.documentVersionId,
    checksum: parsed.binding.checksum,
    parserId: parsed.output.parserId,
    parserVersion: parsed.output.parserVersion,
    algorithmVersion: input.chunking.algorithmVersion,
    maxUtf8Bytes: input.chunking.maxUtf8Bytes,
    maxBlocksPerChunk: input.chunking.maxBlocksPerChunk,
    blocks: parsed.output.blocks,
  });
  if (!chunked.ok) {
    return Object.freeze({
      ok: false,
      stage: "chunking",
      code: chunked.code,
      ...(chunked.code === "REVIEW_BLOCK_TOO_LARGE" ? { blockOrdinal: chunked.blockOrdinal } : {}),
    });
  }

  const format = input.candidate.format as LaunchTextFormat;
  const documentIdentityHash = hashReference([
    "document-identity-v1", input.tenantId, input.workspaceId, input.documentId,
  ]);
  const versionIdentityHash = hashReference([
    "document-version-v1", documentIdentityHash, parsed.binding.documentVersionId,
    parsed.binding.checksum, input.candidate.expectedBinding.policyVersion,
  ]);
  const parserIdentityHash = hashReference([
    "document-parser-v1", parsed.output.parserId, parsed.output.parserVersion, format, input.mediaType,
  ]);
  const inputHash = hashReference([
    "knowledge-extraction-input-v1", versionIdentityHash, parserIdentityHash,
    input.chunking.algorithmVersion, String(input.chunking.maxUtf8Bytes),
    String(input.chunking.maxBlocksPerChunk),
  ]);

  const blocks: KnowledgeExtractionBlock[] = [];
  for (const block of parsed.output.blocks) {
    const sourceLocator = renderSafeLocator(block.locator);
    if (!sourceLocator) {
      return Object.freeze({ ok: false, stage: "pipeline", code: "INVALID_PIPELINE_OUTPUT" });
    }
    blocks.push(Object.freeze({
      kind: block.kind,
      ordinal: block.ordinal,
      text: block.text,
      contentHash: block.contentHash,
      sourceLocator,
    }));
  }
  const frozenBlocks = Object.freeze(blocks);

  const chunks: KnowledgeExtractionChunk[] = [];
  for (const chunk of chunked.chunks) {
    const sourceLocators: RenderSafeSourceLocator[] = [];
    for (const reference of chunk.blocks) {
      const sourceLocator = renderSafeLocator(reference.locator);
      if (!sourceLocator) {
        return Object.freeze({ ok: false, stage: "pipeline", code: "INVALID_PIPELINE_OUTPUT" });
      }
      sourceLocators.push(sourceLocator);
    }
    chunks.push(Object.freeze({
      id: chunk.id,
      contentHash: chunk.contentHash,
      ordinal: chunk.ordinal,
      startBlockOrdinal: chunk.startBlockOrdinal,
      endBlockOrdinal: chunk.endBlockOrdinal,
      blockCount: chunk.blockCount,
      utf8Bytes: chunk.utf8Bytes,
      text: chunk.text,
      blockOrdinals: Object.freeze(chunk.blocks.map((block) => block.ordinal)),
      sourceLocators: Object.freeze(sourceLocators),
    }));
  }

  const artifact: KnowledgeExtractionArtifact = Object.freeze({
    artifactVersion: KNOWLEDGE_EXTRACTION_ARTIFACT_VERSION,
    binding: Object.freeze({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      documentId: input.documentId,
      documentVersionId: parsed.binding.documentVersionId,
      checksum: parsed.binding.checksum,
      scannerPolicyVersion: input.candidate.expectedBinding.policyVersion,
      format,
      mediaType: input.mediaType,
      parserId: parsed.output.parserId,
      parserVersion: parsed.output.parserVersion,
      chunkingAlgorithmVersion: input.chunking.algorithmVersion,
      maxChunkUtf8Bytes: input.chunking.maxUtf8Bytes,
      maxBlocksPerChunk: input.chunking.maxBlocksPerChunk,
      documentIdentityHash,
      versionIdentityHash,
      parserIdentityHash,
      inputHash,
    }),
    status: parsed.output.status,
    warnings: Object.freeze([...parsed.output.warnings]),
    quality: Object.freeze({ ...parsed.output.quality }),
    blocks: frozenBlocks,
    tables: tableSegments(frozenBlocks, inputHash),
    chunks: Object.freeze(chunks),
  });
  return Object.freeze({ ok: true, code: "EXTRACTED", artifact });
}
