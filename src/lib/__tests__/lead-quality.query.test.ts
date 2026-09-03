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
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: () => null,
  requireTenantContext: () => ({ tenantId: TENANT_A, workspaceId: null }),
}));

import {
  applyManualWebsiteCorrection,
  getQualityActionCandidateIds,
  getQualityAiVerificationCandidates,
  getQualityLeads,
  getQualitySummary,
  lockTenantLeadForMutation,
  queueLeadsForEnrichment,
  setLeadQualityBucket,
  updateLeadAiFeedback,
  updateLeadFacts,
  updateLeadPhoneVerificationStatus,
  updateLeadQualityScores,
} from "@/lib/db/queries";

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
  tenantId?: string;
  assignedTo?: string | null;
}) {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, address, phone, categories, website_status, score, status,
      business_type, qualification_status, contactability_score, estimated_deal_value,
      ai_verification_status, ai_website_viability_status, ai_found_website_url,
      country_code, market_id, location_cell_id, locality, postal_code, enrichment_status,
      quality_bucket, assigned_to_user_id, tenant_id, discovered_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, '["plumber"]', 'none', ?, 'new',
      ?, 'qualified', 1, 3500,
      ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'
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
    input.assignedTo ?? null,
    input.tenantId ?? TENANT_A,
  );
}

beforeEach(() => {
  testDb = createTestDb();
  testDb.exec(`
    ALTER TABLE leads ADD COLUMN tenant_id TEXT;
    ALTER TABLE lead_ai_artifacts ADD COLUMN tenant_id TEXT;
    ALTER TABLE places_master ADD COLUMN tenant_id TEXT;
    INSERT INTO tenants (id, slug, name, status) VALUES
      ('${TENANT_A}', 'quality-a', 'Quality A', 'active'),
      ('${TENANT_B}', 'quality-b', 'Quality B', 'active');
  `);
});

afterEach(() => {
  testDb.close();
});

