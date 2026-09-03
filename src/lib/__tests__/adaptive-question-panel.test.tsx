import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AdaptiveQuestionPanel } from "@/components/knowledge/adaptive-question-panel";
import {
  planAdaptiveQuestionSession,
  recordQuestionAnswer,
  type AdaptiveQuestionSession,
  type QuestionAnswerRecord,
} from "@/lib/understanding/question-planner";

const UNDERSTANDING_VERSION_ID = `understanding-version:${"a".repeat(64)}`;
const SESSION_REF = "question-session:industrial-1";

function answerHistory(): readonly QuestionAnswerRecord[] {
  const result = recordQuestionAnswer({
    version: 1,
    answerId: "answer:prior-route",
    tenantRef: "tenant:alpha",
    sessionRef: SESSION_REF,
    understandingVersionId: UNDERSTANDING_VERSION_ID,
    questionRef: `${SESSION_REF}/uncertainty:channel-model/qualification:v1`,
    uncertaintyId: "uncertainty:channel-model",
    questionIdentity: "channel-model:route-to-market",
    decisionKey: "qualification:v1",
    disposition: "answered",
    answerText: "Distributor-led sales supported the earlier qualification decision.",
    evidenceRefs: ["evidence:channel-notes"],
    recordedAt: "2026-08-29T18:00:00.000Z",
    supersedesAnswerId: null,
  });
  if (!result.ok) throw new Error(result.code);
  return [result.answer];
}

function session(history: readonly QuestionAnswerRecord[] = answerHistory()): AdaptiveQuestionSession {
  const result = planAdaptiveQuestionSession({
    version: 1,
    policyVersion: "adaptive-question-value-v1",
    tenantRef: "tenant:alpha",
    sessionRef: SESSION_REF,
    understandingVersionId: UNDERSTANDING_VERSION_ID,
    maxQuestions: 2,
    uncertainties: [
      {
        uncertaintyId: "uncertainty:channel-model",
        questionIdentity: "channel-model:route-to-market",
        domain: "channel_model",
        subject: "route to market",
        kind: "unknown",
        factStatus: "unknown",
        freshness: "current",
        conflict: "none",
        confirmedForDecision: null,
        decisionKey: "search-scope:v2",
        prompt: "Do you sell directly to formulators, through distributors, or both?",
        whyItMatters: "The route to market changes which accounts belong in discovery.",
        unlocks: ["Choose direct buyers and channel partners for discovery."],
        impacts: [
          { area: "search_scope", magnitude: 5 },
          { area: "qualification", magnitude: 4 },
        ],
        uncertaintySeverity: 5,
        userEffort: 1,
        sensitivityRisk: 0,
      },
      {
        uncertaintyId: "uncertainty:procurement-window",
        questionIdentity: "procurement:buying-window",
        domain: "procurement",
        subject: "next buying window",
        kind: "stale",
        factStatus: "expired",
        freshness: "expired",
        conflict: "none",
        confirmedForDecision: "buying-center:v1",
        decisionKey: "buying-center:v1",
        prompt: "When does the next procurement review begin?",
        whyItMatters: "Current timing changes which buying-center roles should be researched first.",
        unlocks: ["Prioritize the roles active in the current buying window."],
        impacts: [{ area: "buying_center", magnitude: 4 }],
        uncertaintySeverity: 3,
        userEffort: 1,
        sensitivityRisk: 0,
      },
    ],
    answerHistory: history,
  });
  if (!result.ok) throw new Error(result.code);
  return result.session;
}

