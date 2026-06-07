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

export type ExploreSuggestionKind = "view" | "quick" | "filter" | "area" | "presentation" | "example" | "builder";

export interface ExploreSearchSuggestion {
  id: string;
  kind: ExploreSuggestionKind;
  label: string;
  description: string;
  command: string;
  updates: Record<string, string | null>;
  aliases?: string[];
}

export interface ExploreSuggestionGroup {
  title: string;
  suggestions: ExploreSearchSuggestion[];
}

export interface ExploreSearchToken extends ExploreFilterChip {
  locked?: boolean;
}

export interface ExploreSuggestionContext {
  mode: ExploreMode;
  query?: string;
  includeAdmin?: boolean;
  showColoradoAreas?: boolean;
  businessTypes?: Array<{ id: string; label: string; active?: number; total?: number }>;
}

export const EXPLORE_PRESENTATION_KEYS = ["sortBy", "view", "map"] as const;

export const GEO_PRESETS: Record<string, Pick<LeadFilters, "minLat" | "maxLat" | "minLng" | "maxLng">> = {
  denver: { minLat: 39.58, maxLat: 39.91, minLng: -105.12, maxLng: -104.72 },
  north_metro: { minLat: 39.85, maxLat: 40.2, minLng: -105.2, maxLng: -104.72 },
  south_metro: { minLat: 39.35, maxLat: 39.66, minLng: -105.12, maxLng: -104.65 },
  boulder: { minLat: 39.94, maxLat: 40.1, minLng: -105.34, maxLng: -105.16 },
  colorado_springs: { minLat: 38.72, maxLat: 39.03, minLng: -104.93, maxLng: -104.62 },
};

export const EXPLORE_MODE_OPTIONS: Array<{ value: ExploreMode; label: string; description: string }> = [
  { value: "work_ready", label: "Work-ready", description: "Active sales opportunities." },
  { value: "directory", label: "Directory", description: "All records, including disqualified or archived inventory." },
  { value: "my_leads", label: "My leads", description: "Leads assigned to you." },
  { value: "unclaimed", label: "Unclaimed", description: "Open leads nobody owns yet." },
  { value: "needs_review", label: "Needs review", description: "Manual or AI review candidates." },
];

export const EXPLORE_QUICK_FILTERS: Array<{
  label: string;
  description: string;
  command: string;
  updates: Record<string, string | null>;
  aliases?: string[];
}> = [
  {
    label: "Best no-site",
    description: "No website, active opportunities, sorted by website need.",
    command: "website:none sort:website_need",
    updates: { mode: "work_ready", websiteStatus: "none", assigned: "any", sortBy: "website_need", page: null },
    aliases: ["no website", "best website gap", "work ready no site"],
  },
  {
    label: "Unclaimed",
    description: "Open leads that nobody owns yet.",
    command: "owner:unclaimed",
    updates: { mode: "unclaimed", assigned: "unassigned", sortBy: "opportunity", page: null },
    aliases: ["unassigned", "available leads"],
  },
  {
    label: "Needs AI",
    description: "Leads still waiting on AI verification.",
    command: "quality:needs_ai owner:any",
    updates: { mode: "needs_review", qualityBucket: "needs_ai_verify", aiVerificationStatus: "not_checked", assigned: "any", sortBy: "opportunity", page: null },
    aliases: ["ai review", "needs verification"],
  },
  {
    label: "Broken/basic site",
    description: "AI/manual quality marked as broken-site opportunity.",
    command: "website:broken",
    updates: { mode: "work_ready", qualityBucket: "broken_site_opportunity", assigned: "any", sortBy: "website_need", page: null },
    aliases: ["broken site", "basic site", "website opportunity"],
  },
  {
    label: "My follow-ups",
    description: "Your contacted leads, sorted by newest.",
    command: "owner:me status:contacted sort:newest",
    updates: { mode: "my_leads", assigned: "me", status: "contacted", sortBy: "created_at", page: null },
    aliases: ["follow ups", "mine contacted"],
  },
];

