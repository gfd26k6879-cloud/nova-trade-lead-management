import { beforeEach, describe, expect, it, vi } from "vitest";
import { TENANT_POLICY_DEFAULTS } from "@/lib/tenancy/schemas";

const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "10000000-0000-4000-8000-000000000001";

const authorizationMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireTenantPermission: vi.fn(),
}));

const contextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
  withTenantDbContext: vi.fn((callback: (db: object) => unknown) => callback({ kind: "scoped-db" })),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  setStoredOpenAiApiKey: vi.fn(),
  clearStoredOpenAiApiKey: vi.fn(),
  setStoredGooglePlacesApiKey: vi.fn(),
  clearStoredGooglePlacesApiKey: vi.fn(),
  setStoredGoogleMapsBrowserApiKey: vi.fn(),
  clearStoredGoogleMapsBrowserApiKey: vi.fn(),
  backfillPlacesMasterFromLeads: vi.fn(),
  createAuditLog: vi.fn(),
}));

const tenantRepositoryMocks = vi.hoisted(() => ({
  createTenantQueryRepository: vi.fn(),
  getCurrentTenantPolicy: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requirePermission: authorizationMocks.requirePermission }));
vi.mock("@/lib/tenancy/authorize", () => ({
  requireTenantPermission: authorizationMocks.requireTenantPermission,
}));
vi.mock("@/lib/tenancy/context", () => ({ runWithTenantContext: contextMocks.runWithTenantContext }));
vi.mock("@/lib/db", () => ({ withTenantDbContext: contextMocks.withTenantDbContext }));
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/tenancy/queries", () => ({
  createTenantQueryRepository: tenantRepositoryMocks.createTenantQueryRepository,
}));

import {
  backfillCanonicalPlacesAction,
  getTenantPolicySettingsAction,
  updateOpenAiApiKeyAction,
} from "@/lib/settings/actions";
import { TenantPolicySettingsUnavailableError } from "@/lib/settings/errors";

const TENANT_SESSION = Object.freeze({
  userId: "20000000-0000-4000-8000-000000000001",
  email: "owner@example.test",
  displayName: "Owner",
  tenantId: TENANT_A,
  workspaceId: WORKSPACE_A,
  membershipId: "30000000-0000-4000-8000-000000000001",
  role: "owner" as const,
  roleBindingId: "40000000-0000-4000-8000-000000000001",
});

function policy(tenantId = TENANT_A) {
  return {
    ...TENANT_POLICY_DEFAULTS,
    id: tenantId === TENANT_A
      ? "50000000-0000-4000-8000-000000000001"
      : "50000000-0000-4000-8000-000000000002",
    tenantId,
    version: 2,
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T01:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizationMocks.requireTenantPermission.mockResolvedValue(TENANT_SESSION);
  authorizationMocks.requirePermission.mockResolvedValue({
    userId: TENANT_SESSION.userId,
    email: TENANT_SESSION.email,
    displayName: TENANT_SESSION.displayName,
    role: "admin",
  });
  tenantRepositoryMocks.getCurrentTenantPolicy.mockResolvedValue(policy());
  tenantRepositoryMocks.createTenantQueryRepository.mockReturnValue({
    getCurrentTenantPolicy: tenantRepositoryMocks.getCurrentTenantPolicy,
  });
  queryMocks.getSettings.mockResolvedValue({ openai_api_key_configured: true });
});

