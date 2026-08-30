import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;
const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000001";

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => "2026-05-15T12:00:00.000Z",
    withDbTransaction: async <T>(fn: () => Promise<T>) => {
      testDb.exec("BEGIN IMMEDIATE");
      try {
        const result = await fn();
        testDb.exec("COMMIT");
        return result;
      } catch (error) {
        testDb.exec("ROLLBACK");
        throw error;
      }
    },
  };
});

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: () => null,
  requireTenantContext: () => ({ tenantId: TENANT_A, workspaceId: null }),
}));

import {
  claimLeadForUser,
  createAdminRequest,
  createLeadNote,
  createOutreachEvent,
  getAdminRequests,
  getLeadById,
  getOutreachEvents,
  getResearcherTeamBoardSummary,
  getResearcherWorkbench,
  getTeamBoardSummary,
  updateAdminRequestStatus,
} from "@/lib/db/queries";

function insertUser(userId: string, email: string, displayName: string) {
  const membershipId = userId === "user-1"
    ? "10000000-0000-4000-8000-000000000011"
    : "10000000-0000-4000-8000-000000000012";
  const roleBindingId = userId === "user-1"
    ? "10000000-0000-4000-8000-000000000021"
    : "10000000-0000-4000-8000-000000000022";
  testDb.prepare(
    `INSERT INTO app_users (id, user_id, email, display_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'researcher', 'active', '2026-05-15T10:00:00.000Z', '2026-05-15T10:00:00.000Z')`
  ).run(`app-${userId}`, userId, email, displayName);
  testDb.prepare(
    "INSERT OR IGNORE INTO user_market_access (user_id, market_id) VALUES (?, 'market-colorado')"
  ).run(userId);
  testDb.pragma("ignore_check_constraints = ON");
  testDb.prepare(
    `INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, status)
     VALUES (?, ?, ?, 'active')`
  ).run(
    membershipId,
    TENANT_A,
    userId,
  );
  testDb.pragma("ignore_check_constraints = OFF");
  testDb.prepare(
    `INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role, reason_code)
     VALUES (?, ?, ?, ?, 'initial_provisioning')`
  ).run(roleBindingId, TENANT_A, membershipId, userId === "user-1" ? "admin" : "researcher");
}

