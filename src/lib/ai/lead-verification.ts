import { createHash } from "node:crypto";
import { z } from "zod";
import type { Lead } from "@/lib/db/queries";
import {
  estimateOpenAIUsageCost,
  getConfiguredOpenAIModel,
  getOpenAIApiKey,
  OPENAI_RESPONSES_ENDPOINT,
  type OpenAIUsageEstimate,
} from "./config";
import { buildLeadIdentityEvidencePacket, type EvidenceGrade, type IdentityMatchValue, type WebsiteCandidateAssessment } from "./lead-evidence";
import type { WebsiteViabilityResult } from "./website-viability";
import { createTimeoutAbortScope } from "@/lib/abort-scope";

export const AI_VERIFICATION_STATUSES = [
  "site_found",
  "no_site_found",
  "weak_site_found",
  "uncertain",
  "mismatch",
] as const;

export const AI_RECOMMENDATIONS = [
  "keep",
  "manual_review",
  "exclude",
  "prioritize",
  "update_website",
] as const;

export type AiVerificationStatus = (typeof AI_VERIFICATION_STATUSES)[number] | "not_checked" | "error";
export type AiRecommendation = (typeof AI_RECOMMENDATIONS)[number];

export interface AiVerificationSource {
  url: string;
  title: string | null;
  evidence: string;
}

export interface AiCandidateWebsiteEvidence {
  url: string;
  title: string | null;
  sourceUrl: string | null;
  evidence: string;
  isOfficialCandidate: boolean;
}

export interface AiIdentityMatchEvidence {
  name: IdentityMatchValue;
  location: IdentityMatchValue;
  phone: IdentityMatchValue;
  category: IdentityMatchValue;
  summary: string;
}

export interface AiVerificationResult {
  status: Exclude<AiVerificationStatus, "not_checked" | "error">;
  confidence: number;
  foundWebsiteUrl: string | null;
  foundEmail: string | null;
  foundPhone: string | null;
  socialProfiles: string[];
  sources: AiVerificationSource[];
  recommendation: AiRecommendation;
  reason: string;
  summary: string;
  candidateWebsites: AiCandidateWebsiteEvidence[];
  identityMatch: AiIdentityMatchEvidence;
  officialSiteEvidence: string[];
  contradictingEvidence: string[];
  siteQualityFlags: string[];
  manualReviewReason: string | null;
  evidenceGrade: EvidenceGrade;
}

export interface OpenAILeadVerificationResponse {
  result: AiVerificationResult;
  raw: Record<string, unknown>;
  inputHash: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export type OpenAIUsageErrorStage = "lead_verifier" | "lead_adjudicator" | "artifact_final" | "artifact_review";

export class OpenAIUsageError extends Error {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCost: number;

  constructor(
    message: string,
    readonly stage: OpenAIUsageErrorStage,
    usage: OpenAIUsageEstimate,
  ) {
    super(message);
    this.name = "OpenAIUsageError";
    this.inputTokens = usage.inputTokens;
    this.outputTokens = usage.outputTokens;
    this.estimatedCost = usage.estimatedCost;
  }
}

export class OpenAIResponseParseError extends OpenAIUsageError {
  constructor(
    message: string,
    stage: OpenAIUsageErrorStage,
    readonly responseText: string,
    readonly raw: Record<string, unknown>,
    usageOverride?: OpenAIUsageEstimate,
  ) {
    const usage = usageOverride ?? estimateOpenAIUsageCost(
      raw.usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined,
    );
    super(message, stage, usage);
    this.name = "OpenAIResponseParseError";
  }
}

const sourceSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  evidence: z.string().min(1).max(500),
});

const candidateWebsiteSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  sourceUrl: z.string().url().nullable(),
  evidence: z.string().min(1).max(500),
  isOfficialCandidate: z.boolean(),
});

