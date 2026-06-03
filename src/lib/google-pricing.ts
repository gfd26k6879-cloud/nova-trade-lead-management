export type GooglePlacesSku =
  | "places_text_search_essentials_ids_only"
  | "places_text_search_pro"
  | "places_text_search_enterprise"
  | "places_text_search_enterprise_plus_atmosphere"
  | "places_place_details_essentials"
  | "places_place_details_pro"
  | "places_place_details_enterprise"
  | "places_place_details_enterprise_plus_atmosphere";

interface SkuTier {
  upTo: number | null;
  pricePerThousand: number;
}

interface SkuPricing {
  freeCap: number;
  tiers: SkuTier[];
}

export const GOOGLE_PLACES_SKU_PRICING: Record<GooglePlacesSku, SkuPricing> = {
  places_text_search_essentials_ids_only: {
    freeCap: Number.POSITIVE_INFINITY,
    tiers: [],
  },
  places_text_search_pro: {
    freeCap: 5000,
    tiers: [
      { upTo: 100000, pricePerThousand: 32 },
      { upTo: 500000, pricePerThousand: 25.6 },
      { upTo: 1000000, pricePerThousand: 19.2 },
      { upTo: 5000000, pricePerThousand: 9.6 },
      { upTo: null, pricePerThousand: 2.4 },
    ],
  },
  places_text_search_enterprise: {
    freeCap: 1000,
    tiers: [
      { upTo: 100000, pricePerThousand: 35 },
      { upTo: 500000, pricePerThousand: 28 },
      { upTo: 1000000, pricePerThousand: 21 },
      { upTo: 5000000, pricePerThousand: 10.5 },
      { upTo: null, pricePerThousand: 2.63 },
    ],
  },
  places_text_search_enterprise_plus_atmosphere: {
    freeCap: 1000,
    tiers: [
      { upTo: 100000, pricePerThousand: 40 },
      { upTo: 500000, pricePerThousand: 32 },
      { upTo: 1000000, pricePerThousand: 24 },
      { upTo: 5000000, pricePerThousand: 12 },
      { upTo: null, pricePerThousand: 3 },
    ],
  },
  places_place_details_essentials: {
    freeCap: 10000,
    tiers: [
      { upTo: 100000, pricePerThousand: 5 },
      { upTo: 500000, pricePerThousand: 4 },
      { upTo: 1000000, pricePerThousand: 3 },
      { upTo: 5000000, pricePerThousand: 1.5 },
      { upTo: null, pricePerThousand: 0.38 },
    ],
  },
  places_place_details_pro: {
    freeCap: 5000,
    tiers: [
      { upTo: 100000, pricePerThousand: 17 },
      { upTo: 500000, pricePerThousand: 13.6 },
      { upTo: 1000000, pricePerThousand: 10.2 },
      { upTo: 5000000, pricePerThousand: 5.1 },
      { upTo: null, pricePerThousand: 1.28 },
    ],
  },
  places_place_details_enterprise: {
    freeCap: 1000,
    tiers: [
      { upTo: 100000, pricePerThousand: 20 },
      { upTo: 500000, pricePerThousand: 16 },
      { upTo: 1000000, pricePerThousand: 12 },
      { upTo: 5000000, pricePerThousand: 6 },
      { upTo: null, pricePerThousand: 1.51 },
    ],
  },
  places_place_details_enterprise_plus_atmosphere: {
    freeCap: 1000,
    tiers: [
      { upTo: 100000, pricePerThousand: 25 },
      { upTo: 500000, pricePerThousand: 20 },
      { upTo: 1000000, pricePerThousand: 15 },
      { upTo: 5000000, pricePerThousand: 7.5 },
      { upTo: null, pricePerThousand: 2.28 },
    ],
  },
};

export const GOOGLE_PLACES_SAFE_MONTHLY_CAPS: Record<GooglePlacesSku, number | null> = {
  places_text_search_essentials_ids_only: null,
  places_text_search_pro: 4900,
  places_text_search_enterprise: 900,
  places_text_search_enterprise_plus_atmosphere: 900,
  places_place_details_essentials: 9500,
  places_place_details_pro: 4900,
  places_place_details_enterprise: 900,
  places_place_details_enterprise_plus_atmosphere: 900,
};

