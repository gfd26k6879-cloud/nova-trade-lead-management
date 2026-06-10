import type { Lead } from "@/lib/db/queries";
import type { WebsiteViabilityResult } from "@/lib/ai/website-viability";
import type { AiVerificationResult, AiVerificationSource } from "@/lib/ai/lead-verification";

export type EvidenceGrade = "strong" | "moderate" | "weak" | "conflicting";
export type IdentityMatchValue = "exact" | "near" | "weak" | "mismatch" | "unknown";

export interface LeadIdentityEvidencePacket {
  name: {
    raw: string | null;
    normalized: string;
    tokens: string[];
    variants: string[];
  };
  phone: {
    raw: string | null;
    normalized: string | null;
    variants: string[];
  };
  location: {
    rawAddress: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    tokens: string[];
  };
  category: {
    primaryType: string | null;
    businessType: string | null;
    categories: string[];
    synonyms: string[];
  };
  currentWebsite: {
    googleWebsiteUrl: string | null;
    websiteStatus: string | null;
    mapsUrl: string | null;
  };
  feedback: {
    status: string | null;
    correctedWebsiteUrl: string | null;
    falsePositiveReason: string | null;
    reviewerNotes: string | null;
  };
  knownDirectoryOrSocialHosts: string[];
}

export interface WebsiteCandidateAssessment {
  url: string | null;
  score: number;
  recommendation: "accept" | "manual_review" | "reject";
  flags: string[];
  reasons: string[];
  hostType: "official_candidate" | "directory_or_social" | "invalid" | "unknown";
}

const DIRECTORY_OR_SOCIAL_HOSTS = [
  "yelp.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "bbb.org",
  "angi.com",
  "angieslist.com",
  "chamberofcommerce.com",
  "yellowpages.com",
  "mapquest.com",
  "google.com",
  "maps.google.com",
  "nextdoor.com",
  "opencare.com",
  "healthgrades.com",
  "zocdoc.com",
  "thumbtack.com",
  "porch.com",
  "houzz.com",
];

const BUSINESS_SUFFIXES = new Set([
  "the",
  "and",
  "llc",
  "inc",
  "corp",
  "company",
  "co",
  "service",
  "services",
  "pllc",
  "ltd",
  "pc",
]);

const CATEGORY_SYNONYMS: Array<{ pattern: RegExp; synonyms: string[] }> = [
  { pattern: /dent|orthodont|dds|dmd/i, synonyms: ["dentist", "dental clinic", "family dentist"] },
  { pattern: /plumb/i, synonyms: ["plumber", "plumbing contractor", "drain service"] },
  { pattern: /electric/i, synonyms: ["electrician", "electrical contractor"] },
  { pattern: /auto|mechanic|repair/i, synonyms: ["auto repair", "mechanic", "automotive service"] },
  { pattern: /roof/i, synonyms: ["roofer", "roofing contractor"] },
  { pattern: /hvac|heating|cooling/i, synonyms: ["hvac contractor", "heating and cooling"] },
  { pattern: /contractor|construction/i, synonyms: ["contractor", "local contractor"] },
];

