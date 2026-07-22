"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AiVerificationBadge } from "@/components/ai-verification-badge";
import { HelpTip } from "@/components/help-tip";
import { PageShell } from "@/components/page-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusNotice, type Notice } from "@/components/status-notice";
import { getAiVerificationDisplay } from "@/lib/ai-verification-display";
import {
  addLeadNoteAction,
  logOutreachEventAction,
  markLeadQualityBucketAction,
  queueQualityAiVerificationBatchAction,
  queueQualityEnrichmentBatchAction,
  runQualityAiVerificationBatchAction,
  updateLeadPhoneVerificationStatusAction,
} from "@/lib/leads/actions";
import { getBusinessTypeLabel } from "@/lib/business-types";
import type { LocationCell, LocationMarket, QualityFilters, QualityLead, QualitySummary } from "@/lib/db/queries";
import { getStatusToneStyle, type StatusTone } from "@/lib/status-tone";

const BUCKET_OPTIONS = [
  { value: "", label: "All quality buckets" },
  { value: "ready_to_call", label: "Ready to Call" },
  { value: "broken_site_opportunity", label: "Broken Site Opportunity" },
  { value: "needs_ai_verify", label: "Needs AI verification" },
  { value: "needs_manual_review", label: "Needs Manual Review" },
];

const OFFER_OPTIONS = [
  { value: "", label: "All offers" },
  { value: "starter_site", label: "Starter Site" },
  { value: "local_service_site", label: "Local Service Site" },
  { value: "broken_site_rescue", label: "Broken Site Rescue" },
  { value: "booking_ready_site", label: "Booking Ready Site" },
];

const PHONE_OPTIONS = [
  { value: "", label: "All phone states" },
  { value: "unknown", label: "Phone Unknown" },
  { value: "works", label: "Phone Works" },
  { value: "bad", label: "Phone Bad" },
  { value: "no_phone", label: "No Phone" },
];

const AI_OPTIONS = [
  { value: "", label: "All AI outcomes" },
  { value: "not_checked", label: "No AI result yet" },
  { value: "no_site_found", label: "No usable site found" },
  { value: "weak_site_found", label: "Weak site found" },
  { value: "uncertain", label: "Needs human review" },
  { value: "mismatch", label: "Wrong business match" },
];

const ENRICHMENT_OPTIONS = [
  { value: "", label: "All enrichment" },
  { value: "pending", label: "Needs enrichment" },
  { value: "enriched", label: "Enriched" },
  { value: "skipped", label: "Skipped" },
];

const COUNTRY_OPTIONS = [
  { value: "", label: "All countries" },
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
];

interface Props {
  summary: QualitySummary;
  leads: QualityLead[];
  total: number;
  filters: QualityFilters;
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
  locationMarkets: LocationMarket[];
  locationCells: LocationCell[];
}

