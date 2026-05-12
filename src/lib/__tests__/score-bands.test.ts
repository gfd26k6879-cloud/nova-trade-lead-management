import { describe, expect, it } from "vitest";
import {
  computeScoreBandThresholds,
  formatScoreBandRange,
  resolveScoreBand,
} from "@/lib/score-bands";

describe("score band domain logic", () => {
  it("uses fallback thresholds for low sample sizes", async () => {
    const thresholds = computeScoreBandThresholds([1, 2, 3, 4, 5]);
    expect(thresholds.usesFallback).toBe(true);
    expect(thresholds.sampleSize).toBe(5);
    expect(thresholds.p25).toBe(5);
    expect(thresholds.p50).toBe(10);
    expect(thresholds.p75).toBe(16);
    expect(thresholds.p90).toBe(19);
    expect(thresholds.p97).toBe(22);
  });

  it("computes dynamic thresholds from larger score sets", async () => {
    const thresholds = computeScoreBandThresholds(Array.from({ length: 20 }, (_, idx) => idx + 1));
    expect(thresholds.usesFallback).toBe(false);
    expect(thresholds.sampleSize).toBe(20);
    expect(thresholds.p25).toBe(5.8);
    expect(thresholds.p50).toBe(10.5);
    expect(thresholds.p75).toBe(15.3);
    expect(thresholds.p90).toBe(18.1);
    expect(thresholds.p97).toBe(19.4);
  });

  it("resolves bands from thresholds in ascending order", async () => {
    const thresholds = computeScoreBandThresholds(Array.from({ length: 20 }, (_, idx) => idx + 1));
    expect(resolveScoreBand(4.5, thresholds).key).toBe("low");
    expect(resolveScoreBand(9.9, thresholds).key).toBe("fair");
    expect(resolveScoreBand(14.2, thresholds).key).toBe("good");
    expect(resolveScoreBand(17.3, thresholds).key).toBe("high");
    expect(resolveScoreBand(18.8, thresholds).key).toBe("hot");
    expect(resolveScoreBand(30, thresholds).key).toBe("probably_win");
  });

  it("formats human-readable range labels", async () => {
    const thresholds = computeScoreBandThresholds(Array.from({ length: 20 }, (_, idx) => idx + 1));
    expect(formatScoreBandRange("low", thresholds)).toBe("<= 5.8");
    expect(formatScoreBandRange("fair", thresholds)).toBe("5.8 - 10.5");
    expect(formatScoreBandRange("good", thresholds)).toBe("10.5 - 15.3");
    expect(formatScoreBandRange("high", thresholds)).toBe("15.3 - 18.1");
    expect(formatScoreBandRange("hot", thresholds)).toBe("18.1 - 19.4");
    expect(formatScoreBandRange("probably_win", thresholds)).toBe("> 19.4");
  });
});
