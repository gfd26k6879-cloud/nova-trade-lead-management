"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AiVerificationBadge } from "@/components/ai-verification-badge";
import { PageShell } from "@/components/page-shell";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { createAdminRequestAction } from "@/lib/admin-requests/actions";
import { getScoreBandStyle, resolveScoreBand, type ScoreBandThresholds } from "@/lib/score-bands";
import { getBusinessTypeLabel } from "@/lib/business-types";
import { getAiVerificationDisplay } from "@/lib/ai-verification-display";
import {
  updateLeadStatusAction,
  updateLeadNotesAction,
  updateLeadReminderAction,
  excludeLeadAction,
  restoreExcludedLeadAction,
  archiveLeadAction,
  restoreArchivedLeadAction,
  logOutreachEventAction,
  manualWebsiteCorrectionAction,
  markLeadRepliedAction,
  markMeetingBookedAction,
  generateOutreachPackageAction,
  createDemoForLeadAction,
  updateLeadVerificationAction,
  runAiVerificationAction,
  applyAiRecommendationAction,
  repairLeadAiWebsiteViabilityAction,
  addLeadNoteAction,
  saveLeadWorkUpdateAction,
  claimLeadAction,
  unclaimLeadAction,
  updateLeadFactsAction,
  markLeadQualityBucketAction,
  updateLeadPhoneVerificationStatusAction,
  queueLeadAiArtifactAction,
  queueLeadPitchPackAction,
  updateLeadAiFeedbackAction,
} from "@/lib/leads/actions";
import type { AppRole } from "@/lib/permissions";
import type { AdminRequestType } from "@/lib/db/queries";

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
  archived_at: string | null;
  archived_by_user_id: string | null;
  archive_reason: string | null;
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
  assigned_user_email: string | null;
  assigned_user_display_name: string | null;
}

interface DensityResult {
  count: number;
  label: string;
}

interface OutreachEvent {
  id: string;
  lead_id: string;
  channel: string;
  actor_email: string | null;
  contact_person_name: string | null;
  contact_person_role: string | null;
  decision_maker_reached: boolean;
  outcome: string;
  objection_reason: string | null;
  quoted_amount: number;
  close_value: number;
  follow_up_at: string | null;
  next_step: string | null;
  note: string | null;
  created_at: string;
}

interface AdminRequest {
  id: string;
  request_type: AdminRequestType;
  status: string;
  priority: string;
  summary: string | null;
  contact_person_name: string | null;
  budget_hint: string | null;
  due_at: string | null;
  next_step: string | null;
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
const OUTCOME_OPTIONS = ["not_reached", "left_voicemail", "contacted", "decision_maker_reached", "demo_sent", "meeting_set", "follow_up_needed", "not_interested", "quoted", "closed_won", "closed_lost"];
type AiApplyAction = "update_website" | "exclude_has_website" | "mark_broken_site_opportunity" | "mark_manual_review";
type WebsiteCorrectionResolution = "official_website_found" | "weak_or_basic_site" | "social_or_directory_only" | "remove_website";
type WorkUpdateAction = "research_note" | "called" | "left_voicemail" | "follow_up" | "not_interested" | "done";
type LeadDetailTab = "work" | "overview" | "verification" | "intelligence" | "admin";
type ActivityTimelineItem = {
  id: string;
  kind: "outreach" | "note";
  createdAt: string;
  title: string;
  body: string;
  meta?: string;
  channel?: string;
};
type CallOutcomePreset = {
  key: string;
  label: string;
  channel: string;
  outcome: string;
  note: string;
  nextStep: string;
  decisionMakerReached: boolean;
};

const LEAD_DETAIL_TABS: Array<{ key: LeadDetailTab; label: string }> = [
  { key: "work", label: "Work" },
  { key: "overview", label: "Overview" },
  { key: "verification", label: "Verification" },
  { key: "intelligence", label: "Intelligence" },
  { key: "admin", label: "Admin" },
];
const CALL_OUTCOME_PRESETS: CallOutcomePreset[] = [
  {
    key: "no_answer",
    label: "No answer",
    channel: "call",
    outcome: "not_reached",
    note: "No answer. Try once more later before marking the phone bad.",
    nextStep: "Call again later today or tomorrow.",
    decisionMakerReached: false,
  },
  {
    key: "spoke_to_owner",
    label: "Spoke to owner",
    channel: "call",
    outcome: "decision_maker_reached",
    note: "Spoke with the owner. Confirmed they are the decision maker and introduced the website gap.",
    nextStep: "Send a preview or quote if they showed interest.",
    decisionMakerReached: true,
  },
  {
    key: "send_preview",
    label: "Send preview",
    channel: "text",
    outcome: "demo_sent",
    note: "Sent preview/demo link and asked for a good time to review it.",
    nextStep: "Follow up after they review the preview.",
    decisionMakerReached: true,
  },
];
const WEBSITE_CORRECTION_OPTIONS: Array<{ value: WebsiteCorrectionResolution; label: string; help: string }> = [
  { value: "official_website_found", label: "Official website found", help: "Remove from no-site sales queues but keep the directory record." },
  { value: "weak_or_basic_site", label: "Weak/basic site", help: "Keep as a website-improvement opportunity." },
  { value: "social_or_directory_only", label: "Social/directory only", help: "Keep as a no-site style opportunity with evidence attached." },
  { value: "remove_website", label: "Remove website", help: "Clear an incorrect website URL from the record." },
];
const WORK_UPDATE_OPTIONS: Array<{ value: WorkUpdateAction; label: string }> = [
  { value: "research_note", label: "Research note" },
  { value: "called", label: "Called" },
  { value: "left_voicemail", label: "Left voicemail" },
  { value: "follow_up", label: "Follow up" },
  { value: "not_interested", label: "Not interested" },
  { value: "done", label: "Done" },
];

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
  initialAdminRequests,
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
  initialAdminRequests: AdminRequest[];
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
  const [activeTab, setActiveTab] = useState<LeadDetailTab>("work");
  const [showAiSources, setShowAiSources] = useState(false);
  const [status, setStatus] = useState(lead.status);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [reminder, setReminder] = useState(lead.reminder_date ?? "");
  const [isExcluded, setIsExcluded] = useState(lead.is_excluded);
  const [excludedAt, setExcludedAt] = useState(lead.excluded_at);
  const [exclusionReason, setExclusionReason] = useState(lead.exclusion_reason ?? "");
  const [exclusionLoading, setExclusionLoading] = useState(false);
  const [archivedAt, setArchivedAt] = useState(lead.archived_at);
  const [archiveReason, setArchiveReason] = useState(lead.archive_reason ?? "");
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [pendingArchiveReason, setPendingArchiveReason] = useState("");
  const [events, setEvents] = useState(initialEvents);
  const [adminRequests, setAdminRequests] = useState(initialAdminRequests);
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
  const [websiteCorrectionUrl, setWebsiteCorrectionUrl] = useState(lead.ai_corrected_website_url ?? lead.website_uri ?? "");
  const [websiteCorrectionResolution, setWebsiteCorrectionResolution] = useState<WebsiteCorrectionResolution>("official_website_found");
  const [websiteCorrectionNotes, setWebsiteCorrectionNotes] = useState("");
  const [websiteCorrectionLoading, setWebsiteCorrectionLoading] = useState(false);
  const [factName, setFactName] = useState(lead.name ?? "");
  const [factPhone, setFactPhone] = useState(lead.phone ?? "");
  const [factAddress, setFactAddress] = useState(lead.address ?? "");
  const [factWebsiteUrl, setFactWebsiteUrl] = useState(lead.website_uri ?? "");
  const [factBusinessType, setFactBusinessType] = useState(lead.business_type ?? "");
  const [factPrimaryType, setFactPrimaryType] = useState(lead.primary_type ?? "");
  const [factStatus, setFactStatus] = useState(lead.status);
  const [factNotes, setFactNotes] = useState(lead.notes ?? "");
  const [factsLoading, setFactsLoading] = useState(false);
  const [workAction, setWorkAction] = useState<WorkUpdateAction>("research_note");
  const [workNote, setWorkNote] = useState("");
  const [workFollowUpAt, setWorkFollowUpAt] = useState("");
  const [workNextStep, setWorkNextStep] = useState("");
  const [workLoading, setWorkLoading] = useState(false);

