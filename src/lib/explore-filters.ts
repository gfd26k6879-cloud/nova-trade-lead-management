import type { LeadFilters } from "@/lib/db/queries";

export const EXPLORER_PAGE_SIZE = 60;
export const DEFAULT_MAP_POINT_LIMIT = 200;
export const MAX_MAP_POINT_LIMIT = 600;

export const GEO_PRESETS: Record<string, Pick<LeadFilters, "minLat" | "maxLat" | "minLng" | "maxLng">> = {
  denver: { minLat: 39.58, maxLat: 39.91, minLng: -105.12, maxLng: -104.72 },
  north_metro: { minLat: 39.85, maxLat: 40.2, minLng: -105.2, maxLng: -104.72 },
  south_metro: { minLat: 39.35, maxLat: 39.66, minLng: -105.12, maxLng: -104.65 },
  boulder: { minLat: 39.94, maxLat: 40.1, minLng: -105.34, maxLng: -105.16 },
  colorado_springs: { minLat: 38.72, maxLat: 39.03, minLng: -104.93, maxLng: -104.62 },
};

export interface ExploreParams {
  search?: string;
  status?: string;
  websiteStatus?: string;
  minReviews?: string;
  minRating?: string;
  minScore?: string;
  city?: string;
  zip?: string;
  minLat?: string;
  maxLat?: string;
  minLng?: string;
  maxLng?: string;
  category?: string;
  businessType?: string;
  countryCode?: string;
  marketId?: string;
  locationCellId?: string;
  assigned?: string;
  qualityBucket?: string;
  aiVerificationStatus?: string;
  sortBy?: string;
  sortDir?: string;
  page?: string;
  view?: string;
  map?: string;
  geo?: string;
}

export function buildExploreQueryState(params: ExploreParams, userId: string): {
  filters: LeadFilters;
  view: "cards" | "table";
  mapOpen: boolean;
} {
  const geoBounds = params.geo ? GEO_PRESETS[params.geo] : undefined;
  const assignedFilter: "me" | "unassigned" | "any" | undefined =
    params.assigned === "me" || params.assigned === "unassigned" || params.assigned === "any" ? params.assigned : undefined;

  return {
    view: params.view === "table" ? "table" : "cards",
    mapOpen: params.map === "open",
    filters: {
      search: cleanParam(params.search),
      status: cleanParam(params.status),
      includeExcluded: false,
      archived: "active",
      websiteStatus: cleanParam(params.websiteStatus),
      city: cleanParam(params.city),
      zip: cleanParam(params.zip),
      minLat: parseNumber(params.minLat) ?? geoBounds?.minLat,
      maxLat: parseNumber(params.maxLat) ?? geoBounds?.maxLat,
      minLng: parseNumber(params.minLng) ?? geoBounds?.minLng,
      maxLng: parseNumber(params.maxLng) ?? geoBounds?.maxLng,
      minReviews: parseNumber(params.minReviews),
      minRating: parseNumber(params.minRating),
      minScore: parseNumber(params.minScore),
      category: cleanParam(params.category),
      businessType: cleanParam(params.businessType),
      countryCode: cleanParam(params.countryCode),
      marketId: cleanParam(params.marketId),
      locationCellId: cleanParam(params.locationCellId),
      assigned: assignedFilter === "any" ? undefined : assignedFilter,
      assignedToUserId: assignedFilter === "me" ? userId : undefined,
      qualityBucket: cleanParam(params.qualityBucket),
      aiVerificationStatus: cleanParam(params.aiVerificationStatus),
      sortBy: cleanParam(params.sortBy) ?? "opportunity",
      sortDir: params.sortDir === "asc" ? "asc" : "desc",
      page: Math.max(1, Math.floor(parseNumber(params.page) ?? 1)),
      pageSize: EXPLORER_PAGE_SIZE,
    },
  };
}

export function parseMapPointLimit(value: string | null | undefined): number {
  const requested = Math.floor(parseNumber(value ?? undefined) ?? DEFAULT_MAP_POINT_LIMIT);
  return Math.max(1, Math.min(MAX_MAP_POINT_LIMIT, requested));
}

function cleanParam(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
