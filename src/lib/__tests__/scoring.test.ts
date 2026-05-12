import { describe, it, expect } from "vitest";
import { computeScore, computeScoreWithBreakdown, computeWinProbability, DEFAULT_WEBSITE_MULTIPLIERS, DEFAULT_NICHE_WEIGHTS } from "../scoring";

describe("computeScore", () => {
  it("returns fallback score for zero reviews when business is operational", async () => {
    const score = computeScore({ reviewCount: 0, rating: 0, categories: ["dentist"], websiteStatus: "none" });
    expect(score).toBeGreaterThan(0);
  });

  it("returns 0 for zero reviews when business is closed", async () => {
    const score = computeScore({
      reviewCount: 0, rating: 0, categories: ["dentist"],
      websiteStatus: "none", businessStatus: "CLOSED_PERMANENTLY",
    });
    expect(score).toBe(0);
  });

  it("computes positive score for valid inputs", async () => {
    const score = computeScore({ reviewCount: 100, rating: 4.5, categories: ["dentist"], websiteStatus: "none" });
    expect(score).toBeGreaterThan(0);
  });

  it("applies niche weight for dentist", async () => {
    const base = computeScore({ reviewCount: 50, rating: 4.0, categories: ["other_category"], websiteStatus: "none" });
    const dentist = computeScore({ reviewCount: 50, rating: 4.0, categories: ["dentist"], websiteStatus: "none" });
    expect(dentist).toBeGreaterThan(base);
  });

  it("applies website multiplier so custom-domain leads are excluded by default", async () => {
    const args = { reviewCount: 50, rating: 4.0, categories: ["plumber"] } as const;
    const none = computeScore({ ...args, websiteStatus: "none" });
    const social = computeScore({ ...args, websiteStatus: "social" });
    const basic = computeScore({ ...args, websiteStatus: "basic" });
    const custom = computeScore({ ...args, websiteStatus: "custom" });

    expect(none).toBeGreaterThan(social);
    expect(social).toBeGreaterThan(basic);
    expect(basic).toBeGreaterThan(custom);
    expect(custom).toBe(0);
  });

  it("accepts custom niche weights", async () => {
    const custom = computeScore(
      { reviewCount: 50, rating: 4.0, categories: ["foo"], websiteStatus: "none" },
      { foo: 5.0 }
    );
    const standard = computeScore(
      { reviewCount: 50, rating: 4.0, categories: ["foo"], websiteStatus: "none" },
    );
    expect(custom).toBeGreaterThan(standard);
  });
});

describe("computeWinProbability", () => {
  it("penalizes leads when AI finds a real website", async () => {
    const noSite = computeWinProbability({
      score: 18,
      websiteStatus: "none",
      qualificationStatus: "qualified",
      contactabilityScore: 1,
      estimatedDealValue: 5000,
      aiVerification: { status: "no_site_found", confidence: 0.9 },
    });
    const siteFound = computeWinProbability({
      score: 18,
      websiteStatus: "none",
      qualificationStatus: "qualified",
      contactabilityScore: 1,
      estimatedDealValue: 5000,
      aiVerification: { status: "site_found", confidence: 0.9, foundWebsiteUrl: "https://example.com", websiteViabilityStatus: "usable" },
    });
    expect(noSite).toBeGreaterThan(siteFound);
    expect(siteFound).toBeLessThan(50);
  });

  it("keeps win probability high when AI finds a broken candidate domain", async () => {
    const noSite = computeWinProbability({
      score: 18,
      websiteStatus: "none",
      qualificationStatus: "qualified",
      contactabilityScore: 1,
      estimatedDealValue: 5000,
      aiVerification: { status: "no_site_found", confidence: 0.85 },
    });
    const broken = computeWinProbability({
      score: 18,
      websiteStatus: "none",
      qualificationStatus: "qualified",
      contactabilityScore: 1,
      estimatedDealValue: 5000,
      aiVerification: { status: "weak_site_found", confidence: 0.85, foundWebsiteUrl: "https://example.com", websiteViabilityStatus: "broken" },
    });
    expect(broken).toBeGreaterThanOrEqual(noSite - 5);
    expect(broken).toBeGreaterThan(70);
  });

  it("does not zero the website gap for directory-only found URL evidence", async () => {
    const value = computeWinProbability({
      score: 18,
      websiteStatus: "none",
      qualificationStatus: "qualified",
      contactabilityScore: 1,
      estimatedDealValue: 5000,
      aiVerification: { status: "site_found", confidence: 0.9, foundWebsiteUrl: "https://example.com" },
    });
    expect(value).toBeGreaterThan(60);
  });

  it("returns zero for excluded or disqualified leads", async () => {
    expect(computeWinProbability({ score: 20, websiteStatus: "none", isExcluded: true })).toBe(0);
    expect(computeWinProbability({ score: 20, websiteStatus: "none", qualificationStatus: "disqualified" })).toBe(0);
  });

  it("boosts replied and meeting-set leads", async () => {
    const base = computeWinProbability({ score: 12, websiteStatus: "none", contactabilityScore: 0.8 });
    const replied = computeWinProbability({ score: 12, websiteStatus: "none", contactabilityScore: 0.8, firstReplyAt: "2026-05-01T10:00:00.000Z" });
    const meeting = computeWinProbability({ score: 12, websiteStatus: "none", contactabilityScore: 0.8, meetingBookedAt: "2026-05-01T10:00:00.000Z" });
    expect(replied).toBeGreaterThan(base);
    expect(meeting).toBeGreaterThan(replied);
  });
});

