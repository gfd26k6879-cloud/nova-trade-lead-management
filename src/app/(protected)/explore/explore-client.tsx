"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HelpTip } from "@/components/help-tip";
import { PageShell } from "@/components/page-shell";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { claimLeadAction } from "@/lib/leads/actions";
import { getBusinessTypeLabel } from "@/lib/business-types";
import type { Lead, LeadMapPoint, LeadMapZipCoverage } from "@/lib/db/queries";
import { buildGoogleMapsScriptUrl, GOOGLE_MAPS_SCRIPT_ID, hasGoogleMapsBrowserKey } from "@/lib/google-maps";
import type { AppRole } from "@/lib/permissions";
import type { ScoreBandThresholds } from "@/lib/score-bands";

type ExplorerView = "cards" | "table";
type GoogleMapsLoadState = "loading" | "ready" | "error";

type GoogleLatLngLiteral = { lat: number; lng: number };

interface GoogleMapsListener {
  remove(): void;
}

interface GoogleMap {
  fitBounds(bounds: GoogleLatLngBounds, padding?: number | { top: number; right: number; bottom: number; left: number }): void;
  panTo(point: GoogleLatLngLiteral): void;
}

interface GoogleOverlay {
  setMap(map: GoogleMap | null): void;
}

interface GoogleMarker extends GoogleOverlay {
  addListener(eventName: string, handler: () => void): GoogleMapsListener;
}

interface GoogleCircle extends GoogleOverlay {
  addListener(eventName: string, handler: () => void): GoogleMapsListener;
}

interface GoogleLatLngBounds {
  extend(point: GoogleLatLngLiteral): void;
  isEmpty(): boolean;
}

interface GoogleMapsNamespace {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
    Marker: new (options: Record<string, unknown>) => GoogleMarker;
    Circle: new (options: Record<string, unknown>) => GoogleCircle;
    LatLngBounds: new () => GoogleLatLngBounds;
    Size: new (width: number, height: number) => unknown;
    Point: new (x: number, y: number) => unknown;
    SymbolPath: { CIRCLE: number };
    event: { clearInstanceListeners(target: object): void };
  };
}

declare global {
  interface Window {
    google?: GoogleMapsNamespace;
    __nositeGoogleMapsReady?: () => void;
  }
}

let googleMapsLoadPromise: Promise<GoogleMapsNamespace> | null = null;

interface Props {
  leads: Lead[];
  total: number;
  mapPoints: LeadMapPoint[];
  totalMapped: number;
  mapPointLimit: number;
  zipCoverage: LeadMapZipCoverage[];
  filters: {
    search?: string;
    status?: string;
    websiteStatus?: string;
    minReviews?: number;
    minRating?: number;
    minScore?: number;
    city?: string;
    zip?: string;
    minLat?: number;
    maxLat?: number;
    minLng?: number;
    maxLng?: number;
    category?: string;
    businessType?: string;
    assigned?: string;
    qualityBucket?: string;
    aiVerificationStatus?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    pageSize?: number;
    view?: string;
    map?: string;
    geo?: string;
  };
  scoreThresholds: ScoreBandThresholds;
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
  currentUser: { userId: string; email: string; role: AppRole };
  googleMapsApiKey: string | null;
}

const WEBSITE_OPTIONS = ["", "none", "social", "basic", "custom"];
const STATUS_OPTIONS = ["", "new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost"];
const QUALITY_OPTIONS = ["", "ready_to_call", "broken_site_opportunity", "needs_ai_verify", "needs_manual_review", "not_a_fit"];
const AI_OPTIONS = ["", "not_checked", "no_site_found", "weak_site_found", "site_found", "uncertain", "mismatch"];
const SORT_OPTIONS = [
  { value: "opportunity", label: "Best opportunity" },
  { value: "website_need", label: "Website need" },
  { value: "sales_priority_score", label: "Sales priority" },
  { value: "lead_quality_score", label: "Lead quality" },
  { value: "estimated_deal_value", label: "Deal value" },
  { value: "review_count", label: "Reviews" },
  { value: "rating", label: "Rating" },
  { value: "name", label: "Name" },
  { value: "created_at", label: "Newest" },
];
const CATEGORY_OPTIONS = [
  "dentist", "chiropractor", "plumber", "electrician", "hvac_contractor",
  "roofing_contractor", "auto_repair", "hair_salon", "real_estate_agent",
  "restaurant", "gym", "landscaper", "veterinarian", "accountant", "lawyer",
];
const GEO_PRESETS = [
  { value: "denver", label: "Denver" },
  { value: "north_metro", label: "North metro" },
  { value: "south_metro", label: "South metro" },
  { value: "boulder", label: "Boulder" },
  { value: "colorado_springs", label: "Colorado Springs" },
];
const MAP_LIST_LIMIT = 80;
const QUICK_FILTERS: Array<{
  label: string;
  description: string;
  updates: Record<string, string | null>;
}> = [
  {
    label: "All no-site leads",
    description: "No website, any owner, sorted by website need, with map drawer open.",
    updates: { websiteStatus: "none", assigned: "any", sortBy: "website_need", map: "open", page: null },
  },
  {
    label: "Unclaimed no-site",
    description: "No website and not claimed by anyone yet.",
    updates: { websiteStatus: "none", assigned: "unassigned", sortBy: "website_need", map: "open", page: null },
  },
  {
    label: "Broken site",
    description: "AI/manual quality marked as broken-site opportunity.",
    updates: { qualityBucket: "broken_site_opportunity", assigned: "any", sortBy: "website_need", map: "open", page: null },
  },
  {
    label: "Needs AI review",
    description: "Leads still waiting on AI verification.",
    updates: { qualityBucket: "needs_ai_verify", aiVerificationStatus: "not_checked", assigned: "any", sortBy: "opportunity", map: null, page: null },
  },
];

