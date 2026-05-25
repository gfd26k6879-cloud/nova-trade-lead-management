"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { ScoreBandLegend } from "@/components/score-band-legend";
import { bulkUpdateLeadStatusAction } from "@/lib/leads/actions";
import { getBusinessTypeLabel } from "@/lib/business-types";
import type { ScoreBandThresholds } from "@/lib/score-bands";

interface Lead {
  id: string;
  place_id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  rating: number | null;
  review_count: number | null;
  website_status: string;
  business_type: string;
  score: number;
  status: string;
  is_excluded: boolean;
  exclusion_reason: string | null;
  enrichment_status: string;
  assigned_to_user_id?: string | null;
  assigned_user_email?: string | null;
  assigned_user_display_name?: string | null;
}

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
    category?: string;
    businessType?: string;
    assigned?: string;
    assignedToUserId?: string;
    sortBy?: string;
    sortDir?: string;
    page?: number;
    pageSize?: number;
  };
  scoreThresholds: ScoreBandThresholds;
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
  canExport: boolean;
  canClose: boolean;
}

const STATUS_FILTER_OPTIONS = ["", "new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost", "excluded"];
const BULK_STATUS_OPTIONS = ["new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost"];
const WEBSITE_OPTIONS = ["", "none", "social", "basic", "custom"];

const statusBadgeStyle = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    new: { bg: "rgba(99,102,241,0.1)", color: "#4338ca" },
    verified: { bg: "rgba(34,197,94,0.1)", color: "#166534" },
    contacted: { bg: "rgba(245,158,11,0.1)", color: "#92400e" },
    preview_sent: { bg: "rgba(168,85,247,0.1)", color: "#9333ea" },
    meeting_set: { bg: "rgba(14,165,233,0.1)", color: "#0284c7" },
    closed_won: { bg: "rgba(34,197,94,0.15)", color: "#166534" },
    closed_lost: { bg: "rgba(239,68,68,0.1)", color: "#991b1b" },
    excluded: { bg: "rgba(107,114,128,0.14)", color: "#374151" },
  };
  const c = colors[status] ?? { bg: "rgba(0,0,0,0.05)", color: "var(--text-secondary)" };
  return { background: c.bg, color: c.color, padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 500 };
};

const websiteBadgeStyle = (ws: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    none: { bg: "rgba(239,68,68,0.1)", color: "#991b1b" },
    social: { bg: "rgba(245,158,11,0.1)", color: "#92400e" },
    basic: { bg: "rgba(99,102,241,0.1)", color: "#4338ca" },
    custom: { bg: "rgba(34,197,94,0.1)", color: "#166534" },
  };
  const c = colors[ws] ?? { bg: "rgba(0,0,0,0.05)", color: "var(--text-secondary)" };
  return { background: c.bg, color: c.color, padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 500 };
};

const CATEGORY_OPTIONS = [
  "dentist","chiropractor","plumber","electrician","hvac_contractor",
  "roofing_contractor","auto_repair","hair_salon","real_estate_agent",
  "restaurant","gym","landscaper","veterinarian","accountant","lawyer",
];

