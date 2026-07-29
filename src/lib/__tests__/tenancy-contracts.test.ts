import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  ACTOR_LAYERS,
  AUTHORIZATION_RESULT_CODES,
  LAUNCH_ROLES,
  MEMBERSHIP_STATUSES,
  PROVISIONING_RESULT_CODES,
  PROVISIONING_WORKFLOW_STATES,
  SCOPE_CLASSES,
  TENANT_STATUSES,
  WORKSPACE_STATUSES,
} from "@/lib/tenancy/types";
import {
  actorLayerSchema,
  authorizationDecisionInputSchema,
  authorizationDecisionResultSchema,
  authIdentityIdSchema,
  isAllowedProvisioningTransition,
  launchRoleSchema,
  membershipDescriptorSchema,
  membershipStatusSchema,
  provisioningResultCodeSchema,
  provisioningTransitionInputSchema,
  provisioningTransitionResultSchema,
  provisioningWorkflowStateSchema,
  scopeClassSchema,
  supportGrantDescriptorSchema,
  tenantIdSchema,
  tenantLabelDescriptorSchema,
  tenantProvisioningCreateInputSchema,
  tenantProvisioningOperatorCommandSchema,
  tenantProvisioningRequestIntakeSchema,
  tenantSlugSchema,
  tenantStatusSchema,
  workspaceIdSchema,
  workspaceLabelDescriptorSchema,
  workspaceSlugSchema,
  workspaceBootstrapInputSchema,
  workspaceStatusSchema,
  workerLeaseDescriptorSchema,
} from "@/lib/tenancy/schemas";

const authorizationResultCodeSchema = z.enum(AUTHORIZATION_RESULT_CODES);

const VALID_UUID = "11111111-1111-1111-8111-111111111111";
const VALID_UUID_ALT = "22222222-2222-2222-8222-222222222222";

const TENANCY_ENUM_MATRIX = [
  { label: "TenantStatus", values: TENANT_STATUSES, schema: tenantStatusSchema },
  { label: "WorkspaceStatus", values: WORKSPACE_STATUSES, schema: workspaceStatusSchema },
  { label: "MembershipStatus", values: MEMBERSHIP_STATUSES, schema: membershipStatusSchema },
  { label: "LaunchRole", values: LAUNCH_ROLES, schema: launchRoleSchema },
  { label: "ScopeClass", values: SCOPE_CLASSES, schema: scopeClassSchema },
  { label: "ProvisioningWorkflowState", values: PROVISIONING_WORKFLOW_STATES, schema: provisioningWorkflowStateSchema },
  { label: "ProvisioningResultCode", values: PROVISIONING_RESULT_CODES, schema: provisioningResultCodeSchema },
  { label: "AuthorizationResultCode", values: AUTHORIZATION_RESULT_CODES, schema: authorizationResultCodeSchema },
  { label: "ActorLayer", values: ACTOR_LAYERS, schema: actorLayerSchema },
] as const;

