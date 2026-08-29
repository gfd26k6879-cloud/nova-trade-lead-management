import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  SupabaseDocumentStorageAdapter,
  type SupabasePrivateUploadReservationRequest,
  type SupabaseStorageClientLike,
} from "@/lib/documents/supabase-storage-adapter";
import {
  MAX_SIGNED_UPLOAD_SECONDS,
  reserveDocumentUpload,
  type StorageUploadRequest,
} from "@/lib/documents/adapters";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const BUCKET = "document-quarantine";
const SERVICE_ORIGIN = "https://project.supabase.co";
const OBJECT_KEY =
  `tenants/${TENANT_ID}/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/original`;
const NOW = new Date("2026-08-29T12:00:00.000Z");
const SAFE_ERROR = {
  code: "storage_boundary_error",
  message: "The storage adapter did not return a safe, exact upload capability.",
};

const storageRequest: StorageUploadRequest = {
  objectKey: OBJECT_KEY,
  expectedMediaType: "application/pdf",
  maxBytes: 1_024,
  expiresInSeconds: MAX_SIGNED_UPLOAD_SECONDS,
};

function providerResponse(
  request: SupabasePrivateUploadReservationRequest,
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    data: {
      bucket: request.bucket,
      objectKey: request.objectKey,
      signedUrl:
        `${SERVICE_ORIGIN}/storage/v1/object/upload/sign/${request.bucket}/${request.objectKey}` +
        "?token=header.payload.signature",
      expiresAt: request.expiresAt,
      visibility: request.visibility,
      upsert: request.upsert,
      metadata: request.metadata,
      ...overrides,
    },
    error: null,
  };
}

function clientWith(
  createSignedUploadReservation: (
    request: SupabasePrivateUploadReservationRequest,
  ) => Promise<unknown>,
) {
  const create = vi.fn(createSignedUploadReservation);
  const list = vi.fn();
  const getPublicUrl = vi.fn();
  const from = vi.fn(() => ({ createSignedUploadReservation: create, list, getPublicUrl }));
  const client: SupabaseStorageClientLike = { storage: { from } };
  return { client, create, from, getPublicUrl, list };
}