function insertLead(input: {
  id: string;
  assignedTo?: string | null;
  salesPriority?: number;
  leadQuality?: number;
  reminder?: string | null;
  websiteStatus?: string;
  qualityBucket?: string;
  aiVerificationStatus?: string;
  aiWebsiteViabilityStatus?: string | null;
  aiQueueStatus?: string;
}) {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, address, phone, categories, website_status, score, status,
      business_type, qualification_status, quality_bucket, ai_verification_status,
      ai_website_viability_status, ai_queue_status, sales_priority_score, lead_quality_score,
      assigned_to_user_id, reminder_date, market_id, country_code, location_cell_id, postal_code,
      tenant_id, discovered_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, '123 Main St, Denver, CO 80202', '303-555-0100', '["plumber"]', ?, 20, 'new',
      'plumbing', 'qualified', ?, ?,
      ?, ?, ?, ?,
      ?, ?, 'market-colorado', 'US', 'cell-us-co-80202', '80202', ?, '2026-05-14T10:00:00.000Z', '2026-05-14T10:00:00.000Z', '2026-05-14T10:00:00.000Z'
    )`
  ).run(
    input.id,
    `place-${input.id}`,
    `Lead ${input.id}`,
    input.websiteStatus ?? "none",
    input.qualityBucket ?? "ready_to_call",
    input.aiVerificationStatus ?? "no_site_found",
    input.aiWebsiteViabilityStatus ?? "directory_only",
    input.aiQueueStatus ?? "verified",
    input.salesPriority ?? 70,
    input.leadQuality ?? 80,
    input.assignedTo ?? null,
    input.reminder ?? null,
    TENANT_A,
  );
}

beforeEach(() => {
  testDb = createTestDb();
  testDb.exec(`
    ALTER TABLE leads ADD COLUMN tenant_id TEXT;
    ALTER TABLE outreach_events ADD COLUMN tenant_id TEXT;
    ALTER TABLE lead_notes ADD COLUMN tenant_id TEXT;
    ALTER TABLE admin_requests ADD COLUMN tenant_id TEXT;
    ALTER TABLE admin_requests ADD COLUMN workspace_id TEXT;
    INSERT INTO tenants (id, slug, name, status) VALUES
      ('${TENANT_A}', 'researcher-workbench', 'Researcher Workbench', 'active'),
      ('${TENANT_B}', 'other-team', 'Other Team', 'active');
  `);
  insertUser("user-1", "one@example.com", "One");
  insertUser("user-2", "two@example.com", "Two");
});

afterEach(() => {
  testDb.close();
});

describe("researcher workbench queries", () => {
  it("derives members from current tenant roles without exposing global hierarchy metadata", async () => {
    testDb.prepare(
      `INSERT INTO app_users (id, user_id, email, display_name, role, status, created_at, updated_at)
       VALUES
         ('app-user-b', 'user-b', 'b@example.com', 'Tenant B User', 'admin', 'active', '2026-05-15T10:00:00.000Z', '2026-05-15T10:00:00.000Z'),
         ('app-no-role', 'user-no-role', 'no-role@example.com', 'No Current Role', 'admin', 'active', '2026-05-15T10:00:00.000Z', '2026-05-15T10:00:00.000Z'),
         ('app-future-role', 'user-future-role', 'future-role@example.com', 'Future Role', 'admin', 'active', '2026-05-15T10:00:00.000Z', '2026-05-15T10:00:00.000Z')`
    ).run();
    testDb.pragma("ignore_check_constraints = ON");
    testDb.prepare(
      `INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, status) VALUES
         ('20000000-0000-4000-8000-000000000011', ?, 'user-b', 'active'),
         ('10000000-0000-4000-8000-000000000013', ?, 'user-no-role', 'active'),
         ('10000000-0000-4000-8000-000000000014', ?, 'user-future-role', 'active')`
    ).run(TENANT_B, TENANT_A, TENANT_A);
    testDb.pragma("ignore_check_constraints = OFF");
    testDb.prepare(
      `INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role, reason_code)
       VALUES ('20000000-0000-4000-8000-000000000021', ?, '20000000-0000-4000-8000-000000000011', 'admin', 'initial_provisioning')`
    ).run(TENANT_B);
    testDb.prepare(
      `INSERT INTO tenant_role_bindings (id, tenant_id, membership_id, role, valid_from, reason_code)
       VALUES ('10000000-0000-4000-8000-000000000024', ?, '10000000-0000-4000-8000-000000000014', 'admin', '2099-01-01T00:00:00.000Z', 'initial_provisioning')`
    ).run(TENANT_A);
    insertLead({ id: "tenant-a-owned", assignedTo: "user-1" });
    testDb.prepare(
      `INSERT INTO leads (
        id, place_id, name, categories, website_status, score, status, business_type,
        qualification_status, quality_bucket, assigned_to_user_id, reminder_date, tenant_id,
        discovered_at, created_at, updated_at
      ) VALUES (
        'tenant-b-hidden', 'place-tenant-b-hidden', 'Tenant B Hidden', '[]', 'none', 20, 'new', 'plumbing',
        'qualified', 'ready_to_call', 'user-b', '2026-05-15', ?,
        '2026-05-14T10:00:00.000Z', '2026-05-14T10:00:00.000Z', '2026-05-14T10:00:00.000Z'
      )`
    ).run(TENANT_B);
    testDb.prepare(
      "UPDATE app_users SET is_team_lead = 1, team_lead_user_id = 'user-b', team_label = 'Other tenant team' WHERE user_id = 'user-2'"
    ).run();

    const summary = await getTeamBoardSummary();
    const researcher = await getResearcherTeamBoardSummary("user-2");

    expect(summary.members.map((member) => member.user_id).sort()).toEqual(["user-1", "user-2"]);
    expect(summary.members.find((member) => member.user_id === "user-1")?.role).toBe("admin");
    expect(summary.members.find((member) => member.user_id === "user-1")?.claimed_active).toBe(1);
    expect(summary.members.find((member) => member.user_id === "user-b")).toBeUndefined();
    expect(summary.members.find((member) => member.user_id === "user-no-role")).toBeUndefined();
    expect(summary.members.find((member) => member.user_id === "user-future-role")).toBeUndefined();
    expect(summary.overdueFollowUps).toBe(0);
    expect(summary.members.find((member) => member.user_id === "user-2")).toMatchObject({
      is_team_lead: false,
      team_lead_user_id: null,
      team_lead_email: null,
      team_lead_display_name: null,
      team_label: null,
    });
    expect(researcher.members[0]).toMatchObject({
      user_id: "user-2",
      is_team_lead: false,
      team_lead_user_id: null,
      team_lead_email: null,
      team_lead_display_name: null,
      team_label: null,
    });
  });

  it("claims a lead atomically without overwriting another researcher", async () => {
    insertLead({ id: "lead-1" });

    await expect(claimLeadForUser("lead-1", "user-1")).resolves.toBe(1);
    await expect(claimLeadForUser("lead-1", "user-2")).resolves.toBe(0);

    const lead = await getLeadById("lead-1");
    expect(lead?.assigned_to_user_id).toBe("user-1");
    expect(lead?.assigned_user_email).toBe("one@example.com");
  });

  it("keeps workbench next action on owned leads and ranks unclaimed no-site opportunities first", async () => {
    insertLead({ id: "mine", assignedTo: "user-1", salesPriority: 50, reminder: "2026-05-15" });
    insertLead({ id: "weak-high", salesPriority: 100, websiteStatus: "basic", aiVerificationStatus: "weak_site_found", aiWebsiteViabilityStatus: null });
    insertLead({ id: "broken", salesPriority: 80, websiteStatus: "basic", qualityBucket: "broken_site_opportunity", aiVerificationStatus: "weak_site_found", aiWebsiteViabilityStatus: "broken" });
    insertLead({ id: "no-site", salesPriority: 60, websiteStatus: "none", aiVerificationStatus: "no_site_found", aiWebsiteViabilityStatus: "directory_only" });
    insertLead({ id: "other", assignedTo: "user-2", salesPriority: 100 });

    const workbench = await getResearcherWorkbench("user-1");

    expect(workbench.myLeads.map((lead) => lead.id)).toContain("mine");
    expect(workbench.nextAction?.id).toBe("mine");
    expect(workbench.unclaimedLeads.map((lead) => lead.id).slice(0, 3)).toEqual(["no-site", "broken", "weak-high"]);
    expect(workbench.summary.myClaimed).toBe(1);
    expect(workbench.summary.dueToday).toBe(1);
  });

  it("shows active owned leads even while they still need AI verification", async () => {
    insertLead({
      id: "queued-ai-owned",
      assignedTo: "user-1",
      qualityBucket: "needs_ai_verify",
      aiQueueStatus: "queued",
      aiVerificationStatus: "not_checked",
      aiWebsiteViabilityStatus: null,
    });

    const workbench = await getResearcherWorkbench("user-1");

    expect(workbench.summary.myClaimed).toBe(1);
    expect(workbench.myLeads.map((lead) => lead.id)).toContain("queued-ai-owned");
    expect(workbench.nextAction?.id).toBe("queued-ai-owned");
  });

  it("persists structured outreach and maps outcomes to lead state", async () => {
    insertLead({ id: "lead-1", assignedTo: "user-1" });

    const event = await createOutreachEvent({
      leadId: "lead-1",
      channel: "walkin",
      actorUserId: "user-1",
      actorEmail: "one@example.com",
      contactPersonName: "Sam",
      contactPersonRole: "Owner",
      decisionMakerReached: true,
      outcome: "meeting_set",
      note: "Owner wants to see a demo.",
      quotedAmount: 2500,
      followUpAt: "2026-05-20",
      nextStep: "Send demo link.",
    });

    expect(event.outcome).toBe("meeting_set");
    expect(event.decision_maker_reached).toBe(true);

    const [stored] = await getOutreachEvents("lead-1");
    const lead = await getLeadById("lead-1");
    expect(stored?.contact_person_name).toBe("Sam");
    expect(lead?.status).toBe("meeting_set");
    expect(lead?.decision_maker_reached).toBe(true);
    expect(lead?.quoted_amount).toBe(2500);
    expect(lead?.reminder_date).toBe("2026-05-20");
  });

  it("rolls back the outreach event when the lead update fails", async () => {
    insertLead({ id: "lead-rollback", assignedTo: "user-1" });
    testDb.exec(`
      CREATE TRIGGER fail_outreach_lead_update
      BEFORE UPDATE ON leads
      WHEN NEW.last_contacted_at IS NOT OLD.last_contacted_at
      BEGIN
        SELECT RAISE(ABORT, 'blocked outreach lead update');
      END;
    `);

    await expect(createOutreachEvent({
      leadId: "lead-rollback",
      channel: "call",
      actorUserId: "user-1",
      actorEmail: "one@example.com",
      outcome: "contacted",
    })).rejects.toThrow("blocked outreach lead update");

    await expect(getOutreachEvents("lead-rollback")).resolves.toEqual([]);
    const lead = await getLeadById("lead-rollback");
    expect(lead?.status).toBe("new");
    expect(lead?.last_contacted_at).toBeNull();
  });

  it("rolls back the contact state when quality recomputation fails", async () => {
    insertLead({ id: "lead-score-rollback", assignedTo: "user-1" });
    testDb.exec(`
      CREATE TRIGGER fail_outreach_quality_recompute
      BEFORE UPDATE OF lead_quality_score ON leads
      BEGIN
        SELECT RAISE(ABORT, 'blocked quality recompute');
      END;
    `);

    await expect(createOutreachEvent({
      leadId: "lead-score-rollback",
      channel: "call",
      actorUserId: "user-1",
      actorEmail: "one@example.com",
      outcome: "contacted",
    })).rejects.toThrow("blocked quality recompute");

    await expect(getOutreachEvents("lead-score-rollback")).resolves.toEqual([]);
    const lead = await getLeadById("lead-score-rollback");
    expect(lead?.status).toBe("new");
    expect(lead?.first_contacted_at).toBeNull();
    expect(lead?.last_contacted_at).toBeNull();
  });

  it("deduplicates open admin requests without applying global team rollups", async () => {
    insertLead({ id: "lead-1", assignedTo: "user-2" });
    testDb.prepare("UPDATE app_users SET is_team_lead = 1, team_label = 'Brother team' WHERE user_id = 'user-1'").run();
    testDb.prepare("UPDATE app_users SET team_lead_user_id = 'user-1' WHERE user_id = 'user-2'").run();

    const first = await createAdminRequest({
      leadId: "lead-1",
      requestType: "website_request",
      createdByUserId: "user-2",
      createdByEmail: "two@example.com",
      summary: "Owner needs a website.",
    });
    const second = await createAdminRequest({
      leadId: "lead-1",
      requestType: "website_request",
      createdByUserId: "user-2",
      createdByEmail: "two@example.com",
      summary: "Duplicate website ask.",
    });

    expect(first.alreadyExists).toBe(false);
    expect(second.alreadyExists).toBe(true);
    expect(second.request.id).toBe(first.request.id);

    const requests = await getAdminRequests({ leadId: "lead-1", status: "open" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.creator_team_lead_user_id).toBe("user-1");

    const summary = await getTeamBoardSummary();
    const teamLead = summary.members.find((member) => member.user_id === "user-1");
    const member = summary.members.find((row) => row.user_id === "user-2");
    expect(teamLead).toMatchObject({
      is_team_lead: false,
      team_lead_user_id: null,
      team_label: null,
      website_requests_open: 0,
    });
    expect(member?.website_requests_open).toBe(1);

    const updated = await updateAdminRequestStatus(first.request.id, "done");
    expect(updated?.status).toBe("done");
    expect(updated?.completed_at).toBeTruthy();
  });

  it("returns only the current researcher workload and activity for the researcher team board", async () => {
    const today = new Date().toISOString().slice(0, 10);
    insertLead({ id: "mine", assignedTo: "user-1", reminder: today });
    insertLead({ id: "theirs", assignedTo: "user-2", reminder: today });

    await createOutreachEvent({
      leadId: "mine",
      channel: "call",
      actorUserId: "user-1",
      actorEmail: "one@example.com",
      contactPersonName: "Riley",
      contactPersonRole: "Owner",
      decisionMakerReached: true,
      outcome: "contacted",
      note: "Owner asked for a simple website quote.",
      quotedAmount: 1200,
      followUpAt: "2026-05-20",
      nextStep: "Send starter site preview.",
    });
    await createOutreachEvent({
      leadId: "theirs",
      channel: "call",
      actorUserId: "user-2",
      actorEmail: "two@example.com",
      outcome: "contacted",
    });
    await createLeadNote("mine", "user-1", "Research note from the call.");
    await createAdminRequest({
      leadId: "mine",
      requestType: "website_request",
      createdByUserId: "user-1",
      createdByEmail: "one@example.com",
      summary: "Owner wants a website preview.",
    });
    testDb.prepare("UPDATE outreach_events SET tenant_id = ?").run(TENANT_A);
    testDb.prepare("UPDATE lead_notes SET tenant_id = ?").run(TENANT_A);
    testDb.prepare("UPDATE outreach_events SET created_at = ?").run(new Date().toISOString());
    testDb.prepare("UPDATE lead_notes SET created_at = ?, updated_at = ?").run(new Date().toISOString(), new Date().toISOString());
    testDb.prepare("UPDATE admin_requests SET created_at = ?, updated_at = ?").run(new Date().toISOString(), new Date().toISOString());
    testDb.pragma("ignore_check_constraints = ON");
    testDb.prepare(
      `INSERT INTO audit_logs (
         id, action, entity_type, entity_id, actor_user_id, actor_role, metadata, created_at,
         scope_kind, tenant_id, correlation_id, actor_auth_identity_id, actor_membership_id,
         actor_launch_role, actor_role_binding_id, actor_layer
       ) VALUES (
         'audit-1', 'lead_reminder_updated', 'lead', 'mine', 'user-1', 'admin', ?, ?,
         'tenant', ?, 'correlation-1', 'user-1', '10000000-0000-4000-8000-000000000011',
         'admin', '10000000-0000-4000-8000-000000000021', 'member'
       )`
    ).run(JSON.stringify({ reminderDate: "2026-05-20" }), new Date().toISOString(), TENANT_A);
    testDb.pragma("ignore_check_constraints = OFF");

    const summary = await getResearcherTeamBoardSummary("user-1");

    expect(summary.members).toHaveLength(1);
    expect(summary.members[0]).toMatchObject({
      user_id: "user-1",
      claimed_active: 1,
      due_today: 1,
      activity_today: 4,
      contacts_today: 1,
      calls_today: 1,
      decision_makers_today: 1,
      followups_set_today: 1,
      contacts_7d: 1,
    });
    expect(summary.members.find((member) => member.user_id === "user-2")).toBeUndefined();
    expect(summary.todayActivity).toHaveLength(4);
    expect(summary.todayActivity).toEqual(expect.arrayContaining([
      expect.objectContaining({
        activity_type: "outreach",
        lead_id: "mine",
        actor_user_id: "user-1",
        actor_email: "one@example.com",
        contact_person_name: "Riley",
        contact_person_role: "Owner",
        decision_maker_reached: true,
        note: "Owner asked for a simple website quote.",
        quoted_amount: 1200,
        follow_up_at: "2026-05-20",
        next_step: "Send starter site preview.",
      }),
      expect.objectContaining({
        activity_type: "note",
        lead_id: "mine",
        actor_user_id: "user-1",
        note: "Research note from the call.",
      }),
      expect.objectContaining({
        activity_type: "admin_request",
        lead_id: "mine",
        actor_user_id: "user-1",
        summary: "Owner wants a website preview.",
      }),
      expect.objectContaining({
        activity_type: "audit",
        action: "lead_reminder_updated",
        lead_id: "mine",
        actor_user_id: "user-1",
        metadata: { reminderDate: "2026-05-20" },
      }),
    ]));
    expect(summary.todayActivity).not.toEqual(expect.arrayContaining([expect.objectContaining({ lead_id: "theirs" })]));
    expect(summary.latestActivity).toEqual(expect.arrayContaining([
      expect.objectContaining({ lead_id: "mine", actor_email: "one@example.com" }),
    ]));
    expect(summary.unassignedReady).toBe(0);
  });
});
