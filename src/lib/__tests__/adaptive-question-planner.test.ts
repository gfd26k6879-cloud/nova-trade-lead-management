import { describe, expect, it } from "vitest";

import {
  MAX_ADAPTIVE_QUESTIONS_PER_SESSION,
  planAdaptiveQuestionSession,
  recordQuestionAnswer,
} from "@/lib/understanding/question-planner";

const UNDERSTANDING_VERSION_ID = `understanding-version:${"a".repeat(64)}`;

function uncertainty(overrides: Record<string, unknown> = {}) {
  return {
    uncertaintyId: "uncertainty:channel-model",
    questionIdentity: "channel-model:route-to-market",
    domain: "channel_model",
    subject: "route to market",
    kind: "unknown",
    factStatus: "unknown",
    freshness: "current",
    conflict: "none",
    confirmedForDecision: null,
    decisionKey: "search-scope:v1",
    prompt: "Do you sell directly to formulators, through distributors, or both?",
    whyItMatters: "The route to market changes which accounts are relevant.",
    unlocks: ["Choose direct buyers and channel partners for discovery."],
    impacts: [
      { area: "search_scope", magnitude: 5 },
      { area: "qualification", magnitude: 4 },
    ],
    uncertaintySeverity: 5,
    userEffort: 1,
    sensitivityRisk: 0,
    ...overrides,
  };
}

function planInput(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    policyVersion: "adaptive-question-value-v1",
    tenantRef: "tenant:alpha",
    sessionRef: "question-session:industrial-1",
    understandingVersionId: UNDERSTANDING_VERSION_ID,
    maxQuestions: 1,
    uncertainties: [uncertainty()],
    answerHistory: [],
    ...overrides,
  };
}

function answer(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    answerId: "answer:1",
    tenantRef: "tenant:alpha",
    sessionRef: "question-session:industrial-1",
    understandingVersionId: UNDERSTANDING_VERSION_ID,
    questionRef: "question:1",
    uncertaintyId: "uncertainty:channel-model",
    questionIdentity: "channel-model:route-to-market",
    decisionKey: "search-scope:v1",
    disposition: "answered",
    answerText: "Both direct and distributor channels are in scope.",
    evidenceRefs: ["evidence:channel-policy-v1"],
    recordedAt: "2026-08-29T18:00:00.000Z",
    supersedesAnswerId: null,
    ...overrides,
  };
}

