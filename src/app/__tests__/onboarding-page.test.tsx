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
});
