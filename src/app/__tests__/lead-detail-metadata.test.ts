import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getTenantSession: vi.fn(),
  requirePermission: vi.fn(),
}));

const authorizationMocks = vi.hoisted(() => ({
  assertTenantPermission: vi.fn(),
}));

const contextMocks = vi.hoisted(() => ({
  runWithTenantContext: vi.fn((_session: unknown, _correlationId: unknown, callback: () => unknown) => callback()),
}));

const dbMocks = vi.hoisted(() => ({
  withTenantDbContext: vi.fn((callback: () => unknown) => callback()),
}));

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getAdminRequests: vi.fn(),
  getDemoByLeadId: vi.fn(),
  getLatestAiVerification: vi.fn(),
  getLeadAiArtifacts: vi.fn(),
  getLeadById: vi.fn(),
  getLeadNotes: vi.fn(),
  getOutreachEvents: vi.fn(),
  getScoreBandThresholds: vi.fn(),
  getSettings: vi.fn(),
  userCanAccessMarket: vi.fn(),
}));

vi.mock("next/navigation", () => navigationMocks);
vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db", () => dbMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/lib/competitive-density", () => ({
  computeDensityByAddress: vi.fn().mockResolvedValue({ count: 0, label: "Low" }),
}));
vi.mock("@/lib/tenancy/context", () => contextMocks);
vi.mock("@/lib/tenancy/authorize", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tenancy/authorize")>();
  return { ...original, assertTenantPermission: authorizationMocks.assertTenantPermission };
});
vi.mock("@/app/(protected)/leads/[id]/lead-detail-client", () => ({ LeadDetailClient: vi.fn() }));

import LeadDetailPage, { generateMetadata } from "@/app/(protected)/leads/[id]/page";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";

const tenantSession = {
  userId: "researcher-1",
  email: "researcher@example.com",
  displayName: "Researcher",
  tenantId: TENANT_ID,
  workspaceId: null,
  membershipId: "30000000-0000-4000-8000-000000000001",
  roleBindingId: "40000000-0000-4000-8000-000000000001",
  role: "researcher",
} as const;

const activeOwnedLead = {
  id: "lead-1",
  tenant_id: TENANT_ID,
  archived_at: null,
  assigned_to_user_id: "researcher-1",
  is_excluded: false,
  market_id: "market-colorado",
  name: "Private Candidate",
};

