"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { getScoreBandStyle, resolveScoreBand, type ScoreBandThresholds } from "@/lib/score-bands";
import { getBusinessTypeLabel } from "@/lib/business-types";
import {
  updateLeadStatusAction,
  updateLeadNotesAction,
  updateLeadReminderAction,
  excludeLeadAction,
  restoreExcludedLeadAction,
  logOutreachEventAction,
  markLeadRepliedAction,
  markMeetingBookedAction,
  generateOutreachPackageAction,
  createDemoForLeadAction,
  updateLeadVerificationAction,
  runAiVerificationAction,
  applyAiRecommendationAction,
  repairLeadAiWebsiteViabilityAction,
} from "@/lib/leads/actions";

interface Lead {
  id: string;
  place_id: string;
  name: string | null;
  address: string | null;
  phone: string | null;
  categories: string[];
  rating: number | null;
  review_count: number | null;
  website_uri: string | null;
  website_status: string;
  maps_uri: string | null;
  business_status: string | null;
  price_level: string | null;
  photo_count: number;
  has_opening_hours: boolean;
  primary_type: string | null;
  score: number;
  status: string;
  is_excluded: boolean;
  exclusion_reason: string | null;
  excluded_at: string | null;
  selling_niche: string | null;
  business_type: string;
  win_probability_score: number;
  ai_verification_status: string;
  ai_confidence: number;
  ai_found_website_url: string | null;
  ai_recommendation: string | null;
  ai_summary: string | null;
  ai_checked_at: string | null;
  ai_website_viability_status: string | null;
  ai_website_health: Record<string, unknown> | null;
  qualification_status: string;
  disqualification_reason: string | null;
  website_verified_at: string | null;
  contactability_score: number;
  estimated_deal_value: number;
  notes: string | null;
  reminder_date: string | null;
  enrichment_status: string;
  enriched_at: string | null;
  review_highlights: string[] | null;
  editorial_summary: string | null;
  website_health: Record<string, unknown> | null;
  website_checked_at: string | null;
  verification: Record<string, boolean>;
  discovered_at: string;
  first_contacted_at: string | null;
  first_reply_at: string | null;
  meeting_booked_at: string | null;
  last_contacted_at: string | null;
}

interface DensityResult {
  count: number;
  label: string;
}

interface OutreachEvent {
  id: string;
  lead_id: string;
  channel: string;
  note: string | null;
  created_at: string;
}

interface OutreachPackage {
  opener: string;
  websiteIssue: string;
  valueProps: string[];
  callToAction: string;
  fullMessage: string;
}

interface Demo {
  id: string;
  slug: string;
  is_published: boolean;
}

interface AiVerification {
  id: string;
  lead_id: string;
  model: string;
  status: string;
  confidence: number;
  found_website_url: string | null;
  found_email: string | null;
  found_phone: string | null;
  social_profiles: string[];
  sources: Array<{ url: string; title: string | null; evidence: string }>;
  recommendation: string;
  reason: string;
  summary: string;
  website_viability_status: string | null;
  website_health_json: Record<string, unknown> | null;
  website_viability_reason: string | null;
  estimated_cost: number;
  error: string | null;
  created_at: string;
}

const STATUS_OPTIONS = ["new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost"];
const CHANNEL_OPTIONS = ["call", "text", "email", "walkin", "other"];
type AiApplyAction = "update_website" | "exclude_has_website" | "mark_broken_site_opportunity" | "mark_manual_review";

const channelBadgeStyle = (ch: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    call: { bg: "rgba(34,197,94,0.1)", color: "#16a34a" },
    text: { bg: "rgba(99,102,241,0.1)", color: "#6366f1" },
    email: { bg: "rgba(14,165,233,0.1)", color: "#0284c7" },
    walkin: { bg: "rgba(245,158,11,0.1)", color: "#d97706" },
    other: { bg: "rgba(0,0,0,0.05)", color: "var(--text-secondary)" },
  };
  const c = colors[ch] ?? colors.other;
  return { background: c.bg, color: c.color, padding: "2px 8px", borderRadius: "6px", fontSize: "0.7rem", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em" };
};

