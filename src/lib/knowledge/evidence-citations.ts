import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { DOCUMENT_MAX_BYTES } from "@/lib/documents/validation";

import {
  STRUCTURAL_CHUNKING_ALGORITHM_VERSION,
  STRUCTURAL_CHUNK_MAX_BLOCKS,
  STRUCTURAL_CHUNK_MAX_UTF8_BYTES,
} from "./chunking";
import type {
  KnowledgeExtractionArtifact,
  KnowledgeExtractionBlock,
  RenderSafeSourceLocator,
} from "./extraction-pipeline";

export const KNOWLEDGE_EVIDENCE_MAX_CITATIONS = 256;
export const KNOWLEDGE_EVIDENCE_MAX_QUOTE_UTF8_BYTES = 4096;

const MAX_EXTRACTION_BLOCKS = 500_000;
const MAX_BLOCK_CHARS = 32_767;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const HASH_REF = /^sha256:[0-9a-f]{64}$/u;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PARSER_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const PARSER_VERSION = /^[a-z0-9][a-z0-9._+-]{0,63}$/u;
const FORMAT_MEDIA_TYPE = Object.freeze({
  csv: "text/csv",
  markdown: "text/markdown",
  txt: "text/plain",
} as const);
const BLOCK_KINDS = new Set(["heading", "paragraph", "list_item", "table_row", "code_block"]);
const INPUT_FIELDS = ["version", "scope", "extraction", "anchors"] as const;
const SCOPE_FIELDS = [
  "tenantId", "workspaceId", "documentId", "documentVersionId", "checksum", "scannerPolicyVersion",
] as const;
const EXTRACTION_FIELDS = ["artifactVersion", "binding", "blocks"] as const;
const BINDING_FIELDS = [
  "tenantId", "workspaceId", "documentId", "documentVersionId", "checksum", "scannerPolicyVersion",
  "format", "mediaType", "parserId", "parserVersion", "chunkingAlgorithmVersion", "maxChunkUtf8Bytes",
  "maxBlocksPerChunk", "documentIdentityHash", "versionIdentityHash", "parserIdentityHash", "inputHash",
] as const;
const BLOCK_FIELDS = ["kind", "ordinal", "text", "contentHash", "sourceLocator"] as const;
const LINE_LOCATOR_FIELDS = ["kind", "label", "startLine", "endLine"] as const;
const ROW_LOCATOR_FIELDS = ["kind", "label", "row"] as const;
const ANCHOR_FIELDS = [
  "blockOrdinal", "blockContentHash", "sourceLocator", "quoteStart", "quoteEnd", "quote", "quoteHash",
] as const;

type PlainRecord = Record<string, unknown>;
type ExtractionBinding = KnowledgeExtractionArtifact["binding"];

export type KnowledgeEvidenceScope = Readonly<{
  tenantId: string;
  workspaceId: string;
  documentId: string;
  documentVersionId: string;
  checksum: string;
  scannerPolicyVersion: string;
}>;

export type KnowledgeEvidenceAnchor = Readonly<{
  blockOrdinal: number;
  blockContentHash: string;
  sourceLocator: RenderSafeSourceLocator;
  /** UTF-16 code-unit offsets into the exact normalized extraction block. */
  quoteStart: number;
  quoteEnd: number;
  quote: string;
  quoteHash: string;
}>;

export type KnowledgeEvidenceCitationInput = Readonly<{
  version: 1;
  scope: KnowledgeEvidenceScope;
  extraction: Readonly<Pick<KnowledgeExtractionArtifact, "artifactVersion" | "binding" | "blocks">>;
  anchors: readonly KnowledgeEvidenceAnchor[];
}>;

