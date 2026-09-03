import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ requirePermission: vi.fn() }));
const tenantMocks = vi.hoisted(() => ({
  requireTenantPermission: vi.fn(),
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: string, callback: () => unknown) => callback()),
  withTenantDbContext: vi.fn((callback: () => unknown) => callback()),
}));
const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getLeadById: vi.fn(),
  getSettings: vi.fn(),
  getAiVerificationCandidates: vi.fn(),
  getQualityAiVerificationCandidates: vi.fn(),
  getQualityActionCandidateIds: vi.fn(),
  queueLeadsForEnrichment: vi.fn(),
  markLeadAiVerified: vi.fn(),
  createAuditLog: vi.fn(),
}));
const verificationMocks = vi.hoisted(() => ({
  computeLeadWinProbability: vi.fn(),
  enqueueAiVerificationForLead: vi.fn(),
  isWeakWebsiteOpportunity: vi.fn(),
  performAiVerification: vi.fn(),
  queueMissingAiVerifications: vi.fn(),
  queueMissingAiVerificationsAction: vi.fn(),
  repairLeadAiWebsiteViability: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requirePermission: authMocks.requirePermission }));
vi.mock("@/lib/tenancy/authorize", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenancy/authorize")>();
  return { ...actual, requireTenantPermission: tenantMocks.requireTenantPermission };
});
vi.mock("@/lib/tenancy/context", () => ({ runWithTenantContext: tenantMocks.runWithTenantContext }));
vi.mock("@/lib/db", () => ({ withTenantDbContext: tenantMocks.withTenantDbContext }));
vi.mock("@/lib/db/queries", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db/queries")>(),
  ...queryMocks,
}));
vi.mock("@/lib/ai/verification-worker", () => verificationMocks);

import {
  queueMissingAiVerificationsAction,
  queueQualityAiVerificationBatchAction,
  queueQualityEnrichmentBatchAction,
  runAiVerificationBatchAction,
  runQualityAiVerificationBatchAction,
} from "@/lib/leads/actions";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const LEAD_A = "10000000-0000-4000-8000-000000000001";
const LEAD_B = "10000000-0000-4000-8000-000000000002";
const tenantSession = {
  userId: "manager-1",
  email: "manager@example.com",
  displayName: "Manager",
  tenantId: TENANT_A,
  workspaceId: null,
  membershipId: "20000000-0000-4000-8000-000000000001",
  role: "owner" as const,
  roleBindingId: "30000000-0000-4000-8000-000000000001",
};
const leadA = { id: LEAD_A, tenant_id: TENANT_A, workspace_id: null };
const leadB = { id: LEAD_B, tenant_id: TENANT_B, workspace_id: null };
const settings = { ai_enabled: true, ai_batch_limit: 25 };

beforeEach(() => {
  vi.clearAllMocks();
  tenantMocks.requireTenantPermission.mockResolvedValue(tenantSession);
  tenantMocks.withTenantDbContext.mockImplementation((callback: () => unknown) => callback());
  authMocks.requirePermission.mockResolvedValue({ userId: "manager-1", email: "manager@example.com", role: "admin" });
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.getSettings.mockResolvedValue(settings);
  queryMocks.getLeadById.mockImplementation(async (id: string) => id === LEAD_A ? leadA : id === LEAD_B ? leadB : null);
  queryMocks.createAuditLog.mockResolvedValue(undefined);
  verificationMocks.performAiVerification.mockResolvedValue({
    success: true,
    cached: false,
    verification: { id: "verification-1", input_hash: "hash-1" },
  });
  verificationMocks.enqueueAiVerificationForLead.mockResolvedValue({ status: "queued", leadId: LEAD_A, reason: "quality_workspace" });
  verificationMocks.queueMissingAiVerifications.mockResolvedValue({ scanned: 1, queued: 1, skippedFresh: 0, skippedIneligible: 0 });
});

describe("tenant-bound lead AI batch actions", () => {
  it("preserves a manager batch verification for tenant-owned candidates", async () => {
    queryMocks.getAiVerificationCandidates.mockResolvedValue([leadA]);

    await expect(runAiVerificationBatchAction({ limit: 1 }, { tenantId: TENANT_A }))
      .resolves.toMatchObject({ success: true, processed: 1, verified: 1 });

    expect(queryMocks.getAiVerificationCandidates).toHaveBeenCalledWith(1, TENANT_A, undefined);
    expect(verificationMocks.performAiVerification).toHaveBeenCalledOnce();
  });

  it("preflights the complete candidate set before the first provider call", async () => {
    queryMocks.getAiVerificationCandidates.mockResolvedValue([leadA, leadB]);

    await expect(runAiVerificationBatchAction({ limit: 2 })).resolves.toEqual({ error: "Lead not found" });

    expect(verificationMocks.performAiVerification).not.toHaveBeenCalled();
    expect(queryMocks.markLeadAiVerified).not.toHaveBeenCalled();
  });

  it("rejects mixed-tenant selected IDs before quality verification provider calls", async () => {
    await expect(runQualityAiVerificationBatchAction({ ids: [LEAD_A, LEAD_B] }))
      .resolves.toEqual({ error: "Lead not found" });

    expect(queryMocks.getQualityAiVerificationCandidates).not.toHaveBeenCalled();
    expect(verificationMocks.performAiVerification).not.toHaveBeenCalled();
  });

  it("rejects mixed-tenant selected IDs before AI enqueue calls", async () => {
    await expect(queueQualityAiVerificationBatchAction({ ids: [LEAD_A, LEAD_B] }))
      .resolves.toEqual({ error: "Lead not found" });

    expect(queryMocks.getQualityAiVerificationCandidates).not.toHaveBeenCalled();
    expect(verificationMocks.enqueueAiVerificationForLead).not.toHaveBeenCalled();
  });

  it("rejects mixed-tenant selected IDs before enrichment queue writes", async () => {
    await expect(queueQualityEnrichmentBatchAction({ ids: [LEAD_A, LEAD_B] }))
      .resolves.toEqual({ error: "Lead not found" });

    expect(queryMocks.getQualityActionCandidateIds).not.toHaveBeenCalled();
    expect(queryMocks.queueLeadsForEnrichment).not.toHaveBeenCalled();
  });

  it("passes the canonical tenant into the missing-verification queue", async () => {
    await expect(queueMissingAiVerificationsAction({ tenantId: TENANT_A }))
      .resolves.toMatchObject({ queued: 1 });

    expect(verificationMocks.queueMissingAiVerifications).toHaveBeenCalledWith(TENANT_A, 10000);
  });
});
