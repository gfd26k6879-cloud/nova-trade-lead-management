import { describe, expect, it } from "vitest";
import { buildQueryLocationLabel, isValidPostalCell, normalizePostalCode } from "@/lib/geography";

describe("international geography helpers", () => {
  it("normalizes and validates U.S. ZIP cells", () => {
    expect(normalizePostalCode("US", " 80202 ")).toBe("80202");
    expect(isValidPostalCell("US", "80202", "zip")).toBe(true);
    expect(isValidPostalCell("US", "M5V", "zip")).toBe(false);
  });

  it("normalizes and validates Canadian FSA cells", () => {
    expect(normalizePostalCode("CA", "m5v")).toBe("M5V");
    expect(isValidPostalCell("CA", "M5V", "postal_fsa")).toBe(true);
    expect(isValidPostalCell("CA", "M5V 2T6", "postal_fsa")).toBe(false);
  });

  it("normalizes and validates U.K. outward postcode cells", () => {
    expect(normalizePostalCode("GB", " sw1a ")).toBe("SW1A");
    expect(isValidPostalCell("GB", "SW1A", "postcode_outward")).toBe(true);
    expect(isValidPostalCell("GB", "EC", "postcode_area")).toBe(true);
    expect(isValidPostalCell("GB", "80202", "postcode_outward")).toBe(false);
  });

  it("builds country-aware Google Places query labels", () => {
    expect(buildQueryLocationLabel({ countryCode: "US", locality: "Denver", adminArea1: "CO", postalCode: "80202", cellType: "zip" })).toBe("Denver, CO, 80202, United States");
    expect(buildQueryLocationLabel({ countryCode: "CA", locality: "Toronto", adminArea1: "Ontario", postalCode: "M5V", cellType: "postal_fsa" })).toBe("Toronto, Ontario, M5V, Canada");
    expect(buildQueryLocationLabel({ countryCode: "GB", locality: "London", postalCode: "SW1A", cellType: "postcode_outward" })).toBe("London, SW1A, United Kingdom");
  });
});
