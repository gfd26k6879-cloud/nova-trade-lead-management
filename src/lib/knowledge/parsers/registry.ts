import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { DOCUMENT_MAX_BYTES, type LaunchDocumentFormat } from "@/lib/documents/validation";

import type {
  DocumentParser,
  DocumentParserCapability,
  DocumentParserContext,
  DocumentParserRegistry,
  NormalizedDocumentBlock,
  ParseDocumentRequest,
  ParseDocumentResult,
  ParserOutput,
  ParserLocator,
} from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256 = /^[0-9a-f]{64}$/u;
const HASH_REF = /^sha256:[0-9a-f]{64}$/u;
const TOKEN = /^[a-z0-9][a-z0-9._-]{0,127}$/u;
const VERSION = /^[a-z0-9][a-z0-9._+-]{0,63}$/u;
const MEDIA_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;
const FORMATS: readonly LaunchDocumentFormat[] = [
  "pdf", "docx", "xlsx", "csv", "txt", "markdown", "jpeg", "png",
];
const FORMAT_SET = new Set<string>(FORMATS);
const REQUEST_FIELDS = ["version", "documentVersionId", "checksum", "format", "mediaType", "bytes"] as const;
const CAPABILITY_FIELDS = [
  "parserId", "parserVersion", "formats", "mediaTypes", "maxBytes", "maxBlocks", "timeBudgetMs", "networkAccess",
] as const;
const OUTPUT_FIELDS = ["parserId", "parserVersion", "status", "blocks", "warnings", "quality"] as const;
const BLOCK_FIELDS = ["kind", "ordinal", "text", "contentHash", "locator"] as const;
const LINE_LOCATOR_FIELDS = ["kind", "startLine", "endLine", "headingPath"] as const;
const PAGE_LOCATOR_FIELDS = ["kind", "page", "block"] as const;
const SECTION_LOCATOR_FIELDS = ["kind", "sectionPath", "block"] as const;
const ROW_LOCATOR_FIELDS = ["kind", "sheet", "row"] as const;
const CELL_LOCATOR_FIELDS = ["kind", "sheet", "row", "column"] as const;
const QUALITY_FIELDS = ["score", "reviewRequired"] as const;
const BLOCK_KINDS = new Set(["heading", "paragraph", "list_item", "table_row", "code_block"]);
const ABORTED_GETTER = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")?.get;
const ADD_EVENT_LISTENER = EventTarget.prototype.addEventListener;
const REMOVE_EVENT_LISTENER = EventTarget.prototype.removeEventListener;

type PlainRecord = Record<string, unknown>;

function exactRecord(value: unknown, fields: readonly string[]): PlainRecord | null {
  try {
    if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    const expected = new Set(fields);
    if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !expected.has(key))) return null;
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
    if (!Array.isArray(value) || isProxy(value) || value.length > maximum) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === "symbol" || (key !== "length" && !/^(0|[1-9][0-9]*)$/u.test(key)))) return null;
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

function boundedString(value: unknown, maximum: number): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value) return null;
  return value;
}

function safeInteger(value: unknown, minimum: number, maximum: number): number | null {
  return Number.isSafeInteger(value) && (value as number) >= minimum && (value as number) <= maximum
    ? value as number
    : null;
}

function safeAbortSignal(value: unknown): AbortSignal | null {
  try {
    if (!(value instanceof AbortSignal) || isProxy(value) || Object.getPrototypeOf(value) !== AbortSignal.prototype
      || Reflect.ownKeys(Object.getOwnPropertyDescriptors(value)).some((key) => typeof key === "string")
      || !ABORTED_GETTER) return null;
    ABORTED_GETTER.call(value);
    return value;
  } catch {
    return null;
  }
}

function isAborted(signal: AbortSignal): boolean {
  return ABORTED_GETTER?.call(signal) === true;
}

