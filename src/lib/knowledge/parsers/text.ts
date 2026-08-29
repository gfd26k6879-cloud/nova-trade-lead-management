import { createHash } from "node:crypto";

import { DOCUMENT_MAX_BYTES } from "@/lib/documents/validation";

import type { DocumentParser, NormalizedDocumentBlock, ParserOutput } from "./types";

export const TEXT_MAX_LINES = 500_000;
export const TEXT_MAX_LINE_CHARS = 32_767;
export const TEXT_MAX_TOKEN_CHARS = 250;

const INVALID_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufeff]/u;
const OVERSIZED_TOKEN = new RegExp(`\\S{${TEXT_MAX_TOKEN_CHARS + 1}}`, "u");

async function parseLaunchText(context: Parameters<DocumentParser["parse"]>[0]): Promise<ParserOutput> {
  if (context.signal.aborted) throw new Error("text parse canceled");
  const decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(context.bytes);
  if (INVALID_CONTROL.test(decoded)) throw new Error("text contains binary control bytes");
  const normalized = decoded.replace(/\r\n?/gu, "\n");
  const lines = normalized.split("\n");
  if (lines.length > TEXT_MAX_LINES) throw new Error("text line limit exceeded");

  const blocks: NormalizedDocumentBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if ((index & 1023) === 0 && context.signal.aborted) throw new Error("text parse canceled");
    const line = lines[index];
    if (line.length > TEXT_MAX_LINE_CHARS) throw new Error("text line limit exceeded");
    if (OVERSIZED_TOKEN.test(line)) throw new Error("text token span limit exceeded");
    if (line.trim().length === 0) continue;
    blocks.push({
      kind: "paragraph",
      ordinal: blocks.length,
      text: line,
      contentHash: `sha256:${createHash("sha256").update(line, "utf8").digest("hex")}`,
      locator: { kind: "line_range", startLine: index + 1, endLine: index + 1, headingPath: [] },
    });
  }
  if (blocks.length === 0) throw new Error("text parser cannot return empty success");
  return {
    parserId: "launch-text-lines",
    parserVersion: "1.0.0",
    // Extraction is deterministic, but language acceptance is a separate gate.
    status: "review_required",
    blocks,
    warnings: ["language_gate_pending"],
    quality: { score: 0.99, reviewRequired: true },
  };
}

export const TEXT_DOCUMENT_PARSER: DocumentParser = Object.freeze({
  capability: Object.freeze({
    parserId: "launch-text-lines",
    parserVersion: "1.0.0",
    formats: Object.freeze(["txt"] as const),
    mediaTypes: Object.freeze(["text/plain"] as const),
    maxBytes: DOCUMENT_MAX_BYTES,
    maxBlocks: TEXT_MAX_LINES,
    timeBudgetMs: 60_000,
    networkAccess: "forbidden" as const,
  }),
  parse: parseLaunchText,
});