const identityMatchSchema = z.object({
  name: z.enum(["exact", "near", "weak", "mismatch", "unknown"]).default("unknown"),
  location: z.enum(["exact", "near", "weak", "mismatch", "unknown"]).default("unknown"),
  phone: z.enum(["exact", "near", "weak", "mismatch", "unknown"]).default("unknown"),
  category: z.enum(["exact", "near", "weak", "mismatch", "unknown"]).default("unknown"),
  summary: z.string().min(1).max(500).default("Identity evidence was not summarized."),
}).default({
  name: "unknown",
  location: "unknown",
  phone: "unknown",
  category: "unknown",
  summary: "Identity evidence was not summarized.",
});

export const aiVerificationResultSchema = z.object({
  status: z.enum(AI_VERIFICATION_STATUSES),
  confidence: z.number().min(0).max(1),
  foundWebsiteUrl: z.string().url().nullable(),
  foundEmail: z.string().nullable(),
  foundPhone: z.string().nullable(),
  socialProfiles: z.array(z.string().url()).max(5),
  sources: z.array(sourceSchema).max(8),
  recommendation: z.enum(AI_RECOMMENDATIONS),
  reason: z.string().min(1).max(800),
  summary: z.string().min(1).max(1200),
  candidateWebsites: z.array(candidateWebsiteSchema).max(5).default([]),
  identityMatch: identityMatchSchema,
  officialSiteEvidence: z.array(z.string().min(1).max(240)).max(8).default([]),
  contradictingEvidence: z.array(z.string().min(1).max(240)).max(8).default([]),
  siteQualityFlags: z.array(z.string().min(1).max(80)).max(12).default([]),
  manualReviewReason: z.string().min(1).max(500).nullable().default(null),
  evidenceGrade: z.enum(["strong", "moderate", "weak", "conflicting"]).default("weak"),
}).superRefine((value, ctx) => {
  const claimsWebsite = value.status === "site_found" || value.status === "weak_site_found" || value.recommendation === "update_website" || value.recommendation === "exclude";
  if (claimsWebsite && !value.foundWebsiteUrl) {
    ctx.addIssue({ code: "custom", path: ["foundWebsiteUrl"], message: "Website claims require foundWebsiteUrl." });
  }
  if (claimsWebsite && value.sources.length === 0) {
    ctx.addIssue({ code: "custom", path: ["sources"], message: "Website claims require source URLs." });
  }
});

export function buildLeadVerificationRequest(lead: Lead): Record<string, unknown> {
  const model = getConfiguredOpenAIModel();
  return {
    model,
    store: false,
    max_output_tokens: 2400,
    max_tool_calls: 2,
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
    instructions: [
      "You perform identity research for one local business. The goal is to decide whether this exact business has an official website.",
      "Match identity before making any website claim: require exact or near business-name agreement plus at least one of city/address/phone/category agreement.",
      "Treat name-only matches, franchise/location ambiguity, old addresses, and unrelated same-name businesses as uncertain or mismatch.",
      "An official domain is the business's own domain. Directory listings, social profiles, Google Maps, Yelp, BBB, chamber pages, booking marketplaces, and aggregators are not official websites.",
      "If you find only directory or social evidence, return no official website, include the source URLs, and use prioritize or manual_review.",
      "If you find a possible official domain but identity is ambiguous, return the candidate URL with sources and use uncertain or mismatch, not site_found.",
      "Return candidateWebsites for every plausible website URL you considered, including rejected directory/social candidates.",
      "Return identityMatch, officialSiteEvidence, contradictingEvidence, siteQualityFlags, manualReviewReason, and evidenceGrade so a human can audit the finding.",
      "Do not treat domain existence as proof of a usable website; app code will verify website viability after you return a URL.",
      "Use web search sparingly. Prefer official business pages, domain contact pages, chamber/listing pages, and strong source agreement.",
      "Do not recommend exclusion unless you found a real official website that matches the business identity with high confidence and source evidence.",
      "In the reason, explicitly mention name match, city/address/phone evidence, official-domain vs directory/social evidence, and why confidence is high or low.",
      "In the summary, classify the finding as usable candidate, weak candidate, mismatched candidate, directory-only/no site, or needs manual review.",
      "Return only the strict JSON object requested by the schema.",
    ].join(" "),
    input: buildLeadVerificationInput(lead),
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "lead_ai_verification",
        strict: true,
        schema: leadVerificationJsonSchema,
      },
    },
  };
}

