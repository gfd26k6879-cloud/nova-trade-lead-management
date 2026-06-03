import { describe, expect, it } from "vitest";
import { getAiVerificationDisplay } from "@/lib/ai-verification-display";

describe("AI verification display", () => {
  it("clearly labels leads that have never had AI verification run", () => {
    expect(getAiVerificationDisplay({ status: "not_checked", checkedAt: null, queueStatus: "not_checked" })).toMatchObject({
      label: "AI not run",
      hasRun: false,
      tone: "muted",
    });
  });

  it("distinguishes queued and running work from completed AI verification", () => {
    expect(getAiVerificationDisplay({ status: "not_checked", checkedAt: null, queueStatus: "queued" })).toMatchObject({
      label: "AI queued",
      hasRun: false,
      tone: "pending",
    });

    expect(getAiVerificationDisplay({ status: "not_checked", checkedAt: null, queueStatus: "running" })).toMatchObject({
      label: "AI running",
      hasRun: false,
      tone: "pending",
    });
  });

  it("clearly labels completed no-site, weak-site, usable-site, and failed runs", () => {
    expect(getAiVerificationDisplay({ status: "no_site_found", checkedAt: "2026-05-25T12:00:00Z" })).toMatchObject({
      label: "AI run: no usable site",
      hasRun: true,
      tone: "good",
    });

    expect(getAiVerificationDisplay({ status: "weak_site_found", checkedAt: "2026-05-25T12:00:00Z", viability: "broken" })).toMatchObject({
      label: "AI run: weak/broken site",
      hasRun: true,
      tone: "warning",
    });

    expect(getAiVerificationDisplay({ status: "site_found", checkedAt: "2026-05-25T12:00:00Z", viability: "usable" })).toMatchObject({
      label: "AI run: usable site",
      hasRun: true,
      tone: "bad",
    });

    expect(getAiVerificationDisplay({ status: "error", checkedAt: null, queueStatus: "error" })).toMatchObject({
      label: "AI run failed",
      hasRun: true,
      tone: "bad",
    });
  });
});
