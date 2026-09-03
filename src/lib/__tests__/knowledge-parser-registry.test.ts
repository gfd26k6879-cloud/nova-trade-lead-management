import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createDocumentParserRegistry,
  type DocumentParser,
  type ParserOutput,
} from "@/lib/knowledge/parsers";

const VERSION_ID = "00000000-0000-4000-8000-000000000071";
const CONTENT = "Specialty coatings for industrial floors.";
const CHECKSUM = createHash("sha256").update(CONTENT).digest("hex");

function output(overrides: Partial<ParserOutput> = {}): ParserOutput {
  return {
    parserId: "fixture-text",
    parserVersion: "1.0.0",
    status: "complete",
    blocks: [{
      kind: "paragraph",
      ordinal: 0,
      text: CONTENT,
      contentHash: `sha256:${createHash("sha256").update(CONTENT).digest("hex")}`,
      locator: { kind: "line_range", startLine: 1, endLine: 1, headingPath: [] },
    }],
    warnings: [],
    quality: { score: 1, reviewRequired: false },
    ...overrides,
  };
}

function parser(overrides: Partial<DocumentParser> = {}): DocumentParser {
  return {
    capability: {
      parserId: "fixture-text",
      parserVersion: "1.0.0",
      formats: ["txt", "markdown"],
      mediaTypes: ["text/plain", "text/markdown"],
      maxBytes: 1024,
      maxBlocks: 100,
      timeBudgetMs: 100,
      networkAccess: "forbidden",
    },
    parse: vi.fn(async () => output()),
    ...overrides,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    documentVersionId: VERSION_ID,
    checksum: CHECKSUM,
    format: "txt",
    mediaType: "text/plain",
    bytes: new TextEncoder().encode(CONTENT),
    ...overrides,
  };
}

