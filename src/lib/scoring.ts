import type { WebsiteStatus } from "./classify-website";

export const DEFAULT_WEBSITE_MULTIPLIERS: Record<WebsiteStatus, number> = {
  none: 1.2,
  social: 1.1,
  basic: 1.0,
  custom: 0.0,
};

export const DEFAULT_NICHE_WEIGHTS: Record<string, number> = {
  dentist: 1.3,
  dental_clinic: 1.3,
  lawyer: 1.4,
  attorney: 1.4,
  law_firm: 1.4,
  hvac: 1.2,
  plumber: 1.2,
  plumbing: 1.2,
  electrician: 1.2,
  roofing: 1.15,
  auto_repair: 1.1,
  car_repair: 1.1,
  veterinarian: 1.25,
  chiropractor: 1.2,
  med_spa: 1.35,
  spa: 1.15,
  salon: 1.0,
  hair_salon: 1.0,
  barber: 0.9,
  restaurant: 0.8,
  landscaping: 1.1,
  real_estate: 1.2,
  insurance: 1.15,
  accounting: 1.2,
  fitness: 1.0,
  gym: 0.95,
  contractor: 1.15,
  cleaning: 1.0,
  pest_control: 1.1,
};

export interface ScoreInput {
  reviewCount: number | null | undefined;
  rating: number | null | undefined;
  categories: readonly string[];
  websiteStatus: WebsiteStatus;
  photoCount?: number;
  hasOpeningHours?: boolean;
  businessStatus?: string | null;
  websiteHealth?: { statusCode?: number; responseMs?: number; ssl?: boolean; redirectCount?: number } | null;
  competitiveDensity?: number;
  contactabilityScore?: number;
  estimatedDealValue?: number;
}

export interface ScoreBreakdown {
  base: number;
  nicheWeight: number;
  websiteMultiplier: number;
  photoBonus: number;
  hoursBonus: number;
  opportunityBonus: number;
  healthBonus: number;
  densityBonus: number;
  contactabilityMultiplier: number;
  dealValueMultiplier: number;
  final: number;
}

export interface WinProbabilityInput {
  score: number;
  websiteStatus: WebsiteStatus;
  qualificationStatus?: string | null;
  isExcluded?: boolean;
  businessStatus?: string | null;
  contactabilityScore?: number;
  estimatedDealValue?: number;
  firstContactedAt?: string | null;
  firstReplyAt?: string | null;
  meetingBookedAt?: string | null;
  status?: string | null;
  aiVerification?: {
    status?: string | null;
    confidence?: number | null;
    foundWebsiteUrl?: string | null;
    websiteViabilityStatus?: string | null;
  } | null;
}

export function computeScore(
  input: ScoreInput,
  nicheWeights?: Record<string, number>,
  websiteMultipliers?: Record<string, number>,
): number {
  return computeScoreWithBreakdown(input, nicheWeights, websiteMultipliers).final;
}

export function computeScoreWithBreakdown(
  input: ScoreInput,
  nicheWeights?: Record<string, number>,
  websiteMultipliers?: Record<string, number>,
): ScoreBreakdown {
  const reviewCount = input.reviewCount ?? 0;
  const rating = input.rating ?? 0;

  const weights = nicheWeights ?? DEFAULT_NICHE_WEIGHTS;
  const multipliers = websiteMultipliers ?? DEFAULT_WEBSITE_MULTIPLIERS;

  const nicheWeight = bestNicheWeight(input.categories, weights);
  const websiteMultiplier = multipliers[input.websiteStatus] ?? 1.0;

  let base: number;
  if (reviewCount <= 0 || rating <= 0) {
    const isOperational = !input.businessStatus || input.businessStatus === "OPERATIONAL";
    base = isOperational ? 2.0 : 0;
  } else {
    base = Math.round(Math.log(1 + reviewCount) * rating * 100) / 100;
  }

  if (base === 0) {
    return emptyBreakdown(0);
  }

  if (websiteMultiplier <= 0) {
    return {
      ...emptyBreakdown(base),
      nicheWeight,
      websiteMultiplier,
    };
  }

  const photoCount = input.photoCount ?? 0;
  const invertedPhotoRatio = 1 - Math.min(photoCount / 10, 1.0);
  const photoBonus = Math.round(invertedPhotoRatio * 0.3 * 100) / 100;

  const hoursBonus = input.hasOpeningHours ? 0.15 : 0;

  let opportunityBonus = 0;
  if (reviewCount > 20 && rating >= 3.0 && rating <= 4.2) {
    opportunityBonus = 0.25;
  }

  let healthBonus = 0;
  if (input.websiteHealth) {
    const h = input.websiteHealth;
    if (h.statusCode && h.statusCode >= 400) healthBonus += 0.3;
    else if (h.responseMs && h.responseMs > 3000) healthBonus += 0.15;
    if (h.ssl === false) healthBonus += 0.1;
    if (h.redirectCount && h.redirectCount > 2) healthBonus += 0.1;
    healthBonus = Math.round(Math.min(healthBonus, 0.5) * 100) / 100;
  }

  let densityBonus = 0;
  if (input.competitiveDensity != null) {
    if (input.competitiveDensity > 15) densityBonus = 0.3;
    else if (input.competitiveDensity > 8) densityBonus = 0.2;
    else if (input.competitiveDensity > 3) densityBonus = 0.1;
  }

  const contactabilityMultiplier = Math.max(0.65, Math.min(input.contactabilityScore ?? 1, 1.15));
  const dealValueMultiplier = input.estimatedDealValue
    ? Math.max(0.75, Math.min(input.estimatedDealValue / 3000, 1.6))
    : 1;

  const core = base * nicheWeight * websiteMultiplier;
  const bonuses = photoBonus + hoursBonus + opportunityBonus + healthBonus + densityBonus;
  const final = Math.round(((core * contactabilityMultiplier * dealValueMultiplier) + bonuses) * 100) / 100;

  return {
    base,
    nicheWeight,
    websiteMultiplier,
    photoBonus,
    hoursBonus,
    opportunityBonus,
    healthBonus,
    densityBonus,
    contactabilityMultiplier,
    dealValueMultiplier,
    final,
  };
}