export function buildLeadIdentityEvidencePacket(lead: Lead): LeadIdentityEvidencePacket {
  const normalizedName = normalizeText(lead.name ?? "");
  const nameTokens = normalizedName
    .split(" ")
    .filter((token) => token.length > 1 && !BUSINESS_SUFFIXES.has(token));
  const phone = normalizePhone(lead.phone ?? null);
  const { city, state, zip } = parseAddress(lead.address ?? null);
  const categorySource = [lead.primary_type, lead.business_type, ...(lead.categories ?? [])]
    .filter(Boolean)
    .map(String);
  const synonyms = categorySource.length > 0
    ? Array.from(new Set(categorySource.flatMap((value) => categorySynonyms(value))))
    : [];

  return {
    name: {
      raw: lead.name ?? null,
      normalized: normalizedName,
      tokens: nameTokens,
      variants: Array.from(new Set([
        normalizedName,
        stripBusinessSuffixes(normalizedName),
        nameTokens.join(" "),
      ].filter(Boolean))),
    },
    phone: {
      raw: lead.phone ?? null,
      normalized: phone,
      variants: phone ? [phone, formatPhone(phone)].filter((value): value is string => Boolean(value)) : [],
    },
    location: {
      rawAddress: lead.address ?? null,
      city,
      state,
      zip,
      tokens: Array.from(new Set(normalizeText([lead.address, city, state, zip].filter(Boolean).join(" ")).split(" ").filter(Boolean))),
    },
    category: {
      primaryType: lead.primary_type ?? null,
      businessType: lead.business_type ?? null,
      categories: [...(lead.categories ?? [])],
      synonyms,
    },
    currentWebsite: {
      googleWebsiteUrl: lead.website_uri ?? null,
      websiteStatus: lead.website_status ?? null,
      mapsUrl: lead.maps_uri ?? null,
    },
    feedback: {
      status: lead.ai_website_feedback_status ?? null,
      correctedWebsiteUrl: lead.ai_corrected_website_url ?? null,
      falsePositiveReason: lead.ai_false_positive_reason ?? null,
      reviewerNotes: lead.ai_reviewer_notes ?? null,
    },
    knownDirectoryOrSocialHosts: DIRECTORY_OR_SOCIAL_HOSTS,
  };
}

export function scoreWebsiteCandidate(
  lead: Lead,
  candidateUrl: string | null | undefined,
  sources: AiVerificationSource[],
  viability: WebsiteViabilityResult | null,
): WebsiteCandidateAssessment {
  const normalizedUrl = normalizeUrl(candidateUrl);
  if (!normalizedUrl) {
    return {
      url: null,
      score: 0,
      recommendation: "reject",
      flags: ["missing_or_invalid_url"],
      reasons: ["No valid candidate website URL was returned."],
      hostType: "invalid",
    };
  }

  const packet = buildLeadIdentityEvidencePacket(lead);
  const hostname = hostnameFor(normalizedUrl);
  const domainTokens = normalizeText(hostname.replace(/^www\./, "").split(".")[0] ?? "").split(" ").filter(Boolean);
  const flags: string[] = [];
  const reasons: string[] = [];
  let score = 15;
  let hostType: WebsiteCandidateAssessment["hostType"] = "unknown";

  if (isDirectoryOrSocialHost(hostname)) {
    flags.push("directory_or_social_host");
    reasons.push("Candidate URL is hosted on a directory, social network, or aggregator.");
    hostType = "directory_or_social";
    score -= 25;
  } else {
    hostType = "official_candidate";
    score += 20;
  }

  const domainMatchesName = packet.name.tokens.length > 0 && packet.name.tokens.some((token) => domainTokens.join("").includes(token));
  if (domainMatchesName) {
    flags.push("domain_name_match");
    reasons.push("Domain tokens overlap with the business name.");
    score += 20;
  } else {
    flags.push("domain_name_weak");
    reasons.push("Domain tokens do not strongly overlap with the business name.");
    score -= 5;
  }

  const healthSignals = viability?.health?.matchedSignals ?? [];
  if (healthSignals.length > 0) {
    score += Math.min(25, healthSignals.length * 8);
    flags.push("website_business_signals");
    reasons.push(`Website health check found matching signals: ${healthSignals.join(", ")}.`);
  }

  if (viability?.status === "usable") {
    score += 20;
    flags.push("usable_viability");
    reasons.push("Website is reachable and contains matching business signals.");
  } else if (viability?.status === "broken" || viability?.status === "parked" || viability?.status === "placeholder") {
    score += 5;
    flags.push(`weak_viability_${viability.status}`);
    reasons.push(`Website appears ${viability.status}, so it is a weak-site opportunity rather than a usable exclusion.`);
  } else if (viability?.status === "directory_only") {
    score -= 20;
    flags.push("directory_only_viability");
    reasons.push("Website viability classified the candidate as directory-only.");
  }

  const sourceUrls = sources.map((source) => hostnameFor(source.url)).filter(Boolean);
  if (sourceUrls.some((sourceHost) => sourceHost === hostname || sourceHost.endsWith(`.${hostname}`))) {
    score += 8;
    flags.push("candidate_source_match");
    reasons.push("A source URL directly references the candidate host.");
  }

  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    url: normalizedUrl,
    score: boundedScore,
    recommendation: boundedScore >= 75 && hostType === "official_candidate"
      ? "accept"
      : boundedScore >= 40 && hostType !== "directory_or_social"
        ? "manual_review"
        : "reject",
    flags,
    reasons,
    hostType,
  };
}

