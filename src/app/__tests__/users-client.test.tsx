import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UsersClient } from "@/app/(protected)/users/users-client";
import type { AppUser } from "@/lib/app-users";
import type { LocationMarket, UserMarketAccess } from "@/lib/db/queries";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/users/actions", () => ({
  createUserAction: vi.fn(),
  resetUserPasswordAction: vi.fn(),
  updateUserMarketAccessAction: vi.fn(),
  updateUserRoleAction: vi.fn(),
  updateUserStatusAction: vi.fn(),
  updateUserTeamAction: vi.fn(),
}));

function user(input: Partial<AppUser> & Pick<AppUser, "user_id" | "email" | "role">): AppUser {
  return {
    id: input.user_id,
    user_id: input.user_id,
    email: input.email,
    display_name: input.display_name ?? null,
    role: input.role,
    status: input.status ?? "active",
    created_by: null,
    is_team_lead: input.is_team_lead ?? false,
    team_lead_user_id: input.team_lead_user_id ?? null,
    team_lead_email: null,
    team_lead_display_name: null,
    team_label: input.team_label ?? null,
    last_seen_at: input.last_seen_at ?? null,
    created_at: "2026-06-03T00:00:00.000Z",
    updated_at: "2026-06-03T00:00:00.000Z",
  };
}

describe("UsersClient", () => {
  it("renders selected, available, and no-access territory states as readable cards", () => {
    const markets = [
      { id: "market-colorado", name: "Colorado", country_code: "US", admin_area1: "CO" },
      { id: "market-toronto", name: "Toronto", country_code: "CA", admin_area1: "ON" },
      { id: "market-london", name: "London", country_code: "GB", admin_area1: "England" },
    ] as LocationMarket[];
    const users = [
      user({ user_id: "admin-1", email: "admin@example.com", role: "admin", display_name: "Admin" }),
      user({ user_id: "researcher-1", email: "one@example.com", role: "researcher", display_name: "One" }),
      user({ user_id: "researcher-2", email: "two@example.com", role: "researcher", display_name: "Two" }),
    ];
    const access: Record<string, UserMarketAccess[]> = {
      "researcher-1": [{
        user_id: "researcher-1",
        market_id: "market-colorado",
        market_name: "Colorado",
        country_code: "US",
        admin_area1: "CO",
      } as UserMarketAccess],
      "researcher-2": [],
    };

    const text = renderToStaticMarkup(
      <UsersClient initialUsers={users} markets={markets} initialMarketAccess={access} />,
    );

    expect(text).toContain("Users and Territories");
    expect(text).toContain("Country access");
    expect(text).toContain("United States");
    expect(text).toContain("Colorado · US");
    expect(text).toContain("Toronto");
    expect(text).toContain("Available");
    expect(text).toContain("No country access");
    expect(text).toContain("Admins can access all markets.");
  });
});
