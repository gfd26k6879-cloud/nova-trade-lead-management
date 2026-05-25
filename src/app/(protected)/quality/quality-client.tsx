"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { PageShell } from "@/components/page-shell";
import {
  addLeadNoteAction,
  logOutreachEventAction,
  markLeadQualityBucketAction,
  runQualityAiVerificationBatchAction,
  updateLeadPhoneVerificationStatusAction,
  updateLeadStatusAction,
} from "@/lib/leads/actions";
import { getBusinessTypeLabel } from "@/lib/business-types";
import type { QualityFilters, QualityLead, QualitySummary } from "@/lib/db/queries";

const BUCKET_OPTIONS = [
  { value: "", label: "All quality buckets" },
  { value: "ready_to_call", label: "Ready to Call" },
  { value: "broken_site_opportunity", label: "Broken Site Opportunity" },
  { value: "needs_ai_verify", label: "Needs AI Verify" },
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
  { value: "", label: "All AI states" },
  { value: "not_checked", label: "Not Checked" },
  { value: "no_site_found", label: "No Site Found" },
  { value: "weak_site_found", label: "Weak Site Found" },
  { value: "uncertain", label: "Uncertain" },
  { value: "mismatch", label: "Mismatch" },
];

interface Props {
  summary: QualitySummary;
  leads: QualityLead[];
  total: number;
  filters: QualityFilters;
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
}