export function ExploreClient({
  leads,
  total,
  mapPoints,
  totalMapped,
  mapPointLimit,
  zipCoverage,
  filters,
  scoreThresholds,
  businessTypeCounts,
  currentUser,
  googleMapsApiKey,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search ?? "");
  const [city, setCity] = useState(filters.city ?? "");
  const [zip, setZip] = useState(filters.zip ?? "");
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(mapPoints[0]?.id ?? leads[0]?.id ?? null);

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 60;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const view = normalizeView(filters.view);
  const mapOpen = filters.map === "open";
  const selectedMapPoint = mapPoints.find((lead) => lead.id === selectedLeadId) ?? mapPoints[0] ?? null;
  const zipCoverageWithLeadCounts = useMemo(() => mergeZipCoverageWithMapPoints(zipCoverage, mapPoints), [zipCoverage, mapPoints]);
  const visibleMapList = useMemo(() => mapPoints.slice(0, MAP_LIST_LIMIT), [mapPoints]);
  const pageUnclaimed = leads.filter((lead) => !lead.assigned_to_user_id).length;
  const pageMapped = leads.filter((lead) => typeof lead.lat === "number" && typeof lead.lng === "number").length;
  const stats = [
    { label: "Matching Leads", value: String(total) },
    { label: "Unclaimed Here", value: String(pageUnclaimed), hint: "On this page" },
    { label: "Mapped Here", value: String(pageMapped), hint: "On this page" },
    { label: "Page", value: `${page} / ${totalPages}` },
  ];

  const pushFilters = useCallback(
    (updates: Record<string, string | number | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value == null || value === "") params.delete(key);
        else params.set(key, String(value));
      }
      if (!("page" in updates)) params.delete("page");
      const qs = params.toString();
      router.push(qs ? `/explore?${qs}` : "/explore");
    },
    [router, searchParams],
  );

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    pushFilters({ search, city, zip });
  };

  const claimLead = async (leadId: string) => {
    setBusyLeadId(leadId);
    const result = await claimLeadAction(leadId);
    if ("error" in result) setMessage(result.error ?? "Unable to claim lead");
    else setMessage("Lead claimed");
    router.refresh();
    window.setTimeout(() => setMessage(null), 3500);
    setBusyLeadId(null);
  };

  const selectMapZip = useCallback((nextZip: string) => {
    setZip(nextZip);
    pushFilters({ zip: nextZip });
  }, [pushFilters]);

  return (
    <PageShell
      title="Lead Explorer"
      description="Browse the full lead inventory, narrow by location and quality, then claim the business you want to work."
      stats={stats}
    >
      {message && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(99,102,241,0.1)", color: "var(--text-primary)" }}>
          {message}
        </div>
      )}

      <section className="glass rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="section-label">Search</span>
                <input
                  type="text"
                  className="glass-input min-w-56"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, phone, address"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="section-label">City</span>
                <input className="glass-input w-36" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Denver" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="section-label">ZIP</span>
                <input className="glass-input w-28" value={zip} onChange={(event) => setZip(event.target.value)} placeholder="80202" />
              </label>
              <button type="submit" className="btn-primary text-sm">Apply</button>
            </form>

            <div className="flex flex-wrap gap-2 lg:ml-auto">
              <SegmentButton active={mapOpen} onClick={() => pushFilters({ map: mapOpen ? null : "open" })}>
                {mapOpen ? "Hide map" : "Show map"}
              </SegmentButton>
              <SegmentButton active={view === "cards"} onClick={() => pushFilters({ view: "cards" })}>Cards</SegmentButton>
              <SegmentButton active={view === "table"} onClick={() => pushFilters({ view: "table" })}>Table</SegmentButton>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: "rgba(255,255,255,0.32)" }}>
            <span className="section-label">Quick views</span>
            {QUICK_FILTERS.map((filter) => (
              <button
                key={filter.label}
                type="button"
                className="btn-glass text-xs"
                title={filter.description}
                onClick={() => pushFilters(filter.updates)}
              >
                {filter.label}
              </button>
            ))}
            <Link href="/explore" className="btn-glass text-xs">Reset all</Link>
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Filters update the list and the optional map together. <HelpTip>The map drawer loads Google Maps only after you open it. No Places, Geocoding, Routes, or server map API calls are made from this view.</HelpTip>
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="section-label">Business type</span>
              <select className="glass-select" value={filters.businessType ?? ""} onChange={(event) => pushFilters({ businessType: event.target.value })}>
                <option value="">All business types</option>
                {businessTypeCounts.map((type) => (
                  <option key={type.id} value={type.id}>{type.label}{type.total > 0 ? ` (${type.active})` : ""}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="section-label">Website</span>
              <select className="glass-select" value={filters.websiteStatus ?? ""} onChange={(event) => pushFilters({ websiteStatus: event.target.value })}>
                <option value="">All websites</option>
                {WEBSITE_OPTIONS.filter(Boolean).map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="section-label">Quality</span>
              <select className="glass-select" value={filters.qualityBucket ?? ""} onChange={(event) => pushFilters({ qualityBucket: event.target.value })}>
                <option value="">All quality</option>
                {QUALITY_OPTIONS.filter(Boolean).map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="section-label">AI verification</span>
              <select className="glass-select" value={filters.aiVerificationStatus ?? ""} onChange={(event) => pushFilters({ aiVerificationStatus: event.target.value })}>
                <option value="">All AI states</option>
                {AI_OPTIONS.filter(Boolean).map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="section-label">Lead status</span>
              <select className="glass-select" value={filters.status ?? ""} onChange={(event) => pushFilters({ status: event.target.value })}>
                <option value="">All statuses</option>
                {STATUS_OPTIONS.filter(Boolean).map((status) => <option key={status} value={status}>{formatLabel(status)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="section-label">Category</span>
              <select className="glass-select" value={filters.category ?? ""} onChange={(event) => pushFilters({ category: event.target.value })}>
                <option value="">All categories</option>
                {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{formatLabel(category)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="section-label">Assignment</span>
              <select className="glass-select" value={filters.assigned ?? "any"} onChange={(event) => pushFilters({ assigned: event.target.value })}>
                <option value="any">Any owner</option>
                <option value="unassigned">Unclaimed</option>
                <option value="me">Mine</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="section-label">Sort</span>
              <select className="glass-select" value={filters.sortBy ?? "opportunity"} onChange={(event) => pushFilters({ sortBy: event.target.value })}>
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="section-label">Min reviews</span>
              <input
                type="number"
                min={0}
                step={1}
                className="glass-input"
                defaultValue={filters.minReviews ?? ""}
                onChange={(event) => pushFilters({ minReviews: event.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="section-label">Min rating</span>
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                className="glass-input"
                defaultValue={filters.minRating ?? ""}
                onChange={(event) => pushFilters({ minRating: event.target.value })}
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="section-label">Min score</span>
              <input
                type="number"
                min={0}
                step={0.5}
                className="glass-input"
                defaultValue={filters.minScore ?? ""}
                onChange={(event) => pushFilters({ minScore: event.target.value })}
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="section-label">Area</span>
            {GEO_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`btn-glass text-xs ${filters.geo === preset.value ? "nav-link-active" : ""}`}
                onClick={() => pushFilters({ geo: preset.value, minLat: null, maxLat: null, minLng: null, maxLng: null })}
              >
                {preset.label}
              </button>
            ))}
            <button type="button" className="btn-glass text-xs" onClick={() => pushFilters({ geo: null, minLat: null, maxLat: null, minLng: null, maxLng: null })}>
              Clear area
            </button>
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Opportunity sort <HelpTip>No-site and broken-site businesses rank ahead of weak/basic website leads, then quality and sales priority break ties.</HelpTip>
            </span>
          </div>
        </div>
      </section>

      {mapOpen && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
          <LeadMap
            points={mapPoints}
            zipCoverage={zipCoverageWithLeadCounts}
            total={total}
            totalMapped={totalMapped}
            mapPointLimit={mapPointLimit}
            selectedLeadId={selectedMapPoint?.id ?? null}
            googleMapsApiKey={googleMapsApiKey}
            onSelect={setSelectedLeadId}
            onZipSelect={selectMapZip}
          />
          <MapSidePanel
            points={visibleMapList}
            selectedPoint={selectedMapPoint}
            selectedLeadId={selectedMapPoint?.id ?? null}
            totalMapped={totalMapped}
            listLimit={MAP_LIST_LIMIT}
            currentUserId={currentUser.userId}
            scoreThresholds={scoreThresholds}
            busyLeadId={busyLeadId}
            onSelect={setSelectedLeadId}
            onClaim={claimLead}
          />
        </section>
      )}

      {view === "table" ? (
        <LeadTable leads={leads} currentUserId={currentUser.userId} scoreThresholds={scoreThresholds} busyLeadId={busyLeadId} onClaim={claimLead} />
      ) : (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {leads.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState text="No leads match the current filters." />
            </div>
          ) : leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              currentUserId={currentUser.userId}
              scoreThresholds={scoreThresholds}
              busy={busyLeadId === lead.id}
              onClaim={claimLead}
            />
          ))}
        </section>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button type="button" className="btn-glass text-sm" disabled={page <= 1} onClick={() => pushFilters({ page: page - 1 })}>
            Previous
          </button>
          <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>Page {page} of {totalPages}</span>
          <button type="button" className="btn-glass text-sm" disabled={page >= totalPages} onClick={() => pushFilters({ page: page + 1 })}>
            Next
          </button>
        </div>
      )}
    </PageShell>
  );
}

function LeadMap({
  points,
  zipCoverage,
  total,
  totalMapped,
  mapPointLimit,
  selectedLeadId,
  googleMapsApiKey,
  onSelect,
  onZipSelect,
}: {
  points: LeadMapPoint[];
  zipCoverage: LeadMapZipCoverage[];
  total: number;
  totalMapped: number;
  mapPointLimit: number;
  selectedLeadId: string | null;
  googleMapsApiKey: string | null;
  onSelect: (leadId: string) => void;
  onZipSelect: (zip: string) => void;
}) {
  const [showCoverage, setShowCoverage] = useState(true);
  const [googleResetToken, setGoogleResetToken] = useState(0);
  const hasMore = totalMapped > points.length;
  const missingCoordinates = Math.max(0, total - totalMapped);
  const coverageSummary = summarizeZipCoverage(zipCoverage);
  const googleMapsEnabled = hasGoogleMapsBrowserKey(googleMapsApiKey);

  const resetMap = () => {
    setGoogleResetToken((value) => value + 1);
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="section-label">Map drawer</h3>
            <HelpTip>Google Maps loads only while this drawer is open. It uses stored lead and ZIP coordinates; this view does not call Places, Geocoding, Routes, or Map Tiles APIs from the server.</HelpTip>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Pan and zoom the real map, click a marker to inspect a lead, or click a ZIP coverage circle to filter the list.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ background: "rgba(255,255,255,0.58)", color: "var(--text-secondary)" }}>
            {points.length} shown / {totalMapped} mapped
          </span>
          <button type="button" className={`btn-glass px-3 py-1.5 text-xs ${showCoverage ? "nav-link-active" : ""}`} onClick={() => setShowCoverage((value) => !value)}>
            ZIP coverage
          </button>
          <button type="button" className="btn-glass px-3 py-1.5 text-xs" onClick={resetMap}>
            Reset view
          </button>
        </div>
      </div>

      {!googleMapsEnabled && (
        <div className="rounded-xl p-6 text-sm" style={{ background: "rgba(255,255,255,0.46)", color: "var(--text-secondary)" }}>
          Google Maps is not configured for this environment. Add the browser key in Settings or Vercel, then reopen the drawer.
        </div>
      )}

      {googleMapsEnabled && (
        <GoogleLeadMap
          apiKey={googleMapsApiKey ?? ""}
          points={points}
          zipCoverage={zipCoverage}
          selectedLeadId={selectedLeadId}
          showCoverage={showCoverage}
          resetToken={googleResetToken}
          onSelect={onSelect}
          onZipSelect={onZipSelect}
        />
      )}
      {googleMapsEnabled && points.length === 0 && (
        <p className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.46)", color: "var(--text-tertiary)" }}>
          {total > 0
            ? `${missingCoordinates} matching leads do not have stored coordinates. The list below still shows matching businesses.`
            : "No leads match the current filters."}
        </p>
      )}
      {hasMore && (
        <p className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.46)", color: "var(--text-tertiary)" }}>
          Showing top {mapPointLimit} mapped leads by current sort. Narrow filters to inspect more on the map.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.44)", color: "var(--text-secondary)" }}>
        <LegendDot color="#e2e8f0" label={`Not started ${coverageSummary.notStarted}`} />
        <LegendDot color="#f59e0b" label={`Partial ${coverageSummary.partial}`} />
        <LegendDot color="#0f766e" label={`Covered ${coverageSummary.complete}`} />
        <span className="mx-1 h-4 w-px bg-slate-300/70" />
        <LegendDot color="#dc2626" label="No site" />
        <LegendDot color="#ea580c" label="Broken" />
        <LegendDot color="#4f46e5" label="Weak/basic" />
      </div>
    </div>
  );
}

function GoogleLeadMap({
  apiKey,
  points,
  zipCoverage,
  selectedLeadId,
  showCoverage,
  resetToken,
  onSelect,
  onZipSelect,
}: {
  apiKey: string;
  points: LeadMapPoint[];
  zipCoverage: LeadMapZipCoverage[];
  selectedLeadId: string | null;
  showCoverage: boolean;
  resetToken: number;
  onSelect: (leadId: string) => void;
  onZipSelect: (zip: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const mapsRef = useRef<GoogleMapsNamespace["maps"] | null>(null);
  const overlaysRef = useRef<GoogleOverlay[]>([]);
  const lastFitSignatureRef = useRef<string | null>(null);
  const [loadState, setLoadState] = useState<GoogleMapsLoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const selectedPoint = useMemo(() => points.find((point) => point.id === selectedLeadId) ?? null, [points, selectedLeadId]);
  const center = useMemo(() => getGoogleMapCenter(points, zipCoverage), [points, zipCoverage]);
  const fitSignature = useMemo(
    () => [
      resetToken,
      points.map((point) => `${point.id}:${point.lat.toFixed(5)}:${point.lng.toFixed(5)}`).join("|"),
      zipCoverage.map((zip) => `${zip.zip}:${zip.leadCount}:${zip.scrapeStatus}`).join("|"),
    ].join("::"),
    [points, resetToken, zipCoverage],
  );

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then((google) => {
        if (cancelled || !containerRef.current) return;
        mapsRef.current = google.maps;

        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(containerRef.current, {
            center,
            zoom: 10,
            clickableIcons: false,
            fullscreenControl: true,
            gestureHandling: "greedy",
            mapTypeControl: false,
            streetViewControl: false,
            zoomControl: true,
          });
        }

        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadState("error");
        setLoadError(error instanceof Error ? error.message : "Google Maps failed to load.");
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, center]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;
    if (loadState !== "ready" || !map || !maps) return;

    clearGoogleOverlays(overlaysRef.current, maps);
    const nextOverlays: GoogleOverlay[] = [];
    const bounds = new maps.LatLngBounds();
    let hasBounds = false;

    if (showCoverage) {
      for (const zip of zipCoverage) {
        const position = { lat: zip.lat, lng: zip.lng };
        bounds.extend(position);
        hasBounds = true;

        const circle = new maps.Circle({
          center: position,
          clickable: true,
          fillColor: googleZipFillColor(zip),
          fillOpacity: googleZipFillOpacity(zip),
          map,
          radius: googleZipRadius(zip),
          strokeColor: googleZipStrokeColor(zip),
          strokeOpacity: 0.75,
          strokeWeight: 1,
        });
        circle.addListener("click", () => onZipSelect(zip.zip));
        nextOverlays.push(circle);

        if (zip.leadCount > 0 || zip.scrapeStatus !== "not_started") {
          const label = new maps.Marker({
            icon: {
              path: maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: googleZipFillColor(zip),
              fillOpacity: 0.9,
              strokeColor: "#ffffff",
              strokeWeight: 2,
            },
            label: {
              text: zip.zip,
              color: zip.scrapeStatus === "complete" ? "#ffffff" : "#334155",
              fontSize: "10px",
              fontWeight: "700",
            },
            map,
            position,
            title: `${zip.zip} ${zip.city}: ${formatLabel(zip.scrapeStatus)}, ${zip.leadCount} mapped leads in this view`,
            zIndex: 20,
          });
          label.addListener("click", () => onZipSelect(zip.zip));
          nextOverlays.push(label);
        }
      }
    }

    points.forEach((point, index) => {
      const position = { lat: point.lat, lng: point.lng };
      const active = point.id === selectedLeadId;
      bounds.extend(position);
      hasBounds = true;

      const marker = new maps.Marker({
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: active ? 10 : 7,
          fillColor: active ? "#4f46e5" : markerColor(point),
          fillOpacity: 0.96,
          strokeColor: "#ffffff",
          strokeWeight: active ? 3 : 2,
        },
        label: index < 99
          ? { text: String(index + 1), color: "#ffffff", fontSize: "10px", fontWeight: "700" }
          : undefined,
        map,
        optimized: true,
        position,
        title: `${point.name ?? "Unknown business"} - ${formatLabel(point.website_status)}`,
        zIndex: active ? 1000 : 100 + index,
      });
      marker.addListener("click", () => onSelect(point.id));
      nextOverlays.push(marker);
    });

    overlaysRef.current = nextOverlays;

    if (hasBounds && lastFitSignatureRef.current !== fitSignature) {
      map.fitBounds(bounds, 48);
      lastFitSignatureRef.current = fitSignature;
    }

    return () => {
      clearGoogleOverlays(nextOverlays, maps);
    };
  }, [fitSignature, loadState, onSelect, onZipSelect, points, selectedLeadId, showCoverage, zipCoverage]);

  useEffect(() => {
    if (loadState !== "ready" || !selectedPoint) return;
    mapRef.current?.panTo({ lat: selectedPoint.lat, lng: selectedPoint.lng });
  }, [loadState, selectedPoint]);

  return (
    <div className="relative h-[32rem] overflow-hidden rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.58)" }}>
      <div ref={containerRef} className="absolute inset-0" />
      {loadState !== "ready" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/75 px-6 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          {loadState === "error" ? loadError ?? "Google Maps failed to load." : "Loading Google Maps..."}
        </div>
      )}
      <div className="absolute left-4 top-4 z-20 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.88)", color: "var(--text-secondary)" }}>
        {points.length} shown / {zipCoverage.length} ZIPs
      </div>
      <div className="absolute bottom-4 left-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.88)", color: "var(--text-secondary)" }}>
        <LegendDot color="#e2e8f0" label="Not started" />
        <LegendDot color="#f59e0b" label="Partial ZIP" />
        <LegendDot color="#0f766e" label="Covered ZIP" />
        <span className="mx-1 h-4 w-px bg-slate-300/70" />
        <LegendDot color="#dc2626" label="No site" />
        <LegendDot color="#ea580c" label="Broken" />
        <LegendDot color="#4f46e5" label="Weak/basic" />
      </div>
    </div>
  );
}

