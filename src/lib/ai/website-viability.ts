import type { Lead } from "@/lib/db/queries";
import {
  fetchSafeHttpUrl,
  type SafeHttpFetch,
  type SafeHttpLookup,
} from "@/lib/safe-http";
import type { AiRecommendation, AiVerificationResult } from "./lead-verification";
import { createTimeoutAbortScope } from "@/lib/abort-scope";

export const WEBSITE_VIABILITY_STATUSES = [
  "usable",
  "broken",
  "parked",
  "placeholder",
  "directory_only",
  "unknown",
] as const;

export type WebsiteViabilityStatus = (typeof WEBSITE_VIABILITY_STATUSES)[number];

export interface WebsiteHealthSnapshot {
  [key: string]: unknown;
  requestedUrl: string;
  finalUrl: string;
  statusCode: number | null;
  method: "HEAD" | "GET" | "NONE";
  responseMs: number;
  redirected: boolean;
  ssl: boolean;
  title: string | null;
  contentLength: number;
  businessSignalScore: number;
  matchedSignals: string[];
  classifierSignals: string[];
  error?: string;
}

export interface WebsiteViabilityResult {
  status: WebsiteViabilityStatus;
  reason: string;
  health: WebsiteHealthSnapshot;
}

export interface NormalizedAiVerification {
  result: AiVerificationResult;
  websiteViability: WebsiteViabilityResult | null;
}

const DEFAULT_TIMEOUT_MS = 7000;
const MAX_BODY_BYTES = 120_000;
const MAX_BODY_CHARS = 120_000;

const BROKEN_PATTERNS = [
  /\b404\b/i,
  /page not found/i,
  /not found/i,
  /halaman tidak ditemukan/i,
  /tidak ditemukan/i,
  /url salah/i,
  /dipindahkan/i,
  /the requested url was not found/i,
  /cannot be found/i,
];

const PARKED_PATTERNS = [
  /domain (is )?parked/i,
  /parked free/i,
  /buy this domain/i,
  /this domain is for sale/i,
  /afternic/i,
  /sedo parking/i,
  /hugedomains/i,
  /godaddy\.com\/forsale/i,
  /namecheap parking/i,
  /domain has expired/i,
];

const PLACEHOLDER_PATTERNS = [
  /coming soon/i,
  /under construction/i,
  /site under construction/i,
  /launching soon/i,
  /default web site page/i,
  /apache2 ubuntu default page/i,
  /welcome to nginx/i,
  /plesk default page/i,
  /cpanel default/i,
  /this site is currently unavailable/i,
  /account suspended/i,
  /future home of/i,
  /index of \//i,
];

const GENERIC_NAME_TOKENS = new Set([
  "the",
  "and",
  "llc",
  "inc",
  "corp",
  "company",
  "co",
  "dr",
  "dds",
  "dmd",
  "md",
  "pc",
  "pllc",
  "ltd",
  "services",
  "service",
  "clinic",
  "office",
]);