describe("adaptive question planning", () => {
  it("binds a plan to one exact understanding version", () => {
    const result = planAdaptiveQuestionSession(planInput());

    expect(result).toMatchObject({
      ok: true,
      session: {
        tenantRef: "tenant:alpha",
        sessionRef: "question-session:industrial-1",
        understandingVersionId: UNDERSTANDING_VERSION_ID,
      },
    });
  });

  it("chooses one discriminating industrial question and explains its expected value", () => {
    const result = planAdaptiveQuestionSession(planInput({
      uncertainties: [
        uncertainty(),
        uncertainty({
          uncertaintyId: "uncertainty:brand-voice",
          domain: "brand_voice",
          subject: "preferred tone",
          decisionKey: "outreach-style:v1",
          prompt: "Which writing tone should drafts use?",
          whyItMatters: "Tone affects draft review.",
          unlocks: ["Prepare a style hypothesis for review."],
          impacts: [{ area: "play", magnitude: 1 }],
          uncertaintySeverity: 2,
          userEffort: 2,
        }),
      ],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.session.questions).toHaveLength(1);
    expect(result.session.questions[0]).toMatchObject({
      uncertaintyId: "uncertainty:channel-model",
      questionIdentity: "channel-model-route-to-market",
      rank: 1,
      prompt: "Do you sell directly to formulators, through distributors, or both?",
      whyItMatters: "The route to market changes which accounts are relevant.",
      unlocks: ["Choose direct buyers and channel partners for discovery."],
      repeatReason: "first_ask",
      score: {
        policyVersion: "adaptive-question-value-v1",
        impactPoints: 9,
        uncertaintyMultiplier: 5,
        effortRiskDivisor: 1,
        priorDeferralPenalty: 0,
        expectedValue: 45000,
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.session)).toBe(true);
    expect(Object.isFrozen(result.session.questions)).toBe(true);
    expect(Object.isFrozen(result.session.questions[0].score)).toBe(true);
  });

  it("uses the same generic policy to produce a materially different non-industrial question", () => {
    const result = planAdaptiveQuestionSession(planInput({
      sessionRef: "question-session:consultancy-1",
      uncertainties: [uncertainty({
        uncertaintyId: "uncertainty:engagement-entry",
        domain: "engagement_model",
        subject: "initial consulting engagement",
        decisionKey: "qualification:v2",
        prompt: "Do buyers usually begin with a workshop, an assessment, or a retained engagement?",
        whyItMatters: "The initial commitment changes qualification and buying signals.",
        unlocks: ["Define engagement-specific qualification evidence."],
        impacts: [
          { area: "qualification", magnitude: 5 },
          { area: "buying_center", magnitude: 4 },
        ],
      })],
    }));

    expect(result).toMatchObject({
      ok: true,
      session: {
        questions: [{
          domain: "engagement_model",
          prompt: "Do buyers usually begin with a workshop, an assessment, or a retained engagement?",
        }],
      },
    });
    if (result.ok) {
      expect(result.session.questions[0].prompt).not.toMatch(/formulator|distributor|manufactur/i);
    }
  });

  it("suppresses a current confirmed fact for the same decision", () => {
    const result = planAdaptiveQuestionSession(planInput({
      uncertainties: [uncertainty({
        factStatus: "confirmed",
        confirmedForDecision: "search-scope:v1",
      })],
    }));

    expect(result).toEqual({
      ok: true,
      code: "NO_ELIGIBLE_QUESTIONS",
      session: {
        version: 1,
        policyVersion: "adaptive-question-value-v1",
        tenantRef: "tenant:alpha",
        sessionRef: "question-session:industrial-1",
        understandingVersionId: UNDERSTANDING_VERSION_ID,
        questions: [],
      },
    });
  });

  it.each([
    [
      "stale_fact",
      { kind: "stale", factStatus: "confirmed", freshness: "stale", confirmedForDecision: "search-scope:v1" },
    ],
    [
      "conflicting_fact",
      { kind: "conflict", factStatus: "disputed", conflict: "conflicting", confirmedForDecision: "search-scope:v1" },
    ],
    [
      "different_decision",
      { factStatus: "confirmed", confirmedForDecision: "qualification:v1", decisionKey: "search-scope:v1" },
    ],
  ])("allows a confirmed-fact re-ask only for %s", (repeatReason, overrides) => {
    const result = planAdaptiveQuestionSession(planInput({ uncertainties: [uncertainty(overrides)] }));

    expect(result).toMatchObject({
      ok: true,
      code: "QUESTIONS_PLANNED",
      session: { questions: [{ repeatReason }] },
    });
  });

  it("does not repeat any prior answer disposition for the same uncertainty and decision", () => {
    for (const [disposition, answerText] of [
      ["answered", "Direct and distributor channels."],
      ["corrected", "Distributor channel only."],
      ["deferred", null],
      ["dismissed", null],
      ["unknown", null],
      ["not_applicable", "This decision is outside the approved play scope."],
    ] as const) {
      const current = answer({
        disposition,
        answerText,
        supersedesAnswerId: disposition === "corrected" ? "answer:0" : null,
      });
      const result = planAdaptiveQuestionSession(planInput({
        answerHistory: disposition === "corrected"
          ? [answer({ answerId: "answer:0", recordedAt: "2026-08-29T17:00:00.000Z" }), current]
          : [current],
      }));
      expect(result).toMatchObject({ ok: true, code: "NO_ELIGIBLE_QUESTIONS" });
    }
  });

  it("uses only answer history bound to the exact session and understanding version", () => {
    const result = planAdaptiveQuestionSession(planInput({
      answerHistory: [answer({
        sessionRef: "question-session:industrial-1",
        understandingVersionId: UNDERSTANDING_VERSION_ID,
      })],
    }));

    expect(result).toMatchObject({ ok: true, code: "NO_ELIGIBLE_QUESTIONS" });
  });

  it("suppresses a rephrased repeat with a changed uncertainty ID by normalized question identity", () => {
    const result = planAdaptiveQuestionSession(planInput({
      uncertainties: [uncertainty({
        uncertaintyId: "uncertainty:new-channel-label",
        questionIdentity: "  CHANNEL MODEL / Route To Market  ",
        prompt: "Which routes do you use to reach formulators: direct sales, distribution, or both?",
      })],
      answerHistory: [answer()],
    }));

    expect(result).toEqual({
      ok: true,
      code: "NO_ELIGIBLE_QUESTIONS",
      session: {
        version: 1,
        policyVersion: "adaptive-question-value-v1",
        tenantRef: "tenant:alpha",
        sessionRef: "question-session:industrial-1",
        understandingVersionId: UNDERSTANDING_VERSION_ID,
        questions: [],
      },
    });
  });

  it("emits only the highest-value candidate for a normalized duplicate question identity", () => {
    const result = planAdaptiveQuestionSession(planInput({
      maxQuestions: 2,
      uncertainties: [
        uncertainty({ uncertaintyId: "uncertainty:lower", uncertaintySeverity: 2 }),
        uncertainty({
          uncertaintyId: "uncertainty:higher",
          questionIdentity: "CHANNEL MODEL / ROUTE TO MARKET",
          prompt: "Which route reaches your buyers?",
          uncertaintySeverity: 5,
        }),
      ],
    }));

    expect(result).toMatchObject({
      ok: true,
      session: { questions: [{ uncertaintyId: "uncertainty:higher", questionIdentity: "channel-model-route-to-market" }] },
    });
    if (result.ok) expect(result.session.questions).toHaveLength(1);
  });

  it("deduplicates semantics within a decision without hiding a distinct decision", () => {
    const result = planAdaptiveQuestionSession(planInput({
      maxQuestions: 2,
      uncertainties: [
        uncertainty({ uncertaintyId: "uncertainty:a", decisionKey: "search-scope:v1" }),
        uncertainty({
          uncertaintyId: "uncertainty:b",
          questionIdentity: "CHANNEL MODEL / ROUTE TO MARKET",
          decisionKey: "qualification:v2",
        }),
      ],
    }));

    expect(result).toMatchObject({
      ok: true,
      session: {
        questions: [
          { uncertaintyId: "uncertainty:a", decisionKey: "search-scope:v1" },
          { uncertaintyId: "uncertainty:b", decisionKey: "qualification:v2" },
        ],
      },
    });
  });

  it.each([
    ["tenant", { tenantRef: "tenant:beta" }],
    ["session", { sessionRef: "question-session:other" }],
    ["understanding version", { understandingVersionId: `understanding-version:${"b".repeat(64)}` }],
  ])("rejects answer history from another %s binding", (_label, override) => {
    expect(planAdaptiveQuestionSession(planInput({
      answerHistory: [answer(override)],
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("permits a prior uncertainty only when the new question names a different decision", () => {
    const result = planAdaptiveQuestionSession(planInput({
      uncertainties: [uncertainty({
        uncertaintyId: "uncertainty:renamed-channel-model",
        questionIdentity: "CHANNEL MODEL / ROUTE TO MARKET",
        decisionKey: "qualification:v2",
      })],
      answerHistory: [answer()],
    }));

    expect(result).toMatchObject({
      ok: true,
      session: { questions: [{ decisionKey: "qualification:v2", repeatReason: "different_decision" }] },
    });
  });

  it("caps a session at five and resolves score ties by stable uncertainty ID", () => {
    const uncertainties = Array.from({ length: 7 }, (_, index) => uncertainty({
      uncertaintyId: `uncertainty:${String.fromCharCode(103 - index)}`,
      questionIdentity: `question:${String.fromCharCode(103 - index)}`,
      decisionKey: `decision:${index}`,
    }));
    const result = planAdaptiveQuestionSession(planInput({
      maxQuestions: MAX_ADAPTIVE_QUESTIONS_PER_SESSION,
      uncertainties,
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.questions.map(({ uncertaintyId, rank }) => [uncertaintyId, rank])).toEqual([
      ["uncertainty:a", 1],
      ["uncertainty:b", 2],
      ["uncertainty:c", 3],
      ["uncertainty:d", 4],
      ["uncertainty:e", 5],
    ]);
  });

  it("divides expected impact by user effort, sensitivity risk, and prior deferrals", () => {
    const result = planAdaptiveQuestionSession(planInput({
      maxQuestions: 2,
      uncertainties: [
        uncertainty({
          uncertaintyId: "uncertainty:sensitive-high-impact",
          questionIdentity: "outreach-safety:sensitive-high-impact",
          decisionKey: "outreach-safety:v1",
          impacts: [{ area: "outreach_safety", magnitude: 5 }],
          uncertaintySeverity: 5,
          userEffort: 1,
          sensitivityRisk: 4,
        }),
        uncertainty({
          uncertaintyId: "uncertainty:safe-medium-impact",
          questionIdentity: "play:safe-medium-impact",
          decisionKey: "play:v2",
          impacts: [{ area: "play", magnitude: 4 }],
          uncertaintySeverity: 3,
          userEffort: 1,
          sensitivityRisk: 0,
        }),
      ],
      answerHistory: [answer({
        answerId: "answer:deferred-prior-decision",
        uncertaintyId: "uncertainty:sensitive-high-impact",
        decisionKey: "qualification:v0",
        disposition: "deferred",
        answerText: null,
      })],
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.questions.map((question) => [
      question.uncertaintyId,
      question.score.effortRiskDivisor,
      question.score.priorDeferralPenalty,
      question.score.expectedValue,
    ])).toEqual([
      ["uncertainty:safe-medium-impact", 1, 0, 12000],
      ["uncertainty:sensitive-high-impact", 6, 1, 4166],
    ]);
  });

  it.each([
    ["wrong policy", planInput({ policyVersion: "adaptive-question-value-v2" })],
    ["oversized session", planInput({ maxQuestions: 6 })],
    ["extra top-level field", { ...planInput(), approve: true }],
    ["extra candidate field", planInput({ uncertainties: [uncertainty({ mandatory: true })] })],
    ["duplicate uncertainty", planInput({ uncertainties: [uncertainty(), uncertainty()] })],
    ["duplicate impact area", planInput({ uncertainties: [uncertainty({
      impacts: [
        { area: "search_scope", magnitude: 5 },
        { area: "search_scope", magnitude: 1 },
      ],
    })] })],
    ["incoherent conflict", planInput({ uncertainties: [uncertainty({ kind: "conflict", conflict: "none" })] })],
    ["incoherent stale state", planInput({ uncertainties: [uncertainty({ kind: "stale", freshness: "current" })] })],
    ["invalid decision reference", planInput({ uncertainties: [uncertainty({ confirmedForDecision: "bad ref ?" })] })],
    ["invalid tenant reference", planInput({ tenantRef: "bad ref ?" })],
    ["invalid understanding version", planInput({ understandingVersionId: "understanding-version:bad" })],
    ["unnormalizable question identity", planInput({ uncertainties: [uncertainty({ questionIdentity: " /// " })] })],
  ])("fails closed for %s", (_label, input) => {
    expect(planAdaptiveQuestionSession(input)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("rejects accessor-backed planner input without executing the accessor", () => {
    let reads = 0;
    const input = planInput();
    Object.defineProperty(input, "uncertainties", {
      enumerable: true,
      get() {
        reads += 1;
        return [uncertainty()];
      },
    });

    expect(planAdaptiveQuestionSession(input)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(reads).toBe(0);
  });

  it("rejects a nested accessor without executing it", () => {
    let reads = 0;
    const impact = { area: "search_scope", magnitude: 5 };
    Object.defineProperty(impact, "magnitude", {
      enumerable: true,
      get() {
        reads += 1;
        return 5;
      },
    });

    expect(planAdaptiveQuestionSession(planInput({
      uncertainties: [uncertainty({ impacts: [impact] })],
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(reads).toBe(0);
  });

  it.each([
    new Proxy(planInput(), {}),
    new Proxy(planInput(), { ownKeys() { throw new Error("hostile"); } }),
    planInput({ uncertainties: [new Proxy(uncertainty(), {})] }),
    planInput({ uncertainties: new Proxy([uncertainty()], {}) }),
  ])("fails closed for proxy-backed planner input", (input) => {
    expect(() => planAdaptiveQuestionSession(input)).not.toThrow();
    expect(planAdaptiveQuestionSession(input)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("snapshots nested inputs before returning an immutable session", () => {
    const candidate = uncertainty();
    const result = planAdaptiveQuestionSession(planInput({ uncertainties: [candidate] }));
    candidate.prompt = "Mutated after planning.";
    candidate.unlocks[0] = "Mutated after planning.";
    (candidate.impacts[0] as { magnitude: number }).magnitude = 1;

    expect(result).toMatchObject({
      ok: true,
      session: {
        questions: [{
          prompt: "Do you sell directly to formulators, through distributors, or both?",
          unlocks: ["Choose direct buyers and channel partners for discovery."],
          score: { impactPoints: 9 },
        }],
      },
    });
  });
});

describe("question answer records", () => {
  it("proposes traceable claim updates without applying answer content", () => {
    const answered = recordQuestionAnswer(answer());

    expect(answered).toMatchObject({
      ok: true,
      claimUpdateProposal: {
        version: 1,
        proposalRef: "claim-update:answer:1",
        tenantRef: "tenant:alpha",
        sessionRef: "question-session:industrial-1",
        understandingVersionId: UNDERSTANDING_VERSION_ID,
        sourceAnswerId: "answer:1",
        sourceQuestionRef: "question:1",
        sourceUncertaintyId: "uncertainty:channel-model",
        questionIdentity: "channel-model-route-to-market",
        decisionKey: "search-scope:v1",
        disposition: "answered",
        origin: "client_provided",
        status: "proposed",
        appliesAutomatically: false,
        answerText: "Both direct and distributor channels are in scope.",
        evidenceRefs: ["evidence:channel-policy-v1"],
        supersedesAnswerId: null,
      },
    });
    if (!answered.ok || !answered.claimUpdateProposal) return;
    expect(Object.isFrozen(answered.claimUpdateProposal)).toBe(true);
    expect(Object.isFrozen(answered.claimUpdateProposal.evidenceRefs)).toBe(true);

    const predecessor = answer({ answerId: "answer:prior", recordedAt: "2026-08-29T17:00:00.000Z" });
    const corrected = recordQuestionAnswer(answer({
      disposition: "corrected",
      answerText: "Distributor channel only.",
      supersedesAnswerId: "answer:prior",
    }), [predecessor]);
    expect(corrected).toMatchObject({
      ok: true,
      claimUpdateProposal: {
        disposition: "corrected",
        sourceAnswerId: "answer:1",
        supersedesAnswerId: "answer:prior",
        status: "proposed",
        appliesAutomatically: false,
      },
    });

    for (const disposition of ["deferred", "dismissed", "unknown", "not_applicable"] as const) {
      const result = recordQuestionAnswer(answer({
        disposition,
        answerText: disposition === "not_applicable" ? "Outside this play." : null,
      }));
      expect(result).toMatchObject({ ok: true, claimUpdateProposal: null });
    }
  });

  it.each([
    ["answered", "A concrete answer.", null],
    ["corrected", "A corrected answer.", "answer:prior"],
    ["deferred", null, null],
    ["dismissed", null, null],
    ["unknown", null, null],
    ["not_applicable", "Outside the current play by policy:play-v1.", null],
  ] as const)("records %s as exact immutable history", (disposition, answerText, supersedesAnswerId) => {
    const predecessor = answer({
      answerId: "answer:prior",
      recordedAt: "2026-08-29T17:00:00.000Z",
    });
    const result = recordQuestionAnswer(
      answer({ disposition, answerText, supersedesAnswerId }),
      disposition === "corrected" ? [predecessor] : [],
    );

    expect(result).toMatchObject({
      ok: true,
      code: "ANSWER_RECORDED",
      answer: { disposition, questionIdentity: "channel-model-route-to-market" },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.answer)).toEqual([
        "version", "answerId", "tenantRef", "sessionRef", "understandingVersionId", "questionRef",
        "uncertaintyId", "questionIdentity", "decisionKey", "disposition", "answerText", "evidenceRefs",
        "recordedAt", "supersedesAnswerId",
      ]);
      expect(Object.isFrozen(result.answer)).toBe(true);
      expect(Object.isFrozen(result.answer.evidenceRefs)).toBe(true);
      expect(Object.keys(result.answer)).not.toContain("approved");
    }
  });

  it.each([
    ["unknown disposition", answer({ disposition: "approved" })],
    ["extra field", { ...answer(), role: "approver" }],
    ["noncanonical time", answer({ recordedAt: "2026-08-29T18:00:00Z" })],
    ["missing answered text", answer({ answerText: null })],
    ["missing correction link", answer({ disposition: "corrected", supersedesAnswerId: null })],
    ["unexpected correction link", answer({ disposition: "unknown", answerText: null, supersedesAnswerId: "answer:prior" })],
    ["self-referential correction", answer({ disposition: "corrected", supersedesAnswerId: "answer:1" })],
    ["invalid optional answer text", answer({ disposition: "unknown", answerText: " " })],
    ["invalid optional supersedes ref", answer({ disposition: "unknown", answerText: null, supersedesAnswerId: "bad ref ?" })],
    ["invalid tenant reference", answer({ tenantRef: "bad ref ?" })],
    ["invalid session reference", answer({ sessionRef: "bad ref ?" })],
    ["invalid understanding version", answer({ understandingVersionId: "understanding-version:bad" })],
    ["unnormalizable question identity", answer({ questionIdentity: " /// " })],
  ])("rejects a malformed %s answer exactly", (_label, input) => {
    expect(recordQuestionAnswer(input)).toEqual({ ok: false, code: "MALFORMED_ANSWER" });
  });

  it("requires a real earlier correction predecessor in the same full scope", () => {
    const correction = answer({
      disposition: "corrected",
      answerText: "Distributor channel only.",
      supersedesAnswerId: "answer:prior",
    });
    const predecessor = answer({
      answerId: "answer:prior",
      recordedAt: "2026-08-29T17:00:00.000Z",
    });

    expect(recordQuestionAnswer(correction, [predecessor])).toMatchObject({
      ok: true,
      code: "ANSWER_RECORDED",
    });
    expect(recordQuestionAnswer(correction, [])).toEqual({ ok: false, code: "MALFORMED_ANSWER" });

    for (const mismatch of [
      { tenantRef: "tenant:beta" },
      { sessionRef: "question-session:other" },
      { understandingVersionId: `understanding-version:${"b".repeat(64)}` },
      { questionRef: "question:other" },
      { uncertaintyId: "uncertainty:other" },
      { questionIdentity: "channel-model:other-route" },
      { decisionKey: "qualification:v2" },
      { recordedAt: "2026-08-29T19:00:00.000Z" },
    ]) {
      expect(recordQuestionAnswer(correction, [answer({
        answerId: "answer:prior",
        recordedAt: "2026-08-29T17:00:00.000Z",
        ...mismatch,
      })])).toEqual({ ok: false, code: "MALFORMED_ANSWER" });
    }
  });

  it("rejects malformed, accessor-backed, proxy-backed, and duplicate predecessor history", () => {
    const correction = answer({
      disposition: "corrected",
      supersedesAnswerId: "answer:prior",
      answerText: "Distributor channel only.",
    });
    const predecessor = answer({ answerId: "answer:prior", recordedAt: "2026-08-29T17:00:00.000Z" });
    let reads = 0;
    const accessorHistory: unknown[] = [predecessor];
    Object.defineProperty(accessorHistory, "0", {
      enumerable: true,
      get() {
        reads += 1;
        return predecessor;
      },
    });

    expect(recordQuestionAnswer(correction, [predecessor, predecessor])).toEqual({ ok: false, code: "MALFORMED_ANSWER" });
    expect(recordQuestionAnswer(correction, accessorHistory)).toEqual({ ok: false, code: "MALFORMED_ANSWER" });
    expect(reads).toBe(0);
    expect(recordQuestionAnswer(correction, new Proxy([predecessor], {}))).toEqual({ ok: false, code: "MALFORMED_ANSWER" });
  });

  it("rejects accessor and proxy answer records without executing accessors or throwing", () => {
    let reads = 0;
    const accessor = answer();
    Object.defineProperty(accessor, "answerText", {
      enumerable: true,
      get() {
        reads += 1;
        return "unsafe";
      },
    });
    const hostile = new Proxy(answer(), { ownKeys() { throw new Error("hostile"); } });

    expect(recordQuestionAnswer(accessor)).toEqual({ ok: false, code: "MALFORMED_ANSWER" });
    expect(reads).toBe(0);
    expect(() => recordQuestionAnswer(hostile)).not.toThrow();
    expect(recordQuestionAnswer(hostile)).toEqual({ ok: false, code: "MALFORMED_ANSWER" });
  });

  it("snapshots evidence references before returning an answer record", () => {
    const input = answer();
    const result = recordQuestionAnswer(input);
    input.evidenceRefs[0] = "evidence:mutated";

    expect(result).toMatchObject({
      ok: true,
      answer: { evidenceRefs: ["evidence:channel-policy-v1"] },
    });
  });
});
