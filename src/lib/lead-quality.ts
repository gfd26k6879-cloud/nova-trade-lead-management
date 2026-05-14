import type { BusinessType } from "@/lib/business-types";
import type { AiVerificationStatus } from "@/lib/ai/lead-verification";
import type { WebsiteViabilityStatus } from "@/lib/ai/website-viability";
import type { WebsiteStatus } from "@/lib/classify-website";

export type QualityBucket =
  | "ready_to_call"
  | "needs_ai_verify"
  | "needs_manual_review"
  | "broken_site_opportunity"
  | "not_a_fit";

export type RecommendedOffer =
  | "starter_site"
  | "local_service_site"
  | "broken_site_rescue"
  | "booking_ready_site"
  | "not_recommended";

export type PhoneVerificationStatus = "unknown" | "works" | "bad" | "no_phone";

export interface LeadQualityInput {
  score: number;
  websiteStatus: WebsiteStatus | string;
  businessType?: BusinessType | string | null;
  categories?: readonly string[];
  rating?: number | null;
  reviewCount?: number | null;
  phone?: string | null;
  address?: string | null;
  mapsUri?: string | null;
  businessStatus?: string | null;
  isExcluded?: boolean;
  qualificationStatus?: string | null;
  status?: string | null;
  contactabilityScore?: number | null;
  estimatedDealValue?: number | null;
  aiVerificationStatus?: AiVerificationStatus | string | null;
  aiConfidence?: number | null;
  aiFoundWebsiteUrl?: string | null;
  aiWebsiteViabilityStatus?: WebsiteViabilityStatus | string | null;
  aiWebsiteFeedbackStatus?: "correct" | "incorrect" | "uncertain" | string | null;
  phoneVerificationStatus?: PhoneVerificationStatus | string | null;
}

export interface LeadQualityResult {
  leadQualityScore: number;
  qualityBucket: QualityBucket;
  easyBuildScore: number;
  cashSpeedScore: number;
  needScore: number;
  qualityReason: string;
  recommendedOffer: RecommendedOffer;
  nextBestAction: string;
}

const FAST_CASH_WEIGHTS: Record<string, number> = {
  dental: 88,
  legal: 86,
  plumbing: 92,
  hvac: 92,
  electrical: 88,
  roofing: 86,
  medical_spa: 84,
  accounting: 78,
  insurance: 76,
  auto_repair: 76,
  veterinary: 74,
  general_contractor: 82,
  landscaping: 78,
  pest_control: 82,
  cleaning: 72,
  real_estate: 68,
  beauty: 66,
  fitness: 64,
  restaurant: 52,
  local_services: 62,
};

const EASY_BUILD_WEIGHTS: Record<string, number> = {
  plumbing: 95,
  hvac: 92,
  electrical: 90,
  roofing: 88,
  pest_control: 88,
  cleaning: 86,
  landscaping: 84,
  general_contractor: 82,
  auto_repair: 80,
  accounting: 78,
  insurance: 76,
  beauty: 74,
  dental: 72,
  veterinary: 72,
  fitness: 70,
  medical_spa: 68,
  legal: 66,
  real_estate: 62,
  restaurant: 48,
  local_services: 70,
};

const BOOKING_READY_TYPES = new Set(["dental", "medical_spa", "legal", "fitness", "veterinary"]);
const LOCAL_SERVICE_TYPES = new Set([
  "plumbing",
  "hvac",
  "electrical",
  "roofing",
  "landscaping",
  "pest_control",
  "cleaning",
  "general_contractor",
  "auto_repair",
  "accounting",
  "insurance",
  "real_estate",
  "local_services",
]);
const WEAK_SITE_STATUSES = new Set(["broken", "parked", "placeholder"]);
const MANUAL_REVIEW_STATUSES = new Set(["uncertain", "mismatch", "error"]);

