import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import OnboardingPage from "@/app/(protected)/onboarding/page";

describe("fixture-backed onboarding page", () => {
  it("renders a resumable material-intake frame with independent item states", () => {
    const html = renderToStaticMarkup(<OnboardingPage />);

    expect(html).toContain("Add business materials");
    expect(html).toContain("Tenant-wide responsibility checkpoint");
    expect(html).toContain("Product catalog 2026.pdf");
    expect(html).toContain("Ready");
    expect(html).toContain("Extracting");
    expect(html).toContain("Duplicate");
    expect(html).toContain("Unsupported");
    expect(html).toContain("ready items are preserved");
    expect(html).toContain('href="/dashboard"');
  });

  it("associates every disabled fixture action with one visible explanation", () => {
    const html = renderToStaticMarkup(<OnboardingPage />);

    expect(html.match(/id="fixture-intake-disabled-explanation"/g)).toHaveLength(1);
    expect(html).toContain("Preview only: file, link, note, and Continue actions are unavailable");
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(4);
    expect(html.match(/aria-describedby="fixture-intake-disabled-explanation"/g)).toHaveLength(4);

    for (const label of ["Choose files", "Add a link", "Add a note", "Continue"]) {
      expect(html).toMatch(
        new RegExp(`<button[^>]*disabled=""[^>]*aria-describedby="fixture-intake-disabled-explanation"[^>]*>${label}<\\/button>`),
      );
    }
  });

  it("gives every queue state an explicit non-color accessible label", () => {
    const html = renderToStaticMarkup(<OnboardingPage />);

    for (const [state, symbol] of [
      ["Ready", "✓"],
      ["Extracting", "○"],
      ["Duplicate", "!"],
      ["Validating", "○"],
      ["Unsupported", "!"],
    ] as const) {
      expect(html).toMatch(
        new RegExp(`data-queue-status="true"[^>]*aria-label="Queue status: ${state}"[^>]*>[\\s\\S]*?<span aria-hidden="true">${symbol}<\\/span> ${state}`),
      );
    }
  });

  it("wraps queue content and keeps small-screen controls full-width and touch-sized", () => {
    const html = renderToStaticMarkup(<OnboardingPage />);

    expect(html).toMatch(/class="break-words text-sm font-medium"[^>]*>Product catalog 2026\.pdf<\/p>/);
    expect(html).toMatch(/class="mt-1 break-words text-xs"[^>]*>PDF · 8\.2 MB · client-provided<\/p>/);
    expect(html).toMatch(/class="min-w-0 break-words text-sm font-medium"[^>]*data-queue-status="true"/);
    expect(html).toMatch(/class="min-w-0 break-words text-xs leading-relaxed"[^>]*>42 pages · 188 facts<\/p>/);
    expect(html).toContain("mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2");

    for (const [tag, label] of [
      ["a", "Back to dashboard"],
      ["button", "Continue"],
      ["button", "Choose files"],
      ["button", "Add a link"],
      ["button", "Add a note"],
    ] as const) {
      expect(html).toMatch(
        new RegExp(`<${tag}[^>]*class="[^"]*min-h-11[^"]*w-full[^"]*"[^>]*>${label}<\\/${tag}>`),
      );
    }
  });
});
