import { createHash } from "node:crypto";
import { z } from "zod";
import { getDb } from "@/lib/db/index";
import {
  getDemoByLeadId,
  getLatestAiVerification,
  type AiLeadVerification,
  type Lead,
  type LeadAiArtifactType,
} from "@/lib/db/queries";
import {
  estimateOpenAIUsageCost,
  getConfiguredOpenAIModel,
  getOpenAIApiKey,
  OPENAI_LEAD_VERIFICATION_MODEL,
  OPENAI_RESPONSES_ENDPOINT,
} from "@/lib/ai/config";
import type { AiVerificationSource } from "@/lib/ai/lead-verification";
import { extractVerificationEvidence } from "@/lib/ai/lead-evidence";

export const LEAD_INTELLIGENCE_PROMPT_VERSION = "lead-intelligence-v1";

const sourceSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  evidence: z.string().min(1).max(500),
});

const contentSectionSchema = z.object({
  title: z.string().min(1).max(80),
  goal: z.string().min(1).max(240),
  bullets: z.array(z.string().min(1).max(180)).min(1).max(6),
});

const pitchAngleTypeSchema = z.enum([
  "no_usable_site",
  "directory_only",
  "weak_site",
  "uncertain",
  "usable_site",
  "general_opportunity",
]);

const operatorPitchFields = {
  pitchAngleType: pitchAngleTypeSchema,
  verificationCaveat: z.string().min(1).max(500),
  callOpener: z.string().min(1).max(500),
  smsOpener: z.string().min(1).max(320),
  voicemailScript: z.string().min(1).max(600),
  followUpMessage: z.string().min(1).max(800),
  claimSupport: z.array(z.string().min(1).max(220)).min(1).max(8),
};

export const businessDetailSchema = z.object({
  artifact_type: z.literal("business_detail"),
  business_summary: z.string().min(1).max(1000),
  services: z.array(z.string().min(1).max(100)).min(1).max(12),
  target_customers: z.array(z.string().min(1).max(140)).min(1).max(8),
  differentiators: z.array(z.string().min(1).max(160)).min(1).max(8),
  trust_signals: z.array(z.string().min(1).max(160)).min(1).max(8),
  brand_tone: z.string().min(1).max(240),
  content_sections: z.array(contentSectionSchema).min(4).max(10),
  cta_strategy: z.string().min(1).max(500),
  seo_keywords: z.array(z.string().min(1).max(80)).min(3).max(20),
  image_direction: z.string().min(1).max(500),
  missing_info: z.array(z.string().min(1).max(160)).max(10),
  website_generation_prompt: z.string().min(200).max(4000),
  confidence: z.number().min(0).max(1),
  sources: z.array(sourceSchema).max(8),
  ...operatorPitchFields,
}).strict();

export const competitiveReportSchema = z.object({
  artifact_type: z.literal("competitive_report"),
  competitor_count: z.number().int().min(0),
  competitor_examples: z.array(z.object({
    name: z.string().min(1).max(140),
    website_status: z.string().min(1).max(80),
    rating: z.number().nullable(),
    review_count: z.number().int().nullable(),
    angle: z.string().min(1).max(220),
  }).strict()).max(8),
  website_status_mix: z.object({
    none: z.number().int().min(0),
    social: z.number().int().min(0),
    basic: z.number().int().min(0),
    custom: z.number().int().min(0),
    usable_ai_site: z.number().int().min(0),
    weak_or_broken: z.number().int().min(0),
    unknown: z.number().int().min(0),
  }).strict(),
  opportunity_angle: z.string().min(1).max(900),
  monthly_revenue_upside_range: z.object({
    low: z.number().min(0),
    high: z.number().min(0),
    currency: z.literal("USD"),
  }).strict(),
  assumptions: z.array(z.string().min(1).max(220)).min(2).max(10),
  objection_handling: z.array(z.string().min(1).max(260)).min(2).max(8),
  pitch_bullets: z.array(z.string().min(1).max(260)).min(3).max(10),
  data_gaps: z.array(z.string().min(1).max(180)).max(10),
  confidence: z.number().min(0).max(1),
  sources: z.array(sourceSchema).max(8),
  ...operatorPitchFields,
}).strict();

export type BusinessDetailContent = z.infer<typeof businessDetailSchema>;
export type CompetitiveReportContent = z.infer<typeof competitiveReportSchema>;
export type LeadAiArtifactContent = BusinessDetailContent | CompetitiveReportContent;