function capability(value: unknown): DocumentParserCapability | null {
  const record = exactRecord(value, CAPABILITY_FIELDS);
  if (!record) return null;
  const parserId = boundedString(record.parserId, 128);
  const parserVersion = boundedString(record.parserVersion, 64);
  const rawFormats = exactArray(record.formats, FORMATS.length);
  const rawMediaTypes = exactArray(record.mediaTypes, FORMATS.length);
  const maxBytes = safeInteger(record.maxBytes, 1, DOCUMENT_MAX_BYTES);
  const maxBlocks = safeInteger(record.maxBlocks, 1, 1_000_000);
  const timeBudgetMs = safeInteger(record.timeBudgetMs, 1, 90_000);
  if (!parserId || !TOKEN.test(parserId) || !parserVersion || !VERSION.test(parserVersion)
    || !rawFormats?.length || rawFormats.length !== rawMediaTypes?.length
    || maxBytes === null || maxBlocks === null || timeBudgetMs === null || record.networkAccess !== "forbidden") return null;
  const formats: LaunchDocumentFormat[] = [];
  const mediaTypes: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < rawFormats.length; index += 1) {
    const format = rawFormats[index];
    const mediaType = rawMediaTypes[index];
    if (typeof format !== "string" || !FORMAT_SET.has(format) || typeof mediaType !== "string"
      || !MEDIA_TYPE.test(mediaType) || mediaType !== mediaType.toLowerCase()) return null;
    const signature = `${format}\u0000${mediaType}`;
    if (seen.has(signature)) return null;
    seen.add(signature);
    formats.push(format as LaunchDocumentFormat);
    mediaTypes.push(mediaType);
  }
  return Object.freeze({
    parserId, parserVersion, formats: Object.freeze(formats), mediaTypes: Object.freeze(mediaTypes),
    maxBytes, maxBlocks, timeBudgetMs, networkAccess: "forbidden",
  });
}

function parseRequest(value: unknown): ParseDocumentRequest | null {
  const record = exactRecord(value, REQUEST_FIELDS);
  if (!record || record.version !== 1 || typeof record.documentVersionId !== "string" || !UUID.test(record.documentVersionId)
    || record.documentVersionId !== record.documentVersionId.toLowerCase() || typeof record.checksum !== "string"
    || !SHA256.test(record.checksum) || typeof record.format !== "string" || !FORMAT_SET.has(record.format)
    || typeof record.mediaType !== "string" || !MEDIA_TYPE.test(record.mediaType)
    || record.mediaType !== record.mediaType.toLowerCase() || !(record.bytes instanceof Uint8Array)
    || isProxy(record.bytes)) return null;
  try {
    const bytes = new Uint8Array(record.bytes);
    if (createHash("sha256").update(bytes).digest("hex") !== record.checksum) return null;
    return {
      version: 1,
      documentVersionId: record.documentVersionId,
      checksum: record.checksum,
      format: record.format as LaunchDocumentFormat,
      mediaType: record.mediaType,
      bytes,
    };
  } catch {
    return null;
  }
}

function path(value: unknown, maximum = 20): readonly string[] | null {
  const values = exactArray(value, maximum);
  if (!values) return null;
  const result: string[] = [];
  for (const entry of values) {
    const parsed = boundedString(entry, 500);
    if (!parsed) return null;
    result.push(parsed);
  }
  return Object.freeze(result);
}

