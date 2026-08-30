import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  OnboardingProgressPanel,
  type OnboardingProgressReadModel,
} from "@/components/onboarding/onboarding-progress-panel";

function progress(): OnboardingProgressReadModel {
  return {
    workflowRef: "launch-workflow:alpha:v3",
    workspaceLabel: "North America growth",
    updatedAt: "2026-08-30T16:45:00.000Z",
    steps: [
      {
        id: "source_intake",
        label: "Source intake",
        description: "Bring approved business materials into the private intake path.",
        status: "complete",
        statusDetail: "Two source documents cleared quarantine.",
        completedAt: "2026-08-30T14:00:00.000Z",
        navigation: { decision: "allowed", label: "Review sources" },
      },
      {
        id: "extraction_review",
        label: "Extraction review",
        description: "Verify extracted claims against evidence and citations.",
        status: "complete",
        statusDetail: "Twelve claims were accepted by a reviewer.",
        completedAt: "2026-08-30T15:00:00.000Z",
        navigation: { decision: "allowed", label: "Review extraction" },
      },
      {
        id: "business_understanding",
        label: "Business understanding",
        description: "Confirm the exact version that will govern strategy work.",
        status: "complete",
        statusDetail: "Understanding version 3 is human approved.",
        completedAt: "2026-08-30T16:00:00.000Z",
        navigation: { decision: "allowed", label: "Open understanding" },
      },
      {
        id: "adaptive_questions",
        label: "Adaptive questions",
        description: "Resolve the highest-value uncertainty without repeating known answers.",
        status: "in_progress",
        statusDetail: "One buying-window question needs an answer.",
        completedAt: null,
        navigation: { decision: "allowed", label: "Answer question" },
      },
      {
        id: "icp_approval",
        label: "ICP approval",
        description: "Review evidence-backed fit and exclusion criteria.",
        status: "blocked",
        statusDetail: "Waiting for the active question to be resolved.",
        completedAt: null,
        navigation: { decision: "blocked", reason: "Complete adaptive questions before ICP review." },
      },
      {
        id: "lead_play_approval",
        label: "Lead-play approval",
        description: "Approve the exact strategy play before activation is considered.",
        status: "not_started",
        statusDetail: "No play version is ready for review.",
        completedAt: null,
        navigation: { decision: "blocked", reason: "An approved ICP is required first." },
      },
    ],
  };
}

describe("OnboardingProgressPanel", () => {
  it("renders the launch sequence, current stage, and accessible completion summary", () => {
    const html = renderToStaticMarkup(<OnboardingProgressPanel state="ready" progress={progress()} />);

    expect(html).toContain('data-surface="onboarding-progress-panel"');
    expect(html).toContain('data-onboarding-progress-state="ready"');
    expect(html).toContain('aria-label="Launch onboarding stages"');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain("3 of 6 stages complete");
    expect(html).toContain("50%");
    expect(html).toContain("Now: Adaptive questions");
    expect(html).toContain("launch-workflow:alpha:v3");

    const expectedOrder = [
      "source_intake",
      "extraction_review",
      "business_understanding",
      "adaptive_questions",
      "icp_approval",
      "lead_play_approval",
    ];
    expectedOrder.reduce((lastIndex, stepId) => {
      const nextIndex = html.indexOf(`data-onboarding-step="${stepId}"`);
      expect(nextIndex).toBeGreaterThan(lastIndex);
      return nextIndex;
    }, -1);
  });

  it("offers navigation only where the supplied read model allows it", () => {
    const html = renderToStaticMarkup(
      <OnboardingProgressPanel state="ready" progress={progress()} onNavigate={() => undefined} />,
    );

    expect(html.match(/data-onboarding-action="navigate"/g)).toHaveLength(4);
    expect(html).toContain("Review sources");
    expect(html).toContain("Answer question");
    expect(html).toContain('data-onboarding-step="icp_approval"');
    expect(html).toContain('data-navigation-decision="blocked"');
    expect(html).toContain("Complete adaptive questions before ICP review.");
    expect(html).toContain("An approved ICP is required first.");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
    expect(html).toContain("Navigation does not approve, activate, extract, or change any launch state.");

    const withoutCallback = renderToStaticMarkup(
      <OnboardingProgressPanel state="ready" progress={progress()} />,
    );
    expect(withoutCallback).not.toMatch(/<button\b/u);
  });

  it("uses explicit non-color labels for every supplied stage state", () => {
    const current = progress();
    const html = renderToStaticMarkup(
      <OnboardingProgressPanel
        state="ready"
        progress={{
          ...current,
          steps: current.steps.map((step, index) => ({
            ...step,
            status: (["complete", "in_progress", "ready", "blocked", "not_started", "complete"] as const)[index] ?? "not_started",
          })),
        }}
      />,
    );

    expect(html).toContain('aria-label="Status: Complete"');
    expect(html).toContain('aria-label="Status: In progress"');
    expect(html).toContain('aria-label="Status: Ready"');
    expect(html).toContain('aria-label="Status: Blocked"');
    expect(html).toContain('aria-label="Status: Not started"');
    expect(html).toContain('data-step-status="in_progress"');
    expect(html).toContain('data-state="STATE-BLOCKED"');
  });

  it("renders accessible loading, error, and empty states without actions", () => {
    const loading = renderToStaticMarkup(<OnboardingProgressPanel state="loading" />);
    expect(loading).toContain('data-onboarding-progress-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading launch progress");

    const error = renderToStaticMarkup(
      <OnboardingProgressPanel state="error" error="The canonical workflow read model could not be loaded." />,
    );
    expect(error).toContain('data-onboarding-progress-state="error"');
    expect(error).toContain('role="alert"');
    expect(error).toContain("The canonical workflow read model could not be loaded.");

    const empty = renderToStaticMarkup(<OnboardingProgressPanel state="ready" progress={null} />);
    expect(empty).toContain('data-onboarding-progress-state="empty"');
    expect(empty).toContain("No launch workflow yet");
    expect(`${loading}${error}${empty}`).not.toMatch(/<button\b/u);
  });

  it("uses responsive break-safe cards with one ordered heading hierarchy", () => {
    const html = renderToStaticMarkup(<OnboardingProgressPanel state="ready" progress={progress()} />);

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("xl:grid-cols-3");
    expect(html).toContain("break-all");
    expect(html).toContain("min-w-0");
  });
});
