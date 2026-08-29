import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import type { NormalizedDocumentBlock, ParserLocator } from "./parsers/types";

export const STRUCTURAL_CHUNKING_ALGORITHM_VERSION = "structural-v1";
export const STRUCTURAL_CHUNK_MAX_UTF8_BYTES = 1024 * 1024;
export const STRUCTURAL_CHUNK_MAX_BLOCKS = 1024;

const MAX_INPUT_BLOCKS = 500_000;
const MAX_INPUT_UTF8_BYTES = 50 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const HASH_REF = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const VERSION = /^[a-z0-9][a-z0-9._+-]{0,63}$/u;
const BLOCK_KINDS = new Set(["heading", "paragraph", "list_item", "table_row", "code_block"]);
const REQUEST_FIELDS = [
  "tenantId", "workspaceId", "documentVersionId", "checksum", "parserId", "parserVersion",
  "algorithmVersion", "maxUtf8Bytes", "maxBlocksPerChunk", "blocks",
] as const;
const BLOCK_FIELDS = ["kind", "ordinal", "text", "contentHash", "locator"] as const;
const LINE_LOCATOR_FIELDS = ["kind", "startLine", "endLine", "headingPath"] as const;
const PAGE_LOCATOR_FIELDS = ["kind", "page", "block"] as const;
const SECTION_LOCATOR_FIELDS = ["kind", "sectionPath", "block"] as const;
const ROW_LOCATOR_FIELDS = ["kind", "sheet", "row"] as const;
const CELL_LOCATOR_FIELDS = ["kind", "sheet", "row", "column"] as const;

type PlainRecord = Record<string, unknown>;

export type StructuralChunkBinding = Readonly<{
  tenantId: string;
  workspaceId: string;
  documentVersionId: string;
  checksum: string;
  parserId: string;
  parserVersion: string;
  algorithmVersion: typeof STRUCTURAL_CHUNKING_ALGORITHM_VERSION;
  maxUtf8Bytes: number;
  maxBlocksPerChunk: number;
}>;

export type StructuralChunkBlockReference = Readonly<{
  kind: NormalizedDocumentBlock["kind"];
  ordinal: number;
  contentHash: string;
  locator: ParserLocator;
}>;

export type StructuralDocumentChunk = Readonly<{
  id: string;
  contentHash: string;
  ordinal: number;
  startBlockOrdinal: number;
  endBlockOrdinal: number;
  blockCount: number;
  utf8Bytes: number;
  text: string;
  binding: StructuralChunkBinding;
  blocks: readonly StructuralChunkBlockReference[];
}>;

export type StructuralChunkingResult =
  | Readonly<{
    ok: true;
    code: "CHUNKED";
    binding: StructuralChunkBinding;
    chunks: readonly StructuralDocumentChunk[];
  }>
  | Readonly<{
    ok: false;
    code: "MALFORMED_INPUT" | "UNSUPPORTED_ALGORITHM" | "RESOURCE_LIMIT_EXCEEDED";
  }>
  | Readonly<{
    ok: false;
    code: "REVIEW_BLOCK_TOO_LARGE";
    blockOrdinal: number;
  }>;

type ParsedRequest = Readonly<{
  binding: StructuralChunkBinding;
  blocks: readonly Readonly<NormalizedDocumentBlock>[];
}>;

function failed(code: "MALFORMED_INPUT" | "UNSUPPORTED_ALGORITHM" | "RESOURCE_LIMIT_EXCEEDED"):
Readonly<{ ok: false; code: typeof code }> {
  return Object.freeze({ ok: false, code });
}

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const allowed = new Set(fields);
    if (keys.length !== fields.length
      || keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
    const record: PlainRecord = {};
    for (const field of fields) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      record[field] = descriptor.value;
    }
    return record;
  } catch {
    return null;
  }
}

function exactArray(value: unknown, maximum: number): readonly unknown[] | null {
  try {
    if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maximum) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== value.length + 1 || keys.some((key) => typeof key === "symbol"
      || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) return null;
    const result: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      result.push(descriptor.value);
    }
    return result;
  } catch {
    return null;
  }
}

function integer(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number
    : null;
}

function hasUnsafeText(value: string): boolean {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufeff]/u.test(value)) return true;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function boundedText(value: unknown, maximum: number, trim: boolean): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value.trim().length > 0 && (!trim || value.trim() === value) && !hasUnsafeText(value)
    ? value
    : null;
}