describe("tenant policy settings action boundary", () => {
  it("authorizes and installs the exact tenant scope before reading secret-free policy settings", async () => {
    const selector = { tenantId: TENANT_A, workspaceId: WORKSPACE_A };

    const result = await getTenantPolicySettingsAction(selector);

    expect(authorizationMocks.requireTenantPermission).toHaveBeenCalledWith(selector, "tenant:read", {
      action: "settings.tenant_policy.read",
    });
    expect(contextMocks.runWithTenantContext).toHaveBeenCalledWith(
      TENANT_SESSION,
      expect.stringMatching(/^tenant-settings-read:[0-9a-f-]+$/),
      expect.any(Function),
    );
    expect(contextMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(tenantRepositoryMocks.createTenantQueryRepository).toHaveBeenCalledWith({ kind: "scoped-db" });
    expect(tenantRepositoryMocks.getCurrentTenantPolicy).toHaveBeenCalledWith(TENANT_A);
    expect(result).toMatchObject({ tenantId: TENANT_A, version: 2 });
    expect(JSON.stringify(result)).not.toMatch(/api.?key|credential|secret|provider/iu);
    expect(authorizationMocks.requirePermission).not.toHaveBeenCalled();
    expect(queryMocks.getSettings).not.toHaveBeenCalled();
  });

  it("fails before database access when canonical tenant authorization rejects the selector", async () => {
    authorizationMocks.requireTenantPermission.mockRejectedValueOnce(new Error("No valid tenant scope is available."));

    await expect(getTenantPolicySettingsAction({ tenantId: TENANT_B })).rejects.toThrow(
      "No valid tenant scope is available.",
    );

    expect(contextMocks.runWithTenantContext).not.toHaveBeenCalled();
    expect(contextMocks.withTenantDbContext).not.toHaveBeenCalled();
    expect(tenantRepositoryMocks.getCurrentTenantPolicy).not.toHaveBeenCalled();
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["malformed", { tenantId: TENANT_A, version: 2 }],
    ["cross-tenant", policy(TENANT_B)],
  ])("returns one non-enumerating error for %s policy storage", async (_label, storedPolicy) => {
    tenantRepositoryMocks.getCurrentTenantPolicy.mockResolvedValueOnce(storedPolicy);

    const rejection = getTenantPolicySettingsAction({ tenantId: TENANT_A, workspaceId: WORKSPACE_A });

    await expect(rejection).rejects.toBeInstanceOf(TenantPolicySettingsUnavailableError);
    await expect(rejection).rejects.toMatchObject({ code: "TENANT_POLICY_SETTINGS_UNAVAILABLE" });
  });

  it("keeps provider-secret mutation on the platform permission boundary", async () => {
    await updateOpenAiApiKeyAction("sk-test-platform-key-1234567890");

    expect(authorizationMocks.requirePermission).toHaveBeenCalledWith("settings:manage");
    expect(authorizationMocks.requireTenantPermission).not.toHaveBeenCalled();
    expect(queryMocks.setStoredOpenAiApiKey).toHaveBeenCalledWith("sk-test-platform-key-1234567890");
  });

  it("runs canonical place backfill only inside the active tenant member boundary", async () => {
    const selector = { tenantId: TENANT_A };
    const tenantWideSession = { ...TENANT_SESSION, workspaceId: null };
    authorizationMocks.requireTenantPermission.mockResolvedValueOnce(tenantWideSession);
    queryMocks.backfillPlacesMasterFromLeads.mockResolvedValueOnce(3);

    const result = await backfillCanonicalPlacesAction(100, selector);

    expect(authorizationMocks.requireTenantPermission).toHaveBeenCalledWith(selector, "tenant:manage", {
      action: "settings.canonical_places.backfill",
    });
    expect(authorizationMocks.requirePermission).toHaveBeenCalledWith("settings:manage");
    expect(contextMocks.runWithTenantContext).toHaveBeenCalledWith(
      tenantWideSession,
      expect.stringMatching(/^canonical-places-backfill:[0-9a-f-]+$/),
      expect.any(Function),
    );
    expect(contextMocks.withTenantDbContext).toHaveBeenCalledOnce();
    expect(queryMocks.ensureDbReady).toHaveBeenCalledOnce();
    expect(queryMocks.backfillPlacesMasterFromLeads).toHaveBeenCalledWith(100);
    expect(result).toEqual({ success: true, count: 3 });
  });
});
