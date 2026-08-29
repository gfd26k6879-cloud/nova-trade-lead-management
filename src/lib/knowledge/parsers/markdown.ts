import { createHash } from "node:crypto";

import { DOCUMENT_MAX_BYTES } from "@/lib/documents/validation";

import { TEXT_MAX_LINE_CHARS, TEXT_MAX_LINES, TEXT_MAX_TOKEN_CHARS } from "./text";
import type { DocumentParser, NormalizedDocumentBlock, ParserOutput } from "./types";

export const MARKDOWN_MAX_LINKS = 5_000;

const INVALID_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufeff]/u;
const OVERSIZED_TOKEN = new RegExp(`\\S{${TEXT_MAX_TOKEN_CHARS + 1}}`, "u");
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/u;
const HEADING = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u;
const LIST_ITEM = /^\s{0,3}(?:[-+*]|\d+[.)])\s+/u;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u;

function referenceLabel(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function matchCount(line: string, expression: RegExp): number {
  return Array.from(line.matchAll(expression)).length;
}

function countLinks(line: string, definitions: ReadonlySet<string>): number {
  let count = 0;
  for (let index = 0; index < line.length - 1; index += 1) {
    if (line[index] === "]" && (line[index + 1] === "(" || line[index + 1] === "[")) count += 1;
  }
  count += matchCount(line, /<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^<>\s]*>/gu);
  count += matchCount(line, /<[^<>\s]+@[^<>\s]+>/gu);
  count += matchCount(line, /<a(?=\s|>|$)/giu);
  for (const match of line.matchAll(/!?\[([^\]\n]{1,1000})\]/gu)) {
    const start = match.index;
    const end = start + match[0].length;
    if (line[end] === "(" || line[end] === "[" || line[end] === ":" || line[start - 1] === "]") continue;
    if (definitions.has(referenceLabel(match[1]))) count += 1;
  }
  return count;
}

function tableRows(lines: readonly string[]): ReadonlySet<number> {
  const rows = new Set<number>();
  for (let index = 1; index < lines.length; index += 1) {
    if (!TABLE_SEPARATOR.test(lines[index]) || !lines[index - 1].includes("|")) continue;
    rows.add(index - 1);
    for (let row = index + 1; row < lines.length && lines[row].includes("|") && lines[row].trim(); row += 1) {
      rows.add(row);
    }
  }
  return rows;
}

async function parseLaunchMarkdown(context: Parameters<DocumentParser["parse"]>[0]): Promise<ParserOutput> {
  if (context.signal.aborted) throw new Error("markdown parse canceled");
  const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(context.bytes);
  if (INVALID_CONTROL.test(decoded)) throw new Error("markdown contains binary control bytes or misplaced BOM");
  const lines = decoded.replace(/\r\n?/gu, "\n").split("\n");
  if (lines.length > TEXT_MAX_LINES) throw new Error("markdown line limit exceeded");

  const definitions = new Set<string>();
  let openFence: { marker: string; length: number } | null = null;
  const codeLines = new Set<number>();
  const fenceDelimiters = new Set<number>();
  const warnings = ["language_gate_pending"];
  for (let index = 0; index < lines.length; index += 1) {
    if ((index & 1023) === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (context.signal.aborted) throw new Error("markdown parse canceled");
    }
    const line = lines[index];
    if (line.length > TEXT_MAX_LINE_CHARS) throw new Error("markdown line limit exceeded");
    if (OVERSIZED_TOKEN.test(line)) throw new Error("markdown token span limit exceeded");
    const definition = /^\s{0,3}\[([^\]\n]{1,1000})\]:\s*\S+/u.exec(line);
    if (definition) definitions.add(referenceLabel(definition[1]));
    const fence = FENCE.exec(line);
    if (openFence && fence?.[1][0] === openFence.marker && fence[1].length >= openFence.length
      && fence[2].trim().length === 0) {
      openFence = null;
      fenceDelimiters.add(index);
      continue;
    }
    if (openFence) {
      codeLines.add(index);
      continue;
    }
    if (fence && !(fence[1][0] === "`" && fence[2].includes("`"))) {
      openFence = { marker: fence[1][0], length: fence[1].length };
      fenceDelimiters.add(index);
    }
  }
  if (openFence) warnings.push("malformed_fence");
  if (lines[0]?.trim() === "---" && !lines.slice(1).some((line) => line.trim() === "---" || line.trim() === "...")) {
    warnings.push("malformed_front_matter");
  }

  let links = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (!codeLines.has(index) && !fenceDelimiters.has(index)) links += countLinks(lines[index], definitions);
    if (links > MARKDOWN_MAX_LINKS) throw new Error("markdown link limit exceeded");
  }

  const markdownTableRows = tableRows(lines);
  const setextHeadings = new Map<number, { level: number; text: string }>();
  const setextUnderlines = new Set<number>();
  for (let index = 0; index + 1 < lines.length; index += 1) {
    if (!lines[index].trim() || codeLines.has(index) || codeLines.has(index + 1)
      || fenceDelimiters.has(index) || fenceDelimiters.has(index + 1)) continue;
    const underline = /^ {0,3}(=+|-+)\s*$/u.exec(lines[index + 1]);
    if (!underline) continue;
    setextHeadings.set(index, { level: underline[1][0] === "=" ? 1 : 2, text: lines[index].trim() });
    setextUnderlines.add(index + 1);
  }
  const headings: string[] = [];
  const blocks: NormalizedDocumentBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if ((index & 1023) === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      if (context.signal.aborted) throw new Error("markdown parse canceled");
    }
    const line = lines[index];
    if (!line.trim() || fenceDelimiters.has(index) || setextUnderlines.has(index)
      || (!codeLines.has(index) && TABLE_SEPARATOR.test(line))) continue;
    const atxHeading = codeLines.has(index) ? null : HEADING.exec(line);
    const heading = atxHeading
      ? { level: atxHeading[1].length, text: atxHeading[2] }
      : setextHeadings.get(index) ?? null;
    if (heading) {
      headings.length = Math.min(heading.level - 1, headings.length);
      headings.push(heading.text);
    }
    const kind = codeLines.has(index) ? "code_block"
      : heading ? "heading"
        : markdownTableRows.has(index) ? "table_row"
          : LIST_ITEM.test(line) ? "list_item" : "paragraph";
    blocks.push({
      kind,
      ordinal: blocks.length,
      text: line,
      contentHash: `sha256:${createHash("sha256").update(line, "utf8").digest("hex")}`,
      locator: { kind: "line_range", startLine: index + 1, endLine: index + 1, headingPath: [...headings] },
    });
  }
  if (blocks.length === 0) throw new Error("markdown parser cannot return empty success");
  return {
    parserId: "launch-markdown-lines",
    parserVersion: "1.0.0",
    status: "review_required",
    blocks,
    warnings,
    quality: { score: warnings.length === 1 ? 0.99 : 0.9, reviewRequired: true },
  };
}

export const MARKDOWN_DOCUMENT_PARSER: DocumentParser = Object.freeze({
  capability: Object.freeze({
    parserId: "launch-markdown-lines",
    parserVersion: "1.0.0",
    formats: Object.freeze(["markdown"] as const),
    mediaTypes: Object.freeze(["text/markdown"] as const),
    maxBytes: DOCUMENT_MAX_BYTES,
    maxBlocks: TEXT_MAX_LINES,
    timeBudgetMs: 90_000,
    networkAccess: "forbidden" as const,
  }),
  parse: parseLaunchMarkdown,
});
