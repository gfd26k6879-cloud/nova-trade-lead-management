import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  AdaptiveQuestionQueuePanel,
  type AdaptiveQuestionQueueItem,
} from "@/components/knowledge/adaptive-question-queue-panel";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID } as const;

function question(overrides: Partial<AdaptiveQuestionQueueItem> = {}): AdaptiveQuestionQueueItem {
  return {
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    businessUnderstandingId: "business-understanding:novatrade",
    understandingVersionId: `understanding-version:${"a".repeat(64)}`,
    questionRef: "question-session:novatrade/uncertainty:channel-model/search-scope:v2",
    prompt: "Do you sell directly to formulators, through distributors, or both?",
    uncertaintyId: "uncertainty:channel-model",
    uncertaintyKind: "unknown",
    uncertaintySubject: "route to market",
    priority: 1,
    expectedValue: 18.5,
    repeatReason: "first_ask",
    status: "pending",
    blockedReason: null,
    updatedAt: "2026-08-30T15:15:00.000Z",
    availableActions: { answer: true, skip: true, open: true },
    ...overrides,
  };
}

describe("AdaptiveQuestionQueuePanel", () => {
  it("renders canonical scope, understanding binding, uncertainty, priority, value, status, and non-repetition summaries", () => {
    const html = renderToStaticMarkup(
      <AdaptiveQuestionQueuePanel
        state="ready"
        scope={SCOPE}
        questions={[
          question(),
          question({
            questionRef: "question-session:novatrade/uncertainty:buying-window/buying-center:v1",
            uncertaintyId: "uncertainty:buying-window",
            uncertaintyKind: "stale",
            uncertaintySubject: "next buying window",
            priority: 2,
            expectedValue: 9,
            repeatReason: "stale_fact",
            status: "answered",
            availableActions: { answer: false, skip: false, open: true },
          }),
        ]}
      />,
    );

    expect(html).toContain('data-surface="adaptive-question-queue-panel"');
    expect(html).toContain('aria-label="Canonical adaptive question queue"');
    expect(html).toContain("Exact queue scope");
    expect(html).toContain(TENANT_ID);
    expect(html).toContain(WORKSPACE_ID);
    expect(html).toContain("business-understanding:novatrade");
    expect(html).toContain(`understanding-version:${"a".repeat(64)}`);
    expect(html).toContain("Priority 1 · value 18.5");
    expect(html).toContain("uncertainty:channel-model");
    expect(html).toContain("First ask · no repeated question");
    expect(html).toContain("Re-asked · prior fact is stale");
    expect(html).toContain("Needs answer");
    expect(html).toContain("Answered");
  });

  it("renders accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<AdaptiveQuestionQueuePanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading adaptive question queue");

    const error = renderToStaticMarkup(<AdaptiveQuestionQueuePanel state="error" error="Queue snapshot unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Adaptive question queue unavailable");
    expect(error).toContain("Queue snapshot unavailable.");

    const empty = renderToStaticMarkup(<AdaptiveQuestionQueuePanel state="empty" />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No adaptive questions");

    const defensiveEmpty = renderToStaticMarkup(<AdaptiveQuestionQueuePanel state="ready" scope={SCOPE} questions={[]} />);
    expect(defensiveEmpty).toContain('data-state="STATE-EMPTY"');
  });

  it("shows only supplied actions allowed by the canonical item state", () => {
    const html = renderToStaticMarkup(
      <AdaptiveQuestionQueuePanel
        state="ready"
        scope={SCOPE}
        questions={[
          question(),
          question({
            questionRef: "question:answered",
            status: "answered",
            availableActions: { answer: true, skip: true, open: true },
          }),
          question({
            questionRef: "question:blocked",
            status: "blocked",
            blockedReason: "The underlying understanding version is no longer current.",
            availableActions: { answer: false, skip: false, open: false },
          }),
        ]}
        onAnswer={() => undefined}
        onSkip={() => undefined}
        onOpen={() => undefined}
      />,
    );

    expect(html.match(/>Answer question</g)).toHaveLength(1);
    expect(html.match(/>Skip for now</g)).toHaveLength(1);
    expect(html.match(/>Open question</g)).toHaveLength(2);
    expect(html.match(/<button\b/g)).toHaveLength(4);
    expect(html).toContain("The underlying understanding version is no longer current.");
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const readOnly = renderToStaticMarkup(<AdaptiveQuestionQueuePanel state="ready" scope={SCOPE} questions={[question()]} />);
    expect(readOnly).not.toMatch(/<button\b/u);
  });

  it("shows answered, skipped, and blocked status without inventing transitions", () => {
    const html = renderToStaticMarkup(
      <AdaptiveQuestionQueuePanel
        state="ready"
        scope={SCOPE}
        questions={[
          question({ questionRef: "question:answered", status: "answered", availableActions: { answer: false, skip: false, open: false } }),
          question({ questionRef: "question:skipped", status: "skipped", availableActions: { answer: false, skip: false, open: false } }),
          question({ questionRef: "question:blocked", status: "blocked", blockedReason: "Current evidence conflicts.", availableActions: { answer: false, skip: false, open: false } }),
        ]}
      />,
    );

    expect(html).toContain('data-question-status="answered"');
    expect(html).toContain('data-question-status="skipped"');
    expect(html).toContain('data-question-status="blocked"');
    expect(html).toContain("Answered");
    expect(html).toContain("Skipped");
    expect(html).toContain("Blocked");
    expect(html).toContain("Current evidence conflicts.");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("fails closed without enumerating questions from a mismatched scope", () => {
    const html = renderToStaticMarkup(
      <AdaptiveQuestionQueuePanel
        state="ready"
        scope={SCOPE}
        questions={[question({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onOpen={() => undefined}
      />,
    );

    expect(html).toContain("The adaptive question queue scope could not be verified.");
    expect(html).not.toContain("Do you sell directly");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("fails closed for mixed understanding bindings or duplicate question references", () => {
    const mixedBinding = renderToStaticMarkup(
      <AdaptiveQuestionQueuePanel
        state="ready"
        scope={SCOPE}
        questions={[
          question(),
          question({
            questionRef: "question:foreign-version",
            understandingVersionId: `understanding-version:${"b".repeat(64)}`,
          }),
        ]}
      />,
    );
    const duplicateRef = renderToStaticMarkup(
      <AdaptiveQuestionQueuePanel state="ready" scope={SCOPE} questions={[question(), question()]} />,
    );

    expect(mixedBinding).toContain("The adaptive question queue binding could not be verified.");
    expect(mixedBinding).not.toContain("Do you sell directly");
    expect(duplicateRef).toContain("The adaptive question queue binding could not be verified.");
    expect(duplicateRef).not.toContain('aria-label="Canonical adaptive question queue"');
  });

  it("uses one ordered heading hierarchy and a responsive, break-safe layout", () => {
    const html = renderToStaticMarkup(<AdaptiveQuestionQueuePanel state="ready" scope={SCOPE} questions={[question()]} />);

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="adaptive-question-queue-title"');
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>understanding-version:/u);
  });
});
