import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createOutreachExportReceipt } from "@/lib/outreach/export-receipt";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const ACCOUNT = "30000000-0000-4000-8000-000000000001";
const ACTOR = "40000000-0000-4000-8000-000000000001";
const hash = (value: unknown): string =>
  `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`;

function currentDraftState() {
  const stableKey = "outreach-draft:receipt-fixture";
  const createdAt = "2026-08-30T15:00:00.000Z";
  const contentHash = hash({ subject: "Private subject", body: "Private evidence-backed body." });
  const validationHash = hash("validation");
  const evidenceDigest = hash("evidence");
  const versionHash = hash({ tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT, stableKey,
    revision: 1, supersedesVersionId: null, createdAt, contentHash, evidenceDigest });
  const versionId = `outreach-draft-version:${versionHash.slice("sha256:".length)}`;
  const actor = Object.freeze({ kind: "human" as const, actorId: ACTOR });
  const reviewEvents = Object.freeze([
    Object.freeze({ from: "draft" as const, to: "in_review" as const, actor,
      at: "2026-08-30T15:01:00.000Z", reason: "Human review started." }),
    Object.freeze({ from: "in_review" as const, to: "approved" as const, actor,
      at: "2026-08-30T15:02:00.000Z", reason: "Human review approved." }),
  ]);
  const reviewPayload = Object.freeze({ reviewVersion: 1 as const, versionId, versionHash, tenantId: TENANT,
    workspaceId: WORKSPACE, accountId: ACCOUNT, stableKey, revision: 1, supersedesVersionId: null,
    contentHash, validationHash, evidenceDigest, createdAt, status: "approved" as const, events: reviewEvents,
    eligibleActions: Object.freeze(["copy", "export"] as const) });
  const review = Object.freeze({ ...reviewPayload, reviewHash: hash(reviewPayload) });
  const binding = Object.freeze({ tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT, versionId,
    versionHash, stableKey, revision: 1, supersedesVersionId: null, contentHash, validationHash, evidenceDigest,
    reviewHash: review.reviewHash, status: "approved" as const,
    eligibleActions: Object.freeze(["copy", "export"] as const), review });
  const event = Object.freeze({ fromVersionId: null, to: binding, actor,
    at: "2026-08-30T15:03:00.000Z", reason: "Register approved current draft." });
  const payload = Object.freeze({ stateVersion: 1 as const, tenantId: TENANT, workspaceId: WORKSPACE,
    accountId: ACCOUNT, stableKey, current: binding, events: Object.freeze([event]) });
  return Object.freeze({ ...payload, stateHash: hash(payload) });
}

function allowedDecision(
  state: Readonly<{ stateHash: string; current: Readonly<{ versionId: string; reviewHash: string }> }>
    = currentDraftState(),
  action: "copy" | "export" = "copy",
) {
  const payload = Object.freeze({
    decisionVersion: 1 as const,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    accountId: ACCOUNT,
    result: "allow" as const,
    action,
    reasons: Object.freeze([]),
    draft: Object.freeze({
      versionId: state.current.versionId,
      stateHash: state.stateHash,
      reviewHash: state.current.reviewHash,
    }),
    contact: Object.freeze({
      versionId: `contact-version:${"a".repeat(64)}`,
      contentHash: hash("contact-content"),
      reviewHash: hash("contact-review"),
    }),
    policyVersion: "policy:outreach-v1",
    purpose: "outreach_copy_export",
    actor: Object.freeze({ kind: "human" as const, actorId: ACTOR }),
    decidedAt: "2026-08-30T16:00:00.000Z",
  });
  return Object.freeze({ ...payload, decisionHash: hash(payload) });
}

