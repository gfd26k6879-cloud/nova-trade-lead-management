import { describe, expect, it, vi } from "vitest";
import {
  buildLeadVerificationAdjudicationRequest,
  buildLeadVerificationRequest,
  callOpenAILeadVerifier,
  createLeadVerificationInputHash,
  OpenAIResponseParseError,
  parseAiVerificationResponse,
  serializeOpenAIResponseParseError,
} from "@/lib/ai/lead-verification";
import {
  buildLeadIdentityEvidencePacket,
  scoreWebsiteCandidate,
} from "@/lib/ai/lead-evidence";
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
    market_id: null,
    location_cell_id: null,
    country_code: "US",
    admin_area1: "CO",
    admin_area2: "Denver",
    locality: "Denver",
    postal_code: "80202",
    score: 12,
    status: "new",
    is_excluded: false,
    exclusion_reason: null,
    excluded_at: null,
    archived_at: null,
    archived_by_user_id: null,
    archive_reason: null,
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
    enrichment_attempt_count: 0,
    enrichment_started_at: null,
    enrichment_finished_at: null,
    enrichment_next_retry_at: null,
    enrichment_last_error: null,
    enrichment_last_error_code: null,
    enrichment_max_attempts: 3,
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
      candidateWebsites: [],
      identityMatch: { name: "near", location: "unknown", phone: "unknown", category: "unknown", summary: "Near business name match." },
      officialSiteEvidence: [],
      contradictingEvidence: [],
      siteQualityFlags: [],
      manualReviewReason: null,
      evidenceGrade: "strong",
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
    expect(parsed.evidenceGrade).toBe("weak");
    expect(parsed.candidateWebsites).toEqual([]);
  });

  it("changes the input hash when identity-critical fields change", () => {
    const original = makeLead();
    const renamed = { ...original, name: "Gateway Park Dental Studio" };
    const moved = { ...original, address: "999 Market St, Denver, CO", maps_uri: "https://maps.google.com/new" };

    expect(createLeadVerificationInputHash(renamed)).not.toBe(createLeadVerificationInputHash(original));
    expect(createLeadVerificationInputHash(moved)).not.toBe(createLeadVerificationInputHash(original));
  });

  it("keeps the paid web-search verifier boundary locked", () => {
    const request = buildLeadVerificationRequest(makeLead());

    expect(request.max_tool_calls).toBe(2);
    expect(request.max_output_tokens).toBeGreaterThanOrEqual(2400);
    expect(request.include).toEqual(["web_search_call.action.sources"]);
    expect(request.tools).toEqual([
      expect.objectContaining({ type: "web_search" }),
    ]);
    expect(JSON.stringify(request.input)).toContain("identityEvidence");
  });

  it("keeps the no-tool adjudicator on a larger LLM-only output budget", () => {
    const lead = makeLead();
    const base = parseAiVerificationResponse(JSON.stringify({
      status: "no_site_found",
      confidence: 0.8,
      foundWebsiteUrl: null,
      foundEmail: null,
      foundPhone: null,
      socialProfiles: [],
      sources: [{ url: "https://example-directory.test/business", title: "Directory", evidence: "No website listed." }],
      recommendation: "prioritize",
      reason: "Only directory and social sources were found.",
      summary: "No official website was found in the checked sources.",
    }));
    const request = buildLeadVerificationAdjudicationRequest(lead, base, null, {
      url: null,
      score: 0,
      recommendation: "manual_review",
      flags: [],
      reasons: [],
      hostType: "unknown",
    });

    expect(request.max_output_tokens).toBeGreaterThanOrEqual(2400);
    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("max_tool_calls");
  });

  it("builds normalized evidence packets before web search", () => {
    const lead = {
      ...makeLead(),
      address: "123 Main St, Denver, CO 80202",
      ai_website_feedback_status: "incorrect",
      ai_corrected_website_url: "https://correct-gateway.example",
    };

    const packet = buildLeadIdentityEvidencePacket(lead);

    expect(packet.name.normalized).toBe("gateway park dental");
    expect(packet.name.tokens).toEqual(expect.arrayContaining(["gateway", "park", "dental"]));
    expect(packet.phone.normalized).toBe("3035550100");
    expect(packet.location.zip).toBe("80202");
    expect(packet.location.city).toBe("Denver");
    expect(packet.category.synonyms).toEqual(expect.arrayContaining(["dentist", "dental clinic"]));
    expect(packet.knownDirectoryOrSocialHosts).toEqual(expect.arrayContaining(["yelp.com", "facebook.com"]));
    expect(packet.feedback.correctedWebsiteUrl).toBe("https://correct-gateway.example");
  });

  it("scores official candidates higher than directory and weak identity matches", () => {
    const lead = {
      ...makeLead(),
      address: "123 Main St, Denver, CO 80202",
    };

    const official = scoreWebsiteCandidate(lead, "https://gatewayparkdental.com", [], {
      status: "usable",
      reason: "Website is reachable and contains matching business signals.",
      health: {
        requestedUrl: "https://gatewayparkdental.com",
        finalUrl: "https://gatewayparkdental.com",
        statusCode: 200,
        method: "GET",
        responseMs: 100,
        redirected: false,
        ssl: true,
        title: "Gateway Park Dental",
        contentLength: 5000,
        businessSignalScore: 5,
        matchedSignals: ["name", "phone"],
        classifierSignals: [],
      },
    });
    const directory = scoreWebsiteCandidate(lead, "https://www.yelp.com/biz/gateway-park-dental-denver", [], null);

    expect(official.score).toBeGreaterThanOrEqual(75);
    expect(official.recommendation).toBe("accept");
    expect(directory.score).toBeLessThan(30);
    expect(directory.flags).toContain("directory_or_social_host");
    expect(directory.recommendation).toBe("reject");
  });

  it("builds a no-tool adjudication request", () => {
    const lead = makeLead();
    const base = parseAiVerificationResponse(JSON.stringify({
      status: "site_found",
      confidence: 0.8,
      foundWebsiteUrl: "https://gatewayparkdental.com",
      foundEmail: null,
      foundPhone: null,
      socialProfiles: [],
      sources: [{ url: "https://gatewayparkdental.com", title: "Gateway Park Dental", evidence: "Official homepage." }],
      recommendation: "exclude",
      reason: "Candidate site found.",
      summary: "The business appears to have an official site.",
      candidateWebsites: [{ url: "https://gatewayparkdental.com", title: "Gateway Park Dental", sourceUrl: "https://gatewayparkdental.com", evidence: "Official homepage.", isOfficialCandidate: true }],
      identityMatch: { name: "near", location: "unknown", phone: "unknown", category: "unknown", summary: "Near business name match." },
      officialSiteEvidence: ["Official homepage found."],
      contradictingEvidence: [],
      siteQualityFlags: [],
      manualReviewReason: null,
      evidenceGrade: "moderate",
    }));
    const request = buildLeadVerificationAdjudicationRequest(lead, base, null, {
      url: "https://gatewayparkdental.com",
      score: 82,
      recommendation: "accept",
      flags: ["domain_name_match"],
      reasons: ["Domain tokens match the business name."],
      hostType: "official_candidate",
    });

    expect(request).not.toHaveProperty("tools");
    expect(request).not.toHaveProperty("include");
    expect(request).not.toHaveProperty("max_tool_calls");
    expect(JSON.stringify(request)).toContain("candidateAssessment");
  });

  it("throws parse diagnostics when OpenAI returns incomplete JSON", async () => {
    const raw = {
      id: "resp_parse_failure",
      status: "completed",
      incomplete_details: { reason: "max_output_tokens" },
      output: [
        {
          type: "message",
          status: "completed",
          content: [
            { type: "output_text", text: "{\"status\":\"no_site_found\"" },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 2400, total_tokens: 2500 },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(raw), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(callOpenAILeadVerifier(makeLead(), "sk-test")).rejects.toBeInstanceOf(OpenAIResponseParseError);
    try {
      await callOpenAILeadVerifier(makeLead(), "sk-test");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAIResponseParseError);
      expect((error as OpenAIResponseParseError).inputTokens).toBe(100);
      expect((error as OpenAIResponseParseError).outputTokens).toBe(2400);
      expect((error as OpenAIResponseParseError).estimatedCost).toBeGreaterThan(0);
      const diagnostic = serializeOpenAIResponseParseError(error as OpenAIResponseParseError);
      expect(diagnostic.stage).toBe("lead_verifier");
      expect(JSON.stringify(diagnostic)).toContain("max_output_tokens");
      expect(JSON.stringify(diagnostic)).toContain("resp_parse_failure");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("carries billed usage when a successful OpenAI response has no text output", async () => {
    const raw = {
      id: "resp_no_text",
      status: "completed",
      output: [],
      usage: { input_tokens: 80, output_tokens: 12, total_tokens: 92 },
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(raw), { status: 200 })));

    try {
      await callOpenAILeadVerifier(makeLead(), "sk-test");
      expect.fail("Expected a response parse error.");
    } catch (error) {
      expect(error).toBeInstanceOf(OpenAIResponseParseError);
      expect((error as OpenAIResponseParseError).stage).toBe("lead_verifier");
      expect((error as OpenAIResponseParseError).inputTokens).toBe(80);
      expect((error as OpenAIResponseParseError).outputTokens).toBe(12);
      expect((error as OpenAIResponseParseError).estimatedCost).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
