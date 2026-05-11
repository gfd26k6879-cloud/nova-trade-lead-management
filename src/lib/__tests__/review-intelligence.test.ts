import { describe, it, expect } from "vitest";
import { extractReviewInsights, getOutreachAngle } from "../review-intelligence";

describe("extractReviewInsights", () => {
  it("detects digital pain points from review text", async () => {
    const reviews = [
      { text: { text: "Great dentist but couldn't find them online. No website at all." } },
      { text: { text: "Hard to book an appointment, had to call three times." } },
      { text: { text: "Excellent service, very professional." } },
    ];
    const insights = extractReviewInsights(reviews);

    expect(insights.painPoints).toContain("hard to find");
    expect(insights.painPoints).toContain("no website");
    expect(insights.keywords.length).toBeGreaterThan(0);
    expect(insights.totalReviews).toBe(3);
  });

  it("calculates sentiment ratio", async () => {
    const reviews = [
      { text: { text: "Excellent service, very professional and friendly." } },
      { text: { text: "Terrible experience, rude staff and dirty." } },
      { text: { text: "Great place, would recommend to everyone." } },
    ];
    const insights = extractReviewInsights(reviews);

    expect(insights.sentimentRatio).toBeGreaterThan(0.5);
  });

  it("handles empty reviews", async () => {
    const insights = extractReviewInsights([]);
    expect(insights.keywords).toEqual([]);
    expect(insights.painPoints).toEqual([]);
    expect(insights.sentimentRatio).toBe(0.5);
  });
});

describe("getOutreachAngle", () => {
  it("returns seo for hard-to-find businesses", async () => {
    expect(getOutreachAngle(["hard to find"])).toBe("seo");
    expect(getOutreachAngle(["no website"])).toBe("seo");
  });

  it("returns redesign for outdated websites", async () => {
    expect(getOutreachAngle(["mentions website", "outdated presence"])).toBe("redesign");
  });

  it("returns booking for appointment pain points", async () => {
    expect(getOutreachAngle(["needs online booking"])).toBe("booking");
  });

  it("returns null for no pain points", async () => {
    expect(getOutreachAngle([])).toBeNull();
  });
});
