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
  addLeadNoteAction,
  claimLeadAction,
  unclaimLeadAction,
  markLeadQualityBucketAction,
  updateLeadPhoneVerificationStatusAction,
  queueLeadAiArtifactAction,
  queueLeadPitchPackAction,
  updateLeadAiFeedbackAction,
} from "@/lib/leads/actions";
import type { AppRole } from "@/lib/permissions";

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
  lead_quality_score: number;
  quality_bucket: string;
  easy_build_score: number;
  cash_speed_score: number;
  need_score: number;
  quality_reason: string | null;
  recommended_offer: string;
  next_best_action: string | null;
  phone_verification_status: string;
  ai_verification_status: string;
  ai_confidence: number;
  ai_found_website_url: string | null;
  ai_recommendation: string | null;
  ai_summary: string | null;
  ai_checked_at: string | null;
  ai_website_viability_status: string | null;
  ai_website_health: Record<string, unknown> | null;
  ai_queue_status: string;
  raw_opportunity_score: number;
  verification_score: number;
  sales_priority_score: number;
  pitch_outcome: string | null;
  objection_reason: string | null;
  decision_maker_reached: boolean;
  quoted_amount: number;
  close_value: number;
  demo_sent_at: string | null;
  ai_website_feedback_status: string | null;
  ai_corrected_website_url: string | null;
  ai_false_positive_reason: string | null;
  ai_reviewer_notes: string | null;
  ai_feedback_at: string | null;
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
  assigned_to_user_id: string | null;
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

