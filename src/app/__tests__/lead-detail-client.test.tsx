import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getDefaultScoreBandThresholds } from "@/lib/score-bands";

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
  runResearcherAiCheckAction: vi.fn(),
  applyAiRecommendationAction: vi.fn(),
  repairLeadAiWebsiteViabilityAction: vi.fn(),
  addLeadNoteAction: vi.fn(),
  claimLeadAction: vi.fn(),
  unclaimLeadAction: vi.fn(),
  markLeadQualityBucketAction: vi.fn(),
  updateLeadPhoneVerificationStatusAction: vi.fn(),
  queueLeadAiArtifactAction: vi.fn(),
  queueLeadPitchPackAction: vi.fn(),
  generateResearcherPitchPackAction: vi.fn(),
  updateLeadAiFeedbackAction: vi.fn(),
  submitResearcherAiFeedbackAction: vi.fn(),
}));

import { ArchiveConfirmDialog, LeadDetailClient } from "@/app/(protected)/leads/[id]/lead-detail-client";

function renderLead(
  overrides: Record<string, unknown> = {},
  currentUser: { userId: string; email: string; role: "admin" | "researcher" } = {
    userId: "admin-1",
    email: "admin@example.com",
    role: "admin",
  },
  related: {
    events?: Array<Record<string, unknown>>;
    leadNotes?: Array<Record<string, unknown>>;
    initialAiVerification?: Record<string, unknown> | null;
    initialAiArtifacts?: Array<Record<string, unknown>>;
    initialTab?: "work" | "overview" | "verification" | "intelligence" | "admin";
  } = {},
) {
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
      initialEvents={(related.events ?? []) as never}
      initialAdminRequests={[]}
      initialLeadNotes={(related.leadNotes ?? []) as never}
      initialDemo={null}
      initialAiVerification={(related.initialAiVerification ?? null) as never}
      initialAiArtifacts={(related.initialAiArtifacts ?? []) as never}
      scoreThresholds={getDefaultScoreBandThresholds()}
      currentUser={currentUser}
      initialTab={related.initialTab}
    />,
  );
}

