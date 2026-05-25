import { describe, expect, it } from "vitest";

import {
  canReadLeadForSession,
  constrainLeadFiltersForSession,
  shouldRedirectResearcherLeadList,
} from "@/lib/lead-access";

describe("lead access boundaries", () => {
  const researcher = { userId: "researcher-1", role: "researcher" as const };
  const admin = { userId: "admin-1", role: "admin" as const };

  it("forces researcher lead filters to the signed-in user's owned leads", () => {
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
    });
  });

  it("does not rewrite admin lead filters", () => {
    const filters = { assignedToUserId: "researcher-2", includeExcluded: true };
    expect(constrainLeadFiltersForSession(admin, filters)).toBe(filters);
  });

  it("redirects researchers away from all-leads, kanban, and arbitrary owner URLs", () => {
    expect(shouldRedirectResearcherLeadList(researcher, {})).toBe(true);
    expect(shouldRedirectResearcherLeadList(researcher, { assigned: "unassigned" })).toBe(true);
    expect(shouldRedirectResearcherLeadList(researcher, { assigned: "me", owner: "other-user" })).toBe(true);
    expect(shouldRedirectResearcherLeadList(researcher, { assigned: "me", view: "kanban" })).toBe(true);
    expect(shouldRedirectResearcherLeadList(researcher, { assigned: "me" })).toBe(false);
    expect(shouldRedirectResearcherLeadList(admin, { owner: "researcher-2", view: "kanban" })).toBe(false);
  });

  it("lets researchers read unclaimed and self-owned leads but not other-owned leads", () => {
    expect(canReadLeadForSession(researcher, { assigned_to_user_id: null })).toBe(true);
    expect(canReadLeadForSession(researcher, { assigned_to_user_id: "researcher-1" })).toBe(true);
    expect(canReadLeadForSession(researcher, { assigned_to_user_id: "other-user" })).toBe(false);
    expect(canReadLeadForSession(admin, { assigned_to_user_id: "other-user" })).toBe(true);
  });
});
