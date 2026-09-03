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
import { TextPromptDialog } from "@/components/text-prompt-dialog";
import {
  bulkUpdateLeadStatusAction,
  excludeLeadAction,
  restoreExcludedLeadAction,
} from "@/lib/leads/actions";
import { getBusinessTypeLabel } from "@/lib/business-types";
import type { ScoreBandThresholds } from "@/lib/score-bands";
import type { KanbanLead } from "@/lib/db/queries";
import { CsvExportControl, type LeadExportScope } from "./csv-export-control";

type Lead = KanbanLead;

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

interface StatusColumnStyle {
  color: string;
  background: string;
  border: string;
}

const STATUS_STYLES: Record<string, StatusColumnStyle> = {
  new: { color: "var(--info-text)", background: "var(--info-bg)", border: "var(--info-border)" },
  verified: { color: "var(--success-text)", background: "var(--success-bg)", border: "var(--success-border)" },
  contacted: { color: "var(--warning-text)", background: "var(--warning-bg)", border: "var(--warning-border)" },
  preview_sent: { color: "var(--score-hot-text)", background: "var(--score-hot-bg)", border: "var(--score-hot-border)" },
  meeting_set: { color: "var(--score-good-text)", background: "var(--score-good-bg)", border: "var(--score-good-border)" },
  closed_won: { color: "var(--score-win-text)", background: "var(--score-win-bg)", border: "var(--score-win-border)" },
  closed_lost: { color: "var(--danger-text)", background: "var(--danger-bg)", border: "var(--danger-border)" },
  excluded: { color: "var(--status-muted-text)", background: "var(--status-muted-bg)", border: "var(--status-muted-border)" },
};

const WEBSITE_BADGE: Record<string, { bg: string; color: string }> = {
  none: { bg: "var(--danger-bg)", color: "var(--danger-text)" },
  social: { bg: "var(--warning-bg)", color: "var(--warning-text)" },
  basic: { bg: "var(--info-bg)", color: "var(--info-text)" },
  custom: { bg: "var(--success-bg)", color: "var(--success-text)" },
};

interface Props {
  leads: Lead[];
  total: number;
  displayLimit: number;
  scoreThresholds: ScoreBandThresholds;
  businessTypeCounts: Array<{ id: string; label: string; total: number; active: number }>;
  canExport: boolean;
  exportScope: LeadExportScope | null;
  canClose: boolean;
}

const COLUMN_SCROLL_HEIGHT = 460;
const CARD_ROW_HEIGHT = 156;
const VIRTUALIZE_THRESHOLD = 35;
const VIRTUAL_OVERSCAN = 4;
const STATUS_COLUMN_KEYS = new Set(STATUS_COLUMNS.map((col) => col.key));
const KANBAN_EXCLUSION_REASON = "Excluded from Kanban board";

function statusLabel(status: string): string {
  return STATUS_COLUMNS.find((col) => col.key === status)?.label ?? status.replace(/_/g, " ");
}

function isRestrictedCloseStatus(status: string): boolean {
  return status === "closed_won" || status === "closed_lost" || status === "excluded";
}

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

export function KanbanClient({ leads, total, displayLimit, scoreThresholds, businessTypeCounts, canExport, exportScope, canClose }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupedFromServer = useMemo(() => groupLeadsByStatus(leads), [leads]);
  const [columns, setColumns] = useState<Record<string, Lead[]>>(groupedFromServer);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [limitNoticeDismissed, setLimitNoticeDismissed] = useState(false);
  const [exclusionTarget, setExclusionTarget] = useState<Lead | null>(null);
  const [exclusionReason, setExclusionReason] = useState("");
  const [exclusionError, setExclusionError] = useState<string | null>(null);
  const [exclusionBusy, setExclusionBusy] = useState(false);

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

  const moveLeadToStatus = useCallback(async (leadId: string, newStatus: string) => {
    if (!STATUS_COLUMN_KEYS.has(newStatus)) return;
    const lead = leadById.get(leadId);
    if (!lead) return;
    const currentStatus = lead.is_excluded ? "excluded" : lead.status;
    if (currentStatus === newStatus) return;

    if (!canClose && isRestrictedCloseStatus(newStatus)) {
      toast.error("Only admins can close or exclude leads");
      return;
    }

    if (newStatus === "excluded") {
      setExclusionTarget(lead);
      setExclusionReason("");
      setExclusionError(null);
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

      toast.success(`Moved to ${statusLabel(newStatus)}`);
      return;
    }

    moveLeadLocally(lead, newStatus, false);

    const result = await bulkUpdateLeadStatusAction([leadId], newStatus);
    if ("error" in result) {
      toast.error(result.error ?? "Failed to update status");
      router.refresh();
    } else {
      toast.success(`Moved to ${statusLabel(newStatus)}`);
    }
  }, [canClose, leadById, moveLeadLocally, router]);

  const confirmExclusion = useCallback(async () => {
    if (!exclusionTarget || exclusionBusy) return;
    setExclusionBusy(true);
    setExclusionError(null);
    const reason = resolveKanbanExclusionReason(exclusionReason);
    moveLeadLocally(exclusionTarget, exclusionTarget.status, true);
    const excluded = await excludeLeadAction(exclusionTarget.id, reason);
    if ("error" in excluded) {
      const message = excluded.error ?? "Failed to exclude lead";
      setExclusionError(message);
      toast.error(message);
      router.refresh();
      setExclusionBusy(false);
      return;
    }
    toast.success("Lead moved to excluded");
    setExclusionTarget(null);
    setExclusionReason("");
    setExclusionBusy(false);
  }, [exclusionBusy, exclusionReason, exclusionTarget, moveLeadLocally, router]);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const overId = String(over.id);
    await moveLeadToStatus(leadId, overId);
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
          style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", color: "var(--warning-text)" }}
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
        <CsvExportControl
          canExport={canExport}
          exportScope={exportScope}
          searchParams={searchParams}
          className="ml-auto"
        />
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
              tone={STATUS_STYLES[col.key]}
              leads={columns[col.key] ?? []}
              scoreThresholds={scoreThresholds}
              canClose={canClose}
              onMoveLead={moveLeadToStatus}
              droppable
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead && <LeadCard lead={activeLead} scoreThresholds={scoreThresholds} isDragging />}
        </DragOverlay>
      </DndContext>

      <TextPromptDialog
        open={Boolean(exclusionTarget)}
        title="Exclude lead"
        message={`Move ${exclusionTarget?.name ?? "this lead"} out of the active Kanban workflow. Leave the reason blank to use the standard exclusion note.`}
        label="Exclusion reason (optional)"
        value={exclusionReason}
        confirmLabel="Exclude lead"
        busy={exclusionBusy}
        error={exclusionError}
        onChange={setExclusionReason}
        onConfirm={confirmExclusion}
        onCancel={() => {
          if (exclusionBusy) return;
          setExclusionTarget(null);
          setExclusionReason("");
          setExclusionError(null);
        }}
      />
    </PageShell>
  );
}

