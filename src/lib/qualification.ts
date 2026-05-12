import type { WebsiteStatus } from "@/lib/classify-website";

export type QualificationStatus = "qualified" | "needs_verification" | "unqualified" | "disqualified";

export interface QualificationInput {
  categories: readonly string[];
  websiteStatus: WebsiteStatus;
  businessStatus?: string | null;
  phone?: string | null;
  address?: string | null;
  mapsUri?: string | null;
  score?: number | null;
}

export interface QualificationResult {
  sellingNiche: string;
  qualificationStatus: QualificationStatus;
  disqualificationReason: string | null;
  contactabilityScore: number;
  estimatedDealValue: number;
}

const CATEGORY_TO_NICHE: Array<{ niche: string; dealValue: number; patterns: RegExp[] }> = [
  { niche: "dental", dealValue: 4500, patterns: [/dent/i, /orthodont/i, /periodont/i] },
  { niche: "medical_spa", dealValue: 5000, patterns: [/med.?spa/i, /spa/i, /skin/i, /aesthetic/i] },
  { niche: "legal", dealValue: 5500, patterns: [/law/i, /attorney/i, /legal/i] },
  { niche: "hvac", dealValue: 4000, patterns: [/hvac/i, /heating/i, /air_condition/i] },
  { niche: "home_services", dealValue: 3500, patterns: [/plumb/i, /electric/i, /roof/i, /contractor/i, /landscap/i, /pest/i, /clean/i] },
  { niche: "auto_services", dealValue: 3000, patterns: [/auto/i, /car_repair/i, /mechanic/i, /tire/i] },
  { niche: "veterinary", dealValue: 3800, patterns: [/veter/i, /animal/i] },
  { niche: "financial_services", dealValue: 4500, patterns: [/account/i, /insurance/i, /real_estate/i, /mortgage/i] },
  { niche: "fitness", dealValue: 2500, patterns: [/gym/i, /fitness/i, /trainer/i] },
  { niche: "beauty", dealValue: 2200, patterns: [/salon/i, /barber/i, /beauty/i, /hair/i] },
  { niche: "restaurant", dealValue: 1800, patterns: [/restaurant/i, /cafe/i, /bar/i, /food/i] },
];

export function normalizeSellingNiche(categories: readonly string[]): string {
  const normalized = categories.map((category) => category.toLowerCase().replace(/[\s-]+/g, "_"));
  for (const { niche, patterns } of CATEGORY_TO_NICHE) {
    if (normalized.some((category) => patterns.some((pattern) => pattern.test(category)))) {
      return niche;
    }
  }
  return "local_services";
}

export function estimateDealValue(categories: readonly string[], websiteStatus: WebsiteStatus): number {
  const niche = normalizeSellingNiche(categories);
  const base = CATEGORY_TO_NICHE.find((entry) => entry.niche === niche)?.dealValue ?? 2500;
  const websiteGapMultiplier: Record<WebsiteStatus, number> = {
    none: 1.15,
    social: 1.05,
    basic: 1.0,
    custom: 0.35,
  };
  return Math.round(base * websiteGapMultiplier[websiteStatus]);
}

export function computeContactabilityScore(input: Pick<QualificationInput, "phone" | "address" | "mapsUri">): number {
  let score = 0;
  if (input.phone?.trim()) score += 0.55;
  if (input.address?.trim()) score += 0.3;
  if (input.mapsUri?.trim()) score += 0.15;
  return Math.round(score * 100) / 100;
}

export function qualifyLead(input: QualificationInput): QualificationResult {
  const sellingNiche = normalizeSellingNiche(input.categories);
  const contactabilityScore = computeContactabilityScore(input);
  const estimatedDealValue = estimateDealValue(input.categories, input.websiteStatus);
  const score = input.score ?? 0;

  if (input.businessStatus === "CLOSED_PERMANENTLY" || input.businessStatus === "CLOSED_TEMPORARILY") {
    return {
      sellingNiche,
      qualificationStatus: "disqualified",
      disqualificationReason: "Business is not currently operational",
      contactabilityScore,
      estimatedDealValue,
    };
  }

  if (input.websiteStatus === "custom") {
    return {
      sellingNiche,
      qualificationStatus: "disqualified",
      disqualificationReason: "Already has a custom-domain website",
      contactabilityScore,
      estimatedDealValue,
    };
  }

  if (contactabilityScore < 0.55) {
    return {
      sellingNiche,
      qualificationStatus: "needs_verification",
      disqualificationReason: "Missing reliable contact information",
      contactabilityScore,
      estimatedDealValue,
    };
  }

  if (score >= 8) {
    return {
      sellingNiche,
      qualificationStatus: "qualified",
      disqualificationReason: null,
      contactabilityScore,
      estimatedDealValue,
    };
  }

  if (score >= 4) {
    return {
      sellingNiche,
      qualificationStatus: "needs_verification",
      disqualificationReason: null,
      contactabilityScore,
      estimatedDealValue,
    };
  }

  return {
    sellingNiche,
    qualificationStatus: "unqualified",
    disqualificationReason: "Score below outreach threshold",
    contactabilityScore,
    estimatedDealValue,
  };
}
