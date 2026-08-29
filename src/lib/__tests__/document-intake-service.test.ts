import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  completeDocumentUpload,
  initiateDocumentIntake,
  processDocumentScan,
  type DocumentIntakeRepository,
  type DocumentScanOutbox,
  type DocumentStorageAdapter,
  type DocumentUploadReservationRecord,
  type UploadedDocumentReader,
} from "@/lib/documents";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_VERSION_ID = "55555555-5555-4555-8555-555555555555";
const OBJECT_KEY = `tenants/${TENANT_ID}/documents/${DOCUMENT_ID}/versions/${VERSION_ID}/original`;
const CHECKSUM = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const SCAN_JOB_ID = "44444444-4444-4444-8444-444444444444";

const reservationRecord = (
  overrides: Partial<DocumentUploadReservationRecord> = {},
): DocumentUploadReservationRecord => {
  const fields = {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    documentId: DOCUMENT_ID,
    versionId: VERSION_ID,
    idempotencyKey: "upload-request-0001",
    sourceIdentity: `tenant_upload:${DOCUMENT_ID}`,
    fileName: "notes.txt",
    format: "txt" as const,
    mediaType: "text/plain",
    declaredByteSize: 5,
    maxBytes: 50 * 1024 * 1024,
    scannerPolicyVersion: "launch-v1",
    objectKey: OBJECT_KEY,
    state: "upload_reserved" as const,
    ...overrides,
  };
  const requestFingerprint = createHash("sha256").update(JSON.stringify([
    fields.tenantId, fields.workspaceId, fields.documentId, fields.versionId, fields.fileName,
    fields.mediaType, fields.declaredByteSize, fields.scannerPolicyVersion,
  ])).digest("hex");
  return { ...fields, requestFingerprint: overrides.requestFingerprint ?? requestFingerprint };
};