export interface CompetitorSnapshot {
  zip: string | null;
  primaryType: string | null;
  businessType: string | null;
  count: number;
  websiteStatusMix: CompetitiveReportContent["website_status_mix"];
  averageRating: number | null;
  averageReviewCount: number | null;
  topCompetitors: Array<{
    id: string;
    name: string | null;
    address: string | null;
    rating: number | null;
    review_count: number | null;
    website_status: string;
    ai_verification_status: string | null;
    ai_website_viability_status: string | null;
  }>;
}

export interface RevenueUpsideEstimate {
  low: number;
  high: number;
  assumptions: string[];
}

export interface LeadArtifactContext {
  lead: ReturnType<typeof serializeLeadForPrompt>;
  latestAiVerification: ReturnType<typeof serializeVerificationForPrompt> | null;
  demoUrlPath: string | null;
  competitorSnapshot: CompetitorSnapshot;
  pitchEvidence: ReturnType<typeof buildPitchEvidence>;
  revenueUpside: RevenueUpsideEstimate;
}

export interface OpenAILeadArtifactResponse {
  content: LeadAiArtifactContent;
  raw: Record<string, unknown>;
  inputHash: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export async function buildLeadArtifactContext(lead: Lead): Promise<LeadArtifactContext> {
  const [latestAiVerification, demo, competitorSnapshot] = await Promise.all([
    getLatestAiVerification(lead.id),
    getDemoByLeadId(lead.id),
    getCompetitorSnapshot(lead),
  ]);
  return {
    lead: serializeLeadForPrompt(lead),
    latestAiVerification: latestAiVerification ? serializeVerificationForPrompt(latestAiVerification) : null,
    demoUrlPath: demo ? `/demo/${demo.slug}` : null,
    competitorSnapshot,
    pitchEvidence: buildPitchEvidence(lead, latestAiVerification),
    revenueUpside: estimateConservativeMonthlyRevenueUpside(lead, competitorSnapshot),
  };
}

export function createLeadArtifactInputHash(artifactType: LeadAiArtifactType, context: LeadArtifactContext): string {
  return createHash("sha256")
    .update(JSON.stringify({ artifactType, promptVersion: LEAD_INTELLIGENCE_PROMPT_VERSION, context }))
    .digest("hex");
}

export async function callOpenAILeadArtifact(
  lead: Lead,
  artifactType: LeadAiArtifactType,
  apiKeyOverride?: string,
): Promise<OpenAILeadArtifactResponse> {
  const apiKey = (apiKeyOverride || getOpenAIApiKey()).trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const model = getConfiguredOpenAIModel();
  if (model !== OPENAI_LEAD_VERIFICATION_MODEL) {
    throw new Error("AI model guardrail rejected the configured model.");
  }

  const context = await buildLeadArtifactContext(lead);
  const inputHash = createLeadArtifactInputHash(artifactType, context);
  const functionPlanning = await callArtifactFunctionPlanning(apiKey, lead.id, artifactType);
  const functionOutputs = buildRequiredFunctionOutputs(artifactType, context, extractFunctionCalls(functionPlanning.raw));
  const final = await callArtifactFinal(apiKey, artifactType, context, functionOutputs);
  const text = extractResponseText(final.raw);
  let content = parseLeadArtifactResponse(artifactType, text);
  let reviewRaw: Record<string, unknown> | null = null;
  let reviewError: string | null = null;
  try {
    const review = await callArtifactReview(apiKey, artifactType, context, content);
    reviewRaw = review.raw;
    content = parseLeadArtifactResponse(artifactType, extractResponseText(review.raw));
  } catch (error) {
    reviewError = error instanceof Error ? error.message : "Lead intelligence review failed.";
  }
  const usage = mergeUsage(functionPlanning.raw.usage, final.raw.usage, reviewRaw?.usage);
  const costUsage = mergeUsage(functionPlanning.raw.usage, final.raw.usage);

  return {
    content,
    raw: {
      functionPlanning: functionPlanning.raw,
      functionOutputs,
      final: final.raw,
      review: reviewRaw,
      reviewError,
    },
    inputHash,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedCost: costUsage.estimatedCost,
  };
}

export function parseLeadArtifactResponse(artifactType: LeadAiArtifactType, text: string): LeadAiArtifactContent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Lead intelligence returned invalid JSON.");
  }
  return artifactType === "business_detail"
    ? businessDetailSchema.parse(parsed)
    : competitiveReportSchema.parse(parsed);
}

