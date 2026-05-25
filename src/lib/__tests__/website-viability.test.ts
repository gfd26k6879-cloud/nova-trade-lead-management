import { describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/db/queries";
import type { AiVerificationResult } from "@/lib/ai/lead-verification";
import { assessWebsiteViability, normalizeAiVerificationForWebsiteSales } from "@/lib/ai/website-viability";

function makeLead(): Lead {
  return {
    id: "lead-1",
    place_id: "place-1",
    name: "Gateway Park Dental",
    address: "123 Main St, Denver, CO 80202",
    phone: "303-555-0100",
    categories: ["dentist"],
    rating: 4.7,
    review_count: 83,
    website_uri: null,
    website_status: "none",
    maps_uri: "https://maps.google.com/example",
    business_status: "OPERATIONAL",
    price_level: null,
    photo_count: 2,
    has_opening_hours: true,
    primary_type: "dentist",
    lat: null,
    lng: null,
    score: 18,
    status: "new",
    is_excluded: false,
    exclusion_reason: null,
    excluded_at: null,
    selling_niche: "dental",
    business_type: "dental",
    win_probability_score: 0,
    lead_quality_score: 0,
    quality_bucket: "needs_ai_verify",
    easy_build_score: 0,
    cash_speed_score: 0,
    need_score: 0,
    quality_reason: null,
    recommended_offer: "starter_site",
    next_best_action: null,
    phone_verification_status: "unknown",
    last_quality_scored_at: null,
    quality_checked_by_user_id: null,
    ai_verification_status: "not_checked",
    ai_confidence: 0,
    ai_found_website_url: null,
    ai_recommendation: null,
    ai_summary: null,
    ai_checked_at: null,
    ai_website_viability_status: null,
    ai_website_health: null,
    ai_queue_status: "not_checked",
    ai_attempt_count: 0,
    ai_last_error: null,
    ai_next_retry_at: null,
    ai_input_hash: null,
    raw_opportunity_score: 0,
    verification_score: 0,
    sales_priority_score: 0,
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
    assigned_to_user_id: null,
    assigned_user_email: null,
    assigned_user_display_name: null,
    qualification_status: "needs_verification",
    disqualification_reason: null,
    website_verified_at: null,
    contactability_score: 1,
    estimated_deal_value: 4500,
    notes: null,
    reminder_date: null,
    enrichment_status: "pending",
    enriched_at: null,
    review_highlights: null,
    editorial_summary: null,
    website_health: null,
    website_checked_at: null,
    verification: {},
    discovered_at: "2026-05-01T10:00:00.000Z",
    first_contacted_at: null,
    first_reply_at: null,
    meeting_booked_at: null,
    last_contacted_at: null,
    created_at: "2026-05-01T10:00:00.000Z",
    updated_at: "2026-05-01T10:00:00.000Z",
  };
}

function makeAiResult(overrides: Partial<AiVerificationResult> = {}): AiVerificationResult {
  return {
    status: "site_found",
    confidence: 0.88,
    foundWebsiteUrl: "https://gatewayparkdental.example",
    foundEmail: null,
    foundPhone: null,
    socialProfiles: [],
    sources: [{ url: "https://directory.example/gateway", title: "Directory", evidence: "Directory lists gatewayparkdental.example." }],
    recommendation: "keep",
    reason: "Candidate domain found.",
    summary: "AI found a candidate domain.",
    ...overrides,
  };
}

function response(body: string, status = 200, url = "https://gatewayparkdental.example/"): Response {
  const res = new Response(body, { status, headers: { "content-type": "text/html" } });
  Object.defineProperty(res, "url", { value: url });
  return res;
}

describe("website viability checks", () => {
  it("classifies a 404 domain as a weak-site opportunity", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = "<title>404</title><h1>Halaman Tidak Ditemukan</h1><p>URL salah atau halaman telah dipindahkan.</p>";
      return response(body, init?.method === "HEAD" ? 404 : 404);
    });

    const viability = await assessWebsiteViability(makeLead(), "https://gatewayparkdental.example", { fetchImpl });
    const normalized = normalizeAiVerificationForWebsiteSales(makeLead(), makeAiResult(), viability);

    expect(viability.status).toBe("broken");
    expect(normalized.result.status).toBe("weak_site_found");
    expect(normalized.result.recommendation).toBe("prioritize");
  });

  it("classifies parked domains as weak-site opportunities", async () => {
    const fetchImpl = vi.fn(async () => response("<title>Buy this domain</title>This domain is for sale at Afternic."));
    const viability = await assessWebsiteViability(makeLead(), "https://gatewayparkdental.example", { fetchImpl });
    const normalized = normalizeAiVerificationForWebsiteSales(makeLead(), makeAiResult({ recommendation: "exclude" }), viability);

    expect(viability.status).toBe("parked");
    expect(normalized.result.status).toBe("weak_site_found");
    expect(normalized.result.recommendation).toBe("prioritize");
  });

  it("classifies a live matching business website as usable", async () => {
    const html = `
      <title>Gateway Park Dental - Denver Dentist</title>
      <h1>Gateway Park Dental</h1>
      <p>Call 303-555-0100 to schedule a dental appointment at 123 Main St in Denver.</p>
      <a>Contact us</a>
    `;
    const fetchImpl = vi.fn(async () => response(html));
    const viability = await assessWebsiteViability(makeLead(), "https://gatewayparkdental.example", { fetchImpl });
    const normalized = normalizeAiVerificationForWebsiteSales(makeLead(), makeAiResult(), viability);

    expect(viability.status).toBe("usable");
    expect(normalized.result.status).toBe("site_found");
    expect(normalized.result.recommendation).toBe("update_website");
  });

  it("does not let a failed direct URL remain site_found", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    const viability = await assessWebsiteViability(makeLead(), "https://gatewayparkdental.example", { fetchImpl });
    const normalized = normalizeAiVerificationForWebsiteSales(makeLead(), makeAiResult(), viability);

    expect(viability.status).toBe("broken");
    expect(normalized.result.status).not.toBe("site_found");
    expect(normalized.result.recommendation).toBe("prioritize");
  });

  it("treats directory-only website claims as no-site opportunities", async () => {
    const normalized = normalizeAiVerificationForWebsiteSales(
      makeLead(),
      makeAiResult({ foundWebsiteUrl: null, status: "site_found", recommendation: "exclude" }),
      null,
    );

    expect(normalized.result.status).toBe("no_site_found");
    expect(normalized.result.recommendation).toBe("prioritize");
    expect(normalized.websiteViability?.status).toBe("directory_only");
  });
});