export function buildLeadVerificationAdjudicationRequest(
  lead: Lead,
  result: AiVerificationResult,
  websiteViability: WebsiteViabilityResult | null,
  candidateAssessment: WebsiteCandidateAssessment,
): Record<string, unknown> {
  const model = getConfiguredOpenAIModel();
  return {
    model,
    store: false,
    max_output_tokens: 2400,
    instructions: [
      "You are a no-browse adjudicator for local business website verification.",
      "Do not use web search, tools, browsing, or outside knowledge. You may only use the JSON context provided.",
      "You may revise status, confidence, recommendation, reason, summary, and evidence fields when deterministic checks contradict the original result.",
      "You cannot introduce new URLs, new sources, new phone numbers, or new email addresses.",
      "If deterministic candidateAssessment is reject, do not return site_found.",
      "If candidateAssessment is manual_review, prefer uncertain unless the original evidence is clearly strong.",
      "Return only strict JSON matching the schema.",
    ].join(" "),
    input: JSON.stringify({
      leadIdentityEvidence: buildLeadIdentityEvidencePacket(lead),
      originalResult: result,
      websiteViability,
      candidateAssessment,
      allowedWebsiteUrls: Array.from(new Set([
        result.foundWebsiteUrl,
        ...result.candidateWebsites.map((candidate) => candidate.url),
      ].filter(Boolean))),
      allowedSourceUrls: result.sources.map((source) => source.url),
    }),
    text: {
      verbosity: "low",
      format: {
        type: "json_schema",
        name: "lead_ai_verification_adjudication",
        strict: true,
        schema: leadVerificationJsonSchema,
      },
    },
  };
}

export async function callOpenAILeadVerifier(
  lead: Lead,
  apiKeyOverride?: string,
  options: { signal?: AbortSignal } = {},
): Promise<OpenAILeadVerificationResponse> {
  options.signal?.throwIfAborted();
  const apiKey = (apiKeyOverride || getOpenAIApiKey()).trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const body = buildLeadVerificationRequest(lead);
  const abortScope = createTimeoutAbortScope(options.signal, 45_000);

  try {
    const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: abortScope.signal,
    });

    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const message = extractOpenAIError(raw) ?? `OpenAI request failed with status ${response.status}`;
      throw new Error(message);
    }

    const result = parseOpenAILeadVerificationResponse(raw, "lead_verifier");
    const usage = estimateOpenAIUsageCost(raw.usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined);

    return {
      result,
      raw,
      inputHash: createLeadVerificationInputHash(lead),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCost: usage.estimatedCost,
    };
  } finally {
    abortScope.dispose();
  }
}

export async function callOpenAILeadVerificationAdjudicator(
  lead: Lead,
  result: AiVerificationResult,
  websiteViability: WebsiteViabilityResult | null,
  candidateAssessment: WebsiteCandidateAssessment,
  apiKeyOverride?: string,
  options: { signal?: AbortSignal } = {},
): Promise<OpenAILeadVerificationResponse> {
  options.signal?.throwIfAborted();
  const apiKey = (apiKeyOverride || getOpenAIApiKey()).trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const body = buildLeadVerificationAdjudicationRequest(lead, result, websiteViability, candidateAssessment);
  const abortScope = createTimeoutAbortScope(options.signal, 45_000);

  try {
    const response = await fetch(OPENAI_RESPONSES_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: abortScope.signal,
    });

    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const message = extractOpenAIError(raw) ?? `OpenAI request failed with status ${response.status}`;
      throw new Error(message);
    }

    const parsed = parseOpenAILeadVerificationResponse(raw, "lead_adjudicator");
    const resultWithBounds = enforceAdjudicationBounds(parsed, result, candidateAssessment);
    const usage = estimateOpenAIUsageCost(raw.usage as { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined);

    return {
      result: resultWithBounds,
      raw,
      inputHash: createLeadVerificationInputHash(lead),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      estimatedCost: usage.estimatedCost,
    };
  } finally {
    abortScope.dispose();
  }
}