export function applyWebsiteCandidateAssessment(
  result: AiVerificationResult,
  assessment: WebsiteCandidateAssessment,
): AiVerificationResult {
  if (!result.foundWebsiteUrl) return result;
  if (assessment.recommendation === "accept") return result;
  const siteQualityFlags = result.siteQualityFlags ?? [];
  const contradictingEvidence = result.contradictingEvidence ?? [];

  if (assessment.hostType === "directory_or_social" || assessment.recommendation === "reject") {
    return {
      ...result,
      status: "no_site_found",
      foundWebsiteUrl: null,
      recommendation: result.recommendation === "exclude" || result.recommendation === "update_website" ? "prioritize" : result.recommendation,
      confidence: Math.min(result.confidence, 0.72),
      siteQualityFlags: Array.from(new Set([...siteQualityFlags, ...assessment.flags])),
      contradictingEvidence: Array.from(new Set([...contradictingEvidence, ...assessment.reasons])),
      manualReviewReason: result.manualReviewReason ?? "Candidate website was rejected by deterministic identity and host checks.",
      evidenceGrade: "weak",
      reason: appendSentence(result.reason, "Deterministic checks rejected the returned website candidate."),
      summary: appendSentence(result.summary, "Treating this as a no-site opportunity until an admin reviews the rejected candidate."),
    };
  }

  return {
    ...result,
    status: result.status === "site_found" ? "uncertain" : result.status,
    recommendation: result.recommendation === "exclude" || result.recommendation === "update_website" ? "manual_review" : result.recommendation,
    confidence: Math.min(result.confidence, 0.68),
    siteQualityFlags: Array.from(new Set([...siteQualityFlags, ...assessment.flags])),
    contradictingEvidence: Array.from(new Set([...contradictingEvidence, ...assessment.reasons])),
    manualReviewReason: result.manualReviewReason ?? "Candidate website requires manual review because deterministic evidence is not strong enough.",
    evidenceGrade: result.evidenceGrade === "strong" ? "moderate" : result.evidenceGrade ?? "weak",
    reason: appendSentence(result.reason, "Deterministic checks lowered confidence in the returned website candidate."),
    summary: appendSentence(result.summary, "Manual review is recommended before applying this website to the lead."),
  };
}

export function extractVerificationEvidence(rawJson: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const evidence = rawJson?.evidence;
  return evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? evidence as Record<string, unknown>
    : {};
}

export function isDirectoryOrSocialHost(hostname: string): boolean {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return DIRECTORY_OR_SOCIAL_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function stripBusinessSuffixes(value: string): string {
  return value.split(" ").filter((token) => !BUSINESS_SUFFIXES.has(token)).join(" ");
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

function formatPhone(digits: string): string | null {
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function parseAddress(address: string | null): { city: string | null; state: string | null; zip: string | null } {
  if (!address) return { city: null, state: null, zip: null };
  const zip = address.match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ?? null;
  const state = address.match(/,\s*([A-Z]{2})\s+\d{5}\b/)?.[1] ?? null;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const city = parts.length >= 2 ? parts[parts.length - 2]?.replace(/\s+\b[A-Z]{2}\b.*$/, "") ?? null : null;
  return { city, state, zip };
}

function categorySynonyms(value: string): string[] {
  const normalized = normalizeText(value);
  const matched = CATEGORY_SYNONYMS.find((entry) => entry.pattern.test(normalized));
  return matched ? matched.synonyms : [normalized].filter(Boolean);
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function hostnameFor(value: string): string {
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function appendSentence(value: string, sentence: string): string {
  const trimmed = value.trim();
  return trimmed ? `${trimmed} ${sentence}` : sentence;
}
