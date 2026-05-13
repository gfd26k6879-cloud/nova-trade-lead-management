"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ensureDbReady,
  getLeads as queryLeads,
  getLeadById as queryLeadById,
  updateLeadStatus as dbUpdateStatus,
  updateLeadNotes as dbUpdateNotes,
  updateLeadReminder as dbUpdateReminder,
  createLeadNote as dbCreateLeadNote,
  getLeadNotes as dbGetLeadNotes,
  assignLeadToUser as dbAssignLeadToUser,
  setLeadExclusion as dbSetLeadExclusion,
  clearLeadExclusion as dbClearLeadExclusion,
  updateLeadTimestamp,
  createOutreachEvent,
  getOutreachEvents as dbGetOutreachEvents,
  createDemoForLead as dbCreateDemoForLead,
  getDemoByLeadId as dbGetDemoByLeadId,
  getAllLeadsForRecompute,
  batchUpdateScores,
  bulkUpdateLeadStatus as dbBulkUpdateStatus,
  updateLeadVerification as dbUpdateVerification,
  getLatestAiVerification,
  getAiVerificationById,
  getAiVerificationCandidates,
  getQualityAiVerificationCandidates,
  getAiWebsiteViabilityRepairLeads,
  applyAiFoundWebsite,
  markLeadBrokenSiteOpportunity,
  markLeadManualReview,
  recomputeAllLeadQualityScores,
  setLeadQualityBucket,
  updateLeadPhoneVerificationStatus,
  markLeadAiVerified,
  createAuditLog,
  getSettings,
  refreshStaleUnits as dbRefreshStale,
  updateCrawlRunStatus,
  type LeadFilters,
} from "@/lib/db/queries";
import { requirePermission } from "@/lib/auth";
import type { PhoneVerificationStatus, QualityBucket } from "@/lib/lead-quality";
import { generateOutreachPackage } from "@/lib/outreach-package";
import { computeScoreWithBreakdown } from "@/lib/scoring";
import type { WebsiteStatus } from "@/lib/classify-website";
import {
  computeLeadWinProbability,
  isWeakWebsiteOpportunity,
  performAiVerification,
  repairLeadAiWebsiteViability,
} from "@/lib/ai/verification-worker";

const statusSchema = z.enum(["new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost"]);
const channelSchema = z.enum(["call", "text", "email", "walkin", "other"]);
const exclusionReasonSchema = z.string().trim().min(5).max(500);
const aiApplySchema = z.enum(["update_website", "exclude_has_website", "mark_broken_site_opportunity", "mark_manual_review"]);
const leadNoteSchema = z.string().trim().min(1).max(4000);
const phoneVerificationStatusSchema = z.enum(["unknown", "works", "bad", "no_phone"]);
const qualityBucketSchema = z.enum(["ready_to_call", "needs_ai_verify", "needs_manual_review", "broken_site_opportunity", "not_a_fit"]);
const qualityAiBatchSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  businessType: z.string().trim().min(1).max(80).optional(),
  denverOnly: z.boolean().optional(),
  ids: z.array(z.string().uuid()).max(100).optional(),
});

function revalidateLeadViews(): void {
  revalidatePath("/leads");
  revalidatePath("/queue");
  revalidatePath("/quality");
  revalidatePath("/statistics");
  revalidatePath("/dashboard");
}

export async function getLeadsAction(filters: LeadFilters = {}) {
  await requirePermission("view:workspace");
  await ensureDbReady();
  return queryLeads(filters);
}

export async function getLeadByIdAction(id: string) {
  await requirePermission("view:workspace");
  await ensureDbReady();
  return queryLeadById(id);
}

export async function updateLeadStatusAction(id: string, status: string) {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status value" };
  await requirePermission(parsed.data === "closed_won" || parsed.data === "closed_lost" ? "lead:close" : "lead:update");
  await ensureDbReady();
  await dbUpdateStatus(id, parsed.data);
  await createAuditLog("lead_status_change", "lead", id, { status: parsed.data });
  revalidateLeadViews();
  return { success: true };
}