function input(overrides: Record<string, unknown> = {}) {
  const currentDraftStateValue = currentDraftState();
  const decision = allowedDecision(currentDraftStateValue);
  return {
    version: 1,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    accountId: ACCOUNT,
    action: "copy",
    decision,
    currentDraftState: currentDraftStateValue,
    expectedDecisionHash: decision.decisionHash,
    expectedDraftStateHash: currentDraftStateValue.stateHash,
    expectedDraftVersionId: currentDraftStateValue.current.versionId,
    expectedDraftReviewHash: currentDraftStateValue.current.reviewHash,
    actor: { kind: "human", actorId: ACTOR },
    idempotencyKey: "copy-completion:fixture-001",
    completedAt: "2026-08-30T16:01:00.000Z",
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("outreach copy/export receipt", () => {
  it("deterministically records caller-attested completion without content, PII, or I/O", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const source = input();
    const first = createOutreachExportReceipt(source);
    expect(first).toEqual(createOutreachExportReceipt(source));
    expect(first).toMatchObject({
      ok: true,
      code: "OUTREACH_EXPORT_RECEIPT_CREATED",
      receipt: {
        action: "copy",
        completion: "caller_attested",
        idempotencyKey: "copy-completion:fixture-001",
        draft: {
          versionId: source.expectedDraftVersionId,
          stateHash: source.expectedDraftStateHash,
          reviewHash: source.expectedDraftReviewHash,
        },
        policy: {
          decisionHash: source.expectedDecisionHash,
          policyVersion: "policy:outreach-v1",
          purpose: "outreach_copy_export",
        },
      },
    });
    if (!first.ok) return;
    expect(first.receipt.receiptHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(first.receipt.receiptId)
      .toBe(`outreach-export-receipt:${first.receipt.receiptHash.slice("sha256:".length)}`);
    expect(Object.isFrozen(first.receipt)).toBe(true);
    expect(JSON.stringify(first.receipt)).not.toMatch(/Private|contact-version|recipient|email|phone|send|provider/iu);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails closed when the exact policy decision denies the action", () => {
    const source = input();
    const decisionPayload = {
      decisionVersion: source.decision.decisionVersion,
      tenantId: source.decision.tenantId,
      workspaceId: source.decision.workspaceId,
      accountId: source.decision.accountId,
      result: "deny",
      action: source.decision.action,
      reasons: ["ACTION_NOT_PERMITTED"],
      draft: source.decision.draft,
      contact: source.decision.contact,
      policyVersion: source.decision.policyVersion,
      purpose: source.decision.purpose,
      actor: source.decision.actor,
      decidedAt: source.decision.decidedAt,
    };
    const decision = { ...decisionPayload, decisionHash: hash(decisionPayload) };
    expect(createOutreachExportReceipt({
      ...source,
      decision,
      expectedDecisionHash: decision.decisionHash,
    })).toEqual({ ok: false, code: "DENIED_DECISION" });
  });

  it("does not treat an allowed decision as authority when the exact current draft is ineligible", () => {
    const approved = currentDraftState();
    const priorReview = approved.current.review;
    const reviewPayload = {
      reviewVersion: priorReview.reviewVersion,
      versionId: priorReview.versionId,
      versionHash: priorReview.versionHash,
      tenantId: priorReview.tenantId,
      workspaceId: priorReview.workspaceId,
      accountId: priorReview.accountId,
      stableKey: priorReview.stableKey,
      revision: priorReview.revision,
      supersedesVersionId: priorReview.supersedesVersionId,
      contentHash: priorReview.contentHash,
      validationHash: priorReview.validationHash,
      evidenceDigest: priorReview.evidenceDigest,
      createdAt: priorReview.createdAt,
      status: "draft",
      events: [],
      eligibleActions: [],
    };
    const review = { ...reviewPayload, reviewHash: hash(reviewPayload) };
    const binding = { ...approved.current, reviewHash: review.reviewHash, status: "draft",
      eligibleActions: [], review };
    const events = [{ ...approved.events[0], to: binding }];
    const statePayload = { stateVersion: 1, tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT,
      stableKey: approved.stableKey, current: binding, events };
    const state = { ...statePayload, stateHash: hash(statePayload) };
    const decision = allowedDecision(state);
    expect(createOutreachExportReceipt(input({
      decision,
      currentDraftState: state,
      expectedDecisionHash: decision.decisionHash,
      expectedDraftStateHash: state.stateHash,
      expectedDraftVersionId: state.current.versionId,
      expectedDraftReviewHash: state.current.reviewHash,
    }))).toEqual({ ok: false, code: "ACTION_NOT_ELIGIBLE" });
  });

  it("rejects stale, cross-scope, actor, action, and chronology mismatches", () => {
    const source = input();
    expect(createOutreachExportReceipt({ ...source, expectedDecisionHash: hash("stale-decision") }))
      .toEqual({ ok: false, code: "STALE_BINDING" });
    expect(createOutreachExportReceipt({ ...source, expectedDraftStateHash: hash("stale-state") }))
      .toEqual({ ok: false, code: "STALE_BINDING" });
    expect(createOutreachExportReceipt({
      ...source,
      tenantId: "10000000-0000-4000-8000-000000000099",
    })).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(createOutreachExportReceipt({
      ...source,
      actor: { kind: "human", actorId: "40000000-0000-4000-8000-000000000099" },
    })).toEqual({ ok: false, code: "STALE_BINDING" });
    expect(createOutreachExportReceipt({ ...source, action: "export" }))
      .toEqual({ ok: false, code: "STALE_BINDING" });
    expect(createOutreachExportReceipt({ ...source, completedAt: source.decision.decidedAt }))
      .toEqual({ ok: false, code: "INVALID_CHRONOLOGY" });
    expect(createOutreachExportReceipt({ ...source, actor: { kind: "agent", actorId: ACTOR } }))
      .toEqual({ ok: false, code: "HUMAN_ACTOR_REQUIRED" });
  });

  it("rejects ambiguous fields, proxies, and accessors without executing traps", () => {
    const source = input();
    expect(createOutreachExportReceipt({ ...source, idempotencyKey: "copy\u200b-completion" }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(createOutreachExportReceipt({ ...source, recipientEmail: "person@example.test" }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    let traps = 0;
    const trap = (): never => {
      traps += 1;
      throw new Error("must not execute");
    };
    expect(createOutreachExportReceipt(new Proxy(input(), { ownKeys: trap })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const accessorDecision = { ...source.decision };
    Object.defineProperty(accessorDecision, "policyVersion", { enumerable: true, get: trap });
    expect(createOutreachExportReceipt({ ...source, decision: accessorDecision }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(traps).toBe(0);
  });
});