export type KnowledgeEvidenceRecord = Readonly<{
  evidenceVersion: 1;
  evidenceId: string;
  tenantId: string;
  workspaceId: string;
  documentId: string;
  documentVersionId: string;
  checksum: string;
  scannerPolicyVersion: string;
  extractionInputHash: string;
  parserId: string;
  parserVersion: string;
  evidenceGrade: "extracted";
  origin: "parser_output";
  blockOrdinal: number;
  blockContentHash: string;
  sourceLocator: RenderSafeSourceLocator;
  quoteStart: number;
  quoteEnd: number;
  quote: string;
  quoteHash: string;
}>;

export type RenderSafeKnowledgeCitation = Readonly<{
  citationVersion: 1;
  citationId: string;
  evidenceId: string;
  state: "resolved";
  tenantId: string;
  workspaceId: string;
  documentId: string;
  documentVersionId: string;
  quote: string;
  quoteHash: string;
  sourceLocator: RenderSafeSourceLocator;
  display: Readonly<{ sourceLabel: "Private document"; locatorLabel: string }>;
}>;

export type KnowledgeEvidenceCitationResult = Readonly<
  | {
    ok: true;
    code: "EVIDENCE_CITATIONS_CREATED";
    evidence: readonly KnowledgeEvidenceRecord[];
    citations: readonly RenderSafeKnowledgeCitation[];
  }
  | { ok: false; code: "MALFORMED_INPUT" | "SCOPE_MISMATCH" | "EVIDENCE_MISMATCH" }
>;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const expected = new Set(fields);
    if (keys.length !== fields.length
      || keys.some((key) => typeof key !== "string" || !expected.has(key))) return null;
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
    if (typeof value !== "object" || value === null || isProxy(value) || !Array.isArray(value)
      || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !("value" in lengthDescriptor)
      || typeof lengthDescriptor.value !== "number" || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0 || lengthDescriptor.value > maximum) return null;
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || keys.some((key) => typeof key === "symbol"
      || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) return null;
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
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
    } else if (code >= 0xdc00 && code <= 0xdfff) return true;
  }
  return false;
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

function stableId(prefix: "evidence" | "citation", parts: readonly string[]): string {
  return `${prefix}:${hashReference(parts).slice("sha256:".length)}`;
}

function parseLocator(value: unknown): RenderSafeSourceLocator | null {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kindDescriptor || !("value" in kindDescriptor) || !kindDescriptor.enumerable) return null;
  if (kindDescriptor.value === "line_range") {
    const record = exactRecord(value, LINE_LOCATOR_FIELDS);
    const startLine = record && integer(record.startLine, 1, 500_000);
    const endLine = record && integer(record.endLine, 1, 500_000);
    if (!record || startLine === null || endLine === null || endLine < startLine) return null;
    const label = startLine === endLine ? `Line ${startLine}` : `Lines ${startLine}-${endLine}`;
    return record.label === label ? Object.freeze({ kind: "line_range", label, startLine, endLine }) : null;
  }
  if (kindDescriptor.value === "row") {
    const record = exactRecord(value, ROW_LOCATOR_FIELDS);
    const row = record && integer(record.row, 1, 100_000);
    if (!record || row === null) return null;
    const label = `Row ${row}`;
    return record.label === label ? Object.freeze({ kind: "row", label, row }) : null;
  }
  return null;
}

function sameLocator(left: RenderSafeSourceLocator, right: RenderSafeSourceLocator): boolean {
  return left.kind === right.kind && left.label === right.label
    && (left.kind === "line_range" && right.kind === "line_range"
      ? left.startLine === right.startLine && left.endLine === right.endLine
      : left.kind === "row" && right.kind === "row" && left.row === right.row);
}

