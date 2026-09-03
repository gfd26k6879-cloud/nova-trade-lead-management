import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { createTestDb } from "./test-helpers";

let testDb: Database.Database;
const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "20000000-0000-4000-8000-000000000001";
let dbReads = 0;
let memberContext: {
  tenantId: string;
  workspaceId: string | null;
  membershipId: string;
  role: "owner";
  roleBindingId: string;
  actorAuthIdentityId: string;
  correlationId: string;
} | null;
let workerContext: {
  tenantId: string;
  workspaceId: string | null;
  workerName: string;
  action: string;
} | null;

vi.mock("@/lib/db/index", () => {
  return {
    getDb: () => {
      dbReads += 1;
      return testDb;
    },
    generateId: () => crypto.randomUUID(),
    nowISO: () => new Date().toISOString(),
    withDbTransaction: async <T>(fn: () => Promise<T>) => fn(),
  };
});

vi.mock("@/lib/tenancy/context", () => ({
  getTenantContext: () => memberContext,
  requireTenantContext: () => {
    if (!memberContext) throw new Error("Tenant context is required");
    return memberContext;
  },
}));

vi.mock("@/lib/tenancy/worker-context", () => ({
  getWorkerTenantContext: () => workerContext,
}));

import {
  applyAiFoundWebsite,
  createAiLeadVerification,
  createLeadAiArtifactJob,
  getConfiguredOpenAiApiKey,
  getConfiguredGooglePlacesApiKey,
  getConfiguredGoogleMapsBrowserApiKey,
  getLatestAiVerification,
  getAiUsageForActor,
  createAiFeedbackEvent,
  getAiFeedbackEvaluationSummary,
  getAiFeedbackEventsForLead,
  getAiWebsiteViabilityRepairLeads,
  getSettings,
  logAiUsageEvent,
  markLeadAiArtifactComplete,
  markLeadAiArtifactRetry,
  markLeadAiArtifactRunning,
  setStoredOpenAiApiKey,
  clearStoredOpenAiApiKey,
  setStoredGooglePlacesApiKey,
  clearStoredGooglePlacesApiKey,
  setStoredGoogleMapsBrowserApiKey,
  clearStoredGoogleMapsBrowserApiKey,
  updateLeadAiVerificationSummary,
} from "@/lib/db/queries";