  // Log event form
  const [eventChannel, setEventChannel] = useState("call");
  const [eventNote, setEventNote] = useState("");
  const [contactPersonName, setContactPersonName] = useState("");
  const [contactPersonRole, setContactPersonRole] = useState("");
  const [decisionMakerReached, setDecisionMakerReached] = useState(false);
  const [eventOutcome, setEventOutcome] = useState("contacted");
  const [objectionReason, setObjectionReason] = useState("");
  const [quotedAmount, setQuotedAmount] = useState("");
  const [closeValue, setCloseValue] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [logging, setLogging] = useState(false);
  const [adminRequestLoading, setAdminRequestLoading] = useState<AdminRequestType | null>(null);

  // Outreach package
  const [outreachPkg, setOutreachPkg] = useState<OutreachPackage | null>(null);
  const [pkgLoading, setPkgLoading] = useState(false);
  const [showPkg, setShowPkg] = useState(false);

  const [verification, setVerification] = useState<Record<string, boolean>>(lead.verification ?? {});
  const isAdmin = currentUser.role === "admin";
  const isClaimedByCurrentUser = assignedToUserId === currentUser.userId;
  const isClaimedByOther = Boolean(assignedToUserId && !isClaimedByCurrentUser);
  const canEditLead = isAdmin || isClaimedByCurrentUser;

