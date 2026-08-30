import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildBuyingCenter,
  transitionBuyingCenterReview,
  type BuyingCenter,
} from "@/lib/contacts/buying-center";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "20000000-0000-4000-8000-000000000001";
const ACCOUNT_A = "30000000-0000-4000-8000-000000000001";
const REVIEWER = "40000000-0000-4000-8000-000000000001";
const PLAY_VERSION = `lead-play-version:${"a".repeat(64)}`;

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

function evidenceRef(overrides: Record<string, unknown> = {}) {
  const payload = {
    evidenceRefVersion: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    playVersionId: PLAY_VERSION,
    evidenceId: "evidence:synthetic-procurement-role",
    evidenceVersionId: "evidence-version:synthetic-v1",
    evidenceContentHash: sha256("synthetic procurement evidence"),
    sourceReceiptHash: sha256("synthetic source receipt"),
    observedAt: "2026-08-30T12:00:00.000Z",
    ...overrides,
  };
  return { ...payload, evidenceRefHash: sha256(payload) };
}

function contactRef(overrides: Record<string, unknown> = {}) {
  const payload = {
    contactRefVersion: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    contactVersionId: `contact-version:${"b".repeat(64)}`,
    contactContentHash: sha256("synthetic contact content"),
    contactReviewHash: sha256("synthetic contact review"),
    verification: {
      kind: "human",
      actorId: REVIEWER,
      at: "2026-08-30T12:30:00.000Z",
      reason: "Reviewed the exact eligible contact version and supporting evidence.",
    },
    ...overrides,
  };
  return { ...payload, contactRefHash: sha256(payload) };
}

function hypothesis(overrides: Record<string, unknown> = {}) {
  return {
    status: "hypothesis",
    hypothesisKey: "role:procurement",
    roleKind: "standard",
    roleKey: "procurement",
    roleLabel: "Procurement",
    responsibility: "Evaluates commercial terms and supplier onboarding.",
    influence: "high",
    priority: 1,
    confidenceBasisPoints: 7_500,
    uncertainty: "The final approval authority is not yet established.",
    evidenceRefs: [evidenceRef()],
    contactVersionRef: null,
    ...overrides,
  };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    playVersionId: PLAY_VERSION,
    stableKey: "buying-center:synthetic-account",
    revision: 1,
    predecessor: null,
    createdAt: "2026-08-30T13:00:00.000Z",
    hypotheses: [hypothesis()],
    ...overrides,
  };
}

function created(value: unknown = input()): BuyingCenter {
  const result = buildBuyingCenter(value);
  if (!result.ok) throw new Error(result.code);
  return result.center;
}

function transition(current: BuyingCenter, to: "in_review" | "approved" | "rejected", at: string) {
  return transitionBuyingCenterReview({
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    playVersionId: PLAY_VERSION,
    current,
    expectedVersionId: current.versionId,
    expectedContentHash: current.contentHash,
    expectedReviewHash: current.review.reviewHash,
    to,
    actor: { kind: "human", actorId: REVIEWER },
    at,
    reason: `Human buying-center decision: ${to}.`,
  });
}

