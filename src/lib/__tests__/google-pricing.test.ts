import { describe, expect, it } from "vitest";
import {
  estimateMarginalSkuCost,
  estimateSkuCost,
  type GooglePlacesSku,
} from "@/lib/google-pricing";

describe("google-pricing", () => {
  it("keeps total cost at zero inside free cap", async () => {
    const sku: GooglePlacesSku = "places_text_search_enterprise";
    expect(estimateSkuCost(sku, 0)).toBe(0);
    expect(estimateSkuCost(sku, 999)).toBe(0);
    expect(estimateSkuCost(sku, 1000)).toBe(0);
  });

  it("starts charging immediately after free cap", async () => {
    const sku: GooglePlacesSku = "places_text_search_enterprise";
    expect(estimateSkuCost(sku, 1001)).toBeCloseTo(0.035, 4);
    expect(estimateSkuCost(sku, 1010)).toBeCloseTo(0.35, 4);
  });

  it("computes marginal unit costs by SKU", async () => {
    const textMarginal = estimateMarginalSkuCost("places_text_search_enterprise", 1000, 1);
    expect(textMarginal.estimatedCost).toBeCloseTo(0.035, 4);
    expect(textMarginal.estimatedUnitPrice).toBeCloseTo(0.035, 4);

    const detailsMarginal = estimateMarginalSkuCost("places_place_details_enterprise", 1000, 2);
    expect(detailsMarginal.estimatedCost).toBeCloseTo(0.04, 4);
    expect(detailsMarginal.estimatedUnitPrice).toBeCloseTo(0.02, 4);

    const atmosphereMarginal = estimateMarginalSkuCost(
      "places_place_details_enterprise_plus_atmosphere",
      1000,
      1,
    );
    expect(atmosphereMarginal.estimatedCost).toBeCloseTo(0.025, 4);
  });
});