  const flash = (msg: string) => {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(null), 2500);
  };

  const handleManualWebsiteCorrection = async () => {
    if (!canEditLead) {
      flash(isClaimedByOther ? "Taken by another researcher." : "Claim this lead before updating it.");
      return;
    }
    setWebsiteCorrectionLoading(true);
    try {
      const result = await manualWebsiteCorrectionAction(lead.id, {
        websiteUrl: websiteCorrectionUrl,
        resolution: websiteCorrectionResolution,
        notes: websiteCorrectionNotes,
      }) as { error?: string; lead?: Lead };
      if (result?.error) {
        flash(result.error);
        return;
      }
      if (result?.lead) {
        setFactWebsiteUrl(result.lead.website_uri ?? "");
        setWebsiteCorrectionUrl(result.lead.website_uri ?? "");
        setAiFeedbackStatus(result.lead.ai_website_feedback_status ?? "uncertain");
        setAiCorrectedWebsiteUrl(result.lead.ai_corrected_website_url ?? "");
        setAiFalsePositiveReason(result.lead.ai_false_positive_reason ?? "");
        setQualityBucket(result.lead.quality_bucket);
        setIsExcluded(result.lead.is_excluded);
        setExcludedAt(result.lead.excluded_at);
        setExclusionReason(result.lead.exclusion_reason ?? "");
      }
      setWebsiteCorrectionNotes("");
      flash("Website correction saved.");
      router.refresh();
    } finally {
      setWebsiteCorrectionLoading(false);
    }
  };

  const handleSaveLeadFacts = async () => {
    if (!canEditLead) {
      flash(isClaimedByOther ? "Taken by another researcher." : "Claim this lead before editing facts.");
      return;
    }
    setFactsLoading(true);
    try {
      const result = await updateLeadFactsAction(lead.id, {
        name: factName,
        phone: factPhone,
        address: factAddress,
        websiteUrl: factWebsiteUrl,
        businessType: factBusinessType,
        primaryType: factPrimaryType,
        status: factStatus,
        notes: factNotes,
      }) as { error?: string; lead?: Lead };
      if (result?.error) {
        flash(result.error);
        return;
      }
      if (result?.lead) {
        setFactName(result.lead.name ?? "");
        setFactPhone(result.lead.phone ?? "");
        setFactAddress(result.lead.address ?? "");
        setFactBusinessType(result.lead.business_type ?? "");
        setFactPrimaryType(result.lead.primary_type ?? "");
        setStatus(result.lead.status);
        setNotes(result.lead.notes ?? "");
        setFactStatus(result.lead.status);
        setFactNotes(result.lead.notes ?? "");
        setFactWebsiteUrl(result.lead.website_uri ?? "");
        setWebsiteCorrectionUrl(result.lead.website_uri ?? websiteCorrectionUrl);
        setQualityBucket(result.lead.quality_bucket);
      }
      flash("Lead facts saved.");
      router.refresh();
    } finally {
      setFactsLoading(false);
    }
  };

  const handleSaveWorkUpdate = async () => {
    if (!canEditLead) {
      flash(isClaimedByOther ? "Taken by another researcher." : "Claim this lead before adding a work update.");
      return;
    }
    setWorkLoading(true);
    try {
      const result = await saveLeadWorkUpdateAction(lead.id, {
        action: workAction,
        note: workNote,
        followUpAt: workFollowUpAt,
        nextStep: workNextStep,
      }) as { error?: string; success?: boolean };
      if (result?.error) {
        flash(result.error);
        return;
      }
      if (workFollowUpAt) {
        setReminder(workFollowUpAt);
      }
      if (workAction === "done") {
        setStatus("verified");
        setFactStatus("verified");
        setReminder("");
      }
      setWorkNote("");
      setWorkFollowUpAt("");
      setWorkNextStep("");
      flash("Work update saved.");
      router.refresh();
    } finally {
      setWorkLoading(false);
    }
  };

  const handleStatusChange = async (s: string) => {
    if (!canEditLead) {
      flash("Claim this lead before updating it");
      return;
    }
    if (!isAdmin && (s === "closed_won" || s === "closed_lost")) {
      flash("Only admins can close leads");
      return;
    }
    setStatus(s);
    await updateLeadStatusAction(lead.id, s);
    flash("Status updated");
  };

  const handleSaveNotes = async () => {
    if (!canEditLead) {
      flash("Claim this lead before saving notes");
      return;
    }
    await updateLeadNotesAction(lead.id, notes);
    flash("Notes saved");
  };

  const handleSaveReminder = async () => {
    if (!canEditLead) {
      flash("Claim this lead before setting follow-ups");
      return;
    }
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

  const handleArchiveLead = async () => {
    if (!isAdmin) {
      flash("Only admins can archive leads");
      return;
    }
    const trimmedReason = archiveReason.trim();
    if (trimmedReason.length < 5) {
      flash("Archive reason must be at least 5 characters");
      return;
    }
    setPendingArchiveReason(trimmedReason);
    setArchiveConfirmOpen(true);
  };

  const confirmArchiveLead = async () => {
    if (!isAdmin) {
      flash("Only admins can archive leads");
      return;
    }
    if (archivedAt) {
      setArchiveConfirmOpen(false);
      return;
    }
    const trimmedReason = pendingArchiveReason.trim();
    if (trimmedReason.length < 5) {
      flash("Archive reason must be at least 5 characters");
      return;
    }
    setArchiveLoading(true);
    try {
      const result = await archiveLeadAction(lead.id, trimmedReason);
      if ("error" in result) {
        flash(result.error ?? "Unable to archive lead");
        return;
      }
      setArchivedAt(new Date().toISOString());
      setArchiveReason(trimmedReason);
      setPendingArchiveReason("");
      setArchiveConfirmOpen(false);
      router.refresh();
      flash("Lead archived");
    } catch {
      flash("Unable to archive lead");
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleRestoreArchivedLead = async () => {
    if (!isAdmin) {
      flash("Only admins can restore archived leads");
      return;
    }
    setArchiveLoading(true);
    try {
      const result = await restoreArchivedLeadAction(lead.id);
      if ("error" in result) {
        flash(result.error ?? "Unable to restore lead");
        return;
      }
      setArchivedAt(null);
      setArchiveReason("");
      setPendingArchiveReason("");
      setArchiveConfirmOpen(false);
      router.refresh();
      flash("Lead restored to active inventory");
    } catch {
      flash("Unable to restore lead");
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleLogEvent = async () => {
    if (!canEditLead) {
      flash("Claim this lead before logging contact");
      return;
    }
    setLogging(true);
    const result = await logOutreachEventAction(lead.id, {
      channel: eventChannel,
      note: eventNote,
      contactPersonName,
      contactPersonRole,
      decisionMakerReached,
      outcome: eventOutcome,
      objectionReason,
      quotedAmount: quotedAmount || 0,
      closeValue: closeValue || 0,
      followUpAt,
      nextStep,
    });
    if ("event" in result && result.event) {
      setEvents((prev) => [result.event as OutreachEvent, ...prev]);
      setEventNote("");
      setContactPersonName("");
      setContactPersonRole("");
      setDecisionMakerReached(false);
      setEventOutcome("contacted");
      setObjectionReason("");
      setQuotedAmount("");
      setCloseValue("");
      setFollowUpAt("");
      setNextStep("");
      flash("Outreach logged");
      router.refresh();
    } else if ("error" in result) {
      flash(result.error ?? "Unable to log contact");
    }
    setLogging(false);
  };

  const handleApplyCallPreset = (preset: CallOutcomePreset) => {
    if (!canEditLead) {
      flash(isClaimedByOther ? "Taken by another researcher." : "Claim this lead before logging contact.");
      return;
    }
    setEventChannel(preset.channel);
    setEventOutcome(preset.outcome);
    setEventNote(preset.note);
    setNextStep(preset.nextStep);
    setDecisionMakerReached(preset.decisionMakerReached);
    flash(`${preset.label} preset applied`);
  };

  const handleCreateAdminRequest = async (requestType: AdminRequestType) => {
    if (!canEditLead) {
      flash("Claim this lead before sending it to Steve");
      return;
    }
    setAdminRequestLoading(requestType);
    const result = await createAdminRequestAction(lead.id, {
      requestType,
      contactPersonName,
      budgetHint: quotedAmount ? `$${Number(quotedAmount).toLocaleString()}` : "",
      dueAt: followUpAt,
      nextStep,
      summary: buildAdminRequestSummary(requestType, contactPersonName, eventNote),
    });
    if ("error" in result) {
      flash(result.error ?? "Unable to send to Steve");
    } else {
      setAdminRequests((current) => {
        const exists = current.some((request) => request.id === result.request.id);
        return exists ? current : [result.request as AdminRequest, ...current];
      });
      flash(result.alreadyExists ? "Already in admin queue" : "Sent to Steve");
      router.refresh();
    }
    setAdminRequestLoading(null);
  };

  const handleMarkReplied = async () => {
    if (!canEditLead) {
      flash("Claim this lead before updating it");
      return;
    }
    const result = await markLeadRepliedAction(lead.id);
    if ("success" in result) {
      setFirstReply(new Date().toISOString());
      flash("Marked as replied");
    }
  };

  const handleMarkMeeting = async () => {
    if (!canEditLead) {
      flash("Claim this lead before updating it");
      return;
    }
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
    if (!canEditLead) {
      flash("Claim this lead before creating a demo");
      return;
    }
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
    if (!canEditLead) {
      flash("Claim this lead before adding notes");
      return;
    }
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
    flash(assignedToUserId === currentUser.userId ? "Lead ownership released" : "Lead claimed");
  };

  const handlePhoneVerificationStatus = async (nextStatus: string) => {
    if (!canEditLead) {
      flash("Claim this lead before updating phone status");
      return;
    }
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
    if (!canEditLead) {
      flash("Claim this lead before updating quality");
      return;
    }
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
  const currentAiStatus = aiVerification?.status ?? lead.ai_verification_status;
  const currentAiCheckedAt = aiVerification?.created_at ?? lead.ai_checked_at;
  const currentViability = aiVerification?.website_viability_status ?? lead.ai_website_viability_status;
  const currentHealth = aiVerification?.website_health_json ?? lead.ai_website_health;
  const currentViabilityReason = aiVerification?.website_viability_reason;
  const aiStatusDisplay = getAiVerificationDisplay({
    status: currentAiStatus,
    checkedAt: currentAiCheckedAt,
    queueStatus: lead.ai_queue_status,
    viability: currentViability,
  });
  const hasUsableAiWebsite = currentAiStatus === "site_found" && currentViability === "usable";
  const hasBrokenSiteOpportunity = currentViability === "broken" || currentViability === "parked" || currentViability === "placeholder";
  const assignedLabel = assignedToUserId === currentUser.userId
    ? "Assigned to you"
    : assignedToUserId
      ? `Assigned to ${lead.assigned_user_display_name || lead.assigned_user_email || "another researcher"}`
      : "Unassigned";
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
  const hasOpenWebsiteRequest = adminRequests.some((request) => request.request_type === "website_request" && isOpenAdminRequestStatus(request.status));
  const hasOpenQuoteRequest = adminRequests.some((request) => request.request_type === "quote_request" && isOpenAdminRequestStatus(request.status));
  const aiConfidenceLabel = aiStatusDisplay.hasRun ? `${Math.round((aiVerification?.confidence ?? lead.ai_confidence) * 100)}%` : "Not run";
  const readinessLabel = archivedAt
    ? "Archived"
    : isExcluded
      ? "Excluded"
      : qualityBucket === "ready_to_call"
        ? "Ready to call"
        : qualityBucket === "broken_site_opportunity"
          ? "Broken-site opportunity"
          : qualityBucket === "needs_manual_review"
            ? "Manual review"
            : qualityBucket === "needs_ai_verify"
              ? "Needs AI verify"
              : formatLabel(lead.qualification_status);
  const contactStat = lead.phone ? `${lead.phone} (${formatLabel(phoneVerificationStatus)})` : "No phone";
  const activityTimeline: ActivityTimelineItem[] = [
    ...events.map((ev) => ({
      id: `outreach-${ev.id}`,
      kind: "outreach" as const,
      createdAt: ev.created_at,
      channel: ev.channel,
      title: `${formatLabel(ev.outcome)}${ev.contact_person_name ? ` with ${ev.contact_person_name}` : ""}${ev.contact_person_role ? ` (${ev.contact_person_role})` : ""}`,
      body: ev.note || "No note",
      meta: [
        ev.channel === "walkin" ? "in person" : ev.channel,
        ev.next_step ? `Next: ${ev.next_step}` : null,
        ev.follow_up_at ? `Follow-up: ${new Date(ev.follow_up_at).toLocaleDateString()}` : null,
        ev.objection_reason ? `Objection: ${ev.objection_reason}` : null,
        ev.quoted_amount > 0 ? `Quote: $${ev.quoted_amount.toLocaleString()}` : null,
        ev.close_value > 0 ? `Close: $${ev.close_value.toLocaleString()}` : null,
        ev.actor_email ? `by ${ev.actor_email}` : null,
      ].filter(Boolean).join(" | "),
    })),
    ...leadNotes.map((note) => ({
      id: `note-${note.id}`,
      kind: "note" as const,
      createdAt: note.created_at,
      title: "Research note",
      body: note.body,
      meta: note.author_email ? `by ${note.author_email}` : "team note",
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <PageShell
      title={lead.name ?? "Unknown Business"}
      description={lead.address ?? "No address available"}
      stats={[
        { label: "Score", value: `${lead.score.toFixed(1)} (${scoreBand.label})` },
        { label: "Website", value: formatLabel(lead.website_status), hint: websiteFinding },
        { label: "Readiness", value: readinessLabel, hint: `${Math.round(lead.lead_quality_score)}% quality` },
        { label: "Contact", value: contactStat, hint: `${Math.round(lead.contactability_score * 100)}% contactability` },
      ]}
    >
      {/* Back link and notifications */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/explore" className="link-accent text-sm">&larr; Back to Explorer</Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span
            className="rounded-md border px-2 py-0.5 text-xs font-semibold capitalize"
            style={{ background: "rgba(99,102,241,0.08)", borderColor: "rgba(99,102,241,0.18)", color: "#6366f1" }}
          >
            {currentUser.role}
          </span>
          <button type="button" className="btn-glass text-xs" onClick={handleClaimToggle}>
            {assignedToUserId === currentUser.userId ? "Unclaim lead" : assignedLabel === "Unassigned" ? "Claim" : assignedLabel}
          </button>
          {archivedAt && (
            <span
              className="rounded-md border px-2 py-0.5 text-xs font-semibold"
              style={{ background: "rgba(15,23,42,0.1)", borderColor: "rgba(15,23,42,0.2)", color: "#0f172a" }}
              title={archiveReason || "Archived from active inventory"}
            >
              Archived
            </span>
          )}
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

      <section className="glass rounded-2xl p-3" role="tablist" aria-label="Lead detail sections">
        <div className="flex flex-wrap gap-2">
          {LEAD_DETAIL_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              id={`lead-detail-tab-${tab.key}`}
              role="tab"
              aria-selected={activeTab === tab.key}
              aria-controls={`lead-detail-panel-${tab.key}`}
              className={activeTab === tab.key ? "btn-primary text-sm" : "btn-glass text-sm"}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "work" && (
        <section id="lead-detail-panel-work" role="tabpanel" aria-labelledby="lead-detail-tab-work" className="space-y-5">
          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="section-label">Lead workbench</h3>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Decide if this lead is worth a call, use the verified website gap, and log the outcome without digging through admin panels.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <WorkflowStep active={!assignedToUserId} done={Boolean(assignedToUserId)} label="Claim" />
                  <WorkflowStep active={Boolean(assignedToUserId) && !aiStatusDisplay.hasRun} done={aiStatusDisplay.hasRun || qualityBucket !== "needs_ai_verify"} label="Verify" />
                  <WorkflowStep active={Boolean(assignedToUserId) && !lead.first_contacted_at} done={Boolean(lead.first_contacted_at)} label="Call" />
                  <WorkflowStep active={Boolean(lead.first_contacted_at) && events.length === 0} done={events.length > 0} label="Log outcome" />
                  <WorkflowStep active={events.length > 0 && !hasOpenWebsiteRequest && !hasOpenQuoteRequest} done={hasOpenWebsiteRequest || hasOpenQuoteRequest || Boolean(meetingBooked)} label="Handoff" />
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {!assignedToUserId && (
                  <button type="button" className="btn-primary text-sm" onClick={handleClaimToggle}>Claim</button>
                )}
                {isClaimedByCurrentUser && (
                  <button type="button" className="btn-glass text-sm" onClick={handleClaimToggle}>Release ownership</button>
                )}
                {lead.phone && <a className="btn-primary text-sm" href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}>Call</a>}
                {lead.phone && <a className="btn-glass text-sm" href={`sms:${lead.phone.replace(/[^\d+]/g, "")}`}>Text</a>}
                {lead.phone && <button type="button" className="btn-glass text-sm" onClick={() => copyToClipboard(lead.phone!)}>Copy phone</button>}
                {lead.maps_uri && <a className="btn-glass text-sm" href={lead.maps_uri} target="_blank" rel="noopener noreferrer">Open Maps</a>}
                <AdminRequestActionButton
                  label="Website needed"
                  alreadyQueued={hasOpenWebsiteRequest}
                  busy={adminRequestLoading === "website_request"}
                  disabled={!canEditLead || Boolean(adminRequestLoading)}
                  onClick={() => handleCreateAdminRequest("website_request")}
                />
                <AdminRequestActionButton
                  label="Quote requested"
                  alreadyQueued={hasOpenQuoteRequest}
                  busy={adminRequestLoading === "quote_request"}
                  disabled={!canEditLead || Boolean(adminRequestLoading)}
                  onClick={() => handleCreateAdminRequest("quote_request")}
                />
              </div>
            </div>
            {!canEditLead && (
              <p className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(245,158,11,0.12)", color: "#92400e" }}>
                {isClaimedByOther ? `This lead is already owned by ${lead.assigned_user_display_name || lead.assigned_user_email || "another researcher"}.` : "Claim this lead before changing workflow, notes, follow-ups, or contact history."}
              </p>
            )}
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CallSheetField label="Phone" value={contactStat} />
              <CallSheetField label="Address" value={lead.address ?? "No address"} href={lead.maps_uri ?? undefined} />
              <CallSheetField label="Website finding" value={websiteFinding} />
              <CallSheetField label="AI confidence" value={aiConfidenceLabel} />
              <CallSheetField label="Rating / reviews" value={`${lead.rating?.toFixed(1) ?? "No rating"} / ${lead.review_count ?? 0}`} />
              <CallSheetField label="Offer" value={formatLabel(lead.recommended_offer)} />
              <CallSheetField label="Pitch angle" value={lead.quality_reason ?? "Use the verified website gap and local review volume."} />
              <CallSheetField label="Next action" value={lead.next_best_action ?? "Call and confirm the owner or decision maker."} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-glass text-xs" disabled={!canEditLead} onClick={() => handlePhoneVerificationStatus("works")}>Phone Works</button>
              <button type="button" className="btn-glass text-xs" disabled={!canEditLead} onClick={() => handlePhoneVerificationStatus("bad")}>Phone Bad</button>
              <button type="button" className="btn-glass text-xs" disabled={!canEditLead} onClick={() => handleQualityBucket("ready_to_call")}>Mark Ready to Call</button>
              <button type="button" className="btn-glass text-xs" disabled={!canEditLead} onClick={() => handleQualityBucket("broken_site_opportunity")}>Mark Broken-Site Opportunity</button>
              <button type="button" className="btn-glass text-xs" disabled={!canEditLead} onClick={() => handleQualityBucket("needs_manual_review")}>Mark Manual Review</button>
            </div>
          </section>

          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="section-label">Log outcome</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  Record who you reached, what happened, and the next follow-up.
                </p>
              </div>
              <button type="button" className="btn-primary text-sm" onClick={handleLogEvent} disabled={logging || !canEditLead}>
                {logging ? "Logging..." : "Log outcome"}
              </button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.32)", border: "1px solid rgba(255,255,255,0.42)" }}>
              <span className="text-xs font-medium uppercase" style={{ color: "var(--text-tertiary)" }}>Call presets</span>
              {CALL_OUTCOME_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className="btn-glass text-xs"
                  disabled={!canEditLead}
                  onClick={() => handleApplyCallPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Channel</span>
                <select className="glass-select" value={eventChannel} onChange={(e) => setEventChannel(e.target.value)} disabled={!canEditLead}>
                  {CHANNEL_OPTIONS.map((c) => <option key={c} value={c}>{c === "walkin" ? "In person" : c}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Outcome</span>
                <select className="glass-select" value={eventOutcome} onChange={(e) => setEventOutcome(e.target.value)} disabled={!canEditLead}>
                  {OUTCOME_OPTIONS.filter((option) => isAdmin || (option !== "closed_won" && option !== "closed_lost")).map((option) => (
                    <option key={option} value={option}>{formatLabel(option)}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Person</span>
                <input className="glass-input" value={contactPersonName} onChange={(e) => setContactPersonName(e.target.value)} disabled={!canEditLead} placeholder="Name if known" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Role</span>
                <input className="glass-input" value={contactPersonRole} onChange={(e) => setContactPersonRole(e.target.value)} disabled={!canEditLead} placeholder="Owner, manager..." />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Follow-up date</span>
                <input className="glass-input" type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} disabled={!canEditLead} />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Next step</span>
                <input className="glass-input" value={nextStep} onChange={(e) => setNextStep(e.target.value)} disabled={!canEditLead} placeholder="What should happen next?" />
              </label>
              <label className="flex flex-col gap-1 md:col-span-2 lg:col-span-4">
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Note</span>
                <textarea className="glass-input w-full" rows={3} value={eventNote} onChange={(e) => setEventNote(e.target.value)} disabled={!canEditLead} placeholder="What happened?" />
              </label>
            </div>
            <details className="mt-4 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.32)", border: "1px solid rgba(255,255,255,0.42)" }}>
              <summary className="cursor-pointer text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Deal details and objections
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <label className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.35)" }}>
                  <input type="checkbox" checked={decisionMakerReached} onChange={(e) => setDecisionMakerReached(e.target.checked)} disabled={!canEditLead} />
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>Decision maker reached</span>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Quoted amount</span>
                  <input className="glass-input" type="number" min={0} value={quotedAmount} onChange={(e) => setQuotedAmount(e.target.value)} disabled={!canEditLead} placeholder="0" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Close value</span>
                  <input className="glass-input" type="number" min={0} value={closeValue} onChange={(e) => setCloseValue(e.target.value)} disabled={!canEditLead} placeholder="0" />
                </label>
                <label className="flex flex-col gap-1 lg:col-span-1">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Objection</span>
                  <input className="glass-input" value={objectionReason} onChange={(e) => setObjectionReason(e.target.value)} disabled={!canEditLead} placeholder="Price, timing, not interested..." />
                </label>
              </div>
            </details>
          </section>

          <section className="glass rounded-2xl p-6">
            <h3 className="section-label">Recent activity ({activityTimeline.length})</h3>
            {activityTimeline.length === 0 ? (
              <p className="mt-3 text-sm" style={{ color: "var(--text-tertiary)" }}>No outreach or research notes yet.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {activityTimeline.map((item) => (
                  <article key={item.id} className="flex items-start gap-3 rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
                    <span style={item.kind === "outreach" ? channelBadgeStyle(item.channel ?? "other") : channelBadgeStyle("other")}>
                      {item.kind === "outreach" ? item.channel === "walkin" ? "in person" : item.channel ?? "outreach" : "note"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{item.title}</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--text-primary)" }}>{item.body}</p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {formatRelativeTime(item.createdAt)}{item.meta ? ` | ${item.meta}` : ""}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </section>
      )}

      {activeTab === "overview" && (
        <section id="lead-detail-panel-overview" role="tabpanel" aria-labelledby="lead-detail-tab-overview" className="space-y-5">
          <section className="grid gap-4 lg:grid-cols-3">
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
            <article className="glass rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="section-label">Quality Summary</h3>
                  <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Normal operator context, not scoring debug.</p>
                </div>
                <Link href={`/quality?search=${encodeURIComponent(lead.name ?? "")}`} className="btn-glass text-xs">Open in Quality</Link>
              </div>
              <div className="mt-4 grid gap-3">
                <QualityMetric label="Bucket" value={formatLabel(qualityBucket)} />
                <QualityMetric label="Quality Score" value={`${Math.round(lead.lead_quality_score)}%`} />
                <QualityMetric label="Need" value={`${Math.round(lead.need_score)}%`} />
                <QualityMetric label="Easy Build" value={`${Math.round(lead.easy_build_score)}%`} />
                <QualityMetric label="Cash Speed" value={`${Math.round(lead.cash_speed_score)}%`} />
              </div>
            </article>
          </section>

          {lead.enrichment_status === "enriched" && (
            <section className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <h3 className="section-label">Enrichment Data</h3>
                <span className="rounded-lg px-2.5 py-1 text-xs font-medium" style={{ background: "rgba(34,197,94,0.1)", color: "#16a34a" }}>Enriched</span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Photos</span><p className="text-sm" style={{ color: "var(--text-primary)" }}>{lead.photo_count} photos</p></div>
                <div><span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Opening Hours</span><p className="text-sm" style={{ color: "var(--text-primary)" }}>{lead.has_opening_hours ? "Listed" : "Not listed"}</p></div>
                {lead.primary_type && <div><span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Primary Type</span><p className="text-sm" style={{ color: "var(--text-primary)" }}>{lead.primary_type.replace(/_/g, " ")}</p></div>}
                {lead.editorial_summary && <div className="sm:col-span-2"><span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Editorial Summary</span><p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{lead.editorial_summary}</p></div>}
              </div>
              {lead.review_highlights && lead.review_highlights.length > 0 && (
                <div className="mt-4">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Review Insights</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {lead.review_highlights.map((h) => <span key={h} className="rounded-lg px-2 py-1 text-xs" style={{ background: "rgba(99,102,241,0.1)", color: "#6366f1" }}>{h}</span>)}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className="glass rounded-2xl p-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="section-label">Timeline</h3>
                <div className="mt-3 space-y-1.5">
                  <TimestampRow label="Discovered" value={lead.discovered_at} />
                  <TimestampRow label="First Contact" value={lead.first_contacted_at} />
                  <TimestampRow label="First Reply" value={firstReply} />
                  <TimestampRow label="Meeting Booked" value={meetingBooked} />
                  <TimestampRow label="Last Contacted" value={lead.last_contacted_at} />
                </div>
              </div>
              {density && density.count > 0 && (
                <div>
                  <h3 className="section-label">Market Density</h3>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded-lg px-2 py-1 text-xs font-medium" style={{
                      background: density.label === "Very High" ? "rgba(239,68,68,0.1)" : density.label === "High" ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)",
                      color: density.label === "Very High" ? "#dc2626" : density.label === "High" ? "#d97706" : "#16a34a",
                    }}>{density.label}</span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{density.count} similar businesses nearby</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        </section>
      )}

      {activeTab === "verification" && (
        <section id="lead-detail-panel-verification" role="tabpanel" aria-labelledby="lead-detail-tab-verification" className="space-y-5">
          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="section-label">Website correction</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  Paste the website once and choose how it should affect the no-site workflow.
                </p>
              </div>
              {factWebsiteUrl || lead.website_uri ? (
                <a className="btn-glass text-xs" href={factWebsiteUrl || lead.website_uri || "#"} target="_blank" rel="noopener noreferrer">Open website</a>
              ) : (
                <span className="rounded-lg px-2 py-1 text-xs" style={{ background: "rgba(239,68,68,0.1)", color: "#dc2626" }}>No website</span>
              )}
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <label className="block text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                Website URL
                <input className="glass-input mt-2 w-full" value={websiteCorrectionUrl} onChange={(e) => setWebsiteCorrectionUrl(e.target.value)} placeholder="https://business.com" disabled={!canEditLead || websiteCorrectionLoading} />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                Correction type
                <select className="glass-select mt-2 w-full" value={websiteCorrectionResolution} onChange={(e) => setWebsiteCorrectionResolution(e.target.value as WebsiteCorrectionResolution)} disabled={!canEditLead || websiteCorrectionLoading}>
                  {WEBSITE_CORRECTION_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                Notes
                <input className="glass-input mt-2 w-full" value={websiteCorrectionNotes} onChange={(e) => setWebsiteCorrectionNotes(e.target.value)} placeholder="Where did you find it?" disabled={!canEditLead || websiteCorrectionLoading} />
              </label>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
              {WEBSITE_CORRECTION_OPTIONS.find((option) => option.value === websiteCorrectionResolution)?.help}
            </p>
            <button type="button" className="btn-primary mt-4 text-sm" onClick={handleManualWebsiteCorrection} disabled={!canEditLead || websiteCorrectionLoading || (websiteCorrectionResolution !== "remove_website" && !websiteCorrectionUrl.trim())}>
              {websiteCorrectionLoading ? "Saving..." : "Save website correction"}
            </button>
          </section>

          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="section-label">AI Verification</h3>
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Uses the locked gpt-5.4-mini verifier with budget limits and manual apply.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary text-xs" disabled={aiLoading} onClick={() => handleRunAiVerification(false)}>
                  {aiLoading ? "Checking..." : "Run AI Verify"}
                </button>
                <button type="button" className="btn-glass text-xs" disabled={aiLoading} onClick={() => handleRunAiVerification(true)}>Refresh</button>
                <button type="button" className="btn-glass text-xs" disabled={aiLoading || !foundAiWebsite} onClick={handleRepairAiViability}>Re-check Website Viability</button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-4">
              <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Status</span>
                <div className="mt-1">
                  <AiVerificationBadge status={currentAiStatus} checkedAt={currentAiCheckedAt} queueStatus={lead.ai_queue_status} viability={currentViability} confidence={aiVerification?.confidence ?? lead.ai_confidence} showDetail />
                </div>
              </div>
              <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Found Website</span>
                {foundAiWebsite ? <a className="link-accent mt-1 block truncate text-sm" href={foundAiWebsite} target="_blank" rel="noopener noreferrer">{foundAiWebsite}</a> : <p className="mt-1 text-sm" style={{ color: "var(--text-primary)" }}>None found</p>}
              </div>
              <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Recommendation</span>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{(aiVerification?.recommendation ?? lead.ai_recommendation ?? "manual_review").replace(/_/g, " ")}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{aiVerification?.created_at ? new Date(aiVerification.created_at).toLocaleString() : lead.ai_checked_at ? new Date(lead.ai_checked_at).toLocaleString() : "Not checked yet"}</p>
              </div>
              <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)" }}>
                <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Website Viability</span>
                <p className="mt-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{formatViabilityLabel(currentViability)}</p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{formatHealthSummary(currentHealth)}</p>
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
                <button type="button" className="btn-glass text-xs" onClick={() => setShowAiSources((current) => !current)}>
                  {showAiSources ? "Hide sources" : `Show sources (${aiVerification.sources.length})`}
                </button>
                {showAiSources && (
                  <div className="mt-2 grid gap-2 lg:grid-cols-2">
                    {aiVerification.sources.map((source) => (
                      <a key={`${source.url}-${source.evidence}`} className="rounded-xl px-4 py-3 text-sm hover:opacity-80" href={source.url} target="_blank" rel="noopener noreferrer" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-primary)" }}>
                        <span className="block truncate font-medium">{source.title ?? source.url}</span>
                        <span className="mt-1 block text-xs" style={{ color: "var(--text-tertiary)" }}>{source.evidence}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {aiVerification && (
              <div className="mt-4 flex flex-wrap gap-2">
                {isAdmin && (
                  <>
                    <button type="button" className="btn-glass text-xs" disabled={aiApplying !== null || !aiVerification.found_website_url || !hasUsableAiWebsite} onClick={() => handleApplyAi("update_website")}>{aiApplying === "update_website" ? "Applying..." : "Apply Usable Website"}</button>
                    <button type="button" className="btn-glass text-xs" disabled={aiApplying !== null || !hasUsableAiWebsite} onClick={() => handleApplyAi("exclude_has_website")}>{aiApplying === "exclude_has_website" ? "Excluding..." : "Exclude as Has Website"}</button>
                  </>
                )}
                <button type="button" className="btn-glass text-xs" disabled={aiApplying !== null || !hasBrokenSiteOpportunity} onClick={() => handleApplyAi("mark_broken_site_opportunity")}>{aiApplying === "mark_broken_site_opportunity" ? "Marking..." : "Mark Broken Site Opportunity"}</button>
                <button type="button" className="btn-glass text-xs" disabled={aiApplying !== null} onClick={() => handleApplyAi("mark_manual_review")}>{aiApplying === "mark_manual_review" ? "Marking..." : "Mark Manual Review"}</button>
              </div>
            )}
          </section>

          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="section-label">Advanced AI Accuracy Feedback</h3>
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Use this for AI metadata only. Use Website correction above when the actual lead website should change.
                </p>
              </div>
              {lead.ai_feedback_at && <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Last reviewed {new Date(lead.ai_feedback_at).toLocaleString()}</span>}
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label className="text-xs" style={{ color: "var(--text-secondary)" }}>Feedback<select className="glass-input mt-1 w-full" value={aiFeedbackStatus} onChange={(e) => setAiFeedbackStatus(e.target.value)}><option value="correct">Correct</option><option value="incorrect">Incorrect</option><option value="uncertain">Uncertain</option></select></label>
              <label className="text-xs lg:col-span-1" style={{ color: "var(--text-secondary)" }}>Correct Website URL<input className="glass-input mt-1 w-full" value={aiCorrectedWebsiteUrl} onChange={(e) => setAiCorrectedWebsiteUrl(e.target.value)} placeholder="https://..." /></label>
              <label className="text-xs lg:col-span-2" style={{ color: "var(--text-secondary)" }}>False Positive / Notes<input className="glass-input mt-1 w-full" value={aiFalsePositiveReason} onChange={(e) => setAiFalsePositiveReason(e.target.value)} placeholder="Wrong business, directory only, parked page..." /></label>
            </div>
            <textarea className="glass-input mt-3 min-h-20 w-full" value={aiReviewerNotes} onChange={(e) => setAiReviewerNotes(e.target.value)} placeholder="Reviewer notes for future scoring/pitch decisions" />
            <div className="mt-3 flex justify-end">
              <button type="button" className="btn-glass text-xs" disabled={aiFeedbackLoading} onClick={handleSaveAiFeedback}>{aiFeedbackLoading ? "Saving..." : "Save AI Feedback"}</button>
            </div>
          </section>
        </section>
      )}

      {activeTab === "intelligence" && (
        <section id="lead-detail-panel-intelligence" role="tabpanel" aria-labelledby="lead-detail-tab-intelligence" className="space-y-5">
          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="section-label">Pitch actions</h3>
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Generate sales copy, outreach, and demo assets from the verified lead context.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {demoHref && <button type="button" className="btn-glass text-xs" onClick={copyDemoPitch}>Copy Demo Link + Pitch</button>}
                <button type="button" className="btn-primary text-xs" onClick={handleGeneratePackage} disabled={pkgLoading}>{pkgLoading ? "Generating..." : "Generate Outreach"}</button>
                <button type="button" className="btn-glass text-xs" onClick={handleCreateDemo} disabled={demoLoading || !canEditLead}>{demoLoading ? "Creating..." : demo ? "Refresh Demo Link" : "Create Demo"}</button>
              </div>
            </div>
            {demo && (
              <div className="mt-3 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(99,102,241,0.08)", color: "var(--text-secondary)" }}>
                <span className="block font-medium" style={{ color: "var(--text-primary)" }}>Demo URL</span>
                <a className="link-accent break-all" href={`/demo/${demo.slug}`} target="_blank" rel="noopener noreferrer">/demo/{demo.slug}</a>
              </div>
            )}
          </section>

          {showPkg && outreachPkg && (
            <section className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <h3 className="section-label">Outreach Package</h3>
                <div className="flex gap-2">
                  <button type="button" className="btn-glass text-xs" onClick={() => copyToClipboard(outreachPkg.fullMessage)}>Copy All</button>
                  <button type="button" className="btn-glass text-xs" onClick={() => setShowPkg(false)}>Close</button>
                </div>
              </div>
              <div className="mt-4 whitespace-pre-wrap rounded-xl p-4 text-sm leading-relaxed" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-primary)" }}>{outreachPkg.fullMessage}</div>
            </section>
          )}

          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="section-label">Lead Intelligence</h3>
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>Manual gpt-5.4-mini briefs for website generation and the sales pitch.</p>
              </div>
              <button type="button" className="btn-primary text-xs" disabled={artifactLoading !== null} onClick={() => handleGeneratePitchPack(false)}>
                {artifactLoading === "pitch_pack" ? "Generating..." : "Generate Pitch Pack"}
              </button>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ArtifactPanel title="Business Detail" description="Website build brief and copy-ready prompt." artifact={businessDetailArtifact} latestJob={businessDetailJob} loading={artifactLoading === "business_detail" || artifactLoading === "pitch_pack"} generateLabel="Generate Brief" regenerateLabel="Regenerate Brief" onGenerate={() => handleQueueArtifact("business_detail", false)} onRegenerate={() => handleQueueArtifact("business_detail", true)} onCopy={() => copyToClipboard(String(businessDetailArtifact?.content_json.website_generation_prompt ?? ""))}>
                {businessDetailArtifact ? <BusinessDetailView artifact={businessDetailArtifact} /> : <EmptyArtifactState label={artifactStateLabel(businessDetailJob)} />}
              </ArtifactPanel>
              <ArtifactPanel title="Competitive Report" description="Competitor snapshot, upside estimate, and pitch points." artifact={competitiveReportArtifact} latestJob={competitiveReportJob} loading={artifactLoading === "competitive_report" || artifactLoading === "pitch_pack"} generateLabel="Generate Report" regenerateLabel="Regenerate Report" onGenerate={() => handleQueueArtifact("competitive_report", false)} onRegenerate={() => handleQueueArtifact("competitive_report", true)} onCopy={() => copyToClipboard(buildPitchBriefText(competitiveReportArtifact))}>
                {competitiveReportArtifact ? <CompetitiveReportView artifact={competitiveReportArtifact} /> : <EmptyArtifactState label={artifactStateLabel(competitiveReportJob)} />}
              </ArtifactPanel>
            </div>
          </section>
        </section>
      )}

      {activeTab === "admin" && (
        <section id="lead-detail-panel-admin" role="tabpanel" aria-labelledby="lead-detail-tab-admin" className="space-y-5">
          <section className="glass rounded-2xl p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="section-label">Admin controls</h3>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  Edit canonical facts, workflow state, internal notes, and audit-only controls.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(factWebsiteUrl || lead.website_uri) && (
                  <a className="btn-glass text-xs" href={factWebsiteUrl || lead.website_uri || "#"} target="_blank" rel="noopener noreferrer">
                    Open website
                  </a>
                )}
                {lead.maps_uri && (
                  <a className="btn-glass text-xs" href={lead.maps_uri} target="_blank" rel="noopener noreferrer">
                    Open Maps
                  </a>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <section className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.42)", border: "1px solid rgba(255,255,255,0.52)" }}>
                <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Edit business info</h4>
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Human-owned facts are editable. Scores and AI fields update through correction actions.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                    Business name
                    <input className="glass-input mt-2 w-full" value={factName} onChange={(e) => setFactName(e.target.value)} disabled={!canEditLead || factsLoading} />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                    Phone
                    <input className="glass-input mt-2 w-full" value={factPhone} onChange={(e) => setFactPhone(e.target.value)} disabled={!canEditLead || factsLoading} />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] sm:col-span-2" style={{ color: "var(--text-tertiary)" }}>
                    Address
                    <input className="glass-input mt-2 w-full" value={factAddress} onChange={(e) => setFactAddress(e.target.value)} disabled={!canEditLead || factsLoading} />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] sm:col-span-2" style={{ color: "var(--text-tertiary)" }}>
                    Website
                    <input className="glass-input mt-2 w-full" value={factWebsiteUrl} onChange={(e) => setFactWebsiteUrl(e.target.value)} placeholder="https://..." disabled={!canEditLead || factsLoading} />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                    Business type
                    <input className="glass-input mt-2 w-full" value={factBusinessType} onChange={(e) => setFactBusinessType(e.target.value)} disabled={!canEditLead || factsLoading} />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                    Primary category
                    <input className="glass-input mt-2 w-full" value={factPrimaryType} onChange={(e) => setFactPrimaryType(e.target.value)} disabled={!canEditLead || factsLoading} />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                    Status
                    <select className="glass-select mt-2 w-full" value={factStatus} onChange={(e) => setFactStatus(e.target.value)} disabled={!canEditLead || factsLoading}>
                      {STATUS_OPTIONS.filter((s) => isAdmin || (s !== "closed_won" && s !== "closed_lost")).map((s) => (
                        <option key={s} value={s}>{formatLabel(s)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.16em] sm:col-span-2" style={{ color: "var(--text-tertiary)" }}>
                    Internal notes
                    <textarea className="glass-input mt-2 min-h-[84px] w-full" value={factNotes} onChange={(e) => setFactNotes(e.target.value)} disabled={!canEditLead || factsLoading} />
                  </label>
                </div>
                <button type="button" className="btn-primary mt-4 w-full" onClick={handleSaveLeadFacts} disabled={!canEditLead || factsLoading || !factName.trim()}>
                  {factsLoading ? "Saving..." : "Save business info"}
                </button>
              </section>

              <section className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.42)", border: "1px solid rgba(255,255,255,0.52)" }}>
                <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Operator workflow</h4>
                <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Internal state updates for research notes, follow-ups, and routing.
                </p>
                <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                  Action
                  <select className="glass-select mt-2 w-full" value={workAction} onChange={(e) => setWorkAction(e.target.value as WorkUpdateAction)} disabled={!canEditLead || workLoading}>
                    {WORK_UPDATE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                  Note
                  <textarea className="glass-input mt-2 min-h-[112px] w-full" value={workNote} onChange={(e) => setWorkNote(e.target.value)} placeholder="What changed? What should the next person know?" disabled={!canEditLead || workLoading} />
                </label>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                    Follow-up date
                    <input className="glass-input mt-2 w-full" type="date" value={workFollowUpAt} onChange={(e) => setWorkFollowUpAt(e.target.value)} disabled={!canEditLead || workLoading} />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--text-tertiary)" }}>
                    Next step
                    <input className="glass-input mt-2 w-full" value={workNextStep} onChange={(e) => setWorkNextStep(e.target.value)} placeholder="Call owner, verify website..." disabled={!canEditLead || workLoading} />
                  </label>
                </div>
                <button type="button" className="btn-primary mt-4 w-full" onClick={handleSaveWorkUpdate} disabled={!canEditLead || workLoading || (!workNote.trim() && !workFollowUpAt && !workNextStep && workAction === "research_note")}>
                  {workLoading ? "Saving..." : "Save work update"}
                </button>
              </section>
            </div>
          </section>

          <section className="glass rounded-2xl p-6">
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <h3 className="section-label">Status and reminder</h3>
                <select className="glass-select mt-3 w-full" value={status} onChange={(e) => handleStatusChange(e.target.value)} disabled={!canEditLead}>
                  {STATUS_OPTIONS.filter((s) => isAdmin || (s !== "closed_won" && s !== "closed_lost")).map((s) => (
                    <option key={s} value={s}>{formatLabel(s)}</option>
                  ))}
                </select>
                <div className="mt-3 flex gap-2">
                  <input type="date" className="glass-input flex-1 text-xs" value={reminder} onChange={(e) => setReminder(e.target.value)} disabled={!canEditLead} />
                  <button type="button" className="btn-glass text-xs" onClick={handleSaveReminder} disabled={!canEditLead}>Set</button>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {!firstReply && lead.first_contacted_at && (
                    <button type="button" className="btn-glass text-xs" onClick={handleMarkReplied} disabled={!canEditLead}>Mark Replied</button>
                  )}
                  {!meetingBooked && (
                    <button type="button" className="btn-glass text-xs" onClick={handleMarkMeeting} disabled={!canEditLead}>Mark Meeting Booked</button>
                  )}
                </div>
              </div>
              <div>
                <h3 className="section-label">Verification checklist</h3>
                <VerificationChecklist
                  verification={verification}
                  onChange={async (key, value) => {
                    if (!canEditLead) {
                      flash("Claim this lead before updating verification");
                      return;
                    }
                    const updated = { ...verification, [key]: value };
                    setVerification(updated);
                    const result = await updateLeadVerificationAction(lead.id, key, value);
                    if ("error" in result) {
                      setVerification(verification);
                      flash(result.error ?? "Error");
                    }
                  }}
                />
              </div>
            </div>
          </section>

          {isAdmin && (
            <section className="glass rounded-2xl p-6">
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="section-label">Lead Exclusion</h3>
                    {isExcluded && <span className="text-xs font-medium" style={{ color: "#4b5563" }}>Excluded</span>}
                  </div>
                  <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Excluded leads stay visible for audit, but are ignored by qualified counts, queue, enrichment ranking, and score bands.
                  </p>
                  <textarea className="glass-input mt-3 w-full text-xs" rows={3} placeholder="Reason for exclusion" value={exclusionReason} onChange={(e) => setExclusionReason(e.target.value)} />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn-glass text-xs" disabled={exclusionLoading || isExcluded || exclusionReason.trim().length < 5} onClick={handleExcludeLead}>
                      {exclusionLoading && !isExcluded ? "Excluding..." : "Exclude Lead"}
                    </button>
                    <button type="button" className="btn-glass text-xs" disabled={exclusionLoading || !isExcluded} onClick={handleRestoreLead}>
                      {exclusionLoading && isExcluded ? "Restoring..." : "Restore Lead"}
                    </button>
                  </div>
                  {isExcluded && (
                    <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(107,114,128,0.08)", color: "#4b5563" }}>
                      <span>Excluded on: {excludedAt ? new Date(excludedAt).toLocaleString() : "-"}</span>
                      {exclusionReason && <span className="ml-2">Reason: {exclusionReason}</span>}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="section-label">Lead Archive</h3>
                    {archivedAt && <span className="text-xs font-medium" style={{ color: "#0f172a" }}>Archived</span>}
                  </div>
                  <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Archive removes this lead from active inventory without deleting notes, outreach history, demos, or AI artifacts.
                  </p>
                  <label htmlFor="archive-reason" className="section-label mt-3 block">Archive reason</label>
                  <textarea
                    id="archive-reason"
                    name="archiveReason"
                    aria-describedby="archive-reason-help"
                    className="glass-input mt-2 w-full text-xs"
                    rows={3}
                    placeholder="Reason for archiving"
                    value={archiveReason}
                    onChange={(e) => setArchiveReason(e.target.value)}
                  />
                  <p id="archive-reason-help" className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Enter at least 5 characters to enable Archive Lead.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" className="btn-glass text-xs" disabled={archiveLoading || Boolean(archivedAt) || archiveReason.trim().length < 5} onClick={handleArchiveLead}>
                      {archiveLoading && !archivedAt ? "Archiving..." : "Archive active lead"}
                    </button>
                    <button type="button" className="btn-glass text-xs" disabled={archiveLoading || !archivedAt} onClick={handleRestoreArchivedLead}>
                      {archiveLoading && archivedAt ? "Restoring..." : "Restore to active inventory"}
                    </button>
                  </div>
                  {archivedAt && (
                    <div className="mt-2 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(15,23,42,0.08)", color: "#0f172a" }}>
                      <span>Archived on: {new Date(archivedAt).toLocaleString()}</span>
                      {archiveReason && <span className="ml-2">Reason: {archiveReason}</span>}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {scoreBreakdown && (
            <section className="glass rounded-2xl p-6">
              <h3 className="section-label">Score Breakdown</h3>
              <div className="mt-3 space-y-1.5">
                <ScoreRow label="Base (log reviews x rating)" value={scoreBreakdown.base} />
                <ScoreRow label="Niche Weight" value={scoreBreakdown.nicheWeight + "x"} />
                <ScoreRow label="Website Multiplier" value={scoreBreakdown.websiteMultiplier + "x"} />
                {scoreBreakdown.photoBonus > 0 && <ScoreRow label="Photo Opportunity" value={"+" + scoreBreakdown.photoBonus} />}
                {scoreBreakdown.hoursBonus > 0 && <ScoreRow label="Hours Bonus" value={"+" + scoreBreakdown.hoursBonus} />}
                {scoreBreakdown.opportunityBonus > 0 && <ScoreRow label="Opportunity Signal" value={"+" + scoreBreakdown.opportunityBonus} accent />}
                {scoreBreakdown.healthBonus > 0 && <ScoreRow label="Website Health" value={"+" + scoreBreakdown.healthBonus} accent />}
                {scoreBreakdown.densityBonus > 0 && <ScoreRow label="Competitive Density" value={"+" + scoreBreakdown.densityBonus} />}
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span style={{ color: "var(--text-primary)" }}>{"Final Score (" + scoreBand.label + ")"}</span>
                  <span style={{ color: scoreBandStyle.color }}>{scoreBreakdown.final}</span>
                </div>
              </div>
            </section>
          )}

          <section className="glass rounded-2xl p-6">
            <h3 className="section-label">Raw internal notes</h3>
            <textarea className="glass-input mt-3 w-full" rows={4} placeholder="Add notes..." value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canEditLead} />
            <button type="button" className="btn-primary mt-3 text-sm" onClick={handleSaveNotes} disabled={!canEditLead}>Save Notes</button>
          </section>

          <section className="glass rounded-2xl p-6">
            <h3 className="section-label">Team Notes</h3>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <textarea
                className="glass-input min-h-24 flex-1"
                placeholder="Add a research note..."
                value={leadNoteBody}
                onChange={(event) => setLeadNoteBody(event.target.value)}
                disabled={!canEditLead}
              />
              <button type="button" className="btn-primary self-start text-sm" disabled={noteLoading || !leadNoteBody.trim() || !canEditLead} onClick={handleAddLeadNote}>
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
        </section>
      )}

      <ArchiveConfirmDialog
        open={archiveConfirmOpen}
        leadName={lead.name ?? "Unknown Business"}
        reason={pendingArchiveReason}
        loading={archiveLoading}
        onCancel={() => {
          if (!archiveLoading) setArchiveConfirmOpen(false);
        }}
        onConfirm={confirmArchiveLead}
      />
    </PageShell>
  );
}

export function ArchiveConfirmDialog({
  open,
  leadName,
  reason,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  leadName: string;
  reason: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-confirm-title"
        className="glass-heavy w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ border: "1px solid rgba(255,255,255,0.55)" }}
      >
        <h2 id="archive-confirm-title" className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Archive lead?
        </h2>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          This removes <strong>{leadName}</strong> from active inventory without deleting notes, outreach history, demos, or AI artifacts.
        </p>
        <div className="mt-4 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(255,255,255,0.5)", color: "var(--text-secondary)" }}>
          <span className="section-label block">Reason</span>
          <span>{reason}</span>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-glass text-sm" disabled={loading} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-primary text-sm" disabled={loading} onClick={onConfirm}>
            {loading ? "Archiving..." : "Archive lead"}
          </button>
        </div>
      </section>
    </div>
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

function WorkflowStep({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  const style = done
    ? { background: "rgba(34,197,94,0.12)", color: "#15803d", borderColor: "rgba(34,197,94,0.22)" }
    : active
      ? { background: "rgba(99,102,241,0.12)", color: "#4f46e5", borderColor: "rgba(99,102,241,0.24)" }
      : { background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)", borderColor: "rgba(255,255,255,0.45)" };
  return (
    <span className="rounded-md border px-2.5 py-1 font-semibold" style={style}>
      {label}
    </span>
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

function AdminRequestActionButton({
  label,
  alreadyQueued,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  alreadyQueued: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="btn-glass text-sm" disabled={disabled || alreadyQueued} onClick={onClick}>
      {alreadyQueued ? "Already in admin queue" : busy ? "Sending..." : label}
    </button>
  );
}

function isOpenAdminRequestStatus(status: string): boolean {
  return status === "new" || status === "seen" || status === "in_progress" || status === "waiting_on_researcher";
}

function buildAdminRequestSummary(requestType: AdminRequestType, contactPersonName: string, note: string): string {
  const parts = [
    requestType === "website_request" ? "Website needed." : "Quote requested.",
    contactPersonName.trim() ? `Contact: ${contactPersonName.trim()}.` : null,
    note.trim() || null,
  ].filter(Boolean);
  return parts.join(" ");
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
