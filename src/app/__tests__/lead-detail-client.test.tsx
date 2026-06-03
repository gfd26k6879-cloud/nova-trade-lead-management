import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/admin-requests/actions", () => ({
  createAdminRequestAction: vi.fn(),
}));

vi.mock("@/lib/leads/actions", () => ({
  updateLeadStatusAction: vi.fn(),
  updateLeadNotesAction: vi.fn(),
  updateLeadReminderAction: vi.fn(),
  excludeLeadAction: vi.fn(),
  restoreExcludedLeadAction: vi.fn(),
  archiveLeadAction: vi.fn(),
  restoreArchivedLeadAction: vi.fn(),
  logOutreachEventAction: vi.fn(),
  markLeadRepliedAction: vi.fn(),
  markMeetingBookedAction: vi.fn(),
  generateOutreachPackageAction: vi.fn(),
  createDemoForLeadAction: vi.fn(),
  updateLeadVerificationAction: vi.fn(),
  runAiVerificationAction: vi.fn(),
  applyAiRecommendationAction: vi.fn(),
  repairLeadAiWebsiteViabilityAction: vi.fn(),
  addLeadNoteAction: vi.fn(),
  claimLeadAction: vi.fn(),
  unclaimLeadAction: vi.fn(),
  markLeadQualityBucketAction: vi.fn(),
  updateLeadPhoneVerificationStatusAction: vi.fn(),
  queueLeadAiArtifactAction: vi.fn(),
  queueLeadPitchPackAction: vi.fn(),
  updateLeadAiFeedbackAction: vi.fn(),
}));

import { ArchiveConfirmDialog, LeadDetailClient } from "@/app/(protected)/leads/[id]/lead-detail-client";

function renderLead(overrides: Record<string, unknown> = {}) {
  const lead = {
    id: "lead-1",
    place_id: "manual:test",
    name: "Manual Test Lead",
    address: "123 Test St",
    phone: "303-555-0100",
    categories: [],
    rating: null,
    review_count: 0,
    website_uri: null,
    website_status: "none",
    maps_uri: null,
    business_status: null,
    price_level: null,
    photo_count: 0,
    has_opening_hours: false,
    primary_type: null,
    score: 0,
    status: "new",
    is_excluded: false,
    exclusion_reason: null,
    excluded_at: null,
    archived_at: null,
    archived_by_user_id: null,
    archive_reason: "",
    selling_niche: "local_services",
    business_type: "local_services",
    win_probability_score: 61,
    lead_quality_score: 62,
    quality_bucket: "needs_ai_verify",
    easy_build_score: 72,
    cash_speed_score: 88,
    need_score: 28,
    quality_reason: "Needs AI verification.",
    recommended_offer: "booking ready site",
    next_best_action: "Run AI verification.",
    phone_verification_status: "unknown",
    ai_verification_status: "not_checked",
    ai_confidence: 0,
    ai_found_website_url: null,
    ai_recommendation: null,
    ai_summary: null,
    ai_checked_at: null,
    ai_website_viability_status: null,
    ai_website_health: null,
    ai_queue_status: "queued",
    raw_opportunity_score: 0,
    verification_score: 5,
    sales_priority_score: 24,
    pitch_outcome: null,
    objection_reason: null,
    decision_maker_reached: false,
    quoted_amount: 0,
    close_value: 0,
    demo_sent_at: null,
    ai_website_feedback_status: null,
    ai_corrected_website_url: null,
    ai_false_positive_reason: null,
    ai_reviewer_notes: null,
    ai_feedback_at: null,
    qualification_status: "needs_verification",
    disqualification_reason: null,
    website_verified_at: null,
    contactability_score: 85,
    estimated_deal_value: 2875,
    notes: null,
    reminder_date: null,
    enrichment_status: "pending",
    enriched_at: null,
    assigned_to_user_id: null,
    assigned_user_email: null,
    assigned_user_display_name: null,
    first_contact_at: null,
    first_reply_at: null,
    meeting_booked_at: null,
    last_contacted_at: null,
    created_at: "2026-06-02T00:00:00.000Z",
    updated_at: "2026-06-02T00:00:00.000Z",
    discovered_at: "2026-06-02T00:00:00.000Z",
    ...overrides,
  };

  return renderToStaticMarkup(
    <LeadDetailClient
      lead={lead as never}
      initialEvents={[]}
      initialAdminRequests={[]}
      initialLeadNotes={[]}
      initialDemo={null}
      initialAiVerification={null}
      initialAiArtifacts={[]}
      scoreThresholds={{ high: 20, medium: 10 }}
      currentUser={{ userId: "admin-1", email: "admin@example.com", role: "admin" }}
    />,
  );
}

describe("LeadDetailClient archive UX", () => {
  it("keeps archive disabled until a reason is long enough", () => {
    const html = renderLead({ archive_reason: "" });

    expect(html).toContain("Archive reason");
    expect(html).toContain("Enter at least 5 characters to enable Archive Lead.");
    expect(html).toContain("Archive active lead");
    expect(html).toContain("disabled");
  });

  it("shows restore controls for archived leads", () => {
    const html = renderLead({
      archived_at: "2026-06-02T20:17:00.000Z",
      archive_reason: "duplicate lead",
    });

    expect(html).toContain("Archived");
    expect(html).toContain("duplicate lead");
    expect(html).toContain("Restore to active inventory");
  });

  it("renders the custom archive confirmation modal", () => {
    const html = renderToStaticMarkup(
      <ArchiveConfirmDialog
        open
        leadName="Manual Test Lead"
        reason="duplicate lead"
        loading={false}
        onCancel={() => undefined}
        onConfirm={() => undefined}
      />,
    );

    expect(html).toContain("Archive lead?");
    expect(html).toContain("Manual Test Lead");
    expect(html).toContain("duplicate lead");
    expect(html).toContain("Archive lead");
  });
});
