import {
  createAuditLog,
  createAiLeadVerification,
  getAiVerificationBackfillCandidates,
  getAiQueueStats,
  getConfiguredOpenAiApiKey,
  getLatestAiVerification,
  getLeadById,
  leaseNextAiVerificationJob,
  getSettings,
  logAiUsageEvent,
  markLeadAiError,
  markLeadAiQueueError,
  markLeadAiQueued,
  markLeadAiVerified,
  updateLeadAiVerificationSummary,
  type AiLeadVerification,
  type Lead,
  type Settings,
} from "@/lib/db/queries";
import type { WebsiteStatus } from "@/lib/classify-website";
import { getConfiguredOpenAIModel, OPENAI_LEAD_VERIFICATION_MODEL } from "@/lib/ai/config";
import {
  callOpenAILeadVerificationAdjudicator,
  callOpenAILeadVerifier,
  createLeadVerificationInputHash,
  isAiVerificationFresh,
  OpenAIResponseParseError,
  serializeOpenAIResponseParseError,
  type AiVerificationResult,
} from "@/lib/ai/lead-verification";
import { applyWebsiteCandidateAssessment, extractVerificationEvidence, scoreWebsiteCandidate } from "@/lib/ai/lead-evidence";
import {
  assessWebsiteViability,
  normalizeAiVerificationForWebsiteSales,
  type WebsiteViabilityStatus,
} from "@/lib/ai/website-viability";
import { computeWinProbability } from "@/lib/scoring";

export type AiVerificationWorkerResult =
  | { status: "verified"; leadId: string; leadName: string; cached: boolean }
  | { status: "idle"; reason?: string }
  | { status: "disabled"; reason: string }
  | { status: "error"; leadId?: string; error: string };

export interface AiVerificationBackfillResult {
  scanned: number;
  queued: number;
  skippedFresh: number;
  skippedIneligible: number;
}

export interface AiVerificationRunOptions {
  applyToLead?: boolean;
  actorUserId?: string | null;
  requestSource?: string | null;
}

export async function enqueueAiVerificationForLead(
  leadId: string,
  reason: string,
  options: { force?: boolean; settings?: Settings } = {},
): Promise<{ status: "queued" | "skipped" | "cached" | "disabled"; leadId: string; reason: string }> {
  const settings = options.settings ?? await getSettings();
  if (!settings.ai_enabled) return { status: "disabled", leadId, reason: "AI verification is disabled." };
  if (!settings.ai_auto_verify_enabled && !options.force) {
    return { status: "disabled", leadId, reason: "Automatic AI verification is disabled." };
  }

  const lead = await getLeadById(leadId);
  if (!lead) return { status: "skipped", leadId, reason: "Lead not found." };
  if (!isLeadEligibleForAiVerification(lead)) {
    return { status: "skipped", leadId, reason: "Lead is closed, excluded, or not operational." };
  }

  const inputHash = createLeadVerificationInputHash(lead);
  const latest = await getLatestAiVerification(lead.id);
  const hasFreshSameInput = Boolean(
    !options.force &&
    latest &&
    latest.error == null &&
    latest.input_hash === inputHash &&
    isAiVerificationFresh(latest.created_at, settings.ai_cache_ttl_days),
  );

  if (hasFreshSameInput) {
    await markLeadAiVerified(lead.id, inputHash);
    return { status: "cached", leadId, reason: "Fresh AI verification already exists for the same lead identity." };
  }

  if (!options.force && lead.ai_input_hash === inputHash && (lead.ai_queue_status === "queued" || lead.ai_queue_status === "running")) {
    return { status: "skipped", leadId, reason: `AI verification is already ${lead.ai_queue_status}.` };
  }

  const resetAttempts = options.force || lead.ai_input_hash !== inputHash || lead.ai_queue_status === "error";
  await markLeadAiQueued(lead.id, inputHash, resetAttempts);
  await createAuditLog("ai_verification_queued", "lead", lead.id, { reason, resetAttempts });
  return { status: "queued", leadId, reason };
}