export function QualityClient({ summary, leads, total, filters, businessTypeCounts, locationMarkets, locationCells }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search ?? "");
  const [city, setCity] = useState(filters.city ?? "");
  const [zip, setZip] = useState(filters.zip ?? "");
  const [batchLimit, setBatchLimit] = useState("25");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [pendingPaidBatch, setPendingPaidBatch] = useState<{
    name: string;
    input: Parameters<typeof runQualityAiVerificationBatchAction>[0];
    count: number;
  } | null>(null);

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const visibleMarkets = useMemo(() => {
    return locationMarkets.filter((market) => !filters.countryCode || market.country_code === filters.countryCode);
  }, [filters.countryCode, locationMarkets]);
  const selectedMarket = useMemo(() => locationMarkets.find((market) => market.id === filters.marketId) ?? null, [filters.marketId, locationMarkets]);
  const activeCells = useMemo(() => locationCells.filter((cell) => cell.is_active === 1), [locationCells]);
  const currentScope = useMemo(() => {
    if (filters.locationCellId) {
      const cell = locationCells.find((item) => item.id === filters.locationCellId);
      return cell?.cell_label ?? filters.locationCellId;
    }
    if (selectedMarket) return marketLabel(selectedMarket);
    if (filters.city || filters.zip) return [filters.city, filters.zip].filter(Boolean).join(" ");
    if (filters.countryCode) return countryLabel(filters.countryCode);
    if (filters.denverOnly) return "Denver / Colorado";
    return "All markets";
  }, [filters.city, filters.countryCode, filters.denverOnly, filters.locationCellId, filters.zip, locationCells, selectedMarket]);
  const activeFilterChips = useMemo(() => qualityFilterChips(filters, selectedMarket, locationCells), [filters, locationCells, selectedMarket]);

  const updateFilters = useCallback((updates: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    let onlyPage = true;
    for (const [key, value] of Object.entries(updates)) {
      if (value) params.set(key, value);
      else params.delete(key);
      if (key !== "page") onlyPage = false;
    }
    if (!onlyPage) params.delete("page");
    router.push(`/quality?${params.toString()}`);
  }, [router, searchParams]);

  const updateFilter = useCallback((key: string, value: string) => {
    updateFilters({ [key]: value || null });
  }, [updateFilters]);

  const flash = (text: string, tone: Notice["tone"] = "success") => {
    setMessage({ text, tone });
    setTimeout(() => setMessage(null), 3500);
  };

  const batchLimitNumber = () => Math.max(1, Math.min(100, Math.floor(Number(batchLimit) || 25)));

  const batchInput = (ids?: string[]) => ({
    limit: ids?.length ?? batchLimitNumber(),
    businessType: filters.businessType,
    recommendedOffer: filters.recommendedOffer,
    phoneVerificationStatus: filters.phoneVerificationStatus,
    aiVerificationStatus: filters.aiVerificationStatus,
    enrichmentStatus: filters.enrichmentStatus,
    qualityBucket: filters.qualityBucket,
    countryCode: filters.countryCode,
    marketId: filters.marketId,
    locationCellId: filters.locationCellId,
    city: filters.city,
    zip: filters.zip,
    denverOnly: filters.denverOnly,
    ids,
  });

  const runBatch = async (name: string, input: Parameters<typeof runQualityAiVerificationBatchAction>[0]) => {
    setBusy(name);
    try {
      const result = await runQualityAiVerificationBatchAction(input);
      if ("error" in result) {
        flash(result.error ?? "AI verification failed", "danger");
      } else {
        flash(`Processed ${result.processed}. Verified ${result.verified}, cached ${result.cached}, errors ${result.errors}.`, result.errors > 0 ? "warning" : "success");
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const queueAiBatch = async (name: string, input: Parameters<typeof queueQualityAiVerificationBatchAction>[0]) => {
    setBusy(name);
    try {
      const result = await queueQualityAiVerificationBatchAction(input);
      if ("error" in result) {
        flash(result.error ?? "Unable to queue AI verification", "danger");
      } else {
        flash(`Sent ${result.queued} to the AI queue. They will show as "Waiting for AI" until the worker processes them.`);
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const queueEnrichmentBatch = async (name: string, input: Parameters<typeof queueQualityEnrichmentBatchAction>[0]) => {
    setBusy(name);
    try {
      const result = await queueQualityEnrichmentBatchAction(input);
      if ("error" in result) {
        flash(result.error ?? "Unable to queue enrichment", "danger");
      } else {
        flash(`${result.queued} leads are in the enrichment backlog.`);
        setSelected(new Set());
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  };

  const updatePhone = async (leadId: string, status: string) => {
    setBusy(`phone-${leadId}`);
    const result = await updateLeadPhoneVerificationStatusAction(leadId, status);
    setBusy(null);
    if ("error" in result) flash(result.error ?? "Unable to update phone", "danger");
    else {
      flash("Phone status updated");
      router.refresh();
    }
  };

  const markBucket = async (leadId: string, bucket: string) => {
    setBusy(`bucket-${leadId}`);
    const result = await markLeadQualityBucketAction(leadId, bucket);
    setBusy(null);
    if ("error" in result) flash(result.error ?? "Unable to update quality bucket", "danger");
    else {
      flash("Quality bucket updated");
      router.refresh();
    }
  };

  const markContacted = async (lead: QualityLead) => {
    setBusy(`contact-${lead.id}`);
    try {
      const result = await logOutreachEventAction(lead.id, lead.phone ? "call" : "other", "Marked contacted from Quality workspace");
      if ("error" in result) {
        flash(result.error ?? "Unable to log contact", "danger");
        return;
      }
      flash("Contact logged");
      router.refresh();
    } catch (error) {
      flash(error instanceof Error ? error.message : "Unable to log contact", "danger");
    } finally {
      setBusy(null);
    }
  };

  const addNote = async (leadId: string) => {
    const body = (noteDrafts[leadId] ?? "").trim();
    if (!body) return;
    setBusy(`note-${leadId}`);
    const result = await addLeadNoteAction(leadId, body);
    setBusy(null);
    if ("error" in result) flash(result.error ?? "Unable to add note", "danger");
    else {
      setNoteDrafts((current) => ({ ...current, [leadId]: "" }));
      flash("Note added");
    }
  };

  const toggleAll = () => {
    if (selected.size === leads.length) setSelected(new Set());
    else setSelected(new Set(leads.map((lead) => lead.id)));
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <PageShell
      title="Lead Quality"
      description="Pick a market, then send leads to enrichment or AI verification with clear queue status."
      stats={[
        { label: "Ready to Call", value: String(summary.readyToCall) },
        { label: "No Website", value: String(summary.aiVerifiedNoWebsite) },
        { label: "Broken Sites", value: String(summary.brokenSiteOpportunities) },
        { label: "Pipeline", value: formatCurrency(summary.estimatedPipelineValue) },
      ]}
    >
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Ready to Call" value={summary.readyToCall} />
        <MetricCard label="AI Verified No Website" value={summary.aiVerifiedNoWebsite} />
        <MetricCard label="Broken Site Opportunities" value={summary.brokenSiteOpportunities} />
        <MetricCard label="No AI Result Yet" value={summary.needsAiVerify} />
        <MetricCard label="Needs Manual Review" value={summary.needsManualReview} />
        <MetricCard label="Removed: Website Found" value={summary.removedBecauseWebsiteFound} />
        <MetricCard label="Avg Quality Score" value={`${summary.averageQualityScore}%`} />
        <MetricCard label="Estimated Pipeline" value={formatCurrency(summary.estimatedPipelineValue)} />
      </section>

      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="section-label">Quality scope</p>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Current scope: <span className="font-medium" style={{ color: "var(--text-primary)" }}>{currentScope}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-glass text-xs" title="Clear country, market, cell, city, and postal filters." onClick={() => updateFilters({ countryCode: null, marketId: null, locationCellId: null, city: null, zip: null, denverOnly: null })}>
              All markets
            </button>
            <button type="button" className="btn-glass text-xs" title="Switch quality scope to Colorado leads." onClick={() => updateFilters({ countryCode: "US", marketId: "market-colorado", locationCellId: null, city: null, zip: null, denverOnly: "1" })}>
              Colorado
            </button>
            {locationMarkets.some((market) => market.id === "market-london-ca") && (
              <button type="button" className="btn-glass text-xs" title="Switch quality scope to London, Ontario leads." onClick={() => updateFilters({ countryCode: "CA", marketId: "market-london-ca", locationCellId: null, city: null, zip: null, denverOnly: null })}>
                London, Ontario
              </button>
            )}
          </div>
        </div>
        {activeFilterChips.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Active quality filters">
            {activeFilterChips.map((chip) => (
              <span key={chip.key} className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium" style={{ borderColor: "var(--info-border)", background: "var(--info-bg)", color: "var(--info-text)" }} title={chip.help}>
                {chip.label}: {chip.value}
                <button type="button" className="text-xs font-bold" aria-label={`Remove ${chip.label} filter`} title={`Remove ${chip.label} filter`} onClick={() => updateFilters(chip.remove)}>
                  x
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            aria-label="Country filter"
            title="Limit quality leads to one country. Changing this clears the market and cell."
            className="glass-select w-full min-w-0 max-w-full"
            value={filters.countryCode ?? ""}
            onChange={(event) => updateFilters({ countryCode: event.target.value || null, marketId: null, locationCellId: null, denverOnly: null })}
          >
            {COUNTRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select
            aria-label="Market filter"
            title="Limit quality leads to a saved market, such as London, Ontario."
            className="glass-select w-full min-w-0 max-w-full"
            value={filters.marketId ?? ""}
            onChange={(event) => {
              const market = locationMarkets.find((item) => item.id === event.target.value);
              updateFilters({ marketId: event.target.value || null, countryCode: market?.country_code ?? filters.countryCode ?? null, locationCellId: null, denverOnly: null });
            }}
          >
            <option value="">All markets</option>
            {visibleMarkets.map((market) => <option key={market.id} value={market.id}>{marketLabel(market)}</option>)}
          </select>
          <select
            aria-label="Location cell filter"
            title="Limit quality leads to a specific postal, postcode, or area cell inside the selected market."
            className="glass-select w-full min-w-0 max-w-full"
            value={filters.locationCellId ?? ""}
            disabled={!filters.marketId}
            onChange={(event) => updateFilters({ locationCellId: event.target.value || null, denverOnly: null })}
          >
            <option value="">{filters.marketId ? "All cells" : "Pick a market first"}</option>
            {activeCells.map((cell) => <option key={cell.id} value={cell.id}>{cell.cell_label}</option>)}
          </select>
          <form
            className="flex w-full min-w-0 gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilters({ city: city.trim() || null, zip: zip.trim() || null, denverOnly: null });
            }}
          >
            <input className="glass-input min-w-0 flex-1" placeholder="City" title="Optional city filter for quality leads." value={city} onChange={(event) => setCity(event.target.value)} />
            <input className="glass-input w-28" placeholder="Postal" title="Optional postal or postcode prefix, such as N6H." value={zip} onChange={(event) => setZip(event.target.value)} />
            <button type="submit" className="btn-glass text-xs" title="Apply the city and postal filters.">Apply</button>
          </form>
        </div>

        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3">
          <form
            className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-auto"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilter("search", search);
            }}
          >
            <input className="glass-input min-w-0 flex-1" placeholder="Search name, phone, area..." title="Search within the current quality scope." value={search} onChange={(event) => setSearch(event.target.value)} />
            <button type="submit" className="btn-glass text-xs" title="Apply text search to the quality list.">Search</button>
          </form>
          <select aria-label="Quality bucket filter" title="Filter by the lead's current sales-readiness bucket." className="glass-select min-w-0 max-w-full" value={filters.qualityBucket ?? ""} onChange={(event) => updateFilter("qualityBucket", event.target.value)}>
            {BUCKET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select aria-label="Business type filter" title="Filter by business category, such as plumbing or dental." className="glass-select min-w-0 max-w-full" value={filters.businessType ?? ""} onChange={(event) => updateFilter("businessType", event.target.value)}>
            <option value="">All business types</option>
            {businessTypeCounts.map((type) => <option key={type.id} value={type.id}>{type.label} ({type.active})</option>)}
          </select>
          <select aria-label="Recommended offer filter" title="Filter by the offer the system recommends pitching." className="glass-select min-w-0 max-w-full" value={filters.recommendedOffer ?? ""} onChange={(event) => updateFilter("recommendedOffer", event.target.value)}>
            {OFFER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select aria-label="Phone verification filter" title="Filter by whether the phone number has been checked." className="glass-select min-w-0 max-w-full" value={filters.phoneVerificationStatus ?? ""} onChange={(event) => updateFilter("phoneVerificationStatus", event.target.value)}>
            {PHONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select aria-label="AI verification filter" title="Filter by completed AI outcome. Leads waiting in the AI queue still have no result yet." className="glass-select min-w-0 max-w-full" value={filters.aiVerificationStatus ?? ""} onChange={(event) => updateFilter("aiVerificationStatus", event.target.value)}>
            {AI_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select aria-label="Enrichment filter" title="Filter by whether Google Place Details enrichment has completed." className="glass-select min-w-0 max-w-full" value={filters.enrichmentStatus ?? ""} onChange={(event) => updateFilter("enrichmentStatus", event.target.value)}>
            {ENRICHMENT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            Batch
            <input className="glass-input w-20 text-xs" type="number" min={1} max={100} value={batchLimit} title="Number of top matching leads to act on. Selected rows override this number." onChange={(event) => setBatchLimit(event.target.value)} />
          </label>
          <button type="button" className="btn-primary text-xs" title="Put the top matching leads into the enrichment backlog. This does not instantly enrich them; the enrichment worker processes the backlog." disabled={busy !== null} onClick={() => queueEnrichmentBatch("queue-enrichment", batchInput())}>
            {busy === "queue-enrichment" ? "Sending..." : `Send Top ${batchLimitNumber()} to Enrichment`}
          </button>
          <button type="button" className="btn-glass text-xs" title="Put the top matching leads into the AI queue. They will show as Waiting for AI until the worker processes them." disabled={busy !== null} onClick={() => queueAiBatch("queue-ai", batchInput())}>
            {busy === "queue-ai" ? "Sending..." : `Send Top ${batchLimitNumber()} to AI Queue`}
          </button>
          <button type="button" className="btn-glass text-xs" title="Process the top matching leads immediately in this request. Results should change from Not sent or Waiting to a completed AI outcome." disabled={busy !== null} onClick={() => setPendingPaidBatch({ name: "run-now", input: batchInput(), count: batchLimitNumber() })}>
            {busy === "run-now" ? "Processing..." : `Process AI Now (${batchLimitNumber()})`}
          </button>
          <button type="button" className="btn-glass text-xs" title="Put only the selected rows into the enrichment backlog." disabled={busy !== null || selectedIds.length === 0} onClick={() => queueEnrichmentBatch("selected-enrichment", batchInput(selectedIds))}>
            {busy === "selected-enrichment" ? "Sending..." : `Send Selected to Enrichment (${selectedIds.length})`}
          </button>
          <button type="button" className="btn-glass text-xs" title="Put only the selected rows into the AI queue." disabled={busy !== null || selectedIds.length === 0} onClick={() => queueAiBatch("selected-ai", batchInput(selectedIds))}>
            {busy === "selected-ai" ? "Sending..." : `Send Selected to AI Queue (${selectedIds.length})`}
          </button>
          <HelpTip>Send to AI Queue means waiting for a background worker. Process AI Now runs verification immediately and should produce a completed AI outcome.</HelpTip>
          {message && <StatusNotice notice={message} compact />}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(pendingPaidBatch)}
        title="Process paid AI verification now?"
        message={`This immediately sends up to ${pendingPaidBatch?.count ?? 0} matching leads to the configured AI model and can incur usage charges. Queuing is safer when you do not need results in this request.`}
        confirmLabel="Process AI now"
        cancelLabel="Keep queued workflow"
        busy={busy === pendingPaidBatch?.name}
        onCancel={() => setPendingPaidBatch(null)}
        onConfirm={async () => {
          if (!pendingPaidBatch) return;
          try {
            await runBatch(pendingPaidBatch.name, pendingPaidBatch.input);
          } finally {
            setPendingPaidBatch(null);
          }
        }}
      />

      <section className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-label">Today Quality Queue</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{total} matching leads in {currentScope}. Usable websites and excluded leads are hidden.</p>
          </div>
          {selected.size > 0 && <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{selected.size} selected</span>}
        </div>

        {leads.length === 0 ? (
          <div className="rounded-xl border p-5 text-center text-sm" style={{ background: "var(--surface-muted)", borderColor: "var(--surface-card-border)", color: "var(--text-tertiary)" }}>
            No quality candidates match these filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="glass-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={selected.size === leads.length} onChange={toggleAll} aria-label="Select all quality leads" />
                  </th>
                  <th>Business</th>
                  <th>Type</th>
                  <th>Phone</th>
                  <th>Location</th>
                  <th>Enrichment</th>
                  <th>Website Finding</th>
                  <th>Quality</th>
                  <th>Offer</th>
                  <th>Next Action</th>
                  <th>Workflow</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleSelected(lead.id)} aria-label={`Select ${lead.name ?? "lead"}`} />
                    </td>
                    <td>
                      <Link href={`/leads/${lead.id}`} prefetch={false} className="link-accent font-medium">{lead.name ?? "Unknown"}</Link>
                      <div className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {bucketLabel(lead.quality_bucket)}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <ArtifactBadge type="brief" status={lead.business_detail_status} />
                        <ArtifactBadge type="report" status={lead.competitive_report_status} />
                      </div>
                    </td>
                    <td>{getBusinessTypeLabel(lead.business_type)}</td>
                    <td>
                      <div>{lead.phone ?? "No phone"}</div>
                      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{phoneLabel(lead.phone_verification_status)}</span>
                    </td>
                    <td>
                      <div>{qualityLeadLocation(lead)}</div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{lead.postal_code ?? lead.country_code ?? ""}</div>
                    </td>
                    <td>
                      <span style={badge("info")} title={enrichmentHelp(lead.enrichment_status)}>{enrichmentLabel(lead.enrichment_status)}</span>
                    </td>
                    <td>
                      <span style={websiteFindingStyle(lead)}>{websiteFindingLabel(lead)}</span>
                      <div className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                        <AiVerificationBadge
                          status={lead.ai_verification_status}
                          checkedAt={lead.ai_checked_at}
                          queueStatus={lead.ai_queue_status}
                          viability={lead.ai_website_viability_status}
                          confidence={lead.ai_confidence}
                          showDetail
                        />
                      </div>
                    </td>
                    <td>
                      <div className="font-semibold">{Math.round(lead.lead_quality_score)}%</div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        Easy {Math.round(lead.easy_build_score)} / Cash {Math.round(lead.cash_speed_score)}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{formatCurrency(lead.estimated_deal_value)}</div>
                    </td>
                    <td>{offerLabel(lead.recommended_offer)}</td>
                    <td className="min-w-56">
                      <div className="text-sm" style={{ color: "var(--text-primary)" }}>{lead.next_best_action ?? "Review and decide next action."}</div>
                      <div className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{lead.quality_reason ?? ""}</div>
                    </td>
                    <td className="min-w-72">
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" className="btn-glass text-[0.68rem]" title="Mark this phone number as callable." disabled={busy !== null} onClick={() => updatePhone(lead.id, "works")}>Phone Works</button>
                        <button type="button" className="btn-glass text-[0.68rem]" title="Mark this phone number as bad or unusable." disabled={busy !== null} onClick={() => updatePhone(lead.id, "bad")}>Phone Bad</button>
                        <button type="button" className="btn-glass text-[0.68rem]" title="Mark this lead ready for a call." disabled={busy !== null} onClick={() => markBucket(lead.id, "ready_to_call")}>Ready</button>
                        <button type="button" className="btn-glass text-[0.68rem]" title="Send this lead to manual review before calling." disabled={busy !== null} onClick={() => markBucket(lead.id, "needs_manual_review")}>Manual</button>
                        <button type="button" className="btn-glass text-[0.68rem]" title="Mark this as a broken or weak website opportunity." disabled={busy !== null} onClick={() => markBucket(lead.id, "broken_site_opportunity")}>Broken</button>
                        <button type="button" className="btn-primary text-[0.68rem]" title="Log this lead as contacted from the Quality workspace." disabled={busy !== null} onClick={() => markContacted(lead)}>Contacted</button>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input
                          className="glass-input min-w-36 flex-1 text-xs"
                          placeholder="Quick note"
                          title="Add an internal note to this lead."
                          value={noteDrafts[lead.id] ?? ""}
                          onChange={(event) => setNoteDrafts((current) => ({ ...current, [lead.id]: event.target.value }))}
                        />
                        <button type="button" className="btn-glass text-xs" title="Save this internal lead note." disabled={busy !== null || !(noteDrafts[lead.id] ?? "").trim()} onClick={() => addNote(lead.id)}>Add</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <button type="button" className="btn-glass text-xs" title="Go to the previous page of quality leads." disabled={page <= 1} onClick={() => updateFilter("page", String(page - 1))}>Previous</button>
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>Page {page} of {totalPages}</span>
            <button type="button" className="btn-glass text-xs" title="Go to the next page of quality leads." disabled={page >= totalPages} onClick={() => updateFilter("page", String(page + 1))}>Next</button>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-2xl px-4 py-3" title={metricHelp(label)}>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
      <p className="mt-1 text-xl font-semibold" style={{ color: "var(--text-primary)" }}>{value}</p>
    </div>
  );
}

function bucketLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function phoneLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function offerLabel(value: string): string {
  return value.replace(/_/g, " ");
}

function websiteFindingLabel(lead: QualityLead): string {
  const aiDisplay = getAiVerificationDisplay({
    status: lead.ai_verification_status,
    checkedAt: lead.ai_checked_at,
    queueStatus: lead.ai_queue_status,
    viability: lead.ai_website_viability_status,
  });
  if (!aiDisplay.hasRun) return aiDisplay.label;
  if (lead.ai_verification_status === "no_site_found" || lead.ai_website_viability_status === "directory_only") return "AI no usable site";
  if (lead.ai_verification_status === "weak_site_found") return `Weak site: ${lead.ai_website_viability_status ?? "unknown"}`;
  if (lead.ai_verification_status === "uncertain" || lead.ai_verification_status === "mismatch") return "Needs review";
  return lead.website_status;
}

function websiteFindingStyle(lead: QualityLead): React.CSSProperties {
  const status = lead.ai_verification_status;
  if (status === "no_site_found") return badge("success");
  if (status === "weak_site_found") return badge("warning");
  if (status === "uncertain" || status === "mismatch") return badge("info");
  return badge("muted");
}

function badge(tone: StatusTone): React.CSSProperties {
  return {
    ...getStatusToneStyle(tone),
    padding: "2px 8px",
    borderRadius: "6px",
    fontSize: "0.75rem",
    fontWeight: 600,
  };
}

function ArtifactBadge({ type, status }: { type: "brief" | "report"; status: string | null }) {
  const label = artifactBadgeLabel(type, status);
  const style = status === "complete"
    ? badge("success")
    : status === "queued" || status === "running"
      ? badge("info")
      : status === "error"
        ? badge("danger")
        : badge("muted");
  return <span style={{ ...style, fontSize: "0.68rem" }} title={artifactHelp(type, status)}>{label}</span>;
}

function artifactBadgeLabel(type: "brief" | "report", status: string | null): string {
  if (status === "complete") return type === "brief" ? "Brief ready" : "Report ready";
  if (status === "queued" || status === "running") return "Generating";
  return "Missing";
}

function metricHelp(label: string): string {
  if (label === "No AI Result Yet") return "Leads that do not have a completed AI verification result yet. They may be not sent, waiting, or processing.";
  if (label === "AI Verified No Website") return "Leads where AI completed verification and found no usable website.";
  if (label === "Broken Site Opportunities") return "Leads with weak, broken, placeholder, or similar website opportunities.";
  if (label === "Ready to Call") return "Leads currently marked ready for phone outreach.";
  if (label === "Needs Manual Review") return "Leads that need a human check before calling.";
  return label;
}

function artifactHelp(type: "brief" | "report", status: string | null): string {
  const name = type === "brief" ? "business detail brief" : "competitive report";
  if (status === "complete") return `The ${name} is ready.`;
  if (status === "queued" || status === "running") return `The ${name} is being generated.`;
  if (status === "error") return `The ${name} failed to generate.`;
  return `No ${name} has been generated yet.`;
}

type QualityFilterChip = {
  key: string;
  label: string;
  value: string;
  help: string;
  remove: Record<string, string | null>;
};

function qualityFilterChips(filters: QualityFilters, selectedMarket: LocationMarket | null, locationCells: LocationCell[]): QualityFilterChip[] {
  const chips: QualityFilterChip[] = [];
  if (filters.countryCode) {
    chips.push({
      key: "countryCode",
      label: "Country",
      value: countryLabel(filters.countryCode),
      help: "Country filter applied to the quality list.",
      remove: { countryCode: null, marketId: null, locationCellId: null },
    });
  }
  if (filters.marketId) {
    chips.push({
      key: "marketId",
      label: "Market",
      value: selectedMarket ? marketLabel(selectedMarket) : filters.marketId,
      help: "Market filter applied to the quality list.",
      remove: { marketId: null, locationCellId: null },
    });
  }
  if (filters.locationCellId) {
    const cell = locationCells.find((item) => item.id === filters.locationCellId);
    chips.push({
      key: "locationCellId",
      label: "Cell",
      value: cell?.cell_label ?? filters.locationCellId,
      help: "Postal, postcode, or area cell filter applied to the quality list.",
      remove: { locationCellId: null },
    });
  }
  addQualityChip(chips, "city", "City", filters.city, "City filter applied to the quality list.", { city: null });
  addQualityChip(chips, "zip", "Postal", filters.zip, "Postal or postcode filter applied to the quality list.", { zip: null });
  addQualityChip(chips, "search", "Search", filters.search, "Text search applied to the quality list.", { search: null });
  addQualityChip(chips, "qualityBucket", "Quality", filters.qualityBucket ? bucketLabel(String(filters.qualityBucket)) : null, "Quality bucket filter applied.", { qualityBucket: null });
  addQualityChip(chips, "businessType", "Type", filters.businessType ? getBusinessTypeLabel(String(filters.businessType)) : null, "Business type filter applied.", { businessType: null });
  addQualityChip(chips, "recommendedOffer", "Offer", filters.recommendedOffer ? offerLabel(String(filters.recommendedOffer)) : null, "Recommended offer filter applied.", { recommendedOffer: null });
  addQualityChip(chips, "phoneVerificationStatus", "Phone", filters.phoneVerificationStatus ? phoneLabel(String(filters.phoneVerificationStatus)) : null, "Phone verification filter applied.", { phoneVerificationStatus: null });
  addQualityChip(chips, "aiVerificationStatus", "AI outcome", filters.aiVerificationStatus ? aiStatusLabel(String(filters.aiVerificationStatus)) : null, "Completed AI outcome filter applied.", { aiVerificationStatus: null });
  addQualityChip(chips, "enrichmentStatus", "Enrichment", filters.enrichmentStatus ? enrichmentLabel(String(filters.enrichmentStatus)) : null, "Enrichment status filter applied.", { enrichmentStatus: null });
  return chips;
}

function addQualityChip(chips: QualityFilterChip[], key: string, label: string, value: string | null | undefined, help: string, remove: Record<string, string | null>): void {
  if (!value) return;
  chips.push({ key, label, value, help, remove });
}

function marketLabel(market: LocationMarket): string {
  return [market.name, market.admin_area1, market.country_code].filter(Boolean).join(", ");
}

function countryLabel(value: string): string {
  return COUNTRY_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function qualityLeadLocation(lead: QualityLead): string {
  return lead.locality || lead.city || extractLocationFromAddress(lead.address) || "N/A";
}

function aiStatusLabel(value: string): string {
  return AI_OPTIONS.find((option) => option.value === value)?.label ?? value.replace(/_/g, " ");
}

function enrichmentLabel(value: string): string {
  if (value === "pending") return "Needs enrichment";
  return value.replace(/_/g, " ");
}

function enrichmentHelp(value: string): string {
  if (value === "pending") return "This lead is in the enrichment backlog. A worker still has to fetch details and update the lead.";
  if (value === "enriched") return "Google details enrichment has completed for this lead.";
  if (value === "skipped") return "Enrichment was skipped for this lead.";
  return "Current enrichment state.";
}

function extractLocationFromAddress(address: string | null): string | null {
  if (!address) return null;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] ?? null : parts[0] ?? null;
}

function formatCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}
