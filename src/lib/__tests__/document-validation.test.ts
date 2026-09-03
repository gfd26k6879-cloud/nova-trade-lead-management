import { describe, expect, it } from "vitest";

import {
  DOCUMENT_MAX_BYTES,
  IMAGE_MAX_BYTES,
  validateDocumentFile,
  validateDocumentReservation,
} from "@/lib/documents";

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const validJpeg = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0xff, 0xd9,
]);
const validPng = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x44, 0x41, 0x54, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0x00, 0x00, 0x00, 0x00,
]);

function storedZip(entryNames: readonly string[]): Uint8Array {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let localOffset = 0;

  for (const entryName of entryNames) {
    const name = Buffer.from(entryName, "utf8");
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local);

    const directory = Buffer.alloc(46 + name.length);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(localOffset, 42);
    name.copy(directory, 46);
    central.push(directory);
    localOffset += local.length;
  }

  const centralSize = central.reduce((size, entry) => size + entry.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entryNames.length, 8);
  end.writeUInt16LE(entryNames.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, ...central, end]);
}

const supportedFiles = [
  {
    label: "PDF",
    fileName: "product-sheet.pdf",
    mediaType: "application/pdf",
    bytes: bytes("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"),
    format: "pdf",
  },
  {
    label: "DOCX",
    fileName: "brochure.docx",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: storedZip(["[Content_Types].xml", "word/document.xml"]),
    format: "docx",
  },
  {
    label: "XLSX",
    fileName: "catalog.xlsx",
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: storedZip(["[Content_Types].xml", "xl/workbook.xml"]),
    format: "xlsx",
  },
  {
    label: "CSV",
    fileName: "targets.csv",
    mediaType: "text/csv",
    bytes: bytes("name,company\nAda,Nova Trade\n"),
    format: "csv",
  },
  {
    label: "plain text",
    fileName: "notes.txt",
    mediaType: "text/plain",
    bytes: bytes("Product specifications and launch notes.\n"),
    format: "txt",
  },
  {
    label: "Markdown",
    fileName: "pricing.md",
    mediaType: "text/markdown",
    bytes: bytes("# Pricing\n\nLaunch terms.\n"),
    format: "markdown",
  },
  {
    label: "JPEG",
    fileName: "label.jpeg",
    mediaType: "image/jpeg",
    bytes: validJpeg,
    format: "jpeg",
  },
  {
    label: "PNG",
    fileName: "diagram.png",
    mediaType: "image/png",
    bytes: validPng,
    format: "png",
  },
] as const;

