import { createHash } from "node:crypto";

import { DOCUMENT_MAX_BYTES } from "@/lib/documents/validation";

import type { DocumentParser, NormalizedDocumentBlock, ParserOutput } from "./types";

export const CSV_MAX_ROWS = 100_000;
export const CSV_MAX_COLUMNS = 1_000;
export const CSV_MAX_ROW_CHARS = 16_384;

const INVALID_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufeff]/u;
const DELIMITERS = [",", "\t", ";"] as const;

function delimiterCounts(line: string): Map<string, number> {
  const counts = new Map<string, number>(DELIMITERS.map((delimiter) => [delimiter, 0]));
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && counts.has(line[index])) {
      counts.set(line[index], (counts.get(line[index]) ?? 0) + 1);
    }
  }
  return counts;
}

function detectDelimiter(text: string): string {
  const ranked = [...delimiterCounts(text)].sort((left, right) => right[1] - left[1]);
  if (ranked[0][1] === 0) return ",";
  if (ranked[1][1] / ranked[0][1] > 0.05) throw new Error("CSV delimiter is ambiguous");
  return ranked[0][0];
}

function isFieldPrefixWhitespace(value: string): boolean {
  return /^\s$/u.test(value);
}

async function parseLaunchCsv(context: Parameters<DocumentParser["parse"]>[0]): Promise<ParserOutput> {
  if (context.signal.aborted) throw new Error("CSV parse canceled");
  const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(context.bytes);
  if (INVALID_CONTROL.test(decoded)) throw new Error("CSV contains binary control bytes or misplaced BOM");
  const normalized = decoded.replace(/\r\n?/gu, "\n");
  const delimiter = detectDelimiter(normalized);
  const blocks: NormalizedDocumentBlock[] = [];
  let rowStart = 0;
  let rowNumber = 1;
  let columns = 1;
  let quoted = false;
  let atFieldStart = true;
  let afterQuote = false;
  let formulaLiteral = false;

  function finishRow(end: number): void {
    const row = normalized.slice(rowStart, end);
    if (row.length > CSV_MAX_ROW_CHARS) throw new Error("CSV row limit exceeded");
    if (columns > CSV_MAX_COLUMNS) throw new Error("CSV column limit exceeded");
    if (rowNumber > CSV_MAX_ROWS) throw new Error("CSV row count exceeded");
    if (row.trim().length > 0) {
      blocks.push({
        kind: "table_row",
        ordinal: blocks.length,
        text: row,
        contentHash: `sha256:${createHash("sha256").update(row, "utf8").digest("hex")}`,
        locator: { kind: "row", sheet: "CSV", row: rowNumber },
      });
    }
    rowNumber += 1;
    rowStart = end + 1;
    columns = 1;
    atFieldStart = true;
    afterQuote = false;
  }

  for (let index = 0; index < normalized.length; index += 1) {
    if ((index & 65_535) === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (context.signal.aborted) throw new Error("CSV parse canceled");
    }
    const character = normalized[index];
    if (quoted) {
      if (character === '"') {
        if (normalized[index + 1] === '"') index += 1;
        else {
          quoted = false;
          afterQuote = true;
        }
      } else if (atFieldStart && !isFieldPrefixWhitespace(character)) {
        if (character === "=" || character === "+" || character === "-" || character === "@") formulaLiteral = true;
        atFieldStart = false;
      }
      continue;
    }
    if (character === '"') {
      if (!atFieldStart || afterQuote) throw new Error("CSV quoting is malformed");
      quoted = true;
      continue;
    }
    if (character === delimiter) {
      columns += 1;
      atFieldStart = true;
      afterQuote = false;
      continue;
    }
    if (character === "\n") {
      finishRow(index);
      continue;
    }
    if (afterQuote && !isFieldPrefixWhitespace(character)) throw new Error("CSV quoting is malformed");
    if (atFieldStart && !isFieldPrefixWhitespace(character)) {
      if (character === "=" || character === "+" || character === "-" || character === "@") formulaLiteral = true;
      atFieldStart = false;
    }
  }
  if (quoted) throw new Error("CSV quoting is malformed");
  if (rowStart < normalized.length) finishRow(normalized.length);
  if (blocks.length === 0) throw new Error("CSV parser cannot return empty success");
  const warnings = ["language_gate_pending", ...(formulaLiteral ? ["formula_literals_present"] : [])];
  return {
    parserId: "launch-csv-records",
    parserVersion: "1.0.0",
    status: "review_required",
    blocks,
    warnings,
    quality: { score: formulaLiteral ? 0.97 : 0.99, reviewRequired: true },
  };
}

export const CSV_DOCUMENT_PARSER: DocumentParser = Object.freeze({
  capability: Object.freeze({
    parserId: "launch-csv-records",
    parserVersion: "1.0.0",
    formats: Object.freeze(["csv"] as const),
    mediaTypes: Object.freeze(["text/csv"] as const),
    maxBytes: DOCUMENT_MAX_BYTES,
    maxBlocks: CSV_MAX_ROWS,
    timeBudgetMs: 90_000,
    networkAccess: "forbidden" as const,
  }),
  parse: parseLaunchCsv,
});
