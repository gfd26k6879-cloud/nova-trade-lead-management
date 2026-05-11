export type GooglePlacesSku =
  | "places_text_search_enterprise"
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