export function extractArtifactSources(content: LeadAiArtifactContent): AiVerificationSource[] {
  return content.sources;
}

export async function getCompetitorSnapshot(lead: Lead, limit = 8): Promise<CompetitorSnapshot> {
  const zip = extractZip(lead.address);
  const primaryType = lead.primary_type;
  const db = await getDb();
  const params: unknown[] = [lead.id];
  const conditions = ["id != ?"];

  if (primaryType) {
    conditions.push("primary_type = ?");
    params.push(primaryType);
  } else if (lead.business_type) {
    conditions.push("business_type = ?");
    params.push(lead.business_type);
  }

  if (zip) {
    conditions.push("address LIKE ?");
    params.push(`%${zip}%`);
  } else if (lead.address) {
    const city = extractCity(lead.address);
    if (city) {
      conditions.push("address LIKE ?");
      params.push(`%${city}%`);
    }
  }

  const where = conditions.join(" AND ");
  const allRows = await db.prepare(
    `SELECT website_status, ai_verification_status, ai_website_viability_status, rating, review_count
     FROM leads
     WHERE ${where}`
  ).all(...params) as Array<Record<string, unknown>>;

  const topRows = await db.prepare(
    `SELECT id, name, address, rating, review_count, website_status, ai_verification_status, ai_website_viability_status
     FROM leads
     WHERE ${where}
     ORDER BY COALESCE(review_count, 0) DESC, COALESCE(rating, 0) DESC
     LIMIT ?`
  ).all(...params, Math.max(1, Math.min(20, Math.floor(limit)))) as Array<Record<string, unknown>>;

  const websiteStatusMix: CompetitorSnapshot["websiteStatusMix"] = {
    none: 0,
    social: 0,
    basic: 0,
    custom: 0,
    usable_ai_site: 0,
    weak_or_broken: 0,
    unknown: 0,
  };

  let ratingTotal = 0;
  let ratingCount = 0;
  let reviewTotal = 0;
  let reviewCount = 0;

  for (const row of allRows) {
    const websiteStatus = String(row.website_status ?? "unknown");
    if (websiteStatus === "none" || websiteStatus === "social" || websiteStatus === "basic" || websiteStatus === "custom") {
      websiteStatusMix[websiteStatus] += 1;
    } else {
      websiteStatusMix.unknown += 1;
    }
    if (row.ai_verification_status === "site_found" && row.ai_website_viability_status === "usable") {
      websiteStatusMix.usable_ai_site += 1;
    }
    if (row.ai_website_viability_status === "broken" || row.ai_website_viability_status === "parked" || row.ai_website_viability_status === "placeholder") {
      websiteStatusMix.weak_or_broken += 1;
    }
    const rating = Number(row.rating);
    if (Number.isFinite(rating) && rating > 0) {
      ratingTotal += rating;
      ratingCount += 1;
    }
    const reviews = Number(row.review_count);
    if (Number.isFinite(reviews) && reviews >= 0) {
      reviewTotal += reviews;
      reviewCount += 1;
    }
  }

  return {
    zip,
    primaryType,
    businessType: lead.business_type,
    count: allRows.length,
    websiteStatusMix,
    averageRating: ratingCount > 0 ? round(ratingTotal / ratingCount, 1) : null,
    averageReviewCount: reviewCount > 0 ? Math.round(reviewTotal / reviewCount) : null,
    topCompetitors: topRows.map((row) => ({
      id: String(row.id),
      name: (row.name as string | null) ?? null,
      address: (row.address as string | null) ?? null,
      rating: row.rating == null ? null : Number(row.rating),
      review_count: row.review_count == null ? null : Number(row.review_count),
      website_status: String(row.website_status ?? "unknown"),
      ai_verification_status: (row.ai_verification_status as string | null) ?? null,
      ai_website_viability_status: (row.ai_website_viability_status as string | null) ?? null,
    })),
  };
}

