import "server-only";

import { isProxy } from "node:util/types";

import type {
  DocumentStorageAdapter,
  StorageUploadRequest,
  UploadReservation,
} from "./adapters";
import { MAX_SIGNED_UPLOAD_SECONDS } from "./adapters";
import { DocumentIntakeError } from "./errors";
import { buildDocumentObjectKey } from "./object-keys";
import { DOCUMENT_MAX_BYTES } from "./validation";

const CANONICAL_UUID =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const QUARANTINE_OBJECT_KEY = new RegExp(
  `^tenants/(${CANONICAL_UUID})/documents/(${CANONICAL_UUID})/versions/(${CANONICAL_UUID})/original$`,
  "u",
);
const SAFE_BUCKET_NAME = /^[a-z0-9](?:[a-z0-9_-]{0,62})$/u;
const SAFE_MEDIA_TYPE =
  /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u;
const QUARANTINE_OBJECT_CLASS = "quarantine-original" as const;
const MAX_ALLOWLIST_ENTRIES = 32;

export type SupabaseQuarantineUploadMetadata = Readonly<{
  tenantId: string;
  documentId: string;
  versionId: string;
  objectClass: typeof QUARANTINE_OBJECT_CLASS;
  expectedMediaType: string;
  maxBytes: number;
}>;

export type SupabasePrivateUploadReservationRequest = Readonly<{
  bucket: string;
  objectKey: string;
  expiresAt: string;
  visibility: "private";
  upsert: false;
  metadata: SupabaseQuarantineUploadMetadata;
}>;

export interface SupabasePrivateStorageBucketClient {
  createSignedUploadReservation(
    request: SupabasePrivateUploadReservationRequest,
  ): Promise<unknown>;
}

export interface SupabaseStorageClientLike {
  readonly storage: Readonly<{
    from(bucket: string): SupabasePrivateStorageBucketClient;
  }>;
}

export type SupabaseDocumentStorageAdapterOptions = Readonly<{
  bucket: string;
  allowedBuckets: readonly string[];
  serviceOrigin: string;
  allowedOrigins: readonly string[];
}>;

type ParsedUploadRequest = Readonly<{
  objectKey: string;
  expectedMediaType: string;
  maxBytes: number;
  expiresInSeconds: typeof MAX_SIGNED_UPLOAD_SECONDS;
  metadata: SupabaseQuarantineUploadMetadata;
}>;

type ActiveReservation = {
  readonly expectedMediaType: string;
  readonly maxBytes: number;
  readonly expiresAtMs: number;
  readonly promise: Promise<UploadReservation>;
};

type ConfiguredBoundary = Readonly<{
  bucket: string;
  serviceOrigin: string;
}>;

function storageBoundaryError(): DocumentIntakeError {
  return new DocumentIntakeError(
    "storage_boundary_error",
    "The storage adapter did not return a safe, exact upload capability.",
  );
}

function dataRecord(
  value: unknown,
  required: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || isProxy(value)) return null;

  try {
    if (Array.isArray(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = new Set(required);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key))) return null;
    if (required.some((key) => !Object.hasOwn(descriptors, key))) return null;

    const snapshot: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!("value" in descriptor) || !descriptor.enumerable) return null;
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function safeStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || isProxy(value)) return null;

  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      !lengthDescriptor ||
      !("value" in lengthDescriptor) ||
      !Number.isSafeInteger(lengthDescriptor.value)
    ) {
      return null;
    }
    const length = lengthDescriptor.value as number;
    if (length < 1 || length > MAX_ALLOWLIST_ENTRIES) return null;
    const keys = Reflect.ownKeys(descriptors);
    const expectedKeys = new Set(["length", ...Array.from({ length }, (_, index) => String(index))]);
    if (
      keys.length !== expectedKeys.size ||
      keys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
    ) {
      return null;
    }

    const snapshot: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return null;
      if (typeof descriptor.value !== "string") return null;
      snapshot.push(descriptor.value);
    }
    return snapshot;
  } catch {
    return null;
  }
}

function exactServiceOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;

  try {
    const url = new URL(value);
    if (
      value !== url.origin ||
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      !url.hostname
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function configuredBoundary(
  options: SupabaseDocumentStorageAdapterOptions,
): ConfiguredBoundary {
  const config = dataRecord(options, [
    "bucket",
    "allowedBuckets",
    "serviceOrigin",
    "allowedOrigins",
  ]);
  if (!config || typeof config.bucket !== "string" || !SAFE_BUCKET_NAME.test(config.bucket)) {
    throw storageBoundaryError();
  }

  const allowedBuckets = safeStringArray(config.allowedBuckets);
  if (
    !allowedBuckets ||
    allowedBuckets.length === 0 ||
    allowedBuckets.some((bucket) => !SAFE_BUCKET_NAME.test(bucket)) ||
    !allowedBuckets.includes(config.bucket)
  ) {
    throw storageBoundaryError();
  }

  const serviceOrigin = exactServiceOrigin(config.serviceOrigin);
  const allowedOrigins = safeStringArray(config.allowedOrigins);
  if (
    !serviceOrigin ||
    !allowedOrigins ||
    allowedOrigins.some((origin) => exactServiceOrigin(origin) !== origin) ||
    !allowedOrigins.includes(serviceOrigin)
  ) {
    throw storageBoundaryError();
  }

  return Object.freeze({ bucket: config.bucket, serviceOrigin });
}

function parseUploadRequest(request: StorageUploadRequest): ParsedUploadRequest {
  const candidate = dataRecord(request, [
    "objectKey",
    "expectedMediaType",
    "maxBytes",
    "expiresInSeconds",
  ]);
  if (
    !candidate ||
    typeof candidate.objectKey !== "string" ||
    typeof candidate.expectedMediaType !== "string" ||
    !SAFE_MEDIA_TYPE.test(candidate.expectedMediaType) ||
    !Number.isSafeInteger(candidate.maxBytes) ||
    (candidate.maxBytes as number) <= 0 ||
    (candidate.maxBytes as number) > DOCUMENT_MAX_BYTES ||
    candidate.expiresInSeconds !== MAX_SIGNED_UPLOAD_SECONDS
  ) {
    throw storageBoundaryError();
  }

  const match = QUARANTINE_OBJECT_KEY.exec(candidate.objectKey);
  if (!match) throw storageBoundaryError();
  const [, tenantId, documentId, versionId] = match;
  if (!tenantId || !documentId || !versionId) throw storageBoundaryError();

  let expectedObjectKey: string;
  try {
    expectedObjectKey = buildDocumentObjectKey({
      tenantId,
      documentId,
      versionId,
      object: { kind: "original" },
    });
  } catch {
    throw storageBoundaryError();
  }
  if (candidate.objectKey !== expectedObjectKey) throw storageBoundaryError();

  return {
    objectKey: expectedObjectKey,
    expectedMediaType: candidate.expectedMediaType,
    maxBytes: candidate.maxBytes as number,
    expiresInSeconds: MAX_SIGNED_UPLOAD_SECONDS,
    metadata: Object.freeze({
      tenantId,
      documentId,
      versionId,
      objectClass: QUARANTINE_OBJECT_CLASS,
      expectedMediaType: candidate.expectedMediaType,
      maxBytes: candidate.maxBytes as number,
    }),
  };
}

function exactSignedUploadUrl(
  rawUrl: unknown,
  serviceOrigin: string,
  bucket: string,
  objectKey: string,
): URL | null {
  if (typeof rawUrl !== "string" || rawUrl.length > 16_384) return null;

  try {
    const url = new URL(rawUrl);
    const expectedPath = `/storage/v1/object/upload/sign/${bucket}/${objectKey}`;
    const parameters = [...url.searchParams.entries()];
    if (
      url.protocol !== "https:" ||
      url.origin !== serviceOrigin ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.hash !== "" ||
      url.pathname !== expectedPath ||
      parameters.length !== 1 ||
      parameters[0]?.[0] !== "token" ||
      !parameters[0][1] ||
      parameters[0][1].length > 8_192 ||
      /[\u0000-\u0020\u007f]/u.test(parameters[0][1])
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function metadataMatches(
  value: unknown,
  expected: SupabaseQuarantineUploadMetadata,
): boolean {
  const metadata = dataRecord(value, [
    "tenantId",
    "documentId",
    "versionId",
    "objectClass",
    "expectedMediaType",
    "maxBytes",
  ]);
  return Boolean(
    metadata &&
      metadata.tenantId === expected.tenantId &&
      metadata.documentId === expected.documentId &&
      metadata.versionId === expected.versionId &&
      metadata.objectClass === expected.objectClass &&
      metadata.expectedMediaType === expected.expectedMediaType &&
      metadata.maxBytes === expected.maxBytes,
  );
}

function parseProviderResponse(
  response: unknown,
  request: SupabasePrivateUploadReservationRequest,
  serviceOrigin: string,
): UploadReservation {
  const envelope = dataRecord(response, ["data", "error"]);
  if (!envelope || envelope.error !== null) throw storageBoundaryError();

  const data = dataRecord(envelope.data, [
    "bucket",
    "objectKey",
    "signedUrl",
    "expiresAt",
    "visibility",
    "upsert",
    "metadata",
  ]);
  if (
    !data ||
    data.bucket !== request.bucket ||
    data.objectKey !== request.objectKey ||
    data.expiresAt !== request.expiresAt ||
    data.visibility !== "private" ||
    data.upsert !== false ||
    !metadataMatches(data.metadata, request.metadata)
  ) {
    throw storageBoundaryError();
  }

  const uploadUrl = exactSignedUploadUrl(
    data.signedUrl,
    serviceOrigin,
    request.bucket,
    request.objectKey,
  );
  if (!uploadUrl) throw storageBoundaryError();

  return Object.freeze({
    objectKey: request.objectKey,
    uploadUrl: uploadUrl.toString(),
    expiresAt: request.expiresAt,
    visibility: "private",
  });
}

export class SupabaseDocumentStorageAdapter implements DocumentStorageAdapter {
  readonly #activeReservations = new Map<string, ActiveReservation>();
  readonly #bucket: string;
  readonly #client: SupabaseStorageClientLike;
  readonly #serviceOrigin: string;

  constructor(
    client: SupabaseStorageClientLike,
    options: SupabaseDocumentStorageAdapterOptions,
  ) {
    this.#client = client;
    const boundary = configuredBoundary(options);
    this.#bucket = boundary.bucket;
    this.#serviceOrigin = boundary.serviceOrigin;
  }

  reserveUpload(request: StorageUploadRequest): Promise<UploadReservation> {
    let parsed: ParsedUploadRequest;
    try {
      parsed = parseUploadRequest(request);
    } catch {
      return Promise.reject(storageBoundaryError());
    }

    const issuedAt = Date.now();
    const active = this.#activeReservations.get(parsed.objectKey);
    if (active && active.expiresAtMs > issuedAt) {
      if (
        active.expectedMediaType !== parsed.expectedMediaType ||
        active.maxBytes !== parsed.maxBytes
      ) {
        return Promise.reject(storageBoundaryError());
      }
      return active.promise;
    }
    if (active) this.#activeReservations.delete(parsed.objectKey);

    const expiresAtMs = issuedAt + parsed.expiresInSeconds * 1_000;
    const providerRequest: SupabasePrivateUploadReservationRequest = Object.freeze({
      bucket: this.#bucket,
      objectKey: parsed.objectKey,
      expiresAt: new Date(expiresAtMs).toISOString(),
      visibility: "private",
      upsert: false,
      metadata: parsed.metadata,
    });

    const promise: Promise<UploadReservation> = this.#issueReservation(providerRequest).catch(() => {
      if (this.#activeReservations.get(parsed.objectKey)?.promise === promise) {
        this.#activeReservations.delete(parsed.objectKey);
      }
      throw storageBoundaryError();
    });
    const entry: ActiveReservation = {
      expectedMediaType: parsed.expectedMediaType,
      maxBytes: parsed.maxBytes,
      expiresAtMs,
      promise,
    };
    this.#activeReservations.set(parsed.objectKey, entry);
    return promise;
  }

  async #issueReservation(
    request: SupabasePrivateUploadReservationRequest,
  ): Promise<UploadReservation> {
    const bucketClient = this.#client.storage.from(this.#bucket);
    const response = await bucketClient.createSignedUploadReservation(request);
    const reservation = parseProviderResponse(response, request, this.#serviceOrigin);
    if (Date.now() >= Date.parse(reservation.expiresAt)) throw storageBoundaryError();
    return reservation;
  }
}
