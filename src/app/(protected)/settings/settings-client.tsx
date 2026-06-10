"use client";

import { useState } from "react";
import { HelpTip } from "@/components/help-tip";
import { PageShell } from "@/components/page-shell";
import {
  backfillCanonicalPlacesAction,
  clearGoogleMapsBrowserApiKeyAction,
  clearGooglePlacesApiKeyAction,
  clearOpenAiApiKeyAction,
  updateGoogleMapsBrowserApiKeyAction,
  updateGooglePlacesApiKeyAction,
  updateOpenAiApiKeyAction,
  updateSettingsAction,
} from "@/lib/settings/actions";
import { recomputeAllScoresAction } from "@/lib/leads/actions";
import { getDefaultSocialHosts, getDefaultBasicHosts } from "@/lib/classify-website";
import { DEFAULT_NICHE_WEIGHTS } from "@/lib/scoring";

interface Settings {
  niche_weights: Record<string, number>;
  social_hosts: string[];
  basic_hosts: string[];
  rate_limit_ms: number;
  search_radius_km: number;
  enrichment_enabled: boolean;
  website_health_enabled: boolean;
  cache_ttl_days: number;
  enrichment_stage_b_min_score: number;
  ai_enabled: boolean;
  ai_model: string;
  ai_batch_limit: number;
  researcher_ai_daily_run_cap: number;
  researcher_ai_daily_budget_usd: number;
  researcher_ai_monthly_budget_usd: number;
  ai_cache_ttl_days: number;
  ai_manual_apply_required: boolean;
  ai_auto_verify_enabled: boolean;
  ai_verify_after_discovery: boolean;
  ai_reverify_after_enrichment: boolean;
  ai_verification_concurrency: number;
  ai_max_attempts: number;
  scheduler_ai_verification_enabled: boolean;
  scheduler_crawl_enabled: boolean;
  scheduler_enrichment_enabled: boolean;
  scheduler_artifact_enabled: boolean;
  scheduler_score_recompute_enabled: boolean;
  openai_api_key_configured: boolean;
  openai_api_key_source: "ui" | "env" | "none";
  google_places_api_key_configured: boolean;
  google_places_api_key_source: "ui" | "env" | "none";
  google_maps_browser_api_key_configured: boolean;
  google_maps_browser_api_key_source: "ui" | "env" | "none";
  google_text_search_monthly_cap: number;
  google_enterprise_monthly_cap: number;
  google_test_run_call_cap: number;
  google_auto_pagination_enabled: boolean;
  google_auto_pagination_min_new_candidates: number;
  google_auto_pagination_max_duplicate_rate: number;
  google_default_discovery_mode: "coverage_probe" | "lead_harvest";
  google_default_pagination_policy: "first_page_only" | "auto_yield_based" | "manual_extra_pages";
}

const LEGACY_BUDGET_SETTING_KEYS = [
  "max_calls_per_day",
  "max_calls_per_run",
  "max_monthly_api_spend",
  "stop_on_budget_limit",
  "max_enrichment_per_run",
  "max_atmosphere_enrichment_per_run",
  "cost_engine_v2_enabled",
  "ai_daily_budget_usd",
  "ai_monthly_budget_usd",
] as const;

function removeLegacyBudgetSettings(input: Settings): Settings {
  const sanitized = { ...input } as Record<string, unknown>;
  for (const key of LEGACY_BUDGET_SETTING_KEYS) delete sanitized[key];
  return sanitized as unknown as Settings;
}