export function estimateConservativeMonthlyRevenueUpside(lead: Lead, snapshot: CompetitorSnapshot): RevenueUpsideEstimate {
  const profile = averageCustomerValueForLead(lead);
  const confidenceMultiplier = lead.ai_verification_status === "no_site_found" ? 1 : lead.ai_verification_status === "weak_site_found" ? 0.85 : 0.65;
  const densityMultiplier = snapshot.count >= 15 ? 1.35 : snapshot.count >= 8 ? 1.2 : snapshot.count >= 3 ? 1.05 : 0.85;
  const reviewMultiplier = (lead.review_count ?? 0) >= 100 ? 1.2 : (lead.review_count ?? 0) >= 25 ? 1.05 : 0.9;
  const contactabilityRaw = Number(lead.contactability_score ?? 0);
  const normalizedContactability = contactabilityRaw > 1 ? contactabilityRaw / 100 : contactabilityRaw;
  const contactMultiplier = Math.max(
    0.7,
    Math.min(1.15, normalizedContactability > 0 ? normalizedContactability : (lead.phone ? 0.9 : 0.75)),
  );
  const lowExtraVisitors = Math.max(3, Math.round(6 * confidenceMultiplier * densityMultiplier * reviewMultiplier));
  const highExtraVisitors = Math.max(lowExtraVisitors + 2, Math.round(14 * confidenceMultiplier * densityMultiplier * reviewMultiplier));
  const low = Math.round(lowExtraVisitors * profile.low * 0.18 * contactMultiplier);
  const high = Math.round(highExtraVisitors * profile.high * 0.28 * contactMultiplier);

  return {
    low,
    high: Math.max(high, low),
    assumptions: [
      `Conservative estimate assumes ${lowExtraVisitors}-${highExtraVisitors} additional qualified website visitors or calls per month.`,
      `Average customer value range for this category is estimated at $${profile.low}-$${profile.high}.`,
      "Only 18%-28% of extra qualified inquiries are assumed to become paying customers.",
      `Local similar-business count in discovered data is ${snapshot.count}.`,
    ],
  };
}

function serializeLeadForPrompt(lead: Lead) {
  return {
    id: lead.id,
    name: lead.name,
    address: lead.address,
    phone: lead.phone,
    categories: lead.categories,
    primaryType: lead.primary_type,
    businessType: lead.business_type,
    rating: lead.rating,
    reviewCount: lead.review_count,
    websiteUri: lead.website_uri,
    websiteStatus: lead.website_status,
    mapsUri: lead.maps_uri,
    businessStatus: lead.business_status,
    reviewHighlights: lead.review_highlights,
    editorialSummary: lead.editorial_summary,
    websiteHealth: lead.website_health,
    recommendedOffer: lead.recommended_offer,
    qualityReason: lead.quality_reason,
    nextBestAction: lead.next_best_action,
    score: lead.score,
    rawOpportunityScore: lead.raw_opportunity_score,
    verificationScore: lead.verification_score,
    salesPriorityScore: lead.sales_priority_score,
    estimatedDealValue: lead.estimated_deal_value,
    contactabilityScore: lead.contactability_score,
  };
}

function serializeVerificationForPrompt(verification: AiLeadVerification) {
  return {
    status: verification.status,
    confidence: verification.confidence,
    foundWebsiteUrl: verification.found_website_url,
    foundEmail: verification.found_email,
    foundPhone: verification.found_phone,
    socialProfiles: verification.social_profiles,
    sources: verification.sources,
    recommendation: verification.recommendation,
    reason: verification.reason,
    summary: verification.summary,
    websiteViabilityStatus: verification.website_viability_status,
    websiteViabilityReason: verification.website_viability_reason,
    websiteHealth: verification.website_health_json,
    checkedAt: verification.created_at,
  };
}

