import { describe, expect, it, vi } from "vitest";
import { buildLeadVerificationRequest, parseAiVerificationResponse } from "@/lib/ai/lead-verification";
import type { Lead } from "@/lib/db/queries";

function makeLead(): Lead {
  return {
    id: "lead-1",
    place_id: "place-1",
    name: "Gateway Park Dental",
    address: "123 Main St, Denver, CO",
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
    score: 12,
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
    assigned_to_user_id: null,
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

describe("AI lead verification request", () => {
  it("always builds requests with the locked model", async () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-5.4-mini");
    const request = buildLeadVerificationRequest(makeLead());
    expect(request.model).toBe("gpt-5.4-mini");
    expect(JSON.stringify(request)).not.toContain("gpt-4o");
    vi.unstubAllEnvs();
  });

  it("requires sourced evidence when a website is found", async () => {
    expect(() => parseAiVerificationResponse(JSON.stringify({
      status: "site_found",
      confidence: 0.92,
      foundWebsiteUrl: "https://gatewayparkdental.example",
      foundEmail: null,
      foundPhone: null,
      socialProfiles: [],
      sources: [],
      recommendation: "exclude",
      reason: "Found an official site.",
      summary: "The business appears to have an official website.",
    }))).toThrow(/source URLs/);
  });

  it("accepts no-site verification without a found website", async () => {
    const parsed = parseAiVerificationResponse(JSON.stringify({
      status: "no_site_found",
      confidence: 0.8,
      foundWebsiteUrl: null,
      foundEmail: null,
      foundPhone: null,
      socialProfiles: ["https://facebook.com/example"],
      sources: [{ url: "https://example-directory.test/business", title: "Directory", evidence: "No website listed." }],
      recommendation: "prioritize",
      reason: "Only directory and social sources were found.",
      summary: "No official website was found in the checked sources.",
    }));
    expect(parsed.status).toBe("no_site_found");
  });
});