export function computeLeadQuality(input: LeadQualityInput): LeadQualityResult {
  const businessType = input.businessType ?? "local_services";
  const aiStatus = input.aiVerificationStatus ?? "not_checked";
  const viability = input.aiWebsiteViabilityStatus ?? null;
  const feedbackStatus = input.aiWebsiteFeedbackStatus ?? null;
  const phoneStatus = normalizePhoneStatus(input.phoneVerificationStatus, input.phone);
  const hasPhone = Boolean(input.phone?.trim()) && phoneStatus !== "bad";
  const hasUsableAiWebsite = aiStatus === "site_found" && viability === "usable" && Boolean(input.aiFoundWebsiteUrl);
  const hasWeakSite = aiStatus === "weak_site_found" && WEAK_SITE_STATUSES.has(String(viability ?? ""));
  const isClosed = input.businessStatus === "CLOSED_PERMANENTLY" || input.businessStatus === "CLOSED_TEMPORARILY";
  const isDisqualified = input.qualificationStatus === "disqualified" || input.qualificationStatus === "unqualified";
  const isCustomWebsite = input.websiteStatus === "custom";

  if (feedbackStatus === "incorrect" || feedbackStatus === "uncertain") {
    return {
      leadQualityScore: feedbackStatus === "incorrect" ? 35 : 45,
      qualityBucket: "needs_manual_review",
      easyBuildScore: 0,
      cashSpeedScore: 0,
      needScore: 0,
      qualityReason: feedbackStatus === "incorrect"
        ? "Human review marked the AI website finding incorrect."
        : "Human review marked the AI website finding uncertain.",
      recommendedOffer: "not_recommended",
      nextBestAction: "Review corrected website evidence before outreach.",
    };
  }

  if (input.isExcluded || isClosed || isDisqualified || isCustomWebsite || hasUsableAiWebsite || input.status === "closed_lost") {
    return {
      leadQualityScore: 0,
      qualityBucket: "not_a_fit",
      easyBuildScore: 0,
      cashSpeedScore: 0,
      needScore: 0,
      qualityReason: hasUsableAiWebsite || isCustomWebsite
        ? "Usable website already found."
        : isClosed
          ? "Business is not currently operational."
          : "Lead is excluded or disqualified.",
      recommendedOffer: "not_recommended",
      nextBestAction: "Do not work this lead unless an admin restores it.",
    };
  }

  const websiteGap = computeWebsiteGap(input);
  const needScore = computeNeedScore(input, websiteGap);
  const easyBuildScore = EASY_BUILD_WEIGHTS[String(businessType)] ?? EASY_BUILD_WEIGHTS.local_services;
  const cashSpeedScore = FAST_CASH_WEIGHTS[String(businessType)] ?? FAST_CASH_WEIGHTS.local_services;
  const contactability = computeQualityContactability(input, phoneStatus);
  const confidence = computeConfidenceScore(input);
  const noPhonePenalty = hasPhone ? 0 : 18;
  const badPhonePenalty = phoneStatus === "bad" ? 20 : 0;

  const final = clampPercentage(
    websiteGap * 0.32 +
    needScore * 0.22 +
    easyBuildScore * 0.16 +
    cashSpeedScore * 0.16 +
    contactability * 0.1 +
    confidence * 0.14 -
    noPhonePenalty -
    badPhonePenalty,
  );

  const bucket = resolveQualityBucket({
    aiStatus: String(aiStatus),
    viability: viability ? String(viability) : null,
    hasPhone,
    phoneStatus,
    final,
    hasWeakSite,
  });
  const recommendedOffer = recommendOffer(String(businessType), bucket, viability ? String(viability) : null, final, hasPhone);

  return {
    leadQualityScore: final,
    qualityBucket: bucket,
    easyBuildScore,
    cashSpeedScore,
    needScore,
    qualityReason: buildQualityReason(input, bucket, websiteGap, hasPhone, confidence),
    recommendedOffer,
    nextBestAction: nextActionForBucket(bucket, phoneStatus),
  };
}

function computeWebsiteGap(input: LeadQualityInput): number {
  const aiStatus = input.aiVerificationStatus ?? "not_checked";
  const confidence = Math.max(clamp01(input.aiConfidence ?? 0), 0.55);
  const viability = input.aiWebsiteViabilityStatus ?? null;

  if (aiStatus === "site_found" && viability === "usable") return 0;
  if (aiStatus === "no_site_found" || viability === "directory_only") return 100 * confidence;
  if (aiStatus === "weak_site_found" && WEAK_SITE_STATUSES.has(String(viability ?? ""))) return 92 * confidence;
  if (aiStatus === "weak_site_found") return 72 * confidence;
  if (aiStatus === "site_found") return 20;
  if (input.websiteStatus === "none") return 62;
  if (input.websiteStatus === "social") return 50;
  if (input.websiteStatus === "basic") return 34;
  return 0;
}

function computeNeedScore(input: LeadQualityInput, websiteGap: number): number {
  const reviewCount = input.reviewCount ?? 0;
  const rating = input.rating ?? 0;
  const reviewSignal = Math.min(Math.log10(reviewCount + 1) / 2.4, 1) * 45;
  const ratingSignal = rating >= 3.4 && rating <= 4.8 ? 22 : rating > 0 ? 12 : 4;
  const activitySignal = input.businessStatus === "OPERATIONAL" || !input.businessStatus ? 12 : 0;
  const scoreSignal = Math.min(Math.max(input.score / 55, 0), 1) * 21;
  const gapSignal = Math.min(websiteGap, 100) * 0.2;
  return clampPercentage(reviewSignal + ratingSignal + activitySignal + scoreSignal + gapSignal);
}