describe("document intake validation", () => {
  it.each(supportedFiles)("accepts a representative $label upload", (fixture) => {
    expect(
      validateDocumentFile({
        fileName: fixture.fileName,
        declaredMediaType: fixture.mediaType,
        declaredByteSize: fixture.bytes.byteLength,
        bytes: fixture.bytes,
      }),
    ).toMatchObject({
      format: fixture.format,
      mediaType: fixture.mediaType,
      byteSize: fixture.bytes.byteLength,
    });
  });

  it("rejects a PDF filename and MIME paired with executable bytes", () => {
    const executable = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);

    expect(() =>
      validateDocumentFile({
        fileName: "spoofed.pdf",
        declaredMediaType: "application/pdf",
        declaredByteSize: executable.byteLength,
        bytes: executable,
      }),
    ).toThrow(expect.objectContaining({ code: "malformed_signature" }));
  });

  it("rejects marker-only OOXML and a header-only PDF", () => {
    const fakeDocx = bytes("PK\u0003\u0004garbage [Content_Types].xml word/document.xml");
    const fakePdf = bytes("%PDF-not-a-document");

    expect(() => validateDocumentFile({
      fileName: "fake.docx",
      declaredMediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      declaredByteSize: fakeDocx.byteLength,
      bytes: fakeDocx,
    })).toThrow(expect.objectContaining({ code: "malformed_signature" }));
    expect(() => validateDocumentFile({
      fileName: "fake.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: fakePdf.byteLength,
      bytes: fakePdf,
    })).toThrow(expect.objectContaining({ code: "malformed_signature" }));
  });

  it("rejects case-varied PDF active content", () => {
    const content = bytes("%PDF-1.7\n1 0 obj\n<< /javascript 2 0 R /openaction 3 0 R >>\nendobj\n%%EOF");

    expect(() => validateDocumentFile({
      fileName: "active.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: content.byteLength,
      bytes: content,
    })).toThrow(expect.objectContaining({ code: "active_content" }));
  });

  it("rejects PDF additional-actions dictionaries", () => {
    const content = bytes("%PDF-1.7\n1 0 obj\n<< /aa 2 0 R >>\nendobj\n%%EOF");

    expect(() => validateDocumentFile({
      fileName: "additional-actions.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: content.byteLength,
      bytes: content,
    })).toThrow(expect.objectContaining({ code: "active_content" }));
  });

  it("rejects hex-escaped PDF active-content names", () => {
    const content = bytes("%PDF-1.7\n1 0 obj\n<< /Java#53cript 2 0 R /Open#41ction 3 0 R >>\nendobj\n%%EOF");
    expect(() => validateDocumentFile({
      fileName: "escaped-active.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: content.byteLength,
      bytes: content,
    })).toThrow(expect.objectContaining({ code: "active_content" }));
  });

  it("rejects invalid UTF-8 text and header-only images", () => {
    const cases = [
      { fileName: "bad.txt", mediaType: "text/plain", bytes: new Uint8Array([0xff, 0xfe, 0xfd]) },
      { fileName: "bad.jpg", mediaType: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff]) },
      { fileName: "bad.png", mediaType: "image/png", bytes: validPng.subarray(0, 8) },
    ];
    for (const fixture of cases) {
      expect(() => validateDocumentFile({
        fileName: fixture.fileName,
        declaredMediaType: fixture.mediaType,
        declaredByteSize: fixture.bytes.byteLength,
        bytes: fixture.bytes,
      })).toThrow(expect.objectContaining({ code: "malformed_signature" }));
    }
  });

  it("maps a malformed media type to a stable intake error", () => {
    expect(() => validateDocumentReservation({
      fileName: "document.pdf",
      declaredMediaType: 42,
      declaredByteSize: 100,
    } as unknown as Parameters<typeof validateDocumentReservation>[0])).toThrow(
      expect.objectContaining({ code: "type_mismatch" }),
    );
  });

  it("rejects an extension and MIME mismatch before accepting bytes", () => {
    const content = bytes("name,company\nAda,Nova Trade\n");

    expect(() =>
      validateDocumentFile({
        fileName: "targets.csv",
        declaredMediaType: "application/pdf",
        declaredByteSize: content.byteLength,
        bytes: content,
      }),
    ).toThrow(expect.objectContaining({ code: "type_mismatch" }));
  });

  it("rejects an upload reservation one byte over the global 50 MiB limit", () => {
    expect(() =>
      validateDocumentReservation({
        fileName: "large.pdf",
        declaredMediaType: "application/pdf",
        declaredByteSize: DOCUMENT_MAX_BYTES + 1,
      }),
    ).toThrow(expect.objectContaining({ code: "size_limit_exceeded" }));
  });

  it("rejects an image reservation one byte over the 20 MiB image limit", () => {
    expect(() =>
      validateDocumentReservation({
        fileName: "large.png",
        declaredMediaType: "image/png",
        declaredByteSize: IMAGE_MAX_BYTES + 1,
      }),
    ).toThrow(expect.objectContaining({ code: "size_limit_exceeded" }));
  });

  it("rejects unsupported archive inputs even when the MIME is plausible", () => {
    expect(() =>
      validateDocumentReservation({
        fileName: "documents.zip",
        declaredMediaType: "application/zip",
        declaredByteSize: 1024,
      }),
    ).toThrow(expect.objectContaining({ code: "unsupported_type" }));
  });

  it.each([
    {
      label: "PDF encryption dictionary",
      fileName: "protected.pdf",
      mediaType: "application/pdf",
      bytes: bytes("%PDF-1.7\n1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n%%EOF"),
    },
    {
      label: "encrypted OOXML OLE package",
      fileName: "protected.xlsx",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      bytes: new Uint8Array([
        0xd0,
        0xcf,
        0x11,
        0xe0,
        0xa1,
        0xb1,
        0x1a,
        0xe1,
        ...bytes("EncryptionInfo EncryptedPackage"),
      ]),
    },
  ])("rejects $label", (fixture) => {
    expect(() =>
      validateDocumentFile({
        fileName: fixture.fileName,
        declaredMediaType: fixture.mediaType,
        declaredByteSize: fixture.bytes.byteLength,
        bytes: fixture.bytes,
      }),
    ).toThrow(expect.objectContaining({ code: "encrypted_document" }));
  });

  it("rejects macro content hidden inside an OOXML package", () => {
    const content = storedZip(["[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"]);

    expect(() =>
      validateDocumentFile({
        fileName: "brochure.docx",
        declaredMediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        declaredByteSize: content.byteLength,
        bytes: content,
      }),
    ).toThrow(expect.objectContaining({ code: "active_content" }));
  });

  it("rejects a declared size that does not match the uploaded bytes", () => {
    const content = bytes("plain text");

    expect(() =>
      validateDocumentFile({
        fileName: "notes.txt",
        declaredMediaType: "text/plain",
        declaredByteSize: content.byteLength + 1,
        bytes: content,
      }),
    ).toThrow(expect.objectContaining({ code: "size_mismatch" }));
  });
});