function stringPath(value: unknown, allowEmpty: boolean): readonly string[] | null {
  const entries = exactArray(value, 20);
  if (!entries || (!allowEmpty && entries.length === 0)) return null;
  const path: string[] = [];
  for (const entry of entries) {
    const text = boundedText(entry, 500, true);
    if (!text) return null;
    path.push(text);
  }
  return Object.freeze(path);
}

function locator(value: unknown): ParserLocator | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
  const kind = descriptor.value;
  if (kind === "line_range") {
    const record = exactRecord(value, LINE_LOCATOR_FIELDS);
    const startLine = record && integer(record.startLine, 1, 500_000);
    const endLine = record && integer(record.endLine, 1, 500_000);
    const headingPath = record && stringPath(record.headingPath, true);
    return record && startLine !== null && endLine !== null && endLine >= startLine && headingPath
      ? Object.freeze({ kind, startLine, endLine, headingPath }) : null;
  }
  if (kind === "page") {
    const record = exactRecord(value, PAGE_LOCATOR_FIELDS);
    const page = record && integer(record.page, 1, 500);
    const block = record && integer(record.block, 0, 1_000_000);
    return record && page !== null && block !== null ? Object.freeze({ kind, page, block }) : null;
  }
  if (kind === "section") {
    const record = exactRecord(value, SECTION_LOCATOR_FIELDS);
    const sectionPath = record && stringPath(record.sectionPath, false);
    const block = record && integer(record.block, 0, 1_000_000);
    return record && sectionPath && block !== null ? Object.freeze({ kind, sectionPath, block }) : null;
  }
  if (kind === "row" || kind === "cell") {
    const record = exactRecord(value, kind === "row" ? ROW_LOCATOR_FIELDS : CELL_LOCATOR_FIELDS);
    const sheet = record && boundedText(record.sheet, 255, true);
    const row = record && integer(record.row, 1, 100_000);
    if (!record || !sheet || row === null) return null;
    if (kind === "row") return Object.freeze({ kind, sheet, row });
    const column = boundedText(record.column, 16, true);
    return column && /^[A-Z]{1,4}$/u.test(column)
      ? Object.freeze({ kind, sheet, row, column }) : null;
  }
  return null;
}

function parse(value: unknown): ParsedRequest | StructuralChunkingResult {
  const record = exactRecord(value, REQUEST_FIELDS);
  if (!record) return failed("MALFORMED_INPUT");
  if (record.algorithmVersion !== STRUCTURAL_CHUNKING_ALGORITHM_VERSION) {
    return failed("UNSUPPORTED_ALGORITHM");
  }
  const maxUtf8Bytes = integer(record.maxUtf8Bytes, 1, STRUCTURAL_CHUNK_MAX_UTF8_BYTES);
  const maxBlocksPerChunk = integer(record.maxBlocksPerChunk, 1, STRUCTURAL_CHUNK_MAX_BLOCKS);
  const blocks = exactArray(record.blocks, MAX_INPUT_BLOCKS);
  if (typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || typeof record.workspaceId !== "string" || !UUID.test(record.workspaceId)
    || typeof record.documentVersionId !== "string" || !UUID.test(record.documentVersionId)
    || typeof record.checksum !== "string" || !SHA256.test(record.checksum)
    || typeof record.parserId !== "string" || !TOKEN.test(record.parserId)
    || typeof record.parserVersion !== "string" || !VERSION.test(record.parserVersion)
    || maxUtf8Bytes === null || maxBlocksPerChunk === null || !blocks?.length) {
    return failed("MALFORMED_INPUT");
  }

  let totalBytes = 0;
  const parsedBlocks: NormalizedDocumentBlock[] = [];
  for (let ordinal = 0; ordinal < blocks.length; ordinal += 1) {
    const candidate = exactRecord(blocks[ordinal], BLOCK_FIELDS);
    const text = candidate && boundedText(candidate.text, 32_767, false);
    const parsedLocator = candidate && locator(candidate.locator);
    if (!candidate || !text || !parsedLocator || candidate.ordinal !== ordinal
      || typeof candidate.kind !== "string" || !BLOCK_KINDS.has(candidate.kind)
      || typeof candidate.contentHash !== "string" || !HASH_REF.test(candidate.contentHash)
      || candidate.contentHash !== `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`) {
      return failed("MALFORMED_INPUT");
    }
    totalBytes += Buffer.byteLength(text, "utf8");
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_INPUT_UTF8_BYTES) {
      return failed("RESOURCE_LIMIT_EXCEEDED");
    }
    parsedBlocks.push(Object.freeze({
      kind: candidate.kind as NormalizedDocumentBlock["kind"],
      ordinal,
      text,
      contentHash: candidate.contentHash,
      locator: parsedLocator,
    }));
  }

  const binding: StructuralChunkBinding = Object.freeze({
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    documentVersionId: record.documentVersionId,
    checksum: record.checksum,
    parserId: record.parserId,
    parserVersion: record.parserVersion,
    algorithmVersion: STRUCTURAL_CHUNKING_ALGORITHM_VERSION,
    maxUtf8Bytes,
    maxBlocksPerChunk,
  });
  return Object.freeze({ binding, blocks: Object.freeze(parsedBlocks) });
}