function parseLocator(value: unknown): ParserLocator | null {
  if (typeof value !== "object" || value === null || isProxy(value) || Array.isArray(value)) return null;
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (!kindDescriptor || !("value" in kindDescriptor) || !kindDescriptor.enumerable) return null;
  const kind = kindDescriptor.value;
  if (kind === "line_range") {
    const record = exactRecord(value, LINE_LOCATOR_FIELDS);
    const headingPath = record && path(record.headingPath);
    const startLine = record && safeInteger(record.startLine, 1, 500_000);
    const endLine = record && safeInteger(record.endLine, 1, 500_000);
    return record && headingPath && startLine !== null && endLine !== null && endLine >= startLine
      ? Object.freeze({ kind, startLine, endLine, headingPath }) : null;
  }
  if (kind === "page") {
    const record = exactRecord(value, PAGE_LOCATOR_FIELDS);
    const page = record && safeInteger(record.page, 1, 500);
    const block = record && safeInteger(record.block, 0, 1_000_000);
    return record && page !== null && block !== null ? Object.freeze({ kind, page, block }) : null;
  }
  if (kind === "section") {
    const record = exactRecord(value, SECTION_LOCATOR_FIELDS);
    const sectionPath = record && path(record.sectionPath);
    const block = record && safeInteger(record.block, 0, 1_000_000);
    return record && sectionPath?.length && block !== null ? Object.freeze({ kind, sectionPath, block }) : null;
  }
  if (kind === "row" || kind === "cell") {
    const record = exactRecord(value, kind === "row" ? ROW_LOCATOR_FIELDS : CELL_LOCATOR_FIELDS);
    const sheet = record && boundedString(record.sheet, 255);
    const row = record && safeInteger(record.row, 1, 100_000);
    if (!record || !sheet || row === null) return null;
    if (kind === "row") return Object.freeze({ kind, sheet, row });
    const column = boundedString(record.column, 16);
    return column && /^[A-Z]{1,4}$/u.test(column) ? Object.freeze({ kind, sheet, row, column }) : null;
  }
  return null;
}

function parseOutput(value: unknown, parser: DocumentParserCapability): ParserOutput | null {
  const record = exactRecord(value, OUTPUT_FIELDS);
  if (!record || record.parserId !== parser.parserId || record.parserVersion !== parser.parserVersion
    || (record.status !== "complete" && record.status !== "review_required")) return null;
  const rawBlocks = exactArray(record.blocks, parser.maxBlocks);
  const rawWarnings = exactArray(record.warnings, 100);
  const quality = exactRecord(record.quality, QUALITY_FIELDS);
  if (!rawBlocks?.length || !rawWarnings || !quality || typeof quality.score !== "number"
    || !Number.isFinite(quality.score) || quality.score < 0 || quality.score > 1
    || typeof quality.reviewRequired !== "boolean"
    || (record.status === "complete" && quality.reviewRequired)
    || (record.status === "review_required" && !quality.reviewRequired)) return null;

  const warnings: string[] = [];
  for (const warning of rawWarnings) {
    const parsed = boundedString(warning, 500);
    if (!parsed) return null;
    warnings.push(parsed);
  }
  const blocks: NormalizedDocumentBlock[] = [];
  for (let index = 0; index < rawBlocks.length; index += 1) {
    const block = exactRecord(rawBlocks[index], BLOCK_FIELDS);
    const locator = block && parseLocator(block.locator);
    const text = block && boundedString(block.text, 32_767);
    if (!block || !locator || !text || !BLOCK_KINDS.has(String(block.kind))
      || block.ordinal !== index || typeof block.contentHash !== "string" || !HASH_REF.test(block.contentHash)
      || block.contentHash !== `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`) return null;
    blocks.push(Object.freeze({
      kind: block.kind as NormalizedDocumentBlock["kind"],
      ordinal: index,
      text,
      contentHash: block.contentHash,
      locator,
    }));
  }
  return Object.freeze({
    parserId: parser.parserId,
    parserVersion: parser.parserVersion,
    status: record.status,
    blocks: Object.freeze(blocks),
    warnings: Object.freeze(warnings),
    quality: Object.freeze({ score: quality.score, reviewRequired: quality.reviewRequired }),
  }) as ParserOutput;
}

function failed(code: Exclude<ParseDocumentResult["code"], "PARSED">): ParseDocumentResult {
  return Object.freeze({ ok: false, code });
}