export const EXPLORE_GEO_PRESET_OPTIONS = [
  { value: "denver", label: "Denver" },
  { value: "north_metro", label: "North metro" },
  { value: "south_metro", label: "South metro" },
  { value: "boulder", label: "Boulder" },
  { value: "colorado_springs", label: "Colorado Springs" },
];

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
    const comparison = token.match(/^(reviews|rating|score)(>=|>)(\d+(?:\.\d+)?)$/i);
    if (comparison) {
      const key = comparison[1].toLowerCase();
      const value = comparison[3];
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

export function buildExploreSearchTokens(mode: ExploreMode, chips: ExploreFilterChip[]): ExploreSearchToken[] {
  return [
    { key: "scope", label: "Scope", value: getExploreModeLabel(mode), removeParams: {}, locked: true },
    ...chips.filter((chip) => !isExplorePresentationChip(chip)),
  ];
}

export function isExplorePresentationChip(chip: Pick<ExploreFilterChip, "key">): boolean {
  return (EXPLORE_PRESENTATION_KEYS as readonly string[]).includes(chip.key);
}

export function buildExploreModeUpdates(mode: ExploreMode): Record<string, string | null> {
  const base = { page: null, assigned: null, qualityBucket: null, aiVerificationStatus: null, status: null };
  if (mode === "work_ready") return { ...base, mode: null };
  return { ...base, mode };
}

export function getExploreModeLabel(mode: ExploreMode): string {
  return EXPLORE_MODE_OPTIONS.find((option) => option.value === mode)?.label ?? "Work-ready";
}

export function buildExploreSearchSuggestions(context: ExploreSuggestionContext): ExploreSuggestionGroup[] {
  const query = (context.query ?? "").trim().toLowerCase();
  const groups: ExploreSuggestionGroup[] = [
    {
      title: "Suggested views",
      suggestions: EXPLORE_MODE_OPTIONS.map((option) => ({
        id: `view:${option.value}`,
        kind: "view",
        label: option.label,
        description: option.description,
        command: `mode:${option.value}`,
        updates: buildExploreModeUpdates(option.value),
        aliases: [option.value.replace(/_/g, " "), option.description],
      })),
    },
    {
      title: "Quick filters",
      suggestions: EXPLORE_QUICK_FILTERS.map((filter) => ({
        id: `quick:${filter.label}`,
        kind: "quick",
        label: filter.label,
        description: filter.description,
        command: filter.command,
        updates: filter.updates,
        aliases: filter.aliases,
      })),
    },
    {
      title: "Common filters",
      suggestions: [
        suggestion("filter:website:none", "filter", "Website: No website", "Businesses without a usable website.", "website:none", { websiteStatus: "none", page: null }, ["no site", "nosite"]),
        suggestion("filter:country:ca", "filter", "Country: Canada", "Canadian leads and discovery inventory.", "country:CA", { countryCode: "CA", page: null }, ["canada", "ontario", "toronto", "london"]),
        suggestion("filter:country:us", "filter", "Country: United States", "U.S. leads and discovery inventory.", "country:US", { countryCode: "US", page: null }, ["usa", "america", "colorado"]),
        suggestion("filter:country:gb", "filter", "Country: United Kingdom", "U.K. leads and discovery inventory.", "country:GB", { countryCode: "GB", page: null }, ["uk", "britain", "england"]),
        suggestion("filter:owner:unclaimed", "filter", "Owner: Unclaimed", "Open leads nobody owns yet.", "owner:unclaimed", { assigned: "unassigned", page: null }, ["unassigned"]),
        suggestion("filter:owner:me", "filter", "Owner: Mine", "Only leads assigned to you.", "owner:me", { assigned: "me", page: null }, ["my leads", "mine"]),
        suggestion("filter:quality:needs_ai", "filter", "Quality: Needs AI", "Leads waiting for AI verification.", "quality:needs_ai", { qualityBucket: "needs_ai_verify", aiVerificationStatus: "not_checked", page: null }, ["ai", "needs review"]),
        suggestion("filter:website:broken", "filter", "Website: Broken/basic", "Broken-site opportunities.", "website:broken", { qualityBucket: "broken_site_opportunity", page: null }, ["basic site", "broken site"]),
        suggestion("filter:reviews", "filter", "Reviews >= 50", "Businesses with enough review volume to prioritize.", "reviews>=50", { minReviews: "50", page: null }, ["review count"]),
        suggestion("filter:rating", "filter", "Rating >= 4.2", "Higher-rated businesses.", "rating>=4.2", { minRating: "4.2", page: null }, ["stars"]),
        suggestion("filter:score", "filter", "Score >= 70", "Higher scored lead candidates.", "score>=70", { minScore: "70", page: null }, ["lead score"]),
      ],
    },
    {
      title: "Examples",
      suggestions: [
        suggestion("example:toronto", "example", "Toronto no-site and unclaimed", "Apply city, website, and owner filters together.", "city:toronto website:none owner:unclaimed", { city: "toronto", websiteStatus: "none", assigned: "unassigned", page: null }, ["canada", "toronto"]),
        suggestion("example:high_reviews", "example", "High-review, high-rating leads", "Prioritize businesses with stronger public demand.", "reviews>=50 rating>=4.2", { minReviews: "50", minRating: "4.2", page: null }, ["reviews", "rating"]),
        suggestion("example:followups", "example", "My contacted follow-ups", "Find your contacted leads sorted by newest.", "owner:me status:contacted sort:newest", { assigned: "me", status: "contacted", sortBy: "created_at", page: null }, ["mine", "follow ups"]),
      ],
    },
  ];

  if (context.showColoradoAreas !== false) {
    groups.splice(3, 0, {
      title: "Areas",
      suggestions: [
        ...EXPLORE_GEO_PRESET_OPTIONS.map((preset) => suggestion(
          `area:${preset.value}`,
          "area",
          `Area: ${preset.label}`,
          "Apply a saved Colorado map boundary.",
          `area:${preset.value}`,
          { geo: preset.value, minLat: null, maxLat: null, minLng: null, maxLng: null, page: null },
          [preset.value.replace(/_/g, " ")],
        )),
        suggestion("area:clear", "area", "Clear area", "Remove saved area boundaries.", "clear area", { geo: null, minLat: null, maxLat: null, minLng: null, maxLng: null, page: null }, ["remove area"]),
      ],
    });
  }

  const businessTypes = context.businessTypes ?? [];
  if (businessTypes.length > 0) {
    groups.splice(3, 0, {
      title: "Business types",
      suggestions: businessTypes.slice(0, 10).map((type) => suggestion(
        `type:${type.id}`,
        "filter",
        `Type: ${type.label}`,
        type.active != null ? `${type.active} active leads` : "Filter by business type.",
        `type:${type.id}`,
        { businessType: type.id, page: null },
        [type.id.replace(/_/g, " ")],
      )),
    });
  }

  groups.push({
    title: "Presentation",
    suggestions: [
      suggestion("presentation:sort:opportunity", "presentation", "Sort: Best opportunity", "Rank by no-site opportunity and quality.", "sort:opportunity", { sortBy: "opportunity", page: null }, ["best"]),
      suggestion("presentation:sort:website_need", "presentation", "Sort: Website need", "Prioritize no-site and broken-site opportunities.", "sort:website_need", { sortBy: "website_need", page: null }, ["website sort"]),
      suggestion("presentation:view:cards", "presentation", "View: Cards", "Use scannable lead cards.", "view:cards", { view: "cards", page: null }, ["cards"]),
      suggestion("presentation:view:table", "presentation", "View: Table", "Use the dense table view.", "view:table", { view: "table", page: null }, ["table"]),
      suggestion("presentation:map:open", "presentation", "Map: Open", "Open the lazy-loaded map drawer.", "map:on", { map: "open", page: null }, ["show map"]),
    ],
  });

  if (context.includeAdmin) {
    groups.push({
      title: "Admin filters",
      suggestions: [
        suggestion("admin:archive:all", "filter", "Inventory: Active + archived", "Include archived records.", "archive:all", { archived: "all", page: null }, ["archived"]),
        suggestion("admin:excluded", "filter", "Include excluded", "Show excluded and disqualified inventory.", "include excluded", { includeExcluded: "true", page: null }, ["disqualified"]),
      ],
    });
  }

  return groups
    .map((group) => ({ ...group, suggestions: group.suggestions.filter((item) => matchesSuggestion(item, query)) }))
    .filter((group) => group.suggestions.length > 0);
}

export function parseMapPointLimit(value: string | null | undefined): number {
  const requested = Math.floor(parseNumber(value ?? undefined) ?? DEFAULT_MAP_POINT_LIMIT);
  return Math.max(1, Math.min(MAX_MAP_POINT_LIMIT, requested));
}

function suggestion(
  id: string,
  kind: ExploreSuggestionKind,
  label: string,
  description: string,
  command: string,
  updates: Record<string, string | null>,
  aliases?: string[],
): ExploreSearchSuggestion {
  return { id, kind, label, description, command, updates, aliases };
}

function matchesSuggestion(item: ExploreSearchSuggestion, query: string): boolean {
  if (!query) return true;
  const searchable = [item.label, item.description, item.command, ...(item.aliases ?? [])].join(" ").toLowerCase();
  if (searchable.includes(query)) return true;
  const firstWord = item.label.split(/[\s:]+/)[0]?.toLowerCase() ?? "";
  return query.length >= 3 && editDistance(query, firstWord) <= 2;
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
  if (key === "country") return applySimple(filters, chips, "countryCode", "Country", countryAlias(value));
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

function countryAlias(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "canada" || normalized === "ca") return "CA";
  if (normalized === "us" || normalized === "usa" || normalized === "united_states" || normalized === "united-states" || normalized === "america") return "US";
  if (normalized === "gb" || normalized === "uk" || normalized === "united_kingdom" || normalized === "united-kingdom" || normalized === "britain") return "GB";
  return value.toUpperCase();
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
