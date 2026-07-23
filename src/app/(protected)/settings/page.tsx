import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, getSettings, type Settings } from "@/lib/db/queries";
import { startRouteTiming } from "@/lib/route-timing";
import { SettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Settings | Nova Trade Lead Management" };

export default async function SettingsPage() {
  const logRouteTiming = startRouteTiming("/settings");
  await requirePermission("settings:manage");
  let settings: Settings;
  let reason: string | null = null;
  let status = 200;

  try {
    settings = await withDbStatementTimeout(8_000, async () => {
      await ensureDbReady();
      return getSettings();
    });
  } catch (error) {
    status = 503;
    reason = classifySettingsLoadFailure(error);
    settings = fallbackSettings();
  }

  logRouteTiming(status, reason ? { reason } : undefined);
  return <SettingsClient initialSettings={settings} loadWarning={reason} />;
}

function classifySettingsLoadFailure(error: unknown): "db_statement_timeout" | "transient_db_error" | "settings_load_error" {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "settings_load_error";
}

function fallbackSettings(): Settings {
  return {
    niche_weights: {},
    social_hosts: [],
    basic_hosts: [],
    rate_limit_ms: 1000,
    max_calls_per_day: 0,
    max_calls_per_run: 0,
    max_monthly_api_spend: 0,
    stop_on_budget_limit: false,
    search_radius_km: 8,
    enrichment_enabled: false,
    max_enrichment_per_run: 0,
    website_health_enabled: false,
    cache_ttl_days: 30,
    enrichment_stage_b_min_score: 9,
    max_atmosphere_enrichment_per_run: 0,
    cost_engine_v2_enabled: false,
    ai_enabled: false,
    ai_model: "gpt-4o-mini",
    ai_daily_budget_usd: 0,
    ai_monthly_budget_usd: 0,
    ai_batch_limit: 25,
    researcher_ai_daily_run_cap: 10,
    researcher_ai_daily_budget_usd: 2,
    researcher_ai_monthly_budget_usd: 25,
    ai_cache_ttl_days: 30,
    ai_manual_apply_required: true,
    ai_auto_verify_enabled: false,
    ai_verify_after_discovery: false,
    ai_reverify_after_enrichment: false,
    ai_verification_concurrency: 1,
    ai_max_attempts: 3,
    scheduler_ai_verification_enabled: false,
    scheduler_crawl_enabled: false,
    scheduler_enrichment_enabled: false,
    scheduler_artifact_enabled: false,
    scheduler_score_recompute_enabled: false,
    openai_api_key_configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    openai_api_key_source: process.env.OPENAI_API_KEY?.trim() ? "env" : "none",
    google_places_api_key_configured: Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim()),
    google_places_api_key_source: process.env.GOOGLE_PLACES_API_KEY?.trim() ? "env" : "none",
    google_maps_browser_api_key_configured: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim()),
    google_maps_browser_api_key_source: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim() ? "env" : "none",
    google_text_search_monthly_cap: 1,
    google_enterprise_monthly_cap: 1,
    google_test_run_call_cap: 1,
    google_auto_pagination_enabled: true,
    google_auto_pagination_min_new_candidates: 6,
    google_auto_pagination_max_duplicate_rate: 0.6,
    google_default_discovery_mode: "coverage_probe",
    google_default_pagination_policy: "auto_yield_based",
  };
}
