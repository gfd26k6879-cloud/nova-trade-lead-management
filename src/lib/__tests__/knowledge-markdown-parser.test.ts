import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createDocumentParserRegistry,
  MARKDOWN_DOCUMENT_PARSER,
  MARKDOWN_MAX_LINKS,
} from "@/lib/knowledge/parsers";

const VERSION_ID = "00000000-0000-4000-8000-000000000082";

function request(text: string | Uint8Array) {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  return {
    version: 1,
    documentVersionId: VERSION_ID,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    format: "markdown",
    mediaType: "text/markdown",
    bytes,
  } as const;
}

describe("bounded launch Markdown parser", () => {
  it("preserves inert source lines with headings, lists, tables, code, and exact locators", async () => {
    const source = "# Catalog\nIntro [site](https://example.com)\n- Coatings\n\nName | VOC\n--- | ---\nPrimer | Low\n\n```sh\ncurl http://127.0.0.1/private\n```";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(source));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    expect(result).toMatchObject({
      ok: true,
      output: {
        status: "review_required",
        warnings: ["language_gate_pending"],
        blocks: [
          { kind: "heading", text: "# Catalog", locator: { startLine: 1, endLine: 1, headingPath: ["Catalog"] } },
          { kind: "paragraph", text: "Intro [site](https://example.com)", locator: { startLine: 2, headingPath: ["Catalog"] } },
          { kind: "list_item", text: "- Coatings", locator: { startLine: 3 } },
          { kind: "table_row", text: "Name | VOC", locator: { startLine: 5 } },
          { kind: "table_row", text: "Primer | Low", locator: { startLine: 7 } },
          { kind: "code_block", text: "curl http://127.0.0.1/private", locator: { startLine: 10 } },
        ],
      },
    });
    if (!result.ok) return;
    for (const block of result.output.blocks) {
      expect(block.contentHash).toBe(`sha256:${createHash("sha256").update(block.text).digest("hex")}`);
    }
  });

  it.each([
    ["empty", " \n\t"],
    ["C0 control", "safe\u0001unsafe"],
    ["C1 control", "safe\u0085unsafe"],
    ["midstream BOM", "safe\ufeffunsafe"],
    ["long line", "x".repeat(32_768)],
    ["long token", `ok ${"x".repeat(251)}`],
    ["link bomb", "[x](https://example.com)\n".repeat(MARKDOWN_MAX_LINKS + 1)],
    ["HTML link bomb", "<a href=\"https://example.com\">x</a>\n".repeat(MARKDOWN_MAX_LINKS + 1)],
    ["reference link bomb", `${"[x][shared]\n".repeat(MARKDOWN_MAX_LINKS + 1)}[shared]: https://example.com`],
    ["escaped-label link bomb", "[\\]](https://example.com)\n".repeat(MARKDOWN_MAX_LINKS + 1)],
    ["FTP autolink bomb", "<ftp://example.com/file>\n".repeat(MARKDOWN_MAX_LINKS + 1)],
    ["email autolink bomb", "<user@example.com>\n".repeat(MARKDOWN_MAX_LINKS + 1)],
    ["multiline HTML anchor bomb", "<a\nhref=\"https://example.com\">x</a>\n".repeat(MARKDOWN_MAX_LINKS + 1)],
  ])("fails closed for %s", async (_label, source) => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(source)))
      .resolves.toEqual({ ok: false, code: "PARSER_FAILED" });
  });

  it("accepts one leading BOM but rejects malformed UTF-8 and a second BOM", async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("# Safe")]);
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(bom)))
      .resolves.toMatchObject({ ok: true, output: { blocks: [{ text: "# Safe" }] } });
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(new Uint8Array([0xc3, 0x28]))))
      .resolves.toEqual({ ok: false, code: "PARSER_FAILED" });
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(new Uint8Array([0xef, 0xbb, 0xbf, ...bom]))))
      .resolves.toEqual({ ok: false, code: "PARSER_FAILED" });
  });

  it("keeps malformed structure review-only and exposes the exact capability", async () => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request("---\ntitle: Draft\n# Content")))
      .resolves.toMatchObject({ ok: true, output: { status: "review_required", warnings: ["language_gate_pending", "malformed_front_matter"] } });
    expect(MARKDOWN_DOCUMENT_PARSER.capability).toEqual({
      parserId: "launch-markdown-lines",
      parserVersion: "1.0.0",
      formats: ["markdown"],
      mediaTypes: ["text/markdown"],
      maxBytes: 50 * 1024 * 1024,
      maxBlocks: 500_000,
      timeBudgetMs: 90_000,
      networkAccess: "forbidden",
    });
  });

  it("keeps heading paths dense when source levels are skipped", async () => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request("# Root\n### Skipped level")))
      .resolves.toMatchObject({
        ok: true,
        output: { blocks: [
          { locator: { headingPath: ["Root"] } },
          { locator: { headingPath: ["Root", "Skipped level"] } },
        ] },
      });
  });

  it("preserves invalid closing-fence text as inert code until an exact close", async () => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(
      "```\ninside\n```not-a-close\nafter\n```",
    ))).resolves.toMatchObject({
      ok: true,
      output: {
        warnings: ["language_gate_pending"],
        blocks: [
          { kind: "code_block", text: "inside", locator: { startLine: 2 } },
          { kind: "code_block", text: "```not-a-close", locator: { startLine: 3 } },
          { kind: "code_block", text: "after", locator: { startLine: 4 } },
        ],
      },
    });
  });

  it("cooperatively observes cancellation during a large bounded parse", async () => {
    const controller = new AbortController();
    const parse = createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(
      request("bounded line\n".repeat(150_000)),
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 0);
    await expect(parse).resolves.toEqual({ ok: false, code: "CANCELED" });
  });

  it("keeps heading and table syntax inside fences as exact inert code evidence", async () => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(
      "```\n# inert heading\nheader | value\n--- | ---\nrow | value\n```\nafter",
    ))).resolves.toMatchObject({
      ok: true,
      output: { blocks: [
        { kind: "code_block", text: "# inert heading", locator: { startLine: 2, headingPath: [] } },
        { kind: "code_block", text: "header | value", locator: { startLine: 3, headingPath: [] } },
        { kind: "code_block", text: "--- | ---", locator: { startLine: 4, headingPath: [] } },
        { kind: "code_block", text: "row | value", locator: { startLine: 5, headingPath: [] } },
        { kind: "paragraph", text: "after", locator: { startLine: 7, headingPath: [] } },
      ] },
    });
  });

  it("preserves a backtick fence candidate whose info string contains a backtick", async () => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(
      "```bad`info\nafter\n```",
    ))).resolves.toMatchObject({
      ok: true,
      output: { blocks: [
        { kind: "paragraph", text: "```bad`info", locator: { startLine: 1 } },
        { kind: "paragraph", text: "after", locator: { startLine: 2 } },
      ] },
    });
  });

  it("classifies Setext headings and carries their heading path", async () => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(
      "Catalog\n=======\nBody\nDetails\n-------\nMore",
    ))).resolves.toMatchObject({
      ok: true,
      output: { blocks: [
        { kind: "heading", text: "Catalog", locator: { startLine: 1, headingPath: ["Catalog"] } },
        { kind: "paragraph", text: "Body", locator: { startLine: 3, headingPath: ["Catalog"] } },
        { kind: "heading", text: "Details", locator: { startLine: 4, headingPath: ["Catalog", "Details"] } },
        { kind: "paragraph", text: "More", locator: { startLine: 6, headingPath: ["Catalog", "Details"] } },
      ] },
    });
  });

  it("preserves an unmatched table-separator-looking line as evidence", async () => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(
      "Context\n--- | ---\nEvidence",
    ))).resolves.toMatchObject({
      ok: true,
      output: { blocks: [
        { text: "Context", locator: { startLine: 1 } },
        { kind: "paragraph", text: "--- | ---", locator: { startLine: 2 } },
        { text: "Evidence", locator: { startLine: 3 } },
      ] },
    });
  });

  it.each([
    ["ATX heading", "# A | B\n--- | ---\nEvidence", ["heading", "paragraph", "paragraph"]],
    ["list item", "- A | B\n--- | ---\nEvidence", ["list_item", "paragraph", "paragraph"]],
    ["blockquote", "> A | B\n--- | ---\nEvidence", ["paragraph", "paragraph", "paragraph"]],
    ["too many delimiter cells", "A | B\n--- | --- | ---\nEvidence", ["paragraph", "paragraph", "paragraph"]],
    ["too few delimiter cells", "A | B | C\n--- | ---\nEvidence", ["paragraph", "paragraph", "paragraph"]],
  ])("preserves a separator after an ineligible or mismatched %s", async (_label, source, kinds) => {
    const result = await createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(source));
    expect(result).toMatchObject({
      ok: true,
      output: {
        blocks: [
          { text: source.split("\n")[0], locator: { startLine: 1 } },
          { kind: "paragraph", text: source.split("\n")[1], locator: { startLine: 2 } },
          { text: "Evidence", locator: { startLine: 3 } },
        ],
      },
    });
    if (!result.ok) return;
    expect(result.output.blocks.map((block) => block.kind)).toEqual(kinds);
  });

  it("matches effective table cells while ignoring escaped and inline-code pipes", async () => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(
      "Name \\| alias | Example `a|b` | Status\n--- | --- | ---\nPrimer | `x|y` | Ready",
    ))).resolves.toMatchObject({
      ok: true,
      output: { blocks: [
        { kind: "table_row", locator: { startLine: 1 } },
        { kind: "table_row", locator: { startLine: 3 } },
      ] },
    });
  });

  it("stops a table body at a new block boundary", async () => {
    await expect(createDocumentParserRegistry([MARKDOWN_DOCUMENT_PARSER]).parse(request(
      "A | B\n--- | ---\n1 | 2\n- outside | list\n> outside | quote",
    ))).resolves.toMatchObject({
      ok: true,
      output: { blocks: [
        { kind: "table_row", text: "A | B" },
        { kind: "table_row", text: "1 | 2" },
        { kind: "list_item", text: "- outside | list" },
        { kind: "paragraph", text: "> outside | quote" },
      ] },
    });
  });
});
