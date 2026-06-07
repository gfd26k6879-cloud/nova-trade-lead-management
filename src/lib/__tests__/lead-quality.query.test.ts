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

import { getQualityActionCandidateIds, getQualityAiVerificationCandidates, getQualityLeads, queueLeadsForEnrichment, updateLeadQualityScores } from "@/lib/db/queries";

function insertLead(input: {
  id: string;
  name: string;
  address?: string;
  businessType?: string;
  aiStatus?: string;
  viability?: string | null;
  foundUrl?: string | null;
  phone?: string | null;
  score?: number;
  bucket?: string;
  countryCode?: string;
  marketId?: string | null;
  locationCellId?: string | null;
  locality?: string | null;
  postalCode?: string | null;
  enrichmentStatus?: string;
}) {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, address, phone, categories, website_status, score, status,
      business_type, qualification_status, contactability_score, estimated_deal_value,
      ai_verification_status, ai_website_viability_status, ai_found_website_url,
      country_code, market_id, location_cell_id, locality, postal_code, enrichment_status,
      quality_bucket, discovered_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, '["plumber"]', 'none', ?, 'new',
      ?, 'qualified', 1, 3500,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'
    )`
  ).run(
    input.id,
    `place-${input.id}`,
    input.name,
    input.address ?? "123 Main St, Denver, CO 80202",
    input.phone ?? "303-555-0100",
    input.score ?? 12,
    input.businessType ?? "plumbing",
    input.aiStatus ?? "not_checked",
    input.viability ?? null,
    input.foundUrl ?? null,
    input.countryCode ?? "US",
    input.marketId ?? "market-colorado",
    input.locationCellId ?? "cell-us-co-80202",
    input.locality ?? "Denver",
    input.postalCode ?? "80202",
    input.enrichmentStatus ?? "pending",
    input.bucket ?? "needs_ai_verify",
  );
}

beforeEach(() => {
  testDb = createTestDb();
});

afterEach(() => {
  testDb.close();
});

describe("lead quality queries", () => {
  it("filters quality leads by country, market, cell, city, and postal code", async () => {
    testDb.prepare(
      `INSERT INTO location_markets (id, name, country_code, admin_area1, locality, status)
       VALUES ('market-london-ca', 'London, Ontario', 'CA', 'ON', 'London', 'active')`
    ).run();
    testDb.prepare(
      `INSERT INTO location_cells (
        id, market_id, country_code, admin_area1, locality, postal_code, postal_code_normalized,
        cell_type, cell_label, is_active
      ) VALUES ('cell-ca-london-on-n6h', 'market-london-ca', 'CA', 'ON', 'London', 'N6H', 'N6H', 'postal_fsa', 'London, ON N6H', 1)`
    ).run();
    insertLead({
      id: "london",
      name: "London Ontario Plumbing",
      address: "55 Oxford St W, London, ON N6H 5R8, Canada",
      countryCode: "CA",
      marketId: "market-london-ca",
      locationCellId: "cell-ca-london-on-n6h",
      locality: "London",
      postalCode: "N6H",
    });
    insertLead({ id: "denver", name: "Denver Plumbing" });

    const result = await getQualityLeads({
      countryCode: "CA",
      marketId: "market-london-ca",
      locationCellId: "cell-ca-london-on-n6h",
      city: "London",
      zip: "N6H",
      denverOnly: false,
    });

    expect(result.leads.map((lead) => lead.id)).toEqual(["london"]);
    expect(result.leads[0]).toMatchObject({ country_code: "CA", market_id: "market-london-ca", postal_code: "N6H" });
  });

  it("uses location filters for AI candidates and enrichment queue batches", async () => {
    insertLead({
      id: "london-ai",
      name: "London AI Candidate",
      address: "22 Richmond St, London, ON N6H 1A1, Canada",
      countryCode: "CA",
      marketId: "market-london-ca",
      locationCellId: "cell-ca-london-on-n6h",
      locality: "London",
      postalCode: "N6H",
      enrichmentStatus: "enriched",
    });
    insertLead({ id: "denver-ai", name: "Denver AI Candidate", enrichmentStatus: "enriched" });

    const aiCandidates = await getQualityAiVerificationCandidates({ limit: 10, countryCode: "CA", marketId: "market-london-ca", zip: "N6H" });
    const actionIds = await getQualityActionCandidateIds({ limit: 10, countryCode: "CA", marketId: "market-london-ca", zip: "N6H" });
    const queued = await queueLeadsForEnrichment(actionIds);
    const status = testDb.prepare("SELECT enrichment_status FROM leads WHERE id = 'london-ai'").get() as { enrichment_status: string };

    expect(aiCandidates.map((lead) => lead.id)).toEqual(["london-ai"]);
    expect(actionIds).toEqual(["london-ai"]);
    expect(queued).toBe(1);
    expect(status.enrichment_status).toBe("pending");
  });

  it("excludes AI-confirmed usable websites from the quality queue", async () => {
    insertLead({
      id: "usable",
      name: "Usable Site Plumbing",
      aiStatus: "site_found",
      viability: "usable",
      foundUrl: "https://usable.example",
      bucket: "ready_to_call",
    });
    insertLead({
      id: "nosite",
      name: "No Site Plumbing",
      aiStatus: "no_site_found",
      viability: "directory_only",
      bucket: "ready_to_call",
    });

    await updateLeadQualityScores("usable");
    await updateLeadQualityScores("nosite");
    const result = await getQualityLeads({ denverOnly: false });

    expect(result.leads.map((lead) => lead.id)).toEqual(["nosite"]);
  });

  it("sorts ready-to-call leads ahead of unverified candidates", async () => {
    insertLead({ id: "needs-ai", name: "Needs AI Plumbing", aiStatus: "not_checked", score: 30 });
    insertLead({ id: "ready", name: "Ready Plumbing", aiStatus: "no_site_found", viability: "directory_only", score: 12 });

    await updateLeadQualityScores("needs-ai");
    await updateLeadQualityScores("ready");
    const result = await getQualityLeads({ denverOnly: false });

    expect(result.leads[0]?.id).toBe("ready");
    expect(result.leads[0]?.quality_bucket).toBe("ready_to_call");
  });

  it("keeps broken domains in the quality queue as opportunities", async () => {
    insertLead({
      id: "broken",
      name: "Broken Site Plumbing",
      aiStatus: "weak_site_found",
      viability: "broken",
      foundUrl: "https://broken.example",
    });

    await updateLeadQualityScores("broken");
    const result = await getQualityLeads({ denverOnly: false, qualityBucket: "broken_site_opportunity" });

    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]?.recommended_offer).toBe("broken_site_rescue");
  });
});