export function QualityClient({ summary, leads, total, filters, businessTypeCounts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const updateFilter = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key !== "page") params.delete("page");
    router.push(`/quality?${params.toString()}`);
  }, [router, searchParams]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 3500);
  };

  const runBatch = async (name: string, input: Parameters<typeof runQualityAiVerificationBatchAction>[0]) => {
    setBusy(name);
    try {
      const result = await runQualityAiVerificationBatchAction(input);
      if ("error" in result) {
        flash(result.error ?? "AI verification failed");
      } else {
        flash(`Processed ${result.processed}. Verified ${result.verified}, cached ${result.cached}, errors ${result.errors}.`);
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
    if ("error" in result) flash(result.error ?? "Unable to update phone");
    else {
      flash("Phone status updated");
      router.refresh();
    }
  };

  const markBucket = async (leadId: string, bucket: string) => {
    setBusy(`bucket-${leadId}`);
    const result = await markLeadQualityBucketAction(leadId, bucket);
    setBusy(null);
    if ("error" in result) flash(result.error ?? "Unable to update quality bucket");
    else {
      flash("Quality bucket updated");
      router.refresh();
    }
  };

  const markContacted = async (lead: QualityLead) => {
    setBusy(`contact-${lead.id}`);
    await updateLeadStatusAction(lead.id, "contacted");
    const result = await logOutreachEventAction(lead.id, lead.phone ? "call" : "other", "Marked contacted from Quality workspace");
    setBusy(null);
    if ("error" in result) flash(result.error ?? "Unable to log contact");
    else {
      flash("Contact logged");
      router.refresh();
    }
  };

  const addNote = async (leadId: string) => {
    const body = (noteDrafts[leadId] ?? "").trim();
    if (!body) return;
    setBusy(`note-${leadId}`);
    const result = await addLeadNoteAction(leadId, body);
    setBusy(null);
    if ("error" in result) flash(result.error ?? "Unable to add note");
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
      description="Researcher workspace for the fastest no-website opportunities to call today."
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
        <MetricCard label="Needs AI Verify" value={summary.needsAiVerify} />
        <MetricCard label="Needs Manual Review" value={summary.needsManualReview} />
        <MetricCard label="Removed: Website Found" value={summary.removedBecauseWebsiteFound} />
        <MetricCard label="Avg Quality Score" value={`${summary.averageQualityScore}%`} />
        <MetricCard label="Estimated Pipeline" value={formatCurrency(summary.estimatedPipelineValue)} />
      </section>

      <section className="glass rounded-2xl p-5">
        <div className="flex flex-wrap items-center gap-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateFilter("search", search);
            }}
          >
            <input className="glass-input min-w-60" placeholder="Search name, phone, area..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <button type="submit" className="btn-glass text-xs">Search</button>
          </form>

          <select aria-label="Quality bucket filter" className="glass-select" value={filters.qualityBucket ?? ""} onChange={(event) => updateFilter("qualityBucket", event.target.value)}>
            {BUCKET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select aria-label="Business type filter" className="glass-select" value={filters.businessType ?? ""} onChange={(event) => updateFilter("businessType", event.target.value)}>
            <option value="">All business types</option>
            {businessTypeCounts.map((type) => <option key={type.id} value={type.id}>{type.label} ({type.active})</option>)}
          </select>
          <select aria-label="Recommended offer filter" className="glass-select" value={filters.recommendedOffer ?? ""} onChange={(event) => updateFilter("recommendedOffer", event.target.value)}>
            {OFFER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select aria-label="Phone verification filter" className="glass-select" value={filters.phoneVerificationStatus ?? ""} onChange={(event) => updateFilter("phoneVerificationStatus", event.target.value)}>
            {PHONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select aria-label="AI verification filter" className="glass-select" value={filters.aiVerificationStatus ?? ""} onChange={(event) => updateFilter("aiVerificationStatus", event.target.value)}>
            {AI_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            <input
              type="checkbox"
              checked={filters.denverOnly !== false}
              onChange={(event) => updateFilter("denverOnly", event.target.checked ? "1" : "0")}
            />
            Denver first
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary text-xs" disabled={busy !== null} onClick={() => runBatch("top10", { limit: 10, businessType: filters.businessType, denverOnly: filters.denverOnly })}>
            {busy === "top10" ? "Verifying..." : "Verify Top 10"}
          </button>
          <button type="button" className="btn-glass text-xs" disabled={busy !== null} onClick={() => runBatch("denver25", { limit: 25, businessType: filters.businessType, denverOnly: true })}>
            {busy === "denver25" ? "Verifying..." : "Verify Denver Top 25"}
          </button>
          <button type="button" className="btn-glass text-xs" disabled={busy !== null || selectedIds.length === 0} onClick={() => runBatch("selected", { ids: selectedIds, limit: selectedIds.length })}>
            {busy === "selected" ? "Verifying..." : `Verify Selected (${selectedIds.length})`}
          </button>
          <button type="button" className="btn-glass text-xs" disabled={busy !== null} onClick={() => runBatch("refresh", { limit: 25, denverOnly: filters.denverOnly, businessType: filters.businessType })}>
            {busy === "refresh" ? "Refreshing..." : "Refresh Broken/Uncertain"}
          </button>
          {message && <span className="text-xs" style={{ color: "#166534" }}>{message}</span>}
        </div>
      </section>

      <section className="glass rounded-2xl p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-label">Today Quality Queue</h3>
            <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>{total} matching leads. Default view hides usable websites and excluded leads.</p>
          </div>
          {selected.size > 0 && <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{selected.size} selected</span>}
        </div>

        {leads.length === 0 ? (
          <div className="rounded-xl p-5 text-center text-sm" style={{ background: "rgba(255,255,255,0.35)", color: "var(--text-tertiary)" }}>
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
                  <th>Area</th>
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
                      <Link href={`/leads/${lead.id}`} className="link-accent font-medium">{lead.name ?? "Unknown"}</Link>
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
                    <td>{lead.city ?? "N/A"}</td>
                    <td>
                      <span style={websiteFindingStyle(lead)}>{websiteFindingLabel(lead)}</span>
                      <div className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
                        AI {Math.round((lead.ai_confidence ?? 0) * 100)}%
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
                        <button type="button" className="btn-glass text-[0.68rem]" disabled={busy !== null} onClick={() => updatePhone(lead.id, "works")}>Phone Works</button>
                        <button type="button" className="btn-glass text-[0.68rem]" disabled={busy !== null} onClick={() => updatePhone(lead.id, "bad")}>Phone Bad</button>
                        <button type="button" className="btn-glass text-[0.68rem]" disabled={busy !== null} onClick={() => markBucket(lead.id, "ready_to_call")}>Ready</button>
                        <button type="button" className="btn-glass text-[0.68rem]" disabled={busy !== null} onClick={() => markBucket(lead.id, "needs_manual_review")}>Manual</button>
                        <button type="button" className="btn-glass text-[0.68rem]" disabled={busy !== null} onClick={() => markBucket(lead.id, "broken_site_opportunity")}>Broken</button>
                        <button type="button" className="btn-primary text-[0.68rem]" disabled={busy !== null} onClick={() => markContacted(lead)}>Contacted</button>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <input
                          className="glass-input min-w-36 flex-1 text-xs"
                          placeholder="Quick note"
                          value={noteDrafts[lead.id] ?? ""}
                          onChange={(event) => setNoteDrafts((current) => ({ ...current, [lead.id]: event.target.value }))}
                        />
                        <button type="button" className="btn-glass text-xs" disabled={busy !== null || !(noteDrafts[lead.id] ?? "").trim()} onClick={() => addNote(lead.id)}>Add</button>
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
            <button type="button" className="btn-glass text-xs" disabled={page <= 1} onClick={() => updateFilter("page", String(page - 1))}>Previous</button>
            <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>Page {page} of {totalPages}</span>
            <button type="button" className="btn-glass text-xs" disabled={page >= totalPages} onClick={() => updateFilter("page", String(page + 1))}>Next</button>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-2xl px-4 py-3">
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
  if (lead.ai_verification_status === "no_site_found" || lead.ai_website_viability_status === "directory_only") return "AI no usable site";
  if (lead.ai_verification_status === "weak_site_found") return `Weak site: ${lead.ai_website_viability_status ?? "unknown"}`;
  if (lead.ai_verification_status === "uncertain" || lead.ai_verification_status === "mismatch") return "Needs review";
  if (lead.ai_verification_status === "not_checked") return "Needs AI verify";
  return lead.website_status;
}

function websiteFindingStyle(lead: QualityLead): React.CSSProperties {
  const status = lead.ai_verification_status;
  if (status === "no_site_found") return badge("#166534", "rgba(34,197,94,0.12)");
  if (status === "weak_site_found") return badge("#92400e", "rgba(245,158,11,0.13)");
  if (status === "uncertain" || status === "mismatch") return badge("#4338ca", "rgba(99,102,241,0.12)");
  return badge("#4b5563", "rgba(107,114,128,0.12)");
}

function badge(color: string, background: string): React.CSSProperties {
  return { color, background, padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600 };
}

function ArtifactBadge({ type, status }: { type: "brief" | "report"; status: string | null }) {
  const label = artifactBadgeLabel(type, status);
  const style = status === "complete"
    ? badge("#166534", "rgba(34,197,94,0.1)")
    : status === "queued" || status === "running"
      ? badge("#4338ca", "rgba(99,102,241,0.1)")
      : status === "error"
        ? badge("#991b1b", "rgba(239,68,68,0.1)")
        : badge("#4b5563", "rgba(107,114,128,0.1)");
  return <span style={{ ...style, fontSize: "0.68rem" }}>{label}</span>;
}

function artifactBadgeLabel(type: "brief" | "report", status: string | null): string {
  if (status === "complete") return type === "brief" ? "Brief ready" : "Report ready";
  if (status === "queued" || status === "running") return "Generating";
  return "Missing";
}

function formatCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}