describe("AdaptiveQuestionPanel", () => {
  it("shows the exact understanding binding, targeted uncertainty, rank, rationale, and non-repetition context", () => {
    const history = answerHistory();
    const current = session(history);
    const html = renderToStaticMarkup(
      <AdaptiveQuestionPanel state="ready" session={current} answerHistory={history} />,
    );

    expect(html).toContain('data-surface="adaptive-question-panel"');
    expect(html).toContain('data-binding-valid="true"');
    expect(html).toContain(UNDERSTANDING_VERSION_ID);
    expect(html).toContain(SESSION_REF);
    expect(html).toContain("adaptive-question-value-v1");
    expect(html).toContain("Priority 1");
    expect(html).toContain("Targets uncertainty");
    expect(html).toContain("uncertainty:channel-model");
    expect(html).toContain("Why this question now");
    expect(html).toContain("Choose direct buyers and channel partners for discovery.");
    expect(html).toContain("Different decision");
    expect(html).toContain("Distributor-led sales supported the earlier qualification decision.");
    expect(html).toContain("qualification:v1");
    expect(html).toContain("Stale fact");
  });

  it("renders accessible loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<AdaptiveQuestionPanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading adaptive questions");

    const error = renderToStaticMarkup(
      <AdaptiveQuestionPanel state="error" error="The exact question session could not be loaded." />,
    );
    expect(error).toContain('role="alert"');
    expect(error).toContain("Adaptive questions unavailable");
    expect(error).toContain("The exact question session could not be loaded.");

    const empty = renderToStaticMarkup(<AdaptiveQuestionPanel state="ready" session={null} />);
    expect(empty).toContain('data-state="STATE-EMPTY"');
    expect(empty).toContain("No adaptive question needs attention");
    expect(empty).not.toMatch(/<button\b/u);
  });

  it("exposes answer and skip controls only for the exact active planned question", () => {
    const current = session([]);
    const active = current.questions[0];
    const html = renderToStaticMarkup(
      <AdaptiveQuestionPanel
        state="ready"
        session={current}
        activeQuestionRef={active.questionRef}
        onAnswer={() => undefined}
        onSkip={() => undefined}
      />,
    );

    expect(html).toContain('data-active-question-valid="true"');
    expect(html.match(/<button\b/g)).toHaveLength(2);
    expect(html).toContain("Answer question");
    expect(html).toContain("Skip for now");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).toContain("They do not update understanding automatically.");
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);

    const noActiveQuestion = renderToStaticMarkup(
      <AdaptiveQuestionPanel
        state="ready"
        session={current}
        onAnswer={() => undefined}
        onSkip={() => undefined}
      />,
    );
    expect(noActiveQuestion).not.toMatch(/<button\b/u);

    const staleActiveQuestion = renderToStaticMarkup(
      <AdaptiveQuestionPanel
        state="ready"
        session={current}
        activeQuestionRef="question-session:other/uncertainty:other/decision:other"
        onAnswer={() => undefined}
        onSkip={() => undefined}
      />,
    );
    expect(staleActiveQuestion).toContain('data-active-question-valid="false"');
    expect(staleActiveQuestion).toContain("The active question is not in this exact plan");
    expect(staleActiveQuestion).not.toMatch(/<button\b/u);
  });

  it("fails closed when prior-answer scope does not match the exact session binding", () => {
    const current = session([]);
    const active = current.questions[0];
    const foreignHistory = answerHistory().map((answer) => ({ ...answer, tenantRef: "tenant:beta" }));
    const html = renderToStaticMarkup(
      <AdaptiveQuestionPanel
        state="ready"
        session={current}
        answerHistory={foreignHistory}
        activeQuestionRef={active.questionRef}
        onAnswer={() => undefined}
        onSkip={() => undefined}
      />,
    );

    expect(html).toContain('data-binding-valid="false"');
    expect(html).toContain("Exact question binding could not be verified");
    expect(html).not.toContain("Distributor-led sales supported the earlier qualification decision.");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("uses ordered landmarks and a responsive, break-safe operational layout", () => {
    const html = renderToStaticMarkup(<AdaptiveQuestionPanel state="ready" session={session([])} />);

    expect(html.match(/<h2\b/g)).toHaveLength(1);
    expect(html.indexOf("<h2")).toBeLessThan(html.indexOf("<h3"));
    expect(html).toContain('aria-labelledby="adaptive-question-panel-title"');
    expect(html).toContain('aria-labelledby="adaptive-question-binding-title"');
    expect(html).toContain('aria-label="Prioritized adaptive questions"');
    expect(html).toContain("xl:grid-cols-2");
    expect(html).toContain("md:grid-cols-2");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>understanding-version:/u);
  });
});