function buildPitchEvidence(lead: Lead, latestAiVerification: AiLeadVerification | null) {
  const aiStatus = latestAiVerification?.status ?? lead.ai_verification_status;
  const viability = latestAiVerification?.website_viability_status ?? lead.ai_website_viability_status;
  const confidence = latestAiVerification?.confidence ?? lead.ai_confidence;
  const websiteUrl = latestAiVerification?.found_website_url ?? lead.ai_found_website_url ?? lead.website_uri;
  const sources = latestAiVerification?.sources ?? [];
  const rawEvidence = extractVerificationEvidence(latestAiVerification?.raw_json);
  const evidenceGrade = typeof rawEvidence.evidenceGrade === "string" ? rawEvidence.evidenceGrade : inferEvidenceGrade(aiStatus, viability, confidence);
  const candidateAssessment = rawEvidence.candidateAssessment && typeof rawEvidence.candidateAssessment === "object" && !Array.isArray(rawEvidence.candidateAssessment)
    ? rawEvidence.candidateAssessment
    : null;

  let finding = "Needs manual review";
  if (aiStatus === "no_site_found" || viability === "directory_only") finding = "No usable official website found";
  else if (aiStatus === "weak_site_found" || viability === "broken" || viability === "parked" || viability === "placeholder") finding = `Weak website opportunity: ${viability ?? "weak site"}`;
  else if (aiStatus === "site_found" && viability === "usable") finding = "Usable official website found";
  else if (aiStatus === "uncertain" || aiStatus === "mismatch") finding = "Website identity is ambiguous";

  const dataGaps = [
    !lead.phone ? "No phone number in Places data" : null,
    !lead.address ? "No address in Places data" : null,
    !lead.review_count ? "No review count available" : null,
    aiStatus === "not_checked" ? "AI website verification has not completed" : null,
  ].filter(Boolean) as string[];

  return {
    finding,
    aiStatus,
    websiteViabilityStatus: viability,
    confidence,
    websiteUrl,
    sources,
    dataGaps,
    evidenceGrade,
    candidateAssessment,
    verificationCaveat: buildVerificationCaveat(aiStatus, viability, evidenceGrade),
  };
}

function inferEvidenceGrade(aiStatus: string | null | undefined, viability: string | null | undefined, confidence: number | null | undefined): string {
  if ((aiStatus === "no_site_found" || viability === "directory_only") && Number(confidence ?? 0) >= 0.8) return "strong";
  if ((aiStatus === "weak_site_found" || viability === "broken" || viability === "parked" || viability === "placeholder") && Number(confidence ?? 0) >= 0.65) return "moderate";
  if (aiStatus === "uncertain" || aiStatus === "mismatch") return "conflicting";
  if (aiStatus === "site_found" && viability === "usable") return "moderate";
  return "weak";
}

function buildVerificationCaveat(aiStatus: string | null | undefined, viability: string | null | undefined, evidenceGrade: string): string {
  if (evidenceGrade === "strong" && (aiStatus === "no_site_found" || viability === "directory_only")) {
    return "Public evidence strongly supports a no-usable-official-site outreach angle.";
  }
  if (viability === "broken" || viability === "parked" || viability === "placeholder") {
    return "Frame this as a weak or broken web-presence opportunity, not as a business with no website.";
  }
  if (aiStatus === "site_found" && viability === "usable") {
    return "A usable official site may exist; avoid no-site claims and focus only on confirmed gaps.";
  }
  return "Use cautious wording because the website evidence needs human confirmation.";
}

async function callArtifactFunctionPlanning(apiKey: string, leadId: string, artifactType: LeadAiArtifactType) {
  const raw = await callResponsesApi(apiKey, {
    model: OPENAI_LEAD_VERIFICATION_MODEL,
    store: false,
    max_output_tokens: 300,
    tools: functionToolDefinitions,
    tool_choice: "auto",
    instructions: [
      "You are preparing data for a lead intelligence report.",
      "Call the available app function tools that are relevant. Do not write the final report in this step.",
      artifactType === "competitive_report"
        ? "For competitive_report, request lead context, competitor snapshot, and pitch evidence."
        : "For business_detail, request lead context and pitch evidence.",
    ].join(" "),
    input: `Prepare deterministic context for lead ${leadId} and artifact type ${artifactType}.`,
  });
  return { raw };
}

async function callArtifactFinal(
  apiKey: string,
  artifactType: LeadAiArtifactType,
  context: LeadArtifactContext,
  functionOutputs: Array<{ name: string; output: unknown }>,
) {
  const raw = await callResponsesApi(apiKey, buildArtifactFinalRequest(artifactType, context, functionOutputs));
  return { raw };
}

async function callArtifactReview(
  apiKey: string,
  artifactType: LeadAiArtifactType,
  context: LeadArtifactContext,
  content: LeadAiArtifactContent,
) {
  const raw = await callResponsesApi(apiKey, buildArtifactReviewRequest(artifactType, context, content));
  return { raw };
}

