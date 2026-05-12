"use client";

import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import {
  backfillCanonicalPlacesAction,
  clearGooglePlacesApiKeyAction,
  clearOpenAiApiKeyAction,
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
  max_calls_per_day: number;
  max_calls_per_run: number;
  max_monthly_api_spend: number;
  stop_on_budget_limit: boolean;
  search_radius_km: number;
  enrichment_enabled: boolean;
  max_enrichment_per_run: number;
  website_health_enabled: boolean;
  cache_ttl_days: number;
  enrichment_stage_b_min_score: number;
  max_atmosphere_enrichment_per_run: number;
  cost_engine_v2_enabled: boolean;
  ai_enabled: boolean;
  ai_model: string;
  ai_daily_budget_usd: number;
  ai_monthly_budget_usd: number;
  ai_batch_limit: number;
  ai_cache_ttl_days: number;
  ai_manual_apply_required: boolean;
  openai_api_key_configured: boolean;
  openai_api_key_source: "ui" | "env" | "none";
  google_places_api_key_configured: boolean;
  google_places_api_key_source: "ui" | "env" | "none";
}

export function SettingsClient({ initialSettings }: { initialSettings: Settings }) {
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [googleKeyInput, setGoogleKeyInput] = useState("");
  const [googleKeyLoading, setGoogleKeyLoading] = useState(false);
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
      let nicheWeights: Record<string, number>;
      try {
        nicheWeights = JSON.parse(nicheText);
      } catch {
        setSaveMsg("Invalid JSON in niche weights");
        return;
      }

      const socialHosts = socialText.split("\n").map((s) => s.trim()).filter(Boolean);
      const basicHosts = basicText.split("\n").map((s) => s.trim()).filter(Boolean);

      const updated: Settings = {
        ...settings,
        niche_weights: nicheWeights,
        social_hosts: socialHosts,
        basic_hosts: basicHosts,
      };

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
      setSettings(result.settings as Settings);
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
      setSettings(result.settings as Settings);
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
      setSettings(result.settings as Settings);
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
      setSettings(result.settings as Settings);
      setGoogleKeyInput("");
      setSaveMsg(result.settings.google_places_api_key_configured ? "UI Google key cleared; env key is still configured" : "Google Places API key cleared");
    } else {
      setSaveMsg("Error clearing Google Places key");
    }
    setGoogleKeyLoading(false);
    setTimeout(() => setSaveMsg(null), 3000);
  };

  return (
    <PageShell title="Settings" description="Configure lead scoring, classification hosts, and budget guardrails.">
      {/* Rate Limiting & Budget */}
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
            <span className="rounded-md px-2 py-1" style={{ background: settings.google_places_api_key_configured ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: settings.google_places_api_key_configured ? "#16a34a" : "#dc2626" }}>
              {settings.google_places_api_key_configured ? `Configured via ${settings.google_places_api_key_source}` : "No Google Places key configured"}
            </span>
            <span>Used for crawling, enrichment, and Places billing.</span>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="Rate Limit (ms)" value={settings.rate_limit_ms} onChange={(v) => update("rate_limit_ms", v)} />
          <NumberField label="Max Calls / Day" value={settings.max_calls_per_day} onChange={(v) => update("max_calls_per_day", v)} />
          <NumberField label="Max Calls / Run" value={settings.max_calls_per_run} onChange={(v) => update("max_calls_per_run", v)} />
          <NumberField label="Max Monthly Spend ($)" value={settings.max_monthly_api_spend} onChange={(v) => update("max_monthly_api_spend", v)} step={1} />
        </div>
        <div className="mt-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.stop_on_budget_limit}
              onChange={(e) => update("stop_on_budget_limit", e.target.checked)}
              className="rounded"
            />
            Stop run when budget limit is hit
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={settings.cost_engine_v2_enabled}
              onChange={(e) => update("cost_engine_v2_enabled", e.target.checked)}
              className="rounded"
            />
            Enable pricing-accurate cost engine v2
          </label>
        </div>
      </section>

      {/* Search & Enrichment */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Search & Enrichment</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <NumberField label="Search Radius (km)" value={settings.search_radius_km} onChange={(v) => update("search_radius_km", v)} step={0.5} />
          <NumberField label="Max Enrichments / Run" value={settings.max_enrichment_per_run} onChange={(v) => update("max_enrichment_per_run", v)} />
          <NumberField label="Cache TTL (days)" value={settings.cache_ttl_days} onChange={(v) => update("cache_ttl_days", v)} />
          <NumberField label="Stage-B Min Score" value={settings.enrichment_stage_b_min_score} onChange={(v) => update("enrichment_stage_b_min_score", v)} step={0.1} />
          <NumberField
            label="Max Atmosphere / Run"
            value={settings.max_atmosphere_enrichment_per_run}
            onChange={(v) => update("max_atmosphere_enrichment_per_run", v)}
          />
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
            <span className="rounded-md px-2 py-1" style={{ background: settings.openai_api_key_configured ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: settings.openai_api_key_configured ? "#16a34a" : "#dc2626" }}>
              {settings.openai_api_key_configured ? `Configured via ${settings.openai_api_key_source}` : "No OpenAI key configured"}
            </span>
            <span>The key is encrypted server-side and never shown again.</span>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <TextField label="Locked Model" value={settings.ai_model} />
          <NumberField label="Daily AI Budget ($)" value={settings.ai_daily_budget_usd} onChange={(v) => update("ai_daily_budget_usd", v)} step={0.25} />
          <NumberField label="Monthly AI Budget ($)" value={settings.ai_monthly_budget_usd} onChange={(v) => update("ai_monthly_budget_usd", v)} step={1} />
          <NumberField label="AI Batch Limit" value={settings.ai_batch_limit} onChange={(v) => update("ai_batch_limit", v)} />
          <NumberField label="AI Result Cache (days)" value={settings.ai_cache_ttl_days} onChange={(v) => update("ai_cache_ttl_days", v)} />
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
        <button type="button" className="btn-glass" onClick={async () => {
          const result = await recomputeAllScoresAction();
          setSaveMsg(`Recomputed scores for ${result.count} leads`);
          setTimeout(() => setSaveMsg(null), 3000);
        }}>
          Recompute All Scores
        </button>
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
        {saveMsg && (
          <span className="text-sm" style={{
            color: saveMsg.includes("Error") || saveMsg.includes("Invalid") ? "#dc2626" : "#16a34a"
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
        value={value}
        readOnly
        aria-readonly="true"
      />
    </div>
  );
}
