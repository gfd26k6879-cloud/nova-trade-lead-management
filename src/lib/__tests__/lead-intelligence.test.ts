import { describe, expect, it } from "vitest";
import {
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
    businessType: "medical",
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
      businessType: "medical",
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

  it("returns conservative revenue ranges with assumptions", () => {
    const lead = {
      business_type: "medical",
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
      business_type: "medical",
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
