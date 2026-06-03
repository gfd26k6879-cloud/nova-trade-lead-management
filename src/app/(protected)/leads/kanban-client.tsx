"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { PageShell } from "@/components/page-shell";
import { AiVerificationBadge } from "@/components/ai-verification-badge";
import { ScoreBandBadge } from "@/components/score-band-badge";
import { ScoreBandLegend } from "@/components/score-band-legend";
import {
  bulkUpdateLeadStatusAction,
  excludeLeadAction,
  restoreExcludedLeadAction,
} from "@/lib/leads/actions";
import { getBusinessTypeLabel } from "@/lib/business-types";
import type { ScoreBandThresholds } from "@/lib/score-bands";

interface Lead {
  id: string;
  name: string | null;
  phone: string | null;
  rating: number | null;
  review_count: number | null;
  website_status: string;
  score: number;
  status: string;
  is_excluded: boolean;
  exclusion_reason: string | null;
  enrichment_status: string;
  primary_type: string | null;
  business_type: string;
  ai_verification_status: string;
  ai_checked_at: string | null;
  ai_queue_status: string;
  ai_website_viability_status: string | null;
  ai_confidence: number;
  assigned_to_user_id: string | null;
  assigned_user_email: string | null;
  assigned_user_display_name: string | null;
}

const STATUS_COLUMNS = [
  { key: "new", label: "New" },
  { key: "verified", label: "Verified" },
  { key: "contacted", label: "Contacted" },
  { key: "preview_sent", label: "Preview Sent" },
  { key: "meeting_set", label: "Meeting Set" },
  { key: "closed_won", label: "Closed Won" },
  { key: "closed_lost", label: "Closed Lost" },
  { key: "excluded", label: "Excluded" },
];

const STATUS_COLORS: Record<string, string> = {
  new: "#6366f1",
  verified: "#16a34a",
  contacted: "#d97706",
  preview_sent: "#9333ea",
  meeting_set: "#0284c7",
  closed_won: "#15803d",
  closed_lost: "#dc2626",
  excluded: "#4b5563",
};

const WEBSITE_BADGE: Record<string, { bg: string; color: string }> = {
  none: { bg: "rgba(239,68,68,0.1)", color: "#dc2626" },
  social: { bg: "rgba(245,158,11,0.1)", color: "#d97706" },
  basic: { bg: "rgba(99,102,241,0.1)", color: "#6366f1" },
  custom: { bg: "rgba(34,197,94,0.1)", color: "#16a34a" },
};

interface Props {
  leads: Lead[];
  total: number;
  displayLimit: number;
  scoreThresholds: ScoreBandThresholds;
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
  canExport: boolean;
  canClose: boolean;
}

const COLUMN_SCROLL_HEIGHT = 460;
const CARD_ROW_HEIGHT = 122;
const VIRTUALIZE_THRESHOLD = 35;
const VIRTUAL_OVERSCAN = 4;
const STATUS_COLUMN_KEYS = new Set(STATUS_COLUMNS.map((col) => col.key));
const KANBAN_EXCLUSION_REASON = "Excluded from Kanban board";

function resolveKanbanExclusionReason(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return KANBAN_EXCLUSION_REASON;
  if (trimmed.length >= 5) return trimmed;
  return `${KANBAN_EXCLUSION_REASON}: ${trimmed}`;
}

function groupLeadsByStatus(leads: Lead[]): Record<string, Lead[]> {
  const grouped: Record<string, Lead[]> = {};
  for (const col of STATUS_COLUMNS) grouped[col.key] = [];
  for (const lead of leads) {
    if (lead.is_excluded) {
      grouped.excluded.push(lead);
      continue;
    }
    if (grouped[lead.status]) grouped[lead.status].push(lead);
  }
  return grouped;
}

