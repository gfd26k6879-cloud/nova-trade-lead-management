import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  DataLifecyclePanel,
  type TenantDeletionJobView,
} from "@/components/admin/data-lifecycle-panel";
import type { TenantExportJob, TenantPolicy } from "@/lib/tenancy/types";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const EXPORT_JOB = "30000000-0000-4000-8000-000000000001";
const DELETE_JOB = "40000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);
const T0 = "2026-08-30T10:00:00.000Z";
const T1 = "2026-08-30T10:05:00.000Z";

const policy: TenantPolicy = {
  id: "50000000-0000-4000-8000-000000000001",
  tenantId: TENANT,
  version: 4,
  locale: "en-US",
  timezone: "UTC",
  exportRetentionDays: 7,
  operationalLogRetentionDays: 30,
  rawSourceRetentionDays: 180,
  contactFreshnessDays: 180,
  primaryDeleteWithinDays: 30,
  backupExpireWithinDays: 35,
  tombstoneRetentionYears: 7,
  activeMaterialsMode: "while_authorized_until_superseded_policy_or_deletion",
  aiProcessingEnabled: true,
  sourceResearchEnabled: true,
  contactResearchEnabled: true,
  outreachDraftingEnabled: true,
  copyExportEnabled: true,
  autonomousSendEnabled: false,
  requireSourcePlanApproval: true,
  requireKnowledgeReview: true,
  requireIcpReview: true,
  requireLeadPlayReview: true,
  requireContactReview: true,
  requireOutreachReview: true,
  createdAt: T0,
  updatedAt: T1,
};

function exportJob(overrides: Partial<TenantExportJob> = {}): TenantExportJob {
  return {
    id: EXPORT_JOB,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    operation: "tenant_data_export",
    requesterAuthIdentityId: "60000000-0000-4000-8000-000000000001",
    requesterMembershipId: "70000000-0000-4000-8000-000000000001",
    supportAccessGrantId: null,
    status: "requested",
    scopeHash: HASH,
    inputHash: HASH,
    idempotencyKeyHash: HASH,
    policyVersion: "policy-v4",
    manifestVersion: "d014-v1",
    schemaVersion: "tenant-export-job-v1",
    requestedFormat: "json",
    snapshotAt: null,
    artifactStorageRef: null,
    artifactChecksumSha256: null,
    includedCount: null,
    excludedCount: null,
    redactedCount: null,
    artifactCreatedAt: null,
    expiresAt: null,
    errorCode: null,
    errorMessage: null,
    retryCount: 0,
    maxRetries: 3,
    nextRetryAt: null,
    leaseOwnerHash: null,
    leaseGeneration: 0,
    leaseAcquiredAt: null,
    leaseHeartbeatAt: null,
    leaseExpiresAt: null,
    correlationId: "correlation-export-1",
    auditEventId: "80000000-0000-4000-8000-000000000001",
    createdAt: T0,
    updatedAt: T1,
    ...overrides,
  };
}

function deletionJob(overrides: Partial<TenantDeletionJobView> = {}): TenantDeletionJobView {
  const checkpoints = [
    "cache_idempotency", "search_embeddings", "queues_leases", "agent_context",
    "extracted_derivatives_previews_scanner", "object_quarantine_storage",
    "primary_database_negative_verification", "provider_external_copy_requests",
    "logs_telemetry_aggregates", "backup_aging",
  ] as const;
  return {
    id: DELETE_JOB,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    operation: "tenant_data_deletion",
    status: "requested",
    scopeKind: "workspace",
    scopeSelectorHash: HASH,
    policyVersion: "policy-v4",
    legalHoldStatus: "none",
    freezeHandoffStatus: "not_started",
    accessRevocationHandoffStatus: "not_started",
    checkpoints: checkpoints.map((store) => ({ store, status: "pending", required: true })),
    retryCount: 0,
    maxRetries: 3,
    backupExpiryTargetAt: null,
    errorCode: null,
    auditEventId: "90000000-0000-4000-8000-000000000001",
    createdAt: T0,
    updatedAt: T1,
    ...overrides,
  };
}

const permissions = { "data:export": true, "data:delete": true } as const;

