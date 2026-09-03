"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import { AiVerificationBadge } from "@/components/ai-verification-badge";
import { ManualLeadModal } from "@/components/manual-lead-modal";
import { StatusNotice, type Notice } from "@/components/status-notice";
import { TextPromptDialog } from "@/components/text-prompt-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageShell } from "@/components/page-shell";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { ScoreBandLegend } from "@/components/score-band-legend";
import { bulkArchiveLeadsAction, bulkRestoreArchivedLeadsAction, bulkUpdateLeadStatusAction } from "@/lib/leads/actions";
import { getBusinessTypeLabel } from "@/lib/business-types";
import type { ScoreBandThresholds } from "@/lib/score-bands";
import type { Lead } from "@/lib/db/queries";
import { CsvExportControl, type LeadExportScope } from "./csv-export-control";

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
    archived?: "active" | "archived" | "all";
  };
  scoreThresholds: ScoreBandThresholds;
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
  canExport: boolean;
  exportScope: LeadExportScope | null;
  canClose: boolean;
  canArchive: boolean;
}

const STATUS_FILTER_OPTIONS = ["", "new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost", "excluded"];
const ARCHIVE_FILTER_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];
const BULK_STATUS_OPTIONS = ["new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost"];
const WEBSITE_OPTIONS = ["", "none", "social", "basic", "custom"];

const statusBadgeStyle = (status: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    new: { bg: "rgba(99,102,241,0.16)", color: "var(--text-primary)" },
    verified: { bg: "rgba(34,197,94,0.14)", color: "var(--success-text)" },
    contacted: { bg: "rgba(245,158,11,0.14)", color: "var(--warning-text)" },
    preview_sent: { bg: "rgba(168,85,247,0.16)", color: "var(--text-primary)" },
    meeting_set: { bg: "rgba(14,165,233,0.16)", color: "var(--text-primary)" },
    closed_won: { bg: "rgba(34,197,94,0.16)", color: "var(--success-text)" },
    closed_lost: { bg: "var(--danger-bg)", color: "var(--danger-text)" },
    excluded: { bg: "var(--badge-muted-bg)", color: "var(--badge-muted-text)" },
    archived: { bg: "var(--badge-muted-bg)", color: "var(--badge-muted-text)" },
  };
  const c = colors[status] ?? { bg: "rgba(0,0,0,0.05)", color: "var(--text-secondary)" };
  return { background: c.bg, color: c.color, padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 500 };
};

const websiteBadgeStyle = (ws: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; color: string }> = {
    none: { bg: "var(--danger-bg)", color: "var(--danger-text)" },
    social: { bg: "rgba(245,158,11,0.14)", color: "var(--warning-text)" },
    basic: { bg: "rgba(99,102,241,0.16)", color: "var(--text-primary)" },
    custom: { bg: "rgba(34,197,94,0.14)", color: "var(--success-text)" },
  };
  const c = colors[ws] ?? { bg: "rgba(0,0,0,0.05)", color: "var(--text-secondary)" };
  return { background: c.bg, color: c.color, padding: "2px 8px", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 500 };
};

const CATEGORY_OPTIONS = [
  "dentist","chiropractor","plumber","electrician","hvac_contractor",
  "roofing_contractor","auto_repair","hair_salon","real_estate_agent",
  "restaurant","gym","landscaper","veterinarian","accountant","lawyer",
];

