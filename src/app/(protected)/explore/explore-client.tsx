"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HelpTip } from "@/components/help-tip";
import { PageShell } from "@/components/page-shell";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { claimLeadAction } from "@/lib/leads/actions";
import { getBusinessTypeLabel } from "@/lib/business-types";
import type { Lead } from "@/lib/db/queries";
import type { AppRole } from "@/lib/permissions";
import type { ScoreBandThresholds } from "@/lib/score-bands";

type ExplorerView = "map" | "cards" | "table";

interface Props {
  leads: Lead[];
  total: number;
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

export function ExploreClient({ leads, total, filters, scoreThresholds, businessTypeCounts, currentUser }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search ?? "");
  const [city, setCity] = useState(filters.city ?? "");
  const [zip, setZip] = useState(filters.zip ?? "");
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(leads[0]?.id ?? null);

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 60;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const view = normalizeView(filters.view);
  const mappedLeads = useMemo(() => leads.filter((lead) => typeof lead.lat === "number" && typeof lead.lng === "number"), [leads]);
  const selectedLead = leads.find((lead) => lead.id === selectedLeadId) ?? leads[0] ?? null;

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
    const bounds = getBounds(mappedLeads);
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

  return (
    <PageShell
      title="Lead Explorer"
      description="Browse the full lead inventory, narrow by location and quality, then claim the business you want to work."
      stats={[
        { label: "Matching Leads", value: String(total) },
        { label: "Unclaimed Here", value: String(leads.filter((lead) => !lead.assigned_to_user_id).length), hint: "On this page" },
        { label: "Mapped Here", value: String(mappedLeads.length), hint: "Current page" },
        { label: "Page", value: `${page} / ${totalPages}` },
      ]}
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

      {view === "map" && (
        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.7fr)]">
          <LeadMap leads={mappedLeads} selectedLeadId={selectedLead?.id ?? null} onSelect={setSelectedLeadId} onQuadrant={applyMapQuadrant} />
          <div className="glass rounded-2xl p-5">
            <h3 className="section-label">Selected business</h3>
            {selectedLead ? (
              <div className="mt-3">
                <LeadCard
                  lead={selectedLead}
                  currentUserId={currentUser.userId}
                  scoreThresholds={scoreThresholds}
                  busy={busyLeadId === selectedLead.id}
                  onClaim={claimLead}
                />
              </div>
            ) : (
              <EmptyState text="No lead selected." />
            )}
          </div>
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
  leads,
  selectedLeadId,
  onSelect,
  onQuadrant,
}: {
  leads: Lead[];
  selectedLeadId: string | null;
  onSelect: (leadId: string) => void;
  onQuadrant: (quadrant: "nw" | "ne" | "sw" | "se") => void;
}) {
  const bounds = getBounds(leads);
  return (
    <div className="glass rounded-2xl p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-label">Map view</h3>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            Click a marker to inspect a lead. Use quadrants to narrow this result set by location.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button type="button" className="btn-glass px-2 py-1 text-xs" disabled={!bounds} onClick={() => onQuadrant("nw")}>NW</button>
          <button type="button" className="btn-glass px-2 py-1 text-xs" disabled={!bounds} onClick={() => onQuadrant("ne")}>NE</button>
          <button type="button" className="btn-glass px-2 py-1 text-xs" disabled={!bounds} onClick={() => onQuadrant("sw")}>SW</button>
          <button type="button" className="btn-glass px-2 py-1 text-xs" disabled={!bounds} onClick={() => onQuadrant("se")}>SE</button>
        </div>
      </div>

      <div
        className="relative h-[28rem] overflow-hidden rounded-xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(219,234,254,0.92), rgba(240,253,250,0.82)), repeating-linear-gradient(0deg, rgba(15,23,42,0.06) 0, rgba(15,23,42,0.06) 1px, transparent 1px, transparent 44px), repeating-linear-gradient(90deg, rgba(15,23,42,0.06) 0, rgba(15,23,42,0.06) 1px, transparent 1px, transparent 44px)",
          border: "1px solid rgba(255,255,255,0.58)",
        }}
      >
        <div className="absolute left-4 top-4 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(255,255,255,0.78)", color: "var(--text-secondary)" }}>
          {leads.length} mapped leads
        </div>
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-slate-400/35" />
        <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-slate-400/35" />
        {!bounds ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            No coordinates on this page. Try clearing filters or selecting a different page.
          </div>
        ) : leads.map((lead) => {
          const point = projectLead(lead, bounds);
          const active = lead.id === selectedLeadId;
          return (
            <button
              key={lead.id}
              type="button"
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full transition"
              style={{
                left: `${point.x}%`,
                top: `${point.y}%`,
                background: active ? "#4f46e5" : markerColor(lead),
                border: "2px solid rgba(255,255,255,0.92)",
                boxShadow: active ? "0 0 0 7px rgba(79,70,229,0.16), 0 8px 22px rgba(15,23,42,0.24)" : "0 5px 14px rgba(15,23,42,0.18)",
              }}
              title={`${lead.name ?? "Unknown business"} - ${formatLabel(lead.website_status)}`}
              aria-label={`Select ${lead.name ?? "lead"}`}
              onClick={() => onSelect(lead.id)}
            />
          );
        })}
      </div>
    </div>
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

function getBounds(leads: Lead[]) {
  const points = leads.flatMap((lead) => typeof lead.lat === "number" && typeof lead.lng === "number" ? [{ lat: lead.lat, lng: lead.lng }] : []);
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

function projectLead(lead: Lead, bounds: NonNullable<ReturnType<typeof getBounds>>) {
  const lat = typeof lead.lat === "number" ? lead.lat : bounds.minLat;
  const lng = typeof lead.lng === "number" ? lead.lng : bounds.minLng;
  const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 88 + 6;
  const y = 94 - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 88;
  return { x: clamp(x, 4, 96), y: clamp(y, 4, 96) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function markerColor(lead: Lead): string {
  if (lead.website_status === "none") return "#dc2626";
  if (lead.ai_website_viability_status === "broken" || lead.quality_bucket === "broken_site_opportunity") return "#ea580c";
  if (lead.website_status === "social") return "#d97706";
  if (lead.website_status === "basic") return "#4f46e5";
  return "#16a34a";
}

function ownerLabel(lead: Lead, currentUserId: string): string {
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
