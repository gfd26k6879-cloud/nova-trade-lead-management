import type { LeadFilters } from "@/lib/db/queries";

export const EXPLORER_PAGE_SIZE = 60;
export const DEFAULT_MAP_POINT_LIMIT = 200;
export const MAX_MAP_POINT_LIMIT = 600;
export type ExploreMode = "work_ready" | "directory" | "my_leads" | "unclaimed" | "needs_review";

export interface ExploreCommandResult {
  filters: Record<string, string | null>;
  chips: ExploreFilterChip[];
  errors: string[];
  unparsedText: string;
}

export interface ExploreFilterChip {
  key: string;
  label: string;
  value: string;
  removeParams: Record<string, string | null>;
}

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
  mode?: string;
  archived?: string;
  includeExcluded?: string | boolean;
}

export function buildExploreQueryState(params: ExploreParams, userId: string): {
  filters: LeadFilters;
  view: "cards" | "table";
  mapOpen: boolean;
  mode: ExploreMode;
} {
  const geoBounds = params.geo ? GEO_PRESETS[params.geo] : undefined;
  const mode = normalizeExploreMode(params.mode);
  const assignedFilter: "me" | "unassigned" | "any" | undefined =
    params.assigned === "me" || params.assigned === "unassigned" || params.assigned === "any" ? params.assigned : undefined;
  const modeAssigned = mode === "my_leads" ? "me" : mode === "unclaimed" ? "unassigned" : undefined;
  const effectiveAssigned = assignedFilter ?? modeAssigned;
  const includeExcluded = params.includeExcluded === "true" || params.includeExcluded === true || mode === "directory";
  const archived = normalizeArchivedFilter(params.archived, mode);

  return {
    view: params.view === "table" ? "table" : "cards",
    mapOpen: params.map === "open",
    mode,
    filters: {
      search: cleanParam(params.search),
      status: cleanParam(params.status),
      includeExcluded,
      archived,
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
      assigned: effectiveAssigned === "any" ? undefined : effectiveAssigned,
      assignedToUserId: effectiveAssigned === "me" ? userId : undefined,
      qualityBucket: mode === "needs_review" ? (cleanParam(params.qualityBucket) ?? "needs_manual_review") : cleanParam(params.qualityBucket),
      aiVerificationStatus: cleanParam(params.aiVerificationStatus),
      sortBy: cleanParam(params.sortBy) ?? "opportunity",
      sortDir: params.sortDir === "asc" ? "asc" : "desc",
      page: Math.max(1, Math.floor(parseNumber(params.page) ?? 1)),
      pageSize: EXPLORER_PAGE_SIZE,
    },
  };
}

export function parseExploreCommand(input: string): ExploreCommandResult {
  const filters: Record<string, string | null> = {};
  const chips: ExploreFilterChip[] = [];
  const errors: string[] = [];
  const freeText: string[] = [];
  const tokens = input.trim().split(/\s+/).filter(Boolean);

  for (const token of tokens) {
    const comparison = token.match(/^(reviews|rating|score)>(\d+(?:\.\d+)?)$/i);
    if (comparison) {
      const key = comparison[1].toLowerCase();
      const value = comparison[2];
      const param = key === "reviews" ? "minReviews" : key === "rating" ? "minRating" : "minScore";
      filters[param] = value;
      chips.push({ key: param, label: minLabel(param), value, removeParams: { [param]: null } });
      continue;
    }

    const keyed = token.match(/^([a-zA-Z_]+):(.+)$/);
    if (!keyed) {
      freeText.push(token);
      continue;
    }

    const key = keyed[1].toLowerCase();
    const rawValue = keyed[2].trim();
    const value = normalizeCommandValue(rawValue);
    const applied = applyCommandToken(key, value, filters, chips);
    if (!applied) {
      errors.push(unknownCommandMessage(key));
    }
  }

  const unparsedText = freeText.join(" ").trim();
  if (unparsedText) {
    filters.search = unparsedText;
    chips.unshift({ key: "search", label: "Search", value: unparsedText, removeParams: { search: null } });
  }

  return { filters, chips, errors, unparsedText };
}

export function buildExploreFilterChips(params: ExploreParams & Record<string, string | number | boolean | undefined>): ExploreFilterChip[] {
  const chips: ExploreFilterChip[] = [];
  const mode = normalizeExploreMode(String(params.mode ?? ""));
  if (mode !== "work_ready") {
    chips.push({ key: "mode", label: "Mode", value: formatMode(mode), removeParams: { mode: null } });
  }
  addChip(chips, "search", "Search", params.search, { search: null });
  addChip(chips, "city", "City", params.city, { city: null });
  addChip(chips, "zip", "Postal", params.zip, { zip: null });
  addChip(chips, "countryCode", "Country", params.countryCode, { countryCode: null });
  addChip(chips, "marketId", "Market", params.marketId, { marketId: null });
  addChip(chips, "locationCellId", "Cell", params.locationCellId, { locationCellId: null });
  addChip(chips, "websiteStatus", "Website", params.websiteStatus, { websiteStatus: null });
  addChip(chips, "qualityBucket", "Quality", params.qualityBucket, { qualityBucket: null });
  addChip(chips, "aiVerificationStatus", "AI", params.aiVerificationStatus, { aiVerificationStatus: null });
  addChip(chips, "status", "Status", params.status, { status: null });
  addChip(chips, "category", "Category", params.category, { category: null });
  addChip(chips, "businessType", "Type", params.businessType, { businessType: null });
  addChip(chips, "assigned", "Owner", params.assigned, { assigned: null });
  addChip(chips, "minReviews", "Reviews", params.minReviews, { minReviews: null });
  addChip(chips, "minRating", "Rating", params.minRating, { minRating: null });
  addChip(chips, "minScore", "Score", params.minScore, { minScore: null });
  addChip(chips, "sortBy", "Sort", params.sortBy, { sortBy: null });
  addChip(chips, "view", "View", params.view, { view: null });
  if (params.map === "open") chips.push({ key: "map", label: "Map", value: "Open", removeParams: { map: null } });
  if (params.geo) chips.push({ key: "geo", label: "Area", value: String(params.geo), removeParams: { geo: null, minLat: null, maxLat: null, minLng: null, maxLng: null } });
  if (params.archived && params.archived !== "active") chips.push({ key: "archived", label: "Archive", value: String(params.archived), removeParams: { archived: null } });
  if (params.includeExcluded === "true" || params.includeExcluded === true) chips.push({ key: "includeExcluded", label: "Excluded", value: "Included", removeParams: { includeExcluded: null } });
  return chips;
}

