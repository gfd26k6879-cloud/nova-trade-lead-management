import { describe, expect, it } from "vitest";
import {
  buildArtifactFinalRequest,
  buildArtifactReviewRequest,
  businessDetailSchema,
  competitiveReportSchema,
  createLeadArtifactInputHash,
  estimateConservativeMonthlyRevenueUpside,
  type CompetitorSnapshot,
  type LeadArtifactContext,
} from "@/lib/ai/lead-intelligence";
import type { Lead } from "@/lib/db/queries";

function makeContext(overrides: Partial<LeadArtifactContext> = {}): LeadArtifactContext {
  const snapshot: CompetitorSnapshot = {
    zip: "80202",
    primaryType: "dentist",
    businessType: "dental",
    count: 12,
    websiteStatusMix: { none: 3, social: 2, basic: 2, custom: 5, usable_ai_site: 4, weak_or_broken: 1, unknown: 0 },
    averageRating: 4.4,
    averageReviewCount: 98,
    topCompetitors: [],
  };
  return {
    lead: {
      id: "lead-1",
      name: "Gateway Park Dental",
      address: "123 Main St, Denver, CO 80202",
      phone: "303-555-0100",
      categories: ["dentist"],
      primaryType: "dentist",
      businessType: "dental",
      rating: 4.6,
      reviewCount: 120,
      websiteUri: null,
      websiteStatus: "none",
      mapsUri: "https://maps.example",
      businessStatus: "OPERATIONAL",
      reviewHighlights: ["friendly staff"],
      editorialSummary: null,
      websiteHealth: null,
      recommendedOffer: "starter_site",
      qualityReason: "Verified no website.",
      nextBestAction: "Call owner.",
      score: 18,
      rawOpportunityScore: 70,
      verificationScore: 92,
      salesPriorityScore: 88,
      estimatedDealValue: 4500,
      contactabilityScore: 1,
    },
    latestAiVerification: null,
    demoUrlPath: "/demo/example",
    competitorSnapshot: snapshot,
    pitchEvidence: {
      finding: "No usable official website found",
      aiStatus: "no_site_found",
      websiteViabilityStatus: "directory_only",
      confidence: 0.91,
      websiteUrl: null,
      sources: [],
      dataGaps: [],
      evidenceGrade: "strong",
      candidateAssessment: null,
      verificationCaveat: "Strong public evidence supports a no-site outreach angle.",
    },
    revenueUpside: { low: 500, high: 1200, assumptions: ["Conservative"] },
    ...overrides,
  };
}