interface LeadNote {
  id: string;
  lead_id: string;
  author_user_id: string;
  author_email: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface LeadAiArtifact {
  id: string;
  lead_id: string;
  artifact_type: "business_detail" | "competitive_report";
  status: "queued" | "running" | "complete" | "error";
  model: string;
  input_hash: string;
  prompt_version: string;
  content_json: Record<string, unknown>;
  sources_json: Array<{ url: string; title: string | null; evidence: string }>;
  confidence: number;
  usage_input_tokens: number;
  usage_output_tokens: number;
  estimated_cost: number;
  error: string | null;
  created_at: string;
  updated_at: string;
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
  initialLeadNotes,
  initialDemo,
  initialAiVerification,
  initialAiArtifacts,
  scoreBreakdown,
  density,
  scoreThresholds,
  currentUser,
}: {
  lead: Lead;
  initialEvents: OutreachEvent[];
  initialLeadNotes: LeadNote[];
  initialDemo: Demo | null;
  initialAiVerification: AiVerification | null;
  initialAiArtifacts: LeadAiArtifact[];
  scoreBreakdown?: ScoreBreakdown;
  density?: DensityResult;
  scoreThresholds: ScoreBandThresholds;
  currentUser: { userId: string; email: string; role: AppRole };
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
  const [artifactLoading, setArtifactLoading] = useState<string | null>(null);
  const [leadNotes, setLeadNotes] = useState<LeadNote[]>(initialLeadNotes);
  const [leadNoteBody, setLeadNoteBody] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [assignedToUserId, setAssignedToUserId] = useState(lead.assigned_to_user_id);
  const [qualityBucket, setQualityBucket] = useState(lead.quality_bucket);
  const [phoneVerificationStatus, setPhoneVerificationStatus] = useState(lead.phone_verification_status);
  const [aiFeedbackStatus, setAiFeedbackStatus] = useState(lead.ai_website_feedback_status ?? "uncertain");
  const [aiCorrectedWebsiteUrl, setAiCorrectedWebsiteUrl] = useState(lead.ai_corrected_website_url ?? "");
  const [aiFalsePositiveReason, setAiFalsePositiveReason] = useState(lead.ai_false_positive_reason ?? "");
  const [aiReviewerNotes, setAiReviewerNotes] = useState(lead.ai_reviewer_notes ?? "");
  const [aiFeedbackLoading, setAiFeedbackLoading] = useState(false);

  // Log event form
  const [eventChannel, setEventChannel] = useState("call");
  const [eventNote, setEventNote] = useState("");
  const [logging, setLogging] = useState(false);

  // Outreach package
  const [outreachPkg, setOutreachPkg] = useState<OutreachPackage | null>(null);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [showPkg, setShowPkg] = useState(false);

  const [verification, setVerification] = useState<Record<string, boolean>>(lead.verification ?? {});
  const isAdmin = currentUser.role === "admin";

  const flash = (msg: string) => {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const handleStatusChange = async (s: string) => {
    if (!isAdmin && (s === "closed_won" || s === "closed_lost")) {
      flash("Only admins can close leads");
      return;
    }
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
    if (!isAdmin) {
      flash("Only admins can exclude leads");
      return;
    }
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
    if (!isAdmin) {
      flash("Only admins can restore leads");
      return;
    }
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

  const handleQueueArtifact = async (artifactType: "business_detail" | "competitive_report", force = false) => {
    setArtifactLoading(artifactType);
    try {
      const result = await queueLeadAiArtifactAction(lead.id, artifactType, { force });
      if ("error" in result) {
        flash(result.error ?? "Unable to queue lead intelligence");
        return;
      }
      flash(result.status === "queued" && result.skippedExisting ? "Lead intelligence already queued or ready" : "Lead intelligence queued");
      await processArtifactQueue(artifactType);
    } finally {
      setArtifactLoading(null);
    }
  };

  const handleGeneratePitchPack = async (force = false) => {
    setArtifactLoading("pitch_pack");
    try {
      const result = await queueLeadPitchPackAction(lead.id, { force });
      const hasError = "error" in result.businessDetail || "error" in result.competitiveReport;
      if (hasError) {
        flash("One or more pitch pack artifacts could not be queued");
        return;
      }
      flash("Pitch pack queued");
      await processArtifactQueue("pitch_pack");
    } finally {
      setArtifactLoading(null);
    }
  };

  const handleSaveAiFeedback = async () => {
    setAiFeedbackLoading(true);
    const result = await updateLeadAiFeedbackAction(lead.id, {
      status: aiFeedbackStatus,
      correctedWebsiteUrl: aiCorrectedWebsiteUrl,
      falsePositiveReason: aiFalsePositiveReason,
      reviewerNotes: aiReviewerNotes,
    });
    if ("error" in result) {
      flash(result.error ?? "Unable to save AI feedback");
    } else {
      flash("AI feedback saved");
      router.refresh();
    }
    setAiFeedbackLoading(false);
  };

  const processArtifactQueue = async (artifactType: string) => {
    for (let i = 0; i < 8; i++) {
      const response = await fetch("/api/ai/artifacts/process-next", { method: "POST" });
      const result = await response.json();
      if (result.status === "complete") {
        flash(`${formatArtifactType(result.artifactType)} ready`);
        router.refresh();
        if (artifactType !== "pitch_pack" && result.leadId === lead.id && result.artifactType === artifactType) {
          break;
        }
        continue;
      } else if (result.status === "idle") {
        router.refresh();
        break;
      } else if (result.status === "budget_limit" || result.status === "error") {
        flash(result.error ?? "Lead intelligence generation failed");
        router.refresh();
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
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
    if (!isAdmin && (action === "update_website" || action === "exclude_has_website")) {
      flash("Only admins can apply usable website exclusions");
      return;
    }
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

  const handleAddLeadNote = async () => {
    setNoteLoading(true);
    try {
      const result = await addLeadNoteAction(lead.id, leadNoteBody);
      if ("note" in result && result.note) {
        setLeadNotes((current) => [result.note as LeadNote, ...current]);
        setLeadNoteBody("");
        flash("Note added");
      } else if ("error" in result) {
        flash(result.error ?? "Unable to add note");
      }
    } finally {
      setNoteLoading(false);
    }
  };

  const handleClaimToggle = async () => {
    const result = assignedToUserId === currentUser.userId
      ? await unclaimLeadAction(lead.id)
      : await claimLeadAction(lead.id);
    if ("error" in result) {
      flash(result.error ?? "Unable to update assignment");
      return;
    }
    setAssignedToUserId(assignedToUserId === currentUser.userId ? null : currentUser.userId);
    flash(assignedToUserId === currentUser.userId ? "Lead unclaimed" : "Lead claimed");
  };

  const handlePhoneVerificationStatus = async (nextStatus: string) => {
    const previous = phoneVerificationStatus;
    setPhoneVerificationStatus(nextStatus);
    const result = await updateLeadPhoneVerificationStatusAction(lead.id, nextStatus);
    if ("error" in result) {
      setPhoneVerificationStatus(previous);
      flash(result.error ?? "Unable to update phone status");
      return;
    }
    flash("Phone status updated");
    router.refresh();
  };

  const handleQualityBucket = async (nextBucket: string) => {
    const previous = qualityBucket;
    setQualityBucket(nextBucket);
    const result = await markLeadQualityBucketAction(lead.id, nextBucket);
    if ("error" in result) {
      setQualityBucket(previous);
      flash(result.error ?? "Unable to update quality bucket");
      return;
    }
    flash("Quality bucket updated");
    router.refresh();
  };

  const foundAiWebsite = aiVerification?.found_website_url ?? lead.ai_found_website_url;
  const currentViability = aiVerification?.website_viability_status ?? lead.ai_website_viability_status;
  const currentHealth = aiVerification?.website_health_json ?? lead.ai_website_health;
  const currentViabilityReason = aiVerification?.website_viability_reason;
  const hasUsableAiWebsite = (aiVerification?.status ?? lead.ai_verification_status) === "site_found" && currentViability === "usable";
  const hasBrokenSiteOpportunity = currentViability === "broken" || currentViability === "parked" || currentViability === "placeholder";
  const assignedLabel = assignedToUserId === currentUser.userId ? "Assigned to you" : assignedToUserId ? "Assigned" : "Unassigned";
  const websiteFinding = websiteFindingLabel(aiVerification?.status ?? lead.ai_verification_status, currentViability);
  const demoHref = demo ? `/demo/${demo.slug}` : null;
  const businessDetailArtifact = latestCompleteArtifact(initialAiArtifacts, "business_detail");
  const businessDetailJob = latestArtifact(initialAiArtifacts, "business_detail");
  const competitiveReportArtifact = latestCompleteArtifact(initialAiArtifacts, "competitive_report");
  const competitiveReportJob = latestArtifact(initialAiArtifacts, "competitive_report");

  const copyDemoPitch = () => {
    if (!demoHref) return;
    const demoUrl = `${window.location.origin}${demoHref}`;
    copyToClipboard([
      `${lead.name ?? "This business"} looks like a verified website opportunity.`,
      `Finding: ${websiteFinding}.`,
      `Offer: ${formatLabel(lead.recommended_offer)}.`,
      `Demo: ${demoUrl}`,
      lead.next_best_action ? `Next action: ${lead.next_best_action}` : null,
    ].filter(Boolean).join("\n"));
  };

  return (
    <PageShell
      title={lead.name ?? "Unknown Business"}
      description={lead.address ?? "No address available"}
      stats={[
        { label: "Score", value: `${lead.score.toFixed(1)} (${scoreBand.label})` },
        { label: "Rating", value: lead.rating?.toFixed(1) ?? "—" },
        { label: "Reviews", value: String(lead.review_count ?? 0) },
        { label: "Website", value: lead.website_status },
        { label: "Quality", value: `${Math.round(lead.lead_quality_score)}%` },
        { label: "Win Prob.", value: `${Math.round(lead.win_probability_score)}%` },
        { label: "Qualification", value: lead.qualification_status.replace(/_/g, " ") },
      ]}
    >
      {/* Back link and notifications */}
      <div className="flex items-center justify-between">
        <Link href="/leads" className="link-accent text-sm">&larr; Back to leads</Link>
        <div className="flex items-center gap-2">
          <span
            className="rounded-md border px-2 py-0.5 text-xs font-semibold capitalize"
            style={{ background: "rgba(99,102,241,0.08)", borderColor: "rgba(99,102,241,0.18)", color: "#6366f1" }}
          >
            {currentUser.role}
          </span>
          <button type="button" className="btn-glass text-xs" onClick={handleClaimToggle}>
            {assignedToUserId === currentUser.userId ? "Unclaim" : assignedLabel === "Unassigned" ? "Claim" : assignedLabel}
          </button>
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

      <section className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="section-label">Call Sheet</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Verification evidence, offer, demo, and next action for the pitch.
            </p>
          </div>
          {demoHref && (
            <button type="button" className="btn-glass text-xs" onClick={copyDemoPitch}>
              Copy Demo Link + Pitch
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CallSheetField label="Website finding" value={websiteFinding} />
          <CallSheetField label="Confidence" value={`${Math.round((aiVerification?.confidence ?? lead.ai_confidence) * 100)}%`} />
          <CallSheetField label="Phone" value={`${lead.phone ?? "No phone"} (${formatLabel(phoneVerificationStatus)})`} />
          <CallSheetField label="Offer" value={formatLabel(lead.recommended_offer)} />
          <CallSheetField label="Pitch angle" value={lead.quality_reason ?? "Use the verified website gap and local review volume."} />
          <CallSheetField label="Next action" value={lead.next_best_action ?? "Call and qualify owner interest."} />
          <CallSheetField label="Last contact" value={lead.last_contacted_at ? new Date(lead.last_contacted_at).toLocaleDateString() : "Not contacted"} />
          <CallSheetField label="Follow-up" value={lead.reminder_date ? new Date(lead.reminder_date).toLocaleDateString() : "No reminder"} />
          <CallSheetField label="Demo" value={demoHref ?? "No demo yet"} href={demoHref ?? undefined} />
          <CallSheetField label="AI queue" value={formatLabel(lead.ai_queue_status)} />
          <CallSheetField label="Sales priority" value={`${Math.round(lead.sales_priority_score)}%`} />
          <CallSheetField label="Verification score" value={`${Math.round(lead.verification_score)}%`} />
        </div>
      </section>

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
            <ProfileField label="Quality Score" value={`${Math.round(lead.lead_quality_score)}%`} />
            <ProfileField label="Quality Bucket" value={formatLabel(qualityBucket)} />
            <ProfileField label="Recommended Offer" value={formatLabel(lead.recommended_offer)} />
            <ProfileField label="Selling Niche" value={lead.selling_niche?.replace(/_/g, " ")} />
            <ProfileField label="Estimated Deal" value={lead.estimated_deal_value ? `$${lead.estimated_deal_value.toFixed(0)}` : "N/A"} />
            <ProfileField label="Contactability" value={`${Math.round(lead.contactability_score * 100)}%`} />
            <ProfileField label="Business Status" value={lead.business_status} />
            <ProfileField label="Price Level" value={lead.price_level} />
            <ProfileField label="Website" value={lead.website_uri ?? "None"} link={lead.website_uri ?? undefined} />
            <ProfileField label="Google Maps" value={lead.maps_uri ? "Open in Maps" : "—"} link={lead.maps_uri ?? undefined} />
          </div>
        </article>

        {/* Quality decision */}
        <article className="glass rounded-2xl p-6 lg:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="section-label">Quality Decision</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Website-sales decisioning for whether this is worth a call today.
              </p>
            </div>
            <Link href={`/quality?search=${encodeURIComponent(lead.name ?? "")}`} className="btn-glass text-xs">
              Open in Quality
            </Link>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <QualityMetric label="Bucket" value={formatLabel(qualityBucket)} />
            <QualityMetric label="Quality Score" value={`${Math.round(lead.lead_quality_score)}%`} />
            <QualityMetric label="Need" value={`${Math.round(lead.need_score)}%`} />
            <QualityMetric label="Easy Build" value={`${Math.round(lead.easy_build_score)}%`} />
            <QualityMetric label="Cash Speed" value={`${Math.round(lead.cash_speed_score)}%`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Why this is good or bad</span>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {lead.quality_reason ?? "No quality reason has been calculated yet."}
              </p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Next best action</span>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
                {lead.next_best_action ?? "Run AI verification or manually review the website evidence."}
              </p>
            </div>
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Recommended package</span>
              <p className="mt-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {formatLabel(lead.recommended_offer)}
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Pitch a simple one-time build first. Keep the offer easy to understand and fast to deliver.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-glass text-xs" onClick={() => handlePhoneVerificationStatus("works")}>
              Phone Works
            </button>
            <button type="button" className="btn-glass text-xs" onClick={() => handlePhoneVerificationStatus("bad")}>
              Phone Bad
            </button>
            <button type="button" className="btn-glass text-xs" onClick={() => handleQualityBucket("ready_to_call")}>
              Mark Ready to Call
            </button>
            <button type="button" className="btn-glass text-xs" onClick={() => handleQualityBucket("broken_site_opportunity")}>
              Mark Broken-Site Opportunity
            </button>
            <button type="button" className="btn-glass text-xs" onClick={() => handleQualityBucket("needs_manual_review")}>
              Mark Manual Review
            </button>
            <span className="rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
              Phone: {formatLabel(phoneVerificationStatus)}
            </span>
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
              {isAdmin && (
                <>
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
                </>
              )}
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

          <div className="mt-4 rounded-xl p-4" style={{ background: "rgba(255,255,255,0.32)", border: "1px solid rgba(255,255,255,0.42)" }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="section-label">AI Accuracy Feedback</h4>
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Mark wrong website findings here so scoring and manual review stay honest.
                </p>
              </div>
              {lead.ai_feedback_at && (
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Last reviewed {new Date(lead.ai_feedback_at).toLocaleString()}
                </span>
              )}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Feedback
                <select className="glass-input mt-1 w-full" value={aiFeedbackStatus} onChange={(e) => setAiFeedbackStatus(e.target.value)}>
                  <option value="correct">Correct</option>
                  <option value="incorrect">Incorrect</option>
                  <option value="uncertain">Uncertain</option>
                </select>
              </label>
              <label className="text-xs lg:col-span-1" style={{ color: "var(--text-secondary)" }}>
                Correct Website URL
                <input className="glass-input mt-1 w-full" value={aiCorrectedWebsiteUrl} onChange={(e) => setAiCorrectedWebsiteUrl(e.target.value)} placeholder="https://..." />
              </label>
              <label className="text-xs lg:col-span-2" style={{ color: "var(--text-secondary)" }}>
                False Positive / Notes
                <input className="glass-input mt-1 w-full" value={aiFalsePositiveReason} onChange={(e) => setAiFalsePositiveReason(e.target.value)} placeholder="Wrong business, directory only, parked page..." />
              </label>
            </div>
            <textarea
              className="glass-input mt-3 min-h-20 w-full"
              value={aiReviewerNotes}
              onChange={(e) => setAiReviewerNotes(e.target.value)}
              placeholder="Reviewer notes for future scoring/pitch decisions"
            />
            <div className="mt-3 flex justify-end">
              <button type="button" className="btn-glass text-xs" disabled={aiFeedbackLoading} onClick={handleSaveAiFeedback}>
                {aiFeedbackLoading ? "Saving..." : "Save AI Feedback"}
              </button>
            </div>
          </div>
        </article>

        {/* Lead intelligence */}
        <article className="glass rounded-2xl p-6 lg:col-span-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="section-label">Lead Intelligence</h3>
              <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                Manual gpt-5.4-mini briefs for website generation and the sales pitch.
              </p>
            </div>
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={artifactLoading !== null}
              onClick={() => handleGeneratePitchPack(false)}
            >
              {artifactLoading === "pitch_pack" ? "Generating..." : "Generate Pitch Pack"}
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <ArtifactPanel
              title="Business Detail"
              description="Website build brief and copy-ready prompt."
              artifact={businessDetailArtifact}
              latestJob={businessDetailJob}
              loading={artifactLoading === "business_detail" || artifactLoading === "pitch_pack"}
              generateLabel="Generate Brief"
              regenerateLabel="Regenerate Brief"
              onGenerate={() => handleQueueArtifact("business_detail", false)}
              onRegenerate={() => handleQueueArtifact("business_detail", true)}
              onCopy={() => copyToClipboard(String(businessDetailArtifact?.content_json.website_generation_prompt ?? ""))}
            >
              {businessDetailArtifact ? (
                <BusinessDetailView artifact={businessDetailArtifact} />
              ) : (
                <EmptyArtifactState label={artifactStateLabel(businessDetailJob)} />
              )}
            </ArtifactPanel>

            <ArtifactPanel
              title="Competitive Report"
              description="Competitor snapshot, upside estimate, and pitch points."
              artifact={competitiveReportArtifact}
              latestJob={competitiveReportJob}
              loading={artifactLoading === "competitive_report" || artifactLoading === "pitch_pack"}
              generateLabel="Generate Report"
              regenerateLabel="Regenerate Report"
              onGenerate={() => handleQueueArtifact("competitive_report", false)}
              onRegenerate={() => handleQueueArtifact("competitive_report", true)}
              onCopy={() => copyToClipboard(buildPitchBriefText(competitiveReportArtifact))}
            >
              {competitiveReportArtifact ? (
                <CompetitiveReportView artifact={competitiveReportArtifact} />
              ) : (
                <EmptyArtifactState label={artifactStateLabel(competitiveReportJob)} />
              )}
            </ArtifactPanel>
          </div>
        </article>

        {/* Status, reminder, and quick actions */}
        <article className="glass rounded-2xl p-6">
          <h3 className="section-label">Status</h3>
          <select className="glass-select mt-3 w-full" value={status} onChange={(e) => handleStatusChange(e.target.value)}>
            {STATUS_OPTIONS.filter((s) => isAdmin || (s !== "closed_won" && s !== "closed_lost")).map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
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

          {isAdmin && (
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
          )}

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

      <section className="glass rounded-2xl p-6">
        <h3 className="section-label">Team Notes</h3>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <textarea
            className="glass-input min-h-24 flex-1"
            placeholder="Add a research note..."
            value={leadNoteBody}
            onChange={(event) => setLeadNoteBody(event.target.value)}
          />
          <button type="button" className="btn-primary self-start text-sm" disabled={noteLoading || !leadNoteBody.trim()} onClick={handleAddLeadNote}>
            Add Note
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {leadNotes.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>No team notes yet.</p>
          ) : leadNotes.map((note) => (
            <article key={note.id} className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{note.author_email ?? "Unknown user"}</span>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{formatRelativeTime(note.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm" style={{ color: "var(--text-secondary)" }}>{note.body}</p>
            </article>
          ))}
        </div>
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

function QualityMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function CallSheetField({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      {href ? (
        <Link href={href} target="_blank" className="link-accent mt-1 block truncate text-sm">{value}</Link>
      ) : (
        <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--text-primary)" }}>{value}</p>
      )}
    </div>
  );
}

function ArtifactPanel({
  title,
  description,
  artifact,
  latestJob,
  loading,
  generateLabel,
  regenerateLabel,
  onGenerate,
  onRegenerate,
  onCopy,
  children,
}: {
  title: string;
  description: string;
  artifact: LeadAiArtifact | null;
  latestJob: LeadAiArtifact | null;
  loading: boolean;
  generateLabel: string;
  regenerateLabel: string;
  onGenerate: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  children: React.ReactNode;
}) {
  const isReady = !!artifact;
  return (
    <section className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h4>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{description}</p>
          <span className="mt-2 inline-flex rounded-md px-2 py-1 text-xs font-medium" style={artifactBadgeStyle(latestJob, isReady)}>
            {artifactStateLabel(latestJob, isReady)}
          </span>
          {artifact && (
            <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
              {Math.round(artifact.confidence * 100)}% confidence • {artifact.sources_json.length} sources • {new Date(artifact.created_at).toLocaleString()}
            </p>
          )}
          {artifact && latestJob && latestJob.id !== artifact.id && (
            <p className="mt-1 text-xs" style={{ color: "#b45309" }}>Regenerate recommended: newer evidence is queued or errored.</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-glass text-xs" disabled={loading} onClick={isReady ? onRegenerate : onGenerate}>
            {loading ? "Generating..." : isReady ? regenerateLabel : generateLabel}
          </button>
          <button type="button" className="btn-glass text-xs" disabled={!isReady || loading} onClick={onCopy}>
            Copy
          </button>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BusinessDetailView({ artifact }: { artifact: LeadAiArtifact }) {
  const content = artifact.content_json;
  const services = stringArray(content.services);
  const trustSignals = stringArray(content.trust_signals);
  const sections = arrayOfRecords(content.content_sections);
  return (
    <div className="space-y-4 text-sm" style={{ color: "var(--text-primary)" }}>
      <p className="leading-relaxed">{String(content.business_summary ?? "No summary generated.")}</p>
      <ArtifactList title="Services" items={services} />
      <ArtifactList title="Trust Signals" items={trustSignals} />
      {sections.length > 0 && (
        <div>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Website Sections</span>
          <div className="mt-2 space-y-2">
            {sections.slice(0, 5).map((section, index) => (
              <div key={`${String(section.title)}-${index}`} className="rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.35)" }}>
                <p className="font-medium">{String(section.title ?? "Section")}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>{String(section.goal ?? "")}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Website Prompt</span>
        <p className="mt-1 line-clamp-6 whitespace-pre-wrap rounded-lg px-3 py-2 text-xs leading-relaxed" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-secondary)" }}>
          {String(content.website_generation_prompt ?? "No prompt generated.")}
        </p>
      </div>
      <ArtifactSources sources={artifact.sources_json} />
    </div>
  );
}

function CompetitiveReportView({ artifact }: { artifact: LeadAiArtifact }) {
  const content = artifact.content_json;
  const revenue = toRecord(content.monthly_revenue_upside_range);
  return (
    <div className="space-y-4 text-sm" style={{ color: "var(--text-primary)" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <QualityMetric label="Similar Businesses" value={String(content.competitor_count ?? 0)} />
        <QualityMetric label="Monthly Upside" value={`${formatCurrencyNumber(revenue.low)}-${formatCurrencyNumber(revenue.high)}`} />
      </div>
      <p className="leading-relaxed">{String(content.opportunity_angle ?? "No opportunity angle generated.")}</p>
      <ArtifactList title="Pitch Bullets" items={stringArray(content.pitch_bullets)} />
      <ArtifactList title="Objection Handling" items={stringArray(content.objection_handling)} />
      <ArtifactList title="Assumptions" items={stringArray(content.assumptions)} />
      <ArtifactSources sources={artifact.sources_json} />
    </div>
  );
}

function EmptyArtifactState({ label }: { label: string }) {
  return (
    <div className="rounded-xl px-4 py-6 text-center text-sm" style={{ background: "rgba(255,255,255,0.28)", color: "var(--text-tertiary)" }}>
      {label}
    </div>
  );
}

function ArtifactList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{title}</span>
      <ul className="mt-1 space-y-1">
        {items.slice(0, 8).map((item) => (
          <li key={item} className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArtifactSources({ sources }: { sources: LeadAiArtifact["sources_json"] }) {
  if (sources.length === 0) return null;
  return (
    <div>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Sources</span>
      <div className="mt-2 grid gap-2">
        {sources.slice(0, 4).map((source) => (
          <a
            key={`${source.url}-${source.evidence}`}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-3 py-2 text-xs hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-secondary)" }}
          >
            <span className="block truncate font-medium" style={{ color: "var(--text-primary)" }}>{source.title ?? source.url}</span>
            <span className="mt-1 block">{source.evidence}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function websiteFindingLabel(status: string, viability: string | null | undefined): string {
  if (status === "no_site_found" || viability === "directory_only") return "Verified no usable website";
  if (status === "weak_site_found") return `Weak site: ${viability ?? "unknown"}`;
  if (status === "site_found" && viability === "usable") return "Usable existing website";
  if (status === "uncertain" || status === "mismatch") return "Needs manual review";
  return formatLabel(status);
}

function formatLabel(value: string | null | undefined): string {
  return value ? value.replace(/_/g, " ") : "N/A";
}

function latestArtifact(artifacts: LeadAiArtifact[], artifactType: LeadAiArtifact["artifact_type"]): LeadAiArtifact | null {
  return artifacts.find((artifact) => artifact.artifact_type === artifactType) ?? null;
}

function latestCompleteArtifact(artifacts: LeadAiArtifact[], artifactType: LeadAiArtifact["artifact_type"]): LeadAiArtifact | null {
  return artifacts.find((artifact) => artifact.artifact_type === artifactType && artifact.status === "complete") ?? null;
}

function artifactStateLabel(artifact: LeadAiArtifact | null, hasComplete = false): string {
  if (artifact?.status === "queued" || artifact?.status === "running") return "Generating";
  if (hasComplete || artifact?.status === "complete") return "Ready";
  if (artifact?.status === "error") return "Error";
  return "Missing";
}

function artifactBadgeStyle(artifact: LeadAiArtifact | null, hasComplete: boolean): React.CSSProperties {
  const label = artifactStateLabel(artifact, hasComplete);
  if (label === "Ready") return { background: "rgba(34,197,94,0.1)", color: "#16a34a" };
  if (label === "Generating") return { background: "rgba(99,102,241,0.1)", color: "#6366f1" };
  if (label === "Error") return { background: "rgba(239,68,68,0.1)", color: "#dc2626" };
  return { background: "rgba(107,114,128,0.1)", color: "#4b5563" };
}

function buildPitchBriefText(artifact: LeadAiArtifact | null): string {
  if (!artifact) return "";
  const content = artifact.content_json;
  const revenue = toRecord(content.monthly_revenue_upside_range);
  return [
    `Opportunity: ${String(content.opportunity_angle ?? "")}`,
    `Conservative monthly upside: ${formatCurrencyNumber(revenue.low)}-${formatCurrencyNumber(revenue.high)}`,
    "Pitch bullets:",
    ...stringArray(content.pitch_bullets).map((item) => `- ${item}`),
    "Objection handling:",
    ...stringArray(content.objection_handling).map((item) => `- ${item}`),
  ].join("\n");
}

function formatArtifactType(value: string | null | undefined): string {
  if (value === "business_detail") return "Business detail";
  if (value === "competitive_report") return "Competitive report";
  return "Lead intelligence";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function arrayOfRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null && !Array.isArray(item))
    : [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function formatCurrencyNumber(value: unknown): string {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "$0";
  return `$${Math.round(numeric).toLocaleString()}`;
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
