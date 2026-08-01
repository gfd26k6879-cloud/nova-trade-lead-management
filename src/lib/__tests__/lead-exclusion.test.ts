import { describe, expect, it } from "vitest";
import { isLeadExcluded } from "@/lib/db/lead-exclusion";

describe("lead exclusion normalization", () => {
  it.each([
    { label: "numeric zero", value: 0, expected: false },
    { label: "negative numeric zero", value: -0, expected: false },
    { label: "boolean false", value: false, expected: false },
    { label: "numeric one", value: 1, expected: true },
    { label: "positive anomaly", value: 2, expected: true },
    { label: "negative anomaly", value: -1, expected: true },
    { label: "NaN", value: Number.NaN, expected: true },
    { label: "positive infinity", value: Number.POSITIVE_INFINITY, expected: true },
    { label: "boolean true", value: true, expected: true },
    { label: "null", value: null, expected: true },
    { label: "undefined", value: undefined, expected: true },
    { label: "string zero", value: "0", expected: true },
    { label: "empty string", value: "", expected: true },
    { label: "bigint zero", value: BigInt(0), expected: true },
    { label: "object", value: {}, expected: true },
    { label: "array", value: [], expected: true },
  ])("maps $label to excluded=$expected", ({ value, expected }) => {
    expect(isLeadExcluded(value)).toBe(expected);
  });
});
