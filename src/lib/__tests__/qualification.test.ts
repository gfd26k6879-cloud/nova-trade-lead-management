import { describe, expect, it } from "vitest";
import {
  computeContactabilityScore,
  estimateDealValue,
  normalizeSellingNiche,
  qualifyLead,
} from "@/lib/qualification";

describe("qualification helpers", () => {
  it("normalizes Google categories into selling niches", async () => {
    expect(normalizeSellingNiche(["dentist", "health"])).toBe("dental");
    expect(normalizeSellingNiche(["car_repair", "point_of_interest"])).toBe("auto_services");
    expect(normalizeSellingNiche(["unknown"])).toBe("local_services");
  });

  it("scores contactability from phone, address, and maps URL", () => {
    expect(computeContactabilityScore({ phone: "303-555-0100", address: "Denver", mapsUri: "https://maps.google.com" })).toBe(1);
    expect(computeContactabilityScore({ phone: null, address: "Denver", mapsUri: null })).toBe(0.3);
  });

  it("estimates larger deal values for stronger niches and website gaps", async () => {
    const dentalNoSite = estimateDealValue(["dentist"], "none");
    const restaurantCustom = estimateDealValue(["restaurant"], "custom");
    expect(dentalNoSite).toBeGreaterThan(restaurantCustom);
  });

  it("disqualifies custom websites by default", async () => {
    const result = qualifyLead({
      categories: ["plumber"],
      websiteStatus: "custom",
      phone: "303-555-0100",
      address: "Denver",
      score: 20,
    });

    expect(result.qualificationStatus).toBe("disqualified");
    expect(result.disqualificationReason).toContain("custom-domain");
  });

  it("qualifies contactable high-score weak-website leads", async () => {
    const result = qualifyLead({
      categories: ["plumber"],
      websiteStatus: "none",
      phone: "303-555-0100",
      address: "Denver",
      mapsUri: "https://maps.google.com",
      score: 12,
    });

    expect(result.qualificationStatus).toBe("qualified");
    expect(result.contactabilityScore).toBe(1);
  });
});