describe("computeScoreWithBreakdown", () => {
  it("returns a breakdown object with all fields", async () => {
    const breakdown = computeScoreWithBreakdown({
      reviewCount: 100,
      rating: 4.5,
      categories: ["dentist"],
      websiteStatus: "none",
    });

    expect(breakdown).toHaveProperty("base");
    expect(breakdown).toHaveProperty("nicheWeight");
    expect(breakdown).toHaveProperty("websiteMultiplier");
    expect(breakdown).toHaveProperty("photoBonus");
    expect(breakdown).toHaveProperty("hoursBonus");
    expect(breakdown).toHaveProperty("opportunityBonus");
    expect(breakdown).toHaveProperty("healthBonus");
    expect(breakdown).toHaveProperty("densityBonus");
    expect(breakdown).toHaveProperty("final");
    expect(breakdown.base).toBeGreaterThan(0);
    expect(breakdown.nicheWeight).toBe(DEFAULT_NICHE_WEIGHTS.dentist);
    expect(breakdown.websiteMultiplier).toBe(DEFAULT_WEBSITE_MULTIPLIERS.none);
  });

  it("gives new businesses a non-zero fallback base", async () => {
    const breakdown = computeScoreWithBreakdown({
      reviewCount: 0, rating: 0, categories: [], websiteStatus: "none",
    });
    expect(breakdown.base).toBe(2.0);
    expect(breakdown.final).toBeGreaterThan(0);
  });

  it("adds photo bonus for low photo count", async () => {
    const low = computeScoreWithBreakdown({
      reviewCount: 50, rating: 4.0, categories: [], websiteStatus: "none", photoCount: 0,
    });
    const high = computeScoreWithBreakdown({
      reviewCount: 50, rating: 4.0, categories: [], websiteStatus: "none", photoCount: 15,
    });
    expect(low.photoBonus).toBeGreaterThan(high.photoBonus);
  });

  it("adds hours bonus when opening hours are present", async () => {
    const withHours = computeScoreWithBreakdown({
      reviewCount: 50, rating: 4.0, categories: [], websiteStatus: "none", hasOpeningHours: true,
    });
    const without = computeScoreWithBreakdown({
      reviewCount: 50, rating: 4.0, categories: [], websiteStatus: "none", hasOpeningHours: false,
    });
    expect(withHours.hoursBonus).toBe(0.15);
    expect(without.hoursBonus).toBe(0);
    expect(withHours.final).toBeGreaterThan(without.final);
  });

  it("adds opportunity bonus for mediocre-rating high-review businesses", async () => {
    const opportunity = computeScoreWithBreakdown({
      reviewCount: 30, rating: 3.5, categories: [], websiteStatus: "none",
    });
    const noOpportunity = computeScoreWithBreakdown({
      reviewCount: 30, rating: 4.8, categories: [], websiteStatus: "none",
    });
    expect(opportunity.opportunityBonus).toBe(0.25);
    expect(noOpportunity.opportunityBonus).toBe(0);
  });

  it("adds health bonus for broken websites", async () => {
    const broken = computeScoreWithBreakdown({
      reviewCount: 50, rating: 4.0, categories: [], websiteStatus: "basic",
      websiteHealth: { statusCode: 404, ssl: false },
    });
    expect(broken.healthBonus).toBeGreaterThan(0);
  });

  it("adds density bonus for competitive areas", async () => {
    const dense = computeScoreWithBreakdown({
      reviewCount: 50, rating: 4.0, categories: [], websiteStatus: "none",
      competitiveDensity: 20,
    });
    const sparse = computeScoreWithBreakdown({
      reviewCount: 50, rating: 4.0, categories: [], websiteStatus: "none",
      competitiveDensity: 1,
    });
    expect(dense.densityBonus).toBe(0.3);
    expect(sparse.densityBonus).toBe(0);
  });
});
