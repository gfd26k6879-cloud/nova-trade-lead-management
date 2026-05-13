import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
  };
});

import {
  clearLeadExclusion,
  getAllLeadsForRecompute,
  getLeads,
  getNowQueue,
  getQualifiedLeadCount,
  getScoreBandThresholds,
  setLeadExclusion,
} from "@/lib/db/queries";

function insertLead(
  db: Database.Database,
  idx: number,
  opts: { score: number; status?: string; websiteStatus?: string } = { score: 1 },
): string {
  const id = `lead-${idx}`;
  db.prepare(
    `INSERT INTO leads (id, place_id, score, status, website_status, categories)
     VALUES (?, ?, ?, ?, ?, '[]')`,
  ).run(id, `place-${idx}`, opts.score, opts.status ?? "new", opts.websiteStatus ?? "none");
  return id;
}

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
});

describe("lead exclusion query behavior", () => {
  it("removes excluded leads from qualified count", async () => {
    const keepId = insertLead(testDb, 1, { score: 12 });
    const excludedId = insertLead(testDb, 2, { score: 11 });
    await setLeadExclusion(excludedId, "already has website");

    expect(await getQualifiedLeadCount(5)).toBe(1);
    expect(await getQualifiedLeadCount(10)).toBe(1);

    await clearLeadExclusion(excludedId);
    expect(await getQualifiedLeadCount(5)).toBe(2);
    expect(keepId).toBeTruthy();
  });

  it("persists exclusion reason and disqualifies the lead until restored", async () => {
    const id = insertLead(testDb, 10, { score: 12 });

    expect(await setLeadExclusion(id, "manual check found active website")).toBe(1);

    const excluded = testDb.prepare(
      `SELECT is_excluded, exclusion_reason, excluded_at, qualification_status, disqualification_reason
       FROM leads WHERE id = ?`
    ).get(id) as Record<string, unknown>;

    expect(excluded.is_excluded).toBe(1);
    expect(excluded.exclusion_reason).toBe("manual check found active website");
    expect(excluded.excluded_at).toBeTruthy();
    expect(excluded.qualification_status).toBe("disqualified");
    expect(excluded.disqualification_reason).toBe("manual check found active website");

    expect(await clearLeadExclusion(id)).toBe(1);

    const restored = testDb.prepare(
      `SELECT is_excluded, exclusion_reason, excluded_at, qualification_status, disqualification_reason
       FROM leads WHERE id = ?`
    ).get(id) as Record<string, unknown>;

    expect(restored.is_excluded).toBe(0);
    expect(restored.exclusion_reason).toBeNull();
    expect(restored.excluded_at).toBeNull();
    expect(restored.qualification_status).toBe("needs_verification");
    expect(restored.disqualification_reason).toBeNull();
  });

  it("omits excluded leads from score thresholds", async () => {
    for (let idx = 1; idx <= 30; idx++) {
      insertLead(testDb, idx, { score: idx });
    }

    await setLeadExclusion("lead-30", "already has website");
    const thresholds = await getScoreBandThresholds();
    expect(thresholds.sampleSize).toBe(29);
    expect(thresholds.maxScore).toBe(29);
  });

  it("keeps excluded leads out of queue and recompute set, then restores them", async () => {
    const id = insertLead(testDb, 100, { score: 15, status: "new", websiteStatus: "none" });
    await setLeadExclusion(id, "already has website");

    expect((await getNowQueue(10)).map((lead) => lead.id)).not.toContain(id);
    expect((await getAllLeadsForRecompute()).map((lead) => lead.id)).not.toContain(id);

    await clearLeadExclusion(id);
    expect((await getNowQueue(10)).map((lead) => lead.id)).toContain(id);
    expect((await getAllLeadsForRecompute()).map((lead) => lead.id)).toContain(id);
  });

  it("omits AI-confirmed usable websites from no-website opportunity views", async () => {
    const usableSiteId = insertLead(testDb, 200, { score: 25, status: "new", websiteStatus: "none" });
    const opportunityId = insertLead(testDb, 201, { score: 12, status: "new", websiteStatus: "none" });

    testDb.prepare(
      `UPDATE leads
       SET ai_verification_status = 'site_found',
           ai_website_viability_status = 'usable',
           ai_found_website_url = 'https://example.com',
           win_probability_score = 0
       WHERE id = ?`
    ).run(usableSiteId);

    expect(await getQualifiedLeadCount(5)).toBe(1);
    expect((await getNowQueue(10)).map((lead) => lead.id)).not.toContain(usableSiteId);
    expect((await getNowQueue(10)).map((lead) => lead.id)).toContain(opportunityId);

    const noWebsiteLeads = await getLeads({ websiteStatus: "none", pageSize: 10 });
    expect(noWebsiteLeads.leads.map((lead) => lead.id)).not.toContain(usableSiteId);
    expect(noWebsiteLeads.leads.map((lead) => lead.id)).toContain(opportunityId);
  });
});