const TEXT_SEARCH_ENTERPRISE_FIELDS = new Set([
  "places.googleMapsUri",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.regularOpeningHours",
  "places.currentOpeningHours",
  "places.photos",
]);

const ATMOSPHERE_FIELDS = new Set([
  "places.reviews",
  "places.editorialSummary",
  "reviews",
  "editorialSummary",
]);

const DETAILS_ENTERPRISE_FIELDS = new Set([
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount",
  "priceLevel",
  "regularOpeningHours",
  "currentOpeningHours",
  "photos",
]);

const DETAILS_PRO_FIELDS = new Set([
  "displayName",
  "formattedAddress",
  "location",
  "businessStatus",
  "primaryType",
  "types",
  "googleMapsUri",
]);

function roundCurrency(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function estimateSkuCost(sku: GooglePlacesSku, totalEventsInMonth: number): number {
  if (!Number.isFinite(totalEventsInMonth) || totalEventsInMonth <= 0) return 0;

  const config = GOOGLE_PLACES_SKU_PRICING[sku];
  let remaining = Math.floor(totalEventsInMonth);
  let cost = 0;

  if (remaining <= config.freeCap) return 0;
  remaining -= config.freeCap;

  let previousLimit = config.freeCap;
  for (const tier of config.tiers) {
    const tierCap = tier.upTo ?? Number.POSITIVE_INFINITY;
    const tierSize = Math.max(tierCap - previousLimit, 0);
    if (tierSize <= 0) continue;
    const used = Math.min(remaining, tierSize);
    if (used <= 0) break;
    cost += (used / 1000) * tier.pricePerThousand;
    remaining -= used;
    previousLimit = tierCap;
    if (remaining <= 0) break;
  }

  return roundCurrency(cost);
}

export function getSkuFreeCap(sku: GooglePlacesSku): number {
  return GOOGLE_PLACES_SKU_PRICING[sku].freeCap;
}

export function getSkuSafeMonthlyCap(sku: GooglePlacesSku): number | null {
  return GOOGLE_PLACES_SAFE_MONTHLY_CAPS[sku];
}

function parseFieldMask(fieldMask: string): Set<string> {
  return new Set(fieldMask.split(",").map((field) => field.trim()).filter(Boolean));
}

export function inferTextSearchSkuFromFieldMask(fieldMask: string): GooglePlacesSku {
  const fields = parseFieldMask(fieldMask);
  if (fields.size === 0 || [...fields].every((field) => field === "places.id" || field === "places.name" || field === "nextPageToken")) {
    return "places_text_search_essentials_ids_only";
  }
  if ([...fields].some((field) => ATMOSPHERE_FIELDS.has(field))) {
    return "places_text_search_enterprise_plus_atmosphere";
  }
  if ([...fields].some((field) => TEXT_SEARCH_ENTERPRISE_FIELDS.has(field))) {
    return "places_text_search_enterprise";
  }
  return "places_text_search_pro";
}

export function inferPlaceDetailsSkuFromFieldMask(fieldMask: string): GooglePlacesSku {
  const fields = parseFieldMask(fieldMask);
  if ([...fields].some((field) => ATMOSPHERE_FIELDS.has(field))) {
    return "places_place_details_enterprise_plus_atmosphere";
  }
  if ([...fields].some((field) => DETAILS_ENTERPRISE_FIELDS.has(field))) {
    return "places_place_details_enterprise";
  }
  if ([...fields].some((field) => DETAILS_PRO_FIELDS.has(field))) {
    return "places_place_details_pro";
  }
  return "places_place_details_essentials";
}

export function estimateMarginalSkuCost(
  sku: GooglePlacesSku,
  priorEventsInMonth: number,
  units = 1,
): { estimatedCost: number; estimatedUnitPrice: number } {
  const prior = Math.max(0, Math.floor(priorEventsInMonth));
  const eventUnits = Math.max(0, Math.floor(units));
  if (eventUnits === 0) return { estimatedCost: 0, estimatedUnitPrice: 0 };

  const before = estimateSkuCost(sku, prior);
  const after = estimateSkuCost(sku, prior + eventUnits);
  const delta = roundCurrency(Math.max(after - before, 0));

  return {
    estimatedCost: delta,
    estimatedUnitPrice: roundCurrency(delta / eventUnits),
  };
}