function approved(): BuyingCenter {
  const reviewing = transition(created(), "in_review", "2026-08-30T13:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const result = transition(reviewing.center, "approved", "2026-08-30T13:02:00.000Z");
  if (!result.ok) throw new Error(result.code);
  return result.center;
}

describe("buying-center hypothesis lifecycle", () => {
  it("creates a deterministic immutable play-bound map whose roles remain hypotheses", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = buildBuyingCenter(input());
    expect(first).toEqual(buildBuyingCenter(input()));
    expect(first).toMatchObject({
      ok: true,
      code: "BUYING_CENTER_CREATED",
      center: {
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        accountId: ACCOUNT_A,
        playVersionId: PLAY_VERSION,
        revision: 1,
        hypotheses: [{ status: "hypothesis", roleKey: "procurement", contactVersionRef: null }],
        review: { status: "draft" },
      },
    });
    if (!first.ok) return;
    expect(first.center.versionId).toBe(`buying-center-version:${first.center.versionHash.slice(7)}`);
    expect(Object.isFrozen(first.center)).toBe(true);
    expect(Object.isFrozen(first.center.hypotheses[0]?.evidenceRefs)).toBe(true);
    expect(JSON.stringify(first.center)).not.toMatch(/verifiedPerson|send|deliver|outreach/iu);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows only ordered human review and never upgrades hypothesis status", () => {
    const draft = created();
    expect(transition(draft, "approved", "2026-08-30T13:01:00.000Z"))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(transition(draft, "in_review", draft.createdAt)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    const reviewing = transition(draft, "in_review", "2026-08-30T13:01:00.000Z");
    if (!reviewing.ok) throw new Error(reviewing.code);
    const result = transition(reviewing.center, "approved", "2026-08-30T13:02:00.000Z");
    expect(result).toMatchObject({
      ok: true,
      code: "BUYING_CENTER_REVIEW_TRANSITIONED",
      center: { review: { status: "approved" }, hypotheses: [{ status: "hypothesis" }] },
    });
    expect(transitionBuyingCenterReview({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      accountId: ACCOUNT_A,
      playVersionId: PLAY_VERSION,
      current: draft,
      expectedVersionId: draft.versionId,
      expectedContentHash: draft.contentHash,
      expectedReviewHash: draft.review.reviewHash,
      to: "in_review",
      actor: { kind: "agent", actorId: REVIEWER },
      at: "2026-08-30T13:01:00.000Z",
      reason: "Automatic approval is forbidden.",
    })).toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
  });

  it("accepts only an exact explicitly human-verified contact-version reference", () => {
    const result = buildBuyingCenter(input({ hypotheses: [hypothesis({ contactVersionRef: contactRef() })] }));
    expect(result).toMatchObject({
      ok: true,
      center: {
        hypotheses: [{
          status: "hypothesis",
          contactVersionRef: { verification: { kind: "human" } },
        }],
      },
    });
    expect(buildBuyingCenter(input({
      hypotheses: [hypothesis({ contactVersionRef: contactRef({
        verification: { kind: "agent", actorId: REVIEWER, at: "2026-08-30T12:30:00.000Z", reason: "Proxy decision." },
      }) })],
    }))).toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
    expect(buildBuyingCenter(input({
      hypotheses: [hypothesis({ contactVersionRef: { ...contactRef(), contactContentHash: sha256("changed") } })],
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("requires exact +1 approved correction lineage and invalidates stale review bindings", () => {
    const prior = approved();
    const correction = buildBuyingCenter(input({
      revision: 2,
      predecessor: prior,
      createdAt: "2026-08-30T14:00:00.000Z",
      hypotheses: [hypothesis({ uncertainty: "Technical evaluator coverage remains unknown." })],
    }));
    expect(correction).toMatchObject({
      ok: true,
      code: "BUYING_CENTER_VERSION_CREATED",
      center: { revision: 2, supersedesVersionId: prior.versionId, review: { status: "draft" } },
    });
    expect(buildBuyingCenter(input({ revision: 3, predecessor: prior }))).toEqual({ ok: false, code: "VERSION_CONFLICT" });
    if (!correction.ok) return;
    expect(transitionBuyingCenterReview({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      accountId: ACCOUNT_A,
      playVersionId: PLAY_VERSION,
      current: correction.center,
      expectedVersionId: prior.versionId,
      expectedContentHash: prior.contentHash,
      expectedReviewHash: prior.review.reviewHash,
      to: "in_review",
      actor: { kind: "human", actorId: REVIEWER },
      at: "2026-08-30T14:01:00.000Z",
      reason: "Stale bindings must fail.",
    })).toEqual({ ok: false, code: "STALE_VERSION" });
  });

  it("fails closed on scope, duplicates, Unicode confusables, proxies, accessors, and extras", () => {
    expect(buildBuyingCenter(input({ tenantId: TENANT_B }))).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(buildBuyingCenter(input({ hypotheses: [hypothesis(), hypothesis()] })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBuyingCenter(input({
      hypotheses: [hypothesis({ evidenceRefs: [evidenceRef(), evidenceRef()] })],
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBuyingCenter(input({
      hypotheses: Array.from({ length: 51 }, (_, index) => hypothesis({
        hypothesisKey: `role:custom-${index}`,
        roleKind: "tenant_custom",
        roleKey: `custom:role-${index}`,
        roleLabel: `Custom role ${index}`,
      })),
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBuyingCenter(input({
      hypotheses: [hypothesis({
        evidenceRefs: Array.from({ length: 21 }, (_, index) => evidenceRef({
          evidenceId: `evidence:synthetic-${index}`,
          evidenceVersionId: `evidence-version:synthetic-${index}`,
        })),
      })],
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBuyingCenter(input({ hypotheses: [hypothesis({ roleLabel: "Procure\u200bment" })] })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBuyingCenter(input({ hypotheses: [hypothesis({ roleLabel: "Ｐrocurement" })] })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBuyingCenter(input({ hypotheses: [hypothesis({ roleLabel: "Procurement\ud800" })] })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBuyingCenter(new Proxy(input(), {}))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const accessor = input();
    Object.defineProperty(accessor, "createdAt", { enumerable: true, get: vi.fn(() => "2026-08-30T13:00:00.000Z") });
    expect(buildBuyingCenter(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildBuyingCenter({ ...input(), send: true })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });
});
