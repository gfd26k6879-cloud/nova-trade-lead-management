import { describe, expect, it } from "vitest";
import { parseMinReviewsFilter, POSTGRES_INT4_MAX } from "@/lib/lead-filter-parsing";

describe("minimum-review filter parsing", () => {
  it.each([
    ["0", 0],
    ["000", 0],
    ["42", 42],
    ["00042", 42],
    ["+42", 42],
    ["  +00042\n", 42],
    [String(POSTGRES_INT4_MAX), POSTGRES_INT4_MAX],
    [String(POSTGRES_INT4_MAX + 1), POSTGRES_INT4_MAX + 1],
    [String(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER],
  ])("accepts canonical string input %j", (input, expected) => {
    expect(parseMinReviewsFilter(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "-0",
    "-1",
    "4.5",
    ".5",
    "5.",
    "5reviews",
    "reviews5",
    "1e3",
    "0x10",
    "0b10",
    "0o10",
    "1_000",
    "1,000",
    "１２",
    "NaN",
    "Infinity",
    String(Number.MAX_SAFE_INTEGER + 1),
  ])("omits invalid string input %j", (input) => {
    expect(parseMinReviewsFilter(input)).toBeUndefined();
  });

  it("accepts primitive finite nonnegative safe integers and canonicalizes negative zero", () => {
    expect(parseMinReviewsFilter(0)).toBe(0);
    expect(parseMinReviewsFilter(-0)).toBe(0);
    expect(Object.is(parseMinReviewsFilter(-0), -0)).toBe(false);
    expect(parseMinReviewsFilter(42)).toBe(42);
    expect(parseMinReviewsFilter(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([
    -1,
    4.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])("omits invalid numeric input %j", (input) => {
    expect(parseMinReviewsFilter(input)).toBeUndefined();
  });

  it.each([
    null,
    undefined,
    true,
    false,
    BigInt(42),
    Object(42),
    { valueOf: () => 42 },
    [42],
    Symbol("42"),
  ])("omits non-primitive input", (input) => {
    expect(parseMinReviewsFilter(input)).toBeUndefined();
  });
});
