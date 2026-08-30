import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { KanbanClient } from "@/app/(protected)/leads/kanban-client";
import { getDefaultScoreBandThresholds } from "@/lib/score-bands";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/leads/actions", () => ({
  bulkUpdateLeadStatusAction: vi.fn(),
  excludeLeadAction: vi.fn(),
  restoreExcludedLeadAction: vi.fn(),
}));

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    name: "Alpha Dental",
    phone: "303-555-0100",
    rating: 4.7,
    review_count: 28,
    website_status: "none",
    score: 82,
    status: "new",
    is_excluded: false,
    exclusion_reason: null,
    enrichment_status: "pending",
    primary_type: "dentist",
    business_type: "dental",
    ai_verification_status: "not_checked",
    ai_checked_at: null,
    ai_queue_status: "queued",
    ai_website_viability_status: null,
    ai_confidence: 0,
    assigned_to_user_id: null,
    assigned_user_email: null,
    assigned_user_display_name: null,
    ...overrides,
  };
}

describe("KanbanClient", () => {
  it("renders a keyboard-usable per-card status move control", () => {
    const html = renderToStaticMarkup(
      <KanbanClient
        leads={[makeLead() as never]}
        total={1}
        displayLimit={200}
        scoreThresholds={getDefaultScoreBandThresholds()}
        businessTypeCounts={[]}
        canExport={false}
        exportScope={null}
        canClose
      />,
    );

    expect(html).toContain('aria-label="Move Alpha Dental to another status"');
    expect(html).toContain('<option value="new" selected="">New</option>');
    expect(html).toContain('<option value="verified">Verified</option>');
    expect(html).toContain('<option value="closed_won">Closed Won</option>');
    expect(html).toContain('<option value="excluded">Excluded</option>');
  });
});
