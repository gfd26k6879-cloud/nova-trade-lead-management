import { afterEach, describe, expect, it, vi } from "vitest";

import type { TenantSession } from "@/lib/auth";
import type { DbClient, DbStatement } from "@/lib/db";
import type { DocumentStorageAdapter } from "@/lib/documents/adapters";
import type { DocumentUploadReservationRecord } from "@/lib/documents/intake-service";

const dbBoundary = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ requireTenantSession: vi.fn() }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return { ...actual, withTenantDbContext: dbBoundary };
});

import { initiateAuthenticatedDocumentIntake } from "@/lib/documents/authenticated-intake-service";
import { createPostgresDocumentIntakeRepository } from "@/lib/documents/postgres-intake-repository";

const TENANT = "00000000-0000-4000-8000-0000000000a1";
const WORKSPACE = "10000000-0000-4000-8000-0000000000a1";
const DOCUMENT = "20000000-0000-4000-8000-0000000000a1";
const VERSION = "30000000-0000-4000-8000-0000000000a1";
const MEMBERSHIP = "40000000-0000-4000-8000-0000000000a1";
const BINDING = "50000000-0000-4000-8000-0000000000a1";
const ACTOR = "60000000-0000-4000-8000-0000000000a1";
const OBJECT_KEY = `tenants/${TENANT}/documents/${DOCUMENT}/versions/${VERSION}/original`;

const input = Object.freeze({
  tenantId: TENANT,
  workspaceId: WORKSPACE,
  documentId: DOCUMENT,
  versionId: VERSION,
  idempotencyKey: "upload-request-0001",
  fileName: "launch-notes.txt",
  declaredMediaType: "text/plain",
  declaredByteSize: 12,
  scannerPolicyVersion: "launch-v1",
});

function session(overrides: Partial<TenantSession> = {}): TenantSession {
  return {
    userId: ACTOR,
    email: "owner@example.test",
    displayName: "Owner",
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    membershipId: MEMBERSHIP,
    role: "owner",
    roleBindingId: BINDING,
    ...overrides,
  };
}

function fakeDb(row: Record<string, unknown>): DbClient {
  return fakeDbRows([row]);
}

function fakeDbRows(rows: unknown): DbClient {
  const statement: DbStatement = {
    all: async <T = Record<string, unknown>>() => rows as T[],
    get: async <T = Record<string, unknown>>() => undefined as T | undefined,
    run: async () => ({ changes: 0 }),
  };
  return {
    prepare: vi.fn(() => statement),
    exec: vi.fn(async () => undefined),
  };
}

afterEach(() => {
  dbBoundary.mockReset();
});