function insertLead(id = "lead-1", tenantId = TENANT_A) {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, categories, website_status, score, status,
      qualification_status, contactability_score, estimated_deal_value,
      tenant_id, discovered_at, created_at, updated_at
    ) VALUES (
      'lead-1', 'place-1', 'Gateway Park Dental', '["dentist"]', 'none', 12, 'new',
      'needs_verification', 1, 4500, ?,
      '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'
    )`
  ).run(tenantId);
  if (id !== "lead-1") {
    testDb.prepare("UPDATE leads SET id = ?, place_id = ? WHERE tenant_id = ? AND id = 'lead-1'")
      .run(id, `place-${id}`, tenantId);
  }
}

beforeEach(() => {
  vi.stubEnv("NOSITE_SESSION_SECRET", "test-secret-for-encrypting-openai-keys");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "");
  dbReads = 0;
  memberContext = {
    tenantId: TENANT_A,
    workspaceId: null,
    membershipId: "10000000-0000-4000-8000-000000000002",
    role: "owner",
    roleBindingId: "10000000-0000-4000-8000-000000000003",
    actorAuthIdentityId: "10000000-0000-4000-8000-000000000004",
    correlationId: "ai-verification-test",
  };
  workerContext = null;
  testDb = createTestDb();
  testDb.exec(`
    ALTER TABLE leads ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE ai_lead_verifications ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE ai_usage_events ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
    ALTER TABLE lead_ai_artifacts ADD COLUMN tenant_id TEXT NOT NULL DEFAULT '${TENANT_A}';
  `);
  insertLead();
});

afterEach(() => {
  testDb.close();
  vi.unstubAllEnvs();
});

describe("AI verification queries", () => {
  it("records verification history and denormalizes latest lead fields", async () => {
    const verification = await createAiLeadVerification({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      status: "site_found",
      confidence: 0.91,
      found_website_url: "https://gatewayparkdental.example",
      sources: [{ url: "https://gatewayparkdental.example", title: "Gateway Park Dental", evidence: "Official homepage." }],
      recommendation: "exclude",
      reason: "Official website found.",
      summary: "The lead already has a real website.",
      website_viability_status: "usable",
      website_health_json: {
        requestedUrl: "https://gatewayparkdental.example",
        finalUrl: "https://gatewayparkdental.example",
        statusCode: 200,
        method: "GET",
        responseMs: 120,
        redirected: false,
        ssl: true,
        title: "Gateway Park Dental",
        contentLength: 5000,
        businessSignalScore: 5,
        matchedSignals: ["name", "phone"],
        classifierSignals: [],
      },
      website_viability_reason: "Website is reachable and matches the business.",
      estimated_cost: 0.05,
    });

    await updateLeadAiVerificationSummary("lead-1", verification, 12);
    const latest = await getLatestAiVerification("lead-1");
    const lead = testDb.prepare(
      `SELECT ai_verification_status, ai_found_website_url, ai_confidence, ai_website_viability_status,
              ai_website_health, website_uri, website_status, qualification_status, score, win_probability_score
       FROM leads WHERE id = 'lead-1'`
    ).get() as Record<string, unknown>;

    expect(latest?.status).toBe("site_found");
    expect(latest?.website_viability_status).toBe("usable");
    expect(latest?.website_health_json?.statusCode).toBe(200);
    expect(lead.ai_verification_status).toBe("site_found");
    expect(lead.ai_found_website_url).toBe("https://gatewayparkdental.example");
    expect(lead.ai_confidence).toBe(0.91);
    expect(lead.ai_website_viability_status).toBe("usable");
    expect(JSON.parse(lead.ai_website_health as string).statusCode).toBe(200);
    expect(lead.website_uri).toBe("https://gatewayparkdental.example");
    expect(lead.website_status).toBe("custom");
    expect(lead.qualification_status).toBe("disqualified");
    expect(lead.score).toBe(0);
    expect(lead.win_probability_score).toBe(0);
  });

  it("moves AI weak website findings out of the no-website canonical bucket", async () => {
    const verification = await createAiLeadVerification({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      status: "weak_site_found",
      confidence: 0.84,
      found_website_url: "https://broken-gateway.example",
      sources: [{ url: "https://broken-gateway.example", title: "Gateway Park Dental", evidence: "Official domain is broken." }],
      recommendation: "keep",
      reason: "Official domain appears broken.",
      summary: "The lead has a broken website opportunity.",
      website_viability_status: "broken",
      website_viability_reason: "Website fails deterministic health checks.",
    });

    await updateLeadAiVerificationSummary("lead-1", verification, 58);
    const lead = testDb.prepare(
      "SELECT website_uri, website_status, qualification_status, quality_bucket FROM leads WHERE id = 'lead-1'"
    ).get() as Record<string, unknown>;

    expect(lead.website_uri).toBe("https://broken-gateway.example");
    expect(lead.website_status).toBe("basic");
    expect(lead.qualification_status).toBe("needs_verification");
    expect(lead.quality_bucket).toBe("broken_site_opportunity");
  });

  it("finds old site_found records that still need viability repair", async () => {
    const verification = await createAiLeadVerification({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      status: "site_found",
      confidence: 0.86,
      found_website_url: "https://gatewayparkdental.example",
      sources: [{ url: "https://directory.example/gateway", title: "Directory", evidence: "Directory lists a candidate domain." }],
      recommendation: "keep",
      reason: "Candidate domain found.",
      summary: "AI found a candidate domain.",
    });
    await updateLeadAiVerificationSummary("lead-1", verification, 6);

    const candidates = await getAiWebsiteViabilityRepairLeads(10);
    expect(candidates.map((lead) => lead.id)).toContain("lead-1");
  });

  it("records AI usage and applies found websites", async () => {
    await logAiUsageEvent({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      input_tokens: 120,
      output_tokens: 80,
      estimated_cost: 0.05,
      actor_user_id: "researcher-1",
      request_source: "researcher_ai_check",
    });

    const usage = testDb.prepare("SELECT COALESCE(SUM(estimated_cost), 0) as cost FROM ai_usage_events").get() as { cost: number };
    expect(usage.cost).toBe(0.05);
    await logAiUsageEvent({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      input_tokens: 40,
      output_tokens: 20,
      estimated_cost: 0.01,
      actor_user_id: "researcher-2",
      request_source: "researcher_ai_check",
    });
    const actorUsage = await getAiUsageForActor("researcher-1", "2000-01-01T00:00:00.000Z");
    expect(actorUsage).toEqual({ calls: 1, cost: 0.05 });

    const changed = await applyAiFoundWebsite("lead-1", "https://gatewayparkdental.example");
    const lead = testDb.prepare("SELECT website_uri, website_status, qualification_status, score, win_probability_score FROM leads WHERE id = 'lead-1'").get() as Record<string, unknown>;
    expect(changed).toBe(1);
    expect(lead.website_uri).toBe("https://gatewayparkdental.example");
    expect(lead.website_status).toBe("custom");
    expect(lead.qualification_status).toBe("disqualified");
    expect(lead.score).toBe(0);
    expect(lead.win_probability_score).toBe(0);
  });

  it("enforces researcher caps from canonical paid work when usage-event inserts are missing without double counting", async () => {
    const recordedVerification = await createAiLeadVerification({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      status: "no_site_found",
      confidence: 0.8,
      recommendation: "prioritize",
      reason: "No official website found.",
      summary: "No usable official website was found.",
      estimated_cost: 0.12,
      requested_by_user_id: "researcher-1",
      request_source: "researcher_ai_check",
    });
    await createAiLeadVerification({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      status: "error",
      confidence: 0,
      recommendation: "manual_review",
      reason: "Billable response could not be parsed.",
      summary: "Billable response could not be parsed.",
      error: "Billable response could not be parsed.",
      estimated_cost: 0.08,
      requested_by_user_id: "researcher-1",
      request_source: "researcher_ai_check",
    });
    await logAiUsageEvent({
      lead_id: "lead-1",
      verification_id: recordedVerification.id,
      model: "gpt-5.4-mini",
      estimated_cost: 0.12,
      actor_user_id: "researcher-1",
      request_source: "researcher_ai_check",
    });

    const recordedArtifact = await createLeadAiArtifactJob({
      lead_id: "lead-1",
      artifact_type: "business_detail",
      model: "gpt-5.4-mini",
      input_hash: "artifact-hash-1",
      prompt_version: "lead-intelligence-v1",
      requested_by_user_id: "researcher-1",
      request_source: "researcher_pitch_pack",
    });
    await markLeadAiArtifactRunning(recordedArtifact.id);
    await markLeadAiArtifactRetry(recordedArtifact.id, "First billable attempt failed.", 3, {
      input_tokens: 40,
      output_tokens: 20,
      estimated_cost: 0.08,
    });
    await markLeadAiArtifactRunning(recordedArtifact.id);
    await markLeadAiArtifactComplete(recordedArtifact.id, {
      content_json: {},
      sources_json: [],
      confidence: 0.7,
      usage_input_tokens: 60,
      usage_output_tokens: 30,
      estimated_cost: 0.12,
    });
    const unrecordedArtifact = await createLeadAiArtifactJob({
      lead_id: "lead-1",
      artifact_type: "competitive_report",
      model: "gpt-5.4-mini",
      input_hash: "artifact-hash-2",
      prompt_version: "lead-intelligence-v1",
      requested_by_user_id: "researcher-1",
      request_source: "researcher_pitch_pack",
    });
    await markLeadAiArtifactRunning(unrecordedArtifact.id);
    await markLeadAiArtifactRetry(unrecordedArtifact.id, "Billable final response could not be parsed.", 3, {
      input_tokens: 120,
      output_tokens: 60,
      estimated_cost: 0.3,
    });
    await logAiUsageEvent({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      estimated_cost: 0.08,
      actor_user_id: "researcher-1",
      request_source: "researcher_pitch_pack",
      metadata: { artifactId: recordedArtifact.id },
    });
    await logAiUsageEvent({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      estimated_cost: 0.12,
      actor_user_id: "researcher-1",
      request_source: "researcher_pitch_pack",
      metadata: { artifactId: recordedArtifact.id },
    });
    await logAiUsageEvent({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      success: false,
      estimated_cost: 0.04,
      actor_user_id: "researcher-1",
      request_source: "researcher_ai_check",
      metadata: { failureStage: "provider" },
    });

    const actorUsage = await getAiUsageForActor("researcher-1", "2000-01-01T00:00:00.000Z");

    expect(actorUsage.calls).toBe(6);
    expect(actorUsage.cost).toBeCloseTo(0.74, 8);
  });

  it("conservatively charges cumulative artifact fallback in the active window after a lost attempt event", async () => {
    const artifact = await createLeadAiArtifactJob({
      lead_id: "lead-1",
      artifact_type: "business_detail",
      model: "gpt-5.4-mini",
      input_hash: "cross-window-artifact",
      prompt_version: "lead-intelligence-v1",
      requested_by_user_id: "researcher-1",
      request_source: "researcher_pitch_pack",
    });
    await markLeadAiArtifactRunning(artifact.id);
    await markLeadAiArtifactRetry(artifact.id, "Prior-window billable event was lost.", 3, {
      input_tokens: 50,
      output_tokens: 20,
      estimated_cost: 0.1,
    });
    testDb.prepare(
      "UPDATE lead_ai_artifacts SET created_at = ?, updated_at = ? WHERE id = ?",
    ).run("2026-06-30T22:00:00.000Z", "2026-06-30T23:00:00.000Z", artifact.id);
    await markLeadAiArtifactRunning(artifact.id);
    await markLeadAiArtifactRetry(artifact.id, "Current-window billable event was lost.", 3, {
      input_tokens: 30,
      output_tokens: 20,
      estimated_cost: 0.08,
    });
    testDb.prepare("UPDATE lead_ai_artifacts SET updated_at = ? WHERE id = ?")
      .run("2026-07-01T00:10:00.000Z", artifact.id);

    const actorUsage = await getAiUsageForActor("researcher-1", "2026-07-01T00:00:00.000Z");

    expect(actorUsage).toEqual({ calls: 2, cost: 0.18 });
  });

  it("stores researcher attribution on verification rows", async () => {
    const verification = await createAiLeadVerification({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      status: "no_site_found",
      confidence: 0.74,
      recommendation: "keep",
      reason: "No official website found.",
      summary: "Researcher check found no official site.",
      requested_by_user_id: "researcher-1",
      request_source: "researcher_ai_check",
    });

    expect(verification.requested_by_user_id).toBe("researcher-1");
    expect(verification.request_source).toBe("researcher_ai_check");
    const latest = await getLatestAiVerification("lead-1");
    expect(latest?.requested_by_user_id).toBe("researcher-1");
    expect(latest?.request_source).toBe("researcher_ai_check");
  });

  it("stores advisory researcher AI feedback separately from admin canonical feedback", async () => {
    const verification = await createAiLeadVerification({
      lead_id: "lead-1",
      model: "gpt-5.4-mini",
      status: "site_found",
      confidence: 0.88,
      found_website_url: "https://wrong-gateway.example",
      sources: [{ url: "https://wrong-gateway.example", title: "Wrong Gateway", evidence: "Candidate page." }],
      recommendation: "manual_review",
      reason: "Candidate official site found.",
      summary: "Candidate needs review.",
    });

    const event = await createAiFeedbackEvent({
      lead_id: "lead-1",
      verification_id: verification.id,
      artifact_id: null,
      actor_user_id: "researcher-1",
      feedback_kind: "verification",
      verdict: "incorrect",
      corrected_website_url: "https://gatewayparkdental.example",
      reason: "The returned website is a different business.",
      metadata_json: { source: "lead_detail" },
    });
    const events = await getAiFeedbackEventsForLead("lead-1");
    const lead = testDb.prepare("SELECT ai_website_feedback_status, ai_corrected_website_url FROM leads WHERE id = 'lead-1'").get() as Record<string, unknown>;

    expect(event.verdict).toBe("incorrect");
    expect(events).toHaveLength(1);
    expect(events[0]?.actor_user_id).toBe("researcher-1");
    expect(lead.ai_website_feedback_status).toBeNull();
    expect(lead.ai_corrected_website_url).toBeNull();
  });

  it("does not read or mutate another tenant's AI history or lead", async () => {
    testDb.prepare(
      `INSERT INTO leads (
        id, place_id, name, categories, website_status, score, status,
        qualification_status, contactability_score, estimated_deal_value, tenant_id,
        discovered_at, created_at, updated_at
      ) VALUES ('lead-foreign', 'place-foreign', 'Foreign', '[]', 'none', 9, 'new',
        'needs_verification', 1, 1000, ?, ?, ?, ?)`,
    ).run(TENANT_B, new Date().toISOString(), new Date().toISOString(), new Date().toISOString());

    expect(await applyAiFoundWebsite("lead-foreign", "https://foreign.example")).toBe(0);
    expect(await getLatestAiVerification("lead-foreign")).toBeNull();
    await expect(createAiLeadVerification({
      lead_id: "lead-foreign",
      model: "gpt-5.4-mini",
      status: "no_site_found",
      recommendation: "keep",
    })).rejects.toThrow("Lead is unavailable.");
    expect(testDb.prepare("SELECT website_uri FROM leads WHERE id = 'lead-foreign'").get())
      .toEqual({ website_uri: null });
  });

  it("rejects wrong and dual AI worker authority before opening the database", async () => {
    memberContext = null;
    workerContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      workerName: "ai_verification",
      action: "ai_verification:wrong",
    };
    const beforeWrong = dbReads;
    await expect(getLatestAiVerification("lead-1")).rejects.toThrow("Exact AI worker context is required.");
    expect(dbReads).toBe(beforeWrong);

    memberContext = {
      tenantId: TENANT_A,
      workspaceId: null,
      membershipId: "10000000-0000-4000-8000-000000000002",
      role: "owner",
      roleBindingId: "10000000-0000-4000-8000-000000000003",
      actorAuthIdentityId: "10000000-0000-4000-8000-000000000004",
      correlationId: "ai-verification-test",
    };
    workerContext.action = "ai_verification:process";
    const beforeDual = dbReads;
    await expect(applyAiFoundWebsite("lead-1", "https://example.test")).rejects.toThrow("Conflicting AI tenant contexts.");
    expect(dbReads).toBe(beforeDual);
  });

  it("summarizes advisory AI feedback for offline evaluation", async () => {
    await createAiFeedbackEvent({
      lead_id: "lead-1",
      actor_user_id: "researcher-1",
      feedback_kind: "verification",
      verdict: "incorrect",
      corrected_website_url: null,
      reason: "Wrong website.",
      metadata_json: { aiStatus: "site_found" },
    });
    await createAiFeedbackEvent({
      lead_id: "lead-1",
      actor_user_id: "researcher-1",
      feedback_kind: "pitch",
      verdict: "useful",
      corrected_website_url: null,
      reason: "Good opener.",
      metadata_json: { artifactType: "competitive_report" },
    });

    const summary = await getAiFeedbackEvaluationSummary();

    expect(summary.total).toBe(2);
    expect(summary.verificationIncorrect).toBe(1);
    expect(summary.pitchUseful).toBe(1);
  });

  it("stores OpenAI API keys encrypted and falls back to env after clearing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-env-key-for-tests-123456");
    await setStoredOpenAiApiKey("sk-ui-key-for-tests-123456");

    const raw = testDb.prepare("SELECT openai_api_key_encrypted FROM settings WHERE id = 1").get() as { openai_api_key_encrypted: string };
    expect(raw.openai_api_key_encrypted).not.toContain("sk-ui-key");
    expect(await getConfiguredOpenAiApiKey()).toBe("sk-ui-key-for-tests-123456");
    expect((await getSettings()).openai_api_key_source).toBe("ui");

    await clearStoredOpenAiApiKey();
    expect(await getConfiguredOpenAiApiKey()).toBe("sk-env-key-for-tests-123456");
    expect((await getSettings()).openai_api_key_source).toBe("env");
  });

  it("stores Google Places API keys encrypted and falls back to env after clearing", async () => {
    vi.stubEnv("GOOGLE_PLACES_API_KEY", "AIzaEnvKeyForTests1234567890");
    await setStoredGooglePlacesApiKey("AIzaUiKeyForTests1234567890");

    const raw = testDb.prepare("SELECT google_places_api_key_encrypted FROM settings WHERE id = 1").get() as { google_places_api_key_encrypted: string };
    expect(raw.google_places_api_key_encrypted).not.toContain("AIzaUiKey");
    expect(await getConfiguredGooglePlacesApiKey()).toBe("AIzaUiKeyForTests1234567890");
    expect((await getSettings()).google_places_api_key_source).toBe("ui");

    await clearStoredGooglePlacesApiKey();
    expect(await getConfiguredGooglePlacesApiKey()).toBe("AIzaEnvKeyForTests1234567890");
    expect((await getSettings()).google_places_api_key_source).toBe("env");
  });

  it("stores Google Maps browser API keys encrypted and falls back to env after clearing", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY", "AIzaEnvMapsKeyForTests1234567890");
    await setStoredGoogleMapsBrowserApiKey("AIzaUiMapsKeyForTests1234567890");

    const raw = testDb.prepare("SELECT google_maps_browser_api_key_encrypted FROM settings WHERE id = 1").get() as { google_maps_browser_api_key_encrypted: string };
    expect(raw.google_maps_browser_api_key_encrypted).not.toContain("AIzaUiMapsKey");
    expect(await getConfiguredGoogleMapsBrowserApiKey()).toBe("AIzaUiMapsKeyForTests1234567890");
    expect((await getSettings()).google_maps_browser_api_key_source).toBe("ui");

    await clearStoredGoogleMapsBrowserApiKey();
    expect(await getConfiguredGoogleMapsBrowserApiKey()).toBe("AIzaEnvMapsKeyForTests1234567890");
    expect((await getSettings()).google_maps_browser_api_key_source).toBe("env");
  });

  it("adds the Google Maps browser API key column before saving when an older database is missing it", async () => {
    testDb.prepare("ALTER TABLE settings DROP COLUMN google_maps_browser_api_key_encrypted").run();

    await setStoredGoogleMapsBrowserApiKey("AIzaUiMapsKeyForOlderDatabase1234567890");

    const raw = testDb.prepare("SELECT google_maps_browser_api_key_encrypted FROM settings WHERE id = 1").get() as { google_maps_browser_api_key_encrypted: string };
    expect(raw.google_maps_browser_api_key_encrypted).toMatch(/^v1\./);
    expect(await getConfiguredGoogleMapsBrowserApiKey()).toBe("AIzaUiMapsKeyForOlderDatabase1234567890");
  });
});