describe("lead quality queries", () => {
  it("isolates every quality summary aggregate to the active tenant", async () => {
    insertLead({
      id: "tenant-a-ready",
      name: "Tenant A Ready",
      aiStatus: "no_site_found",
      viability: "directory_only",
      bucket: "ready_to_call",
    });
    testDb.prepare(
      "UPDATE leads SET lead_quality_score = 80, estimated_deal_value = 4000 WHERE id = 'tenant-a-ready'"
    ).run();
    insertLead({
      id: "tenant-a-removed",
      name: "Tenant A Removed",
      aiStatus: "site_found",
      viability: "usable",
      foundUrl: "https://tenant-a.example",
      bucket: "not_a_fit",
    });

    insertLead({
      id: "tenant-b-broken",
      name: "Tenant B Broken",
      aiStatus: "no_site_found",
      viability: "directory_only",
      bucket: "broken_site_opportunity",
      tenantId: TENANT_B,
    });
    testDb.prepare(
      "UPDATE leads SET lead_quality_score = 10, estimated_deal_value = 9000 WHERE id = 'tenant-b-broken'"
    ).run();
    insertLead({
      id: "tenant-b-removed",
      name: "Tenant B Removed",
      aiStatus: "site_found",
      viability: "usable",
      foundUrl: "https://tenant-b.example",
      bucket: "not_a_fit",
      tenantId: TENANT_B,
    });

    const summary = await getQualitySummary({ denverOnly: false });

    expect(summary).toEqual({
      readyToCall: 1,
      aiVerifiedNoWebsite: 1,
      brokenSiteOpportunities: 0,
      needsAiVerify: 0,
      needsManualReview: 0,
      removedBecauseWebsiteFound: 1,
      averageQualityScore: 80,
      estimatedPipelineValue: 4000,
    });
  });

  it("excludes other tenants and does not attach an assignee without an active same-tenant membership", async () => {
    const otherTenantAssignee = "quality-user-b";
    testDb.prepare(
      `INSERT INTO app_users (id, user_id, email, display_name, role, status, created_at, updated_at)
       VALUES ('quality-app-user-b', ?, 'user-b@example.com', 'Tenant B User', 'researcher', 'active',
         '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z')`
    ).run(otherTenantAssignee);
    testDb.pragma("ignore_check_constraints = ON");
    testDb.prepare(
      `INSERT INTO tenant_memberships (id, tenant_id, auth_identity_id, status)
       VALUES ('20000000-0000-4000-8000-000000000011', ?, ?, 'active')`
    ).run(TENANT_B, otherTenantAssignee);
    testDb.pragma("ignore_check_constraints = OFF");

    insertLead({ id: "tenant-a-malformed-assignee", name: "Tenant A Lead", assignedTo: otherTenantAssignee });
    insertLead({ id: "tenant-b-hidden", name: "Tenant B Lead", tenantId: TENANT_B });

    const result = await getQualityLeads({ denverOnly: false });

    expect(result.total).toBe(1);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({
      id: "tenant-a-malformed-assignee",
      assigned_to_user_id: otherTenantAssignee,
      assigned_user_email: null,
      assigned_user_display_name: null,
    });
  });

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

    const aiCandidates = await getQualityAiVerificationCandidates({ tenantId: TENANT_A, limit: 10, countryCode: "CA", marketId: "market-london-ca", zip: "N6H" });
    const actionIds = await getQualityActionCandidateIds({ tenantId: TENANT_A, limit: 10, countryCode: "CA", marketId: "market-london-ca", zip: "N6H" });
    const queued = await queueLeadsForEnrichment(actionIds, TENANT_A);
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

  it("keeps manually found candidate websites in manual review", async () => {
    insertLead({ id: "candidate", name: "Candidate Website Plumbing" });

    const lead = await applyManualWebsiteCorrection("candidate", {
      websiteUrl: "https://candidate.example",
      websiteStatus: "custom",
      resolution: "candidate_website_needs_review",
      notes: "Researcher found a candidate URL but identity needs review.",
      actorUserId: "researcher-1",
    });

    expect(lead).toMatchObject({
      website_uri: "https://candidate.example",
      website_status: "custom",
      quality_bucket: "needs_manual_review",
      ai_website_feedback_status: "uncertain",
      is_excluded: false,
    });
  });

  it("keeps manually confirmed official websites out of sales queues", async () => {
    insertLead({ id: "official", name: "Official Site Plumbing" });

    const lead = await applyManualWebsiteCorrection("official", {
      websiteUrl: "https://official.example",
      websiteStatus: "custom",
      resolution: "official_website_found",
      notes: "Official website found from the business listing.",
      actorUserId: "researcher-1",
    });

    expect(lead).toMatchObject({
      website_uri: "https://official.example",
      website_status: "custom",
      quality_bucket: "not_a_fit",
      is_excluded: true,
    });
  });

  it("keeps manually found weak sites as broken-site opportunities", async () => {
    insertLead({ id: "weak", name: "Weak Site Plumbing" });

    const lead = await applyManualWebsiteCorrection("weak", {
      websiteUrl: "https://weak.example",
      websiteStatus: "basic",
      resolution: "weak_or_basic_site",
      notes: "The site is a placeholder.",
      actorUserId: "researcher-1",
    });

    expect(lead).toMatchObject({
      website_uri: "https://weak.example",
      website_status: "basic",
      quality_bucket: "broken_site_opportunity",
      ai_website_feedback_status: "incorrect",
      is_excluded: false,
    });
  });

  it("keeps social or directory-only corrections in manual review", async () => {
    insertLead({ id: "directory", name: "Directory Only Plumbing" });

    const lead = await applyManualWebsiteCorrection("directory", {
      websiteUrl: "https://directory.example/plumbing",
      websiteStatus: "social",
      resolution: "social_or_directory_only",
      notes: "Only a directory page was found.",
      actorUserId: "researcher-1",
    });

    expect(lead).toMatchObject({
      website_uri: "https://directory.example/plumbing",
      website_status: "social",
      quality_bucket: "needs_manual_review",
      ai_website_feedback_status: "correct",
      is_excluded: false,
    });
  });

  it("returns zero/null for foreign and stale quality/detail mutation targets", async () => {
    insertLead({ id: "foreign-mutation", name: "Foreign Mutation", tenantId: TENANT_B });

    expect(await lockTenantLeadForMutation("missing")).toBeNull();
    expect(await updateLeadPhoneVerificationStatus("foreign-mutation", "works", "researcher-1")).toBe(0);
    expect(await setLeadQualityBucket("foreign-mutation", "ready_to_call", "researcher-1")).toBe(0);
    expect(await updateLeadAiFeedback("foreign-mutation", { status: "correct" }, "researcher-1")).toBe(0);
    expect(await updateLeadFacts("foreign-mutation", { name: "Changed", actorUserId: "researcher-1" })).toBeNull();
    expect(await applyManualWebsiteCorrection("foreign-mutation", {
      websiteUrl: "https://foreign.example",
      websiteStatus: "custom",
      resolution: "official_website_found",
      actorUserId: "researcher-1",
    })).toBeNull();

    expect(testDb.prepare(
      "SELECT name, phone_verification_status, quality_bucket, ai_website_feedback_status FROM leads WHERE id = ?",
    ).get("foreign-mutation")).toMatchObject({
      name: "Foreign Mutation",
      phone_verification_status: "unknown",
      quality_bucket: "needs_ai_verify",
      ai_website_feedback_status: null,
    });
  });

  it("returns the current assignee from the row-lock snapshot", async () => {
    insertLead({ id: "reassigned", name: "Reassigned Lead", assignedTo: "former-user" });
    testDb.prepare("UPDATE leads SET assigned_to_user_id = ? WHERE id = ?")
      .run("current-user", "reassigned");

    await expect(lockTenantLeadForMutation("reassigned")).resolves.toMatchObject({
      id: "reassigned",
      assigned_to_user_id: "current-user",
    });
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