export function computeWinProbability(input: WinProbabilityInput): number {
  if (input.isExcluded || input.qualificationStatus === "disqualified" || input.status === "closed_lost") return 0;
  if (input.status === "closed_won") return 100;
  if (input.businessStatus && input.businessStatus !== "OPERATIONAL") return 0;

  const aiStatus = input.aiVerification?.status ?? "not_checked";
  const aiConfidence = clamp01(input.aiVerification?.confidence ?? 0);
  const viabilityStatus = input.aiVerification?.websiteViabilityStatus ?? null;
  const hasUsableAiWebsite = aiStatus === "site_found" && viabilityStatus === "usable";
  const hasWeakWebsiteOpportunity =
    aiStatus === "weak_site_found" &&
    (viabilityStatus === "broken" || viabilityStatus === "parked" || viabilityStatus === "placeholder");

  if (hasUsableAiWebsite) return 0;

  let websiteGap = 0;
  if (input.websiteStatus === "none") websiteGap = 26;
  else if (input.websiteStatus === "social") websiteGap = 21;
  else if (input.websiteStatus === "basic") websiteGap = 14;

  if (aiStatus === "no_site_found") websiteGap = Math.max(websiteGap, 30 * Math.max(aiConfidence, 0.5));
  if (aiStatus === "uncertain") websiteGap *= 0.55;
  if (aiStatus === "mismatch") websiteGap *= 0.35;
  if (hasWeakWebsiteOpportunity) websiteGap = Math.max(websiteGap, 28 * Math.max(aiConfidence, 0.6));
  else if (aiStatus === "weak_site_found") websiteGap = Math.max(websiteGap, 18 * Math.max(aiConfidence, 0.5));
  if (input.websiteStatus === "custom" || hasUsableAiWebsite) websiteGap = 0;

  const contactability = clamp01(input.contactabilityScore ?? 0) * 20;
  const dealValue = Math.min(Math.max((input.estimatedDealValue ?? 0) / 5000, 0), 1) * 15;
  const opportunity = Math.min(Math.max(input.score / 25, 0), 1) * 12;
  const aiEvidence = aiStatus === "no_site_found"
    ? 10 * Math.max(aiConfidence, 0.5)
    : hasWeakWebsiteOpportunity
      ? 8 * Math.max(aiConfidence, 0.6)
      : hasUsableAiWebsite
      ? -18 * Math.max(aiConfidence, 0.5)
      : aiStatus === "site_found"
        ? -4
        : aiStatus === "weak_site_found"
          ? 4
      : aiStatus === "uncertain"
        ? -4
        : 0;
  const freshness = input.firstContactedAt ? 2 : 6;
  const engagement = input.meetingBookedAt ? 15 : input.firstReplyAt ? 9 : input.status === "contacted" ? 3 : 0;
  const qualification = input.qualificationStatus === "qualified" ? 7 : input.qualificationStatus === "needs_verification" ? 3 : -10;

  const final = websiteGap + contactability + dealValue + opportunity + aiEvidence + freshness + engagement + qualification;
  return Math.max(0, Math.min(100, Math.round(final)));
}

function emptyBreakdown(base: number): ScoreBreakdown {
  return {
    base,
    nicheWeight: base > 0 ? 1.0 : 1.0,
    websiteMultiplier: 0,
    photoBonus: 0,
    hoursBonus: 0,
    opportunityBonus: 0,
    healthBonus: 0,
    densityBonus: 0,
    contactabilityMultiplier: 0,
    dealValueMultiplier: 0,
    final: 0,
  };
}

function bestNicheWeight(
  categories: readonly string[],
  weights: Record<string, number>,
): number {
  if (categories.length === 0) return 1.0;

  let best = 1.0;
  for (const cat of categories) {
    const normalized = cat.toLowerCase().replace(/[\s-]+/g, "_");
    const w = weights[normalized];
    if (w !== undefined && w > best) {
      best = w;
    }
  }
  return best;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
