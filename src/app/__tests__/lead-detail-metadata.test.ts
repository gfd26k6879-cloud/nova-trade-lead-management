import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getLeadById: vi.fn(),
  userCanAccessMarket: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("@/app/(protected)/leads/[id]/lead-detail-client", () => ({ LeadDetailClient: vi.fn() }));

import { generateMetadata } from "@/app/(protected)/leads/[id]/page";

const activeOwnedLead = {
  archived_at: null,
  assigned_to_user_id: "researcher-1",
  is_excluded: false,
  market_id: "market-colorado",
  name: "Private Candidate",
};

describe("lead detail metadata access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
  });

  it("preserves named metadata for admins and authorized researcher owners", async () => {
    authMocks.requirePermission
      .mockResolvedValueOnce({ userId: "admin-1", role: "admin" })
      .mockResolvedValueOnce({ userId: "researcher-1", role: "researcher" });
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
});