export function parseMapPointLimit(value: string | null | undefined): number {
  const requested = Math.floor(parseNumber(value ?? undefined) ?? DEFAULT_MAP_POINT_LIMIT);
  return Math.max(1, Math.min(MAX_MAP_POINT_LIMIT, requested));
}

function normalizeExploreMode(value: string | undefined): ExploreMode {
  if (value === "directory" || value === "my_leads" || value === "unclaimed" || value === "needs_review") return value;
  return "work_ready";
}

function normalizeArchivedFilter(value: string | undefined, mode: ExploreMode): "active" | "archived" | "all" {
  if (value === "archived" || value === "all") return value;
  return mode === "directory" ? "all" : "active";
}

function applyCommandToken(
  key: string,
  value: string,
  filters: Record<string, string | null>,
  chips: ExploreFilterChip[],
): boolean {
  if (key === "city") return applySimple(filters, chips, "city", "City", value);
  if (key === "postal" || key === "postcode" || key === "zip") return applySimple(filters, chips, "zip", "Postal", value.toUpperCase());
  if (key === "market") return applySimple(filters, chips, "marketId", "Market", normalizeMarketId(value));
  if (key === "country") return applySimple(filters, chips, "countryCode", "Country", value.toUpperCase());
  if (key === "cell") return applySimple(filters, chips, "locationCellId", "Cell", value.toUpperCase());
  if (key === "category") return applySimple(filters, chips, "category", "Category", value);
  if (key === "type") return applySimple(filters, chips, "businessType", "Type", value);
  if (key === "status") return applySimple(filters, chips, "status", "Status", statusAlias(value));
  if (key === "owner") return applySimple(filters, chips, "assigned", "Owner", ownerAlias(value));
  if (key === "website") {
    if (value === "broken") return applySimple(filters, chips, "qualityBucket", "Quality", "broken_site_opportunity");
    return applySimple(filters, chips, "websiteStatus", "Website", websiteAlias(value));
  }
  if (key === "quality") return applySimple(filters, chips, "qualityBucket", "Quality", qualityAlias(value));
  if (key === "sort") return applySimple(filters, chips, "sortBy", "Sort", sortAlias(value));
  if (key === "view") return applySimple(filters, chips, "view", "View", value === "table" ? "table" : "cards");
  if (key === "map") return applySimple(filters, chips, "map", "Map", value === "on" || value === "open" ? "open" : "");
  return false;
}

function applySimple(
  filters: Record<string, string | null>,
  chips: ExploreFilterChip[],
  param: string,
  label: string,
  value: string,
): true {
  filters[param] = value || null;
  chips.push({ key: param, label, value: value || "Any", removeParams: { [param]: null } });
  return true;
}

function normalizeCommandValue(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function normalizeMarketId(value: string): string {
  return value.startsWith("market-") ? value : `market-${value.replace(/\s+/g, "-")}`;
}

function websiteAlias(value: string): string {
  if (value === "no" || value === "nosite" || value === "no_site") return "none";
  return value;
}

function qualityAlias(value: string): string {
  const aliases: Record<string, string> = {
    ready: "ready_to_call",
    needs_ai: "needs_ai_verify",
    ai: "needs_ai_verify",
    manual_review: "needs_manual_review",
    review: "needs_manual_review",
    broken_site: "broken_site_opportunity",
    broken: "broken_site_opportunity",
  };
  return aliases[value] ?? value;
}

function ownerAlias(value: string): string {
  if (value === "unclaimed" || value === "none") return "unassigned";
  if (value === "mine") return "me";
  return value;
}

function statusAlias(value: string): string {
  if (value === "follow_up") return "contacted";
  return value;
}

function sortAlias(value: string): string {
  if (value === "newest") return "created_at";
  return value;
}

function minLabel(param: string): string {
  if (param === "minReviews") return "Reviews >";
  if (param === "minRating") return "Rating >";
  return "Score >";
}

function addChip(
  chips: ExploreFilterChip[],
  key: string,
  label: string,
  value: unknown,
  removeParams: Record<string, string | null>,
): void {
  if (value === undefined || value === null || value === "" || value === "any") return;
  chips.push({ key, label, value: String(value), removeParams });
}

function unknownCommandMessage(key: string): string {
  const known = ["city", "postal", "postcode", "zip", "market", "country", "cell", "website", "quality", "owner", "status", "category", "type", "sort", "view", "map"];
  const suggestion = known.find((candidate) => editDistance(key, candidate) <= 2);
  return suggestion
    ? `Unknown filter "${key}". Did you mean ${suggestion}:none?`
    : `Unknown filter "${key}". Try city:, postal:, market:, website:, quality:, owner:, category:, sort:, view:, or map:.`;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

function formatMode(mode: ExploreMode): string {
  return mode.replace(/_/g, " ");
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