function parseScope(value: unknown): KnowledgeEvidenceScope | null {
  const record = exactRecord(value, SCOPE_FIELDS);
  if (!record || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || typeof record.workspaceId !== "string" || !UUID.test(record.workspaceId)
    || typeof record.documentId !== "string" || !UUID.test(record.documentId)
    || typeof record.documentVersionId !== "string" || !UUID.test(record.documentVersionId)
    || typeof record.checksum !== "string" || !SHA256.test(record.checksum)
    || typeof record.scannerPolicyVersion !== "string" || !POLICY_VERSION.test(record.scannerPolicyVersion)) {
    return null;
  }
  return Object.freeze({
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    checksum: record.checksum,
    scannerPolicyVersion: record.scannerPolicyVersion,
  });
}

function parseBinding(value: unknown): ExtractionBinding | null {
  const record = exactRecord(value, BINDING_FIELDS);
  if (!record || typeof record.tenantId !== "string" || !UUID.test(record.tenantId)
    || typeof record.workspaceId !== "string" || !UUID.test(record.workspaceId)
    || typeof record.documentId !== "string" || !UUID.test(record.documentId)
    || typeof record.documentVersionId !== "string" || !UUID.test(record.documentVersionId)
    || typeof record.checksum !== "string" || !SHA256.test(record.checksum)
    || typeof record.scannerPolicyVersion !== "string" || !POLICY_VERSION.test(record.scannerPolicyVersion)
    || typeof record.format !== "string" || !Object.hasOwn(FORMAT_MEDIA_TYPE, record.format)
    || typeof record.mediaType !== "string"
    || record.mediaType !== FORMAT_MEDIA_TYPE[record.format as keyof typeof FORMAT_MEDIA_TYPE]
    || typeof record.parserId !== "string" || !PARSER_ID.test(record.parserId)
    || typeof record.parserVersion !== "string" || !PARSER_VERSION.test(record.parserVersion)
    || record.chunkingAlgorithmVersion !== STRUCTURAL_CHUNKING_ALGORITHM_VERSION) return null;
  const maxChunkUtf8Bytes = integer(record.maxChunkUtf8Bytes, 1, STRUCTURAL_CHUNK_MAX_UTF8_BYTES);
  const maxBlocksPerChunk = integer(record.maxBlocksPerChunk, 1, STRUCTURAL_CHUNK_MAX_BLOCKS);
  if (maxChunkUtf8Bytes === null || maxBlocksPerChunk === null) return null;
  const documentIdentityHash = hashReference([
    "document-identity-v1", record.tenantId, record.workspaceId, record.documentId,
  ] as string[]);
  const versionIdentityHash = hashReference([
    "document-version-v1", documentIdentityHash, record.documentVersionId,
    record.checksum, record.scannerPolicyVersion,
  ] as string[]);
  const parserIdentityHash = hashReference([
    "document-parser-v1", record.parserId, record.parserVersion, record.format, record.mediaType,
  ] as string[]);
  const inputHash = hashReference([
    "knowledge-extraction-input-v1", versionIdentityHash, parserIdentityHash,
    STRUCTURAL_CHUNKING_ALGORITHM_VERSION, String(maxChunkUtf8Bytes), String(maxBlocksPerChunk),
  ]);
  if (record.documentIdentityHash !== documentIdentityHash || record.versionIdentityHash !== versionIdentityHash
    || record.parserIdentityHash !== parserIdentityHash || record.inputHash !== inputHash) return null;
  return Object.freeze({
    tenantId: record.tenantId,
    workspaceId: record.workspaceId,
    documentId: record.documentId,
    documentVersionId: record.documentVersionId,
    checksum: record.checksum,
    scannerPolicyVersion: record.scannerPolicyVersion,
    format: record.format as keyof typeof FORMAT_MEDIA_TYPE,
    mediaType: record.mediaType,
    parserId: record.parserId,
    parserVersion: record.parserVersion,
    chunkingAlgorithmVersion: STRUCTURAL_CHUNKING_ALGORITHM_VERSION,
    maxChunkUtf8Bytes,
    maxBlocksPerChunk,
    documentIdentityHash,
    versionIdentityHash,
    parserIdentityHash,
    inputHash,
  });
}

