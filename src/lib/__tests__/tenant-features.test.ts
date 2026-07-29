import { describe, expect, it, vi } from "vitest";
import type { TenantPolicy } from "@/lib/tenancy/types";
import {
  createTenantFeatureService,
  FEATURE_MANAGE_PERMISSION,
  TENANT_FEATURES,
  TENANT_FEATURE_IDS,
  TENANT_FEATURE_POLICY_FIELDS,
  TenantFeatureDeniedError,
  TenantFeatureInputError,
  type TenantFeatureActorResolver,
  type TenantFeaturePolicyChangeCommand,
  type TrustedTenantFeatureManager,
} from "@/lib/tenancy/features";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const AUTH_A = "50000000-0000-4000-8000-000000000001";
const AUTH_B = "50000000-0000-4000-8000-000000000002";

type PolicyEnablementOverrides = Partial<
  Pick<TenantPolicy, "aiProcessingEnabled" | "sourceResearchEnabled" | "contactResearchEnabled" | "outreachDraftingEnabled" | "copyExportEnabled">
>;

function policy(tenantId: string, enabled: PolicyEnablementOverrides = {}, version = 3): TenantPolicy {
  return {
    id: `40000000-0000-4000-8000-${tenantId.slice(-12)}`,
    tenantId,
    version,
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
    aiProcessingEnabled: false,
    sourceResearchEnabled: false,
    contactResearchEnabled: false,
    outreachDraftingEnabled: false,
    copyExportEnabled: false,
    autonomousSendEnabled: false,
    requireSourcePlanApproval: true,
    requireKnowledgeReview: true,
    requireIcpReview: true,
    requireLeadPlayReview: true,
    requireContactReview: true,
    requireOutreachReview: true,
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T01:00:00.000Z",
    ...enabled,
  };
}

function trustedActor(tenantId: string, authIdentityId = AUTH_A): TrustedTenantFeatureManager {
  return { tenantId, authIdentityId, permission: FEATURE_MANAGE_PERMISSION };
}

function serviceWith(
  policies: Record<string, unknown | null>,
  actor: TrustedTenantFeatureManager | null = trustedActor(TENANT_A),
) {
  const getCurrentTenantPolicy = vi.fn(async (tenantId: string) => policies[tenantId] ?? null);
  const actorResolver: TenantFeatureActorResolver = {
    resolveFeatureManager: vi.fn(async () => actor),
  };
  const changeExecutor = {
    execute: vi.fn(async (command: TenantFeaturePolicyChangeCommand) => ({
      tenantId: command.tenantId,
      featureId: command.featureId,
      previousPolicyVersion: command.previousPolicyVersion,
      resultingPolicyVersion: command.resultingPolicyVersion,
    })),
  };
  const service = createTenantFeatureService({ policyRepository: { getCurrentTenantPolicy }, actorResolver, changeExecutor });
  return { service, getCurrentTenantPolicy, actorResolver, changeExecutor };
}