export function createDocumentParserRegistry(parsers: readonly DocumentParser[]): DocumentParserRegistry {
  if (!Array.isArray(parsers) || parsers.length === 0 || parsers.length > 32) throw new Error("Invalid parser capability set.");
  const signatures = new Map<string, {
    parse: (context: DocumentParserContext) => Promise<unknown>;
    capability: DocumentParserCapability;
  }>();
  for (const candidate of parsers) {
    let parsed: DocumentParserCapability | null = null;
    let parse: ((context: DocumentParserContext) => Promise<unknown>) | null = null;
    try {
      if (!candidate || typeof candidate !== "object" || isProxy(candidate)) throw new Error("unsafe parser");
      const capabilityDescriptor = Object.getOwnPropertyDescriptor(candidate, "capability");
      const parseDescriptor = Object.getOwnPropertyDescriptor(candidate, "parse");
      if (!capabilityDescriptor || !("value" in capabilityDescriptor) || !capabilityDescriptor.enumerable
        || !parseDescriptor || !("value" in parseDescriptor) || typeof parseDescriptor.value !== "function"
        || isProxy(parseDescriptor.value)) {
        throw new Error("unsafe parser");
      }
      parsed = capability(capabilityDescriptor.value);
      parse = parseDescriptor.value as (context: DocumentParserContext) => Promise<unknown>;
    } catch {
      parsed = null;
      parse = null;
    }
    if (!parsed || !parse) throw new Error("Invalid parser capability.");
    for (let index = 0; index < parsed.formats.length; index += 1) {
      const signature = `${parsed.formats[index]}\u0000${parsed.mediaTypes[index]}`;
      if (signatures.has(signature)) throw new Error("Duplicate parser signature ownership.");
      signatures.set(signature, { parse, capability: parsed });
    }
  }

  return Object.freeze({
    async parse(rawRequest: unknown, rawOptions?: unknown): Promise<ParseDocumentResult> {
      const request = parseRequest(rawRequest);
      if (!request) return failed("MALFORMED_REQUEST");
      let signal: AbortSignal | undefined;
      if (rawOptions !== undefined) {
        const options = exactRecord(rawOptions, ["signal"]);
        const parsedSignal = options && safeAbortSignal(options.signal);
        if (!parsedSignal) return failed("MALFORMED_REQUEST");
        signal = parsedSignal;
      }
      const formatPrefix = `${request.format}\u0000`;
      const selected = signatures.get(`${formatPrefix}${request.mediaType}`);
      if (!selected) {
        return failed([...signatures.keys()].some((signature) => signature.startsWith(formatPrefix))
          ? "SIGNATURE_MISMATCH"
          : "UNSUPPORTED_FORMAT");
      }
      if (request.bytes.byteLength > selected.capability.maxBytes) return failed("RESOURCE_LIMIT_EXCEEDED");
      if (signal && isAborted(signal)) return failed("CANCELED");

      const controller = new AbortController();
      const abort = () => controller.abort();
      if (signal) ADD_EVENT_LISTENER.call(signal, "abort", abort, { once: true });
      if (signal && isAborted(signal)) abort();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, selected.capability.timeBudgetMs);
      const context: DocumentParserContext = Object.freeze({
        documentVersionId: request.documentVersionId,
        checksum: request.checksum,
        format: request.format,
        mediaType: request.mediaType,
        bytes: new Uint8Array(request.bytes),
        signal: controller.signal,
      });
      try {
        const rawOutput = await Promise.race([
          selected.parse(context),
          new Promise<never>((_resolve, reject) => {
            controller.signal.addEventListener("abort", () => reject(new Error("parser aborted")), { once: true });
          }),
        ]);
        const output = parseOutput(rawOutput, selected.capability);
        return output ? Object.freeze({
          ok: true,
          code: "PARSED",
          binding: Object.freeze({
            documentVersionId: request.documentVersionId,
            checksum: request.checksum,
            format: request.format,
            mediaType: request.mediaType,
          }),
          output,
        }) : failed("INVALID_PARSER_OUTPUT");
      } catch {
        if (timedOut) return failed("TIME_BUDGET_EXCEEDED");
        if (signal && isAborted(signal)) return failed("CANCELED");
        return failed("PARSER_FAILED");
      } finally {
        clearTimeout(timer);
        if (signal) REMOVE_EVENT_LISTENER.call(signal, "abort", abort);
      }
    },
  });
}
