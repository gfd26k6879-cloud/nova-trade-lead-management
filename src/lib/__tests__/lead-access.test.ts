import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  userCanAccessMarket: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  userCanAccessMarket: dbMocks.userCanAccessMarket,
}));

import {
  canClaimLeadForSession,
  canReadLeadForSession,
  constrainExploreFiltersForSession,
  constrainLeadFiltersForSession,
  shouldRedirectResearcherLeadList,
} from "@/lib/lead-access";

describe("lead access boundaries", () => {
  const researcher = { userId: "researcher-1", role: "researcher" as const };
  const admin = { userId: "admin-1", role: "admin" as const };
  const activeLead = {
    archived_at: null,
    assigned_to_user_id: "researcher-1",
    is_excluded: false,
    market_id: "market-colorado",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forces researcher lead filters to owned leads and assigned markets", () => {
    const filters = constrainLeadFiltersForSession(researcher, {
      archived: "all",
      assigned: "unassigned",
      assignedToUserId: "other-user",
      includeExcluded: true,
      status: "excluded",
      search: "plumber",
    });

    expect(filters).toMatchObject({
      assigned: "me",
      assignedToUserId: "researcher-1",
      archived: "active",
      includeExcluded: false,
      search: "plumber",
      visibleToUserId: "researcher-1",
    });
    expect(filters.status).toBeUndefined();
  });

  it("does not rewrite admin lead filters", () => {
    const filters = { assignedToUserId: "researcher-2", includeExcluded: true };
    expect(constrainLeadFiltersForSession(admin, filters)).toBe(filters);
  });

  it("scopes researcher Explore filters to active nonexcluded unclaimed assigned-market inventory", () => {
    const filters = constrainExploreFiltersForSession(researcher, {
      archived: "all",
      assigned: "me",
      assignedToUserId: "other-user",
      includeExcluded: true,
      status: "excluded",
      search: "pilot",
    });

    expect(filters).toMatchObject({
      archived: "active",
      assigned: "unassigned",
      includeExcluded: false,
      search: "pilot",
      visibleToUserId: "researcher-1",
    });
    expect(filters.assignedToUserId).toBeUndefined();
    expect(filters.status).toBeUndefined();
  });

  it("preserves benign researcher Explore statuses", () => {
    expect(constrainExploreFiltersForSession(researcher, { status: "contacted" })).toMatchObject({
      archived: "active",
      assigned: "unassigned",
      includeExcluded: false,
      status: "contacted",
      visibleToUserId: "researcher-1",
    });
  });

  it("clamps explicit archived-only researcher Explore requests to active inventory", () => {
    expect(constrainExploreFiltersForSession(researcher, { archived: "archived" })).toMatchObject({
      archived: "active",
      assigned: "unassigned",
      includeExcluded: false,
      visibleToUserId: "researcher-1",
    });
  });

  it("keeps researcher Explore scoped to unclaimed inventory even for owner:me URLs", () => {
    const filters = constrainExploreFiltersForSession(researcher, {
      assigned: "me",
      assignedToUserId: "other-user",
      search: "pilot",
    });

    expect(filters).toMatchObject({
      assigned: "unassigned",
      visibleToUserId: "researcher-1",
    });
    expect(filters.assignedToUserId).toBeUndefined();
  });

  it("keeps researcher Explore owner:any scoped to unclaimed inventory", () => {
    const filters = constrainExploreFiltersForSession(researcher, {
      assigned: "any",
      search: "pilot",
    });

    expect(filters).toMatchObject({
      assigned: "unassigned",
      search: "pilot",
      visibleToUserId: "researcher-1",
    });
    expect(filters.assignedToUserId).toBeUndefined();
  });

  it("redirects researchers away from all-leads, kanban, and arbitrary owner URLs", () => {
    expect(shouldRedirectResearcherLeadList(researcher, {})).toBe(true);
    expect(shouldRedirectResearcherLeadList(researcher, { assigned: "unassigned" })).toBe(true);
    expect(shouldRedirectResearcherLeadList(researcher, { assigned: "me", owner: "other-user" })).toBe(true);
    expect(shouldRedirectResearcherLeadList(researcher, { assigned: "me", view: "kanban" })).toBe(true);
    expect(shouldRedirectResearcherLeadList(researcher, { assigned: "me" })).toBe(false);
    expect(shouldRedirectResearcherLeadList(admin, { owner: "researcher-2", view: "kanban" })).toBe(false);
  });

  it("allows admins to read all lead details", async () => {
    await expect(canReadLeadForSession(admin, { ...activeLead, market_id: "market-canada" })).resolves.toBe(true);
    expect(dbMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });

  it("allows researchers to read only owned active nonexcluded leads in assigned markets", async () => {
    dbMocks.userCanAccessMarket.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(canReadLeadForSession(researcher, activeLead)).resolves.toBe(true);
    await expect(canReadLeadForSession(researcher, { ...activeLead, market_id: "market-uk" })).resolves.toBe(false);
    expect(dbMocks.userCanAccessMarket).toHaveBeenCalledWith("researcher-1", "market-colorado");
    expect(dbMocks.userCanAccessMarket).toHaveBeenCalledWith("researcher-1", "market-uk");
  });

  it("rejects unowned, archived, and excluded researcher reads before the market lookup", async () => {
    await expect(canReadLeadForSession(researcher, { ...activeLead, assigned_to_user_id: null })).resolves.toBe(false);
    await expect(canReadLeadForSession(researcher, { ...activeLead, assigned_to_user_id: "researcher-2" })).resolves.toBe(false);
    await expect(canReadLeadForSession(researcher, { ...activeLead, archived_at: "2026-08-01T00:00:00.000Z" })).resolves.toBe(false);
    await expect(canReadLeadForSession(researcher, { ...activeLead, is_excluded: true })).resolves.toBe(false);
    expect(dbMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });

  it.each([0, 1, 2, -1, null, undefined, "0", "false", {}, []])(
    "rejects malformed researcher read exclusion value %j before the market lookup",
    async (isExcluded) => {
      await expect(canReadLeadForSession(researcher, {
        ...activeLead,
        is_excluded: isExcluded,
      } as never)).resolves.toBe(false);
      expect(dbMocks.userCanAccessMarket).not.toHaveBeenCalled();
    },
  );

  it("allows researchers to claim only unassigned active nonexcluded leads in assigned markets", async () => {
    const unassigned = { ...activeLead, assigned_to_user_id: null };
    dbMocks.userCanAccessMarket.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(canClaimLeadForSession(researcher, unassigned)).resolves.toBe(true);
    await expect(canClaimLeadForSession(researcher, { ...unassigned, market_id: "market-uk" })).resolves.toBe(false);
    await expect(canClaimLeadForSession(researcher, activeLead)).resolves.toBe(false);
    await expect(canClaimLeadForSession(researcher, { ...unassigned, archived_at: "2026-08-01T00:00:00.000Z" })).resolves.toBe(false);
    await expect(canClaimLeadForSession(researcher, { ...unassigned, is_excluded: true })).resolves.toBe(false);
    expect(dbMocks.userCanAccessMarket).toHaveBeenCalledTimes(2);
  });

  it.each([0, 1, 2, -1, null, undefined, "0", "false", {}, []])(
    "rejects malformed researcher claim exclusion value %j before the market lookup",
    async (isExcluded) => {
      await expect(canClaimLeadForSession(researcher, {
        ...activeLead,
        assigned_to_user_id: null,
        is_excluded: isExcluded,
      } as never)).resolves.toBe(false);
      expect(dbMocks.userCanAccessMarket).not.toHaveBeenCalled();
    },
  );

  it("preserves unrestricted admin claim capability", async () => {
    await expect(canClaimLeadForSession(admin, {
      archived_at: "2026-08-01T00:00:00.000Z",
      assigned_to_user_id: "researcher-2",
      is_excluded: true,
      market_id: null,
    })).resolves.toBe(true);
    expect(dbMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });

  it("preserves admin early returns for malformed exclusion values", async () => {
    const malformedLead = { ...activeLead, is_excluded: "0" } as never;

    await expect(canReadLeadForSession(admin, malformedLead)).resolves.toBe(true);
    await expect(canClaimLeadForSession(admin, malformedLead)).resolves.toBe(true);
    expect(dbMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });
});