export function KanbanClient({ leads, total, displayLimit, scoreThresholds, businessTypeCounts, canExport, canClose }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupedFromServer = useMemo(() => groupLeadsByStatus(leads), [leads]);
  const [columns, setColumns] = useState<Record<string, Lead[]>>(groupedFromServer);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [limitNoticeDismissed, setLimitNoticeDismissed] = useState(false);

  useEffect(() => {
    setColumns(groupedFromServer);
  }, [groupedFromServer]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const leadById = useMemo(() => {
    const map = new Map<string, Lead>();
    for (const lane of Object.values(columns)) {
      for (const lead of lane) map.set(lead.id, lead);
    }
    return map;
  }, [columns]);

  const activeLead = activeId ? leadById.get(activeId) ?? null : null;

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === "view") {
        if (value === "kanban") params.set("view", "kanban");
        else params.delete("view");
      } else {
        if (value) params.set(key, value);
        else params.delete(key);
        params.set("view", "kanban");
      }
      const nextQuery = params.toString();
      router.push(nextQuery ? `/leads?${nextQuery}` : "/leads");
    },
    [router, searchParams],
  );

  const moveLeadLocally = useCallback((lead: Lead, nextStatus: string, nextExcluded: boolean) => {
    setColumns((prev) => {
      const next: Record<string, Lead[]> = { ...prev };
      for (const col of STATUS_COLUMNS) {
        next[col.key] = (next[col.key] ?? []).filter((item) => item.id !== lead.id);
      }
      const destination = nextExcluded ? "excluded" : nextStatus;
      const movedLead = { ...lead, status: nextStatus, is_excluded: nextExcluded };
      next[destination] = [...(next[destination] ?? []), movedLead];
      return next;
    });
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const overId = String(over.id);
    if (!STATUS_COLUMN_KEYS.has(overId)) return;
    const newStatus = overId;
    if (!canClose && (newStatus === "closed_won" || newStatus === "closed_lost" || newStatus === "excluded")) {
      toast.error("Only admins can close or exclude leads");
      return;
    }

    const lead = leadById.get(leadId);
    if (!lead) return;

    if (newStatus === "excluded") {
      if (lead.is_excluded) return;

      const inputReason = window.prompt(
        `Optional reason for excluding "${lead.name ?? "this lead"}".\nLeave blank to use default reason, or press Cancel to keep it in the current lane.`,
        "",
      );
      if (inputReason === null) {
        toast.info("Exclude cancelled");
        return;
      }
      const exclusionReason = resolveKanbanExclusionReason(inputReason);

      moveLeadLocally(lead, lead.status, true);
      const excluded = await excludeLeadAction(leadId, exclusionReason);
      if ("error" in excluded) {
        toast.error(excluded.error ?? "Failed to exclude lead");
        router.refresh();
      } else {
        toast.success("Lead moved to excluded");
      }
      return;
    }

    if (lead.is_excluded) {
      moveLeadLocally(lead, newStatus, false);

      const restored = await restoreExcludedLeadAction(leadId);
      if ("error" in restored) {
        toast.error(restored.error ?? "Failed to restore excluded lead");
        router.refresh();
        return;
      }

      if (lead.status !== newStatus) {
        const statusUpdate = await bulkUpdateLeadStatusAction([leadId], newStatus);
        if ("error" in statusUpdate) {
          toast.error(statusUpdate.error ?? "Failed to update status");
          router.refresh();
          return;
        }
      }

      toast.success(`Moved to ${newStatus.replace(/_/g, " ")}`);
      return;
    }

    if (lead.status === newStatus) return;

    moveLeadLocally(lead, newStatus, false);

    const result = await bulkUpdateLeadStatusAction([leadId], newStatus);
    if ("error" in result) {
      toast.error(result.error ?? "Failed to update status");
      router.refresh();
    } else {
      toast.success(`Moved to ${newStatus.replace(/_/g, " ")}`);
    }
  };

  const isCapped = total > leads.length;

  return (
    <PageShell
      title="Leads"
      description="Drag leads between columns to update status."
      stats={[{ label: "Total Leads", value: String(total) }]}
    >
      {isCapped && !limitNoticeDismissed && (
        <div
          className="mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs"
          style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)", color: "#92400e" }}
        >
          <span>
            Showing the top {displayLimit} leads in Kanban for speed. Narrow filters or switch to table view for the full list.
          </span>
          <button type="button" className="btn-glass text-xs" onClick={() => setLimitNoticeDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-glass text-xs"
          onClick={() => updateFilter("view", "table")}
        >
          Switch to Table
        </button>
        <select
          className="glass-select text-xs"
          aria-label="Business type"
          value={searchParams.get("businessType") ?? ""}
          onChange={(e) => updateFilter("businessType", e.target.value)}
        >
          <option value="">All business types</option>
          {businessTypeCounts.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label} ({type.active})
            </option>
          ))}
        </select>
        {canExport && (
          <a
            href={`/api/export/csv?${searchParams.toString()}`}
            className="btn-glass text-xs ml-auto"
            download
          >
            Export CSV
          </a>
        )}
      </div>

      <div className="mb-4">
        <ScoreBandLegend thresholds={scoreThresholds} />
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "60vh" }}>
          {STATUS_COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              id={col.key}
              label={col.label}
              color={STATUS_COLORS[col.key]}
              leads={columns[col.key] ?? []}
              scoreThresholds={scoreThresholds}
              droppable
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead && <LeadCard lead={activeLead} scoreThresholds={scoreThresholds} isDragging />}
        </DragOverlay>
      </DndContext>
    </PageShell>
  );
}