describe("enumeration contracts", () => {
  it.each(TENANCY_ENUM_MATRIX)("accepts only documented enum values for $label", ({ values, schema }) => {
    for (const value of values) {
      expect(schema.safeParse(value).success).toBe(true);
    }
  });

  it.each(TENANCY_ENUM_MATRIX)("rejects non-enum values for $label", ({ schema }) => {
    const invalid = ["", "bad-value", 99, null, "tenant-wide-xx", "platform", true] as const;
    for (const value of invalid) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it("keeps AUTHORIZATION_RESULT_CODES exactly at contract cardinality", () => {
    expect(AUTHORIZATION_RESULT_CODES).toHaveLength(19);
  });

  it("keeps PROVISIONING_WORKFLOW_STATES exactly at contract cardinality", () => {
    expect(PROVISIONING_WORKFLOW_STATES).toHaveLength(15);
  });
});

describe("ID schemas", () => {
  it.each([tenantIdSchema, workspaceIdSchema, authIdentityIdSchema])("accepts UUIDs and rejects malformed IDs", (schema) => {
    const invalid = [
      "",
      "not-a-uuid",
      "1111-1111-1111-1111",
      "g1111111-1111-1111-8111-111111111111",
      5,
      null,
    ] as const;

    expect(schema.safeParse(VALID_UUID).success).toBe(true);
    expect(schema.safeParse(VALID_UUID_ALT).success).toBe(true);
    for (const candidate of invalid) {
      expect(schema.safeParse(candidate).success).toBe(false);
    }
  });

  it("accepts actor layer values from D-002 and rejects trust-record concepts", () => {
    expect(actorLayerSchema.safeParse("member").success).toBe(true);
    expect(actorLayerSchema.safeParse("support").success).toBe(true);
    expect(actorLayerSchema.safeParse("worker").success).toBe(true);
    expect(actorLayerSchema.safeParse("agent").success).toBe(true);
    expect(actorLayerSchema.safeParse("system").success).toBe(true);
    expect(actorLayerSchema.safeParse("identity").success).toBe(false);
    expect(actorLayerSchema.safeParse("membership").success).toBe(false);
    expect(actorLayerSchema.safeParse("guest").success).toBe(false);
  });
});

describe("text, key, locale, and policy schemas", () => {
  const baseProvisioning = {
    organizationName: "  Apex Materials  ",
    organizationSlug: "  Apex-Materials  ",
    requestedPolicyVersion: "1.0.0",
    idempotencyKey: "idemp-key-01",
    correlationId: "corr-01-abc",
  };

  it("normalizes and trims tenant command text", () => {
    const parsed = tenantProvisioningOperatorCommandSchema.parse({
      ...baseProvisioning,
      ownerIdentityId: VALID_UUID,
      workspace: {
        workspaceName: "North America Industrial",
        workspaceSlug: "north-america-industrial",
      },
    });

    expect(parsed.organizationName).toBe("Apex Materials");
    expect(parsed.organizationSlug).toBe("apex-materials");
    expect(parsed.workspace?.workspaceSlug).toBe("north-america-industrial");
  });

  it.each([
    { value: "1.0.0", ok: true, label: "semver" },
    { value: "d012_v2026_07_27_02", ok: true, label: "opaque policy version" },
    { value: "  ", ok: false, label: "blank" },
    { value: "v1", ok: false, label: "too short" },
    { value: "bad version", ok: false, label: "whitespace" },
  ])("validates policy version format: $label", ({ value, ok }) => {
    const parsed = tenantProvisioningOperatorCommandSchema.safeParse({
      organizationName: "Apex Materials",
      organizationSlug: "apex-materials",
      requestedPolicyVersion: value,
      ownerIdentityId: VALID_UUID,
      idempotencyKey: "idemp-key-01",
      correlationId: "corr-01-abc",
    });
    expect(parsed.success).toBe(ok);
  });

  it("rejects malformed text and malformed slugs", () => {
    expect(
      tenantProvisioningOperatorCommandSchema.safeParse({
        organizationName: "",
        organizationSlug: "apex-materials",
        requestedPolicyVersion: "1.0.0",
        ownerIdentityId: VALID_UUID,
        idempotencyKey: "idemp-key-01",
        correlationId: "corr-01-abc",
      }).success,
    ).toBe(false);

    expect(
      tenantProvisioningOperatorCommandSchema.safeParse({
        organizationName: "A",
        organizationSlug: "a",
        requestedPolicyVersion: "1.0.0",
        ownerIdentityId: VALID_UUID,
        idempotencyKey: "idemp-key-01",
        correlationId: "corr-01-abc",
      }).success,
    ).toBe(false);

    expect(tenantSlugSchema.safeParse("bad_slug").success).toBe(false);
    expect(workspaceSlugSchema.safeParse("Apex-Materials").success).toBe(true);
    expect(workspaceSlugSchema.safeParse(" -leading").success).toBe(false);
    expect(
      workspaceLabelDescriptorSchema.safeParse({
        workspaceId: VALID_UUID,
        workspaceName: "x".repeat(121),
        workspaceSlug: "valid-workspace",
        workspaceStatus: "active",
        tenantId: VALID_UUID,
      }).success,
    ).toBe(false);
  });

  it.each([
    { locale: "en-US", ok: true },
    { locale: "zh-Hant-TW", ok: true },
    { locale: "en US", ok: false },
    { locale: "bad_locale", ok: false },
  ])("validates locale values: %s", ({ locale, ok }) => {
    const result = tenantProvisioningOperatorCommandSchema.safeParse({
      organizationName: "Apex Materials",
      organizationSlug: "apex-materials",
      requestedPolicyVersion: "1.0.0",
      ownerIdentityId: VALID_UUID,
      idempotencyKey: "idemp-key-01",
      correlationId: "corr-01-abc",
      locale,
    });
    expect(result.success).toBe(ok);
  });

  it.each([
    { timezone: "America/Argentina/Buenos_Aires", ok: true },
    { timezone: "UTC", ok: true },
    { timezone: "not-a-tz", ok: false },
    { timezone: "", ok: false },
  ])("validates timezone values: %s", ({ timezone, ok }) => {
    const result = tenantProvisioningOperatorCommandSchema.safeParse({
      organizationName: "Apex Materials",
      organizationSlug: "apex-materials",
      requestedPolicyVersion: "1.0.0",
      ownerIdentityId: VALID_UUID,
      idempotencyKey: "idemp-key-01",
      correlationId: "corr-01-abc",
      timezone,
    });
    expect(result.success).toBe(ok);
  });

  it("rejects malformed idempotency and correlation keys", () => {
    expect(
      tenantProvisioningOperatorCommandSchema.safeParse({
        organizationName: "Apex Materials",
        organizationSlug: "apex-materials",
        requestedPolicyVersion: "1.0.0",
        ownerIdentityId: VALID_UUID,
        idempotencyKey: "bad key",
        correlationId: "corr-01-abc",
      }).success,
    ).toBe(false);

    expect(
      tenantProvisioningOperatorCommandSchema.safeParse({
        organizationName: "Apex Materials",
        organizationSlug: "apex-materials",
        requestedPolicyVersion: "1.0.0",
        ownerIdentityId: VALID_UUID,
        idempotencyKey: "idemp-key-01",
        correlationId: "",
      }).success,
    ).toBe(false);
  });
});

describe("input trust boundaries", () => {
  const baseIntake = {
    organizationName: "Apex Materials",
    organizationSlug: "apex-materials",
    requestedPolicyVersion: "1.0.0",
    idempotencyKey: "idemp-key-01",
    correlationId: "corr-01-abc",
  };

  it("rejects browser injection fields from public intake payload", () => {
    const injected = [
      { tenantId: VALID_UUID },
      { requestedTenantId: VALID_UUID },
      { role: "owner" },
      { actorLayer: "worker" },
      { permissionCode: "tenant:read" },
      { decisionCode: "PROVISIONING_NOT_AUTHORIZED" },
      { ownerIdentityId: VALID_UUID },
      { policyVersion: "1.0.0" },
      { requestedWorkspaceId: VALID_UUID },
      { authIdentityId: VALID_UUID },
    ];

    for (const payload of injected) {
      expect(tenantProvisioningRequestIntakeSchema.safeParse({ ...baseIntake, ...payload }).success).toBe(false);
    }
  });

  it("allows trusted owner identity only in internal operator command", () => {
    expect(
      tenantProvisioningOperatorCommandSchema.safeParse({
        ...baseIntake,
        ownerIdentityId: VALID_UUID,
      }).success,
    ).toBe(true);

    expect(
      tenantProvisioningOperatorCommandSchema.safeParse({
        ...baseIntake,
      }).success,
    ).toBe(false);
  });

  it("keeps tenant identifiers from label confusion", () => {
    const first = tenantLabelDescriptorSchema.parse({
      tenantId: VALID_UUID,
      tenantName: "Apex Materials",
      tenantSlug: "apex-materials",
      tenantStatus: "active",
    });

    const second = tenantLabelDescriptorSchema.parse({
      tenantId: VALID_UUID_ALT,
      tenantName: "Apex Materials",
      tenantSlug: "apex-materials-east",
      tenantStatus: "provisioning",
    });

    expect(first.tenantName).toBe(second.tenantName);
    expect(first.tenantId).not.toBe(second.tenantId);
  });

  it("keeps authorization input and output structurally separate", () => {
    const base = {
      tenantId: VALID_UUID,
      authIdentityId: VALID_UUID,
      requestedTenantId: VALID_UUID_ALT,
      actorLayer: "member" as const,
      permissionCode: "tenant:read",
      correlationId: "corr-01-abc",
      idempotencyKey: "idemp-key-01",
    };

    expect(authorizationDecisionInputSchema.parse(base)).toMatchObject(base);

    expect(
      authorizationDecisionInputSchema.safeParse({
        ...base,
        decisionCode: "AUTH_REQUIRED",
      }).success,
    ).toBe(false);
  });

  it("supports strict allow/deny authorization decision output", () => {
    expect(
      authorizationDecisionResultSchema.safeParse({
        tenantId: VALID_UUID,
        authIdentityId: VALID_UUID,
        requestedTenantId: VALID_UUID,
        actorLayer: "agent",
        permissionCode: "tenant:read",
        allowed: true,
        correlationId: "corr-01-abc",
        idempotencyKey: "idemp-key-01",
        requestedWorkspaceId: VALID_UUID_ALT,
      }).success,
    ).toBe(true);

    expect(
      authorizationDecisionResultSchema.safeParse({
        tenantId: VALID_UUID,
        authIdentityId: VALID_UUID,
        requestedTenantId: VALID_UUID_ALT,
        actorLayer: "agent",
        permissionCode: "tenant:read",
        allowed: true,
        correlationId: "corr-01-abc",
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(false);

    expect(
      authorizationDecisionResultSchema.safeParse({
        tenantId: VALID_UUID,
        authIdentityId: VALID_UUID,
        requestedTenantId: VALID_UUID_ALT,
        actorLayer: "agent",
        permissionCode: "tenant:read",
        allowed: true,
        decisionCode: "AUTH_REQUIRED",
        correlationId: "corr-01-abc",
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(false);

    expect(
      authorizationDecisionResultSchema.safeParse({
        tenantId: VALID_UUID,
        authIdentityId: VALID_UUID,
        requestedTenantId: VALID_UUID_ALT,
        actorLayer: "agent",
        permissionCode: "tenant:read",
        allowed: false,
        decisionCode: "AUTH_REQUIRED",
        correlationId: "corr-01-abc",
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(true);

    expect(
      authorizationDecisionResultSchema.safeParse({
        tenantId: VALID_UUID,
        authIdentityId: VALID_UUID,
        requestedTenantId: VALID_UUID_ALT,
        actorLayer: "agent",
        permissionCode: "tenant:read",
        allowed: false,
        correlationId: "corr-01-abc",
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(false);
  });

  it("rejects unauthorized injection in strict descriptor commands", () => {
    expect(
      tenantLabelDescriptorSchema.safeParse({
        tenantId: VALID_UUID,
        tenantName: "Apex",
        tenantSlug: "apex",
        tenantStatus: "active",
        ownerIdentityId: VALID_UUID,
      }).success,
    ).toBe(false);

    expect(
      membershipDescriptorSchema.safeParse({
        membershipId: VALID_UUID,
        tenantId: VALID_UUID,
        authIdentityId: VALID_UUID_ALT,
        role: "admin",
        status: "active",
        workspaceId: VALID_UUID_ALT,
        decisionCode: "AUTH_REQUIRED",
      }).success,
    ).toBe(false);

    expect(
      supportGrantDescriptorSchema.safeParse({
        supportGrantId: VALID_UUID,
        tenantId: VALID_UUID,
        issuedToAuthIdentityId: VALID_UUID_ALT,
        grantedByAuthIdentityId: VALID_UUID,
        actionScope: "tenant-support",
        allowedActions: ["support:view"],
        reasonCode: "owner-support-2026",
        expiresAtIso: "2026-01-01T00:00:00Z",
        idempotencyKey: "idemp-key-01",
        tenantStatus: "active",
      }).success,
    ).toBe(false);
  });

  it("keeps worker lease actor layer bounded to worker/system", () => {
    expect(
      workerLeaseDescriptorSchema.safeParse({
        workerLeaseId: VALID_UUID,
        tenantId: VALID_UUID,
        actorLayer: "agent",
        actorIdentityId: VALID_UUID_ALT,
        permissions: ["tenant:read"],
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(false);

    expect(
      workerLeaseDescriptorSchema.safeParse({
        workerLeaseId: VALID_UUID,
        tenantId: VALID_UUID,
        actorLayer: "member",
        actorIdentityId: VALID_UUID_ALT,
        permissions: ["tenant:read"],
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(false);

    expect(
      workerLeaseDescriptorSchema.safeParse({
        workerLeaseId: VALID_UUID,
        tenantId: VALID_UUID,
        actorLayer: "support",
        actorIdentityId: VALID_UUID_ALT,
        permissions: ["tenant:read"],
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(false);

    expect(
      workerLeaseDescriptorSchema.safeParse({
        workerLeaseId: VALID_UUID,
        tenantId: VALID_UUID,
        actorLayer: "worker",
        actorIdentityId: VALID_UUID_ALT,
        permissions: ["tenant:read"],
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(true);

    expect(
      workerLeaseDescriptorSchema.safeParse({
        workerLeaseId: VALID_UUID,
        tenantId: VALID_UUID,
        actorLayer: "system",
        actorIdentityId: VALID_UUID_ALT,
        permissions: ["tenant:read"],
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(true);
  });

  it("uses bounded support grant reason codes instead of provisioning outcomes", () => {
    expect(
      supportGrantDescriptorSchema.safeParse({
        supportGrantId: VALID_UUID,
        tenantId: VALID_UUID,
        issuedToAuthIdentityId: VALID_UUID_ALT,
        grantedByAuthIdentityId: VALID_UUID,
        actionScope: "tenant-support",
        allowedActions: ["support:view"],
        reasonCode: "owner-support-2026",
        expiresAtIso: "2026-01-01T00:00:00Z",
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(true);

    expect(
      supportGrantDescriptorSchema.safeParse({
        supportGrantId: VALID_UUID,
        tenantId: VALID_UUID,
        issuedToAuthIdentityId: VALID_UUID_ALT,
        grantedByAuthIdentityId: VALID_UUID,
        actionScope: "tenant-support",
        allowedActions: ["support:view"],
        reasonCode: "PROVISIONING_STATE_BLOCKED",
        expiresAtIso: "2026-01-01T00:00:00Z",
        idempotencyKey: "idemp-key-01",
      }).success,
    ).toBe(false);
  });
});

describe("provisioning transition contracts", () => {
  const requestOnlyStates = ["request_received", "operator_approved", "request_rejected", "request_expired"] as const;

  it.each(PROVISIONING_WORKFLOW_STATES)("accepts and rejects documented transition input pairs", (from) => {
    for (const to of PROVISIONING_WORKFLOW_STATES) {
      const expected = isAllowedProvisioningTransition(from, to);
      const input = {
        requestId: VALID_UUID,
        from,
        to,
        reasonCode: "owner_acceptance_pending",
        policyVersion: "d012_v2026_07_27_02",
        idempotencyKey: "idemp-key-01",
        correlationId: "corr-01-abc",
        ...(requestOnlyStates.includes(from as never) ? {} : { tenantId: VALID_UUID_ALT }),
      };
      expect(provisioningTransitionInputSchema.safeParse(input).success).toBe(expected);
    }
  });

  it("accepts D-003 activation-ready retry path to provisioning", () => {
    expect(
      provisioningTransitionInputSchema.safeParse({
        requestId: VALID_UUID,
        tenantId: VALID_UUID,
        from: "activation_ready",
        to: "provisioning",
        reasonCode: "activation_retry",
        policyVersion: "d012_v2026_07_27_02",
        idempotencyKey: "idemp-key-01",
        correlationId: "corr-01-abc",
      }).success,
    ).toBe(true);
  });

  it("keeps pre-creation tenant IDs server-generated and reports them only after commit", () => {
    const command = {
      requestId: VALID_UUID,
      from: "operator_approved" as const,
      to: "provisioning" as const,
      reasonCode: "tenant_foundation_create",
      policyVersion: "d012_v2026_07_27_02",
      idempotencyKey: "idemp-key-01",
      correlationId: "corr-01-abc",
    };

    expect(provisioningTransitionInputSchema.safeParse(command).success).toBe(true);
    expect(provisioningTransitionInputSchema.safeParse({ ...command, tenantId: VALID_UUID }).success).toBe(false);

    expect(
      provisioningTransitionResultSchema.safeParse({
        requestId: VALID_UUID,
        tenantId: VALID_UUID_ALT,
        from: "operator_approved",
        committedTo: "provisioning",
        succeeded: true,
        policyVersion: "d012_v2026_07_27_02",
        idempotencyKey: "idemp-key-01",
        correlationId: "corr-01-abc",
      }).success,
    ).toBe(true);
  });

  it("validates bounded transition reason codes", () => {
    const base = {
      requestId: VALID_UUID,
      from: "owner_acceptance_pending" as const,
      to: "activation_ready" as const,
      policyVersion: "d012_v2026_07_27_02",
      idempotencyKey: "idemp-key-01",
      correlationId: "corr-01-abc",
      tenantId: VALID_UUID,
    };

    expect(
      provisioningTransitionInputSchema.safeParse({
        ...base,
        reasonCode: "activation_committed",
      }).success,
    ).toBe(true);

    expect(
      provisioningTransitionInputSchema.safeParse({
        ...base,
        reasonCode: "UPPERCASE",
      }).success,
    ).toBe(false);

    expect(
      provisioningTransitionInputSchema.safeParse({
        ...base,
        reasonCode: "no",
      }).success,
    ).toBe(false);
  });

  it("models transition output as strict success/failure outcome", () => {
    const base = {
      requestId: VALID_UUID,
      tenantId: VALID_UUID_ALT,
      from: "provisioning" as const,
      policyVersion: "1.0.0",
      idempotencyKey: "idemp-key-01",
      correlationId: "corr-01-abc",
    };

    expect(
      provisioningTransitionResultSchema.safeParse({
        ...base,
        succeeded: true,
        committedTo: "provisioning",
      }).success,
    ).toBe(true);

    expect(
      provisioningTransitionResultSchema.safeParse({
        ...base,
        succeeded: false,
        attemptedTo: "provisioning",
        resultCode: "PROVISIONING_STATE_BLOCKED",
      }).success,
    ).toBe(true);

    expect(
      provisioningTransitionResultSchema.safeParse({
        ...base,
        succeeded: true,
        committedTo: "provisioning",
        resultCode: "PROVISIONING_RETRYABLE",
      }).success,
    ).toBe(false);

    expect(
      provisioningTransitionResultSchema.safeParse({
        ...base,
        succeeded: true,
        attemptedTo: "provisioning",
      }).success,
    ).toBe(false);

    expect(
      provisioningTransitionResultSchema.safeParse({
        ...base,
        succeeded: false,
        attemptedTo: "provisioning",
      }).success,
    ).toBe(false);

    expect(
      provisioningTransitionResultSchema.safeParse({
        ...base,
        succeeded: false,
        attemptedTo: "active",
        committedTo: "active",
        resultCode: "PROVISIONING_RETRYABLE",
      }).success,
    ).toBe(false);
  });

  it("validates tenant selector and transition pairing for failed outcomes", () => {
    expect(
      provisioningTransitionResultSchema.safeParse({
        requestId: VALID_UUID,
        tenantId: VALID_UUID,
        from: "recovery",
        succeeded: false,
        attemptedTo: "active",
        resultCode: "PROVISIONING_RETRYABLE",
        policyVersion: "1.0.0",
        idempotencyKey: "idemp-key-01",
        correlationId: "corr-01-abc",
      }).success,
    ).toBe(true);

    expect(
      provisioningTransitionResultSchema.safeParse({
        requestId: VALID_UUID,
        tenantId: VALID_UUID,
        from: "active",
        succeeded: true,
        committedTo: "suspended",
        policyVersion: "1.0.0",
        idempotencyKey: "idemp-key-01",
        correlationId: "corr-01-abc",
      }).success,
    ).toBe(true);

    expect(
      provisioningTransitionResultSchema.safeParse({
        requestId: VALID_UUID,
        tenantId: VALID_UUID,
        from: "request_received",
        succeeded: false,
        attemptedTo: "active",
        resultCode: "PROVISIONING_STATE_BLOCKED",
        policyVersion: "1.0.0",
        idempotencyKey: "idemp-key-01",
        correlationId: "corr-01-abc",
      }).success,
    ).toBe(false);
  });

  it("remains JSON-safe for command/result parse round trips", () => {
    const commandJson = JSON.parse(
      JSON.stringify({
        organizationName: "Apex Materials",
        organizationSlug: "apex-materials",
        requestedPolicyVersion: "1.0.0",
        ownerIdentityId: VALID_UUID,
        idempotencyKey: "idemp-key-01",
        correlationId: "corr-01-abc",
        workspace: {
          workspaceName: "North America Industrial",
          workspaceSlug: "north-america-industrial",
        },
      }),
    );
    const parsedCommand = tenantProvisioningCreateInputSchema.parse(commandJson);
    expect(parsedCommand.workspace?.workspaceName).toBe("North America Industrial");

    expect(
      provisioningTransitionResultSchema.safeParse(
        JSON.parse(
          JSON.stringify({
            requestId: VALID_UUID,
            tenantId: VALID_UUID_ALT,
            from: "active",
            committedTo: "suspended",
            succeeded: true,
            policyVersion: "1.0.0",
            idempotencyKey: "idemp-key-01",
            correlationId: "corr-01-abc",
          }),
        ),
      ).success,
    ).toBe(true);

    expect(
      provisioningTransitionResultSchema.safeParse(
        JSON.parse(
          JSON.stringify({
            requestId: VALID_UUID,
            tenantId: VALID_UUID_ALT,
            from: "active",
            attemptedTo: "suspended",
            succeeded: false,
            resultCode: "PROVISIONING_RETRYABLE",
            policyVersion: "1.0.0",
            idempotencyKey: "idemp-key-01",
            correlationId: "corr-01-abc",
          }),
        ),
      ).success,
    ).toBe(true);
  });
});

describe("cross-enum and compatibility sanity", () => {
  it("rejects namespace/enum confusion", () => {
    expect(workspaceStatusSchema.safeParse("request_received").success).toBe(false);
    expect(tenantStatusSchema.safeParse("request_received").success).toBe(false);
    expect(provisioningWorkflowStateSchema.safeParse("active").success).toBe(true);
    expect(membershipStatusSchema.safeParse("archived").success).toBe(false);
    expect(workspaceIdSchema.safeParse("owner").success).toBe(false);
  });

  it("keeps workspace bootstrap object strict and bounded", () => {
    expect(
      workspaceBootstrapInputSchema.safeParse({
        workspaceName: "North America Industrial",
        workspaceSlug: "north-america-industrial",
      }).success,
    ).toBe(true);

    expect(
      workspaceBootstrapInputSchema.safeParse({
        workspaceName: "",
        workspaceSlug: "north-america-industrial",
      }).success,
    ).toBe(false);

    expect(
      workspaceBootstrapInputSchema.safeParse({
        workspaceName: "NA",
        workspaceSlug: "UPPERCASE",
      }).success,
    ).toBe(true);
  });
});
