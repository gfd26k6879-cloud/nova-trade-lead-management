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

import { getQualityLeads, updateLeadQualityScores } from "@/lib/db/queries";

function insertLead(input: {
  id: string;
  name: string;
  businessType?: string;
  aiStatus?: string;
  viability?: string | null;
  foundUrl?: string | null;
  phone?: string | null;
  score?: number;
  bucket?: string;
}) {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, address, phone, categories, website_status, score, status,
      business_type, qualification_status, contactability_score, estimated_deal_value,
      ai_verification_status, ai_website_viability_status, ai_found_website_url,
      quality_bucket, discovered_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, '123 Main St, Denver, CO 80202', ?, '["plumber"]', 'none', ?, 'new',
      ?, 'qualified', 1, 3500,
      ?, ?, ?,
      ?, '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'
    )`
  ).run(
    input.id,
    `place-${input.id}`,
    input.name,
    input.phone ?? "303-555-0100",
    input.score ?? 12,
    input.businessType ?? "plumbing",
    input.aiStatus ?? "not_checked",
    input.viability ?? null,
    input.foundUrl ?? null,
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