describe("document intake orchestration", () => {
  it("atomically reserves the exact tenant document version before issuing a private upload", async () => {
    const repository: Pick<DocumentIntakeRepository, "reserveUpload"> = {
      reserveUpload: async (request) => ({ kind: "created", record: request }),
    };
    const storage: DocumentStorageAdapter = {
      reserveUpload: async (request) => ({
        objectKey: request.objectKey,
        uploadUrl: "https://storage.example/upload?signature=fixture",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        visibility: "private",
      }),
    };

    await expect(initiateDocumentIntake({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
      fileName: "catalog.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: 1_024,
      scannerPolicyVersion: "launch-v1",
    }, { repository, storage })).resolves.toMatchObject({
      kind: "created",
      record: {
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        documentId: DOCUMENT_ID,
        versionId: VERSION_ID,
        objectKey: OBJECT_KEY,
        state: "upload_reserved",
      },
      upload: { objectKey: OBJECT_KEY, visibility: "private" },
    });
  });

  it("fails closed on an idempotency conflict or mismatched persistence identity", async () => {
    let storageCalls = 0;
    const storage: DocumentStorageAdapter = {
      reserveUpload: async () => {
        storageCalls += 1;
        throw new Error("must not be called");
      },
    };
    const input = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
      fileName: "catalog.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: 1_024,
      scannerPolicyVersion: "launch-v1",
    };

    await expect(initiateDocumentIntake(input, {
      repository: { reserveUpload: async () => ({ kind: "conflict" }) },
      storage,
    })).rejects.toMatchObject({ code: "idempotency_conflict" });
    await expect(initiateDocumentIntake(input, {
      repository: {
        reserveUpload: async (record) => ({
          kind: "created",
          record: { ...record, tenantId: "99999999-9999-4999-8999-999999999999" },
        }),
      },
      storage,
    })).rejects.toMatchObject({ code: "intake_boundary_error" });
    expect(storageCalls).toBe(0);
  });

  it("returns the same reservation identity for an exact idempotent retry", async () => {
    let persisted: DocumentUploadReservationRecord | undefined;
    const repository: Pick<DocumentIntakeRepository, "reserveUpload"> = {
      reserveUpload: async (record) => {
        const kind = persisted ? "replay" : "created";
        persisted ??= record;
        return { kind, record: persisted };
      },
    };
    const storage: DocumentStorageAdapter = {
      reserveUpload: async (request) => ({
        objectKey: request.objectKey,
        uploadUrl: "https://storage.example/upload?signature=fixture",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        visibility: "private",
      }),
    };
    const input = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
      fileName: "catalog.pdf",
      declaredMediaType: "application/pdf",
      declaredByteSize: 1_024,
      scannerPolicyVersion: "launch-v1",
    };

    const first = await initiateDocumentIntake(input, { repository, storage });
    const second = await initiateDocumentIntake(input, { repository, storage });
    expect(first).toMatchObject({ kind: "created" });
    expect(second).toMatchObject({ kind: "replay" });
    expect(second.record).toEqual(first.record);
    expect(Object.isFrozen(second.record)).toBe(true);
  });

  it("rejects proxy and accessor inputs without invoking persistence", async () => {
    let calls = 0;
    const repository: Pick<DocumentIntakeRepository, "reserveUpload"> = {
      reserveUpload: async () => {
        calls += 1;
        throw new Error("must not be called");
      },
    };
    const storage: DocumentStorageAdapter = { reserveUpload: async () => ({}) };
    const proxy = new Proxy({}, { ownKeys: () => { throw new Error("proxy trap"); } });
    let reads = 0;
    const accessor = {
      tenantId: TENANT_ID,
      get workspaceId(): string { reads += 1; throw new Error("getter"); },
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
      fileName: "notes.txt",
      declaredMediaType: "text/plain",
      declaredByteSize: 5,
      scannerPolicyVersion: "launch-v1",
    };

    await expect(initiateDocumentIntake(proxy as never, { repository, storage }))
      .rejects.toMatchObject({ code: "intake_boundary_error" });
    await expect(initiateDocumentIntake(accessor, { repository, storage }))
      .rejects.toMatchObject({ code: "intake_boundary_error" });
    expect(reads).toBe(0);
    expect(calls).toBe(0);
  });

  it("verifies stored bytes, atomically quarantines, and dispatches the exact staged scan job", async () => {
    const bytes = new TextEncoder().encode("hello");
    const record = reservationRecord();
    const dispatched: unknown[] = [];
    const repository: Pick<DocumentIntakeRepository, "getUploadReservation" | "finalizeQuarantine"> = {
      getUploadReservation: async () => record,
      finalizeQuarantine: async (request) => ({
        kind: "quarantined",
        record: { ...record, checksum: request.checksum, state: "quarantined" },
        processing: {
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          sourceIdentity: record.sourceIdentity,
          documentId: DOCUMENT_ID,
          versionId: VERSION_ID,
          checksum: request.checksum,
          policyVersion: "launch-v1",
        },
        outbox: {
          dispatchKey: `scan:${TENANT_ID}:${VERSION_ID}:${request.checksum}:launch-v1`,
          jobId: "44444444-4444-4444-8444-444444444444",
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          documentId: DOCUMENT_ID,
          versionId: VERSION_ID,
          objectKey: OBJECT_KEY,
          checksum: request.checksum,
          policyVersion: "launch-v1",
        },
      }),
    };
    const reader: UploadedDocumentReader = {
      readUploadedObject: async () => ({ objectKey: OBJECT_KEY, bytes, mediaType: "text/plain", byteSize: 5 }),
    };
    const outbox: DocumentScanOutbox = {
      dispatch: async (message) => {
        dispatched.push(message);
        return { dispatchKey: message.dispatchKey, status: "accepted" };
      },
    };

    const result = await completeDocumentUpload({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
    }, { repository, reader, outbox });

    expect(result).toMatchObject({
      kind: "quarantined",
      record: { tenantId: TENANT_ID, versionId: VERSION_ID, state: "quarantined" },
      processing: { tenantId: TENANT_ID, versionId: VERSION_ID },
      scanDispatch: "accepted",
    });
    expect(dispatched).toHaveLength(1);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.processing)).toBe(true);
  });

  it("does not persist quarantine when stored metadata is mismatched or malformed", async () => {
    const record = reservationRecord();
    let finalizeCalls = 0;
    const repository: Pick<DocumentIntakeRepository, "getUploadReservation" | "finalizeQuarantine"> = {
      getUploadReservation: async () => record,
      finalizeQuarantine: async () => {
        finalizeCalls += 1;
        throw new Error("must not be called");
      },
    };
    const outbox: DocumentScanOutbox = { dispatch: async () => ({}) };
    const input = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
    };

    await expect(completeDocumentUpload(input, {
      repository,
      reader: {
        readUploadedObject: async () => ({
          objectKey: OBJECT_KEY,
          bytes: new TextEncoder().encode("hello"),
          mediaType: "text/csv",
          byteSize: 5,
        }),
      },
      outbox,
    })).rejects.toMatchObject({ code: "intake_boundary_error" });

    let reads = 0;
    const accessorObject = {
      objectKey: OBJECT_KEY,
      get bytes() { reads += 1; throw new Error("getter"); },
      mediaType: "text/plain",
      byteSize: 5,
    };
    await expect(completeDocumentUpload(input, {
      repository,
      reader: { readUploadedObject: async () => accessorObject },
      outbox,
    })).rejects.toMatchObject({ code: "intake_boundary_error" });
    expect(reads).toBe(0);
    expect(finalizeCalls).toBe(0);
  });

  it("leaves a transactionally staged scan pending when dispatch fails", async () => {
    const bytes = new TextEncoder().encode("hello");
    const checksum = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
    const record = reservationRecord();
    const repository: Pick<DocumentIntakeRepository, "getUploadReservation" | "finalizeQuarantine"> = {
      getUploadReservation: async () => record,
      finalizeQuarantine: async () => ({
        kind: "quarantined",
        record: { ...record, checksum, state: "quarantined" },
        processing: {
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          sourceIdentity: record.sourceIdentity,
          documentId: DOCUMENT_ID,
          versionId: VERSION_ID,
          checksum,
          policyVersion: "launch-v1",
        },
        outbox: {
          dispatchKey: `scan:${VERSION_ID}:${checksum}`,
          jobId: "44444444-4444-4444-8444-444444444444",
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          documentId: DOCUMENT_ID,
          versionId: VERSION_ID,
          objectKey: OBJECT_KEY,
          checksum,
          policyVersion: "launch-v1",
        },
      }),
    };

    await expect(completeDocumentUpload({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
    }, {
      repository,
      reader: { readUploadedObject: async () => ({ objectKey: OBJECT_KEY, bytes, mediaType: "text/plain", byteSize: 5 }) },
      outbox: { dispatch: async () => { throw new Error("queue unavailable"); } },
    })).resolves.toMatchObject({ scanDispatch: "pending", record: { state: "quarantined" } });
  });

  it("deduplicates concurrent identical finalizations only inside the exact tenant and source", async () => {
    const bytes = new TextEncoder().encode("hello");
    const records = new Map([
      [VERSION_ID, reservationRecord()],
      [SECOND_VERSION_ID, reservationRecord({
        versionId: SECOND_VERSION_ID,
        idempotencyKey: "upload-request-0002",
        objectKey: `tenants/${TENANT_ID}/documents/${DOCUMENT_ID}/versions/${SECOND_VERSION_ID}/original`,
      })],
    ]);
    let canonical: { record: DocumentUploadReservationRecord; checksum: string } | undefined;
    let dispatches = 0;
    const repository: Pick<DocumentIntakeRepository, "getUploadReservation" | "finalizeQuarantine"> = {
      getUploadReservation: async (identity) => records.get(identity.versionId),
      finalizeQuarantine: async (request) => {
        const current = canonical;
        if (current) {
          return {
            kind: "duplicate",
            record: { ...request.reservation, checksum: request.checksum, state: "quarantined" },
            processing: {
              tenantId: TENANT_ID,
              workspaceId: WORKSPACE_ID,
              sourceIdentity: current.record.sourceIdentity,
              documentId: current.record.documentId,
              versionId: current.record.versionId,
              checksum: current.checksum,
              policyVersion: "launch-v1",
            },
            outbox: null,
          };
        }
        canonical = { record: request.reservation, checksum: request.checksum };
        return {
          kind: "quarantined",
          record: { ...request.reservation, checksum: request.checksum, state: "quarantined" },
          processing: {
            tenantId: TENANT_ID,
            workspaceId: WORKSPACE_ID,
            sourceIdentity: request.reservation.sourceIdentity,
            documentId: request.reservation.documentId,
            versionId: request.reservation.versionId,
            checksum: request.checksum,
            policyVersion: "launch-v1",
          },
          outbox: {
            dispatchKey: `scan:${request.reservation.versionId}:${request.checksum}`,
            jobId: "44444444-4444-4444-8444-444444444444",
            tenantId: TENANT_ID,
            workspaceId: WORKSPACE_ID,
            documentId: request.reservation.documentId,
            versionId: request.reservation.versionId,
            objectKey: request.reservation.objectKey,
            checksum: request.checksum,
            policyVersion: "launch-v1",
          },
        };
      },
    };
    const reader: UploadedDocumentReader = {
      readUploadedObject: async (request) => ({
        objectKey: request.objectKey,
        bytes,
        mediaType: "text/plain",
        byteSize: 5,
      }),
    };
    const outbox: DocumentScanOutbox = {
      dispatch: async (message) => {
        dispatches += 1;
        return { dispatchKey: message.dispatchKey, status: "accepted" };
      },
    };

    const results = await Promise.all([
      completeDocumentUpload({
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        documentId: DOCUMENT_ID,
        versionId: VERSION_ID,
        idempotencyKey: "upload-request-0001",
      }, { repository, reader, outbox }),
      completeDocumentUpload({
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        documentId: DOCUMENT_ID,
        versionId: SECOND_VERSION_ID,
        idempotencyKey: "upload-request-0002",
      }, { repository, reader, outbox }),
    ]);

    expect(results.map((result) => result.scanDispatch).sort()).toEqual(["accepted", "deduplicated"]);
    expect(new Set(results.map((result) => result.processing.versionId))).toEqual(new Set([VERSION_ID]));
    expect(dispatches).toBe(1);
  });

  it("leases and persists a checksum-bound clean scan before reporting success", async () => {
    let persisted: unknown;
    const repository: Pick<DocumentIntakeRepository, "leaseScanJob" | "persistScanResult"> = {
      leaseScanJob: async () => ({
        kind: "leased",
        lease: {
          leaseToken: "lease-token-00000001",
          jobId: SCAN_JOB_ID,
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          documentId: DOCUMENT_ID,
          versionId: VERSION_ID,
          objectKey: OBJECT_KEY,
          checksum: CHECKSUM,
          policyVersion: "launch-v1",
          attempt: 1,
          maxAttempts: 3,
          state: "quarantined",
        },
      }),
      persistScanResult: async (request) => {
        persisted = request;
        return {
          kind: "persisted",
          jobId: request.jobId,
          tenantId: request.tenantId,
          workspaceId: request.workspaceId,
          documentId: request.documentId,
          versionId: request.versionId,
          checksum: request.checksum,
          policyVersion: request.policyVersion,
          state: request.state,
          retryScheduled: request.retryRequested,
        };
      },
    };

    const result = await processDocumentScan({
      jobId: SCAN_JOB_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      checksum: CHECKSUM,
      policyVersion: "launch-v1",
    }, {
      repository,
      scanner: {
        scan: async (request) => ({
          verdict: "clean",
          scannerAdapterId: "fixture-scanner",
          scannerVersion: "1.0.0",
          scannedChecksum: request.checksum,
          scannedAt: new Date().toISOString(),
          policyVersion: request.policyVersion,
        }),
      },
    });

    expect(result).toMatchObject({
      kind: "persisted",
      jobId: SCAN_JOB_ID,
      state: "clean",
      retryScheduled: false,
      scan: { verdict: "clean", scannedChecksum: CHECKSUM },
    });
    expect(persisted).toMatchObject({
      tenantId: TENANT_ID,
      versionId: VERSION_ID,
      checksum: CHECKSUM,
      state: "clean",
      retryRequested: false,
    });
    expect(Object.isFrozen(result.scan)).toBe(true);
  });

  it.each([
    { attempt: 1, retryScheduled: true },
    { attempt: 3, retryScheduled: false },
  ])("persists scanner failures as non-clean with bounded retry=$retryScheduled", async ({ attempt, retryScheduled }) => {
    const repository: Pick<DocumentIntakeRepository, "leaseScanJob" | "persistScanResult"> = {
      leaseScanJob: async () => ({
        kind: "leased",
        lease: {
          leaseToken: "lease-token-00000001",
          jobId: SCAN_JOB_ID,
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          documentId: DOCUMENT_ID,
          versionId: VERSION_ID,
          objectKey: OBJECT_KEY,
          checksum: CHECKSUM,
          policyVersion: "launch-v1",
          attempt,
          maxAttempts: 3,
          state: "quarantined",
        },
      }),
      persistScanResult: async (request) => ({
        kind: "persisted",
        jobId: request.jobId,
        tenantId: request.tenantId,
        workspaceId: request.workspaceId,
        documentId: request.documentId,
        versionId: request.versionId,
        checksum: request.checksum,
        policyVersion: request.policyVersion,
        state: request.state,
        retryScheduled: request.retryRequested,
      }),
    };

    await expect(processDocumentScan({
      jobId: SCAN_JOB_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      checksum: CHECKSUM,
      policyVersion: "launch-v1",
    }, {
      repository,
      scanner: { scan: async () => { throw new Error("scanner timeout"); } },
    })).resolves.toMatchObject({
      state: "scanner_error",
      retryScheduled,
      scan: { verdict: "error", reasonCode: "adapter_error", retryable: true },
    });
  });

  it("rejects a cross-tenant or accessor lease before invoking the scanner", async () => {
    let scannerCalls = 0;
    const scanner = {
      scan: async () => {
        scannerCalls += 1;
        return {};
      },
    };
    const input = {
      jobId: SCAN_JOB_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      checksum: CHECKSUM,
      policyVersion: "launch-v1",
    };
    const persistScanResult = async () => { throw new Error("must not persist"); };

    await expect(processDocumentScan(input, {
      repository: {
        leaseScanJob: async () => ({
          kind: "leased",
          lease: {
            leaseToken: "lease-token-00000001",
            jobId: SCAN_JOB_ID,
            tenantId: "99999999-9999-4999-8999-999999999999",
            workspaceId: WORKSPACE_ID,
            documentId: DOCUMENT_ID,
            versionId: VERSION_ID,
            objectKey: OBJECT_KEY,
            checksum: CHECKSUM,
            policyVersion: "launch-v1",
            attempt: 1,
            maxAttempts: 3,
            state: "quarantined",
          },
        }),
        persistScanResult,
      },
      scanner,
    })).rejects.toMatchObject({ code: "persistence_boundary_error" });

    let reads = 0;
    await expect(processDocumentScan(input, {
      repository: {
        leaseScanJob: async () => ({
          kind: "leased",
          get lease() { reads += 1; throw new Error("getter"); },
        }),
        persistScanResult,
      },
      scanner,
    })).rejects.toMatchObject({ code: "persistence_boundary_error" });
    expect(reads).toBe(0);
    expect(scannerCalls).toBe(0);
  });

  it("never reports a scanner verdict when result persistence fails", async () => {
    await expect(processDocumentScan({
      jobId: SCAN_JOB_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      checksum: CHECKSUM,
      policyVersion: "launch-v1",
    }, {
      repository: {
        leaseScanJob: async () => ({
          kind: "leased",
          lease: {
            leaseToken: "lease-token-00000001",
            jobId: SCAN_JOB_ID,
            tenantId: TENANT_ID,
            workspaceId: WORKSPACE_ID,
            documentId: DOCUMENT_ID,
            versionId: VERSION_ID,
            objectKey: OBJECT_KEY,
            checksum: CHECKSUM,
            policyVersion: "launch-v1",
            attempt: 1,
            maxAttempts: 3,
            state: "quarantined",
          },
        }),
        persistScanResult: async () => { throw new Error("database unavailable"); },
      },
      scanner: {
        scan: async () => ({
          verdict: "clean",
          scannerAdapterId: "fixture-scanner",
          scannerVersion: "1.0.0",
          scannedChecksum: CHECKSUM,
          scannedAt: new Date().toISOString(),
          policyVersion: "launch-v1",
        }),
      },
    })).rejects.toMatchObject({ code: "persistence_boundary_error" });
  });

  it("replays a persisted scan result without invoking the scanner again", async () => {
    let scannerCalls = 0;
    await expect(processDocumentScan({
      jobId: SCAN_JOB_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      checksum: CHECKSUM,
      policyVersion: "launch-v1",
    }, {
      repository: {
        leaseScanJob: async () => ({
          kind: "already_persisted",
          result: {
            jobId: SCAN_JOB_ID,
            tenantId: TENANT_ID,
            workspaceId: WORKSPACE_ID,
            documentId: DOCUMENT_ID,
            versionId: VERSION_ID,
            checksum: CHECKSUM,
            policyVersion: "launch-v1",
            state: "clean",
            scan: {
              verdict: "clean",
              scannerAdapterId: "fixture-scanner",
              scannerVersion: "1.0.0",
              scannedChecksum: CHECKSUM,
              scannedAt: "2026-08-29T12:00:00.000Z",
              policyVersion: "launch-v1",
            },
            retryScheduled: false,
          },
        }),
        persistScanResult: async () => { throw new Error("must not persist"); },
      },
      scanner: { scan: async () => { scannerCalls += 1; return {}; } },
    })).resolves.toMatchObject({ kind: "replay", state: "clean", retryScheduled: false });
    expect(scannerCalls).toBe(0);
  });

  it("rejects a persisted reservation whose fingerprint is well-formed but not canonical", async () => {
    let readerCalls = 0;
    await expect(completeDocumentUpload({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
    }, {
      repository: {
        getUploadReservation: async () => reservationRecord({ requestFingerprint: "f".repeat(64) }),
        finalizeQuarantine: async () => { throw new Error("must not finalize"); },
      },
      reader: {
        readUploadedObject: async () => {
          readerCalls += 1;
          throw new Error("must not read");
        },
      },
      outbox: { dispatch: async () => { throw new Error("must not dispatch"); } },
    })).rejects.toMatchObject({ code: "persistence_boundary_error" });
    expect(readerCalls).toBe(0);
  });

  it.each(["clean", "infected"] as const)(
    "rejects a replay that schedules retry for a terminal %s verdict",
    async (verdict) => {
    let scannerCalls = 0;
    await expect(processDocumentScan({
      jobId: SCAN_JOB_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      checksum: CHECKSUM,
      policyVersion: "launch-v1",
    }, {
      repository: {
        leaseScanJob: async () => ({
          kind: "already_persisted",
          result: {
            jobId: SCAN_JOB_ID,
            tenantId: TENANT_ID,
            workspaceId: WORKSPACE_ID,
            documentId: DOCUMENT_ID,
            versionId: VERSION_ID,
            checksum: CHECKSUM,
            policyVersion: "launch-v1",
            state: verdict,
            scan: {
              verdict,
              scannerAdapterId: "fixture-scanner",
              scannerVersion: "1.0.0",
              scannedChecksum: CHECKSUM,
              scannedAt: "2026-08-29T12:00:00.000Z",
              policyVersion: "launch-v1",
              retryable: true,
            },
            retryScheduled: true,
          },
        }),
        persistScanResult: async () => { throw new Error("must not persist"); },
      },
      scanner: { scan: async () => { scannerCalls += 1; return {}; } },
    })).rejects.toMatchObject({ code: "persistence_boundary_error" });
    expect(scannerCalls).toBe(0);
    },
  );

  it("rejects workspace drift in finalization and persisted scan success responses", async () => {
    const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const bytes = new TextEncoder().encode("hello");
    const record = reservationRecord();
    let outboxCalls = 0;
    await expect(completeDocumentUpload({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
    }, {
      repository: {
        getUploadReservation: async () => record,
        finalizeQuarantine: async (request) => ({
          kind: "quarantined",
          record: { ...record, checksum: request.checksum, state: "quarantined" },
          processing: {
            tenantId: TENANT_ID,
            workspaceId: otherWorkspaceId,
            sourceIdentity: record.sourceIdentity,
            documentId: DOCUMENT_ID,
            versionId: VERSION_ID,
            checksum: request.checksum,
            policyVersion: "launch-v1",
          },
          outbox: null,
        }),
      },
      reader: {
        readUploadedObject: async () => ({
          objectKey: OBJECT_KEY,
          bytes,
          mediaType: "text/plain",
          byteSize: 5,
        }),
      },
      outbox: { dispatch: async () => { outboxCalls += 1; return {}; } },
    })).rejects.toMatchObject({ code: "persistence_boundary_error" });
    expect(outboxCalls).toBe(0);

    const scanInput = {
      jobId: SCAN_JOB_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      checksum: CHECKSUM,
      policyVersion: "launch-v1",
    };
    await expect(processDocumentScan(scanInput, {
      repository: {
        leaseScanJob: async () => ({
          kind: "leased",
          lease: {
            leaseToken: "lease-token-00000001",
            ...scanInput,
            objectKey: OBJECT_KEY,
            attempt: 1,
            maxAttempts: 3,
            state: "quarantined",
          },
        }),
        persistScanResult: async (request) => ({
          kind: "persisted",
          ...scanInput,
          workspaceId: otherWorkspaceId,
          state: request.state,
          retryScheduled: request.retryRequested,
        }),
      },
      scanner: {
        scan: async (request) => ({
          verdict: "clean",
          scannerAdapterId: "fixture-scanner",
          scannerVersion: "1.0.0",
          scannedChecksum: request.checksum,
          scannedAt: new Date().toISOString(),
          policyVersion: request.policyVersion,
        }),
      },
    })).rejects.toMatchObject({ code: "persistence_boundary_error" });
  });

  it("requires the exact workspace throughout completion and scan persistence", async () => {
    const bytes = new TextEncoder().encode("hello");
    const record = reservationRecord();
    const completeInput = {
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      idempotencyKey: "upload-request-0001",
    };
    const completion = await completeDocumentUpload(completeInput, {
      repository: {
        getUploadReservation: async (identity) => {
          expect(identity).toEqual(completeInput);
          return record;
        },
        finalizeQuarantine: async (request) => {
          expect(request.reservation.workspaceId).toBe(WORKSPACE_ID);
          expect(request.dedupeScope.workspaceId).toBe(WORKSPACE_ID);
          return {
            kind: "quarantined",
            record: { ...record, checksum: request.checksum, state: "quarantined" },
            processing: {
              tenantId: TENANT_ID,
              workspaceId: WORKSPACE_ID,
              sourceIdentity: record.sourceIdentity,
              documentId: DOCUMENT_ID,
              versionId: VERSION_ID,
              checksum: request.checksum,
              policyVersion: "launch-v1",
            },
            outbox: {
              dispatchKey: `scan:${VERSION_ID}:${request.checksum}`,
              jobId: SCAN_JOB_ID,
              tenantId: TENANT_ID,
              workspaceId: WORKSPACE_ID,
              documentId: DOCUMENT_ID,
              versionId: VERSION_ID,
              objectKey: OBJECT_KEY,
              checksum: request.checksum,
              policyVersion: "launch-v1",
            },
          };
        },
      },
      reader: {
        readUploadedObject: async (request) => {
          expect(request).toMatchObject({ workspaceId: WORKSPACE_ID });
          return { objectKey: OBJECT_KEY, bytes, mediaType: "text/plain", byteSize: 5 };
        },
      },
      outbox: {
        dispatch: async (message) => {
          expect(message.workspaceId).toBe(WORKSPACE_ID);
          return { dispatchKey: message.dispatchKey, status: "accepted" };
        },
      },
    });
    expect(completion).toMatchObject({
      record: { workspaceId: WORKSPACE_ID },
      processing: { workspaceId: WORKSPACE_ID },
      scanDispatch: "accepted",
    });

    const scanInput = {
      jobId: SCAN_JOB_ID,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      documentId: DOCUMENT_ID,
      versionId: VERSION_ID,
      checksum: CHECKSUM,
      policyVersion: "launch-v1",
    };
    const scanResult = await processDocumentScan(scanInput, {
      repository: {
        leaseScanJob: async (request) => {
          expect(request).toEqual(scanInput);
          return {
            kind: "leased",
            lease: {
              leaseToken: "lease-token-00000001",
              ...scanInput,
              objectKey: OBJECT_KEY,
              attempt: 1,
              maxAttempts: 3,
              state: "quarantined",
            },
          };
        },
        persistScanResult: async (request) => {
          expect(request.workspaceId).toBe(WORKSPACE_ID);
          return {
            kind: "persisted",
            ...scanInput,
            state: request.state,
            retryScheduled: request.retryRequested,
          };
        },
      },
      scanner: {
        scan: async (request) => ({
          verdict: "clean",
          scannerAdapterId: "fixture-scanner",
          scannerVersion: "1.0.0",
          scannedChecksum: request.checksum,
          scannedAt: new Date().toISOString(),
          policyVersion: request.policyVersion,
        }),
      },
    });
    expect(scanResult).toMatchObject({ workspaceId: WORKSPACE_ID, state: "clean" });

    const otherWorkspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    let readerCalls = 0;
    await expect(completeDocumentUpload({ ...completeInput, workspaceId: otherWorkspaceId }, {
      repository: {
        getUploadReservation: async () => record,
        finalizeQuarantine: async () => { throw new Error("must not finalize"); },
      },
      reader: {
        readUploadedObject: async () => {
          readerCalls += 1;
          throw new Error("must not read");
        },
      },
      outbox: { dispatch: async () => { throw new Error("must not dispatch"); } },
    })).rejects.toMatchObject({ code: "persistence_boundary_error" });
    expect(readerCalls).toBe(0);

    let scannerCalls = 0;
    await expect(processDocumentScan(scanInput, {
      repository: {
        leaseScanJob: async () => ({
          kind: "leased",
          lease: {
            leaseToken: "lease-token-00000001",
            ...scanInput,
            workspaceId: otherWorkspaceId,
            objectKey: OBJECT_KEY,
            attempt: 1,
            maxAttempts: 3,
            state: "quarantined",
          },
        }),
        persistScanResult: async () => { throw new Error("must not persist"); },
      },
      scanner: { scan: async () => { scannerCalls += 1; return {}; } },
    })).rejects.toMatchObject({ code: "persistence_boundary_error" });
    expect(scannerCalls).toBe(0);
  });
});