describe("LeadDetailClient archive UX", () => {
  it("defaults to the Work tab and renders the compact call brief", () => {
    const html = renderLead({ archive_reason: "" });

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("Lead workbench");
    expect(html).toContain("Website finding");
    expect(html).toContain("AI confidence");
    expect(html).toContain("Rating / reviews");
    expect(html).toContain("Call presets");
    expect(html).toContain("No answer");
    expect(html).toContain("Spoke to owner");
    expect(html).toContain("Send preview");
    expect(html).toContain("Recent activity");
  });

  it("labels recent outreach activity with the actual channel", () => {
    const html = renderLead(
      {},
      { userId: "admin-1", email: "admin@example.com", role: "admin" },
      {
        events: [
          {
            id: "event-1",
            lead_id: "lead-1",
            channel: "text",
            actor_email: "admin@example.com",
            contact_person_name: "Jamie",
            contact_person_role: "Owner",
            decision_maker_reached: true,
            outcome: "follow_up_needed",
            objection_reason: null,
            quoted_amount: 0,
            close_value: 0,
            follow_up_at: null,
            next_step: "Follow up tomorrow",
            note: "Sent preview link.",
            created_at: "2026-06-02T01:00:00.000Z",
          },
        ],
      },
    );

    expect(html).toContain(">text</span>");
    expect(html).not.toContain(">outreach</span>");
  });

  it("keeps secondary capabilities discoverable without rendering admin controls by default", () => {
    const html = renderLead({ archive_reason: "" });

    expect(html).toContain("Overview");
    expect(html).toContain("Verification");
    expect(html).toContain("Intelligence");
    expect(html).toContain("Admin");
    expect(html).not.toContain("Archive reason");
    expect(html).not.toContain("Archive active lead");
    expect(html).not.toContain("Lead Archive");
  });

  it("shows archived state without exposing restore controls on the default tab", () => {
    const html = renderLead({
      archived_at: "2026-06-02T20:17:00.000Z",
      archive_reason: "duplicate lead",
    });

    expect(html).toContain("Archived");
    expect(html).toContain("duplicate lead");
    expect(html).not.toContain("Restore to active inventory");
  });

  it("warns an unclaimed researcher before editing workflow data", () => {
    const html = renderLead(
      {},
      { userId: "researcher-1", email: "researcher@example.com", role: "researcher" },
    );

    expect(html).toContain("Claim this lead before changing workflow, notes, follow-ups, or contact history.");
  });

  it("keeps admin AI verification controls on the verification tab", () => {
    const html = renderLead({}, { userId: "admin-1", email: "admin@example.com", role: "admin" }, { initialTab: "verification" });

    expect(html).toContain("Run AI Verify");
    expect(html).toContain("Refresh");
    expect(html).toContain("Re-check Website Viability");
    expect(html).toContain("Advanced AI Accuracy Feedback");
  });

  it("renders researcher-safe AI check controls without admin-only actions", () => {
    const html = renderLead(
      { assigned_to_user_id: "researcher-1", assigned_user_email: "researcher@example.com" },
      { userId: "researcher-1", email: "researcher@example.com", role: "researcher" },
      { initialTab: "verification" },
    );

    expect(html).toContain("Website correction");
    expect(html).toContain("Official website found");
    expect(html).toContain("Candidate website - review");
    expect(html).toContain("Save website correction");
    expect(html).toContain("Run AI check");
    expect(html).toContain("AI checks create advisory evidence");
    expect(html).not.toContain("Run AI Verify");
    expect(html).not.toContain("Re-check Website Viability");
    expect(html).not.toContain("Advanced AI Accuracy Feedback");
    expect(html).not.toContain("Mark Broken Site Opportunity");
  });

  it("renders verification evidence and researcher feedback controls", () => {
    const html = renderLead(
      { assigned_to_user_id: "researcher-1", assigned_user_email: "researcher@example.com" },
      { userId: "researcher-1", email: "researcher@example.com", role: "researcher" },
      {
        initialTab: "verification",
        initialAiVerification: {
          id: "verification-1",
          lead_id: "lead-1",
          model: "gpt-5.4-mini",
          status: "uncertain",
          confidence: 0.58,
          found_website_url: "https://candidate.example",
          found_email: null,
          found_phone: null,
          social_profiles: [],
          sources: [],
          recommendation: "manual_review",
          reason: "Candidate evidence is weak.",
          summary: "Needs admin review.",
          website_viability_status: "unknown",
          website_health_json: null,
          website_viability_reason: "Website loaded but did not contain enough matching business signals.",
          raw_json: {
            evidence: {
              evidenceGrade: "weak",
              candidateAssessment: {
                score: 42,
                recommendation: "manual_review",
                reasons: ["Domain name does not strongly match the lead."],
              },
              identityMatch: {
                summary: "Name match is weak and no phone match was found.",
              },
              officialSiteEvidence: ["Candidate domain loaded."],
              contradictingEvidence: ["No address or phone match."],
              manualReviewReason: "Weak identity evidence.",
            },
          },
          estimated_cost: 0.01,
          error: null,
          created_at: "2026-06-02T00:00:00.000Z",
        },
      },
    );

    expect(html).toContain("Evidence");
    expect(html).toContain("Weak");
    expect(html).toContain("42");
    expect(html).toContain("Name match is weak");
    expect(html).toContain("AI was wrong");
    expect(html).toContain("Pitch was useful");
  });

  it("requires unclaimed researchers to claim before using AI tools", () => {
    const html = renderLead(
      {},
      { userId: "researcher-1", email: "researcher@example.com", role: "researcher" },
      { initialTab: "intelligence" },
    );

    expect(html).toContain("Generate Pitch Pack");
    expect(html).toContain("Claim this lead to run AI check or generate a pitch pack.");
  });

  it("renders operator-ready pitch snippets in intelligence artifacts", () => {
    const html = renderLead(
      {},
      { userId: "admin-1", email: "admin@example.com", role: "admin" },
      {
        initialTab: "intelligence",
        initialAiArtifacts: [
          {
            id: "artifact-1",
            lead_id: "lead-1",
            artifact_type: "competitive_report",
            status: "complete",
            model: "gpt-5.4-mini",
            input_hash: "hash-1",
            prompt_version: "lead-intelligence-v2",
            content_json: {
              artifact_type: "competitive_report",
              competitor_count: 4,
              competitor_examples: [],
              website_status_mix: { none: 2, social: 0, basic: 1, custom: 1, usable_ai_site: 1, weak_or_broken: 0, unknown: 0 },
              opportunity_angle: "No usable site angle.",
              monthly_revenue_upside_range: { low: 300, high: 900, currency: "USD" },
              assumptions: ["Conservative", "Local data only"],
              objection_handling: ["They may have a hidden site.", "They may not want a site."],
              pitch_bullets: ["Strong reviews.", "No usable official site found.", "Calls are valuable."],
              data_gaps: [],
              confidence: 0.72,
              sources: [],
              pitchAngleType: "no_usable_site",
              verificationCaveat: "Use cautious wording.",
              callOpener: "I could not find a usable official site.",
              smsOpener: "Hi, I could not find a usable official site.",
              voicemailScript: "I noticed a possible visibility gap.",
              followUpMessage: "Following up on the visibility gap.",
              claimSupport: ["AI evidence supports no usable official site."],
            },
            sources_json: [],
            confidence: 0.72,
            usage_input_tokens: 0,
            usage_output_tokens: 0,
            estimated_cost: 0,
            error: null,
            created_at: "2026-06-02T00:00:00.000Z",
            updated_at: "2026-06-02T00:00:00.000Z",
          },
        ],
      },
    );

    expect(html).toContain("Pitch stance");
    expect(html).toContain("Use cautious wording.");
    expect(html).toContain("Call opener");
    expect(html).toContain("SMS opener");
    expect(html).toContain("Voicemail");
    expect(html).toContain("Follow-up");
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
