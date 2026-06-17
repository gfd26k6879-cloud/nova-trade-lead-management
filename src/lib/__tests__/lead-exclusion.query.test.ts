import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => testDb,
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

import {
  clearLeadExclusion,
  archiveLead,
  restoreArchivedLead,
  createManualLead,
  getAllLeadsForRecompute,
  getLeadMapPoints,
  getLeads,
  getNowQueue,
  getQualifiedLeadCount,
  getScoreBandThresholds,
  recomputeAllLeadQualityScores,
  setLeadExclusion,
  updateLeadQualityScores,
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
    expect((await getNowQueue(10)).map((lead) => lead.id)).not.toContain(id);

    testDb.prepare(
      `UPDATE leads
       SET phone = '303-555-0100',
           contactability_score = 1,
           estimated_deal_value = 3500,
           ai_verification_status = 'no_site_found',
           ai_website_viability_status = 'directory_only',
           ai_queue_status = 'verified'
       WHERE id = ?`
    ).run(id);
    await updateLeadQualityScores(id);
    expect((await getNowQueue(10)).map((lead) => lead.id)).toContain(id);
    expect((await getAllLeadsForRecompute()).map((lead) => lead.id)).toContain(id);
  });

  it("keeps excluded stale leads in the score recompute path", async () => {
    const id = insertLead(testDb, 150, { score: 15, status: "new", websiteStatus: "none" });
    await setLeadExclusion(id, "already has website");
    testDb.prepare(
      `UPDATE leads SET updated_at = ?, last_quality_scored_at = NULL WHERE id = ?`
    ).run("2026-05-03T10:00:00.000Z", id);

    expect(await recomputeAllLeadQualityScores(10)).toBe(1);
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
    testDb.prepare(
      `UPDATE leads
       SET phone = '303-555-0100',
           contactability_score = 1,
           estimated_deal_value = 3500,
           ai_verification_status = 'no_site_found',
           ai_website_viability_status = 'directory_only',
           ai_queue_status = 'verified'
       WHERE id = ?`
    ).run(opportunityId);
    await updateLeadQualityScores(usableSiteId);
    await updateLeadQualityScores(opportunityId);

    expect(await getQualifiedLeadCount(5)).toBe(1);
    expect((await getNowQueue(10)).map((lead) => lead.id)).not.toContain(usableSiteId);
    expect((await getNowQueue(10)).map((lead) => lead.id)).toContain(opportunityId);

    const noWebsiteLeads = await getLeads({ websiteStatus: "none", pageSize: 10 });
    expect(noWebsiteLeads.leads.map((lead) => lead.id)).not.toContain(usableSiteId);
    expect(noWebsiteLeads.leads.map((lead) => lead.id)).toContain(opportunityId);
  });

  it("sorts mapped leads by website need before generic score when fast map ordering is requested", async () => {
    const weakSiteId = insertLead(testDb, 300, { score: 99, status: "new", websiteStatus: "basic" });
    const noSiteId = insertLead(testDb, 301, { score: 5, status: "new", websiteStatus: "none" });

    testDb.prepare(
      `UPDATE leads
       SET lat = ?, lng = ?, sales_priority_score = ?, lead_quality_score = ?, raw_opportunity_score = ?, review_count = ?,
           ai_verification_status = ?, ai_website_viability_status = ?
       WHERE id = ?`
    ).run(39.75, -104.99, 99, 99, 99, 100, "weak_site_found", "placeholder", weakSiteId);
    testDb.prepare(
      `UPDATE leads
       SET lat = ?, lng = ?, sales_priority_score = ?, lead_quality_score = ?, raw_opportunity_score = ?, review_count = ?,
           ai_verification_status = ?, ai_website_viability_status = ?
       WHERE id = ?`
    ).run(39.76, -104.98, 5, 5, 5, 5, "no_site_found", "directory_only", noSiteId);

    const result = await getLeadMapPoints(
      { sortBy: "website_need", sortDir: "desc" },
      10,
      { includeTotal: true, fastOrder: true },
    );

    expect(result.points.map((lead) => lead.id).slice(0, 2)).toEqual([noSiteId, weakSiteId]);
  });

  it("hides archived leads by default and restores them to active views", async () => {
    const activeId = insertLead(testDb, 400, { score: 12, status: "new", websiteStatus: "none" });
    const archivedId = insertLead(testDb, 401, { score: 13, status: "new", websiteStatus: "none" });

    expect(await archiveLead(archivedId, "admin-1", "bad candidate")).toBe(1);

    const archivedRow = testDb.prepare(
      "SELECT archived_at, archived_by_user_id, archive_reason FROM leads WHERE id = ?",
    ).get(archivedId) as Record<string, unknown>;
    expect(archivedRow.archived_at).toBeTruthy();
    expect(archivedRow.archived_by_user_id).toBe("admin-1");
    expect(archivedRow.archive_reason).toBe("bad candidate");

    expect((await getLeads({ pageSize: 10 })).leads.map((lead) => lead.id)).toContain(activeId);
    expect((await getLeads({ pageSize: 10 })).leads.map((lead) => lead.id)).not.toContain(archivedId);
    expect((await getLeads({ archived: "archived", pageSize: 10 })).leads.map((lead) => lead.id)).toEqual([archivedId]);
    expect((await getLeads({ archived: "all", pageSize: 10 })).leads.map((lead) => lead.id)).toEqual(expect.arrayContaining([activeId, archivedId]));

    expect(await restoreArchivedLead(archivedId)).toBe(1);
    expect((await getLeads({ pageSize: 10 })).leads.map((lead) => lead.id)).toContain(archivedId);
  });

  it("keeps claimed leads out of unclaimed Explore inventory", async () => {
    const unclaimedId = insertLead(testDb, 405, { score: 14, status: "new", websiteStatus: "none" });
    const claimedId = insertLead(testDb, 406, { score: 15, status: "new", websiteStatus: "none" });
    testDb.prepare("UPDATE leads SET assigned_to_user_id = ? WHERE id = ?").run("researcher-1", claimedId);

    const unclaimed = await getLeads({ assigned: "unassigned", pageSize: 10 });

    expect(unclaimed.leads.map((lead) => lead.id)).toContain(unclaimedId);
    expect(unclaimed.leads.map((lead) => lead.id)).not.toContain(claimedId);
  });

  it("matches Explore free-text search against internal lead notes", async () => {
    const pilotId = insertLead(testDb, 410, { score: 12, status: "new", websiteStatus: "none" });
    const otherId = insertLead(testDb, 411, { score: 13, status: "new", websiteStatus: "none" });

    testDb.prepare("UPDATE leads SET notes = ? WHERE id = ?").run("[tag:pilot] Saturday cold-call pilot", pilotId);

    const result = await getLeads({ search: "Pilot", pageSize: 10 });
    expect(result.leads.map((lead) => lead.id)).toContain(pilotId);
    expect(result.leads.map((lead) => lead.id)).not.toContain(otherId);
  });

  it("creates manual leads with safe defaults", async () => {
    const lead = await createManualLead({
      name: "Manual Candidate",
      businessType: "local_services",
      phone: "303-555-0100",
      address: null,
      mapsUri: "https://maps.google.com/?q=Manual+Candidate",
      source: "Google Maps",
      contactPersonName: "Jamie Owner",
      websiteStatus: "none",
      notes: "Added from user flow",
    });

    const row = testDb.prepare(
      `SELECT place_id, status, website_status, maps_uri, quality_bucket, enrichment_status, ai_queue_status, notes
       FROM leads WHERE id = ?`
    ).get(lead.id) as Record<string, unknown>;

    expect(String(row.place_id)).toMatch(/^manual:/);
    expect(row.status).toBe("new");
    expect(row.website_status).toBe("none");
    expect(row.maps_uri).toBe("https://maps.google.com/?q=Manual+Candidate");
    expect(row.quality_bucket).toBe("needs_ai_verify");
    expect(row.enrichment_status).toBe("pending");
    expect(row.ai_queue_status).toBe("queued");
    expect(row.notes).toBe("Source: Google Maps\n\nContact person: Jamie Owner\n\nAdded from user flow");
  });

  it("filters leads by assigned researcher markets", async () => {
    testDb.prepare(
      `INSERT INTO location_markets (id, name, country_code, admin_area1, status)
       VALUES ('market-canada', 'Toronto', 'CA', 'ON', 'active')`
    ).run();
    testDb.prepare(
      `INSERT INTO user_market_access (user_id, market_id)
       VALUES ('researcher-1', 'market-colorado')`
    ).run();
    const coloradoId = insertLead(testDb, 500, { score: 10, status: "new", websiteStatus: "none" });
    const canadaId = insertLead(testDb, 501, { score: 11, status: "new", websiteStatus: "none" });
    testDb.prepare("UPDATE leads SET market_id = 'market-colorado', country_code = 'US' WHERE id = ?").run(coloradoId);
    testDb.prepare("UPDATE leads SET market_id = 'market-canada', country_code = 'CA' WHERE id = ?").run(canadaId);

    const scoped = await getLeads({ visibleToUserId: "researcher-1", archived: "all", includeExcluded: true, pageSize: 10 });
    expect(scoped.leads.map((lead) => lead.id)).toContain(coloradoId);
    expect(scoped.leads.map((lead) => lead.id)).not.toContain(canadaId);

    const adminCanada = await getLeads({ marketId: "market-canada", archived: "all", includeExcluded: true, pageSize: 10 });
    expect(adminCanada.leads.map((lead) => lead.id)).toEqual([canadaId]);
  });
});
