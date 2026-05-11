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
  applyAiFoundWebsite,
  createAiLeadVerification,
  getAiBudgetStatus,
  getConfiguredOpenAiApiKey,
  getConfiguredGooglePlacesApiKey,
  getLatestAiVerification,
  getAiWebsiteViabilityRepairLeads,
  getSettings,
  logAiUsageEvent,
  setStoredOpenAiApiKey,
  clearStoredOpenAiApiKey,
  setStoredGooglePlacesApiKey,
  clearStoredGooglePlacesApiKey,
  updateLeadAiVerificationSummary,
} from "@/lib/db/queries";

function insertLead() {
  testDb.prepare(
    `INSERT INTO leads (
      id, place_id, name, categories, website_status, score, status,
      qualification_status, contactability_score, estimated_deal_value,
      discovered_at, created_at, updated_at
    ) VALUES (
      'lead-1', 'place-1', 'Gateway Park Dental', '["dentist"]', 'none', 12, 'new',
      'needs_verification', 1, 4500,
      '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z', '2026-05-01T10:00:00.000Z'
    )`
  ).run();
}

beforeEach(() => {
  vi.stubEnv("NOSITE_SESSION_SECRET", "test-secret-for-encrypting-openai-keys");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "");
  testDb = createTestDb();
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
    const lead = testDb.prepare("SELECT ai_verification_status, ai_found_website_url, ai_confidence, ai_website_viability_status, ai_website_health, win_probability_score FROM leads WHERE id = 'lead-1'").get() as Record<string, unknown>;

    expect(latest?.status).toBe("site_found");
    expect(latest?.website_viability_status).toBe("usable");
    expect(latest?.website_health_json?.statusCode).toBe(200);
    expect(lead.ai_verification_status).toBe("site_found");
    expect(lead.ai_found_website_url).toBe("https://gatewayparkdental.example");
    expect(lead.ai_confidence).toBe(0.91);
    expect(lead.ai_website_viability_status).toBe("usable");
    expect(JSON.parse(lead.ai_website_health as string).statusCode).toBe(200);
    expect(lead.win_probability_score).toBe(12);
  });

  it("blocks budget preflight when reserved cost exceeds daily budget", async () => {
    testDb.prepare("UPDATE settings SET ai_daily_budget_usd = 0.04, ai_monthly_budget_usd = 25, ai_enabled = 1 WHERE id = 1").run();
    const status = await getAiBudgetStatus(await getSettings(), 0.05);
    expect(status.allowed).toBe(false);
    expect(status.reason).toContain("Daily AI budget");
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
    });

    const budget = await getAiBudgetStatus(await getSettings(), 0);
    expect(budget.dailyCost).toBe(0.05);

    const changed = await applyAiFoundWebsite("lead-1", "https://gatewayparkdental.example");
    const lead = testDb.prepare("SELECT website_uri, website_status, qualification_status, score, win_probability_score FROM leads WHERE id = 'lead-1'").get() as Record<string, unknown>;
    expect(changed).toBe(1);
    expect(lead.website_uri).toBe("https://gatewayparkdental.example");
    expect(lead.website_status).toBe("custom");
    expect(lead.qualification_status).toBe("disqualified");
    expect(lead.score).toBe(0);
    expect(lead.win_probability_score).toBe(0);
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
});