export function LeadsClient({ leads, total, filters, scoreThresholds, businessTypeCounts, canExport, exportScope, canClose, canArchive }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(filters.search ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("verified");
  const [bulkMsg, setBulkMsg] = useState<Notice | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveReasonError, setArchiveReasonError] = useState<string | null>(null);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [manualLeadOpen, setManualLeadOpen] = useState(false);
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

  const applyBulkUpdate = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkUpdateLeadStatusAction(Array.from(selected), bulkStatus) as { count?: number; error?: string };
      if (result.error) {
        setBulkMsg({ text: result.error ?? "Error", tone: "danger" });
        return;
      }
      setBulkMsg({ text: `Updated ${result.count ?? 0} leads to "${bulkStatus.replace(/_/g, " ")}"`, tone: "success" });
      setSelected(new Set());
      setTimeout(() => setBulkMsg(null), 3000);
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkUpdate = () => {
    if (bulkStatus === "closed_won" || bulkStatus === "closed_lost") {
      setStatusConfirmOpen(true);
      return;
    }
    void applyBulkUpdate();
  };

  const handleBulkArchive = async () => {
    if (selected.size === 0) return;
    const reason = archiveReason.trim();
    if (reason.length < 5) {
      setArchiveReasonError("Archive reason must be at least 5 characters.");
      return;
    }
    setBulkBusy(true);
    try {
      const result = await bulkArchiveLeadsAction(Array.from(selected), reason) as { count?: number; error?: string };
      if (result.error) {
        setBulkMsg({ text: result.error ?? "Error", tone: "danger" });
        return;
      }
      setBulkMsg({ text: `Archived ${result.count ?? 0} leads`, tone: "success" });
      setSelected(new Set());
      setArchiveDialogOpen(false);
      setArchiveReason("");
      setArchiveReasonError(null);
      setTimeout(() => setBulkMsg(null), 3000);
      router.refresh();
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const result = await bulkRestoreArchivedLeadsAction(Array.from(selected)) as { count?: number; error?: string };
      if (result.error) {
        setBulkMsg({ text: result.error ?? "Error", tone: "danger" });
        return;
      }
      setBulkMsg({ text: `Restored ${result.count ?? 0} leads`, tone: "success" });
      setSelected(new Set());
      setTimeout(() => setBulkMsg(null), 3000);
      router.refresh();
    } finally {
      setBulkBusy(false);
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
      <section className="glass rounded-2xl p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input
              type="text"
              aria-label="Search leads"
              placeholder="Search name, phone, postal code..."
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

          {canArchive && (
            <button type="button" className="btn-primary text-xs" onClick={() => setManualLeadOpen(true)}>
              Add Lead
            </button>
          )}

          <CsvExportControl
            canExport={canExport}
            exportScope={exportScope}
            searchParams={searchParams}
            className="ml-auto"
          />
          <select
            className="glass-select"
            aria-label="Archive filter"
            value={filters.archived ?? "active"}
            onChange={(e) => updateFilter("archived", e.target.value === "active" ? "" : e.target.value)}
          >
            {ARCHIVE_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
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
          <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl px-3 py-3"
            style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)" }}>
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

        <div className="mb-4">
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
            <button type="button" className="btn-primary text-xs" disabled={bulkBusy} onClick={handleBulkUpdate}>{bulkBusy ? "Applying..." : "Apply Status"}</button>
            {canArchive && filters.archived === "archived" && (
              <button type="button" className="btn-glass text-xs" disabled={bulkBusy} onClick={handleBulkRestore}>Restore selected</button>
            )}
            {canArchive && filters.archived !== "archived" && (
              <button type="button" className="btn-glass text-xs" disabled={bulkBusy} onClick={() => {
                setArchiveReason("");
                setArchiveReasonError(null);
                setArchiveDialogOpen(true);
              }}>Archive selected</button>
            )}
            <button type="button" className="btn-glass text-xs" disabled={bulkBusy} onClick={() => setSelected(new Set())}>Clear</button>
            {bulkMsg && <StatusNotice notice={bulkMsg} compact />}
          </div>
        )}

        {leads.length === 0 ? (
          <div
            className="rounded-xl p-5 text-center text-sm"
            style={{ background: "var(--surface-card)", border: "1px solid var(--surface-card-border)", color: "var(--text-tertiary)" }}
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
                    <th>AI</th>
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
                          prefetch={false}
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
                        <AiVerificationBadge
                          status={lead.ai_verification_status}
                          checkedAt={lead.ai_checked_at}
                          queueStatus={lead.ai_queue_status}
                          viability={lead.ai_website_viability_status}
                          confidence={lead.ai_confidence}
                          compact
                        />
                      </td>
                      <td>
                        <ScoreBandBadge score={lead.score} thresholds={scoreThresholds} />
                      </td>
                      <td>{ownerLabel(lead)}</td>
                      <td>
                        <span style={statusBadgeStyle(lead.archived_at ? "archived" : lead.is_excluded ? "excluded" : lead.status)}>
                          {(lead.archived_at ? "archived" : lead.is_excluded ? "excluded" : lead.status).replace(/_/g, " ")}
                        </span>
                        {lead.archived_at && lead.archive_reason && (
                          <span
                            className="ml-1 inline-block rounded px-1.5 py-0.5 text-[0.65rem] font-medium"
                            title={lead.archive_reason}
                            style={{ background: "var(--badge-muted-bg)", color: "var(--badge-muted-text)" }}
                          >
                            reason
                          </span>
                        )}
                        {lead.is_excluded && lead.exclusion_reason && (
                          <span
                            className="ml-1 inline-block rounded px-1.5 py-0.5 text-[0.65rem] font-medium"
                            title={lead.exclusion_reason}
                            style={{ background: "var(--badge-muted-bg)", color: "var(--badge-muted-text)" }}
                          >
                            reason
                          </span>
                        )}
                        {lead.enrichment_status === "enriched" && (
                          <span className="ml-1 inline-block rounded px-1.5 py-0.5 text-[0.65rem] font-medium" style={{ background: "var(--success-bg)", color: "var(--success-text)" }}>E</span>
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
      <TextPromptDialog
        open={archiveDialogOpen}
        title={`Archive ${selected.size} selected lead${selected.size === 1 ? "" : "s"}?`}
        message="Archived leads leave active inventory but keep their history, outreach, demos, and AI artifacts."
        label="Archive reason"
        value={archiveReason}
        confirmLabel="Archive selected"
        busy={bulkBusy}
        error={archiveReasonError}
        onChange={(value) => {
          setArchiveReason(value);
          setArchiveReasonError(null);
        }}
        onCancel={() => setArchiveDialogOpen(false)}
        onConfirm={handleBulkArchive}
      />
      <ConfirmDialog
        open={statusConfirmOpen}
        title={`Mark ${selected.size} lead${selected.size === 1 ? "" : "s"} ${bulkStatus.replace(/_/g, " ")}?`}
        message="Closing leads changes pipeline reporting and removes them from active outreach views. Confirm the selected rows are correct."
        confirmLabel={`Mark ${bulkStatus.replace(/_/g, " ")}`}
        busy={bulkBusy}
        onCancel={() => setStatusConfirmOpen(false)}
        onConfirm={async () => {
          try {
            await applyBulkUpdate();
          } finally {
            setStatusConfirmOpen(false);
          }
        }}
      />
      <ManualLeadModal open={manualLeadOpen} onClose={() => setManualLeadOpen(false)} />
    </PageShell>
  );
}

function ownerLabel(lead: Lead): string {
  if (!lead.assigned_to_user_id) return "Unclaimed";
  return lead.assigned_user_display_name || lead.assigned_user_email || "Assigned";
}
