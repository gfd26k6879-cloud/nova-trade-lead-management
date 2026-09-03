import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OnboardingFrame } from "@/components/onboarding-frame";

const steps = [
  { id: "scope", label: "Scope" },
  { id: "policy", label: "Policy" },
  { id: "materials", label: "Materials" },
  { id: "progress", label: "Progress" },
  { id: "complete", label: "Complete" },
];

describe("OnboardingFrame", () => {
  it("exposes resumable progress as an ordered current-step structure", () => {
    const html = renderToStaticMarkup(
      <OnboardingFrame
        title="Add business materials"
        description="Authorized sources become evidence-ready records."
        steps={steps}
        currentStepId="materials"
        savedLabel="Saved 10:42 AM"
        backAction={<a href="/onboarding?step=policy">Back</a>}
        nextAction={<a href="/onboarding?step=progress">Continue</a>}
      >
        <p>Material intake</p>
      </OnboardingFrame>,
    );

    expect(html).toContain('aria-label="Onboarding progress"');
    expect(html).toContain("Step 3 of 5");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Materials");
    expect(html).toContain("Saved 10:42 AM");
    expect(html).toContain("Material intake");
  });
});
