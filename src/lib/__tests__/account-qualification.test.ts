import { describe, expect, it } from "vitest";

import {
  qualifyAccount,
  reviewAccountQualification,
} from "@/lib/qualification/account-qualification";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "40000000-0000-4000-8000-000000000001";
const hash = (character: string) => `sha256:${character.repeat(64)}`;

function observation(index: number) {
  return {
    observationId: `observation:catalog-${index}`,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    observedAt: `2026-08-30T15:0${index}:00.000Z`,
    payloadHash: hash(String(index)),
    provenanceHash: hash(String(index + 2)),
  };
}

function input(overrides: Record<string, unknown> = {}) {
  const playContentHash = hash("a");
  return {
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    playVersionId: `lead-play-version:${playContentHash.slice("sha256:".length)}`,
    playContentHash,
    evaluatedAt: "2026-08-30T15:10:00.000Z",
    policy: {
      policyVersion: 1,
      policyId: "qualification-policy:industrial-fit-v1",
      qualifiedThreshold: 80,
      reviewThreshold: 50,
      factors: [
        { factorId: "factor:fit", weight: 60 },
        { factorId: "factor:readiness", weight: 40 },
      ],
    },
    observations: [observation(2), observation(1)],
    factors: [
      {
        factorId: "factor:readiness",
        score: 70,
        reason: "A current catalog supports a moderate readiness assessment.",
        evidenceObservationIds: ["observation:catalog-2"],
        uncertainty: { level: "none", reason: null },
      },
      {
        factorId: "factor:fit",
        score: 90,
        reason: "The catalog explicitly matches the play's target market.",
        evidenceObservationIds: ["observation:catalog-1"],
        uncertainty: { level: "none", reason: null },
      },
    ],
    contactContext: null,
    ...overrides,
  };
}

