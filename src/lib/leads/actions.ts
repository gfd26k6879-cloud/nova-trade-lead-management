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
  createAiLeadVerification,
  updateLeadAiVerificationSummary,
  markLeadAiError,
  logAiUsageEvent,
  getAiBudgetStatus,
  getAiVerificationCandidates,
  getAiWebsiteViabilityRepairLeads,
  applyAiFoundWebsite,
  markLeadBrokenSiteOpportunity,
  markLeadManualReview,
  getConfiguredOpenAiApiKey,
  createAuditLog,
  getSettings,
  refreshStaleUnits as dbRefreshStale,
  updateCrawlRunStatus,
  type LeadFilters,
  type Lead,
  type Settings,
  type AiLeadVerification,
} from "@/lib/db/queries";
import { requireSession } from "@/lib/auth";
import { generateOutreachPackage } from "@/lib/outreach-package";
import { computeScoreWithBreakdown, computeWinProbability } from "@/lib/scoring";
import type { WebsiteStatus } from "@/lib/classify-website";
import { getAiCostReservationUsd, getConfiguredOpenAIModel, OPENAI_LEAD_VERIFICATION_MODEL } from "@/lib/ai/config";
import { callOpenAILeadVerifier, isAiVerificationFresh, type AiVerificationResult } from "@/lib/ai/lead-verification";
import {
  assessWebsiteViability,
  normalizeAiVerificationForWebsiteSales,
  type WebsiteViabilityStatus,
} from "@/lib/ai/website-viability";

const statusSchema = z.enum(["new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost"]);
const channelSchema = z.enum(["call", "text", "email", "walkin", "other"]);
const exclusionReasonSchema = z.string().trim().min(5).max(500);
const aiApplySchema = z.enum(["update_website", "exclude_has_website", "mark_broken_site_opportunity", "mark_manual_review"]);

function revalidateLeadViews(): void {
  revalidatePath("/leads");
  revalidatePath("/queue");
  revalidatePath("/dashboard");
}

export async function getLeadsAction(filters: LeadFilters = {}) {
  await requireSession();
  await ensureDbReady();
  return queryLeads(filters);
}

export async function getLeadByIdAction(id: string) {
  await requireSession();
  await ensureDbReady();
  return queryLeadById(id);
}

export async function updateLeadStatusAction(id: string, status: string) {
  await requireSession();
  await ensureDbReady();
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status value" };
  await dbUpdateStatus(id, parsed.data);
  await createAuditLog("lead_status_change", "lead", id, { status: parsed.data });
  revalidateLeadViews();
  return { success: true };
}