describe("tenant feature gate service", () => {
  it("contains exactly the six T-008 capabilities with one-to-one policy mapping", () => {
    expect(TENANT_FEATURE_IDS).toEqual([
      "ai_processing",
      "source_research",
      "contact_research",
      "outreach_drafting",
      "copy_export",
      "autonomous_send",
    ]);
    expect(TENANT_FEATURE_POLICY_FIELDS).toEqual({
      ai_processing: "aiProcessingEnabled",
      source_research: "sourceResearchEnabled",
      contact_research: "contactResearchEnabled",
      outreach_drafting: "outreachDraftingEnabled",
      copy_export: "copyExportEnabled",
      autonomous_send: "autonomousSendEnabled",
    });
    expect(new Set(Object.values(TENANT_FEATURE_POLICY_FIELDS)).size).toBe(TENANT_FEATURE_IDS.length);
  });

  it("resolves two tenants independently from the explicit tenant-scoped repository", async () => {
    const { service, getCurrentTenantPolicy } = serviceWith({
      [TENANT_A]: policy(TENANT_A, { aiProcessingEnabled: true, sourceResearchEnabled: true }),
      [TENANT_B]: policy(TENANT_B, { aiProcessingEnabled: false, sourceResearchEnabled: false }),
    });

    await expect(service.enforceFeature(TENANT_A, TENANT_FEATURES.AI_PROCESSING)).resolves.toMatchObject({ state: "enabled", policyVersion: 3 });
    await expect(service.enforceFeature(TENANT_B, TENANT_FEATURES.AI_PROCESSING)).rejects.toMatchObject({ code: "FEATURE_DISABLED_BY_POLICY" });
    expect(getCurrentTenantPolicy).toHaveBeenNthCalledWith(1, TENANT_A);
    expect(getCurrentTenantPolicy).toHaveBeenNthCalledWith(2, TENANT_B);
  });

  it("fails closed for missing and malformed policies", async () => {
    const { service } = serviceWith({
      [TENANT_A]: null,
      [TENANT_B]: { tenantId: TENANT_B, version: 4, aiProcessingEnabled: true },
    });

    await expect(service.resolveFeature(TENANT_A, TENANT_FEATURES.AI_PROCESSING)).resolves.toMatchObject({ state: "unconfigured", policyVersion: null, reasonCode: "POLICY_MISSING" });
    await expect(service.enforceFeature(TENANT_B, TENANT_FEATURES.AI_PROCESSING)).rejects.toMatchObject({ code: "POLICY_MALFORMED", resolution: { state: "malformed", policyVersion: 4 } });
  });

  it("denies autonomous send even for a forged policy row or request-shaped override", async () => {
    const forgedPolicy = { ...policy(TENANT_A), autonomousSendEnabled: true } as unknown as TenantPolicy;
    const { service } = serviceWith({ [TENANT_A]: forgedPolicy });

    await expect(service.resolveFeature(TENANT_A, TENANT_FEATURES.AUTONOMOUS_SEND)).resolves.toMatchObject({ state: "malformed", reasonCode: "AUTONOMOUS_SEND_FORBIDDEN" });
    await expect(service.enforceFeature(TENANT_A, TENANT_FEATURES.AUTONOMOUS_SEND)).rejects.toBeInstanceOf(TenantFeatureDeniedError);
    const forgedRequest = {
      tenantId: TENANT_A,
      featureId: TENANT_FEATURES.AUTONOMOUS_SEND,
      enabled: true,
      expectedPolicyVersion: 3,
      reason: "forged",
      correlationId: "corr-forged-send-001",
      humanReviewAcknowledged: true,
      actor: trustedActor(TENANT_B, AUTH_B),
    };
    await expect(service.requestFeatureChange(forgedRequest)).rejects.toMatchObject({ code: "AUTONOMOUS_SEND_FORBIDDEN" });
  });

  it("keeps resolution diagnostics separate from direct-call enforcement denial", async () => {
    const { service } = serviceWith({ [TENANT_A]: policy(TENANT_A) });

    await expect(service.resolveFeature(TENANT_A, TENANT_FEATURES.COPY_EXPORT)).resolves.toMatchObject({ state: "disabled", policyEnabled: false, policyVersion: 3, reasonCode: "FEATURE_DISABLED_BY_POLICY" });
    await expect(service.requireFeature(TENANT_A, TENANT_FEATURES.COPY_EXPORT)).rejects.toSatisfy(
      (error: unknown) => error instanceof TenantFeatureDeniedError && error.resolution.state === "disabled",
    );
  });

  it("does not resolve a policy returned for another tenant", async () => {
    const { service } = serviceWith({ [TENANT_A]: policy(TENANT_B, { aiProcessingEnabled: true }) });

    await expect(service.resolveFeature(TENANT_A, TENANT_FEATURES.AI_PROCESSING)).resolves.toMatchObject({ state: "scope_mismatch", policyEnabled: null, reasonCode: "POLICY_SCOPE_MISMATCH" });
    await expect(service.enforceFeature(TENANT_A, TENANT_FEATURES.AI_PROCESSING)).rejects.toBeInstanceOf(TenantFeatureDeniedError);
  });

  it("ignores forged request actor fields and sends only the resolver actor to one atomic executor", async () => {
    const trusted = trustedActor(TENANT_A);
    const { service, actorResolver, changeExecutor } = serviceWith({ [TENANT_A]: policy(TENANT_A) }, trusted);
    const forgedRequest = {
      tenantId: TENANT_A,
      featureId: TENANT_FEATURES.AI_PROCESSING,
      enabled: true,
      expectedPolicyVersion: 3,
      reason: `  ${"r".repeat(499)}  `,
      correlationId: "  corr-feature-enable-001  ",
      humanReviewAcknowledged: true,
      actor: trustedActor(TENANT_B, AUTH_B),
    };

    await expect(service.requestFeatureChange(forgedRequest)).resolves.toMatchObject({ status: "changed", previousPolicyVersion: 3, resultingPolicyVersion: 4 });
    expect(actorResolver.resolveFeatureManager).toHaveBeenCalledOnce();
    expect(actorResolver.resolveFeatureManager).toHaveBeenCalledWith(TENANT_A);
    expect(changeExecutor.execute).toHaveBeenCalledOnce();
    expect(changeExecutor.execute).toHaveBeenCalledWith({
      tenantId: TENANT_A,
      featureId: TENANT_FEATURES.AI_PROCESSING,
      actor: trusted,
      expectedPolicyVersion: 3,
      previousPolicyVersion: 3,
      resultingPolicyVersion: 4,
      humanReviewAcknowledged: true,
      mutation: expect.objectContaining({ enabled: true, previousEnabled: false, previousPolicyVersion: 3, resultingPolicyVersion: 4, expectedPolicyVersion: 3 }),
      auditEvent: expect.objectContaining({ eventType: "tenant_feature_policy_changed", enabled: true, previousPolicyVersion: 3, resultingPolicyVersion: 4, reason: "r".repeat(499), correlationId: "corr-feature-enable-001" }),
    });
  });

  it("denies resolver absence, denial, and tenant scope mismatch before repository or writes", async () => {
    const denied = serviceWith({ [TENANT_A]: policy(TENANT_A) }, null);
    await expect(denied.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: 3, reason: "enable pilot", correlationId: "corr-feature-denied-001", humanReviewAcknowledged: true })).rejects.toMatchObject({ code: "FEATURE_MANAGER_UNAUTHORIZED" });
    expect(denied.getCurrentTenantPolicy).not.toHaveBeenCalled();
    expect(denied.changeExecutor.execute).not.toHaveBeenCalled();

    const mismatched = serviceWith({ [TENANT_A]: policy(TENANT_A) }, trustedActor(TENANT_B, AUTH_B));
    await expect(mismatched.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: 3, reason: "enable pilot", correlationId: "corr-feature-denied-002", humanReviewAcknowledged: true })).rejects.toMatchObject({ code: "ACTOR_SCOPE_MISMATCH" });
    expect(mismatched.getCurrentTenantPolicy).not.toHaveBeenCalled();
    expect(mismatched.changeExecutor.execute).not.toHaveBeenCalled();
  });

  it("requires trusted authorization even for a no-op change", async () => {
    const denied = serviceWith({ [TENANT_A]: policy(TENANT_A) }, null);
    await expect(denied.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: false, expectedPolicyVersion: 3, reason: "confirm disabled", correlationId: "corr-feature-noop-001", humanReviewAcknowledged: true })).rejects.toMatchObject({ code: "FEATURE_MANAGER_UNAUTHORIZED" });
    expect(denied.getCurrentTenantPolicy).not.toHaveBeenCalled();

    const allowed = serviceWith({ [TENANT_A]: policy(TENANT_A) });
    await expect(allowed.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: false, expectedPolicyVersion: 3, reason: "confirm disabled", correlationId: "corr-feature-noop-002", humanReviewAcknowledged: true })).resolves.toMatchObject({ status: "unchanged", previousPolicyVersion: 3, resultingPolicyVersion: 3 });
    expect(allowed.changeExecutor.execute).not.toHaveBeenCalled();
  });

  it("rejects version conflicts and executor failures without a second write path", async () => {
    const conflict = serviceWith({ [TENANT_A]: policy(TENANT_A) });
    await expect(conflict.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: 2, reason: "enable pilot", correlationId: "corr-feature-conflict-001", humanReviewAcknowledged: true })).rejects.toMatchObject({ code: "POLICY_VERSION_CONFLICT" });
    expect(conflict.changeExecutor.execute).not.toHaveBeenCalled();

    const failed = serviceWith({ [TENANT_A]: policy(TENANT_A) });
    failed.changeExecutor.execute.mockRejectedValueOnce(new Error("atomic transaction failed"));
    await expect(failed.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: 3, reason: "enable pilot", correlationId: "corr-feature-failure-001", humanReviewAcknowledged: true })).rejects.toMatchObject({ code: "POLICY_CHANGE_EXECUTION_FAILED" });
    expect(failed.changeExecutor.execute).toHaveBeenCalledOnce();
  });

  it("requires the executor to return the exact committed +1 version", async () => {
    const stale = serviceWith({ [TENANT_A]: policy(TENANT_A) });
    stale.changeExecutor.execute.mockResolvedValueOnce({
      tenantId: TENANT_A,
      featureId: TENANT_FEATURES.AI_PROCESSING,
      previousPolicyVersion: 3,
      resultingPolicyVersion: 3,
    });
    await expect(stale.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: 3, reason: "enable pilot", correlationId: "corr-feature-stale-001", humanReviewAcknowledged: true })).rejects.toMatchObject({ code: "POLICY_CHANGE_EXECUTION_FAILED" });
    expect(stale.changeExecutor.execute).toHaveBeenCalledOnce();

    const mismatched = serviceWith({ [TENANT_A]: policy(TENANT_A) });
    mismatched.changeExecutor.execute.mockResolvedValueOnce({
      tenantId: TENANT_B,
      featureId: TENANT_FEATURES.AI_PROCESSING,
      previousPolicyVersion: 3,
      resultingPolicyVersion: 4,
    });
    await expect(mismatched.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: 3, reason: "enable pilot", correlationId: "corr-feature-mismatch-001", humanReviewAcknowledged: true })).rejects.toMatchObject({ code: "POLICY_CHANGE_EXECUTION_FAILED" });
  });

  it("guards the exact-plus-one policy version at the safe-integer boundary", async () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const overflow = serviceWith({ [TENANT_A]: policy(TENANT_A, {}, maximum) });
    await expect(overflow.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: maximum, reason: "enable pilot", correlationId: "corr-feature-overflow-001", humanReviewAcknowledged: true })).rejects.toMatchObject({ code: "POLICY_VERSION_OVERFLOW" });
    expect(overflow.changeExecutor.execute).not.toHaveBeenCalled();
  });

  it("rejects invalid runtime feature IDs before repository use and bounds request metadata", async () => {
    const { service, getCurrentTenantPolicy } = serviceWith({ [TENANT_A]: policy(TENANT_A) });
    await expect(service.resolveFeature(TENANT_A, "not_a_feature" as never)).rejects.toMatchObject({ code: "INVALID_FEATURE_ID" });
    expect(getCurrentTenantPolicy).not.toHaveBeenCalled();
    await expect(service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: 3, reason: " ", correlationId: "bad", humanReviewAcknowledged: true })).rejects.toBeInstanceOf(TenantFeatureInputError);
    expect(getCurrentTenantPolicy).not.toHaveBeenCalled();
  });

  it("rejects controls and unsafe audit characters while preserving the 500-character boundary", async () => {
    const valid = serviceWith({ [TENANT_A]: policy(TENANT_A) });
    await expect(valid.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: 3, reason: "A".repeat(500), correlationId: "corr-feature-reason-001", humanReviewAcknowledged: true })).resolves.toMatchObject({ status: "changed", resultingPolicyVersion: 4 });

    for (const reason of ["line\nbreak", "null\u0000byte", "c1\u0085byte", "<unsafe>", "A".repeat(501)]) {
      const candidate = serviceWith({ [TENANT_A]: policy(TENANT_A) });
      await expect(candidate.service.requestFeatureChange({ tenantId: TENANT_A, featureId: TENANT_FEATURES.AI_PROCESSING, enabled: true, expectedPolicyVersion: 3, reason, correlationId: "corr-feature-reason-002", humanReviewAcknowledged: true })).rejects.toMatchObject({ code: "INVALID_REASON" });
      expect(candidate.changeExecutor.execute).not.toHaveBeenCalled();
    }
  });
});