export async function processNextAiVerificationJob(): Promise<AiVerificationWorkerResult> {
  const settings = await getSettings();
  if (!settings.ai_enabled) return { status: "disabled", reason: "AI verification is disabled in Settings." };

  const stats = await getAiQueueStats();
  if (stats.running >= settings.ai_verification_concurrency) {
    return { status: "idle", reason: "AI verification concurrency limit is already reached." };
  }

  const lead = await leaseNextAiVerificationJob(settings.ai_max_attempts);
  if (!lead) return { status: "idle", reason: "No AI verification jobs are ready." };

  const inputHash = createLeadVerificationInputHash(lead);

  const result = await performAiVerification(lead, false, settings);
  if ("error" in result) {
    const error = result.error ?? "AI verification failed.";
    await markLeadAiQueueError(lead.id, error, settings.ai_max_attempts);
    return { status: "error", leadId: lead.id, error };
  }

  const verificationHash = result.verification.input_hash ?? inputHash;
  await markLeadAiVerified(lead.id, verificationHash);
  return {
    status: "verified",
    leadId: lead.id,
    leadName: lead.name ?? "Unknown lead",
    cached: result.cached,
  };
}

export async function queueMissingAiVerifications(limit = 10000): Promise<AiVerificationBackfillResult | { error: string }> {
  const settings = await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };

  const leads = await getAiVerificationBackfillCandidates(limit);
  let queued = 0;
  let skippedFresh = 0;
  let skippedIneligible = 0;

  for (const lead of leads) {
    if (!isLeadEligibleForAiVerification(lead)) {
      skippedIneligible++;
      continue;
    }
    if (lead.ai_queue_status === "queued" || lead.ai_queue_status === "running") {
      skippedFresh++;
      continue;
    }

    const inputHash = createLeadVerificationInputHash(lead);
    const hasFreshLeadSummary =
      lead.ai_queue_status === "verified" &&
      lead.ai_input_hash === inputHash &&
      lead.ai_verification_status !== "not_checked" &&
      lead.ai_verification_status !== "error";

    if (hasFreshLeadSummary) {
      skippedFresh++;
      continue;
    }

    await markLeadAiQueued(lead.id, inputHash, lead.ai_input_hash !== inputHash || lead.ai_queue_status === "error");
    queued++;
  }

  if (queued > 0) {
    await createAuditLog("ai_verification_backfill_queued", "leads", undefined, {
      scanned: leads.length,
      queued,
      skippedFresh,
      skippedIneligible,
    });
  }

  return { scanned: leads.length, queued, skippedFresh, skippedIneligible };
}