export function buildArtifactFinalRequest(
  artifactType: LeadAiArtifactType,
  context: LeadArtifactContext,
  functionOutputs: Array<{ name: string; output: unknown }>,
): Record<string, unknown> {
  return {
    model: OPENAI_LEAD_VERIFICATION_MODEL,
    store: false,
    max_output_tokens: artifactType === "business_detail" ? 2600 : 2200,
    include: ["web_search_call.action.sources"],
    tools: [
      {
        type: "web_search",
        user_location: {
          type: "approximate",
          country: "US",
          region: "Colorado",
        },
      },
    ],
    tool_choice: "auto",
    instructions: buildFinalInstructions(artifactType),
    input: JSON.stringify({
      artifactType,
      promptVersion: LEAD_INTELLIGENCE_PROMPT_VERSION,
      deterministicFunctionOutputs: functionOutputs,
      deterministicContext: context,
    }),
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: artifactType,
        strict: true,
        schema: artifactType === "business_detail" ? businessDetailJsonSchema : competitiveReportJsonSchema,
      },
    },
  };
}

export function buildArtifactReviewRequest(
  artifactType: LeadAiArtifactType,
  context: LeadArtifactContext,
  content: LeadAiArtifactContent,
): Record<string, unknown> {
  return {
    model: OPENAI_LEAD_VERIFICATION_MODEL,
    store: false,
    max_output_tokens: artifactType === "business_detail" ? 1800 : 1600,
    instructions: [
      "You are a no-browse reviewer for internal lead intelligence artifacts.",
      "Do not use web search, tools, browsing, or outside knowledge. Use only deterministic context and the draft artifact JSON.",
      "Rewrite overclaims into cautious operator-safe language.",
      "Do not claim the business has no website unless pitchEvidence.evidenceGrade is strong or moderate and the finding supports no usable official website.",
      "Keep source-backed facts, exact revenue range, and competitor counts unchanged.",
      "Return only strict JSON matching the same artifact schema.",
    ].join(" "),
    input: JSON.stringify({
      artifactType,
      promptVersion: LEAD_INTELLIGENCE_PROMPT_VERSION,
      deterministicContext: context,
      draftArtifact: content,
    }),
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: `${artifactType}_review`,
        strict: true,
        schema: artifactType === "business_detail" ? businessDetailJsonSchema : competitiveReportJsonSchema,
      },
    },
  };
}

async function callResponsesApi(apiKey: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const message = extractOpenAIError(raw) ?? `OpenAI request failed with status ${response.status}`;
      throw new Error(message);
    }
    return raw;
  } finally {
    clearTimeout(timeout);
  }
}

function buildRequiredFunctionOutputs(
  artifactType: LeadAiArtifactType,
  context: LeadArtifactContext,
  calls: Array<{ name: string; arguments: Record<string, unknown> }>,
): Array<{ name: string; output: unknown }> {
  const required = artifactType === "competitive_report"
    ? ["get_lead_context", "get_competitor_snapshot", "get_pitch_evidence"]
    : ["get_lead_context", "get_pitch_evidence"];
  const requested = new Set(calls.map((call) => call.name));
  const names = new Set([...required, ...requested]);
  return Array.from(names).map((name) => ({
    name,
    output: executeArtifactFunction(name, context),
  }));
}

function executeArtifactFunction(name: string, context: LeadArtifactContext): unknown {
  if (name === "get_competitor_snapshot") return context.competitorSnapshot;
  if (name === "get_pitch_evidence") return { pitchEvidence: context.pitchEvidence, revenueUpside: context.revenueUpside };
  return {
    lead: context.lead,
    latestAiVerification: context.latestAiVerification,
    demoUrlPath: context.demoUrlPath,
  };
}

function extractFunctionCalls(raw: Record<string, unknown>): Array<{ name: string; arguments: Record<string, unknown> }> {
  const output = Array.isArray(raw.output) ? raw.output : [];
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "function_call" || typeof record.name !== "string") continue;
    let args: Record<string, unknown> = {};
    if (typeof record.arguments === "string") {
      try {
        const parsed = JSON.parse(record.arguments);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
      } catch {
        args = {};
      }
    }
    calls.push({ name: record.name, arguments: args });
  }
  return calls;
}

