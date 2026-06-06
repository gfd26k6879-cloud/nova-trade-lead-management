import { describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  userCanAccessMarket: vi.fn(),
}));

vi.mock("@/lib/db/queries", () => ({
  userCanAccessMarket: dbMocks.userCanAccessMarket,
}));

import {
  canReadLeadForSession,
  constrainExploreFiltersForSession,
  constrainLeadFiltersForSession,
  shouldRedirectResearcherLeadList,
} from "@/lib/lead-access";

describe("lead access boundaries", () => {
  const researcher = { userId: "researcher-1", role: "researcher" as const };
  const admin = { userId: "admin-1", role: "admin" as const };

  it("forces researcher lead filters to owned leads and assigned markets", () => {
    const filters = constrainLeadFiltersForSession(researcher, {
      assigned: "unassigned",
      assignedToUserId: "other-user",
      includeExcluded: true,
      search: "plumber",
    });

    expect(filters).toMatchObject({
      assigned: "me",
      assignedToUserId: "researcher-1",
      includeExcluded: false,
      search: "plumber",
      visibleToUserId: "researcher-1",
    });
  });

  it("does not rewrite admin lead filters", () => {
    const filters = { assignedToUserId: "researcher-2", includeExcluded: true };
    expect(constrainLeadFiltersForSession(admin, filters)).toBe(filters);
  });

  it("scopes researcher Explore filters to assigned markets without forcing owned leads", () => {
    const filters = constrainExploreFiltersForSession(researcher, {
      assigned: "unassigned",
      assignedToUserId: "other-user",
      includeExcluded: true,
      search: "pilot",
    });

    expect(filters).toMatchObject({
      assigned: "unassigned",
      includeExcluded: false,
      search: "pilot",
      visibleToUserId: "researcher-1",
    });
    expect(filters.assignedToUserId).toBeUndefined();
  });

  it("keeps researcher Explore owner:me scoped to the current user", () => {
    const filters = constrainExploreFiltersForSession(researcher, {
      assigned: "me",
      assignedToUserId: "other-user",
      search: "pilot",
    });

    expect(filters).toMatchObject({
      assigned: "me",
      assignedToUserId: "researcher-1",
      visibleToUserId: "researcher-1",
    });
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
    await expect(canReadLeadForSession(admin, { market_id: "market-canada" })).resolves.toBe(true);
    expect(dbMocks.userCanAccessMarket).not.toHaveBeenCalled();
  });

  it("allows researchers only inside assigned markets", async () => {
    dbMocks.userCanAccessMarket.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(canReadLeadForSession(researcher, { market_id: "market-colorado" })).resolves.toBe(true);
    await expect(canReadLeadForSession(researcher, { market_id: "market-uk" })).resolves.toBe(false);
    expect(dbMocks.userCanAccessMarket).toHaveBeenCalledWith("researcher-1", "market-colorado");
    expect(dbMocks.userCanAccessMarket).toHaveBeenCalledWith("researcher-1", "market-uk");
  });
});