function adapterFor(client: SupabaseStorageClientLike, allowedBuckets = [BUCKET]) {
  return new SupabaseDocumentStorageAdapter(client, {
    bucket: BUCKET,
    allowedBuckets,
    serviceOrigin: SERVICE_ORIGIN,
    allowedOrigins: [SERVICE_ORIGIN],
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SupabaseDocumentStorageAdapter", () => {
  it("reserves only the exact private quarantine object with bound media and size metadata", async () => {
    const provider = clientWith(async (request) => providerResponse(request));
    const adapter = adapterFor(provider.client);

    await expect(
      reserveDocumentUpload(
        {
          tenantId: TENANT_ID,
          documentId: DOCUMENT_ID,
          versionId: VERSION_ID,
          fileName: "product-sheet.pdf",
          declaredMediaType: "application/pdf",
          declaredByteSize: 1_024,
        },
        adapter,
      ),
    ).resolves.toEqual({
      objectKey: OBJECT_KEY,
      uploadUrl:
        `${SERVICE_ORIGIN}/storage/v1/object/upload/sign/${BUCKET}/${OBJECT_KEY}` +
        "?token=header.payload.signature",
      expiresAt: "2026-08-29T12:05:00.000Z",
      visibility: "private",
    });

    expect(provider.from).toHaveBeenCalledTimes(1);
    expect(provider.from).toHaveBeenCalledWith(BUCKET);
    expect(provider.create).toHaveBeenCalledWith({
      bucket: BUCKET,
      objectKey: OBJECT_KEY,
      expiresAt: "2026-08-29T12:05:00.000Z",
      visibility: "private",
      upsert: false,
      metadata: {
        tenantId: TENANT_ID,
        documentId: DOCUMENT_ID,
        versionId: VERSION_ID,
        objectClass: "quarantine-original",
        expectedMediaType: "application/pdf",
        maxBytes: 1_024,
      },
    });
    expect(provider.list).not.toHaveBeenCalled();
    expect(provider.getPublicUrl).not.toHaveBeenCalled();
  });

  it("requires the configured bucket to be an exact member of the construction allowlist", async () => {
    const provider = clientWith(async (request) => providerResponse(request));

    expect(
      () => new SupabaseDocumentStorageAdapter(provider.client, {
        bucket: BUCKET,
        allowedBuckets: ["Document-Quarantine"],
        serviceOrigin: SERVICE_ORIGIN,
        allowedOrigins: [SERVICE_ORIGIN],
      }),
    ).toThrowError(SAFE_ERROR.message);
    expect(
      () => new SupabaseDocumentStorageAdapter(provider.client, {
        bucket: "../document-quarantine",
        allowedBuckets: ["../document-quarantine"],
        serviceOrigin: SERVICE_ORIGIN,
        allowedOrigins: [SERVICE_ORIGIN],
      }),
    ).toThrowError(SAFE_ERROR.message);
    expect(provider.from).not.toHaveBeenCalled();
  });

  it("rejects oversized, sparse, and property-extended allowlists", () => {
    const provider = clientWith(async (request) => providerResponse(request));
    const sparse = [BUCKET];
    sparse.length = 3;
    const extended = [BUCKET] as string[] & { note?: string };
    extended.note = "ambiguous-config";

    for (const allowedBuckets of [
      Array.from({ length: 33 }, () => BUCKET),
      sparse,
      extended,
    ]) {
      expect(
        () => new SupabaseDocumentStorageAdapter(provider.client, {
          bucket: BUCKET,
          allowedBuckets,
          serviceOrigin: SERVICE_ORIGIN,
          allowedOrigins: [SERVICE_ORIGIN],
        }),
      ).toThrowError(SAFE_ERROR.message);
    }
    expect(provider.from).not.toHaveBeenCalled();
  });

  it("requires an exact portless HTTPS service origin in the construction allowlist", () => {
    const provider = clientWith(async (request) => providerResponse(request));

    for (const serviceOrigin of [
      "http://project.supabase.co",
      "https://project.supabase.co:8443",
      "https://user:password@project.supabase.co",
      "https://project.supabase.co/storage/v1",
    ]) {
      expect(
        () => new SupabaseDocumentStorageAdapter(provider.client, {
          bucket: BUCKET,
          allowedBuckets: [BUCKET],
          serviceOrigin,
          allowedOrigins: [serviceOrigin],
        }),
      ).toThrowError(SAFE_ERROR.message);
    }
    expect(provider.from).not.toHaveBeenCalled();
  });

  it.each([
    ["traversal", `tenants/${TENANT_ID}/documents/${DOCUMENT_ID}/versions/../original`],
    ["derivative", `${OBJECT_KEY}/derivatives/44444444-4444-4444-8444-444444444444`],
    ["uppercase identity", OBJECT_KEY.toUpperCase()],
    ["cross-prefix", OBJECT_KEY.replace("tenants/", "public/")],
  ])("rejects a non-exact %s key before selecting a bucket", async (_label, objectKey) => {
    const provider = clientWith(async (request) => providerResponse(request));
    const adapter = adapterFor(provider.client);

    await expect(adapter.reserveUpload({ ...storageRequest, objectKey })).rejects.toMatchObject(SAFE_ERROR);
    expect(provider.from).not.toHaveBeenCalled();
  });

  it("rejects proxied requests and accessor provider responses without evaluating accessors", async () => {
    let reads = 0;
    const provider = clientWith(async () => ({
      get data() {
        reads += 1;
        throw new Error("unsafe getter");
      },
      error: null,
    }));
    const adapter = adapterFor(provider.client);

    await expect(
      adapter.reserveUpload(new Proxy(storageRequest, {}) as StorageUploadRequest),
    ).rejects.toMatchObject(SAFE_ERROR);
    expect(provider.from).not.toHaveBeenCalled();

    await expect(adapter.reserveUpload(storageRequest)).rejects.toMatchObject(SAFE_ERROR);
    expect(reads).toBe(0);
  });

  it.each([
    ["provider error beside plausible data", (request: SupabasePrivateUploadReservationRequest) => ({
      ...(providerResponse(request) as Record<string, unknown>),
      error: { message: "service-role secret should not escape" },
    })],
    ["public URL", (request: SupabasePrivateUploadReservationRequest) => providerResponse(request, {
      signedUrl: `${SERVICE_ORIGIN}/storage/v1/object/public/${BUCKET}/${OBJECT_KEY}`,
    })],
    ["foreign-host URL", (request: SupabasePrivateUploadReservationRequest) => providerResponse(request, {
      signedUrl:
        `https://evil.example/storage/v1/object/upload/sign/${BUCKET}/${OBJECT_KEY}` +
        "?token=header.payload.signature",
    })],
    ["wrong media binding", (request: SupabasePrivateUploadReservationRequest) => providerResponse(request, {
      metadata: { ...request.metadata, expectedMediaType: "text/plain" },
    })],
    ["wrong size binding", (request: SupabasePrivateUploadReservationRequest) => providerResponse(request, {
      metadata: { ...request.metadata, maxBytes: request.metadata.maxBytes + 1 },
    })],
    ["overwrite capability", (request: SupabasePrivateUploadReservationRequest) => providerResponse(request, {
      upsert: true,
    })],
    ["proxied data", (request: SupabasePrivateUploadReservationRequest) => ({
      data: new Proxy((providerResponse(request) as { data: object }).data, {}),
      error: null,
    })],
  ])("fails closed on a malformed or misleading %s result", async (_label, response) => {
    const provider = clientWith(async (request) => response(request));
    const adapter = adapterFor(provider.client);

    await expect(adapter.reserveUpload(storageRequest)).rejects.toMatchObject(SAFE_ERROR);
  });

  it("redacts thrown provider errors behind the storage boundary error", async () => {
    const provider = clientWith(async () => {
      throw new Error("provider secret: service-role-key");
    });
    const adapter = adapterFor(provider.client);

    const error = await adapter.reserveUpload(storageRequest).catch((caught: unknown) => caught);
    expect(error).toMatchObject(SAFE_ERROR);
    expect(String(error)).not.toContain("service-role-key");
  });

  it("deduplicates an active identical reservation and rejects conflicting stale metadata", async () => {
    let resolveProvider: ((value: unknown) => void) | undefined;
    const provider = clientWith((request) => new Promise((resolve) => {
      resolveProvider = () => resolve(providerResponse(request));
    }));
    const adapter = adapterFor(provider.client);

    const first = adapter.reserveUpload(storageRequest);
    const retry = adapter.reserveUpload(storageRequest);
    expect(retry).toBe(first);
    await expect(
      adapter.reserveUpload({ ...storageRequest, maxBytes: storageRequest.maxBytes + 1 }),
    ).rejects.toMatchObject(SAFE_ERROR);
    expect(provider.create).toHaveBeenCalledTimes(1);

    resolveProvider?.(undefined);
    await expect(Promise.all([first, retry])).resolves.toHaveLength(2);
    await expect(adapter.reserveUpload(storageRequest)).resolves.toMatchObject({
      objectKey: OBJECT_KEY,
      visibility: "private",
    });
    expect(provider.create).toHaveBeenCalledTimes(1);
  });

  it("does not reuse a capability after its exact expiry", async () => {
    const provider = clientWith(async (request) => providerResponse(request));
    const adapter = adapterFor(provider.client);

    await adapter.reserveUpload(storageRequest);
    vi.advanceTimersByTime(MAX_SIGNED_UPLOAD_SECONDS * 1_000 + 1);
    await adapter.reserveUpload(storageRequest);

    expect(provider.create).toHaveBeenCalledTimes(2);
    expect(provider.create.mock.calls[1]?.[0].expiresAt).toBe("2026-08-29T12:10:00.001Z");
  });

  it("rejects a provider response that arrives after the signed capability expired", async () => {
    let callCount = 0;
    let releaseFirst: (() => void) | undefined;
    const provider = clientWith(async (request) => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) => {
          releaseFirst = () => resolve(providerResponse(request));
        });
      }
      return providerResponse(request);
    });
    const adapter = adapterFor(provider.client);

    const delayed = adapter.reserveUpload(storageRequest);
    vi.advanceTimersByTime(MAX_SIGNED_UPLOAD_SECONDS * 1_000);
    releaseFirst?.();
    await expect(delayed).rejects.toMatchObject(SAFE_ERROR);

    await expect(adapter.reserveUpload(storageRequest)).resolves.toMatchObject({
      expiresAt: "2026-08-29T12:10:00.000Z",
      visibility: "private",
    });
    expect(provider.create).toHaveBeenCalledTimes(2);
  });
});