export async function updateLeadNotesAction(id: string, notes: string) {
  await requireSession();
  await ensureDbReady();
  await dbUpdateNotes(id, notes);
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function updateLeadReminderAction(id: string, date: string | null) {
  await requireSession();
  await ensureDbReady();
  await dbUpdateReminder(id, date);
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function excludeLeadAction(id: string, reason: string) {
  await requireSession();
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
  await requireSession();
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
  await requireSession();
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
  await requireSession();
  await ensureDbReady();
  return dbGetOutreachEvents(leadId);
}

export async function markLeadRepliedAction(id: string) {
  await requireSession();
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
  await requireSession();
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
  await requireSession();
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  return generateOutreachPackage(lead);
}

export async function createDemoForLeadAction(leadId: string) {
  await requireSession();
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
  await requireSession();
  await ensureDbReady();
  return dbGetDemoByLeadId(leadId);
}

export async function getScoreBreakdownAction(leadId: string) {
  await requireSession();
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
  await requireSession();
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

export async function refreshStaleUnitsAction(runId: string, olderThanDays: number) {
  await requireSession();
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
  await requireSession();
  await ensureDbReady();
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status" };
  if (ids.length === 0) return { error: "No leads selected" };
  const count = await dbBulkUpdateStatus(ids, parsed.data);
  await createAuditLog("bulk_status_update", "leads", undefined, { status: parsed.data, count });
  revalidateLeadViews();
  return { success: true, count };
}

export async function runAiVerificationAction(leadId: string, options: { force?: boolean } = {}) {
  await requireSession();
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };

  const result = await performAiVerification(lead, options.force ?? false);
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/statistics");
  return result;
}

export async function runAiVerificationBatchAction(input: { limit?: number; businessType?: string } = {}) {
  await requireSession();
  await ensureDbReady();
  const settings = await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };

  const requestedLimit = Math.max(1, Math.floor(input.limit ?? 10));
  const safeLimit = Math.min(requestedLimit, settings.ai_batch_limit);
  const leads = await getAiVerificationCandidates(safeLimit, input.businessType);
  const results: Array<{ leadId: string; success: boolean; cached?: boolean; error?: string }> = [];

  for (const lead of leads) {
    const result = await performAiVerification(lead, false, settings);
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

export async function applyAiRecommendationAction(verificationId: string, action: string) {
  await requireSession();
  await ensureDbReady();
  const parsedAction = aiApplySchema.safeParse(action);
  if (!parsedAction.success) return { error: "Invalid AI recommendation action" };

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
  await requireSession();
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
  await requireSession();
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

async function performAiVerification(lead: Lead, force: boolean, settingsArg?: Settings) {
  const settings = settingsArg ?? await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };

  const model = getConfiguredOpenAIModel();
  if (model !== OPENAI_LEAD_VERIFICATION_MODEL) return { error: "AI model guardrail rejected the configured model." };

  const latest = await getLatestAiVerification(lead.id);
  const cachedNeedsViability = latest?.found_website_url && latest.website_viability_status == null;
  if (!force && latest && latest.error == null && !cachedNeedsViability && isAiVerificationFresh(latest.created_at, settings.ai_cache_ttl_days)) {
    await logAiUsageEvent({
      lead_id: lead.id,
      verification_id: latest.id,
      model,
      was_cached: true,
      estimated_cost: 0,
      metadata: { cacheHit: true },
    });
    return { success: true, cached: true, verification: latest };
  }

  const reservedCost = getAiCostReservationUsd();
  const budget = await getAiBudgetStatus(settings, reservedCost);
  if (!budget.allowed) return { error: budget.reason ?? "AI budget guardrail blocked this request." };

  try {
    const ai = await callOpenAILeadVerifier(lead, await getConfiguredOpenAiApiKey());
    const websiteViability = ai.result.foundWebsiteUrl
      ? await assessWebsiteViability(lead, ai.result.foundWebsiteUrl)
      : null;
    const normalized = normalizeAiVerificationForWebsiteSales(lead, ai.result, websiteViability);
    const normalizedResult = normalized.result;
    const normalizedViability = normalized.websiteViability;
    const winProbabilityScore = computeLeadWinProbability(lead, normalizedResult, normalizedViability?.status ?? null);

    const verification = await createAiLeadVerification({
      lead_id: lead.id,
      model,
      status: normalizedResult.status,
      confidence: normalizedResult.confidence,
      found_website_url: normalizedResult.foundWebsiteUrl,
      found_email: normalizedResult.foundEmail,
      found_phone: normalizedResult.foundPhone,
      social_profiles: normalizedResult.socialProfiles,
      sources: normalizedResult.sources,
      recommendation: normalizedResult.recommendation,
      reason: normalizedResult.reason,
      summary: normalizedResult.summary,
      website_viability_status: normalizedViability?.status ?? null,
      website_health_json: normalizedViability?.health ?? null,
      website_viability_reason: normalizedViability?.reason ?? null,
      raw_json: {
        openai: ai.raw,
        identityResearchResult: ai.result,
        websiteViability: normalizedViability,
      },
      input_hash: ai.inputHash,
      usage_input_tokens: ai.inputTokens,
      usage_output_tokens: ai.outputTokens,
      estimated_cost: ai.estimatedCost,
    });

    await logAiUsageEvent({
      lead_id: lead.id,
      verification_id: verification.id,
      model,
      input_tokens: ai.inputTokens,
      output_tokens: ai.outputTokens,
      estimated_cost: ai.estimatedCost,
      metadata: {
        status: normalizedResult.status,
        originalStatus: ai.result.status,
        recommendation: normalizedResult.recommendation,
        websiteViability: normalizedViability?.status ?? null,
      },
    });
    await updateLeadAiVerificationSummary(lead.id, verification, winProbabilityScore);
    await createAuditLog("ai_lead_verified", "lead", lead.id, { verificationId: verification.id, status: verification.status, websiteViability: verification.website_viability_status });
    return { success: true, cached: false, verification };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI verification failed.";
    const verification = await createAiLeadVerification({
      lead_id: lead.id,
      model,
      status: "error",
      recommendation: "manual_review",
      reason: message,
      summary: message,
      error: message,
    });
    await logAiUsageEvent({
      lead_id: lead.id,
      verification_id: verification.id,
      model,
      success: false,
      estimated_cost: 0,
      metadata: { error: message },
    });
    await markLeadAiError(lead.id, message);
    await createAuditLog("ai_lead_verification_failed", "lead", lead.id, { verificationId: verification.id, error: message });
    return { error: message, verification };
  }
}

async function repairLeadAiWebsiteViability(lead: Lead, latest: AiLeadVerification) {
  if (!latest.found_website_url) return { error: "AI verification has no website URL to re-check." };
  try {
    const websiteViability = await assessWebsiteViability(lead, latest.found_website_url);
    const identityResult = aiResultFromVerification(latest);
    const normalized = normalizeAiVerificationForWebsiteSales(lead, identityResult, websiteViability);
    const normalizedResult = normalized.result;
    const normalizedViability = normalized.websiteViability;
    const winProbabilityScore = computeLeadWinProbability(lead, normalizedResult, normalizedViability?.status ?? null);
    const verification = await createAiLeadVerification({
      lead_id: lead.id,
      model: latest.model,
      status: normalizedResult.status,
      confidence: normalizedResult.confidence,
      found_website_url: normalizedResult.foundWebsiteUrl,
      found_email: normalizedResult.foundEmail,
      found_phone: normalizedResult.foundPhone,
      social_profiles: normalizedResult.socialProfiles,
      sources: normalizedResult.sources,
      recommendation: normalizedResult.recommendation,
      reason: normalizedResult.reason,
      summary: normalizedResult.summary,
      website_viability_status: normalizedViability?.status ?? null,
      website_health_json: normalizedViability?.health ?? null,
      website_viability_reason: normalizedViability?.reason ?? null,
      raw_json: {
        repairFromVerificationId: latest.id,
        previousRaw: latest.raw_json,
        identityResearchResult: identityResult,
        websiteViability: normalizedViability,
      },
      input_hash: latest.input_hash,
      estimated_cost: 0,
    });
    await updateLeadAiVerificationSummary(lead.id, verification, winProbabilityScore);
    await createAuditLog("ai_website_viability_repaired", "lead", lead.id, {
      fromVerificationId: latest.id,
      verificationId: verification.id,
      status: verification.status,
      websiteViability: verification.website_viability_status,
    });
    return { success: true, verification };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Website viability repair failed.";
    await createAuditLog("ai_website_viability_repair_failed", "lead", lead.id, { verificationId: latest.id, error: message });
    return { error: message };
  }
}

function aiResultFromVerification(verification: AiLeadVerification): AiVerificationResult {
  return {
    status: verification.status === "error" || verification.status === "not_checked" ? "uncertain" : verification.status,
    confidence: verification.confidence,
    foundWebsiteUrl: verification.found_website_url,
    foundEmail: verification.found_email,
    foundPhone: verification.found_phone,
    socialProfiles: verification.social_profiles,
    sources: verification.sources,
    recommendation: verification.recommendation,
    reason: verification.reason,
    summary: verification.summary,
  };
}

function computeLeadWinProbability(
  lead: Lead,
  aiResult: Pick<AiVerificationResult, "status" | "confidence" | "foundWebsiteUrl">,
  websiteViabilityStatus: WebsiteViabilityStatus | null,
): number {
  return computeWinProbability({
    score: lead.score,
    websiteStatus: lead.website_status as WebsiteStatus,
    qualificationStatus: lead.qualification_status,
    isExcluded: lead.is_excluded,
    businessStatus: lead.business_status,
    contactabilityScore: lead.contactability_score,
    estimatedDealValue: lead.estimated_deal_value,
    firstContactedAt: lead.first_contacted_at,
    firstReplyAt: lead.first_reply_at,
    meetingBookedAt: lead.meeting_booked_at,
    status: lead.status,
    aiVerification: {
      status: aiResult.status,
      confidence: aiResult.confidence,
      foundWebsiteUrl: aiResult.foundWebsiteUrl,
      websiteViabilityStatus,
    },
  });
}

function isWeakWebsiteOpportunity(status: WebsiteViabilityStatus | null): boolean {
  return status === "broken" || status === "parked" || status === "placeholder";
}

const VERIFICATION_KEYS = new Set(["phone_works", "no_real_website", "address_verified", "business_active", "ready_for_outreach"]);

export async function updateLeadVerificationAction(id: string, key: string, value: boolean) {
  await requireSession();
  await ensureDbReady();
  if (!VERIFICATION_KEYS.has(key)) return { error: "Invalid verification key" };
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const verification = { ...lead.verification, [key]: value };
  await dbUpdateVerification(id, verification);
  revalidatePath(`/leads/${id}`);
  return { success: true, verification };
}