function identityHash(
  binding: StructuralChunkBinding,
  ordinal: number,
  text: string,
  blocks: readonly StructuralChunkBlockReference[],
): string {
  const hash = createHash("sha256");
  const values = [
    binding.tenantId, binding.workspaceId, binding.documentVersionId, binding.checksum,
    binding.parserId, binding.parserVersion, binding.algorithmVersion,
    String(binding.maxUtf8Bytes), String(binding.maxBlocksPerChunk), String(ordinal), text,
    ...blocks.flatMap((block) => [
      block.kind, String(block.ordinal), block.contentHash, JSON.stringify(block.locator),
    ]),
  ];
  for (const value of values) {
    const bytes = Buffer.from(value, "utf8");
    hash.update(String(bytes.byteLength));
    hash.update(":");
    hash.update(bytes);
    hash.update(";");
  }
  return hash.digest("hex");
}

function reference(block: Readonly<NormalizedDocumentBlock>): StructuralChunkBlockReference {
  return Object.freeze({
    kind: block.kind,
    ordinal: block.ordinal,
    contentHash: block.contentHash,
    locator: block.locator,
  });
}

function makeChunk(
  binding: StructuralChunkBinding,
  ordinal: number,
  blocks: readonly Readonly<NormalizedDocumentBlock>[],
): StructuralDocumentChunk {
  const text = blocks.map((block) => block.text).join("\n\n");
  const references = Object.freeze(blocks.map(reference));
  const digest = identityHash(binding, ordinal, text, references);
  return Object.freeze({
    id: `chunk:${digest}`,
    contentHash: `sha256:${digest}`,
    ordinal,
    startBlockOrdinal: blocks[0].ordinal,
    endBlockOrdinal: blocks[blocks.length - 1].ordinal,
    blockCount: blocks.length,
    utf8Bytes: Buffer.byteLength(text, "utf8"),
    text,
    binding,
    blocks: references,
  });
}

/**
 * Pure structural chunking boundary. It preserves validated source blocks and
 * locators verbatim; persistence, retrieval, embeddings, and provider calls
 * belong to later adapters.
 */
export function chunkNormalizedDocument(value: unknown): StructuralChunkingResult {
  const request = parse(value);
  if ("ok" in request) return request;

  const chunks: StructuralDocumentChunk[] = [];
  let pending: Readonly<NormalizedDocumentBlock>[] = [];
  let pendingBytes = 0;
  for (const block of request.blocks) {
    const blockBytes = Buffer.byteLength(block.text, "utf8");
    if (blockBytes > request.binding.maxUtf8Bytes) {
      return Object.freeze({ ok: false, code: "REVIEW_BLOCK_TOO_LARGE", blockOrdinal: block.ordinal });
    }
    const separatorBytes = pending.length === 0 ? 0 : 2;
    if (pending.length === request.binding.maxBlocksPerChunk
      || pendingBytes + separatorBytes + blockBytes > request.binding.maxUtf8Bytes) {
      chunks.push(makeChunk(request.binding, chunks.length, pending));
      pending = [];
      pendingBytes = 0;
    }
    pending.push(block);
    pendingBytes += (pending.length === 1 ? 0 : 2) + blockBytes;
  }
  if (pending.length > 0) chunks.push(makeChunk(request.binding, chunks.length, pending));

  return Object.freeze({
    ok: true,
    code: "CHUNKED",
    binding: request.binding,
    chunks: Object.freeze(chunks),
  });
}