function MapSidePanel({
  points,
  selectedPoint,
  selectedLeadId,
  totalMapped,
  listLimit,
  currentUserId,
  scoreThresholds,
  busyLeadId,
  onSelect,
  onClaim,
}: {
  points: LeadMapPoint[];
  selectedPoint: LeadMapPoint | null;
  selectedLeadId: string | null;
  totalMapped: number;
  listLimit: number;
  currentUserId: string;
  scoreThresholds: ScoreBandThresholds;
  busyLeadId: string | null;
  onSelect: (leadId: string) => void;
  onClaim: (leadId: string) => void;
}) {
  return (
    <aside className="glass rounded-2xl p-5">
      <div>
        <h3 className="section-label">Selected business</h3>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Inspect the best mapped opportunities without loading the full card grid.
        </p>
      </div>

      <div className="mt-3">
        {selectedPoint ? (
          <MapPointCard
            point={selectedPoint}
            currentUserId={currentUserId}
            scoreThresholds={scoreThresholds}
            busy={busyLeadId === selectedPoint.id}
            onClaim={onClaim}
          />
        ) : (
          <EmptyState text="No mapped lead selected." />
        )}
      </div>

      <div className="mt-5 border-t pt-4" style={{ borderColor: "rgba(255,255,255,0.45)" }}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="section-label">Mapped list</h3>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {points.length} of {totalMapped}
          </span>
        </div>
        <div className="mt-3 max-h-[22rem] space-y-2 overflow-y-auto pr-1">
          {points.length === 0 ? (
            <EmptyState text="No stored coordinates for the current filters." />
          ) : points.map((point, index) => (
            <button
              key={point.id}
              type="button"
              className={`w-full rounded-xl border px-3 py-2 text-left transition ${point.id === selectedLeadId ? "bg-white/70" : "bg-white/35 hover:bg-white/55"}`}
              style={{ borderColor: point.id === selectedLeadId ? "rgba(79,70,229,0.32)" : "rgba(255,255,255,0.5)" }}
              onClick={() => onSelect(point.id)}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ background: markerColor(point) }}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {point.name ?? "Unknown business"}
                  </span>
                  <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {formatPlace(point.address)} &middot; {formatLabel(point.website_status)} &middot; {point.review_count ?? 0} reviews
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
        {totalMapped > listLimit && (
          <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
            Showing the first {listLimit} mapped leads in the side list. The map still shows up to the configured point limit.
          </p>
        )}
      </div>
    </aside>
  );
}

function MapPointCard({
  point,
  currentUserId,
  scoreThresholds,
  busy,
  onClaim,
}: {
  point: LeadMapPoint;
  currentUserId: string;
  scoreThresholds: ScoreBandThresholds;
  busy: boolean;
  onClaim: (leadId: string) => void;
}) {
  const owner = ownerLabel(point, currentUserId);
  return (
    <article className="rounded-xl border bg-white/45 p-4" style={{ borderColor: "rgba(255,255,255,0.55)" }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/leads/${point.id}`} className="link-accent block break-words font-semibold leading-snug">
            {point.name ?? "Unknown business"}
          </Link>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{point.address ?? "No address"}</p>
        </div>
        <ScoreBandBadge score={point.score} thresholds={scoreThresholds} compact />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge label={formatLabel(point.website_status)} style={websiteBadgeStyle(point.website_status)} />
        <Badge label={formatLabel(point.quality_bucket)} />
        <Badge label={formatLabel(point.ai_verification_status)} />
        <Badge label={point.rating ? `${point.rating.toFixed(1)} rating` : "No rating"} />
        <Badge label={`${point.review_count ?? 0} reviews`} />
        <Badge label={formatMoney(point.estimated_deal_value)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.45)" }}>
        <OwnerPill label={owner} mine={point.assigned_to_user_id === currentUserId} />
        <Link href={`/leads/${point.id}`} className="btn-glass ml-auto text-sm">Details</Link>
        {!point.assigned_to_user_id && (
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => onClaim(point.id)}>
            {busy ? "Claiming..." : "Claim"}
          </button>
        )}
      </div>
    </article>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function LeadCard({
  lead,
  currentUserId,
  scoreThresholds,
  busy,
  onClaim,
}: {
  lead: Lead;
  currentUserId: string;
  scoreThresholds: ScoreBandThresholds;
  busy: boolean;
  onClaim: (leadId: string) => void;
}) {
  const owner = ownerLabel(lead, currentUserId);
  return (
    <article className="glass rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/leads/${lead.id}`} className="link-accent block break-words font-semibold leading-snug">
            {lead.name ?? "Unknown business"}
          </Link>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{lead.address ?? "No address"}</p>
        </div>
        <ScoreBandBadge score={lead.score} thresholds={scoreThresholds} compact />
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
        {lead.next_best_action ?? lead.quality_reason ?? "Review, claim, and verify the opportunity before outreach."}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge label={formatLabel(lead.website_status)} style={websiteBadgeStyle(lead.website_status)} />
        <Badge label={formatLabel(lead.quality_bucket)} />
        <Badge label={formatLabel(lead.ai_verification_status)} />
        <Badge label={lead.rating ? `${lead.rating.toFixed(1)} rating` : "No rating"} />
        <Badge label={`${lead.review_count ?? 0} reviews`} />
        <Badge label={formatMoney(lead.estimated_deal_value)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.45)" }}>
        <OwnerPill label={owner} mine={lead.assigned_to_user_id === currentUserId} />
        <Link href={`/leads/${lead.id}`} className="btn-glass ml-auto text-sm">Details</Link>
        {!lead.assigned_to_user_id && (
          <button type="button" className="btn-primary text-sm" disabled={busy} onClick={() => onClaim(lead.id)}>
            {busy ? "Claiming..." : "Claim"}
          </button>
        )}
      </div>
    </article>
  );
}

function LeadTable({
  leads,
  currentUserId,
  scoreThresholds,
  busyLeadId,
  onClaim,
}: {
  leads: Lead[];
  currentUserId: string;
  scoreThresholds: ScoreBandThresholds;
  busyLeadId: string | null;
  onClaim: (leadId: string) => void;
}) {
  if (leads.length === 0) return <EmptyState text="No leads match the current filters." />;
  return (
    <section className="glass rounded-2xl p-5">
      <div className="overflow-x-auto">
        <table className="glass-table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Place</th>
              <th>Website</th>
              <th>Quality</th>
              <th>AI</th>
              <th>Reviews</th>
              <th>Score</th>
              <th>Owner</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <Link href={`/leads/${lead.id}`} className="link-accent font-medium">{lead.name ?? "Unknown"}</Link>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{getBusinessTypeLabel(lead.business_type)}</div>
                </td>
                <td>{formatPlace(lead.address)}</td>
                <td><span style={websiteBadgeStyle(lead.website_status)}>{formatLabel(lead.website_status)}</span></td>
                <td>{formatLabel(lead.quality_bucket)}</td>
                <td>{formatLabel(lead.ai_verification_status)}</td>
                <td>{lead.review_count ?? 0}</td>
                <td><ScoreBandBadge score={lead.score} thresholds={scoreThresholds} compact /></td>
                <td>{ownerLabel(lead, currentUserId)}</td>
                <td>
                  {!lead.assigned_to_user_id ? (
                    <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busyLeadId === lead.id} onClick={() => onClaim(lead.id)}>
                      {busyLeadId === lead.id ? "Claiming..." : "Claim"}
                    </button>
                  ) : (
                    <Link href={`/leads/${lead.id}`} className="btn-glass px-3 py-1.5 text-xs">Details</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SegmentButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`btn-glass text-sm ${active ? "nav-link-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Badge({ label, style }: { label: string; style?: React.CSSProperties }) {
  return (
    <span className="rounded-md px-2 py-1 text-xs font-medium" style={style ?? { background: "rgba(255,255,255,0.62)", color: "var(--text-secondary)" }}>
      {label}
    </span>
  );
}

function OwnerPill({ label, mine }: { label: string; mine: boolean }) {
  return (
    <span
      className="rounded-md px-2 py-1 text-xs font-medium"
      style={mine ? { background: "rgba(34,197,94,0.12)", color: "#166534" } : { background: "rgba(255,255,255,0.62)", color: "var(--text-secondary)" }}
    >
      {label}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl p-6 text-center text-sm" style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-tertiary)" }}>
      {text}
    </div>
  );
}

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps can only load in the browser."));
  if (window.google?.maps) return Promise.resolve(window.google);

  if (!googleMapsLoadPromise) {
    googleMapsLoadPromise = new Promise((resolve, reject) => {
      const callbackName = "__nositeGoogleMapsReady";
      const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
      const timeoutId = window.setTimeout(() => {
        googleMapsLoadPromise = null;
        reject(new Error("Google Maps timed out."));
      }, 15000);

      window.__nositeGoogleMapsReady = () => {
        window.clearTimeout(timeoutId);
        if (window.google?.maps) resolve(window.google);
        else {
          googleMapsLoadPromise = null;
          reject(new Error("Google Maps loaded without the maps namespace."));
        }
      };

      if (existingScript) return;

      const script = document.createElement("script");
      script.id = GOOGLE_MAPS_SCRIPT_ID;
      script.src = buildGoogleMapsScriptUrl(apiKey, callbackName);
      script.async = true;
      script.defer = true;
      script.referrerPolicy = "origin";
      const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
      if (nonce) script.nonce = nonce;
      script.onerror = () => {
        window.clearTimeout(timeoutId);
        googleMapsLoadPromise = null;
        reject(new Error("Google Maps failed to load."));
      };
      document.head.appendChild(script);
    });
  }

  return googleMapsLoadPromise;
}

function clearGoogleOverlays(overlays: GoogleOverlay[], maps: GoogleMapsNamespace["maps"]): void {
  for (const overlay of overlays) {
    maps.event.clearInstanceListeners(overlay);
    overlay.setMap(null);
  }
  overlays.length = 0;
}

function getGoogleMapCenter(points: LeadMapPoint[], zipCoverage: LeadMapZipCoverage[]): GoogleLatLngLiteral {
  const bounds = getBounds([...points, ...zipCoverage]);
  if (!bounds) return { lat: 39.7392, lng: -104.9903 };
  return {
    lat: (bounds.minLat + bounds.maxLat) / 2,
    lng: (bounds.minLng + bounds.maxLng) / 2,
  };
}

function googleZipFillColor(zip: LeadMapZipCoverage): string {
  if (zip.scrapeStatus === "complete") return "#0f766e";
  if (zip.scrapeStatus === "partial") return "#f59e0b";
  return "#e2e8f0";
}

function googleZipStrokeColor(zip: LeadMapZipCoverage): string {
  if (zip.scrapeStatus === "complete") return "#0f766e";
  if (zip.scrapeStatus === "partial") return "#b45309";
  return "#94a3b8";
}

function googleZipFillOpacity(zip: LeadMapZipCoverage): number {
  const leadWeight = clamp(Math.log10(zip.leadCount + 1) / 4, 0, 0.18);
  if (zip.scrapeStatus === "complete") return clamp(0.16 + zip.completionRatio * 0.16 + leadWeight, 0.16, 0.48);
  if (zip.scrapeStatus === "partial") return clamp(0.12 + zip.completionRatio * 0.16 + leadWeight, 0.12, 0.4);
  return 0.1;
}

function googleZipRadius(zip: LeadMapZipCoverage): number {
  return clamp(1300 + Math.log10(zip.leadCount + 1) * 900, 1300, 3600);
}

function normalizeView(value: string | undefined): ExplorerView {
  return value === "table" ? value : "cards";
}

interface ZipCoverageSummary {
  total: number;
  scraped: number;
  complete: number;
  partial: number;
  notStarted: number;
}

type LeadCoordinate = Pick<LeadMapPoint, "lat" | "lng">;
type LeadMarkerStatus = Pick<LeadMapPoint, "website_status" | "ai_website_viability_status" | "quality_bucket">;
type LeadOwner = Pick<LeadMapPoint, "assigned_to_user_id" | "assigned_user_display_name" | "assigned_user_email">;

function getBounds(points: LeadCoordinate[]) {
  if (points.length === 0) return null;
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  const minLng = Math.min(...points.map((point) => point.lng));
  const maxLng = Math.max(...points.map((point) => point.lng));
  return {
    minLat: minLat === maxLat ? minLat - 0.01 : minLat,
    maxLat: minLat === maxLat ? maxLat + 0.01 : maxLat,
    minLng: minLng === maxLng ? minLng - 0.01 : minLng,
    maxLng: minLng === maxLng ? maxLng + 0.01 : maxLng,
  };
}

function summarizeZipCoverage(zipCoverage: LeadMapZipCoverage[]): ZipCoverageSummary {
  const complete = zipCoverage.filter((zip) => zip.scrapeStatus === "complete").length;
  const partial = zipCoverage.filter((zip) => zip.scrapeStatus === "partial").length;
  const notStarted = zipCoverage.filter((zip) => zip.scrapeStatus === "not_started").length;
  return {
    total: zipCoverage.length,
    scraped: complete + partial,
    complete,
    partial,
    notStarted,
  };
}

function mergeZipCoverageWithMapPoints(zipCoverage: LeadMapZipCoverage[], mapPoints: LeadMapPoint[]): LeadMapZipCoverage[] {
  const countByZip = new Map<string, number>();
  for (const point of mapPoints) {
    const zip = extractZip(point.address);
    if (!zip) continue;
    countByZip.set(zip, (countByZip.get(zip) ?? 0) + 1);
  }

  return zipCoverage.map((zip) => {
    const leadCount = countByZip.get(zip.zip) ?? 0;
    if (leadCount === 0) return zip;
    return {
      ...zip,
      leadCount,
      discoveredCount: leadCount,
      totalUnits: 1,
      doneUnits: 1,
      failedUnits: 0,
      remainingUnits: 0,
      completionRatio: 1,
      scrapeStatus: "complete",
    };
  });
}

function extractZip(address: string | null | undefined): string | null {
  const match = address?.match(/\b(8\d{4})\b/);
  return match?.[1] ?? null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function markerColor(lead: LeadMarkerStatus): string {
  if (lead.website_status === "none") return "#dc2626";
  if (lead.ai_website_viability_status === "broken" || lead.quality_bucket === "broken_site_opportunity") return "#ea580c";
  if (lead.website_status === "social") return "#d97706";
  if (lead.website_status === "basic") return "#4f46e5";
  return "#16a34a";
}

function ownerLabel(lead: LeadOwner, currentUserId: string): string {
  if (!lead.assigned_to_user_id) return "Unclaimed";
  if (lead.assigned_to_user_id === currentUserId) return "Mine";
  return lead.assigned_user_display_name || lead.assigned_user_email || "Taken";
}

function websiteBadgeStyle(status: string): React.CSSProperties {
  const colors: Record<string, React.CSSProperties> = {
    none: { background: "rgba(239,68,68,0.1)", color: "#991b1b" },
    social: { background: "rgba(245,158,11,0.1)", color: "#92400e" },
    basic: { background: "rgba(99,102,241,0.1)", color: "#4338ca" },
    custom: { background: "rgba(34,197,94,0.1)", color: "#166534" },
  };
  return { ...(colors[status] ?? { background: "rgba(0,0,0,0.05)", color: "var(--text-secondary)" }), padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 500 };
}

function formatLabel(value: string | null | undefined): string {
  return value ? value.replace(/_/g, " ") : "Unknown";
}

function formatMoney(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!amount) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatPlace(address: string | null): string {
  if (!address) return "No address";
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join(", ");
  return address;
}