export async function updateLeadNotesAction(id: string, notes: string) {
  await requirePermission("lead:update");
  await ensureDbReady();
  await dbUpdateNotes(id, notes);
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function addLeadNoteAction(id: string, body: string) {
  const session = await requirePermission("lead:update");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const parsed = leadNoteSchema.safeParse(body);
  if (!parsed.success) return { error: "Note must be between 1 and 4000 characters." };
  const note = await dbCreateLeadNote(id, session.userId, parsed.data);
  await createAuditLog("lead_note_created", "lead", id, { noteId: note.id });
  revalidatePath(`/leads/${id}`);
  return { success: true, note };
}

export async function getLeadNotesAction(id: string) {
  await requirePermission("view:workspace");
  await ensureDbReady();
  return dbGetLeadNotes(id);
}

export async function claimLeadAction(id: string) {
  const session = await requirePermission("lead:assign");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  await dbAssignLeadToUser(id, session.userId);
  await createAuditLog("lead_claimed", "lead", id);
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function unclaimLeadAction(id: string) {
  const session = await requirePermission("lead:assign");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  if (lead.assigned_to_user_id && lead.assigned_to_user_id !== session.userId && session.role !== "admin") {
    return { error: "Only the assigned researcher or an admin can unclaim this lead." };
  }
  await dbAssignLeadToUser(id, null);
  await createAuditLog("lead_unclaimed", "lead", id);
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function assignLeadAction(id: string, userId: string | null) {
  await requirePermission("lead:admin_assign");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  await dbAssignLeadToUser(id, userId);
  await createAuditLog("lead_assigned", "lead", id, { assignedTo: userId });
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function updateLeadReminderAction(id: string, date: string | null) {
  await requirePermission("lead:update");
  await ensureDbReady();
  await dbUpdateReminder(id, date);
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function excludeLeadAction(id: string, reason: string) {
  await requirePermission("lead:exclude");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };

  const parsedReason = exclusionReasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return { error: "Please provide a clear reason (at least 5 characters)." };
  }

  const changes = await dbSetLeadExclusion(id, parsedReason.data);
  if (changes === 0) return { error: "Lead was not updated. Refresh and try again." };
  await createAuditLog("lead_excluded", "lead", id, { reason: parsedReason.data });
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function restoreExcludedLeadAction(id: string) {
  await requirePermission("lead:exclude");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };

  const changes = await dbClearLeadExclusion(id);
  if (changes === 0) return { error: "Lead was not updated. Refresh and try again." };
  await createAuditLog("lead_exclusion_cleared", "lead", id, {});
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function logOutreachEventAction(leadId: string, channel: string, note: string) {
  await requirePermission("outreach:create");
  await ensureDbReady();
  const parsed = channelSchema.safeParse(channel);
  if (!parsed.success) return { error: "Invalid channel" };
  const noteSchema = z.string().max(2000);
  const noteParsed = noteSchema.safeParse(note);
  if (!noteParsed.success) return { error: "Note too long (max 2000 chars)" };
  const event = await createOutreachEvent(leadId, parsed.data, noteParsed.data || null);
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  return { success: true, event };
}

export async function getOutreachEventsAction(leadId: string) {
  await requirePermission("view:workspace");
  await ensureDbReady();
  return dbGetOutreachEvents(leadId);
}

export async function markLeadRepliedAction(id: string) {
  await requirePermission("outreach:create");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  if (lead.first_reply_at) return { error: "Already marked as replied" };
  await updateLeadTimestamp(id, "first_reply_at", null);
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function markMeetingBookedAction(id: string) {
  await requirePermission("outreach:create");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  if (lead.meeting_booked_at) return { error: "Already marked as meeting booked" };
  await updateLeadTimestamp(id, "meeting_booked_at", null);
  if (lead.status !== "meeting_set" && lead.status !== "closed_won") {
    await dbUpdateStatus(id, "meeting_set");
  }
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function generateOutreachPackageAction(leadId: string) {
  await requirePermission("view:workspace");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  return generateOutreachPackage(lead);
}

export async function createDemoForLeadAction(leadId: string) {
  await requirePermission("demo:create");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  const demo = await dbCreateDemoForLead(leadId);
  if (!demo) return { error: "Unable to create demo" };
  await createAuditLog("demo_created", "lead", leadId, { demoId: demo.id, slug: demo.slug });
  revalidatePath(`/leads/${leadId}`);
  return { success: true, demo };
}

export async function getDemoByLeadIdAction(leadId: string) {
  await requirePermission("view:workspace");
  await ensureDbReady();
  return dbGetDemoByLeadId(leadId);
}

export async function getScoreBreakdownAction(leadId: string) {
  await requirePermission("view:workspace");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return null;
  const settings = await getSettings();
  const breakdown = computeScoreWithBreakdown(
    {
      reviewCount: lead.review_count, rating: lead.rating,
      categories: lead.categories, websiteStatus: lead.website_status as WebsiteStatus,
      photoCount: lead.photo_count, hasOpeningHours: lead.has_opening_hours,
      businessStatus: lead.business_status,
      websiteHealth: lead.website_health as Record<string, unknown> | null,
    },
    Object.keys(settings.niche_weights).length > 0 ? settings.niche_weights : undefined,
  );
  return breakdown;
}

export async function recomputeAllScoresAction(): Promise<{ count: number }> {
  await requirePermission("scores:recompute");
  await ensureDbReady();
  const settings = await getSettings();
  const leads = await getAllLeadsForRecompute();
  const nicheWeights = Object.keys(settings.niche_weights).length > 0 ? settings.niche_weights : undefined;
  const updates: Array<{ id: string; score: number }> = [];

  for (const lead of leads) {
    const categories: string[] = JSON.parse(lead.categories || "[]");
    const wh = lead.website_health ? JSON.parse(lead.website_health) : null;
    const score = computeScoreWithBreakdown(
      {
        reviewCount: lead.review_count, rating: lead.rating, categories,
        websiteStatus: lead.website_status as WebsiteStatus,
        photoCount: lead.photo_count ?? 0,
        hasOpeningHours: lead.has_opening_hours === 1,
        businessStatus: lead.business_status,
        websiteHealth: wh,
        contactabilityScore: lead.contactability_score,
        estimatedDealValue: lead.estimated_deal_value,
      },
      nicheWeights,
    ).final;
    updates.push({ id: lead.id, score });
  }

  await batchUpdateScores(updates);
  await createAuditLog("scores_recomputed", "leads", undefined, { count: updates.length });
  return { count: updates.length };
}

export async function recomputeLeadQualityScoresAction(): Promise<{ count: number }> {
  await requirePermission("scores:recompute");
  await ensureDbReady();
  const count = await recomputeAllLeadQualityScores();
  await createAuditLog("lead_quality_scores_recomputed", "leads", undefined, { count });
  revalidateLeadViews();
  return { count };
}

export async function updateLeadPhoneVerificationStatusAction(id: string, status: string) {
  const parsed = phoneVerificationStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid phone verification status" };
  const session = await requirePermission("lead:update");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const changes = await updateLeadPhoneVerificationStatus(id, parsed.data as PhoneVerificationStatus, session.userId);
  if (changes === 0) return { error: "Lead was not updated. Refresh and try again." };
  await createAuditLog("lead_phone_verification_updated", "lead", id, { status: parsed.data });
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function markLeadQualityBucketAction(id: string, bucket: string) {
  const parsed = qualityBucketSchema.safeParse(bucket);
  if (!parsed.success) return { error: "Invalid quality bucket" };
  if (parsed.data === "not_a_fit") {
    return { error: "Use admin exclusion for not-a-fit leads so the reason is audited." };
  }
  const session = await requirePermission("lead:update");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const changes = await setLeadQualityBucket(id, parsed.data as QualityBucket, session.userId);
  if (changes === 0) return { error: "Lead was not updated. Refresh and try again." };
  await createAuditLog("lead_quality_bucket_updated", "lead", id, { bucket: parsed.data });
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function refreshStaleUnitsAction(runId: string, olderThanDays: number) {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  if (olderThanDays < 1) return { error: "Days must be at least 1" };
  const count = await dbRefreshStale(runId, olderThanDays);
  if (count > 0) {
    await updateCrawlRunStatus(runId, "running");
    await createAuditLog("refresh_stale_units", "crawl_run", runId, { olderThanDays, count });
  }
  return { success: true, count };
}

export async function bulkUpdateLeadStatusAction(ids: string[], status: string) {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status" };
  await requirePermission(parsed.data === "closed_won" || parsed.data === "closed_lost" ? "lead:close" : "lead:update");
  await ensureDbReady();
  if (ids.length === 0) return { error: "No leads selected" };
  const count = await dbBulkUpdateStatus(ids, parsed.data);
  await createAuditLog("bulk_status_update", "leads", undefined, { status: parsed.data, count });
  revalidateLeadViews();
  return { success: true, count };
}

export async function runAiVerificationAction(leadId: string, options: { force?: boolean } = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };

  const result = await performAiVerification(lead, options.force ?? false);
  if ("verification" in result && result.verification?.input_hash) {
    await markLeadAiVerified(leadId, result.verification.input_hash);
  }
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/statistics");
  return result;
}

export async function runAiVerificationBatchAction(input: { limit?: number; businessType?: string } = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const settings = await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };

  const requestedLimit = Math.max(1, Math.floor(input.limit ?? 10));
  const safeLimit = Math.min(requestedLimit, settings.ai_batch_limit);
  const leads = await getAiVerificationCandidates(safeLimit, input.businessType);
  const results: Array<{ leadId: string; success: boolean; cached?: boolean; error?: string }> = [];

  for (const lead of leads) {
    const result = await performAiVerification(lead, false, settings);
    if ("verification" in result && result.verification?.input_hash) {
      await markLeadAiVerified(lead.id, result.verification.input_hash);
    }
    results.push({
      leadId: lead.id,
      success: !("error" in result),
      cached: "cached" in result ? result.cached : false,
      error: "error" in result ? result.error : undefined,
    });
    if ("error" in result && result.error?.includes("budget")) break;
  }

  await createAuditLog("ai_batch_verification", "leads", undefined, {
    requestedLimit,
    processed: results.length,
    businessType: input.businessType ?? null,
  });
  revalidateLeadViews();
  revalidatePath("/statistics");
  return {
    success: true,
    processed: results.length,
    verified: results.filter((row) => row.success && !row.cached).length,
    cached: results.filter((row) => row.cached).length,
    errors: results.filter((row) => row.error).length,
    results,
  };
}

export async function runQualityAiVerificationBatchAction(input: {
  limit?: number;
  businessType?: string;
  denverOnly?: boolean;
  ids?: string[];
} = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const parsed = qualityAiBatchSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid quality AI batch request." };

  const settings = await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };

  const requestedLimit = Math.max(1, Math.floor(parsed.data.limit ?? parsed.data.ids?.length ?? 10));
  const safeLimit = Math.min(requestedLimit, settings.ai_batch_limit, parsed.data.ids?.length ?? requestedLimit);
  const leads = await getQualityAiVerificationCandidates({
    limit: safeLimit,
    businessType: parsed.data.businessType,
    denverOnly: parsed.data.denverOnly,
    ids: parsed.data.ids,
  });
  const results: Array<{ leadId: string; success: boolean; cached?: boolean; error?: string }> = [];

  for (const lead of leads) {
    const result = await performAiVerification(lead, false, settings);
    if ("verification" in result && result.verification?.input_hash) {
      await markLeadAiVerified(lead.id, result.verification.input_hash);
    }
    results.push({
      leadId: lead.id,
      success: !("error" in result),
      cached: "cached" in result ? result.cached : false,
      error: "error" in result ? result.error : undefined,
    });
    if ("error" in result && result.error?.includes("budget")) break;
  }

  await createAuditLog("quality_ai_batch_verification", "leads", undefined, {
    requestedLimit,
    processed: results.length,
    businessType: parsed.data.businessType ?? null,
    denverOnly: parsed.data.denverOnly ?? false,
    selectedCount: parsed.data.ids?.length ?? 0,
  });
  revalidateLeadViews();
  return {
    success: true,
    processed: results.length,
    verified: results.filter((row) => row.success && !row.cached).length,
    cached: results.filter((row) => row.cached).length,
    errors: results.filter((row) => row.error).length,
    results,
  };
}

export async function applyAiRecommendationAction(verificationId: string, action: string) {
  const parsedAction = aiApplySchema.safeParse(action);
  if (!parsedAction.success) return { error: "Invalid AI recommendation action" };
  await requirePermission(
    parsedAction.data === "update_website" || parsedAction.data === "exclude_has_website"
      ? "lead:apply_ai_usable_website"
      : "lead:apply_ai_opportunity",
  );
  await ensureDbReady();

  const verification = await getAiVerificationById(verificationId);
  if (!verification) return { error: "AI verification not found" };
  const lead = await queryLeadById(verification.lead_id);
  if (!lead) return { error: "Lead not found" };
  const hasUsableWebsite = verification.status === "site_found" && verification.website_viability_status === "usable";

  if (parsedAction.data === "update_website") {
    if (!verification.found_website_url) return { error: "No found website URL to apply." };
    if (!hasUsableWebsite) return { error: "Only a usable, business-matched website can be applied." };
    await applyAiFoundWebsite(lead.id, verification.found_website_url);
    await createAuditLog("ai_found_website_applied", "lead", lead.id, { verificationId, websiteUrl: verification.found_website_url });
  }

  if (parsedAction.data === "exclude_has_website") {
    if (!hasUsableWebsite) return { error: "Only a usable, business-matched website can exclude a lead as having a website." };
    if (verification.found_website_url) {
      await applyAiFoundWebsite(lead.id, verification.found_website_url);
    }
    await dbSetLeadExclusion(lead.id, `AI found existing website${verification.found_website_url ? `: ${verification.found_website_url}` : ""}`);
    await createAuditLog("ai_exclusion_applied", "lead", lead.id, { verificationId, websiteUrl: verification.found_website_url });
  }

  if (parsedAction.data === "mark_broken_site_opportunity") {
    if (!isWeakWebsiteOpportunity(verification.website_viability_status)) {
      return { error: "Only broken, parked, or placeholder website findings can be marked as a broken-site opportunity." };
    }
    const winProbabilityScore = computeLeadWinProbability(lead, {
      status: "weak_site_found",
      confidence: verification.confidence,
      foundWebsiteUrl: verification.found_website_url,
    }, verification.website_viability_status);
    await markLeadBrokenSiteOpportunity(
      lead.id,
      verification.website_viability_reason || verification.reason || "AI found a broken or weak website opportunity.",
      winProbabilityScore,
    );
    await createAuditLog("ai_broken_site_opportunity_applied", "lead", lead.id, { verificationId, websiteUrl: verification.found_website_url, viability: verification.website_viability_status });
  }

  if (parsedAction.data === "mark_manual_review") {
    await markLeadManualReview(lead.id, verification.reason || "AI marked this lead for manual review.");
    await createAuditLog("ai_manual_review_applied", "lead", lead.id, { verificationId });
  }

  revalidateLeadViews();
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/statistics");
  return { success: true };
}

export async function repairLeadAiWebsiteViabilityAction(leadId: string) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  const latest = await getLatestAiVerification(leadId);
  if (!latest) return { error: "No AI verification exists for this lead." };
  if (!latest.found_website_url) return { error: "Latest AI verification has no website URL to re-check." };

  const result = await repairLeadAiWebsiteViability(lead, latest);
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/statistics");
  return result;
}

export async function repairAiWebsiteViabilityBatchAction(input: { limit?: number } = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const leads = await getAiWebsiteViabilityRepairLeads(input.limit ?? 50);
  const results: Array<{ leadId: string; success: boolean; error?: string }> = [];

  for (const lead of leads) {
    const latest = await getLatestAiVerification(lead.id);
    if (!latest?.found_website_url) continue;
    const result = await repairLeadAiWebsiteViability(lead, latest);
    results.push({
      leadId: lead.id,
      success: !("error" in result),
      error: "error" in result ? result.error : undefined,
    });
  }

  await createAuditLog("ai_website_viability_repair_batch", "leads", undefined, { processed: results.length });
  revalidateLeadViews();
  revalidatePath("/statistics");
  return {
    success: true,
    processed: results.length,
    repaired: results.filter((row) => row.success).length,
    errors: results.filter((row) => row.error).length,
    results,
  };
}

const VERIFICATION_KEYS = new Set(["phone_works", "no_real_website", "address_verified", "business_active", "ready_for_outreach"]);

export async function updateLeadVerificationAction(id: string, key: string, value: boolean) {
  await requirePermission("lead:update");
  await ensureDbReady();
  if (!VERIFICATION_KEYS.has(key)) return { error: "Invalid verification key" };
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const verification = { ...lead.verification, [key]: value };
  await dbUpdateVerification(id, verification);
  revalidatePath(`/leads/${id}`);
  return { success: true, verification };
}