export function parseAiVerificationResponse(text: string): AiVerificationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("AI verification returned invalid JSON.");
  }
  return aiVerificationResultSchema.parse(parsed);
}

export function serializeOpenAIResponseParseError(error: OpenAIResponseParseError): Record<string, unknown> {
  return {
    message: error.message,
    stage: error.stage,
    responseText: truncateForDiagnostics(error.responseText, 12_000),
    response: summarizeOpenAIResponse(error.raw),
    usage: {
      inputTokens: error.inputTokens,
      outputTokens: error.outputTokens,
      estimatedCost: error.estimatedCost,
    },
  };
}

export function isAiVerificationFresh(createdAt: string | null | undefined, ttlDays: number): boolean {
  if (!createdAt) return false;
  const ttlMs = Math.max(1, ttlDays) * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(createdAt).getTime() <= ttlMs;
}

export function createLeadVerificationInputHash(lead: Lead): string {
  return createHash("sha256").update(buildLeadVerificationInput(lead)).digest("hex");
}

function buildLeadVerificationInput(lead: Lead): string {
  return JSON.stringify({
    businessName: lead.name,
    address: lead.address,
    phone: lead.phone,
    googleMapsUrl: lead.maps_uri,
    googleWebsiteUrl: lead.website_uri,
    googleWebsiteStatus: lead.website_status,
    primaryType: lead.primary_type,
    businessType: lead.business_type,
    categories: lead.categories,
    rating: lead.rating,
    reviewCount: lead.review_count,
    identityEvidence: buildLeadIdentityEvidencePacket(lead),
  });
}

function enforceAdjudicationBounds(
  adjudicated: AiVerificationResult,
  original: AiVerificationResult,
  candidateAssessment: WebsiteCandidateAssessment,
): AiVerificationResult {
  const allowedUrls = new Set([
    original.foundWebsiteUrl,
    ...original.candidateWebsites.map((candidate) => candidate.url),
  ].filter(Boolean));
  const foundWebsiteUrl = adjudicated.foundWebsiteUrl && allowedUrls.has(adjudicated.foundWebsiteUrl)
    ? adjudicated.foundWebsiteUrl
    : original.foundWebsiteUrl;
  const allowedSourceUrls = new Set(original.sources.map((source) => source.url));
  const sources = adjudicated.sources.filter((source) => allowedSourceUrls.has(source.url));
  const bounded = {
    ...adjudicated,
    foundWebsiteUrl,
    sources: sources.length > 0 ? sources : original.sources,
    candidateWebsites: adjudicated.candidateWebsites.length > 0 ? adjudicated.candidateWebsites : original.candidateWebsites,
    siteQualityFlags: Array.from(new Set([...adjudicated.siteQualityFlags, ...candidateAssessment.flags])),
  };
  if (candidateAssessment.recommendation === "reject" && bounded.status === "site_found") {
    return {
      ...bounded,
      status: "uncertain",
      recommendation: "manual_review",
      confidence: Math.min(bounded.confidence, 0.68),
      manualReviewReason: bounded.manualReviewReason ?? "Deterministic candidate checks rejected the official-site finding.",
      evidenceGrade: "weak",
    };
  }
  return bounded;
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
  if (!text) throw new Error("AI verification returned no text output.");
  return text;
}

function parseOpenAILeadVerificationResponse(
  raw: Record<string, unknown>,
  stage: OpenAIResponseParseError["stage"],
): AiVerificationResult {
  let text = "";
  try {
    text = extractResponseText(raw);
    return parseAiVerificationResponse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI verification response could not be parsed.";
    throw new OpenAIResponseParseError(message, stage, text, raw);
  }
}

