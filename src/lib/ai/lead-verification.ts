import { createHash } from "node:crypto";
import { z } from "zod";
import type { Lead } from "@/lib/db/queries";
import {
  estimateOpenAIUsageCost,
  getConfiguredOpenAIModel,
  getOpenAIApiKey,
  OPENAI_RESPONSES_ENDPOINT,
} from "./config";

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
}

export interface OpenAILeadVerificationResponse {
  result: AiVerificationResult;
  raw: Record<string, unknown>;
  inputHash: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

const sourceSchema = z.object({
  url: z.string().url(),
  title: z.string().nullable(),
  evidence: z.string().min(1).max(500),
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
    max_output_tokens: 900,
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

export async function callOpenAILeadVerifier(lead: Lead, apiKeyOverride?: string): Promise<OpenAILeadVerificationResponse> {
  const apiKey = (apiKeyOverride || getOpenAIApiKey()).trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const body = buildLeadVerificationRequest(lead);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

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

    const text = extractResponseText(raw);
    const result = parseAiVerificationResponse(text);
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
    clearTimeout(timeout);
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
  });
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
  },
};