export function LeadsClient({ leads, total, filters, scoreThresholds, businessTypeCounts, canExport, canClose }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("verified");
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(
    !!(filters.minReviews || filters.minRating || filters.minScore || filters.category)
  );

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;
  const totalPages = Math.ceil(total / pageSize);

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      if (key !== "page") params.delete("page");
      router.push(`/leads?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateFilter("search", search);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  };

  const handleBulkUpdate = async () => {
    if (selected.size === 0) return;
    const result = await bulkUpdateLeadStatusAction(Array.from(selected), bulkStatus);
    if ("count" in result) {
      setBulkMsg(`Updated ${result.count} leads to "${bulkStatus.replace(/_/g, " ")}"`);
      setSelected(new Set());
      setTimeout(() => setBulkMsg(null), 3000);
      router.refresh();
    } else if ("error" in result) {
      setBulkMsg(result.error ?? "Error");
    }
  };

  return (
    <PageShell
      title="Leads"
      description="Filter and prioritize leads for outreach."
      stats={[
        { label: "Total Leads", value: String(total) },
        { label: "Page", value: `${page} / ${Math.max(1, totalPages)}` },
      ]}
    >
      <section className="glass rounded-2xl p-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="text"
              aria-label="Search leads"
              placeholder="Search name, phone, ZIP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input min-w-56"
            />
            <button type="submit" className="btn-glass text-xs">Search</button>
          </form>

          <button
            type="button"
            className="btn-glass text-xs"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("view", "kanban");
              router.push(`/leads?${params.toString()}`);
            }}
          >
            Kanban View
          </button>
          <button type="button" className="btn-glass text-xs" onClick={() => updateFilter("assigned", "me")}>
            My Leads
          </button>
          <button type="button" className="btn-glass text-xs" onClick={() => updateFilter("assigned", "unassigned")}>
            Unclaimed
          </button>

          {canExport && (
            <a
              href={`/api/export/csv?${searchParams.toString()}`}
              className="btn-glass text-xs ml-auto"
              download
            >
              Export CSV
            </a>
          )}
          <select
            className="glass-select"
            aria-label="Business type"
            value={filters.businessType ?? ""}
            onChange={(e) => updateFilter("businessType", e.target.value)}
          >
            <option value="">All business types</option>
            {businessTypeCounts.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label} ({type.active})
              </option>
            ))}
          </select>
          <select
            className="glass-select"
            aria-label="Lead status"
            value={filters.status ?? ""}
            onChange={(e) => updateFilter("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {STATUS_FILTER_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <select
            className="glass-select"
            aria-label="Website status"
            value={filters.websiteStatus ?? ""}
            onChange={(e) => updateFilter("websiteStatus", e.target.value)}
          >
            <option value="">All websites</option>
            {WEBSITE_OPTIONS.filter(Boolean).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            className="glass-select"
            aria-label="Enrichment status"
            value={(filters as Record<string, string>).enrichment ?? ""}
            onChange={(e) => updateFilter("enrichment", e.target.value)}
          >
            <option value="">All enrichment</option>
            <option value="pending">Pending</option>
            <option value="enriched">Enriched</option>
          </select>
          <button
            type="button"
            className="btn-glass text-xs"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide Filters" : "Advanced Filters"}
          </button>
        </div>

        {showAdvanced && (
          <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl px-4 py-3"
            style={{ background: "rgba(255,255,255,0.3)", border: "1px solid rgba(255,255,255,0.35)" }}>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] font-medium" style={{ color: "var(--text-tertiary)" }}>Min Reviews</span>
              <input
                type="number"
                min={0}
                step={1}
                className="glass-input w-24 text-xs"
                defaultValue={filters.minReviews ?? ""}
                onChange={(e) => updateFilter("minReviews", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] font-medium" style={{ color: "var(--text-tertiary)" }}>Min Rating</span>
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                className="glass-input w-24 text-xs"
                defaultValue={filters.minRating ?? ""}
                onChange={(e) => updateFilter("minRating", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] font-medium" style={{ color: "var(--text-tertiary)" }}>Min Score</span>
              <input
                type="number"
                min={0}
                step={0.5}
                className="glass-input w-24 text-xs"
                defaultValue={filters.minScore ?? ""}
                onChange={(e) => updateFilter("minScore", e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[0.65rem] font-medium" style={{ color: "var(--text-tertiary)" }}>Category</span>
              <select
                className="glass-select text-xs"
                value={filters.category ?? ""}
                onChange={(e) => updateFilter("category", e.target.value)}
              >
                <option value="">All categories</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="mb-5">
          <ScoreBandLegend thresholds={scoreThresholds} />
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl px-4 py-3"
            style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
            <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{selected.size} selected</span>
            <select className="glass-select text-xs" aria-label="Bulk status" value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {BULK_STATUS_OPTIONS.filter((s) => canClose || (s !== "closed_won" && s !== "closed_lost")).map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
            <button type="button" className="btn-primary text-xs" onClick={handleBulkUpdate}>Apply Status</button>
            <button type="button" className="btn-glass text-xs" onClick={() => setSelected(new Set())}>Clear</button>
            {bulkMsg && <span className="text-xs" style={{ color: "#166534" }}>{bulkMsg}</span>}
          </div>
        )}

        {leads.length === 0 ? (
          <div
            className="rounded-xl p-5 text-center text-sm"
            style={{ background: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.4)", color: "var(--text-tertiary)" }}
          >
            {total === 0 ? "No leads yet. Start a crawl run from the Dashboard." : "No leads match current filters."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="glass-table">
                <thead>
                  <tr>
                    <th style={{ width: "2rem" }}>
                      <input
                        type="checkbox"
                        checked={selected.size === leads.length && leads.length > 0}
                        onChange={toggleAll}
                        className="rounded"
                        aria-label="Select all leads on page"
                      />
                    </th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Rating</th>
                    <th>Reviews</th>
                    <th>Business Type</th>
                    <th>Website</th>
                    <th>Score</th>
                    <th>Owner</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="rounded"
                          aria-label={`Select ${lead.name ?? "lead"}`}
                        />
                      </td>
                      <td>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="link-accent font-medium"
                        >
                          {lead.name ?? "—"}
                        </Link>
                      </td>
                      <td>{lead.phone ?? "—"}</td>
                      <td>{lead.rating?.toFixed(1) ?? "—"}</td>
                      <td>{lead.review_count ?? "—"}</td>
                      <td>{getBusinessTypeLabel(lead.business_type)}</td>
                      <td><span style={websiteBadgeStyle(lead.website_status)}>{lead.website_status}</span></td>
                      <td>
                        <ScoreBandBadge score={lead.score} thresholds={scoreThresholds} />
                      </td>
                      <td>{ownerLabel(lead)}</td>
                      <td>
                        <span style={statusBadgeStyle(lead.is_excluded ? "excluded" : lead.status)}>
                          {(lead.is_excluded ? "excluded" : lead.status).replace(/_/g, " ")}
                        </span>
                        {lead.is_excluded && lead.exclusion_reason && (
                          <span
                            className="ml-1 inline-block rounded px-1.5 py-0.5 text-[0.65rem] font-medium"
                            title={lead.exclusion_reason}
                            style={{ background: "rgba(107,114,128,0.12)", color: "#4b5563" }}
                          >
                            reason
                          </span>
                        )}
                        {lead.enrichment_status === "enriched" && (
                          <span className="ml-1 inline-block rounded px-1.5 py-0.5 text-[0.65rem] font-medium" style={{ background: "rgba(34,197,94,0.1)", color: "#166534" }}>E</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  type="button"
                  className="btn-glass text-xs"
                  disabled={page <= 1}
                  onClick={() => updateFilter("page", String(page - 1))}
                >
                  Previous
                </button>
                <span className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn-glass text-xs"
                  disabled={page >= totalPages}
                  onClick={() => updateFilter("page", String(page + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </PageShell>
  );
}

function ownerLabel(lead: Lead): string {
  if (!lead.assigned_to_user_id) return "Unclaimed";
  return lead.assigned_user_display_name || lead.assigned_user_email || "Assigned";
}