describe("data lifecycle panel", () => {
  it("renders exact scoped export, deletion, retention, hold, progress, and audit facts", () => {
    const complete = deletionJob({
      status: "backup_aging",
      legalHoldStatus: "active_subset",
      legalHoldSnapshotHash: HASH,
      heldScopeHash: HASH,
      uncoveredScopeHash: HASH,
      backupExpiryTargetAt: "2026-09-30T10:00:00.000Z",
      checkpoints: deletionJob().checkpoints.map((checkpoint, index) => index < 9
        ? { ...checkpoint, status: "complete" as const }
        : checkpoint),
    });
    const html = renderToStaticMarkup(
      <DataLifecyclePanel state="ready" tenantId={TENANT} workspaceId={WORKSPACE} actorRole="owner" policy={policy}
        exportJob={exportJob()} deletionJob={complete} policyAuthorizations={permissions} />,
    );

    expect(html).toContain('aria-labelledby="data-lifecycle-title"');
    expect(html).toContain('data-export-status="requested"');
    expect(html).toContain('data-deletion-status="backup_aging"');
    expect(html).toContain("Workspace scope");
    expect(html).toContain(WORKSPACE);
    expect(html).toContain("9 of 10 checkpoints cleared");
    expect(html).toContain("Active subset held");
    expect(html).toContain("Export artifacts");
    expect(html).toContain("7 days");
    expect(html).toContain("Primary data deletion target");
    expect(html).toContain("30 days");
    expect(html).toContain("Tombstone metadata");
    expect(html).toContain("7 years");
    expect(html).toContain("Recorded audit event");
    expect(html).toContain("Irreversible after primary deletion begins");
    expect(html).not.toMatch(/leaseOwnerHash|idempotencyKeyHash|requesterAuthIdentityId/);
  });

  it("shows only callbacks allowed by the exact current state and supplied conditional permissions", () => {
    const requested = renderToStaticMarkup(
      <DataLifecyclePanel state="ready" tenantId={TENANT} workspaceId={WORKSPACE} actorRole="admin" policy={policy}
        exportJob={exportJob()} deletionJob={deletionJob()} policyAuthorizations={permissions}
        onRequestExport={vi.fn()} onCancelExport={vi.fn()} onRetryExport={vi.fn()}
        onRequestDeletion={vi.fn()} onCancelDeletion={vi.fn()} onRetryDeletion={vi.fn()} />,
    );
    expect(requested).toContain("Cancel export request");
    expect(requested).toContain("Cancel deletion request");
    expect(requested).not.toContain(">Request export<");
    expect(requested).not.toContain(">Request deletion<");
    expect(requested).not.toContain(">Retry export<");
    expect(requested).not.toContain(">Retry deletion<");

    const failed = renderToStaticMarkup(
      <DataLifecyclePanel state="ready" tenantId={TENANT} workspaceId={WORKSPACE} actorRole="owner" policy={policy}
        exportJob={exportJob({ status: "failed", errorCode: "EXPORT_ARTIFACT_FAILED", errorMessage: "Content-minimized failure", retryCount: 1 })}
        deletionJob={deletionJob({ status: "failed", retryCount: 1, freezeHandoffStatus: "acknowledged", accessRevocationHandoffStatus: "acknowledged" })}
        policyAuthorizations={permissions} onRetryExport={vi.fn()} onRetryDeletion={vi.fn()} />,
    );
    expect(failed).toContain(">Retry export<");
    expect(failed).toContain(">Retry deletion<");

    const denied = renderToStaticMarkup(
      <DataLifecyclePanel state="ready" tenantId={TENANT} workspaceId={WORKSPACE} actorRole="owner" policy={policy}
        exportJob={null} deletionJob={null} policyAuthorizations={{}}
        onRequestExport={vi.fn()} onRequestDeletion={vi.fn()} />,
    );
    expect(denied).not.toContain(">Request export<");
    expect(denied).not.toContain(">Request deletion<");
    expect(denied).toContain("Policy authorization required");
  });

  it("fails closed without enumerating records when canonical scope or job shape does not align", () => {
    const html = renderToStaticMarkup(
      <DataLifecyclePanel state="ready" tenantId={TENANT} workspaceId={WORKSPACE} actorRole="owner" policy={policy}
        exportJob={exportJob({ tenantId: "10000000-0000-4000-8000-000000000099" })}
        deletionJob={deletionJob()} policyAuthorizations={permissions}
        onCancelExport={vi.fn()} onCancelDeletion={vi.fn()} />,
    );
    expect(html).toContain('data-lifecycle-state="unavailable"');
    expect(html).toContain("Data lifecycle records unavailable");
    expect(html).not.toContain(EXPORT_JOB);
    expect(html).not.toContain(DELETE_JOB);
    expect(html).not.toContain("Cancel export request");
    expect(html).not.toContain("Cancel deletion request");

    const malformedScope = renderToStaticMarkup(
      <DataLifecyclePanel state="ready" tenantId={TENANT} workspaceId="not-a-workspace-id" actorRole="owner" policy={policy}
        exportJob={null} deletionJob={null} policyAuthorizations={permissions} onRequestDeletion={vi.fn()} />,
    );
    expect(malformedScope).toContain('data-lifecycle-state="unavailable"');
    expect(malformedScope).not.toContain("Request deletion");
  });

  it("renders explicit loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<DataLifecyclePanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading tenant data lifecycle");

    const error = renderToStaticMarkup(<DataLifecyclePanel state="error" error="Lifecycle fixture unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Lifecycle fixture unavailable.");

    const empty = renderToStaticMarkup(<DataLifecyclePanel state="empty" />);
    expect(empty).toContain('data-lifecycle-state="empty"');
    expect(empty).toContain("No lifecycle scope selected");
  });
});