function computeQualityContactability(input: LeadQualityInput, phoneStatus: PhoneVerificationStatus): number {
  if (phoneStatus === "bad" || phoneStatus === "no_phone") return input.estimatedDealValue && input.estimatedDealValue > 5000 ? 35 : 18;
  const base = Math.max(0, Math.min(1, input.contactabilityScore ?? 0)) * 65;
  const phone = input.phone?.trim() ? 20 : 0;
  const address = input.address?.trim() ? 10 : 0;
  const maps = input.mapsUri?.trim() ? 5 : 0;
  const verified = phoneStatus === "works" ? 12 : 0;
  return clampPercentage(base + phone + address + maps + verified);
}

function computeConfidenceScore(input: LeadQualityInput): number {
  const aiStatus = input.aiVerificationStatus ?? "not_checked";
  const confidence = clamp01(input.aiConfidence ?? 0);
  if (aiStatus === "not_checked") return 12;
  if (aiStatus === "error") return 8;
  if (input.aiWebsiteViabilityStatus) return 65 + confidence * 35;
  return 35 + confidence * 35;
}

function resolveQualityBucket(input: {
  aiStatus: string;
  viability: string | null;
  hasPhone: boolean;
  phoneStatus: PhoneVerificationStatus;
  final: number;
  hasWeakSite: boolean;
}): QualityBucket {
  if (input.hasWeakSite) return "broken_site_opportunity";
  if (MANUAL_REVIEW_STATUSES.has(input.aiStatus) || (input.aiStatus === "site_found" && input.viability !== "usable")) {
    return "needs_manual_review";
  }
  if (input.aiStatus === "not_checked") return "needs_ai_verify";
  if ((input.aiStatus === "no_site_found" || input.viability === "directory_only") && input.hasPhone && input.final >= 55) {
    return "ready_to_call";
  }
  if (input.phoneStatus === "bad" || !input.hasPhone) return "needs_manual_review";
  return input.final >= 65 ? "ready_to_call" : "needs_manual_review";
}

function recommendOffer(
  businessType: string,
  bucket: QualityBucket,
  viability: string | null,
  score: number,
  hasPhone: boolean,
): RecommendedOffer {
  if (bucket === "not_a_fit" || score < 25 || !hasPhone) return "not_recommended";
  if (WEAK_SITE_STATUSES.has(String(viability ?? "")) || bucket === "broken_site_opportunity") return "broken_site_rescue";
  if (BOOKING_READY_TYPES.has(businessType)) return "booking_ready_site";
  if (LOCAL_SERVICE_TYPES.has(businessType)) return "local_service_site";
  return "starter_site";
}

function buildQualityReason(input: LeadQualityInput, bucket: QualityBucket, websiteGap: number, hasPhone: boolean, confidence: number): string {
  const reasons: string[] = [];
  if (bucket === "ready_to_call") reasons.push("AI evidence supports no usable website and the business is contactable.");
  if (bucket === "broken_site_opportunity") reasons.push("AI found a domain, but deterministic checks show a broken or weak website opportunity.");
  if (bucket === "needs_ai_verify") reasons.push("Strong raw lead, but AI still needs to verify website evidence.");
  if (bucket === "needs_manual_review") reasons.push("The lead has conflicting evidence or needs a human check before outreach.");
  if (!hasPhone) reasons.push("Phone is missing or unverified, which slows outreach.");
  if (websiteGap >= 70) reasons.push("Website gap is strong.");
  if (confidence >= 70) reasons.push("Verification confidence is strong.");
  return reasons.join(" ");
}

function nextActionForBucket(bucket: QualityBucket, phoneStatus: PhoneVerificationStatus): string {
  if (bucket === "ready_to_call") return phoneStatus === "works" ? "Call now with the simple website offer." : "Call and confirm the owner or decision maker.";
  if (bucket === "broken_site_opportunity") return "Open the site evidence, then pitch a broken-site rescue.";
  if (bucket === "needs_ai_verify") return "Run AI verification before spending sales time.";
  if (bucket === "needs_manual_review") return "Review website evidence and phone status.";
  return "Skip for now.";
}

function normalizePhoneStatus(status: string | null | undefined, phone: string | null | undefined): PhoneVerificationStatus {
  if (!phone?.trim()) return "no_phone";
  if (status === "works" || status === "bad" || status === "unknown") return status;
  return "unknown";
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