describe("lead detail metadata access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.getTenantSession.mockResolvedValue(tenantSession);
    authorizationMocks.assertTenantPermission.mockResolvedValue(undefined);
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
  });

  it("preserves named metadata for admins and authorized researcher owners", async () => {
    authMocks.requirePermission
      .mockResolvedValueOnce({ userId: "admin-1", role: "admin" })
      .mockResolvedValueOnce({ userId: "researcher-1", role: "researcher" });
    authMocks.getTenantSession
      .mockResolvedValueOnce({ ...tenantSession, userId: "admin-1", role: "admin" })
      .mockResolvedValueOnce(tenantSession);
    queryMocks.getLeadById
      .mockResolvedValueOnce({
        ...activeOwnedLead,
        archived_at: "2026-08-01T00:00:00.000Z",
        assigned_to_user_id: "researcher-2",
        is_excluded: true,
      })
      .mockResolvedValueOnce(activeOwnedLead);
    queryMocks.userCanAccessMarket.mockResolvedValue(true);

    await expect(generateMetadata({ params: Promise.resolve({ id: "lead-1" }) })).resolves.toEqual({
      title: "Private Candidate | Nova Trade Lead Management",
    });
    await expect(generateMetadata({ params: Promise.resolve({ id: "lead-1" }) })).resolves.toEqual({
      title: "Private Candidate | Nova Trade Lead Management",
    });
    expect(authMocks.requirePermission).toHaveBeenCalledWith("view:workspace");
    expect(authMocks.getTenantSession).toHaveBeenCalledWith({});
    expect(authorizationMocks.assertTenantPermission).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT_ID }),
      "account:read",
      { action: "lead.detail.metadata" },
    );
    expect(queryMocks.userCanAccessMarket).toHaveBeenCalledWith("researcher-1", "market-colorado");
  });

  it.each([
    ["another owner", { ...activeOwnedLead, assigned_to_user_id: "researcher-2" }],
    ["archived", { ...activeOwnedLead, archived_at: "2026-08-01T00:00:00.000Z" }],
    ["excluded", { ...activeOwnedLead, is_excluded: true }],
  ])("uses generic metadata for a researcher denied by %s", async (_reason, lead) => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(lead);

    await expect(generateMetadata({ params: Promise.resolve({ id: "lead-1" }) })).resolves.toEqual({
      title: "Lead | Nova Trade Lead Management",
    });
    expect(queryMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });

  it("uses generic metadata for an owned lead outside the researcher's assigned markets", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue({ ...activeOwnedLead, market_id: "market-uk" });
    queryMocks.userCanAccessMarket.mockResolvedValue(false);

    await expect(generateMetadata({ params: Promise.resolve({ id: "lead-1" }) })).resolves.toEqual({
      title: "Lead | Nova Trade Lead Management",
    });
    expect(queryMocks.userCanAccessMarket).toHaveBeenCalledWith("researcher-1", "market-uk");
  });

  it("uses generic metadata without an access lookup when the lead is missing", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", role: "researcher" });
    queryMocks.getLeadById.mockResolvedValue(null);

    await expect(generateMetadata({ params: Promise.resolve({ id: "missing" }) })).resolves.toEqual({
      title: "Lead | Nova Trade Lead Management",
    });
    expect(queryMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });

  it("does not query lead data when canonical and legacy identities differ", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", role: "researcher" });
    authMocks.getTenantSession.mockResolvedValue({ ...tenantSession, userId: "another-user" });

    await expect(generateMetadata({ params: Promise.resolve({ id: "lead-1" }) })).resolves.toEqual({
      title: "Lead | Nova Trade Lead Management",
    });

    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.getLeadById).not.toHaveBeenCalled();
    expect(contextMocks.runWithTenantContext).not.toHaveBeenCalled();
  });

  it("uses the same generic metadata for missing and foreign-tenant leads", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", role: "researcher" });
    queryMocks.getLeadById
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...activeOwnedLead, tenant_id: "foreign-tenant" });

    await expect(generateMetadata({ params: Promise.resolve({ id: "missing" }) })).resolves.toEqual({
      title: "Lead | Nova Trade Lead Management",
    });
    await expect(generateMetadata({ params: Promise.resolve({ id: "foreign" }) })).resolves.toEqual({
      title: "Lead | Nova Trade Lead Management",
    });
    expect(queryMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });

  it("enforces an authoritative lead workspace before any detail fan-out", async () => {
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", role: "researcher" });
    authMocks.getTenantSession.mockResolvedValue({ ...tenantSession, workspaceId: WORKSPACE_ID });
    queryMocks.getLeadById.mockResolvedValue({
      ...activeOwnedLead,
      workspace_id: "20000000-0000-4000-8000-000000000099",
    });

    await expect(LeadDetailPage({ params: Promise.resolve({ id: "lead-1" }) })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(navigationMocks.notFound).toHaveBeenCalledTimes(1);
    expect(queryMocks.getOutreachEvents).not.toHaveBeenCalled();
    expect(queryMocks.getAdminRequests).not.toHaveBeenCalled();
    expect(queryMocks.getSettings).not.toHaveBeenCalled();
  });

  it("installs tenant and database context before the first lead query", async () => {
    const order: string[] = [];
    authMocks.requirePermission.mockResolvedValue({ userId: "researcher-1", role: "researcher" });
    contextMocks.runWithTenantContext.mockImplementation((_session, _correlationId, callback) => {
      order.push("tenant");
      return callback();
    });
    dbMocks.withTenantDbContext.mockImplementation((callback) => {
      order.push("db");
      return callback();
    });
    queryMocks.ensureDbReady.mockImplementation(async () => {
      order.push("ready");
    });
    queryMocks.getLeadById.mockImplementation(async () => {
      order.push("lead");
      return null;
    });

    await expect(LeadDetailPage({ params: Promise.resolve({ id: "missing" }) })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(order).toEqual(["tenant", "db", "ready", "lead"]);
    expect(queryMocks.getOutreachEvents).not.toHaveBeenCalled();
  });
});