export async function assessWebsiteViability(
  lead: Lead,
  candidateUrl: string,
  options: { fetchImpl?: SafeHttpFetch; lookupImpl?: SafeHttpLookup; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<WebsiteViabilityResult> {
  options.signal?.throwIfAborted();
  const requestedUrl = normalizeCandidateUrl(candidateUrl);
  const startedAt = Date.now();
  const fetchImpl = options.fetchImpl;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!requestedUrl) {
    return {
      status: "unknown",
      reason: "AI returned an invalid website URL.",
      health: emptyHealth(candidateUrl, Date.now() - startedAt, "Invalid URL"),
    };
  }

  const head = await fetchWithTimeout(fetchImpl, options.lookupImpl, requestedUrl, "HEAD", timeoutMs, options.signal);
  let chosen = head;
  let body = "";

  if (!head.response || head.response.status >= 400 || head.response.status === 403 || head.response.status === 405) {
    chosen = await fetchWithTimeout(fetchImpl, options.lookupImpl, requestedUrl, "GET", timeoutMs, options.signal);
    body = chosen.body;
  } else {
    const get = await fetchWithTimeout(fetchImpl, options.lookupImpl, requestedUrl, "GET", timeoutMs, options.signal);
    if (get.response) {
      chosen = get;
      body = get.body;
    }
  }

  const response = chosen.response;
  const finalUrl = chosen.finalUrl || requestedUrl;
  const statusCode = response?.status ?? null;
  const title = extractTitle(body);
  const readableText = htmlToText(body).slice(0, 20_000);
  const combined = `${title ?? ""}\n${readableText}`;
  const classifierSignals = findClassifierSignals(combined, statusCode);
  const businessSignals = findBusinessSignals(lead, combined, title, finalUrl);
  const responseMs = Date.now() - startedAt;
  const health: WebsiteHealthSnapshot = {
    requestedUrl,
    finalUrl,
    statusCode,
    method: chosen.method,
    responseMs,
    redirected: chosen.redirectCount > 0,
    ssl: finalUrl.startsWith("https://"),
    title,
    contentLength: body.length,
    businessSignalScore: businessSignals.score,
    matchedSignals: businessSignals.signals,
    classifierSignals,
    ...(chosen.error ? { error: chosen.error } : {}),
  };

  if (!response) {
    return {
      status: "broken",
      reason: chosen.error ? `Website could not be reached: ${chosen.error}` : "Website could not be reached.",
      health,
    };
  }

  if (statusCode !== null && statusCode >= 400) {
    return {
      status: "broken",
      reason: `Website returned HTTP ${statusCode}.`,
      health,
    };
  }

  if (classifierSignals.some((signal) => signal.startsWith("broken:"))) {
    return {
      status: "broken",
      reason: "Website content looks like a not-found page.",
      health,
    };
  }

  if (classifierSignals.some((signal) => signal.startsWith("parked:"))) {
    return {
      status: "parked",
      reason: "Website content looks like a parked or expired domain.",
      health,
    };
  }

  if (classifierSignals.some((signal) => signal.startsWith("placeholder:"))) {
    return {
      status: "placeholder",
      reason: "Website content looks like a placeholder or generic host page.",
      health,
    };
  }

  if (body.length < 80 && businessSignals.score < 3) {
    return {
      status: "placeholder",
      reason: "Website loaded but has too little business content to qualify as a usable site.",
      health,
    };
  }

  if (businessSignals.score >= 3) {
    return {
      status: "usable",
      reason: "Website is reachable and contains matching business signals.",
      health,
    };
  }

  return {
    status: "unknown",
    reason: "Website loaded, but it did not contain enough matching business signals.",
    health,
  };
}

export function normalizeAiVerificationForWebsiteSales(
  lead: Lead,
  aiResult: AiVerificationResult,
  websiteViability: WebsiteViabilityResult | null,
): NormalizedAiVerification {
  const base: AiVerificationResult = {
    ...aiResult,
    sources: [...aiResult.sources],
    socialProfiles: [...aiResult.socialProfiles],
  };

  if (!base.foundWebsiteUrl) {
    if (base.status === "site_found" || base.status === "weak_site_found" || base.recommendation === "exclude" || base.recommendation === "update_website") {
      return {
        result: {
          ...base,
          status: "no_site_found",
          recommendation: "prioritize",
          confidence: Math.min(base.confidence, 0.75),
          reason: "AI did not provide a direct website URL; treating directory-only evidence as a website opportunity.",
          summary: appendSummary(base.summary, "No direct usable website URL was provided, so this remains a priority opportunity."),
        },
        websiteViability: createDirectoryOnlyViability(lead),
      };
    }
    return {
      result: {
        ...base,
        recommendation: normalizeNonWebsiteRecommendation(base.recommendation),
      },
      websiteViability,
    };
  }

  if (!websiteViability) {
    return {
      result: {
        ...base,
        status: "uncertain",
        recommendation: "manual_review",
        reason: "Website URL was found, but deterministic viability was not checked.",
        summary: appendSummary(base.summary, "A website URL was found, but it still needs deterministic viability review."),
      },
      websiteViability,
    };
  }

  if (websiteViability.status === "usable") {
    return {
      result: {
        ...base,
        status: "site_found",
        recommendation: "update_website",
        reason: websiteViability.reason,
        summary: appendSummary(base.summary, "Deterministic checks confirmed this is a reachable business-matched website."),
      },
      websiteViability,
    };
  }

  if (websiteViability.status === "broken" || websiteViability.status === "parked" || websiteViability.status === "placeholder") {
    return {
      result: {
        ...base,
        status: "weak_site_found",
        recommendation: "prioritize",
        reason: websiteViability.reason,
        summary: appendSummary(base.summary, `AI found a candidate domain, but deterministic checks classify it as ${websiteViability.status}; keep this as a website opportunity.`),
      },
      websiteViability,
    };
  }

  if (websiteViability.status === "directory_only") {
    return {
      result: {
        ...base,
        status: "no_site_found",
        recommendation: "prioritize",
        reason: websiteViability.reason,
        summary: appendSummary(base.summary, "Only directory evidence was found; this remains a priority opportunity."),
      },
      websiteViability,
    };
  }

  return {
    result: {
      ...base,
      status: "uncertain",
      recommendation: "manual_review",
      reason: websiteViability.reason,
      summary: appendSummary(base.summary, "A domain was found, but it did not provide enough business signals to safely apply."),
    },
    websiteViability,
  };
}

function normalizeNonWebsiteRecommendation(recommendation: AiRecommendation): AiRecommendation {
  if (recommendation === "exclude" || recommendation === "update_website") return "manual_review";
  return recommendation;
}

function createDirectoryOnlyViability(lead: Lead): WebsiteViabilityResult {
  return {
    status: "directory_only",
    reason: "Only directory or source evidence exists; no direct website URL was verified.",
    health: {
      requestedUrl: "",
      finalUrl: "",
      statusCode: null,
      method: "NONE",
      responseMs: 0,
      redirected: false,
      ssl: false,
      title: null,
      contentLength: 0,
      businessSignalScore: lead.name ? 1 : 0,
      matchedSignals: lead.name ? ["business_name_available"] : [],
      classifierSignals: ["directory_only"],
    },
  };
}

function normalizeCandidateUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchWithTimeout(fetchImpl: SafeHttpFetch | undefined, lookupImpl: SafeHttpLookup | undefined, url: string, method: "HEAD" | "GET", timeoutMs: number, signal?: AbortSignal): Promise<{
  method: "HEAD" | "GET";
  response: Response | null;
  body: string;
  error: string | null;
  finalUrl: string;
  redirectCount: number;
}> {
  const abortScope = createTimeoutAbortScope(signal, timeoutMs);
  try {
    const result = await fetchSafeHttpUrl(url, {
      method,
      signal: abortScope.signal,
      headers: {
        "User-Agent": "NovaTradeLeadManagement-WebsiteViability/1.0",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
      },
    }, {
      fetchImpl,
      lookupImpl,
    });
    const response = result.response;
    const body = method === "GET" ? await readCappedResponseText(response) : "";
    return {
      method,
      response,
      body,
      error: null,
      finalUrl: result.finalUrl,
      redirectCount: result.redirectCount,
    };
  } catch (error) {
    signal?.throwIfAborted();
    const message = error instanceof Error ? error.message : "request failed";
    return { method, response: null, body: "", error: message, finalUrl: url, redirectCount: 0 };
  } finally {
    abortScope.dispose();
  }
}

async function readCappedResponseText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let streamDone = false;

  try {
    while (totalBytes < MAX_BODY_BYTES) {
      const result = await reader.read();
      if (result.done) {
        streamDone = true;
        break;
      }
      if (!result.value || result.value.byteLength === 0) continue;

      const remainingBytes = MAX_BODY_BYTES - totalBytes;
      const chunk = result.value.byteLength > remainingBytes
        ? result.value.slice(0, remainingBytes)
        : result.value;
      chunks.push(chunk);
      totalBytes += chunk.byteLength;
    }
  } finally {
    if (streamDone) {
      reader.releaseLock();
    } else {
      try {
        await reader.cancel("Website viability response exceeded the body byte limit.");
      } catch {
        // The request signal may already have cancelled the response stream.
      }
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return decodeResponseBytes(bytes, response.headers.get("content-type")).slice(0, MAX_BODY_CHARS);
}

function decodeResponseBytes(bytes: Uint8Array, contentType: string | null): string {
  const charsetMatch = contentType?.match(/charset\s*=\s*(?:"([^"]+)"|'([^']+)'|([^;\s]+))/i);
  const charset = charsetMatch?.[1] ?? charsetMatch?.[2] ?? charsetMatch?.[3] ?? "utf-8";
  try {
    return new TextDecoder(charset.trim()).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function findClassifierSignals(text: string, statusCode: number | null): string[] {
  const signals: string[] = [];
  if (statusCode !== null && statusCode >= 400) signals.push(`broken:http_${statusCode}`);
  collectPatternSignals(signals, "broken", BROKEN_PATTERNS, text);
  collectPatternSignals(signals, "parked", PARKED_PATTERNS, text);
  collectPatternSignals(signals, "placeholder", PLACEHOLDER_PATTERNS, text);
  return signals;
}

function collectPatternSignals(signals: string[], label: string, patterns: RegExp[], text: string): void {
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      signals.push(`${label}:${pattern.source}`);
      return;
    }
  }
}

function findBusinessSignals(lead: Lead, text: string, title: string | null, finalUrl: string): { score: number; signals: string[] } {
  const normalizedText = normalizeText(`${title ?? ""}\n${text}\n${finalUrl}`);
  const signals: string[] = [];
  let score = 0;

  const nameTokens = distinctLeadNameTokens(lead.name);
  const matchedNameTokens = nameTokens.filter((token) => normalizedText.includes(token));
  if (matchedNameTokens.length >= Math.min(2, nameTokens.length) && matchedNameTokens.length > 0) {
    score += 2;
    signals.push(`name:${matchedNameTokens.slice(0, 3).join(",")}`);
  } else if (matchedNameTokens.length === 1 && matchedNameTokens[0].length >= 6) {
    score += 1;
    signals.push(`name:${matchedNameTokens[0]}`);
  }

  const phoneDigits = onlyDigits(lead.phone);
  if (phoneDigits.length >= 10 && onlyDigits(text).includes(phoneDigits.slice(-10))) {
    score += 3;
    signals.push("phone");
  }

  const addressSignals = addressTokens(lead.address);
  const matchedAddress = addressSignals.filter((token) => normalizedText.includes(token));
  if (matchedAddress.length >= 2) {
    score += 2;
    signals.push(`address:${matchedAddress.slice(0, 2).join(",")}`);
  }

  const categorySignals = categoryTokens(lead);
  const matchedCategories = categorySignals.filter((token) => normalizedText.includes(token));
  if (matchedCategories.length > 0) {
    score += 1;
    signals.push(`category:${matchedCategories.slice(0, 2).join(",")}`);
  }

  if (/\b(contact|appointment|schedule|book|call us|services|patients|clients|quote)\b/i.test(text)) {
    score += 1;
    signals.push("contact_cta");
  }

  return { score, signals };
}

function distinctLeadNameTokens(name: string | null): string[] {
  if (!name) return [];
  const tokens = normalizeText(name)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
  return Array.from(new Set(tokens)).slice(0, 8);
}

function addressTokens(address: string | null): string[] {
  if (!address) return [];
  const normalized = normalizeText(address);
  const parts = normalized.split(" ").filter((part) => part.length >= 3 || /^\d{2,}$/.test(part));
  return Array.from(new Set(parts)).slice(0, 6);
}

function categoryTokens(lead: Lead): string[] {
  const raw = [
    lead.primary_type,
    lead.business_type,
    ...lead.categories,
  ].filter(Boolean).join(" ");
  return Array.from(new Set(normalizeText(raw).split(" ").filter((part) => part.length >= 4))).slice(0, 8);
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match?.[1]) return null;
  return decodeHtml(match[1]).replace(/\s+/g, " ").trim().slice(0, 180) || null;
}

function htmlToText(html: string): string {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function onlyDigits(value: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

function emptyHealth(requestedUrl: string, responseMs: number, error: string): WebsiteHealthSnapshot {
  return {
    requestedUrl,
    finalUrl: requestedUrl,
    statusCode: null,
    method: "NONE",
    responseMs,
    redirected: false,
    ssl: requestedUrl.startsWith("https://"),
    title: null,
    contentLength: 0,
    businessSignalScore: 0,
    matchedSignals: [],
    classifierSignals: [],
    error,
  };
}

function appendSummary(summary: string, addition: string): string {
  const trimmed = summary.trim();
  const next = trimmed ? `${trimmed} ${addition}` : addition;
  return next.slice(0, 1200);
}
