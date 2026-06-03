import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => "2026-05-15T12:00:00.000Z",
  };
});

import {
  claimLeadForUser,
  createAdminRequest,
  createOutreachEvent,
  getAdminRequests,
  getLeadById,
  getOutreachEvents,
  getResearcherWorkbench,
  getTeamBoardSummary,
  updateAdminRequestStatus,
} from "@/lib/db/queries";

function insertUser(userId: string, email: string, displayName: string) {
  testDb.prepare(
    `INSERT INTO app_users (id, user_id, email, display_name, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'researcher', 'active', '2026-05-15T10:00:00.000Z', '2026-05-15T10:00:00.000Z')`
  ).run(`app-${userId}`, userId, email, displayName);
  testDb.prepare(
    "INSERT OR IGNORE INTO user_market_access (user_id, market_id) VALUES (?, 'market-colorado')"
  ).run(userId);
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
}) {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, address, phone, categories, website_status, score, status,
      business_type, qualification_status, quality_bucket, ai_verification_status,
      ai_website_viability_status, ai_queue_status, sales_priority_score, lead_quality_score,
      assigned_to_user_id, reminder_date, market_id, country_code, location_cell_id, postal_code, discovered_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, '123 Main St, Denver, CO 80202', '303-555-0100', '["plumber"]', ?, 20, 'new',
      'plumbing', 'qualified', ?, ?,
      ?, 'verified', ?, ?,
      ?, ?, 'market-colorado', 'US', 'cell-us-co-80202', '80202', '2026-05-14T10:00:00.000Z', '2026-05-14T10:00:00.000Z', '2026-05-14T10:00:00.000Z'
    )`
  ).run(
    input.id,
    `place-${input.id}`,
    `Lead ${input.id}`,
    input.websiteStatus ?? "none",
    input.qualityBucket ?? "ready_to_call",
    input.aiVerificationStatus ?? "no_site_found",
    input.aiWebsiteViabilityStatus ?? "directory_only",
    input.salesPriority ?? 70,
    input.leadQuality ?? 80,
    input.assignedTo ?? null,
    input.reminder ?? null,
  );
}

beforeEach(() => {
  testDb = createTestDb();
  insertUser("user-1", "one@example.com", "One");
  insertUser("user-2", "two@example.com", "Two");
});

afterEach(() => {
  testDb.close();
});

describe("researcher workbench queries", () => {
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

  it("deduplicates open admin requests and rolls them up to team leads", async () => {
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
    expect(teamLead?.website_requests_open).toBe(1);
    expect(member?.website_requests_open).toBe(1);

    const updated = await updateAdminRequestStatus(first.request.id, "done");
    expect(updated?.status).toBe("done");
    expect(updated?.completed_at).toBeTruthy();
  });
});