function buildFinalInstructions(artifactType: LeadAiArtifactType): string {
  const shared = [
    "You create sales-ready intelligence for an internal website lead-generation app.",
    "Use only gpt-5.4-mini. Return only strict JSON matching the schema.",
    "The deterministicFunctionOutputs and deterministicContext are source-of-truth for counts, revenue estimates, website findings, ratings, and review counts.",
    "Do not invent hard counts, URLs, revenue numbers, phone numbers, or addresses. If evidence is missing, put it in data gaps or missing info.",
    "Use web search only for supplemental context and cite sources you actually used in the sources array.",
    "Keep claims conservative and pitch-useful. The brother will use this live on calls.",
    "Include operator-ready call, SMS, voicemail, follow-up, caveat, pitch angle, and claim support fields.",
    "If verification evidence is weak or uncertain, use cautious phrasing such as 'I could not confirm a usable official site' instead of hard no-site claims.",
  ];
  if (artifactType === "business_detail") {
    return [
      ...shared,
      "Create a detailed website build brief and a copy-ready website_generation_prompt.",
      "The website_generation_prompt must be specific enough for another AI to generate a website without more context.",
      "Include services, target customers, content sections, CTA strategy, SEO keywords, visual direction, and missing info.",
    ].join(" ");
  }
  return [
    ...shared,
    "Create a competitive pitch brief.",
    "Use the deterministic conservative monthly revenue upside range exactly; do not inflate it.",
    "Explain competitor density, website gap, pitch angle, objection handling, and practical talking points.",
  ].join(" ");
}

function extractResponseText(raw: Record<string, unknown>): string {
  if (typeof raw.output_text === "string") return raw.output_text;
  const output = Array.isArray(raw.output) ? raw.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const content = typeof item === "object" && item !== null && Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as Array<Record<string, unknown>>
      : [];
    for (const contentItem of content) {
      if (typeof contentItem.text === "string") chunks.push(contentItem.text);
    }
  }
  const text = chunks.join("\n").trim();
  if (!text) throw new Error("Lead intelligence returned no text output.");
  return text;
}

function extractOpenAIError(raw: Record<string, unknown>): string | null {
  const error = raw.error;
  if (typeof error === "object" && error !== null && typeof (error as Record<string, unknown>).message === "string") {
    return (error as Record<string, unknown>).message as string;
  }
  return null;
}

function mergeUsage(...usages: unknown[]) {
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let estimatedCost = 0;
  for (const usage of usages) {
    const estimate = estimateOpenAIUsageCost(usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined);
    inputTokens += estimate.inputTokens;
    outputTokens += estimate.outputTokens;
    totalTokens += estimate.totalTokens;
    estimatedCost += estimate.estimatedCost;
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCost: Math.round(estimatedCost * 10000) / 10000,
  };
}

function averageCustomerValueForLead(lead: Lead): { low: number; high: number } {
  const tokens = [lead.business_type, lead.primary_type, ...lead.categories].join(" ").toLowerCase();
  if (/(dent|orthodont|implant)/.test(tokens)) return { low: 350, high: 900 };
  if (/(law|attorney|legal)/.test(tokens)) return { low: 800, high: 2500 };
  if (/(hvac|plumb|electric|roof|contractor|construction)/.test(tokens)) return { low: 300, high: 1200 };
  if (/(med spa|spa|chiropractor|clinic|therapy|veterinary|vet)/.test(tokens)) return { low: 180, high: 650 };
  if (/(auto|repair|mechanic)/.test(tokens)) return { low: 180, high: 700 };
  if (/(restaurant|cafe|bar)/.test(tokens)) return { low: 35, high: 90 };
  if (/(salon|barber|beauty|fitness|gym)/.test(tokens)) return { low: 55, high: 180 };
  return { low: 100, high: 450 };
}

function extractZip(address: string | null): string | null {
  if (!address) return null;
  const match = address.match(/\b(\d{5})\b/);
  return match ? match[1] : null;
}

function extractCity(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2]?.replace(/\s+\d{5}.*/, "") ?? null;
  return parts[0] ?? null;
}

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

const functionToolDefinitions = [
  {
    type: "function",
    name: "get_lead_context",
    description: "Return deterministic lead context, latest AI verification, scoring, review, and demo data.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["leadId"],
      properties: {
        leadId: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "get_competitor_snapshot",
    description: "Return deterministic similar-business counts, website mix, benchmarks, and top competitors from the app database.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["leadId"],
      properties: {
        leadId: { type: "string" },
      },
    },
  },
  {
    type: "function",
    name: "get_pitch_evidence",
    description: "Return deterministic website finding, source evidence, data gaps, and conservative revenue upside.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["leadId"],
      properties: {
        leadId: { type: "string" },
      },
    },
  },
];

const sourceJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["url", "title", "evidence"],
  properties: {
    url: { type: "string" },
    title: { type: ["string", "null"] },
    evidence: { type: "string" },
  },
};

const operatorPitchJsonSchemaProperties = {
  pitchAngleType: {
    type: "string",
    enum: ["no_usable_site", "directory_only", "weak_site", "uncertain", "usable_site", "general_opportunity"],
  },
  verificationCaveat: { type: "string" },
  callOpener: { type: "string" },
  smsOpener: { type: "string" },
  voicemailScript: { type: "string" },
  followUpMessage: { type: "string" },
  claimSupport: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
};

const operatorPitchRequiredFields = [
  "pitchAngleType",
  "verificationCaveat",
  "callOpener",
  "smsOpener",
  "voicemailScript",
  "followUpMessage",
  "claimSupport",
];

const businessDetailJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "artifact_type",
    "business_summary",
    "services",
    "target_customers",
    "differentiators",
    "trust_signals",
    "brand_tone",
    "content_sections",
    "cta_strategy",
    "seo_keywords",
    "image_direction",
    "missing_info",
    "website_generation_prompt",
    "confidence",
    "sources",
    ...operatorPitchRequiredFields,
  ],
  properties: {
    artifact_type: { type: "string", enum: ["business_detail"] },
    business_summary: { type: "string" },
    services: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 },
    target_customers: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    differentiators: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    trust_signals: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
    brand_tone: { type: "string" },
    content_sections: {
      type: "array",
      minItems: 4,
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "goal", "bullets"],
        properties: {
          title: { type: "string" },
          goal: { type: "string" },
          bullets: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        },
      },
    },
    cta_strategy: { type: "string" },
    seo_keywords: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 20 },
    image_direction: { type: "string" },
    missing_info: { type: "array", items: { type: "string" }, maxItems: 10 },
    website_generation_prompt: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sources: { type: "array", items: sourceJsonSchema, maxItems: 8 },
    ...operatorPitchJsonSchemaProperties,
  },
};

const competitiveReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "artifact_type",
    "competitor_count",
    "competitor_examples",
    "website_status_mix",
    "opportunity_angle",
    "monthly_revenue_upside_range",
    "assumptions",
    "objection_handling",
    "pitch_bullets",
    "data_gaps",
    "confidence",
    "sources",
    ...operatorPitchRequiredFields,
  ],
  properties: {
    artifact_type: { type: "string", enum: ["competitive_report"] },
    competitor_count: { type: "integer", minimum: 0 },
    competitor_examples: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "website_status", "rating", "review_count", "angle"],
        properties: {
          name: { type: "string" },
          website_status: { type: "string" },
          rating: { type: ["number", "null"] },
          review_count: { type: ["integer", "null"] },
          angle: { type: "string" },
        },
      },
    },
    website_status_mix: {
      type: "object",
      additionalProperties: false,
      required: ["none", "social", "basic", "custom", "usable_ai_site", "weak_or_broken", "unknown"],
      properties: {
        none: { type: "integer", minimum: 0 },
        social: { type: "integer", minimum: 0 },
        basic: { type: "integer", minimum: 0 },
        custom: { type: "integer", minimum: 0 },
        usable_ai_site: { type: "integer", minimum: 0 },
        weak_or_broken: { type: "integer", minimum: 0 },
        unknown: { type: "integer", minimum: 0 },
      },
    },
    opportunity_angle: { type: "string" },
    monthly_revenue_upside_range: {
      type: "object",
      additionalProperties: false,
      required: ["low", "high", "currency"],
      properties: {
        low: { type: "number", minimum: 0 },
        high: { type: "number", minimum: 0 },
        currency: { type: "string", enum: ["USD"] },
      },
    },
    assumptions: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 10 },
    objection_handling: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 8 },
    pitch_bullets: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 10 },
    data_gaps: { type: "array", items: { type: "string" }, maxItems: 10 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    sources: { type: "array", items: sourceJsonSchema, maxItems: 8 },
    ...operatorPitchJsonSchemaProperties,
  },
};