export function SettingsClient({
  initialSettings,
  loadWarning = null,
}: {
  initialSettings: Settings;
  loadWarning?: string | null;
}) {
  const [settings, setSettings] = useState<Settings>(() => removeLegacyBudgetSettings(initialSettings));
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [googleKeyInput, setGoogleKeyInput] = useState("");
  const [googleKeyLoading, setGoogleKeyLoading] = useState(false);
  const [mapsKeyInput, setMapsKeyInput] = useState("");
  const [mapsKeyLoading, setMapsKeyLoading] = useState(false);
  const [nicheText, setNicheText] = useState(
    JSON.stringify(
      Object.keys(settings.niche_weights).length > 0 ? settings.niche_weights : DEFAULT_NICHE_WEIGHTS,
      null, 2
    )
  );
  const [socialText, setSocialText] = useState(
    (settings.social_hosts.length > 0 ? settings.social_hosts : getDefaultSocialHosts()).join("\n")
  );
  const [basicText, setBasicText] = useState(
    (settings.basic_hosts.length > 0 ? settings.basic_hosts : getDefaultBasicHosts()).join("\n")
  );

  const handleSave = async () => {
    try {
      if (loadWarning) {
        setSaveMsg("Settings are temporarily unavailable. Reload before saving changes.");
        return;
      }
      let nicheWeights: Record<string, number>;
      try {
        nicheWeights = JSON.parse(nicheText);
      } catch {
        setSaveMsg("Invalid JSON in niche weights");
        return;
      }

      const socialHosts = socialText.split("\n").map((s) => s.trim()).filter(Boolean);
      const basicHosts = basicText.split("\n").map((s) => s.trim()).filter(Boolean);

      const updated: Settings = removeLegacyBudgetSettings({
        ...settings,
        niche_weights: nicheWeights,
        social_hosts: socialHosts,
        basic_hosts: basicHosts,
      });

      await updateSettingsAction(updated);
      setSettings(updated);
      setSaveMsg("Settings saved");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch {
      setSaveMsg("Error saving settings");
    }
  };

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveOpenAiKey = async () => {
    setApiKeyLoading(true);
    const result = await updateOpenAiApiKeyAction(apiKeyInput);
    if ("error" in result) {
      setSaveMsg(result.error ?? "Error saving OpenAI key");
    } else {
      setSettings(removeLegacyBudgetSettings(result.settings as Settings));
      setApiKeyInput("");
      setSaveMsg("OpenAI API key saved");
    }
    setApiKeyLoading(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleClearOpenAiKey = async () => {
    setApiKeyLoading(true);
    const result = await clearOpenAiApiKeyAction();
    if ("settings" in result) {
      setSettings(removeLegacyBudgetSettings(result.settings as Settings));
      setApiKeyInput("");
      setSaveMsg(result.settings.openai_api_key_configured ? "UI key cleared; env key is still configured" : "OpenAI API key cleared");
    } else {
      setSaveMsg("Error clearing OpenAI key");
    }
    setApiKeyLoading(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleSaveGoogleKey = async () => {
    setGoogleKeyLoading(true);
    const result = await updateGooglePlacesApiKeyAction(googleKeyInput);
    if ("error" in result) {
      setSaveMsg(result.error ?? "Error saving Google Places key");
    } else {
      setSettings(removeLegacyBudgetSettings(result.settings as Settings));
      setGoogleKeyInput("");
      setSaveMsg("Google Places API key saved");
    }
    setGoogleKeyLoading(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleClearGoogleKey = async () => {
    setGoogleKeyLoading(true);
    const result = await clearGooglePlacesApiKeyAction();
    if ("settings" in result) {
      setSettings(removeLegacyBudgetSettings(result.settings as Settings));
      setGoogleKeyInput("");
      setSaveMsg(result.settings.google_places_api_key_configured ? "UI Google key cleared; env key is still configured" : "Google Places API key cleared");
    } else {
      setSaveMsg("Error clearing Google Places key");
    }
    setGoogleKeyLoading(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleSaveMapsKey = async () => {
    setMapsKeyLoading(true);
    const result = await updateGoogleMapsBrowserApiKeyAction(mapsKeyInput);
    if ("error" in result) {
      setSaveMsg(result.error ?? "Error saving Google Maps browser key");
    } else {
      setSettings(removeLegacyBudgetSettings(result.settings as Settings));
      setMapsKeyInput("");
      setSaveMsg("Google Maps browser key saved");
    }
    setMapsKeyLoading(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  const handleClearMapsKey = async () => {
    setMapsKeyLoading(true);
    const result = await clearGoogleMapsBrowserApiKeyAction();
    if ("settings" in result) {
      setSettings(removeLegacyBudgetSettings(result.settings as Settings));
      setMapsKeyInput("");
      setSaveMsg(result.settings.google_maps_browser_api_key_configured ? "UI Maps key cleared; env key is still configured" : "Google Maps browser key cleared");
    } else {
      setSaveMsg("Error clearing Google Maps browser key");
    }
    setMapsKeyLoading(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  return (
    <PageShell title="Settings" description="Configure lead scoring, classification hosts, API keys, and worker behavior.">
      {loadWarning && (
        <section className="glass rounded-2xl p-4" style={{ border: "1px solid rgba(239,68,68,0.25)" }}>
          <p className="section-label">Settings are temporarily unavailable.</p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Showing safe read-only defaults so this page does not hang. Reload before saving production settings.
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>Diagnostic: {loadWarning}</p>
        </section>
      )}
      {/* API Controls */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">API Controls</h3>
        <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Google Places API Key
              </label>
              <input
                type="password"
                className="glass-input w-full"
                aria-label="Google Places API Key"
                value={googleKeyInput}
                placeholder={settings.google_places_api_key_configured ? "Configured. Paste a new key to replace it." : "Paste your Google Places API key"}
                autoComplete="off"
                onChange={(e) => setGoogleKeyInput(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={googleKeyLoading || googleKeyInput.trim().length < 20}
              onClick={handleSaveGoogleKey}
            >
              {googleKeyLoading ? "Saving..." : "Save Key"}
            </button>
            <button
              type="button"
              className="btn-glass text-xs"
              disabled={googleKeyLoading || settings.google_places_api_key_source !== "ui"}
              onClick={handleClearGoogleKey}
            >
              Clear UI Key
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span className="rounded-md px-2 py-1" style={{ background: settings.google_places_api_key_configured ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: settings.google_places_api_key_configured ? "#166534" : "#991b1b" }}>
              {settings.google_places_api_key_configured ? `Configured via ${settings.google_places_api_key_source}` : "No Google Places key configured"}
            </span>
            <span>Used for crawling, enrichment, and Places billing.</span>
          </div>
        </div>
        <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Google Maps Browser Key
              </label>
              <input
                type="password"
                className="glass-input w-full"
                aria-label="Google Maps Browser API Key"
                value={mapsKeyInput}
                placeholder={settings.google_maps_browser_api_key_configured ? "Configured. Paste a new key to replace it." : "Paste your browser-restricted Maps key"}
                autoComplete="off"
                onChange={(e) => setMapsKeyInput(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={mapsKeyLoading || mapsKeyInput.trim().length < 20}
              onClick={handleSaveMapsKey}
            >
              {mapsKeyLoading ? "Saving..." : "Save Key"}
            </button>
            <button
              type="button"
              className="btn-glass text-xs"
              disabled={mapsKeyLoading || settings.google_maps_browser_api_key_source !== "ui"}
              onClick={handleClearMapsKey}
            >
              Clear UI Key
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span className="rounded-md px-2 py-1" style={{ background: settings.google_maps_browser_api_key_configured ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: settings.google_maps_browser_api_key_configured ? "#166534" : "#991b1b" }}>
              {settings.google_maps_browser_api_key_configured ? `Configured via ${settings.google_maps_browser_api_key_source}` : "No Google Maps browser key configured"}
            </span>
            <span>Used only when Explorer users manually switch to Google map.</span>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Rate Limit (ms)" value={settings.rate_limit_ms} onChange={(v) => update("rate_limit_ms", v)} />
          <NumberField label="Test Run Call Cap" value={settings.google_test_run_call_cap} onChange={(v) => update("google_test_run_call_cap", v)} />
          <NumberField label="Text Search Monthly Cap" value={settings.google_text_search_monthly_cap} onChange={(v) => update("google_text_search_monthly_cap", v)} />
          <NumberField label="Enterprise Monthly Cap" value={settings.google_enterprise_monthly_cap} onChange={(v) => update("google_enterprise_monthly_cap", v)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Next Page Min New" value={settings.google_auto_pagination_min_new_candidates} onChange={(v) => update("google_auto_pagination_min_new_candidates", v)} />
          <NumberField label="Max Duplicate Rate" value={settings.google_auto_pagination_max_duplicate_rate} onChange={(v) => update("google_auto_pagination_max_duplicate_rate", v)} step={0.05} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <span className="mb-1 block text-xs font-medium">Default discovery mode</span>
            <select className="glass-input w-full" value={settings.google_default_discovery_mode} onChange={(e) => update("google_default_discovery_mode", e.target.value as Settings["google_default_discovery_mode"])}>
              <option value="coverage_probe">Coverage probe - preview inventory</option>
              <option value="lead_harvest">Lead harvest - richer data</option>
            </select>
          </label>
          <label className="text-sm" style={{ color: "var(--text-secondary)" }}>
            <span className="mb-1 block text-xs font-medium">Default pagination</span>
            <select className="glass-input w-full" value={settings.google_default_pagination_policy} onChange={(e) => update("google_default_pagination_policy", e.target.value as Settings["google_default_pagination_policy"])}>
              <option value="first_page_only">First page only</option>
              <option value="auto_yield_based">Auto if yield is strong</option>
              <option value="manual_extra_pages">Always fetch up to 3 pages</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.google_auto_pagination_enabled}
              onChange={(e) => update("google_auto_pagination_enabled", e.target.checked)}
              className="rounded"
            />
            Allow yield-based next pages
          </label>
        </div>
      </section>

      {/* Scheduler */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Scheduler</h3>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Supabase Cron keeps background work moving. These toggles pause app-side processing without deleting cron jobs.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SchedulerToggle
            label="AI Verify"
            checked={settings.scheduler_ai_verification_enabled}
            onChange={(checked) => update("scheduler_ai_verification_enabled", checked)}
          />
          <SchedulerToggle
            label="Discovery"
            checked={settings.scheduler_crawl_enabled}
            onChange={(checked) => update("scheduler_crawl_enabled", checked)}
          />
          <SchedulerToggle
            label="Enrichment"
            checked={settings.scheduler_enrichment_enabled}
            onChange={(checked) => update("scheduler_enrichment_enabled", checked)}
          />
          <SchedulerToggle
            label="Pitch Packs"
            checked={settings.scheduler_artifact_enabled}
            onChange={(checked) => update("scheduler_artifact_enabled", checked)}
          />
          <SchedulerToggle
            label="Scores"
            checked={settings.scheduler_score_recompute_enabled}
            onChange={(checked) => update("scheduler_score_recompute_enabled", checked)}
          />
        </div>
      </section>

      {/* Search & Enrichment */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Search & Enrichment</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField label="Search Radius (km)" value={settings.search_radius_km} onChange={(v) => update("search_radius_km", v)} step={0.5} />
          <NumberField label="Cache TTL (days)" value={settings.cache_ttl_days} onChange={(v) => update("cache_ttl_days", v)} />
          <NumberField label="Stage-B Min Score" value={settings.enrichment_stage_b_min_score} onChange={(v) => update("enrichment_stage_b_min_score", v)} step={0.1} />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.enrichment_enabled}
              onChange={(e) => update("enrichment_enabled", e.target.checked)}
              className="rounded"
            />
            Enable automatic lead enrichment (Place Details API)
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.website_health_enabled}
              onChange={(e) => update("website_health_enabled", e.target.checked)}
              className="rounded"
            />
            Enable website health checks during enrichment
          </label>
        </div>
      </section>

      {/* AI Verification */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">AI Verification</h3>
        <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                OpenAI API Key
              </label>
              <input
                type="password"
                className="glass-input w-full"
                aria-label="OpenAI API Key"
                value={apiKeyInput}
                placeholder={settings.openai_api_key_configured ? "Configured. Paste a new key to replace it." : "Paste your OpenAI API key"}
                autoComplete="off"
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={apiKeyLoading || apiKeyInput.trim().length < 20}
              onClick={handleSaveOpenAiKey}
            >
              {apiKeyLoading ? "Saving..." : "Save Key"}
            </button>
            <button
              type="button"
              className="btn-glass text-xs"
              disabled={apiKeyLoading || settings.openai_api_key_source !== "ui"}
              onClick={handleClearOpenAiKey}
            >
              Clear UI Key
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <span className="rounded-md px-2 py-1" style={{ background: settings.openai_api_key_configured ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: settings.openai_api_key_configured ? "#166534" : "#991b1b" }}>
              {settings.openai_api_key_configured ? `Configured via ${settings.openai_api_key_source}` : "No OpenAI key configured"}
            </span>
            <span>The key is encrypted server-side and never shown again.</span>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Locked Model" value={settings.ai_model} />
          <NumberField label="AI Batch Limit" value={settings.ai_batch_limit} onChange={(v) => update("ai_batch_limit", v)} />
          <NumberField label="Researcher AI Daily Runs" value={settings.researcher_ai_daily_run_cap} onChange={(v) => update("researcher_ai_daily_run_cap", v)} />
          <NumberField label="Researcher AI Daily $" value={settings.researcher_ai_daily_budget_usd} onChange={(v) => update("researcher_ai_daily_budget_usd", v)} step={0.25} />
          <NumberField label="Researcher AI Monthly $" value={settings.researcher_ai_monthly_budget_usd} onChange={(v) => update("researcher_ai_monthly_budget_usd", v)} step={1} />
          <NumberField label="AI Result Cache (days)" value={settings.ai_cache_ttl_days} onChange={(v) => update("ai_cache_ttl_days", v)} />
          <NumberField label="AI Concurrency" value={settings.ai_verification_concurrency} onChange={(v) => update("ai_verification_concurrency", v)} />
          <NumberField label="AI Max Attempts" value={settings.ai_max_attempts} onChange={(v) => update("ai_max_attempts", v)} />
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.ai_enabled}
              onChange={(e) => update("ai_enabled", e.target.checked)}
              className="rounded"
            />
            Enable AI lead verification
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.ai_auto_verify_enabled}
              onChange={(e) => update("ai_auto_verify_enabled", e.target.checked)}
              className="rounded"
            />
            Auto-verify eligible leads
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.ai_verify_after_discovery}
              onChange={(e) => update("ai_verify_after_discovery", e.target.checked)}
              className="rounded"
            />
            Queue AI verification after discovery
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.ai_reverify_after_enrichment}
              onChange={(e) => update("ai_reverify_after_enrichment", e.target.checked)}
              className="rounded"
            />
            Reverify when enrichment changes identity or website evidence
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.ai_manual_apply_required}
              readOnly
              disabled
              className="rounded"
            />
            Require manual apply for AI recommendations
          </label>
        </div>
      </section>

      {/* Niche Weights */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Niche Weights</h3>
        <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
          JSON object mapping category names to weight multipliers. Higher = higher score priority.
        </p>
        <textarea
          className="glass-input mt-3 w-full font-mono text-xs"
          aria-label="Niche weights JSON"
          rows={10}
          value={nicheText}
          onChange={(e) => setNicheText(e.target.value)}
        />
      </section>

      {/* Host Lists */}
      <section className="grid gap-4 lg:grid-cols-2">
        <article className="glass rounded-2xl p-6">
          <h3 className="section-label">Social Hosts</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            One host per line. Websites matching these are classified as &ldquo;social&rdquo;.
          </p>
          <textarea
            className="glass-input mt-3 w-full font-mono text-xs"
            aria-label="Social hosts"
            rows={8}
            value={socialText}
            onChange={(e) => setSocialText(e.target.value)}
          />
        </article>

        <article className="glass rounded-2xl p-6">
          <h3 className="section-label">Basic Site Hosts</h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            One host per line. Websites matching these are classified as &ldquo;basic&rdquo;.
          </p>
          <textarea
            className="glass-input mt-3 w-full font-mono text-xs"
            aria-label="Basic site hosts"
            rows={8}
            value={basicText}
            onChange={(e) => setBasicText(e.target.value)}
          />
        </article>
      </section>

      {/* Compliance */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Compliance</h3>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          This app uses official Google Places API (New) endpoints only. No scraping of Google pages or review text.
        </p>
      </section>

      {/* Save */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-primary" onClick={handleSave}>
          Save Settings
        </button>
        <HelpTip>Persists scoring, host list, API, and AI settings shown on this page.</HelpTip>
        <button type="button" className="btn-glass" onClick={async () => {
          const result = await recomputeAllScoresAction();
          setSaveMsg(`Recomputed scores for ${result.count} leads`);
          setTimeout(() => setSaveMsg(null), 3000);
        }}>
          Recompute All Scores
        </button>
        <HelpTip>Re-runs lead scoring using the current settings; it does not crawl new leads.</HelpTip>
        <button type="button" className="btn-glass" onClick={async () => {
          const result = await backfillCanonicalPlacesAction();
          if (result.success) {
            setSaveMsg(`Backfilled ${result.count} canonical places`);
          } else {
            setSaveMsg("Error backfilling canonical places");
          }
          setTimeout(() => setSaveMsg(null), 3000);
        }}>
          Backfill Canonical Places
        </button>
        <HelpTip>Fills missing canonical Google Place IDs from cached/place data where possible.</HelpTip>
        {saveMsg && (
          <span className="text-sm" style={{
            color: saveMsg.includes("Error") || saveMsg.includes("Invalid") ? "#991b1b" : "#166534"
          }}>
            {saveMsg}
          </span>
        )}
      </div>
    </PageShell>
  );
}

function NumberField({ label, value, onChange, step }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <input
        type="number"
        className="glass-input w-full"
        aria-label={label}
        value={value}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function TextField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </label>
      <input
        type="text"
        className="glass-input w-full"
        aria-label={label}
        value={value}
        readOnly
        aria-readonly="true"
      />
    </div>
  );
}

function SchedulerToggle({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm"
      style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-secondary)" }}
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="rounded"
      />
    </label>
  );
}
