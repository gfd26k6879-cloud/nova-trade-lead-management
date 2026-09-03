import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "30000000-0000-4000-8000-000000000003";
const USER_A = "40000000-0000-4000-8000-000000000004";
const USER_B = "50000000-0000-4000-8000-000000000005";

let testDb: Database.Database;

const dbMocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

const tenantContextMocks = vi.hoisted(() => ({
  requireTenantContext: vi.fn(),
}));

vi.mock("@/lib/db/index", () => ({
  getDb: dbMocks.getDb,
  generateId: () => "request-created-a",
  nowISO: () => "2026-05-15T12:00:00.000Z",
  withDbTransaction: async <T>(callback: () => Promise<T>) => callback(),
}));

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: () => null,
  requireTenantContext: tenantContextMocks.requireTenantContext,
}));

import {
  createAdminRequest,
  getAdminFulfillmentSummary,
  getAdminRequestById,
  getAdminRequests,
  getOpenAdminRequestForLead,
  updateAdminRequestStatus,
} from "@/lib/db/queries";

function insertLead(id: string, tenantId: string, assignedToUserId: string | null = null): void {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, categories, website_status, tenant_id, assigned_to_user_id, discovered_at
    ) VALUES (?, ?, ?, '[]', 'none', ?, ?, '2026-05-14T10:00:00.000Z')`
  ).run(id, `place-${id}`, `Lead ${id}`, tenantId, assignedToUserId);
}

function insertRequest(
  id: string,
  tenantId: string,
  leadId: string,
  requestType: "website_request" | "quote_request" = "website_request",
  createdByUserId: string | null = null,
): void {
  testDb.prepare(
    `INSERT INTO admin_requests (
      id, tenant_id, workspace_id, lead_id, created_by_user_id, request_type, status, priority, summary
    ) VALUES (?, ?, NULL, ?, ?, ?, 'new', 'normal', ?)`
  ).run(id, tenantId, leadId, createdByUserId, requestType, `${tenantId} request`);
}

beforeEach(() => {
  testDb = createTestDb();
  testDb.exec(`
    ALTER TABLE leads ADD COLUMN tenant_id TEXT;
    ALTER TABLE admin_requests ADD COLUMN tenant_id TEXT;
    ALTER TABLE admin_requests ADD COLUMN workspace_id TEXT;
    INSERT INTO tenants (id, slug, name, status) VALUES
      ('${TENANT_A}', 'admin-requests-a', 'Admin Requests A', 'active'),
      ('${TENANT_B}', 'admin-requests-b', 'Admin Requests B', 'active');
    INSERT INTO app_users (id, user_id, email, display_name, role, status) VALUES
      ('app-user-a', '${USER_A}', 'user-a@example.com', 'User A', 'researcher', 'active'),
      ('app-user-b', '${USER_B}', 'user-b@example.com', 'User B', 'researcher', 'active');
    INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, status) VALUES
      ('40000000-0000-4000-8000-000000000014', '${TENANT_A}', '${USER_A}', 'active'),
      ('50000000-0000-4000-8000-000000000015', '${TENANT_B}', '${USER_B}', 'active');
    UPDATE app_users SET team_lead_user_id = '${USER_B}' WHERE user_id = '${USER_A}';
  `);
  dbMocks.getDb.mockReset();
  dbMocks.getDb.mockImplementation(() => testDb);
  tenantContextMocks.requireTenantContext.mockReset();
  tenantContextMocks.requireTenantContext.mockReturnValue({ tenantId: TENANT_A, workspaceId: null });
  insertLead("lead-a", TENANT_A, USER_B);
  insertLead("lead-b", TENANT_B);
  insertRequest("request-b", TENANT_B, "lead-b", "quote_request");
});

afterEach(() => {
  testDb.close();
});

describe("tenant-bound admin request queries", () => {
  it("binds creates, reads, updates, and fulfillment aggregates to the current tenant", async () => {
    const created = await createAdminRequest({
      leadId: "lead-a",
      requestType: "website_request",
      summary: "Tenant A needs a website.",
    });

    expect(created.alreadyExists).toBe(false);
    expect(testDb.prepare(
      "SELECT tenant_id, workspace_id FROM admin_requests WHERE id = ?"
    ).get(created.request.id)).toEqual({ tenant_id: TENANT_A, workspace_id: null });
    await expect(getAdminRequests({ status: "all" })).resolves.toEqual([
      expect.objectContaining({ id: created.request.id, lead_id: "lead-a" }),
    ]);
    await expect(getAdminRequestById("request-b")).resolves.toBeNull();
    await expect(getOpenAdminRequestForLead("lead-b", "quote_request")).resolves.toBeNull();
    await expect(updateAdminRequestStatus("request-b", "done")).resolves.toBeNull();
    expect(testDb.prepare("SELECT status FROM admin_requests WHERE id = 'request-b'").get()).toEqual({ status: "new" });

    const summary = await getAdminFulfillmentSummary();
    expect(summary).toMatchObject({
      openTotal: 1,
      openWebsiteRequests: 1,
      openQuoteRequests: 0,
      newRequests: 1,
    });
    expect(summary.latestRequests.map((request) => request.id)).toEqual([created.request.id]);
  });

  it("does not create a tenant-A request for a tenant-B lead", async () => {
    await expect(createAdminRequest({
      leadId: "lead-b",
      requestType: "website_request",
    })).rejects.toThrow("Unable to create admin request");

    expect(testDb.prepare(
      "SELECT COUNT(*) AS count FROM admin_requests WHERE tenant_id = ? AND lead_id = ?"
    ).get(TENANT_A, "lead-b")).toEqual({ count: 0 });
  });

  it("does not join cross-tenant lead metadata onto a malformed request row", async () => {
    insertRequest("request-a-cross-lead", TENANT_A, "lead-b");

    await expect(getAdminRequestById("request-a-cross-lead")).resolves.toEqual(
      expect.objectContaining({
        id: "request-a-cross-lead",
        lead_id: "lead-b",
        lead_name: null,
        lead_phone: null,
      }),
    );
  });

  it("does not attach foreign owner, creator, or team-lead profiles", async () => {
    insertRequest("request-a-foreign-profile", TENANT_A, "lead-a", "website_request", USER_B);
    insertRequest("request-a-foreign-team-lead", TENANT_A, "lead-a", "quote_request", USER_A);

    await expect(getAdminRequestById("request-a-foreign-profile")).resolves.toEqual(
      expect.objectContaining({
        lead_owner_user_id: USER_B,
        lead_owner_email: null,
        lead_owner_display_name: null,
        creator_email: null,
        creator_display_name: null,
        creator_team_lead_user_id: null,
      }),
    );
    await expect(getAdminRequestById("request-a-foreign-team-lead")).resolves.toEqual(
      expect.objectContaining({
        creator_email: "user-a@example.com",
        creator_display_name: "User A",
        creator_team_lead_user_id: null,
        creator_team_lead_email: null,
        creator_team_lead_display_name: null,
      }),
    );
  });

  it("returns the other tenant's data only after the trusted context changes", async () => {
    tenantContextMocks.requireTenantContext.mockReturnValue({ tenantId: TENANT_B, workspaceId: null });

    await expect(getAdminRequests({ status: "all" })).resolves.toEqual([
      expect.objectContaining({ id: "request-b", lead_id: "lead-b" }),
    ]);
    await expect(updateAdminRequestStatus("request-b", "done")).resolves.toEqual(
      expect.objectContaining({ id: "request-b", status: "done" }),
    );
  });

  const consumers: Array<[string, () => Promise<unknown>]> = [
    ["open request lookup", () => getOpenAdminRequestForLead("lead-a", "website_request")],
    ["create", () => createAdminRequest({ leadId: "lead-a", requestType: "website_request" })],
    ["ID lookup", () => getAdminRequestById("request-b")],
    ["status update", () => updateAdminRequestStatus("request-b", "done")],
    ["list", () => getAdminRequests({ status: "all" })],
    ["summary", () => getAdminFulfillmentSummary()],
  ];

  it.each(consumers)("rejects workspace-narrowed context before database access for %s", async (_name, run) => {
    tenantContextMocks.requireTenantContext.mockReturnValue({ tenantId: TENANT_A, workspaceId: WORKSPACE_A });
    dbMocks.getDb.mockClear();

    await expect(run()).rejects.toThrow("Tenant-wide context is required");
    expect(dbMocks.getDb).not.toHaveBeenCalled();
  });

  it.each(consumers)("requires tenant context before database access for %s", async (_name, run) => {
    tenantContextMocks.requireTenantContext.mockImplementation(() => {
      throw new Error("A tenant context is required");
    });
    dbMocks.getDb.mockClear();

    await expect(run()).rejects.toThrow("A tenant context is required");
    expect(dbMocks.getDb).not.toHaveBeenCalled();
  });
});