function KanbanColumn({
  id,
  label,
  color,
  leads,
  scoreThresholds,
  droppable = true,
}: {
  id: string;
  label: string;
  color: string;
  leads: Lead[];
  scoreThresholds: ScoreBandThresholds;
  droppable?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: !droppable });
  const [scrollTop, setScrollTop] = useState(0);
  const shouldVirtualize = leads.length > VIRTUALIZE_THRESHOLD;
  const startIndex = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / CARD_ROW_HEIGHT) - VIRTUAL_OVERSCAN)
    : 0;
  const visibleCount = shouldVirtualize
    ? Math.ceil(COLUMN_SCROLL_HEIGHT / CARD_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2
    : leads.length;
  const endIndex = shouldVirtualize
    ? Math.min(leads.length, startIndex + visibleCount)
    : leads.length;
  const visibleLeads = useMemo(
    () => leads.slice(startIndex, endIndex),
    [leads, startIndex, endIndex],
  );

  return (
    <div
      ref={setNodeRef}
      data-kanban-column={id}
      className="flex min-w-52 flex-shrink-0 flex-col rounded-2xl p-3 transition-colors"
      style={{
        background: isOver && droppable ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.25)",
        border: `1px solid ${isOver && droppable ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.35)"}`,
        width: "14.28%",
        minWidth: "180px",
      }}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-xs font-semibold" style={{ color }}>{label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
          style={{ background: `${color}18`, color }}
        >
          {leads.length}
        </span>
      </div>
      <div
        className="overflow-y-auto"
        style={{ maxHeight: `${COLUMN_SCROLL_HEIGHT}px` }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        {shouldVirtualize ? (
          <div style={{ height: `${leads.length * CARD_ROW_HEIGHT}px`, position: "relative" }}>
            {visibleLeads.map((lead, idx) => (
              <div
                key={lead.id}
                style={{
                  position: "absolute",
                  top: `${(startIndex + idx) * CARD_ROW_HEIGHT}px`,
                  left: 0,
                  right: 0,
                  paddingBottom: "8px",
                }}
              >
                {droppable ? (
                  <DraggableCard lead={lead} scoreThresholds={scoreThresholds} />
                ) : (
                  <LeadCard lead={lead} scoreThresholds={scoreThresholds} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {leads.map((lead) => (
              droppable ? (
                <DraggableCard key={lead.id} lead={lead} scoreThresholds={scoreThresholds} />
              ) : (
                <LeadCard key={lead.id} lead={lead} scoreThresholds={scoreThresholds} />
              )
            ))}
          </div>
        )}
        {leads.length === 0 && (
          <div className="rounded-lg p-3 text-center text-xs" style={{ color: "var(--text-tertiary)", border: "1px dashed rgba(0,0,0,0.1)" }}>
            {droppable ? "Drop here" : "No leads"}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({ lead, scoreThresholds }: { lead: Lead; scoreThresholds: ScoreBandThresholds }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });

  return (
    <div
      ref={setNodeRef}
      data-lead-card-id={lead.id}
      {...listeners}
      {...attributes}
      style={{
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        opacity: isDragging ? 0.4 : 1,
      }}
    >
      <LeadCard lead={lead} scoreThresholds={scoreThresholds} />
    </div>
  );
}

function LeadCard({ lead, scoreThresholds, isDragging }: { lead: Lead; scoreThresholds: ScoreBandThresholds; isDragging?: boolean }) {
  const wb = WEBSITE_BADGE[lead.website_status] ?? WEBSITE_BADGE.custom;

  return (
    <div
      className="rounded-xl p-3 transition-shadow"
      style={{
        background: "rgba(255,255,255,0.6)",
        border: "1px solid rgba(255,255,255,0.5)",
        backdropFilter: "blur(8px)",
        boxShadow: isDragging ? "0 8px 24px rgba(0,0,0,0.15)" : "0 1px 3px rgba(0,0,0,0.06)",
        cursor: "grab",
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <Link
          href={`/leads/${lead.id}`}
          prefetch={false}
          className="text-xs font-semibold leading-tight"
          style={{ color: "var(--text-primary)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {lead.name ?? "Unknown"}
        </Link>
        <ScoreBandBadge score={lead.score} thresholds={scoreThresholds} compact />
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {lead.is_excluded && (
          <span
            className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium"
            title={lead.exclusion_reason ?? "Excluded from scoring and queue"}
            style={{ background: "rgba(107,114,128,0.12)", color: "#4b5563" }}
          >
            excluded
          </span>
        )}
        {lead.business_type && (
          <span className="text-[0.6rem]" style={{ color: "var(--text-tertiary)" }}>
            {getBusinessTypeLabel(lead.business_type)}
          </span>
        )}
        <span
          className="rounded px-1.5 py-0.5 text-[0.6rem] font-medium"
          style={{ background: wb.bg, color: wb.color }}
        >
          {lead.website_status}
        </span>
        <AiVerificationBadge
          status={lead.ai_verification_status}
          checkedAt={lead.ai_checked_at}
          queueStatus={lead.ai_queue_status}
          viability={lead.ai_website_viability_status}
          confidence={lead.ai_confidence}
          compact
        />
        {lead.rating != null && (
          <span className="text-[0.6rem]" style={{ color: "var(--text-tertiary)" }}>
            {lead.rating.toFixed(1)}*
          </span>
        )}
      </div>
      {lead.phone && (
        <p className="mt-1 text-[0.65rem]" style={{ color: "var(--text-secondary)" }}>
          {lead.phone}
        </p>
      )}
      <p className="mt-1 text-[0.62rem]" style={{ color: "var(--text-tertiary)" }}>
        {lead.assigned_to_user_id ? `Owner: ${lead.assigned_user_display_name || lead.assigned_user_email || "Assigned"}` : "Unclaimed"}
      </p>
    </div>
  );
}