function summarizeOpenAIResponse(raw: Record<string, unknown>): Record<string, unknown> {
  const output = Array.isArray(raw.output) ? raw.output : [];
  return {
    id: typeof raw.id === "string" ? raw.id : null,
    status: typeof raw.status === "string" ? raw.status : null,
    model: typeof raw.model === "string" ? raw.model : null,
    incompleteDetails: raw.incomplete_details ?? null,
    error: raw.error ?? null,
    usage: raw.usage ?? null,
    output: output.map((item) => {
      const record = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
      const content = Array.isArray(record.content) ? record.content as Array<Record<string, unknown>> : [];
      return {
        type: record.type ?? null,
        status: record.status ?? null,
        content: content.map((contentItem) => ({
          type: contentItem.type ?? null,
          textLength: typeof contentItem.text === "string" ? contentItem.text.length : 0,
          textPreview: typeof contentItem.text === "string" ? truncateForDiagnostics(contentItem.text, 1000) : null,
        })),
      };
    }),
  };
}

function truncateForDiagnostics(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]` : value;
}

function extractOpenAIError(raw: Record<string, unknown>): string | null {
  const error = raw.error;
  if (typeof error === "object" && error !== null && typeof (error as Record<string, unknown>).message === "string") {
    return (error as Record<string, unknown>).message as string;
  }
  return null;
}

const leadVerificationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "status",
    "confidence",
    "foundWebsiteUrl",
    "foundEmail",
    "foundPhone",
    "socialProfiles",
    "sources",
    "recommendation",
    "reason",
    "summary",
    "candidateWebsites",
    "identityMatch",
    "officialSiteEvidence",
    "contradictingEvidence",
    "siteQualityFlags",
    "manualReviewReason",
    "evidenceGrade",
  ],
  properties: {
    status: { type: "string", enum: AI_VERIFICATION_STATUSES },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    foundWebsiteUrl: { type: ["string", "null"] },
    foundEmail: { type: ["string", "null"] },
    foundPhone: { type: ["string", "null"] },
    socialProfiles: {
      type: "array",
      maxItems: 5,
      items: { type: "string" },
    },
    sources: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "title", "evidence"],
        properties: {
          url: { type: "string" },
          title: { type: ["string", "null"] },
          evidence: { type: "string" },
        },
      },
    },
    recommendation: { type: "string", enum: AI_RECOMMENDATIONS },
    reason: { type: "string" },
    summary: { type: "string" },
    candidateWebsites: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "title", "sourceUrl", "evidence", "isOfficialCandidate"],
        properties: {
          url: { type: "string" },
          title: { type: ["string", "null"] },
          sourceUrl: { type: ["string", "null"] },
          evidence: { type: "string" },
          isOfficialCandidate: { type: "boolean" },
        },
      },
    },
    identityMatch: {
      type: "object",
      additionalProperties: false,
      required: ["name", "location", "phone", "category", "summary"],
      properties: {
        name: { type: "string", enum: ["exact", "near", "weak", "mismatch", "unknown"] },
        location: { type: "string", enum: ["exact", "near", "weak", "mismatch", "unknown"] },
        phone: { type: "string", enum: ["exact", "near", "weak", "mismatch", "unknown"] },
        category: { type: "string", enum: ["exact", "near", "weak", "mismatch", "unknown"] },
        summary: { type: "string" },
      },
    },
    officialSiteEvidence: { type: "array", items: { type: "string" }, maxItems: 8 },
    contradictingEvidence: { type: "array", items: { type: "string" }, maxItems: 8 },
    siteQualityFlags: { type: "array", items: { type: "string" }, maxItems: 12 },
    manualReviewReason: { type: ["string", "null"] },
    evidenceGrade: { type: "string", enum: ["strong", "moderate", "weak", "conflicting"] },
  },
};
