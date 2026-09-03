import { isProxy } from "node:util/types";

import type { TenantSession } from "@/lib/auth";
import { withTenantDbContext } from "@/lib/db";
import {
  requireTenantPermission,
  TenantAuthorizationError,
  type TenantPolicyEvaluator,
  type TenantSessionBoundary,
} from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";

import type { DocumentStorageAdapter } from "./adapters";
import { DocumentIntakeError } from "./errors";
import {
  initiateDocumentIntake,
  type InitiateDocumentIntakeInput,
  type InitiateDocumentIntakeResult,
} from "./intake-service";
import { createPostgresDocumentIntakeRepository } from "./postgres-intake-repository";
import { validateDocumentReservation } from "./validation";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const POLICY_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const INPUT_FIELDS = [
  "tenantId", "workspaceId", "documentId", "versionId", "idempotencyKey", "fileName",
  "declaredMediaType", "declaredByteSize", "scannerPolicyVersion",
] as const;

export type AuthenticatedDocumentIntakeDependencies = Readonly<{
  correlationId: string;
  storage: DocumentStorageAdapter;
  sessionBoundary?: TenantSessionBoundary;
  policyEvaluator?: TenantPolicyEvaluator;
}>;

function invalidInput(): DocumentIntakeError {
  return new DocumentIntakeError("intake_boundary_error", "The document intake request is invalid.");
}

function snapshotInput(value: unknown): InitiateDocumentIntakeInput {
  if (!value || typeof value !== "object" || isProxy(value) || Array.isArray(value)) throw invalidInput();
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw invalidInput();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== INPUT_FIELDS.length || keys.some((key) =>
      typeof key !== "string" || !INPUT_FIELDS.includes(key as (typeof INPUT_FIELDS)[number]))) throw invalidInput();
    const snapshot: Record<string, unknown> = {};
    for (const field of INPUT_FIELDS) {
      const descriptor = descriptors[field];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) throw invalidInput();
      snapshot[field] = descriptor.value;
    }
    if (
      typeof snapshot.tenantId !== "string" || !UUID.test(snapshot.tenantId) ||
      typeof snapshot.workspaceId !== "string" || !UUID.test(snapshot.workspaceId) ||
      typeof snapshot.documentId !== "string" || !UUID.test(snapshot.documentId) ||
      typeof snapshot.versionId !== "string" || !UUID.test(snapshot.versionId) ||
      typeof snapshot.idempotencyKey !== "string" || !IDEMPOTENCY_KEY.test(snapshot.idempotencyKey) ||
      typeof snapshot.scannerPolicyVersion !== "string" || !POLICY_VERSION.test(snapshot.scannerPolicyVersion) ||
      typeof snapshot.fileName !== "string" || snapshot.fileName.length > 1024
    ) throw invalidInput();
    const input = snapshot as InitiateDocumentIntakeInput;
    validateDocumentReservation(input);
    return Object.freeze({ ...input });
  } catch (error) {
    if (error instanceof DocumentIntakeError) throw error;
    throw invalidInput();
  }
}

function assertExactScope(session: TenantSession, input: InitiateDocumentIntakeInput): void {
  if (session.tenantId !== input.tenantId || session.workspaceId !== input.workspaceId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }
}

export async function initiateAuthenticatedDocumentIntake(
  rawInput: InitiateDocumentIntakeInput,
  dependencies: AuthenticatedDocumentIntakeDependencies,
): Promise<InitiateDocumentIntakeResult> {
  const input = snapshotInput(rawInput);
  const session = await requireTenantPermission(
    { tenantId: input.tenantId, workspaceId: input.workspaceId },
    "knowledge:upload",
    {
      action: "document:upload",
      policyEvaluator: dependencies.policyEvaluator,
      sessionBoundary: dependencies.sessionBoundary,
    },
  );
  assertExactScope(session, input);

  return runWithTenantContext(session, dependencies.correlationId, () =>
    withTenantDbContext(async (db) => initiateDocumentIntake(input, {
      repository: createPostgresDocumentIntakeRepository(db),
      storage: dependencies.storage,
    })),
  );
}