interface ScoreBreakdown {
  base: number;
  nicheWeight: number;
  websiteMultiplier: number;
  photoBonus: number;
  hoursBonus: number;
  opportunityBonus: number;
  healthBonus: number;
  densityBonus: number;
  final: number;
}

export function LeadDetailClient({
  lead,
  initialEvents,
  initialDemo,
  initialAiVerification,
  scoreBreakdown,
  density,
  scoreThresholds,
}: {
  lead: Lead;
  initialEvents: OutreachEvent[];
  initialDemo: Demo | null;
  initialAiVerification: AiVerification | null;
  scoreBreakdown?: ScoreBreakdown;
  density?: DensityResult;
  scoreThresholds: ScoreBandThresholds;
}) {
  const router = useRouter();
  const scoreBand = resolveScoreBand(lead.score, scoreThresholds);
  const scoreBandStyle = getScoreBandStyle(scoreBand.key);
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [reminder, setReminder] = useState(lead.reminder_date ?? "");
  const [isExcluded, setIsExcluded] = useState(lead.is_excluded);
  const [excludedAt, setExcludedAt] = useState(lead.excluded_at);
  const [exclusionReason, setExclusionReason] = useState(lead.exclusion_reason ?? "");
  const [exclusionLoading, setExclusionLoading] = useState(false);
  const [events, setEvents] = useState(initialEvents);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [firstReply, setFirstReply] = useState(lead.first_reply_at);
  const [meetingBooked, setMeetingBooked] = useState(lead.meeting_booked_at);
  const [demo, setDemo] = useState<Demo | null>(initialDemo);
  const [demoLoading, setDemoLoading] = useState(false);
  const [aiVerification, setAiVerification] = useState<AiVerification | null>(initialAiVerification);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiApplying, setAiApplying] = useState<string | null>(null);

  // Log event form
  const [eventChannel, setEventChannel] = useState("call");
  const [eventNote, setEventNote] = useState("");
  const [logging, setLogging] = useState(false);

  // Outreach package
  const [outreachPkg, setOutreachPkg] = useState<OutreachPackage | null>(null);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [showPkg, setShowPkg] = useState(false);

  const [verification, setVerification] = useState<Record<string, boolean>>(lead.verification ?? {});

  const flash = (msg: string) => {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const handleStatusChange = async (s: string) => {
    setStatus(s);
    await updateLeadStatusAction(lead.id, s);
    flash("Status updated");
  };

  const handleSaveNotes = async () => {
    await updateLeadNotesAction(lead.id, notes);
    flash("Notes saved");
  };

  const handleSaveReminder = async () => {
    await updateLeadReminderAction(lead.id, reminder || null);
    flash("Reminder saved");
  };

  const handleExcludeLead = async () => {
    setExclusionLoading(true);
    try {
      const trimmedReason = exclusionReason.trim();
      const result = await excludeLeadAction(lead.id, trimmedReason);
      if ("error" in result) {
        flash(result.error ?? "Unable to exclude lead");
        return;
      }
      const now = new Date().toISOString();
      setIsExcluded(true);
      setExcludedAt(now);
      setExclusionReason(trimmedReason);
      router.refresh();
      flash("Lead excluded from scoring");
    } catch {
      flash("Unable to exclude lead");
    } finally {
      setExclusionLoading(false);
    }
  };

  const handleRestoreLead = async () => {
    setExclusionLoading(true);
    try {
      const result = await restoreExcludedLeadAction(lead.id);
      if ("error" in result) {
        flash(result.error ?? "Unable to restore lead");
        return;
      }
      setIsExcluded(false);
      setExcludedAt(null);
      setExclusionReason("");
      router.refresh();
      flash("Lead restored to active scoring");
    } catch {
      flash("Unable to restore lead");
    } finally {
      setExclusionLoading(false);
    }
  };

  const handleLogEvent = async () => {
    setLogging(true);
    const result = await logOutreachEventAction(lead.id, eventChannel, eventNote);
    if ("event" in result && result.event) {
      setEvents((prev) => [result.event as OutreachEvent, ...prev]);
      setEventNote("");
      flash("Outreach logged");
    }
    setLogging(false);
  };

  const handleMarkReplied = async () => {
    const result = await markLeadRepliedAction(lead.id);
    if ("success" in result) {
      setFirstReply(new Date().toISOString());
      flash("Marked as replied");
    }
  };

  const handleMarkMeeting = async () => {
    const result = await markMeetingBookedAction(lead.id);
    if ("success" in result) {
      setMeetingBooked(new Date().toISOString());
      setStatus("meeting_set");
      flash("Meeting booked");
    }
  };

  const handleGeneratePackage = async () => {
    setPkgLoading(true);
    const result = await generateOutreachPackageAction(lead.id);
    if ("fullMessage" in result) {
      setOutreachPkg(result as OutreachPackage);
      setShowPkg(true);
    }
    setPkgLoading(false);
  };

  const handleCreateDemo = async () => {
    setDemoLoading(true);
    const result = await createDemoForLeadAction(lead.id);
    if ("demo" in result && result.demo) {
      setDemo(result.demo as Demo);
      flash("Demo created");
    } else if ("error" in result) {
      flash(result.error ?? "Unable to create demo");
    }
    setDemoLoading(false);
  };

  const handleRunAiVerification = async (force = false) => {
    setAiLoading(true);
    try {
      const result = await runAiVerificationAction(lead.id, { force });
      if ("verification" in result && result.verification) {
        setAiVerification(result.verification as AiVerification);
        flash(result.cached ? "AI verification loaded from cache" : "AI verification complete");
        router.refresh();
      } else if ("error" in result) {
        flash(result.error ?? "AI verification failed");
      }
    } catch {
      flash("AI verification failed");
    } finally {
      setAiLoading(false);
    }
  };

  const handleRepairAiViability = async () => {
    setAiLoading(true);
    try {
      const result = await repairLeadAiWebsiteViabilityAction(lead.id);
      if ("verification" in result && result.verification) {
        setAiVerification(result.verification as AiVerification);
        flash("Website viability re-checked");
        router.refresh();
      } else if ("error" in result) {
        flash(result.error ?? "Unable to re-check website viability");
      }
    } catch {
      flash("Unable to re-check website viability");
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAi = async (action: AiApplyAction) => {
    if (!aiVerification) return;
    setAiApplying(action);
    try {
      const result = await applyAiRecommendationAction(aiVerification.id, action);
      if ("error" in result) {
        flash(result.error ?? "Unable to apply AI recommendation");
      } else {
        flash("AI recommendation applied");
        router.refresh();
      }
    } catch {
      flash("Unable to apply AI recommendation");
    } finally {
      setAiApplying(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    flash("Copied to clipboard");
  };

  const foundAiWebsite = aiVerification?.found_website_url ?? lead.ai_found_website_url;
  const currentViability = aiVerification?.website_viability_status ?? lead.ai_website_viability_status;
  const currentHealth = aiVerification?.website_health_json ?? lead.ai_website_health;
  const currentViabilityReason = aiVerification?.website_viability_reason;
  const hasUsableAiWebsite = (aiVerification?.status ?? lead.ai_verification_status) === "site_found" && currentViability === "usable";
  const hasBrokenSiteOpportunity = currentViability === "broken" || currentViability === "parked" || currentViability === "placeholder";

  return (
    <PageShell
      title={lead.name ?? "Unknown Business"}
      description={lead.address ?? "No address available"}
      stats={[
        { label: "Score", value: `${lead.score.toFixed(1)} (${scoreBand.label})` },
        { label: "Rating", value: lead.rating?.toFixed(1) ?? "—" },
        { label: "Reviews", value: String(lead.review_count ?? 0) },
        { label: "Website", value: lead.website_status },
        { label: "Win Prob.", value: `${Math.round(lead.win_probability_score)}%` },
        { label: "Qualification", value: lead.qualification_status.replace(/_/g, " ") },
      ]}
    >
      {/* Back link and notifications */}
      <div className="flex items-center justify-between">
        <Link href="/leads" className="link-accent text-sm">&larr; Back to leads</Link>
        <div className="flex items-center gap-2">
          {isExcluded && (
            <span
              className="rounded-md border px-2 py-0.5 text-xs font-semibold"
              style={{ background: "rgba(107,114,128,0.12)", borderColor: "rgba(107,114,128,0.24)", color: "#4b5563" }}
              title={exclusionReason || "Excluded from scoring and queue"}
            >
              Excluded
            </span>
          )}
          <ScoreBandBadge score={lead.score} thresholds={scoreThresholds} />
          {saveMsg && (
            <span className="rounded-lg px-3 py-1 text-xs font-medium"
              style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a" }}>
              {saveMsg}
            </span>
          )}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-3">
        {/* Business profile */}
        <article className="glass rounded-2xl p-6 lg:col-span-2">
          <h3 className="section-label">Business Profile</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ProfileField label="Name" value={lead.name} />
            <ProfileField label="Phone" value={lead.phone} action={lead.phone ? { label: "Copy", onClick: () => copyToClipboard(lead.phone!) } : undefined} />
            <ProfileField label="Address" value={lead.address} />
            <ProfileField label="Categories" value={lead.categories.join(", ") || "—"} />
            <ProfileField label="Business Type" value={getBusinessTypeLabel(lead.business_type)} />
            <ProfileField label="Win Probability" value={`${Math.round(lead.win_probability_score)}%`} />
            <ProfileField label="Selling Niche" value={lead.selling_niche?.replace(/_/g, " ")} />
            <ProfileField label="Estimated Deal" value={lead.estimated_deal_value ? `$${lead.estimated_deal_value.toFixed(0)}` : "N/A"} />
            <ProfileField label="Contactability" value={`${Math.round(lead.contactability_score * 100)}%`} />
            <ProfileField label="Business Status" value={lead.business_status} />
            <ProfileField label="Price Level" value={lead.price_level} />
            <ProfileField label="Website" value={lead.website_uri ?? "None"} link={lead.website_uri ?? undefined} />
            <ProfileField label="Google Maps" value={lead.maps_uri ? "Open in Maps" : "—"} link={lead.maps_uri ?? undefined} />
          </div>
        </article>

        {/* AI verification */}
        <article className="glass rounded-2xl p-6 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="section-label">AI Verification</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Uses the locked gpt-5.4-mini verifier with budget limits and manual apply.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary text-xs" disabled={aiLoading} onClick={() => handleRunAiVerification(false)}>
                {aiLoading ? "Checking..." : aiVerification ? "Run AI Verify" : "Run AI Verify"}
              </button>
              <button type="button" className="btn-glass text-xs" disabled={aiLoading} onClick={() => handleRunAiVerification(true)}>
                Refresh
              </button>
              <button type="button" className="btn-glass text-xs" disabled={aiLoading || !foundAiWebsite} onClick={handleRepairAiViability}>
                Re-check Website Viability
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Status</span>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {aiVerification?.status?.replace(/_/g, " ") ?? lead.ai_verification_status.replace(/_/g, " ")}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Confidence: {Math.round((aiVerification?.confidence ?? lead.ai_confidence) * 100)}%
              </p>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Found Website</span>
              {foundAiWebsite ? (
                <a className="link-accent mt-1 block truncate text-sm" href={foundAiWebsite} target="_blank" rel="noopener noreferrer">
                  {foundAiWebsite}
                </a>
              ) : (
                <p className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>None found</p>
              )}
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Recommendation</span>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {(aiVerification?.recommendation ?? lead.ai_recommendation ?? "manual_review").replace(/_/g, " ")}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                {aiVerification?.created_at ? new Date(aiVerification.created_at).toLocaleString() : lead.ai_checked_at ? new Date(lead.ai_checked_at).toLocaleString() : "Not checked yet"}
              </p>
            </div>
            <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Website Viability</span>
              <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {formatViabilityLabel(currentViability)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                {formatHealthSummary(currentHealth)}
              </p>
            </div>
          </div>

          {(currentHealth || currentViabilityReason) && (
            <div className="mt-4 rounded-xl p-4 text-sm" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-primary)" }}>
              <div className="grid gap-2 sm:grid-cols-4">
                <HealthMeta label="HTTP" value={String(currentHealth?.statusCode ?? "N/A")} />
                <HealthMeta label="Final URL" value={String(currentHealth?.finalUrl ?? foundAiWebsite ?? "N/A")} link={String(currentHealth?.finalUrl ?? foundAiWebsite ?? "") || undefined} />
                <HealthMeta label="Title" value={String(currentHealth?.title ?? "N/A")} />
                <HealthMeta label="Reason" value={currentViabilityReason ?? String(currentHealth?.classifierSignals ?? "N/A")} />
              </div>
            </div>
          )}

          {(aiVerification?.summary || lead.ai_summary) && (
            <p className="mt-4 rounded-xl p-4 text-sm leading-relaxed" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-primary)" }}>
              {aiVerification?.summary ?? lead.ai_summary}
            </p>
          )}

          {aiVerification && aiVerification.sources.length > 0 && (
            <div className="mt-4">
              <h4 className="section-label">Sources</h4>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                {aiVerification.sources.map((source) => (
                  <a key={`${source.url}-${source.evidence}`} className="rounded-xl px-4 py-3 text-sm hover:opacity-80" href={source.url} target="_blank" rel="noopener noreferrer" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-primary)" }}>
                    <span className="block truncate font-medium">{source.title ?? source.url}</span>
                    <span className="mt-1 block text-xs" style={{ color: "var(--text-tertiary)" }}>{source.evidence}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {aiVerification && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-glass text-xs"
                disabled={aiApplying !== null || !aiVerification.found_website_url || !hasUsableAiWebsite}
                onClick={() => handleApplyAi("update_website")}
              >
                {aiApplying === "update_website" ? "Applying..." : "Apply Usable Website"}
              </button>
              <button
                type="button"
                className="btn-glass text-xs"
                disabled={aiApplying !== null || !hasUsableAiWebsite}
                onClick={() => handleApplyAi("exclude_has_website")}
              >
                {aiApplying === "exclude_has_website" ? "Excluding..." : "Exclude as Has Website"}
              </button>
              <button
                type="button"
                className="btn-glass text-xs"
                disabled={aiApplying !== null || !hasBrokenSiteOpportunity}
                onClick={() => handleApplyAi("mark_broken_site_opportunity")}
              >
                {aiApplying === "mark_broken_site_opportunity" ? "Marking..." : "Mark Broken Site Opportunity"}
              </button>
              <button
                type="button"
                className="btn-glass text-xs"
                disabled={aiApplying !== null}
                onClick={() => handleApplyAi("mark_manual_review")}
              >
                {aiApplying === "mark_manual_review" ? "Marking..." : "Mark Manual Review"}
              </button>
            </div>
          )}
        </article>

        {/* Status, reminder, and quick actions */}
        <article className="glass rounded-2xl p-6">
          <h3 className="section-label">Status</h3>
          <select className="glass-select mt-3 w-full" value={status} onChange={(e) => handleStatusChange(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>

          <h3 className="section-label mt-5">Reminder</h3>
          <div className="mt-2 flex gap-2">
            <input type="date" className="glass-input flex-1 text-xs" value={reminder} onChange={(e) => setReminder(e.target.value)} />
            <button type="button" className="btn-glass text-xs" onClick={handleSaveReminder}>Set</button>
          </div>

          {/* Quick actions */}
          <div className="mt-5 flex flex-col gap-2">
            {!firstReply && lead.first_contacted_at && (
              <button type="button" className="btn-glass w-full text-xs" onClick={handleMarkReplied}>
                Mark Replied
              </button>
            )}
            {!meetingBooked && (
              <button type="button" className="btn-glass w-full text-xs" onClick={handleMarkMeeting}>
                Mark Meeting Booked
              </button>
            )}
            <button type="button" className="btn-primary w-full text-xs" onClick={handleGeneratePackage} disabled={pkgLoading}>
              {pkgLoading ? "Generating..." : "Generate Outreach"}
            </button>
            <button type="button" className="btn-glass w-full text-xs" onClick={handleCreateDemo} disabled={demoLoading}>
              {demoLoading ? "Creating..." : demo ? "Refresh Demo Link" : "Create Demo"}
            </button>
          </div>

          {demo && (
            <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(99,102,241,0.08)", color: "var(--text-secondary)" }}>
              <span className="block font-medium" style={{ color: "var(--text-primary)" }}>Demo URL</span>
              <a className="link-accent break-all" href={`/demo/${demo.slug}`} target="_blank" rel="noopener noreferrer">
                /demo/{demo.slug}
              </a>
            </div>
          )}

          {/* Verification checklist */}
          <VerificationChecklist
            verification={verification}
            onChange={async (key, value) => {
              const updated = { ...verification, [key]: value };
              setVerification(updated);
              const result = await updateLeadVerificationAction(lead.id, key, value);
              if ("error" in result) {
                setVerification(verification);
                flash(result.error ?? "Error");
              }
            }}
          />

          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="section-label">Lead Exclusion</h3>
              {isExcluded && (
                <span className="text-xs font-medium" style={{ color: "#4b5563" }}>
                  Excluded
                </span>
              )}
            </div>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Excluded leads stay visible for audit, but are ignored by qualified counts, queue, enrichment ranking, and score bands.
            </p>
            <textarea
              className="glass-input w-full text-xs"
              rows={3}
              placeholder="Reason for exclusion (for example: already has a real website)"
              value={exclusionReason}
              onChange={(e) => setExclusionReason(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-glass text-xs"
                disabled={exclusionLoading || isExcluded || exclusionReason.trim().length < 5}
                onClick={handleExcludeLead}
              >
                {exclusionLoading && !isExcluded ? "Excluding..." : "Exclude Lead"}
              </button>
              <button
                type="button"
                className="btn-glass text-xs"
                disabled={exclusionLoading || !isExcluded}
                onClick={handleRestoreLead}
              >
                {exclusionLoading && isExcluded ? "Restoring..." : "Restore Lead"}
              </button>
            </div>
            {isExcluded && (
              <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(107,114,128,0.08)", color: "#4b5563" }}>
                <span>Excluded on: {excludedAt ? new Date(excludedAt).toLocaleString() : "—"}</span>
                {exclusionReason && <span className="ml-2">Reason: {exclusionReason}</span>}
              </div>
            )}
          </div>

          {/* Score breakdown */}
          {scoreBreakdown && (
            <div className="mt-5 space-y-1.5">
              <h3 className="section-label">Score Breakdown</h3>
              <ScoreRow label="Base (log reviews x rating)" value={scoreBreakdown.base} />
              <ScoreRow label="Niche Weight" value={`${scoreBreakdown.nicheWeight}x`} />
              <ScoreRow label="Website Multiplier" value={`${scoreBreakdown.websiteMultiplier}x`} />
              {scoreBreakdown.photoBonus > 0 && <ScoreRow label="Photo Opportunity" value={`+${scoreBreakdown.photoBonus}`} />}
              {scoreBreakdown.hoursBonus > 0 && <ScoreRow label="Hours Bonus" value={`+${scoreBreakdown.hoursBonus}`} />}
              {scoreBreakdown.opportunityBonus > 0 && <ScoreRow label="Opportunity Signal" value={`+${scoreBreakdown.opportunityBonus}`} accent />}
              {scoreBreakdown.healthBonus > 0 && <ScoreRow label="Website Health" value={`+${scoreBreakdown.healthBonus}`} accent />}
              {scoreBreakdown.densityBonus > 0 && <ScoreRow label="Competitive Density" value={`+${scoreBreakdown.densityBonus}`} />}
              <div className="flex items-center justify-between text-xs font-semibold">
                <span style={{ color: "var(--text-primary)" }}>{`Final Score (${scoreBand.label})`}</span>
                <span style={{ color: scoreBandStyle.color }}>{scoreBreakdown.final}</span>
              </div>
            </div>
          )}

          {/* Competitive density */}
          {density && density.count > 0 && (
            <div className="mt-5">
              <h3 className="section-label">Market Density</h3>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="rounded-lg px-2 py-1 text-xs font-medium" style={{
                  background: density.label === "Very High" ? "rgba(239,68,68,0.1)" : density.label === "High" ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
                  color: density.label === "Very High" ? "#dc2626" : density.label === "High" ? "#d97706" : "#16a34a",
                }}>{density.label}</span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{density.count} similar businesses nearby</span>
              </div>
            </div>
          )}

          {/* Conversion timestamps */}
          <div className="mt-5 space-y-1.5">
            <h3 className="section-label">Timeline</h3>
            <TimestampRow label="Discovered" value={lead.discovered_at} />
            <TimestampRow label="First Contact" value={lead.first_contacted_at} />
            <TimestampRow label="First Reply" value={firstReply} />
            <TimestampRow label="Meeting Booked" value={meetingBooked} />
            <TimestampRow label="Last Contacted" value={lead.last_contacted_at} />
          </div>
        </article>
      </section>

      {/* Enrichment data */}
      {lead.enrichment_status === "enriched" && (
        <section className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h3 className="section-label">Enrichment Data</h3>
            <span className="rounded-lg px-2.5 py-1 text-xs font-medium" style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a" }}>Enriched</span>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Photos</span>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>{lead.photo_count} photos</p>
            </div>
            <div>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Opening Hours</span>
              <p className="text-sm" style={{ color: "var(--text-primary)" }}>{lead.has_opening_hours ? "Listed" : "Not listed"}</p>
            </div>
            {lead.primary_type && (
              <div>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Primary Type</span>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>{lead.primary_type.replace(/_/g, " ")}</p>
              </div>
            )}
            {lead.editorial_summary && (
              <div className="sm:col-span-2">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Editorial Summary</span>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{lead.editorial_summary}</p>
              </div>
            )}
          </div>

          {lead.review_highlights && lead.review_highlights.length > 0 && (
            <div className="mt-4">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Review Insights</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {lead.review_highlights.map((h) => (
                  <span key={h} className="rounded-lg px-2 py-1 text-xs" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>{h}</span>
                ))}
              </div>
            </div>
          )}

          {lead.website_health && (
            <div className="mt-4">
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Website Health</span>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-4">
                <HealthBadge label="Status" value={String((lead.website_health as Record<string, unknown>).statusCode ?? "N/A")} good={typeof (lead.website_health as Record<string, unknown>).statusCode === "number" && ((lead.website_health as Record<string, unknown>).statusCode as number) < 400} />
                <HealthBadge label="SSL" value={(lead.website_health as Record<string, unknown>).ssl ? "Yes" : "No"} good={!!(lead.website_health as Record<string, unknown>).ssl} />
                <HealthBadge label="Speed" value={`${(lead.website_health as Record<string, unknown>).responseMs ?? "?"}ms`} good={typeof (lead.website_health as Record<string, unknown>).responseMs === "number" && ((lead.website_health as Record<string, unknown>).responseMs as number) < 3000} />
                <HealthBadge label="Healthy" value={(lead.website_health as Record<string, unknown>).healthy ? "Yes" : "No"} good={!!(lead.website_health as Record<string, unknown>).healthy} />
              </div>
            </div>
          )}
        </section>
      )}

      {/* Outreach package */}
      {showPkg && outreachPkg && (
        <section className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h3 className="section-label">Outreach Package</h3>
            <div className="flex gap-2">
              <button type="button" className="btn-glass text-xs" onClick={() => copyToClipboard(outreachPkg.fullMessage)}>
                Copy All
              </button>
              <button type="button" className="btn-glass text-xs" onClick={() => setShowPkg(false)}>
                Close
              </button>
            </div>
          </div>
          <div className="mt-4 whitespace-pre-wrap rounded-xl p-4 text-sm leading-relaxed"
            style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-primary)" }}>
            {outreachPkg.fullMessage}
          </div>
        </section>
      )}

      {/* Log outreach event */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Log Outreach</h3>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--text-tertiary)" }}>Channel</label>
            <select className="glass-select" value={eventChannel} onChange={(e) => setEventChannel(e.target.value)}>
              {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs" style={{ color: "var(--text-tertiary)" }}>Note</label>
            <input type="text" className="glass-input w-full" placeholder="What happened?" value={eventNote} onChange={(e) => setEventNote(e.target.value)} />
          </div>
          <button type="button" className="btn-primary text-xs" onClick={handleLogEvent} disabled={logging}>
            Log
          </button>
        </div>
      </section>

      {/* Outreach timeline */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Outreach History ({events.length})</h3>
        {events.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--text-tertiary)" }}>No outreach events yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 rounded-xl px-4 py-3"
                style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
                <span style={channelBadgeStyle(ev.channel)}>{ev.channel}</span>
                <div className="flex-1">
                  <p className="text-sm" style={{ color: "var(--text-primary)" }}>{ev.note || "No note"}</p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {formatRelativeTime(ev.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notes */}
      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Notes</h3>
        <textarea className="glass-input mt-3 w-full" rows={4} placeholder="Add notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="button" className="btn-primary mt-3 text-sm" onClick={handleSaveNotes}>Save Notes</button>
      </section>
    </PageShell>
  );
}

function ProfileField({ label, value, link, action }: {
  label: string; value: string | null | undefined; link?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        {link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="link-accent text-sm truncate">{value ?? "—"}</a>
        ) : (
          <span className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{value ?? "—"}</span>
        )}
        {action && (
          <button type="button" onClick={action.onClick} className="text-xs shrink-0" style={{ color: "var(--accent)" }}>{action.label}</button>
        )}
      </div>
    </div>
  );
}

function TimestampRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ color: value ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
        {value ? new Date(value).toLocaleDateString() : "—"}
      </span>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ScoreRow({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span style={{ color: accent ? "var(--accent)" : "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}

function HealthBadge({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-lg px-3 py-2 text-center" style={{
      background: good ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
      border: `1px solid ${good ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)"}`,
    }}>
      <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: good ? "#16a34a" : "#dc2626" }}>{value}</span>
    </div>
  );
}

function HealthMeta({ label, value, link }: { label: string; value: string; link?: string }) {
  const display = value || "N/A";
  return (
    <div className="min-w-0">
      <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      {link ? (
        <a className="link-accent block truncate text-xs" href={link} target="_blank" rel="noopener noreferrer">{display}</a>
      ) : (
        <span className="block truncate text-xs" style={{ color: "var(--text-secondary)" }}>{display}</span>
      )}
    </div>
  );
}

function formatViabilityLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ");
}

function formatHealthSummary(health: Record<string, unknown> | null | undefined): string {
  if (!health) return "No viability check yet";
  const statusCode = typeof health.statusCode === "number" ? health.statusCode : null;
  const responseMs = typeof health.responseMs === "number" ? health.responseMs : null;
  const signals = Array.isArray(health.matchedSignals) ? health.matchedSignals.length : 0;
  const parts = [
    statusCode != null ? `HTTP ${statusCode}` : null,
    responseMs != null ? `${responseMs}ms` : null,
    `${signals} business signals`,
  ].filter(Boolean);
  return parts.join(" | ");
}

const VERIFICATION_ITEMS: Array<{ key: string; label: string }> = [
  { key: "phone_works", label: "Phone number verified" },
  { key: "no_real_website", label: "No real website confirmed" },
  { key: "address_verified", label: "Address confirmed" },
  { key: "business_active", label: "Business is active" },
  { key: "ready_for_outreach", label: "Ready for outreach" },
];

function VerificationChecklist({
  verification,
  onChange,
}: {
  verification: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
}) {
  const checked = VERIFICATION_ITEMS.filter((item) => verification[item.key]).length;
  const total = VERIFICATION_ITEMS.length;
  const allDone = checked === total;

  return (
    <div className="mt-5 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="section-label">Verification</h3>
        <span className="text-xs font-medium" style={{
          color: allDone ? "#16a34a" : "var(--text-tertiary)",
        }}>
          {allDone ? "Verified" : `${checked}/${total}`}
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.06)" }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${(checked / total) * 100}%`,
            background: allDone ? "#16a34a" : "var(--accent)",
          }}
        />
      </div>

      <div className="space-y-1">
        {VERIFICATION_ITEMS.map((item) => (
          <label
            key={item.key}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-white/20"
          >
            <input
              type="checkbox"
              checked={!!verification[item.key]}
              onChange={(e) => onChange(item.key, e.target.checked)}
              className="rounded"
            />
            <span style={{ color: verification[item.key] ? "var(--text-primary)" : "var(--text-secondary)" }}>
              {item.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