describe("lead intelligence", () => {
  it("changes artifact input hash when evidence changes", () => {
    const base = makeContext();
    const changed = makeContext({
      pitchEvidence: { ...base.pitchEvidence, confidence: 0.55 },
    });

    expect(createLeadArtifactInputHash("business_detail", base))
      .not.toBe(createLeadArtifactInputHash("business_detail", changed));
  });

  it("rejects malformed artifact content", () => {
    expect(() => businessDetailSchema.parse({ artifact_type: "business_detail" })).toThrow();
    expect(() => competitiveReportSchema.parse({ artifact_type: "competitive_report" })).toThrow();
  });

  it("requires operator-ready pitch fields on lead intelligence artifacts", () => {
    const businessDetail = businessDetailSchema.parse({
      artifact_type: "business_detail",
      business_summary: "Gateway Park Dental is a local dental office.",
      services: ["Dental cleanings"],
      target_customers: ["Denver families"],
      differentiators: ["Strong reviews"],
      trust_signals: ["4.6 rating"],
      brand_tone: "Professional and warm.",
      content_sections: [
        { title: "Home", goal: "Explain the practice.", bullets: ["Friendly Denver dental care."] },
        { title: "Services", goal: "List core services.", bullets: ["Cleanings and exams."] },
        { title: "Reviews", goal: "Build trust.", bullets: ["Mention review strength."] },
        { title: "Contact", goal: "Drive calls.", bullets: ["Call for an appointment."] },
      ],
      cta_strategy: "Drive phone calls.",
      seo_keywords: ["denver dentist", "dental cleaning denver", "family dentist"],
      image_direction: "Bright local dental office.",
      missing_info: [],
      website_generation_prompt: "Build a polished local dental website with service sections, trust signals, and direct phone CTA.".repeat(4),
      confidence: 0.8,
      sources: [],
      pitchAngleType: "no_usable_site",
      verificationCaveat: "Use cautious wording because public data can miss official websites.",
      callOpener: "I could not find a usable official site for Gateway Park Dental.",
      smsOpener: "Hi, I was looking for Gateway Park Dental online and could not find a usable official site.",
      voicemailScript: "Quick note: I may have found a visibility gap for Gateway Park Dental.",
      followUpMessage: "Following up with the visibility note I mentioned.",
      claimSupport: ["AI evidence says no usable official site was found."],
    });

    expect(businessDetail.pitchAngleType).toBe("no_usable_site");
    expect(businessDetail.claimSupport[0]).toContain("AI evidence");
  });

  it("keeps the artifact final request web-search shape and makes the reviewer no-tool only", () => {
    const context = makeContext();
    const finalRequest = buildArtifactFinalRequest("competitive_report", context, []);
    const reviewRequest = buildArtifactReviewRequest("competitive_report", context, {
      artifact_type: "competitive_report",
      competitor_count: 12,
      competitor_examples: [],
      website_status_mix: context.competitorSnapshot.websiteStatusMix,
      opportunity_angle: "No usable site angle.",
      monthly_revenue_upside_range: { low: 500, high: 1200, currency: "USD" },
      assumptions: ["Conservative", "Local data only"],
      objection_handling: ["They may already have a hidden site.", "They may not want a website."],
      pitch_bullets: ["No usable official site found.", "Strong reviews make calls valuable.", "A simple site can capture demand."],
      data_gaps: [],
      confidence: 0.75,
      sources: [],
      pitchAngleType: "no_usable_site",
      verificationCaveat: "Use cautious wording.",
      callOpener: "I could not find a usable official site.",
      smsOpener: "I could not find a usable official site.",
      voicemailScript: "I noticed a possible visibility gap.",
      followUpMessage: "Following up on the visibility gap.",
      claimSupport: ["Verification evidence supports no usable official site."],
    });

    expect(finalRequest.include).toEqual(["web_search_call.action.sources"]);
    expect(finalRequest.tools).toEqual([expect.objectContaining({ type: "web_search" })]);
    expect(reviewRequest).not.toHaveProperty("tools");
    expect(reviewRequest).not.toHaveProperty("include");
    expect(reviewRequest).not.toHaveProperty("max_tool_calls");
  });

  it("returns conservative revenue ranges with assumptions", () => {
    const lead = {
      business_type: "dental",
      primary_type: "dentist",
      categories: ["dentist"],
      ai_verification_status: "no_site_found",
      review_count: 120,
      contactability_score: 1,
      phone: "303-555-0100",
    } as unknown as Lead;
    const estimate = estimateConservativeMonthlyRevenueUpside(lead, makeContext().competitorSnapshot);

    expect(estimate.low).toBeGreaterThan(0);
    expect(estimate.high).toBeGreaterThanOrEqual(estimate.low);
    expect(estimate.assumptions.length).toBeGreaterThanOrEqual(2);
  });

  it("normalizes contactability before applying revenue multiplier", () => {
    const baseLead = {
      business_type: "dental",
      primary_type: "dentist",
      categories: ["dentist"],
      ai_verification_status: "no_site_found",
      review_count: 120,
      phone: "303-555-0100",
    } as unknown as Lead;
    const low = estimateConservativeMonthlyRevenueUpside({ ...baseLead, contactability_score: 25 } as Lead, makeContext().competitorSnapshot);
    const medium = estimateConservativeMonthlyRevenueUpside({ ...baseLead, contactability_score: 75 } as Lead, makeContext().competitorSnapshot);
    const high = estimateConservativeMonthlyRevenueUpside({ ...baseLead, contactability_score: 100 } as Lead, makeContext().competitorSnapshot);

    expect(low.high).toBeLessThan(medium.high);
    expect(medium.high).toBeLessThan(high.high);
  });
});
