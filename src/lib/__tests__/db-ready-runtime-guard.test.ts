import { describe, expect, it } from "vitest";
import { shouldRunRuntimeGeographyBackfillForEnv } from "@/lib/db/queries";

describe("runtime geography backfill guard", () => {
  it("does not run data backfill in production database mode unless explicitly enabled", () => {
    expect(shouldRunRuntimeGeographyBackfillForEnv("postgres://example", undefined)).toBe(false);
    expect(shouldRunRuntimeGeographyBackfillForEnv("postgres://example", "0")).toBe(false);
    expect(shouldRunRuntimeGeographyBackfillForEnv("postgres://example", "1")).toBe(true);
  });

  it("allows local sqlite runtime backfill for developer databases", () => {
    expect(shouldRunRuntimeGeographyBackfillForEnv("", undefined)).toBe(true);
    expect(shouldRunRuntimeGeographyBackfillForEnv(undefined, undefined)).toBe(true);
  });
});
