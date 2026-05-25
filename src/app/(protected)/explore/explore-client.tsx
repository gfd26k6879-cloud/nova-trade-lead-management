"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HelpTip } from "@/components/help-tip";
import { PageShell } from "@/components/page-shell";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { claimLeadAction } from "@/lib/leads/actions";
import { getBusinessTypeLabel } from "@/lib/business-types";
import type { Lead, LeadMapPoint, LeadMapZipCoverage } from "@/lib/db/queries";
import type { AppRole } from "@/lib/permissions";
import type { ScoreBandThresholds } from "@/lib/score-bands";

type ExplorerView = "map" | "cards" | "table";

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
    geo?: string;
  };
  scoreThresholds: ScoreBandThresholds;
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
  currentUser: { userId: string; email: string; role: AppRole };
}

const WEBSITE_OPTIONS = ["", "none", "social", "basic", "custom"];
const STATUS_OPTIONS = ["", "new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost"];
const QUALITY_OPTIONS = ["", "ready_to_call", "broken_site_opportunity", "needs_ai_verify", "needs_manual_review", "not_a_fit"];
const AI_OPTIONS = ["", "not_checked", "no_site_found", "weak_site_found", "site_found", "uncertain", "mismatch"];
const SORT_OPTIONS = [
  { value: "opportunity", label: "Best opportunity" },
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
  const selectedMapPoint = mapPoints.find((lead) => lead.id === selectedLeadId) ?? mapPoints[0] ?? null;
  const zipCoverageWithLeadCounts = useMemo(() => mergeZipCoverageWithMapPoints(zipCoverage, mapPoints), [zipCoverage, mapPoints]);
  const visibleMapList = useMemo(() => mapPoints.slice(0, MAP_LIST_LIMIT), [mapPoints]);
  const zipCoverageSummary = useMemo(() => summarizeZipCoverage(zipCoverageWithLeadCounts), [zipCoverageWithLeadCounts]);
  const pageUnclaimed = leads.filter((lead) => !lead.assigned_to_user_id).length;
  const pageMapped = leads.filter((lead) => typeof lead.lat === "number" && typeof lead.lng === "number").length;
  const stats = view === "map"
    ? [
        { label: "Matching Leads", value: String(total) },
        { label: "Shown On Map", value: String(mapPoints.length), hint: "No external map calls" },
        { label: "Covered ZIPs", value: `${zipCoverageSummary.scraped} / ${zipCoverageSummary.total}`, hint: "Dark ZIPs have mapped leads" },
        { label: "Light ZIPs", value: String(zipCoverageSummary.notStarted), hint: "No mapped lead in this view" },
      ]
    : [
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

  const applyMapQuadrant = (quadrant: "nw" | "ne" | "sw" | "se") => {
    const bounds = getBounds([...mapPoints, ...zipCoverageWithLeadCounts]);
    if (!bounds) return;
    const midLat = (bounds.minLat + bounds.maxLat) / 2;
    const midLng = (bounds.minLng + bounds.maxLng) / 2;
    pushFilters({
      geo: null,
      minLat: quadrant.includes("n") ? midLat : bounds.minLat,
      maxLat: quadrant.includes("n") ? bounds.maxLat : midLat,
      minLng: quadrant.includes("w") ? bounds.minLng : midLng,
      maxLng: quadrant.includes("w") ? midLng : bounds.maxLng,
    });
  };

  const selectMapZip = (nextZip: string) => {
    setZip(nextZip);
    pushFilters({ zip: nextZip });
  };

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
              <SegmentButton active={view === "map"} onClick={() => pushFilters({ view: "map" })}>Map</SegmentButton>
              <SegmentButton active={view === "cards"} onClick={() => pushFilters({ view: "cards" })}>Cards</SegmentButton>
              <SegmentButton active={view === "table"} onClick={() => pushFilters({ view: "table" })}>Table</SegmentButton>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="section-label">Business type</span>
              <select className="glass-select" value={filters.businessType ?? ""} onChange={(event) => pushFilters({ businessType: event.target.value })}>
                <option value="">All business types</option>
                {businessTypeCounts.map((type) => (
                  <option key={type.id} value={type.id}>{type.label} ({type.active})</option>
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
            <span className="section-label">Map area</span>
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
              Clear map
            </button>
            <Link href="/explore" className="btn-glass text-xs">Reset all</Link>
            <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Opportunity sort <HelpTip>No-site and broken-site businesses rank ahead of weak/basic website leads, then quality and sales priority break ties.</HelpTip>
            </span>
          </div>
        </div>
      </section>

      {view === "map" ? (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.7fr)]">
          <LeadMap
            points={mapPoints}
            zipCoverage={zipCoverageWithLeadCounts}
            total={total}
            totalMapped={totalMapped}
            mapPointLimit={mapPointLimit}
            selectedLeadId={selectedMapPoint?.id ?? null}
            onSelect={setSelectedLeadId}
            onQuadrant={applyMapQuadrant}
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
      ) : view === "table" ? (
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

      {view !== "map" && totalPages > 1 && (
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
  onSelect,
  onQuadrant,
  onZipSelect,
}: {
  points: LeadMapPoint[];
  zipCoverage: LeadMapZipCoverage[];
  total: number;
  totalMapped: number;
  mapPointLimit: number;
  selectedLeadId: string | null;
  onSelect: (leadId: string) => void;
  onQuadrant: (quadrant: "nw" | "ne" | "sw" | "se") => void;
  onZipSelect: (zip: string) => void;
}) {
  const [viewport, setViewport] = useState<MapViewport>(DEFAULT_MAP_VIEWPORT);
  const [showCoverage, setShowCoverage] = useState(true);
  const dragRef = useRef<MapDragState | null>(null);
  const bounds = getBounds([...points, ...zipCoverage]);
  const hasMore = totalMapped > points.length;
  const missingCoordinates = Math.max(0, total - totalMapped);
  const markers = bounds ? getMapMarkers(points, bounds, selectedLeadId) : [];
  const zipTiles = bounds ? zipCoverage.map((zip) => ({ zip, ...projectLead(zip, bounds) })) : [];
  const coverageSummary = summarizeZipCoverage(zipCoverage);

  const zoomBy = (factor: number) => {
    setViewport((current) => normalizeMapViewport({ ...current, scale: clamp(current.scale * factor, 1, 4) }));
  };

  const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = normalizeMapViewport({
      scale: viewport.scale,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
    setViewport(next);
  };

  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released by the browser.
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.12 : 0.88);
  };

  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="section-label">Map view</h3>
            <HelpTip>Uses stored lead latitude and longitude from the database only. It does not call Google Maps, Mapbox, Places, geocoding, or paid tile APIs.</HelpTip>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Drag to move, scroll to zoom, click a ZIP tile to filter, or click a lead marker to inspect it.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={`btn-glass px-3 py-1.5 text-xs ${showCoverage ? "nav-link-active" : ""}`} onClick={() => setShowCoverage((value) => !value)}>
            ZIP coverage
          </button>
          <button type="button" className="btn-glass px-3 py-1.5 text-xs" onClick={() => setViewport(DEFAULT_MAP_VIEWPORT)}>
            Reset view
          </button>
          <div className="grid grid-cols-2 gap-1">
            <button type="button" className="btn-glass px-2 py-1 text-xs" disabled={!bounds} onClick={() => onQuadrant("nw")}>NW</button>
            <button type="button" className="btn-glass px-2 py-1 text-xs" disabled={!bounds} onClick={() => onQuadrant("ne")}>NE</button>
            <button type="button" className="btn-glass px-2 py-1 text-xs" disabled={!bounds} onClick={() => onQuadrant("sw")}>SW</button>
            <button type="button" className="btn-glass px-2 py-1 text-xs" disabled={!bounds} onClick={() => onQuadrant("se")}>SE</button>
          </div>
        </div>
      </div>

      <div
        className="relative h-[32rem] overflow-hidden rounded-xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(219,234,254,0.95), rgba(240,253,250,0.9)), radial-gradient(circle at 12% 18%, rgba(15,118,110,0.16), transparent 30%), radial-gradient(circle at 88% 82%, rgba(59,130,246,0.12), transparent 32%)",
          border: "1px solid rgba(255,255,255,0.58)",
          touchAction: "none",
          cursor: viewport.scale > 1 ? "grab" : "default",
        }}
        onPointerDown={beginPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onWheel={handleWheel}
      >
        <div className="absolute left-4 top-4 z-10 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.82)", color: "var(--text-secondary)" }}>
          {points.length} shown / {totalMapped} mapped
        </div>
        {hasMore && (
          <div className="absolute right-4 top-4 z-10 max-w-64 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.82)", color: "var(--text-secondary)" }}>
            Showing top {mapPointLimit} by current sort. Narrow filters to inspect more.
          </div>
        )}
        <div className="absolute right-4 top-20 z-20 flex flex-col gap-1">
          <button type="button" className="btn-glass h-8 w-8 px-0 text-base" onClick={() => zoomBy(1.18)} aria-label="Zoom in">+</button>
          <button type="button" className="btn-glass h-8 w-8 px-0 text-base" onClick={() => zoomBy(0.84)} aria-label="Zoom out">-</button>
        </div>
        {!bounds ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            {total > 0
              ? `${missingCoordinates} matching leads do not have stored coordinates. Use list/table filters or add coordinates during data enrichment.`
              : "No leads match the current filters."}
          </div>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.scale})`,
              transformOrigin: "50% 50%",
            }}
          >
            <MapBaseLayer bounds={bounds} zipCoverage={zipCoverage} />
            {showCoverage && zipTiles.map(({ zip, x, y }) => (
              <button
                key={zip.zip}
                type="button"
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-xl border text-[10px] font-semibold leading-tight shadow-sm transition hover:shadow-md"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: 46,
                  height: 34,
                  ...zipCoverageStyle(zip),
                }}
                title={`${zip.zip} ${zip.city}: ${zip.scrapeStatus.replace(/_/g, " ")}, ${zip.leadCount} mapped leads in this view`}
                aria-label={`Filter to ZIP ${zip.zip}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onZipSelect(zip.zip)}
              >
                <span>{zip.zip}</span>
                <span className="text-[9px] font-medium">{zip.leadCount}</span>
              </button>
            ))}
            {markers.map((marker) => {
              const markerSize = marker.active ? 30 : marker.count > 1 ? clamp(18 + Math.log2(marker.count) * 4, 20, 38) : 18;
              return (
                <button
                  key={marker.id}
                  type="button"
                  className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-semibold leading-none transition"
                  style={{
                    left: `${marker.x}%`,
                    top: `${marker.y}%`,
                    width: markerSize,
                    height: markerSize,
                    color: "#fff",
                    background: marker.active ? "#4f46e5" : marker.color,
                    border: "2px solid rgba(255,255,255,0.92)",
                    boxShadow: marker.active ? "0 0 0 7px rgba(79,70,229,0.16), 0 8px 22px rgba(15,23,42,0.24)" : "0 5px 14px rgba(15,23,42,0.18)",
                  }}
                  title={marker.count > 1 ? `${marker.count} leads near ${formatPlace(marker.lead.address)}` : `${marker.lead.name ?? "Unknown business"} - ${formatLabel(marker.lead.website_status)}`}
                  aria-label={marker.count > 1 ? `Select cluster with ${marker.count} leads` : `Select ${marker.lead.name ?? "lead"}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onSelect(marker.lead.id)}
                >
                  {marker.label}
                </button>
              );
            })}
          </div>
        )}
        <div className="absolute bottom-4 left-4 z-10 flex max-w-[calc(100%-2rem)] flex-wrap gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.84)", color: "var(--text-secondary)" }}>
          <LegendDot color="#f8fafc" label={`Not started ${coverageSummary.notStarted}`} />
          <LegendDot color="#f59e0b" label={`Partial ${coverageSummary.partial}`} />
          <LegendDot color="#0f766e" label={`Covered ${coverageSummary.complete}`} />
          <span className="mx-1 h-4 w-px bg-slate-300/70" />
          <LegendDot color="#dc2626" label="No site" />
          <LegendDot color="#ea580c" label="Broken" />
          <LegendDot color="#d97706" label="Social" />
          <LegendDot color="#4f46e5" label="Basic" />
          <LegendDot color="#16a34a" label="Custom" />
        </div>
      </div>
    </div>
  );
}

function MapBaseLayer({ bounds, zipCoverage }: { bounds: LeadMapBounds; zipCoverage: LeadMapZipCoverage[] }) {
  const cityLabels = getCityLabels(zipCoverage, bounds);
  return (
    <>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id="map-grid" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M 8 0 L 0 0 0 8" fill="none" stroke="rgba(15,23,42,0.08)" strokeWidth="0.2" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#map-grid)" />
        <path d="M 6 28 C 20 31 34 28 48 31 S 78 31 96 35" fill="none" stroke="rgba(30,64,175,0.18)" strokeWidth="1.2" />
        <path d="M 53 4 C 47 19 50 33 49 48 S 54 76 50 96" fill="none" stroke="rgba(30,64,175,0.22)" strokeWidth="1.4" />
        <path d="M 15 74 C 29 66 40 64 51 67 S 78 74 92 70" fill="none" stroke="rgba(15,118,110,0.16)" strokeWidth="1" />
        <path d="M 10 10 C 17 32 13 58 22 92" fill="none" stroke="rgba(71,85,105,0.14)" strokeWidth="5" />
        <text x="56" y="30" fill="rgba(30,64,175,0.48)" fontSize="2.7" fontWeight="700">I-70</text>
        <text x="51" y="54" fill="rgba(30,64,175,0.48)" fontSize="2.7" fontWeight="700">I-25</text>
        <text x="10" y="16" fill="rgba(71,85,105,0.36)" fontSize="3" fontWeight="700">Front Range</text>
      </svg>
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-400/35" />
      <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-slate-400/35" />
      <span className="absolute left-1/2 top-3 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(15,23,42,0.45)" }}>North</span>
      <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(15,23,42,0.45)" }}>South</span>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(15,23,42,0.45)" }}>West</span>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(15,23,42,0.45)" }}>East</span>
      {cityLabels.map((label) => (
        <span
          key={label.city}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]"
          style={{
            left: `${label.x}%`,
            top: `${label.y}%`,
            background: "rgba(255,255,255,0.5)",
            color: "rgba(15,23,42,0.46)",
          }}
        >
          {label.city}
        </span>
      ))}
    </>
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
        <Link href={`/leads/${point.id}`} className="btn-glass ml-auto text-sm">Open</Link>
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
        <Link href={`/leads/${lead.id}`} className="btn-glass ml-auto text-sm">Open</Link>
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
                    <Link href={`/leads/${lead.id}`} className="btn-glass px-3 py-1.5 text-xs">Open</Link>
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

function normalizeView(value: string | undefined): ExplorerView {
  return value === "cards" || value === "table" || value === "map" ? value : "map";
}

const DEFAULT_MAP_VIEWPORT: MapViewport = { scale: 1, x: 0, y: 0 };

interface MapViewport {
  scale: number;
  x: number;
  y: number;
}

interface MapDragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

interface ZipCoverageSummary {
  total: number;
  scraped: number;
  complete: number;
  partial: number;
  notStarted: number;
}

interface CityLabel {
  city: string;
  x: number;
  y: number;
}

type LeadCoordinate = Pick<LeadMapPoint, "lat" | "lng">;
type LeadMarkerStatus = Pick<LeadMapPoint, "website_status" | "ai_website_viability_status" | "quality_bucket">;
type LeadOwner = Pick<LeadMapPoint, "assigned_to_user_id" | "assigned_user_display_name" | "assigned_user_email">;
type LeadMapBounds = NonNullable<ReturnType<typeof getBounds>>;

interface LeadMapMarker {
  id: string;
  lead: LeadMapPoint;
  x: number;
  y: number;
  count: number;
  label: string;
  active: boolean;
  color: string;
}

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

function normalizeMapViewport(viewport: MapViewport): MapViewport {
  const scale = clamp(viewport.scale, 1, 4);
  if (scale === 1) return DEFAULT_MAP_VIEWPORT;
  const maxOffset = (scale - 1) * 180;
  return {
    scale,
    x: clamp(viewport.x, -maxOffset, maxOffset),
    y: clamp(viewport.y, -maxOffset, maxOffset),
  };
}

function zipCoverageStyle(zip: LeadMapZipCoverage): React.CSSProperties {
  const leadWeight = clamp(Math.log10(zip.leadCount + 1) / 3, 0, 0.22);
  if (zip.scrapeStatus === "complete") {
    const alpha = clamp(0.5 + leadWeight + zip.completionRatio * 0.18, 0.5, 0.86);
    return {
      background: `rgba(15,118,110,${alpha})`,
      borderColor: "rgba(15,118,110,0.72)",
      color: "#ffffff",
    };
  }
  if (zip.scrapeStatus === "partial") {
    const alpha = clamp(0.28 + zip.completionRatio * 0.32 + leadWeight, 0.28, 0.7);
    return {
      background: `rgba(245,158,11,${alpha})`,
      borderColor: "rgba(180,83,9,0.46)",
      color: "#713f12",
    };
  }
  return {
    background: "rgba(248,250,252,0.74)",
    borderColor: "rgba(148,163,184,0.42)",
    color: "#475569",
  };
}

function getCityLabels(zipCoverage: LeadMapZipCoverage[], bounds: LeadMapBounds): CityLabel[] {
  const cities = new Map<string, { city: string; latTotal: number; lngTotal: number; count: number; leadCount: number }>();
  for (const zip of zipCoverage) {
    const city = zip.city.trim();
    if (!city) continue;
    const existing = cities.get(city) ?? { city, latTotal: 0, lngTotal: 0, count: 0, leadCount: 0 };
    existing.latTotal += zip.lat;
    existing.lngTotal += zip.lng;
    existing.count += 1;
    existing.leadCount += zip.leadCount;
    cities.set(city, existing);
  }

  return Array.from(cities.values())
    .sort((a, b) => b.leadCount - a.leadCount || b.count - a.count || a.city.localeCompare(b.city))
    .slice(0, 10)
    .map((city) => {
      const point = projectLead({ lat: city.latTotal / city.count, lng: city.lngTotal / city.count }, bounds);
      return { city: city.city, ...point };
    });
}

function getMapMarkers(points: LeadMapPoint[], bounds: LeadMapBounds, selectedLeadId: string | null): LeadMapMarker[] {
  const projected = points.map((lead, index) => ({
    lead,
    index,
    ...projectLead(lead, bounds),
  }));

  if (projected.length <= 220) {
    return projected.map(({ lead, x, y, index }) => ({
      id: lead.id,
      lead,
      x,
      y,
      count: 1,
      label: index < 99 ? String(index + 1) : "",
      active: lead.id === selectedLeadId,
      color: markerColor(lead),
    }));
  }

  const cellSize = projected.length > 500 ? 4.5 : 4;
  const buckets = new Map<string, {
    leads: LeadMapPoint[];
    xTotal: number;
    yTotal: number;
    bestLead: LeadMapPoint;
    bestPriority: number;
    active: boolean;
  }>();

  for (const point of projected) {
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const priority = markerPriority(point.lead);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        leads: [point.lead],
        xTotal: point.x,
        yTotal: point.y,
        bestLead: point.lead,
        bestPriority: priority,
        active: point.lead.id === selectedLeadId,
      });
      continue;
    }

    existing.leads.push(point.lead);
    existing.xTotal += point.x;
    existing.yTotal += point.y;
    existing.active = existing.active || point.lead.id === selectedLeadId;
    if (point.lead.id === selectedLeadId || priority > existing.bestPriority || (priority === existing.bestPriority && point.lead.score > existing.bestLead.score)) {
      existing.bestLead = point.lead;
      existing.bestPriority = priority;
    }
  }

  return Array.from(buckets.entries()).map(([key, bucket]) => {
    const count = bucket.leads.length;
    const lead = bucket.active && selectedLeadId
      ? bucket.leads.find((item) => item.id === selectedLeadId) ?? bucket.bestLead
      : bucket.bestLead;
    return {
      id: key,
      lead,
      x: bucket.xTotal / count,
      y: bucket.yTotal / count,
      count,
      label: count > 1 ? String(count) : "",
      active: bucket.active,
      color: clusterColor(bucket.leads),
    };
  });
}

function projectLead(lead: LeadCoordinate, bounds: LeadMapBounds) {
  const lat = lead.lat;
  const lng = lead.lng;
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 88 + 6;
  const y = 94 - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 88;
  return { x: clamp(x, 4, 96), y: clamp(y, 4, 96) };
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

function markerPriority(lead: LeadMarkerStatus): number {
  if (lead.website_status === "none") return 5;
  if (lead.ai_website_viability_status === "broken" || lead.quality_bucket === "broken_site_opportunity") return 4;
  if (lead.website_status === "social") return 3;
  if (lead.website_status === "basic") return 2;
  return 1;
}

function clusterColor(leads: LeadMarkerStatus[]): string {
  return markerColor(leads.reduce((best, lead) => markerPriority(lead) > markerPriority(best) ? lead : best, leads[0]));
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