export async function performAiVerification(
  lead: Lead,
  force: boolean,
  settingsArg?: Settings,
  options: AiVerificationRunOptions = {},
) {
  const settings = settingsArg ?? await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };
  const applyToLead = options.applyToLead ?? true;
  const actorUserId = options.actorUserId ?? null;
  const requestSource = options.requestSource ?? null;

  const model = getConfiguredOpenAIModel();
  if (model !== OPENAI_LEAD_VERIFICATION_MODEL) return { error: "AI model guardrail rejected the configured model." };

  const inputHash = createLeadVerificationInputHash(lead);
  const latest = await getLatestAiVerification(lead.id);
  const cachedNeedsViability = latest?.found_website_url && latest.website_viability_status == null;
  const cacheHit = Boolean(
    !force &&
    latest &&
    latest.error == null &&
    latest.input_hash === inputHash &&
    !cachedNeedsViability &&
    isAiVerificationFresh(latest.created_at, settings.ai_cache_ttl_days),
  );

  if (cacheHit && latest) {
    await logAiUsageEvent({
      lead_id: lead.id,
      verification_id: latest.id,
      model,
      was_cached: true,
      estimated_cost: 0,
      actor_user_id: actorUserId,
      request_source: requestSource,
      metadata: { cacheHit: true, inputHash },
    });
    return { success: true, cached: true, verification: latest };
  }

  try {
    const apiKey = await getConfiguredOpenAiApiKey();
    const ai = await callOpenAILeadVerifier(lead, apiKey);
    const websiteViability = ai.result.foundWebsiteUrl
      ? await assessWebsiteViability(lead, ai.result.foundWebsiteUrl)
      : null;
    const normalized = normalizeAiVerificationForWebsiteSales(lead, ai.result, websiteViability);
    const candidateAssessment = scoreWebsiteCandidate(
      lead,
      normalized.result.foundWebsiteUrl,
      normalized.result.sources,
      normalized.websiteViability,
    );
    let normalizedResult = applyWebsiteCandidateAssessment(normalized.result, candidateAssessment);
    let normalizedViability = normalized.websiteViability;
    let adjudicationRaw: Record<string, unknown> | null = null;
    let adjudicationError: string | null = null;
    let adjudicationInputTokens = 0;
    let adjudicationOutputTokens = 0;
    try {
      const adjudicated = await callOpenAILeadVerificationAdjudicator(
        lead,
        normalizedResult,
        normalizedViability,
        candidateAssessment,
        apiKey,
      );
      normalizedResult = applyWebsiteCandidateAssessment(adjudicated.result, candidateAssessment);
      adjudicationRaw = adjudicated.raw;
      adjudicationInputTokens = adjudicated.inputTokens;
      adjudicationOutputTokens = adjudicated.outputTokens;
    } catch (error) {
      adjudicationError = error instanceof Error ? error.message : "AI adjudication failed.";
      if (error instanceof OpenAIResponseParseError) {
        adjudicationRaw = { parseError: serializeOpenAIResponseParseError(error) };
      }
    }
    if (!normalizedResult.foundWebsiteUrl && normalizedViability?.status === "usable") {
      normalizedViability = null;
    }
    const winProbabilityScore = computeLeadWinProbability(lead, normalizedResult, normalizedViability?.status ?? null);
    const usageInputTokens = ai.inputTokens + adjudicationInputTokens;
    const usageOutputTokens = ai.outputTokens + adjudicationOutputTokens;
    const estimatedCost = ai.estimatedCost;

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
        adjudication: adjudicationRaw,
        adjudicationError,
        identityResearchResult: ai.result,
        adjudicatedResult: normalizedResult,
        evidence: {
          candidateAssessment,
          candidateWebsites: normalizedResult.candidateWebsites,
          identityMatch: normalizedResult.identityMatch,
          officialSiteEvidence: normalizedResult.officialSiteEvidence,
          contradictingEvidence: normalizedResult.contradictingEvidence,
          siteQualityFlags: normalizedResult.siteQualityFlags,
          manualReviewReason: normalizedResult.manualReviewReason,
          evidenceGrade: normalizedResult.evidenceGrade,
        },
        websiteViability: normalizedViability,
      },
      input_hash: ai.inputHash,
      usage_input_tokens: usageInputTokens,
      usage_output_tokens: usageOutputTokens,
      estimated_cost: estimatedCost,
      requested_by_user_id: actorUserId,
      request_source: requestSource,
    });

    await logAiUsageEvent({
      lead_id: lead.id,
      verification_id: verification.id,
      model,
      input_tokens: usageInputTokens,
      output_tokens: usageOutputTokens,
      estimated_cost: estimatedCost,
      actor_user_id: actorUserId,
      request_source: requestSource,
      metadata: {
        status: normalizedResult.status,
        originalStatus: ai.result.status,
        recommendation: normalizedResult.recommendation,
        websiteViability: normalizedViability?.status ?? null,
        candidateAssessment,
        adjudicationError,
        inputHash: ai.inputHash,
      },
    });
    if (applyToLead) {
      await updateLeadAiVerificationSummary(lead.id, verification, winProbabilityScore);
      await createAuditLog("ai_lead_verified", "lead", lead.id, {
        verificationId: verification.id,
        status: verification.status,
        websiteViability: verification.website_viability_status,
      });
    }
    return { success: true, cached: false, verification };
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI verification failed.";
    const parseError = error instanceof OpenAIResponseParseError
      ? serializeOpenAIResponseParseError(error)
      : null;
    const verification = await createAiLeadVerification({
      lead_id: lead.id,
      model,
      status: "error",
      recommendation: "manual_review",
      reason: message,
      summary: message,
      input_hash: inputHash,
      error: message,
      raw_json: parseError ? { parseError } : undefined,
      requested_by_user_id: actorUserId,
      request_source: requestSource,
    });
    await logAiUsageEvent({
      lead_id: lead.id,
      verification_id: verification.id,
      model,
      success: false,
      estimated_cost: 0,
      actor_user_id: actorUserId,
      request_source: requestSource,
      metadata: { error: message, inputHash, parseErrorStage: parseError?.stage ?? null },
    });
    if (applyToLead) {
      await markLeadAiError(lead.id, message);
      await createAuditLog("ai_lead_verification_failed", "lead", lead.id, { verificationId: verification.id, error: message });
    }
    return { error: message, verification };
  }
}

