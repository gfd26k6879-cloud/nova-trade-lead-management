export const PLACE_CACHE_METADATA_KEY = "__nositeCache";

export interface CachedReviewInsights {
  keywords: string[];
  painPoints: string[];
  sentimentRatio: number;
  totalReviews: number;
}

export interface PlaceCacheMetadata {
  schemaVersion: 1;
  detailsStage: "stage-a" | "stage-b";
  reviewInsights?: CachedReviewInsights;
}

export function readPlaceCacheMetadata(
  value: Record<string, unknown> | null | undefined,
): PlaceCacheMetadata | null {
  if (!value) return null;
  const raw = value[PLACE_CACHE_METADATA_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const candidate = raw as Record<string, unknown>;
  if (candidate.schemaVersion !== 1) return null;
  if (candidate.detailsStage !== "stage-a" && candidate.detailsStage !== "stage-b") return null;

  const metadata: PlaceCacheMetadata = {
    schemaVersion: 1,
    detailsStage: candidate.detailsStage,
  };
  const reviewInsights = readCachedReviewInsights(candidate.reviewInsights);
  if (reviewInsights) metadata.reviewInsights = reviewInsights;
  return metadata;
}

export function createPlaceCacheMetadata(input: {
  includeAtmosphere: boolean;
  reviewInsights?: CachedReviewInsights;
}): PlaceCacheMetadata {
  const metadata: PlaceCacheMetadata = {
    schemaVersion: 1,
    detailsStage: input.includeAtmosphere ? "stage-b" : "stage-a",
  };
  if (input.includeAtmosphere && input.reviewInsights) {
    metadata.reviewInsights = normalizeReviewInsights(input.reviewInsights);
  }
  return metadata;
}

function readCachedReviewInsights(value: unknown): CachedReviewInsights | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.keywords) || !Array.isArray(candidate.painPoints)) return null;
  if (typeof candidate.sentimentRatio !== "number" || !Number.isFinite(candidate.sentimentRatio)) return null;
  if (typeof candidate.totalReviews !== "number" || !Number.isFinite(candidate.totalReviews)) return null;

  return normalizeReviewInsights({
    keywords: candidate.keywords.filter((entry): entry is string => typeof entry === "string"),
    painPoints: candidate.painPoints.filter((entry): entry is string => typeof entry === "string"),
    sentimentRatio: candidate.sentimentRatio,
    totalReviews: candidate.totalReviews,
  });
}

function normalizeReviewInsights(insights: CachedReviewInsights): CachedReviewInsights {
  return {
    keywords: Array.from(new Set(insights.keywords.map((entry) => entry.trim()).filter(Boolean))),
    painPoints: Array.from(new Set(insights.painPoints.map((entry) => entry.trim()).filter(Boolean))),
    sentimentRatio: Math.max(0, Math.min(1, insights.sentimentRatio)),
    totalReviews: Math.max(0, Math.floor(insights.totalReviews)),
  };
}
