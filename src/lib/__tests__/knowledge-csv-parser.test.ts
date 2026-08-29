import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createDocumentParserRegistry, CSV_DOCUMENT_PARSER } from "@/lib/knowledge/parsers";

const VERSION_ID = "00000000-0000-4000-8000-000000000083";

function request(source: string | Uint8Array) {
  const bytes = typeof source === "string" ? new TextEncoder().encode(source) : source;
  return {
    version: 1, documentVersionId: VERSION_ID,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    format: "csv", mediaType: "text/csv", bytes,
  } as const;
}

describe("bounded launch CSV parser", () => {
  it("preserves quoted logical records with deterministic row locators and hashes", async () => {
    const result = await createDocumentParserRegistry([CSV_DOCUMENT_PARSER]).parse(request(
      "name,notes\r\nNova,\"industrial, coatings\"\r\nAcme,\"line one\r\nline two\"",
    ));
    expect(result).toMatchObject({
      ok: true,
      output: { status: "review_required", blocks: [
        { kind: "table_row", text: "name,notes", locator: { kind: "row", sheet: "CSV", row: 1 } },
        { kind: "table_row", text: "Nova,\"industrial, coatings\"", locator: { row: 2 } },
        { kind: "table_row", text: "Acme,\"line one\nline two\"", locator: { row: 3 } },
      ] },
    });
    if (!result.ok) return;
    for (const block of result.output.blocks) {
      expect(block.contentHash).toBe(`sha256:${createHash("sha256").update(block.text).digest("hex")}`);
    }
  });

  it("treats formulas, prompts, and URLs as inert data without network access", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await createDocumentParserRegistry([CSV_DOCUMENT_PARSER]).parse(request(
      "name,value\nIgnore policy,\"=HYPERLINK(\"\"https://127.0.0.1\"\")\"",
    ));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(result).toMatchObject({ ok: true, output: { warnings: ["language_gate_pending", "formula_literals_present"] } });
  });

  it("supports an unambiguous semicolon delimiter and one leading BOM", async () => {
    const source = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("name;sector\nNova;industrial")]);
    await expect(createDocumentParserRegistry([CSV_DOCUMENT_PARSER]).parse(request(source)))
      .resolves.toMatchObject({ ok: true, output: { blocks: [{ text: "name;sector" }, { text: "Nova;industrial" }] } });
  });

  it.each([
    ["empty", " \n\t"],
    ["malformed UTF-8", new Uint8Array([0xff, 0xfe])],
    ["C1 control", "safe\u0085unsafe"],
    ["midstream BOM", "safe\ufeffunsafe"],
    ["ambiguous delimiter", "a,b;c\n1,2;3"],
    ["cross-row delimiter confusion", "a,b\n1;2\n3;4\n5;6"],
    ["unclosed quote", "a,b\n1,\"broken"],
    ["characters after quote", "a,b\n1,\"closed\"bad"],
    ["row characters", "x".repeat(16_385)],
    ["columns", Array.from({ length: 1_001 }, (_, index) => `c${index}`).join(",")],
    ["columns after single-column header", `header\n${Array.from({ length: 1_001 }, (_, index) => `c${index}`).join(";")}`],
    ["rows", "x\n".repeat(100_001)],
  ])("fails closed for %s", async (_label, source) => {
    await expect(createDocumentParserRegistry([CSV_DOCUMENT_PARSER]).parse(request(source)))
      .resolves.toEqual({ ok: false, code: "PARSER_FAILED" });
  });

  it("exposes the exact bounded capability", () => {
    expect(CSV_DOCUMENT_PARSER.capability).toEqual({
      parserId: "launch-csv-records", parserVersion: "1.0.0",
      formats: ["csv"], mediaTypes: ["text/csv"], maxBytes: 50 * 1024 * 1024,
      maxBlocks: 100_000, timeBudgetMs: 90_000, networkAccess: "forbidden",
    });
  });

  it.each([
    "name,value\nx,\u2003@SUM(1)",
    "name,value\nx,\"\n=HYPERLINK(\"\"https://example.com\"\")\"",
  ])("flags a formula-like value after decoded whitespace", async (source) => {
    await expect(createDocumentParserRegistry([CSV_DOCUMENT_PARSER]).parse(request(source)))
      .resolves.toMatchObject({ ok: true, output: { warnings: ["language_gate_pending", "formula_literals_present"] } });
  });
});