function KanbanColumn({
  id,
  label,
  tone,
  leads,
  scoreThresholds,
  canClose,
  onMoveLead,
  droppable = true,
}: {
  id: string;
  label: string;
  tone: StatusColumnStyle;
  leads: Lead[];
  scoreThresholds: ScoreBandThresholds;
  canClose: boolean;
  onMoveLead?: (leadId: string, status: string) => void | Promise<void>;
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
        background: isOver && droppable ? "var(--info-bg)" : "var(--surface-card)",
        border: `1px solid ${isOver && droppable ? "var(--info-border)" : "var(--surface-card-border)"}`,
        width: "14.28%",
        minWidth: "180px",
      }}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-xs font-semibold" style={{ color: tone.color }}>{label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-[0.65rem] font-medium"
          style={{ background: tone.background, border: `1px solid ${tone.border}`, color: tone.color }}
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
                  <DraggableCard lead={lead} scoreThresholds={scoreThresholds} canClose={canClose} onMoveLead={onMoveLead} />
                ) : (
                  <LeadCard lead={lead} scoreThresholds={scoreThresholds} canClose={canClose} onMoveLead={onMoveLead} />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {leads.map((lead) => (
              droppable ? (
                <DraggableCard key={lead.id} lead={lead} scoreThresholds={scoreThresholds} canClose={canClose} onMoveLead={onMoveLead} />
              ) : (
                <LeadCard key={lead.id} lead={lead} scoreThresholds={scoreThresholds} canClose={canClose} onMoveLead={onMoveLead} />
              )
            ))}
          </div>
        )}
        {leads.length === 0 && (
          <div className="rounded-lg p-3 text-center text-xs" style={{ color: "var(--text-tertiary)", border: "1px dashed var(--glass-border)" }}>
            {droppable ? "Drop here" : "No leads"}
          </div>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  lead,
  scoreThresholds,
  canClose,
  onMoveLead,
}: {
  lead: Lead;
  scoreThresholds: ScoreBandThresholds;
  canClose: boolean;
  onMoveLead?: (leadId: string, status: string) => void | Promise<void>;
}) {
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
      <LeadCard lead={lead} scoreThresholds={scoreThresholds} canClose={canClose} onMoveLead={onMoveLead} />
    </div>
  );
}

function LeadCard({
  lead,
  scoreThresholds,
  isDragging,
  canClose = true,
  onMoveLead,
}: {
  lead: Lead;
  scoreThresholds: ScoreBandThresholds;
  isDragging?: boolean;
  canClose?: boolean;
  onMoveLead?: (leadId: string, status: string) => void | Promise<void>;
}) {
  const wb = WEBSITE_BADGE[lead.website_status] ?? WEBSITE_BADGE.custom;
  const currentStatus = lead.is_excluded ? "excluded" : lead.status;
  const leadName = lead.name ?? "lead";

  return (
    <div
      className="rounded-xl p-3 transition-shadow"
      style={{
        background: "var(--glass-bg-heavy)",
        border: "1px solid var(--glass-border)",
        backdropFilter: "blur(8px)",
        boxShadow: isDragging ? "var(--glass-shadow-lg)" : "var(--glass-shadow)",
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
            style={{ background: "var(--status-muted-bg)", color: "var(--status-muted-text)" }}
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
      {onMoveLead && (
        <select
          className="glass-select mt-2 w-full text-[0.65rem]"
          value={currentStatus}
          aria-label={`Move ${leadName} to another status`}
          style={{ cursor: "default" }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => void onMoveLead(lead.id, event.target.value)}
        >
          {STATUS_COLUMNS.map((status) => {
            const restricted = !canClose && isRestrictedCloseStatus(status.key) && status.key !== currentStatus;
            return (
              <option key={status.key} value={status.key} disabled={restricted}>
                {status.label}
              </option>
            );
          })}
        </select>
      )}
    </div>
  );
}