function parseBlock(value: unknown, ordinal: number): KnowledgeExtractionBlock | null {
  const record = exactRecord(value, BLOCK_FIELDS);
  const sourceLocator = record && parseLocator(record.sourceLocator);
  if (!record || !sourceLocator || record.ordinal !== ordinal || typeof record.kind !== "string"
    || !BLOCK_KINDS.has(record.kind) || typeof record.text !== "string" || record.text.length === 0
    || record.text.length > MAX_BLOCK_CHARS || record.text.trim().length === 0 || hasUnsafeText(record.text)
    || typeof record.contentHash !== "string" || !HASH_REF.test(record.contentHash)
    || record.contentHash !== `sha256:${createHash("sha256").update(record.text, "utf8").digest("hex")}`) return null;
  return Object.freeze({
    kind: record.kind as KnowledgeExtractionBlock["kind"],
    ordinal,
    text: record.text,
    contentHash: record.contentHash,
    sourceLocator,
  });
}

function failed(code: "MALFORMED_INPUT" | "SCOPE_MISMATCH" | "EVIDENCE_MISMATCH"):
KnowledgeEvidenceCitationResult {
  return Object.freeze({ ok: false, code });
}

/**
 * Pure pre-persistence boundary. It validates evidence anchors against one exact
 * extraction version and emits no claims, URLs, I/O, persistence, or model work.
 */