describe("account qualification", () => {
  it("deterministically qualifies an account from explicit weighted factors and canonical observations", () => {
    const first = qualifyAccount(input());
    const replay = qualifyAccount(input({
      observations: [observation(1), observation(2)],
      factors: [...input().factors].reverse(),
    }));

    expect(first).toMatchObject({
      ok: true,
      code: "ACCOUNT_QUALIFIED",
      qualification: {
        weightedScore: 82,
        automatedDecision: "qualified",
        decision: "qualified",
        reviewStatus: "unreviewed",
        contactContext: null,
        observations: [{ observationId: "observation:catalog-1" }, { observationId: "observation:catalog-2" }],
        factors: [{ factorId: "factor:fit" }, { factorId: "factor:readiness" }],
      },
    });
    expect(replay).toEqual(first);
    if (!first.ok) return;
    expect(first.qualification.qualificationHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(first.qualification.versionId)
      .toBe(`account-qualification:${first.qualification.qualificationHash.slice("sha256:".length)}`);
    expect(Object.isFrozen(first.qualification)).toBe(true);
    expect(Object.isFrozen(first.qualification.factors)).toBe(true);
  });

  it("records human confirmation and override against the exact current qualification", () => {
    const created = qualifyAccount(input());
    if (!created.ok) throw new Error(created.code);
    const confirmed = reviewAccountQualification({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: created.qualification,
      expectedQualificationHash: created.qualification.qualificationHash,
      action: "confirm",
      decision: "qualified",
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:11:00.000Z",
      reason: "The evidence supports the automated qualification.",
    });
    expect(confirmed).toMatchObject({
      ok: true,
      code: "ACCOUNT_QUALIFICATION_REVIEWED",
      qualification: { decision: "qualified", reviewStatus: "confirmed", reviewEvents: [{ action: "confirm" }] },
    });
    if (!confirmed.ok) return;
    const overridden = reviewAccountQualification({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: confirmed.qualification,
      expectedQualificationHash: confirmed.qualification.qualificationHash,
      action: "override",
      decision: "unqualified",
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:12:00.000Z",
      reason: "Human review found a material fit constraint outside the automated factors.",
    });
    expect(overridden).toMatchObject({
      ok: true,
      qualification: {
        decision: "unqualified",
        automatedDecision: "qualified",
        reviewStatus: "overridden",
        reviewEvents: [{ action: "confirm" }, { action: "override", fromDecision: "qualified", toDecision: "unqualified" }],
      },
    });
    if (!overridden.ok) return;
    expect(overridden.qualification.policy).toEqual(created.qualification.policy);
    expect(overridden.qualification.factors).toEqual(created.qualification.factors);
    expect(Object.isFrozen(overridden.qualification.reviewEvents)).toBe(true);
  });

  it("binds optional contact context without requiring contact data", () => {
    const present = qualifyAccount(input({
      contactContext: {
        status: "present",
        contactRecordId: "contact-record:verified-1",
        observedAt: "2026-08-30T15:02:30.000Z",
        evidenceObservationIds: ["observation:catalog-2"],
      },
    }));
    expect(present).toMatchObject({
      ok: true,
      qualification: {
        contactContext: {
          status: "present",
          contactRecordId: "contact-record:verified-1",
          evidenceObservationIds: ["observation:catalog-2"],
        },
      },
    });
    expect(qualifyAccount(input())).toMatchObject({ ok: true, qualification: { contactContext: null } });
  });

  it("rejects non-null or malformed uncertainty text when uncertainty is explicitly absent", () => {
    const factors = input().factors.map((factor) => factor.factorId === "factor:fit"
      ? { ...factor, uncertainty: { level: "none", reason: "hidden\u200btext" } }
      : factor);
    expect(qualifyAccount(input({ factors }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("routes material uncertainty to review and versions every policy change", () => {
    const factors = input().factors.map((factor) => factor.factorId === "factor:fit"
      ? {
          ...factor,
          score: 100,
          evidenceObservationIds: [],
          uncertainty: { level: "high", reason: "No canonical observation resolves the material fit question." },
        }
      : factor);
    expect(qualifyAccount(input({ factors }))).toMatchObject({
      ok: true,
      qualification: { weightedScore: 88, automatedDecision: "needs_review", decision: "needs_review" },
    });

    const original = qualifyAccount(input());
    const changed = qualifyAccount(input({
      policy: { ...input().policy, qualifiedThreshold: 81 },
    }));
    if (!original.ok || !changed.ok) throw new Error("fixture failed");
    expect(changed.qualification.policyHash).not.toBe(original.qualification.policyHash);
    expect(changed.qualification.qualificationHash).not.toBe(original.qualification.qualificationHash);
  });

  it("fails closed on hostile scope, evidence, duplicate, cap, proxy, accessor, and Unicode inputs", () => {
    const foreign = input();
    foreign.observations[0] = {
      ...foreign.observations[0],
      tenantId: "10000000-0000-4000-8000-000000000099",
    };
    expect(qualifyAccount(foreign)).toEqual({ ok: false, code: "SCOPE_MISMATCH" });

    const unknownEvidence = input().factors.map((factor) => factor.factorId === "factor:fit"
      ? { ...factor, evidenceObservationIds: ["observation:not-canonical"] }
      : factor);
    expect(qualifyAccount(input({ factors: unknownEvidence })))
      .toEqual({ ok: false, code: "EVIDENCE_MISMATCH" });
    expect(qualifyAccount(input({ observations: [observation(1), observation(1)] })))
      .toEqual({ ok: false, code: "DUPLICATE_ITEM" });
    const capped = Array.from({ length: 65 }, (_, index) => ({
      ...observation(1),
      observationId: `observation:capped-${index}`,
    }));
    expect(qualifyAccount(input({ observations: capped }))).toEqual({ ok: false, code: "CAP_EXCEEDED" });

    let traps = 0;
    const trap = (): never => {
      traps += 1;
      throw new Error("must not execute");
    };
    expect(qualifyAccount(new Proxy(input(), { ownKeys: trap })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const accessor = { ...input().factors[0] };
    Object.defineProperty(accessor, "reason", { enumerable: true, get: trap });
    expect(qualifyAccount(input({ factors: [accessor, input().factors[1]] })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(traps).toBe(0);

    const malformedUnicode = input().factors.map((factor) => factor.factorId === "factor:fit"
      ? { ...factor, reason: "Malformed \ud800 reason." }
      : factor);
    expect(qualifyAccount(input({ factors: malformedUnicode })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("rejects stale, cross-scope, non-human, non-chronological, and policy-mutated review", () => {
    const created = qualifyAccount(input());
    if (!created.ok) throw new Error(created.code);
    const request = {
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: created.qualification,
      expectedQualificationHash: created.qualification.qualificationHash,
      action: "override",
      decision: "unqualified",
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:11:00.000Z",
      reason: "A human override must bind the exact current result.",
    };
    expect(reviewAccountQualification({ ...request, expectedQualificationHash: hash("f") }))
      .toEqual({ ok: false, code: "STALE_VERSION" });
    expect(reviewAccountQualification({
      ...request,
      tenantId: "10000000-0000-4000-8000-000000000099",
    })).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(reviewAccountQualification({
      ...request,
      actor: { kind: "agent", actorId: REVIEWER_ID },
    })).toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
    expect(reviewAccountQualification({ ...request, at: created.qualification.evaluatedAt }))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    const forged = {
      ...created.qualification,
      policy: { ...created.qualification.policy, qualifiedThreshold: 79 },
    };
    expect(reviewAccountQualification({ ...request, current: forged }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(reviewAccountQualification({
      ...request,
      current: { ...created.qualification, reviewEvents: new Array(51).fill({}) },
    })).toEqual({ ok: false, code: "CAP_EXCEEDED" });
  });
});
