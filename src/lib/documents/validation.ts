import { createHash } from "node:crypto";
import { isSharedArrayBuffer } from "node:util/types";

import { DocumentIntakeError } from "./errors";

export const DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;
export const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export type LaunchDocumentFormat =
  | "pdf"
  | "docx"
  | "xlsx"
  | "csv"
  | "txt"
  | "markdown"
  | "jpeg"
  | "png";

type FormatPolicy = Readonly<{
  format: LaunchDocumentFormat;
  extensions: readonly string[];
  mediaType: string;
  maxBytes: number;
}>;

const FORMAT_POLICIES: readonly FormatPolicy[] = [
  { format: "pdf", extensions: ["pdf"], mediaType: "application/pdf", maxBytes: DOCUMENT_MAX_BYTES },
  {
    format: "docx",
    extensions: ["docx"],
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  {
    format: "xlsx",
    extensions: ["xlsx"],
    mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  { format: "csv", extensions: ["csv"], mediaType: "text/csv", maxBytes: DOCUMENT_MAX_BYTES },
  { format: "txt", extensions: ["txt"], mediaType: "text/plain", maxBytes: DOCUMENT_MAX_BYTES },
  {
    format: "markdown",
    extensions: ["md", "markdown"],
    mediaType: "text/markdown",
    maxBytes: DOCUMENT_MAX_BYTES,
  },
  { format: "jpeg", extensions: ["jpg", "jpeg"], mediaType: "image/jpeg", maxBytes: IMAGE_MAX_BYTES },
  { format: "png", extensions: ["png"], mediaType: "image/png", maxBytes: IMAGE_MAX_BYTES },
] as const;

export type DocumentReservationInput = Readonly<{
  fileName: string;
  declaredMediaType: string;
  declaredByteSize: number;
}>;

export type DocumentFileInput = DocumentReservationInput &
  Readonly<{
    bytes: Uint8Array;
  }>;

export type ValidatedDocumentReservation = Readonly<{
  format: LaunchDocumentFormat;
  mediaType: string;
  byteSize: number;
  maxBytes: number;
}>;

export type ValidatedDocumentFile = ValidatedDocumentReservation &
  Readonly<{
    checksum: string;
    checksumAlgorithm: "sha256";
  }>;

function extensionOf(fileName: string): string | null {
  if (typeof fileName !== "string" || !fileName.trim() || /[\u0000-\u001f\u007f]/u.test(fileName)) {
    return null;
  }
  const match = /\.([^.]+)$/u.exec(fileName.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

export function validateDocumentReservation(
  input: DocumentReservationInput,
): ValidatedDocumentReservation {
  const extension = extensionOf(input.fileName);
  const policy = FORMAT_POLICIES.find((candidate) =>
    extension === null ? false : candidate.extensions.includes(extension),
  );

  if (!policy) {
    throw new DocumentIntakeError("unsupported_type", "The file extension is not supported at launch.");
  }

  if (typeof input.declaredMediaType !== "string") {
    throw new DocumentIntakeError(
      "type_mismatch",
      "The declared media type does not match the file extension.",
    );
  }
  const mediaType = input.declaredMediaType.trim().toLowerCase();
  if (mediaType !== policy.mediaType) {
    throw new DocumentIntakeError(
      "type_mismatch",
      "The declared media type does not match the file extension.",
    );
  }

  if (!Number.isSafeInteger(input.declaredByteSize) || input.declaredByteSize <= 0) {
    throw new DocumentIntakeError("empty_file", "A document must have a positive integer byte size.");
  }

  if (input.declaredByteSize > policy.maxBytes) {
    throw new DocumentIntakeError(
      "size_limit_exceeded",
      "The document exceeds the launch size limit for its format.",
    );
  }

  return {
    format: policy.format,
    mediaType: policy.mediaType,
    byteSize: input.declaredByteSize,
    maxBytes: policy.maxBytes,
  };
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function containsBytes(bytes: Uint8Array, marker: string): boolean {
  const needle = new TextEncoder().encode(marker);
  if (needle.byteLength > bytes.byteLength) return false;

  outer: for (let offset = 0; offset <= bytes.byteLength - needle.byteLength; offset += 1) {
    for (let index = 0; index < needle.byteLength; index += 1) {
      if (bytes[offset + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

function isZip(bytes: Uint8Array): boolean {
  return (
    startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWith(bytes, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWith(bytes, [0x50, 0x4b, 0x07, 0x08])
  );
}

function readUint16(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.byteLength) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
}

function readUint32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function zipEntryNames(bytes: Uint8Array): ReadonlySet<string> | null {
  if (!isZip(bytes) || bytes.byteLength < 22) return null;
  const minimumOffset = Math.max(0, bytes.byteLength - 65_557);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (readUint32(bytes, offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) return null;

  const entryCount = readUint16(bytes, endOffset + 10);
  const centralSize = readUint32(bytes, endOffset + 12);
  const centralOffset = readUint32(bytes, endOffset + 16);
  if (entryCount === null || entryCount <= 0 || centralSize === null || centralOffset === null
    || centralOffset + centralSize !== endOffset) return null;

  const names = new Set<string>();
  let totalUncompressedBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32(bytes, offset) !== 0x02014b50) return null;
    const flags = readUint16(bytes, offset + 8);
    const uncompressedSize = readUint32(bytes, offset + 24);
    const nameLength = readUint16(bytes, offset + 28);
    const extraLength = readUint16(bytes, offset + 30);
    const commentLength = readUint16(bytes, offset + 32);
    const localOffset = readUint32(bytes, offset + 42);
    if (flags === null || uncompressedSize === null || nameLength === null
      || extraLength === null || commentLength === null || localOffset === null
      || (flags & 0x1) !== 0 || readUint32(bytes, localOffset) !== 0x04034b50) return null;

    const nameStart = offset + 46;
    const nextOffset = nameStart + nameLength + extraLength + commentLength;
    if (nextOffset > endOffset || uncompressedSize > DOCUMENT_MAX_BYTES) return null;
    totalUncompressedBytes += uncompressedSize;
    if (!Number.isSafeInteger(totalUncompressedBytes) || totalUncompressedBytes > DOCUMENT_MAX_BYTES * 2) return null;

    let name: string;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(nameStart, nameStart + nameLength));
    } catch {
      return null;
    }
    const normalized = name.replaceAll("\\", "/").toLowerCase();
    if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..") || names.has(normalized)) {
      return null;
    }
    names.add(normalized);
    offset = nextOffset;
  }
  return offset === endOffset ? names : null;
}

function hexNibble(value: number): number {
  if (value >= 0x30 && value <= 0x39) return value - 0x30;
  if (value >= 0x41 && value <= 0x46) return value - 0x41 + 10;
  if (value >= 0x61 && value <= 0x66) return value - 0x61 + 10;
  return -1;
}

function containsPdfName(bytes: Uint8Array, marker: string): boolean {
  const target = marker.toLowerCase();
  for (let offset = 0; offset < bytes.byteLength; offset += 1) {
    if (bytes[offset] !== 0x2f) continue;
    let position = offset;
    let matched = true;
    for (let index = 0; index < target.length; index += 1) {
      let value = bytes[position];
      if (value === 0x23 && position + 2 < bytes.byteLength) {
        const high = hexNibble(bytes[position + 1]);
        const low = hexNibble(bytes[position + 2]);
        if (high >= 0 && low >= 0) {
          value = high * 16 + low;
          position += 3;
        } else position += 1;
      } else position += 1;
      if (value >= 0x41 && value <= 0x5a) value += 0x20;
      if (value !== target.charCodeAt(index)) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function assertText(bytes: Uint8Array): void {
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new DocumentIntakeError("malformed_signature", "The declared text file is not valid UTF-8.");
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\ufeff]/u.test(decoded)) {
    throw new DocumentIntakeError(
      "malformed_signature",
      "The declared text file contains binary control bytes or a misplaced BOM.",
    );
  }
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.byteLength) return null;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function assertJpeg(bytes: Uint8Array): void {
  if (!startsWith(bytes, [0xff, 0xd8]) || bytes.byteLength < 16) {
    throw new DocumentIntakeError("malformed_signature", "The JPEG structure is incomplete.");
  }
  let offset = 2;
  let hasFrame = false;
  let hasScan = false;
  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) break;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9) {
      if (!hasFrame || !hasScan || offset !== bytes.byteLength) break;
      return;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = offset + 2 <= bytes.byteLength ? (bytes[offset] << 8) | bytes[offset + 1] : 0;
    if (length < 2 || offset + length > bytes.byteLength) break;
    const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame) {
      if (length < 8) break;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (width < 1 || height < 1 || width > 7680 || height > 7680 || width * height > 20_000_000) break;
      hasFrame = true;
    }
    if (marker === 0xda) {
      hasScan = true;
      if (bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9 && hasFrame) return;
      break;
    }
    offset += length;
  }
  throw new DocumentIntakeError("malformed_signature", "The JPEG structure is incomplete or invalid.");
}

function assertPng(bytes: Uint8Array): void {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || bytes.byteLength < 57
    || readUint32BigEndian(bytes, 8) !== 13
    || new TextDecoder("latin1").decode(bytes.subarray(12, 16)) !== "IHDR") {
    throw new DocumentIntakeError("malformed_signature", "The PNG structure is incomplete.");
  }
  const width = readUint32BigEndian(bytes, 16);
  const height = readUint32BigEndian(bytes, 20);
  if (!width || !height || width > 7680 || height > 7680 || width * height > 20_000_000) {
    throw new DocumentIntakeError("malformed_signature", "The PNG dimensions exceed launch bounds.");
  }
  let offset = 8;
  let hasImageData = false;
  while (offset + 12 <= bytes.byteLength) {
    const length = readUint32BigEndian(bytes, offset);
    if (length === null || offset + 12 + length > bytes.byteLength) break;
    const type = new TextDecoder("latin1").decode(bytes.subarray(offset + 4, offset + 8));
    if (type === "IDAT") hasImageData = true;
    offset += 12 + length;
    if (type === "IEND" && length === 0 && hasImageData && offset === bytes.byteLength) return;
  }
  throw new DocumentIntakeError("malformed_signature", "The PNG chunk structure is incomplete or invalid.");
}

function assertOfficePackage(bytes: Uint8Array, format: "docx" | "xlsx"): void {
  const isOleEncryptedPackage =
    startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) &&
    (containsBytes(bytes, "EncryptionInfo") || containsBytes(bytes, "EncryptedPackage"));
  if (isOleEncryptedPackage) {
    throw new DocumentIntakeError(
      "encrypted_document",
      "Encrypted or password-protected documents are not supported at launch.",
    );
  }

  const entries = zipEntryNames(bytes);
  if (!entries) {
    throw new DocumentIntakeError(
      "malformed_signature",
      "The Office document does not have an OOXML container signature.",
    );
  }

  if (entries.has("encryptioninfo") || entries.has("encryptedpackage")) {
    throw new DocumentIntakeError(
      "encrypted_document",
      "Encrypted or password-protected documents are not supported at launch.",
    );
  }

  if ([...entries].some((entry) => entry.endsWith("vbaproject.bin"))) {
    throw new DocumentIntakeError(
      "active_content",
      "Macro-enabled Office documents are not supported at launch.",
    );
  }

  const requiredPart = format === "docx" ? "word/document.xml" : "xl/workbook.xml";
  if (!entries.has("[content_types].xml") || !entries.has(requiredPart)) {
    throw new DocumentIntakeError(
      "malformed_signature",
      "The OOXML container does not match the declared document type.",
    );
  }
}

function assertSignature(format: LaunchDocumentFormat, bytes: Uint8Array): void {
  switch (format) {
    case "pdf":
      if (!/^%PDF-1\.[0-9]/u.test(new TextDecoder("latin1").decode(bytes.subarray(0, 8)))
        || !containsBytes(bytes, "%%EOF")
        || !/\b\d+\s+\d+\s+obj\b/u.test(new TextDecoder("latin1").decode(bytes))) {
        throw new DocumentIntakeError("malformed_signature", "The PDF signature is missing.");
      }
      if (containsPdfName(bytes, "/encrypt")) {
        throw new DocumentIntakeError(
          "encrypted_document",
          "Encrypted or password-protected PDFs are not supported at launch.",
        );
      }
      if (["/javascript", "/launch", "/openaction", "/embeddedfile", "/aa"].some((marker) => containsPdfName(bytes, marker))) {
        throw new DocumentIntakeError(
          "active_content",
          "PDF active content is not supported at launch.",
        );
      }
      return;
    case "docx":
    case "xlsx":
      assertOfficePackage(bytes, format);
      return;
    case "jpeg":
      assertJpeg(bytes);
      return;
    case "png":
      assertPng(bytes);
      return;
    case "csv":
    case "txt":
    case "markdown":
      assertText(bytes);
  }
}

export function validateDocumentFile(input: DocumentFileInput): ValidatedDocumentFile {
  const reservation = validateDocumentReservation(input);

  if (!(input.bytes instanceof Uint8Array)
    || isSharedArrayBuffer(input.bytes.buffer)
    || input.bytes.byteLength === 0) {
    throw new DocumentIntakeError("empty_file", "The uploaded document has no bytes.");
  }
  if (input.bytes.byteLength !== input.declaredByteSize) {
    throw new DocumentIntakeError(
      "size_mismatch",
      "The uploaded byte size does not match the reservation.",
    );
  }

  const snapshot = new Uint8Array(input.bytes);
  assertSignature(reservation.format, snapshot);

  return {
    ...reservation,
    checksum: createHash("sha256").update(snapshot).digest("hex"),
    checksumAlgorithm: "sha256",
  };
}
