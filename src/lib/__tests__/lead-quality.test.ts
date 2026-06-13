import { describe, expect, it } from "vitest";
import { computeLeadQuality } from "@/lib/lead-quality";

const baseLead = {
  score: 12,
  websiteStatus: "none",
  businessType: "dental",
  categories: ["dentist"],
  rating: 4.6,
  reviewCount: 72,
  phone: "303-555-0100",
  address: "123 Main St, Denver, CO",
  mapsUri: "https://maps.google.com/example",
  businessStatus: "OPERATIONAL",
  isExcluded: false,
  qualificationStatus: "qualified",
  status: "new",
  contactabilityScore: 1,
  estimatedDealValue: 4500,
  aiVerificationStatus: "not_checked",
  aiConfidence: 0,
  aiFoundWebsiteUrl: null,
  aiWebsiteViabilityStatus: null,
  phoneVerificationStatus: "unknown",
};

describe("lead quality scoring", () => {
  it("scores AI-verified no-site leads as ready to call", () => {
    const quality = computeLeadQuality({
      ...baseLead,
      aiVerificationStatus: "no_site_found",
      aiConfidence: 0.91,
    });

    expect(quality.qualityBucket).toBe("ready_to_call");
    expect(quality.leadQualityScore).toBeGreaterThanOrEqual(70);
    expect(quality.recommendedOffer).toBe("booking_ready_site");
  });

  it("keeps broken or parked domains as high-value opportunities", () => {
    const quality = computeLeadQuality({
      ...baseLead,
      aiVerificationStatus: "weak_site_found",
      aiConfidence: 0.88,
      aiFoundWebsiteUrl: "https://broken-example.test",
      aiWebsiteViabilityStatus: "broken",
    });

    expect(quality.qualityBucket).toBe("broken_site_opportunity");
    expect(quality.recommendedOffer).toBe("broken_site_rescue");
    expect(quality.leadQualityScore).toBeGreaterThanOrEqual(70);
  });

  it("drops usable existing websites to not a fit", () => {
    const quality = computeLeadQuality({
      ...baseLead,
      websiteStatus: "custom",
      aiVerificationStatus: "site_found",
      aiConfidence: 0.95,
      aiFoundWebsiteUrl: "https://real-site.example",
      aiWebsiteViabilityStatus: "usable",
    });

    expect(quality.qualityBucket).toBe("not_a_fit");
    expect(quality.leadQualityScore).toBeLessThanOrEqual(5);
    expect(quality.recommendedOffer).toBe("not_recommended");
  });

  it("keeps excluded official-website corrections out of the review queue", () => {
    const quality = computeLeadQuality({
      ...baseLead,
      isExcluded: true,
      aiWebsiteFeedbackStatus: "incorrect",
    });

    expect(quality.qualityBucket).toBe("not_a_fit");
    expect(quality.leadQualityScore).toBe(0);
  });

  it("keeps candidate website corrections in manual review", () => {
    const quality = computeLeadQuality({
      ...baseLead,
      websiteStatus: "custom",
      aiWebsiteFeedbackStatus: "uncertain",
    });

    expect(quality.qualityBucket).toBe("needs_manual_review");
    expect(quality.nextBestAction).toContain("Review corrected website evidence");
  });

  it("keeps weak manually found sites as broken-site opportunities", () => {
    const quality = computeLeadQuality({
      ...baseLead,
      websiteStatus: "basic",
      aiWebsiteFeedbackStatus: "incorrect",
    });

    expect(quality.qualityBucket).toBe("broken_site_opportunity");
    expect(quality.recommendedOffer).toBe("broken_site_rescue");
  });

  it("keeps social or directory-only website corrections in manual review", () => {
    const quality = computeLeadQuality({
      ...baseLead,
      websiteStatus: "social",
      aiVerificationStatus: "no_site_found",
      aiWebsiteFeedbackStatus: "correct",
    });

    expect(quality.qualityBucket).toBe("needs_manual_review");
  });

  it("penalizes missing phones without throwing away high-value leads", () => {
    const quality = computeLeadQuality({
      ...baseLead,
      phone: null,
      phoneVerificationStatus: "no_phone",
      aiVerificationStatus: "no_site_found",
      aiConfidence: 0.9,
    });

    expect(quality.qualityBucket).toBe("needs_manual_review");
    expect(quality.leadQualityScore).toBeGreaterThan(35);
  });

  it("favors simple local-service builds for fast-money offers", () => {
    const quality = computeLeadQuality({
      ...baseLead,
      businessType: "plumbing",
      categories: ["plumber"],
      estimatedDealValue: 3500,
      aiVerificationStatus: "no_site_found",
      aiConfidence: 0.9,
    });

    expect(quality.easyBuildScore).toBeGreaterThanOrEqual(75);
    expect(quality.cashSpeedScore).toBeGreaterThanOrEqual(80);
    expect(quality.recommendedOffer).toBe("local_service_site");
  });
});