export async function repairLeadAiWebsiteViability(lead: Lead, latest: AiLeadVerification) {
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
    await markLeadAiVerified(lead.id, latest.input_hash ?? createLeadVerificationInputHash(lead));
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

export function computeLeadWinProbability(
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

export function isWeakWebsiteOpportunity(status: WebsiteViabilityStatus | null): boolean {
  return status === "broken" || status === "parked" || status === "placeholder";
}

function aiResultFromVerification(verification: AiLeadVerification): AiVerificationResult {
  const evidence = extractVerificationEvidence(verification.raw_json);
  const identityEvidence = evidence.identityMatch && typeof evidence.identityMatch === "object" && !Array.isArray(evidence.identityMatch)
    ? evidence.identityMatch as Record<string, unknown>
    : {};
  const identityMatch: AiVerificationResult["identityMatch"] = {
    name: normalizeIdentityMatchValue(identityEvidence.name),
    location: normalizeIdentityMatchValue(identityEvidence.location),
    phone: normalizeIdentityMatchValue(identityEvidence.phone),
    category: normalizeIdentityMatchValue(identityEvidence.category),
    summary: typeof identityEvidence.summary === "string" ? identityEvidence.summary : "No structured identity evidence recorded.",
  };
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
    candidateWebsites: Array.isArray(evidence.candidateWebsites) ? evidence.candidateWebsites as AiVerificationResult["candidateWebsites"] : [],
    identityMatch,
    officialSiteEvidence: Array.isArray(evidence.officialSiteEvidence) ? evidence.officialSiteEvidence.map(String) : [],
    contradictingEvidence: Array.isArray(evidence.contradictingEvidence) ? evidence.contradictingEvidence.map(String) : [],
    siteQualityFlags: Array.isArray(evidence.siteQualityFlags) ? evidence.siteQualityFlags.map(String) : [],
    manualReviewReason: typeof evidence.manualReviewReason === "string" ? evidence.manualReviewReason : null,
    evidenceGrade: evidence.evidenceGrade === "strong" || evidence.evidenceGrade === "moderate" || evidence.evidenceGrade === "conflicting" ? evidence.evidenceGrade : "weak",
  };
}

function normalizeIdentityMatchValue(value: unknown): AiVerificationResult["identityMatch"]["name"] {
  if (value === "exact" || value === "near" || value === "weak" || value === "mismatch") return value;
  return "unknown";
}

function isLeadEligibleForAiVerification(lead: Lead): boolean {
  return !lead.is_excluded &&
    lead.status !== "closed_won" &&
    lead.status !== "closed_lost" &&
    lead.business_status !== "CLOSED_PERMANENTLY" &&
    lead.business_status !== "CLOSED_TEMPORARILY";
}