describe("authenticated document intake", () => {
  it("authorizes an exact workspace and returns a durable private upload reservation", async () => {
    const db = fakeDb({
      kind: "created",
      tenant_id: TENANT,
      workspace_id: WORKSPACE,
      document_id: DOCUMENT,
      version_id: VERSION,
      idempotency_key: "upload-request-0001",
      source_identity: `tenant_upload:${DOCUMENT}`,
      request_fingerprint: "187ae03331f27b46bc2cb81dc7cd91629a9f3565b104405bd4c4538d03ef5bbd",
      file_name: "launch-notes.txt",
      format: "txt",
      media_type: "text/plain",
      declared_byte_size: "12",
      max_bytes: "52428800",
      scanner_policy_version: "launch-v1",
      object_key: OBJECT_KEY,
      state: "upload_reserved",
    });
    dbBoundary.mockImplementationOnce(async (callback: (client: DbClient) => Promise<unknown>) => callback(db));
    const storage: DocumentStorageAdapter = {
      reserveUpload: vi.fn(async () => ({
        objectKey: OBJECT_KEY,
        uploadUrl: "https://storage.example.test/upload/token",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        visibility: "private",
      })),
    };

    await expect(initiateAuthenticatedDocumentIntake(input, {
      correlationId: "f04-upload-a",
      sessionBoundary: vi.fn(async () => session()),
      storage,
    })).resolves.toMatchObject({
      kind: "created",
      record: { tenantId: TENANT, workspaceId: WORKSPACE, objectKey: OBJECT_KEY },
      upload: { objectKey: OBJECT_KEY, visibility: "private" },
    });
  });

  it("denies a role without upload permission before database or storage access", async () => {
    const storage = { reserveUpload: vi.fn() } satisfies DocumentStorageAdapter;

    await expect(initiateAuthenticatedDocumentIntake(input, {
      correlationId: "f04-upload-denied",
      sessionBoundary: vi.fn(async () => session({ role: "reviewer" })),
      storage,
    })).rejects.toMatchObject({ code: "PERMISSION_DENIED", message: "Permission denied" });

    expect(dbBoundary).not.toHaveBeenCalled();
    expect(storage.reserveUpload).not.toHaveBeenCalled();
  });

  it("rejects accessor and proxy request shapes before authorization or persistence", async () => {
    const sessionBoundary = vi.fn(async () => session());
    const storage = { reserveUpload: vi.fn() } satisfies DocumentStorageAdapter;
    let getterCalls = 0;
    const accessor = { ...input } as Record<string, unknown>;
    Object.defineProperty(accessor, "tenantId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return TENANT;
      },
    });

    await expect(initiateAuthenticatedDocumentIntake(
      accessor as typeof input,
      { correlationId: "f04-upload-accessor", sessionBoundary, storage },
    )).rejects.toMatchObject({ code: "intake_boundary_error" });
    await expect(initiateAuthenticatedDocumentIntake(
      new Proxy({ ...input }, {}) as typeof input,
      { correlationId: "f04-upload-proxy", sessionBoundary, storage },
    )).rejects.toMatchObject({ code: "intake_boundary_error" });

    expect(getterCalls).toBe(0);
    expect(sessionBoundary).not.toHaveBeenCalled();
    expect(dbBoundary).not.toHaveBeenCalled();
    expect(storage.reserveUpload).not.toHaveBeenCalled();
  });

  it("rejects a session boundary that returns a different tenant scope", async () => {
    const storage = { reserveUpload: vi.fn() } satisfies DocumentStorageAdapter;

    await expect(initiateAuthenticatedDocumentIntake(input, {
      correlationId: "f04-upload-scope-mismatch",
      sessionBoundary: vi.fn(async () => session({
        tenantId: "00000000-0000-4000-8000-0000000000b2",
        workspaceId: "10000000-0000-4000-8000-0000000000b2",
      })),
      storage,
    })).rejects.toMatchObject({ code: "TENANT_SCOPE_MISMATCH", message: "Tenant scope does not match" });

    expect(dbBoundary).not.toHaveBeenCalled();
    expect(storage.reserveUpload).not.toHaveBeenCalled();
  });

  it("returns a stable idempotency conflict without issuing an upload capability", async () => {
    const db = fakeDb(Object.fromEntries([
      ["kind", "conflict"],
      ...[
        "tenant_id", "workspace_id", "document_id", "version_id", "idempotency_key",
        "source_identity", "request_fingerprint", "file_name", "format", "media_type",
        "declared_byte_size", "max_bytes", "scanner_policy_version", "object_key", "state",
      ].map((field) => [field, null]),
    ]));
    dbBoundary.mockImplementationOnce(async (callback: (client: DbClient) => Promise<unknown>) => callback(db));
    const storage = { reserveUpload: vi.fn() } satisfies DocumentStorageAdapter;

    await expect(initiateAuthenticatedDocumentIntake(input, {
      correlationId: "f04-upload-conflict",
      sessionBoundary: vi.fn(async () => session()),
      storage,
    })).rejects.toMatchObject({
      code: "idempotency_conflict",
      message: "The idempotency key was already used for a different document upload request.",
    });

    expect(storage.reserveUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["zero rows", []],
    ["multiple rows", [{ kind: "conflict" }, { kind: "conflict" }]],
    ["partial row", [{ kind: "created" }]],
    ["proxied row array", new Proxy([{ kind: "created" }], {})],
    ["custom-prototype row", [Object.assign(Object.create({ inherited: true }), { kind: "created" })]],
  ])("fails closed on %s from the persistence boundary", async (_name, rows) => {
    dbBoundary.mockImplementationOnce(async (callback: (client: DbClient) => Promise<unknown>) =>
      callback(fakeDbRows(rows)));
    const storage = { reserveUpload: vi.fn() } satisfies DocumentStorageAdapter;

    await expect(initiateAuthenticatedDocumentIntake(input, {
      correlationId: "f04-upload-malformed-persistence",
      sessionBoundary: vi.fn(async () => session()),
      storage,
    })).rejects.toMatchObject({
      code: "persistence_boundary_error",
      message: "The document intake state could not be persisted safely.",
    });

    expect(storage.reserveUpload).not.toHaveBeenCalled();
  });

  it("rejects a valid-shaped persistence row that is not the exact requested reservation", async () => {
    const expected: DocumentUploadReservationRecord = Object.freeze({
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      versionId: VERSION,
      idempotencyKey: "upload-request-0001",
      sourceIdentity: `tenant_upload:${DOCUMENT}`,
      requestFingerprint: "187ae03331f27b46bc2cb81dc7cd91629a9f3565b104405bd4c4538d03ef5bbd",
      fileName: "launch-notes.txt",
      format: "txt",
      mediaType: "text/plain",
      declaredByteSize: 12,
      maxBytes: 52428800,
      scannerPolicyVersion: "launch-v1",
      objectKey: OBJECT_KEY,
      state: "upload_reserved",
    });
    const wrongTenant = "00000000-0000-4000-8000-0000000000b2";
    const row = {
      kind: "created",
      tenant_id: wrongTenant,
      workspace_id: WORKSPACE,
      document_id: DOCUMENT,
      version_id: VERSION,
      idempotency_key: expected.idempotencyKey,
      source_identity: expected.sourceIdentity,
      request_fingerprint: expected.requestFingerprint,
      file_name: expected.fileName,
      format: expected.format,
      media_type: expected.mediaType,
      declared_byte_size: String(expected.declaredByteSize),
      max_bytes: String(expected.maxBytes),
      scanner_policy_version: expected.scannerPolicyVersion,
      object_key: expected.objectKey,
      state: expected.state,
    };

    for (const hostileRow of [
      row,
      { ...row, tenant_id: TENANT, source_identity: `tenant_upload:${wrongTenant}` },
      { ...row, tenant_id: TENANT, object_key: `tenants/${TENANT}/documents/${DOCUMENT}/versions/${wrongTenant}/original` },
    ]) {
      await expect(createPostgresDocumentIntakeRepository(fakeDb(hostileRow)).reserveUpload(expected))
        .rejects.toMatchObject({ code: "persistence_boundary_error" });
    }
  });
});