export function createKnowledgeEvidenceCitations(value: unknown): KnowledgeEvidenceCitationResult {
  const input = exactRecord(value, INPUT_FIELDS);
  const scope = input && parseScope(input.scope);
  const extraction = input && exactRecord(input.extraction, EXTRACTION_FIELDS);
  const binding = extraction && parseBinding(extraction.binding);
  const rawBlocks = extraction && exactArray(extraction.blocks, MAX_EXTRACTION_BLOCKS);
  const rawAnchors = input && exactArray(input.anchors, KNOWLEDGE_EVIDENCE_MAX_CITATIONS);
  if (!input || input.version !== 1 || !scope || !extraction || extraction.artifactVersion !== 1
    || !binding || !rawBlocks?.length || !rawAnchors?.length) return failed("MALFORMED_INPUT");

  if (scope.tenantId !== binding.tenantId || scope.workspaceId !== binding.workspaceId
    || scope.documentId !== binding.documentId || scope.documentVersionId !== binding.documentVersionId
    || scope.checksum !== binding.checksum || scope.scannerPolicyVersion !== binding.scannerPolicyVersion) {
    return failed("SCOPE_MISMATCH");
  }

  let totalBlockBytes = 0;
  const blocks: KnowledgeExtractionBlock[] = [];
  for (let ordinal = 0; ordinal < rawBlocks.length; ordinal += 1) {
    const block = parseBlock(rawBlocks[ordinal], ordinal);
    if (!block) return failed("MALFORMED_INPUT");
    totalBlockBytes += Buffer.byteLength(block.text, "utf8");
    if (!Number.isSafeInteger(totalBlockBytes) || totalBlockBytes > DOCUMENT_MAX_BYTES) {
      return failed("MALFORMED_INPUT");
    }
    blocks.push(block);
  }

  const anchors: KnowledgeEvidenceAnchor[] = [];
  const anchorKeys = new Set<string>();
  for (const rawAnchor of rawAnchors) {
    const record = exactRecord(rawAnchor, ANCHOR_FIELDS);
    const blockOrdinal = record && integer(record.blockOrdinal, 0, blocks.length - 1);
    const quoteStart = record && integer(record.quoteStart, 0, MAX_BLOCK_CHARS);
    const quoteEnd = record && integer(record.quoteEnd, 1, MAX_BLOCK_CHARS);
    const sourceLocator = record && parseLocator(record.sourceLocator);
    if (!record || blockOrdinal === null || quoteStart === null || quoteEnd === null || !sourceLocator
      || typeof record.blockContentHash !== "string" || !HASH_REF.test(record.blockContentHash)
      || typeof record.quote !== "string" || record.quote.length === 0 || hasUnsafeText(record.quote)
      || Buffer.byteLength(record.quote, "utf8") > KNOWLEDGE_EVIDENCE_MAX_QUOTE_UTF8_BYTES
      || typeof record.quoteHash !== "string" || !HASH_REF.test(record.quoteHash)) {
      return failed("MALFORMED_INPUT");
    }
    const block = blocks[blockOrdinal];
    const quoteHash = `sha256:${createHash("sha256").update(record.quote, "utf8").digest("hex")}`;
    if (quoteEnd <= quoteStart || quoteEnd > block.text.length
      || record.blockContentHash !== block.contentHash || !sameLocator(sourceLocator, block.sourceLocator)
      || record.quote !== block.text.slice(quoteStart, quoteEnd) || record.quoteHash !== quoteHash) {
      return failed("EVIDENCE_MISMATCH");
    }
    const key = `${blockOrdinal}:${quoteStart}:${quoteEnd}`;
    if (anchorKeys.has(key)) return failed("EVIDENCE_MISMATCH");
    anchorKeys.add(key);
    anchors.push(Object.freeze({
      blockOrdinal,
      blockContentHash: block.contentHash,
      sourceLocator,
      quoteStart,
      quoteEnd,
      quote: record.quote,
      quoteHash,
    }));
  }
  anchors.sort((left, right) => left.blockOrdinal - right.blockOrdinal
    || left.quoteStart - right.quoteStart || left.quoteEnd - right.quoteEnd);

  const evidence: KnowledgeEvidenceRecord[] = [];
  const citations: RenderSafeKnowledgeCitation[] = [];
  for (const anchor of anchors) {
    const locatorJson = JSON.stringify(anchor.sourceLocator);
    const evidenceId = stableId("evidence", [
      "knowledge-evidence-v1", scope.tenantId, scope.workspaceId, scope.documentId,
      scope.documentVersionId, scope.checksum, scope.scannerPolicyVersion, binding.inputHash,
      String(anchor.blockOrdinal), anchor.blockContentHash, locatorJson,
      String(anchor.quoteStart), String(anchor.quoteEnd), anchor.quoteHash,
    ]);
    const record: KnowledgeEvidenceRecord = Object.freeze({
      evidenceVersion: 1,
      evidenceId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      documentId: scope.documentId,
      documentVersionId: scope.documentVersionId,
      checksum: scope.checksum,
      scannerPolicyVersion: scope.scannerPolicyVersion,
      extractionInputHash: binding.inputHash,
      parserId: binding.parserId,
      parserVersion: binding.parserVersion,
      evidenceGrade: "extracted",
      origin: "parser_output",
      blockOrdinal: anchor.blockOrdinal,
      blockContentHash: anchor.blockContentHash,
      sourceLocator: anchor.sourceLocator,
      quoteStart: anchor.quoteStart,
      quoteEnd: anchor.quoteEnd,
      quote: anchor.quote,
      quoteHash: anchor.quoteHash,
    });
    const citationId = stableId("citation", ["knowledge-citation-v1", evidenceId]);
    evidence.push(record);
    citations.push(Object.freeze({
      citationVersion: 1,
      citationId,
      evidenceId,
      state: "resolved",
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      documentId: scope.documentId,
      documentVersionId: scope.documentVersionId,
      quote: anchor.quote,
      quoteHash: anchor.quoteHash,
      sourceLocator: anchor.sourceLocator,
      display: Object.freeze({
        sourceLabel: "Private document",
        locatorLabel: anchor.sourceLocator.label,
      }),
    }));
  }
  return Object.freeze({
    ok: true,
    code: "EVIDENCE_CITATIONS_CREATED",
    evidence: Object.freeze(evidence),
    citations: Object.freeze(citations),
  });
}
