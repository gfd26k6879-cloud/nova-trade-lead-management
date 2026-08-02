import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
}));

const queryMocks = vi.hoisted(() => ({
  ensureDbReady: vi.fn(),
  getBusinessTypeCounts: vi.fn(),
  getKanbanLeads: vi.fn(),
  getLeads: vi.fn(),
  getScoreBandThresholds: vi.fn(),
}));

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/db/queries", () => queryMocks);
vi.mock("next/navigation", () => navigationMocks);
vi.mock("@/app/(protected)/leads/leads-client", () => ({ LeadsClient: () => null }));
vi.mock("@/app/(protected)/leads/kanban-client", () => ({ KanbanClient: () => null }));

import LeadsPage from "@/app/(protected)/leads/page";

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.requirePermission.mockResolvedValue({ userId: "admin-1", email: "admin@example.com", role: "admin" });
  queryMocks.ensureDbReady.mockResolvedValue(undefined);
  queryMocks.getBusinessTypeCounts.mockResolvedValue([]);
  queryMocks.getKanbanLeads.mockResolvedValue({ leads: [], total: 0 });
  queryMocks.getLeads.mockResolvedValue({ leads: [], total: 0 });
  queryMocks.getScoreBandThresholds.mockResolvedValue({});
});

describe("LeadsPage minimum-review parsing", () => {
  it("normalizes the same valid minimum for counts and list reads", async () => {
    await LeadsPage({ searchParams: Promise.resolve({ minReviews: "  +00050 " }) });

    expect(queryMocks.getBusinessTypeCounts).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 50 }));
    expect(queryMocks.getLeads).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 50 }));
  });

  it("omits invalid fractional input instead of truncating it", async () => {
    await LeadsPage({ searchParams: Promise.resolve({ minReviews: "4.5" }) });

    expect(queryMocks.getBusinessTypeCounts).toHaveBeenCalledWith(expect.objectContaining({ minReviews: undefined }));
    expect(queryMocks.getLeads).toHaveBeenCalledWith(expect.objectContaining({ minReviews: undefined }));
  });

  it("preserves a safe above-int4 minimum for central query defense", async () => {
    await LeadsPage({ searchParams: Promise.resolve({ minReviews: "2147483648", view: "kanban" }) });

    expect(queryMocks.getBusinessTypeCounts).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 2_147_483_648 }));
    expect(queryMocks.getKanbanLeads).toHaveBeenCalledWith(expect.objectContaining({ minReviews: 2_147_483_648 }));
    expect(queryMocks.getLeads).not.toHaveBeenCalled();
  });
});
