import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/settings/actions", () => ({
  backfillCanonicalPlacesAction: vi.fn(),
  clearGoogleMapsBrowserApiKeyAction: vi.fn(),
  clearGooglePlacesApiKeyAction: vi.fn(),
  clearOpenAiApiKeyAction: vi.fn(),
  updateGoogleMapsBrowserApiKeyAction: vi.fn(),
  updateGooglePlacesApiKeyAction: vi.fn(),
  updateOpenAiApiKeyAction: vi.fn(),
  updateSettingsAction: vi.fn(),
}));

vi.mock("@/lib/leads/actions", () => ({
  recomputeAllScoresAction: vi.fn(),
}));

import { SettingsClient } from "@/app/(protected)/settings/settings-client";

const settings = {
  niche_weights: {},
  social_hosts: [],
  basic_hosts: [],
  rate_limit_ms: 1000,
  search_radius_km: 8,
  enrichment_enabled: true,
  website_health_enabled: true,
  cache_ttl_days: 30,
  enrichment_stage_b_min_score: 9,
  max_calls_per_day: 500,
  max_calls_per_run: 100,
  max_monthly_api_spend: 100,
  stop_on_budget_limit: true,
  max_enrichment_per_run: 100,
  max_atmosphere_enrichment_per_run: 25,
  cost_engine_v2_enabled: true,
  ai_daily_budget_usd: 5,
  ai_monthly_budget_usd: 100,
  ai_enabled: false,
  ai_model: "gpt-4o-mini",
  ai_batch_limit: 25,
  researcher_ai_daily_run_cap: 10,
  researcher_ai_daily_budget_usd: 2,
  researcher_ai_monthly_budget_usd: 25,
  ai_cache_ttl_days: 30,
  ai_manual_apply_required: true,
  ai_auto_verify_enabled: true,
  ai_verify_after_discovery: true,
  ai_reverify_after_enrichment: true,
  ai_verification_concurrency: 1,
  ai_max_attempts: 3,
  scheduler_ai_verification_enabled: true,
  scheduler_crawl_enabled: true,
  scheduler_enrichment_enabled: true,
  scheduler_artifact_enabled: true,
  scheduler_score_recompute_enabled: true,
  openai_api_key_configured: false,
  openai_api_key_source: "none" as const,
  google_places_api_key_configured: false,
  google_places_api_key_source: "none" as const,
  google_maps_browser_api_key_configured: false,
  google_maps_browser_api_key_source: "none" as const,
  google_text_search_monthly_cap: 4900,
  google_enterprise_monthly_cap: 900,
  google_test_run_call_cap: 50,
  google_auto_pagination_enabled: true,
  google_auto_pagination_min_new_candidates: 6,
  google_auto_pagination_max_duplicate_rate: 0.6,
  google_default_discovery_mode: "coverage_probe" as const,
  google_default_pagination_policy: "auto_yield_based" as const,
};

describe("SettingsClient", () => {
  it("renders Google discovery safety caps in API controls", () => {
    const html = renderToStaticMarkup(<SettingsClient initialSettings={settings} />);

    expect(html).toContain("Test Run Call Cap");
    expect(html).toContain("Text Search Monthly Cap");
    expect(html).toContain("Enterprise Monthly Cap");
    expect(html).toContain('aria-label="Test Run Call Cap"');
    expect(html).toContain('value="50"');
    expect(html).toContain('value="4900"');
    expect(html).toContain('value="900"');
  });

  it("renders researcher AI safety caps in AI controls", () => {
    const html = renderToStaticMarkup(<SettingsClient initialSettings={settings} />);

    expect(html).toContain("Researcher AI Daily Runs");
    expect(html).toContain("Researcher AI Daily $");
    expect(html).toContain("Researcher AI Monthly $");
    expect(html).toContain('aria-label="Researcher AI Daily Runs"');
  });
});