describe("bounded document parser registry", () => {
  it("selects one exact validated signature and gives the parser only bounded local context", async () => {
    const fixture = parser();
    const registry = createDocumentParserRegistry([fixture]);

    const result = await registry.parse(request());

    expect(result).toMatchObject({
      ok: true,
      code: "PARSED",
      binding: { documentVersionId: VERSION_ID, checksum: CHECKSUM, format: "txt", mediaType: "text/plain" },
      output: { status: "complete" },
    });
    expect(fixture.parse).toHaveBeenCalledOnce();
    const context = vi.mocked(fixture.parse).mock.calls[0][0];
    expect(Object.keys(context).sort()).toEqual([
      "bytes", "checksum", "documentVersionId", "format", "mediaType", "signal",
    ]);
    expect(context).not.toHaveProperty("fetch");
  });

  it("returns typed failures for unsupported or mismatched signatures without invoking a parser", async () => {
    const fixture = parser();
    const registry = createDocumentParserRegistry([fixture]);

    await expect(registry.parse(request({ format: "pdf", mediaType: "application/pdf" })))
      .resolves.toEqual({ ok: false, code: "UNSUPPORTED_FORMAT" });
    await expect(registry.parse(request({ mediaType: "text/markdown" })))
      .resolves.toEqual({ ok: false, code: "SIGNATURE_MISMATCH" });
    expect(fixture.parse).not.toHaveBeenCalled();
  });

  it("enforces byte and cancellation bounds before parser work", async () => {
    const fixture = parser();
    const registry = createDocumentParserRegistry([fixture]);
    const controller = new AbortController();
    controller.abort();

    const oversized = new Uint8Array(1025);
    await expect(registry.parse(request({
      bytes: oversized,
      checksum: createHash("sha256").update(oversized).digest("hex"),
    })))
      .resolves.toEqual({ ok: false, code: "RESOURCE_LIMIT_EXCEEDED" });
    await expect(registry.parse(request(), { signal: controller.signal }))
      .resolves.toEqual({ ok: false, code: "CANCELED" });
    expect(fixture.parse).not.toHaveBeenCalled();
  });

  it("bounds the caller wait and cooperatively aborts a parser that never settles", async () => {
    const fixture = parser({
      capability: { ...parser().capability, timeBudgetMs: 1 },
      parse: async () => new Promise<never>(() => undefined),
    });

    await expect(createDocumentParserRegistry([fixture]).parse(request()))
      .resolves.toEqual({ ok: false, code: "TIME_BUDGET_EXCEEDED" });
  });

  it("fails closed on accessor-backed requests and parser output", async () => {
    const fixture = parser();
    const unsafeRequest = {
      ...request(),
      get mediaType(): string { throw new Error("accessor executed"); },
    };
    await expect(createDocumentParserRegistry([fixture]).parse(unsafeRequest))
      .resolves.toEqual({ ok: false, code: "MALFORMED_REQUEST" });
    expect(fixture.parse).not.toHaveBeenCalled();

    const unsafeOutput = parser({
      parse: async () => ({ ...output(), get blocks(): ParserOutput["blocks"] { throw new Error("accessor executed"); } }),
    });
    await expect(createDocumentParserRegistry([unsafeOutput]).parse(request()))
      .resolves.toEqual({ ok: false, code: "INVALID_PARSER_OUTPUT" });
  });

  it("binds the declared source checksum to bytes and each block hash to its exact text", async () => {
    await expect(createDocumentParserRegistry([parser()]).parse(request({ checksum: "a".repeat(64) })))
      .resolves.toEqual({ ok: false, code: "MALFORMED_REQUEST" });
    const forgedBlock = parser({
      parse: async () => output({ blocks: [{ ...output().blocks[0], contentHash: `sha256:${"b".repeat(64)}` }] }),
    });
    await expect(createDocumentParserRegistry([forgedBlock]).parse(request()))
      .resolves.toEqual({ ok: false, code: "INVALID_PARSER_OUTPUT" });
  });

  it("accepts stable page, section, row, and cell locator variants", async () => {
    const locators = [
      { kind: "page", page: 2, block: 0 },
      { kind: "section", sectionPath: ["Products", "Coatings"], block: 1 },
      { kind: "row", sheet: "Catalog", row: 4 },
      { kind: "cell", sheet: "Catalog", row: 4, column: "B" },
    ] as const;
    for (const locator of locators) {
      const fixture = parser({
        parse: async () => output({ blocks: [{ ...output().blocks[0], locator }] }),
      });
      await expect(createDocumentParserRegistry([fixture]).parse(request()))
        .resolves.toMatchObject({ ok: true, output: { blocks: [{ locator }] } });
    }
  });

  it("snapshots parser execution and rejects accessor-backed options", async () => {
    const fixture = parser();
    const registry = createDocumentParserRegistry([fixture]);
    (fixture as { parse: DocumentParser["parse"] }).parse = async () => { throw new Error("mutated parser"); };
    await expect(registry.parse(request())).resolves.toMatchObject({ ok: true, code: "PARSED" });
    await expect(registry.parse(request(), {
      get signal(): AbortSignal { throw new Error("accessor executed"); },
    })).resolves.toEqual({ ok: false, code: "MALFORMED_REQUEST" });

    const controller = new AbortController();
    let abortedReads = 0;
    Object.defineProperty(controller.signal, "aborted", {
      enumerable: true,
      get() { abortedReads += 1; throw new Error("accessor executed"); },
    });
    await expect(registry.parse(request(), { signal: controller.signal }))
      .resolves.toEqual({ ok: false, code: "MALFORMED_REQUEST" });
    expect(abortedReads).toBe(0);
  });

  it("fails closed on empty success and output that is not bound to its parser", async () => {
    const empty = parser({ parse: async () => output({ blocks: [] }) });
    await expect(createDocumentParserRegistry([empty]).parse(request()))
      .resolves.toEqual({ ok: false, code: "INVALID_PARSER_OUTPUT" });

    const wrongVersion = parser({ parse: async () => output({ parserVersion: "2.0.0" }) });
    await expect(createDocumentParserRegistry([wrongVersion]).parse(request()))
      .resolves.toEqual({ ok: false, code: "INVALID_PARSER_OUTPUT" });
  });

  it("rejects duplicate format/media ownership and malformed capabilities", () => {
    expect(() => createDocumentParserRegistry([parser(), parser()])).toThrow(/duplicate parser/i);
    expect(() => createDocumentParserRegistry([parser({
      capability: { ...parser().capability, networkAccess: "allowed" as "forbidden" },
    })])).toThrow(/capability/i);
    expect(() => createDocumentParserRegistry([parser({
      parse: new Proxy(async () => output(), { apply: (target, thisArg, args) => Reflect.apply(target, thisArg, args) }),
    })])).toThrow(/capability/i);
  });

  it("returns isolated deeply frozen parser output with stable line locators", async () => {
    const mutable = output();
    const registry = createDocumentParserRegistry([parser({ parse: async () => mutable })]);
    const result = await registry.parse(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    (mutable.blocks[0] as { text: string }).text = "changed after return";
    expect(result.output.blocks[0].text).toBe(CONTENT);
    expect(Object.isFrozen(result.output)).toBe(true);
    expect(Object.isFrozen(result.output.blocks)).toBe(true);
    const locator = result.output.blocks[0].locator;
    expect(locator.kind).toBe("line_range");
    if (locator.kind === "line_range") expect(Object.isFrozen(locator.headingPath)).toBe(true);
  });
});
