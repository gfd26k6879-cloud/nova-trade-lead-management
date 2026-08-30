import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildContactRecord, transitionContactRecordReview, type ContactRecord } from "@/lib/contacts/contact-record";
import { evaluateOutreachPolicyGate } from "@/lib/outreach/policy-gate";

const TENANT = "10000000-0000-4000-8000-000000000001";
const FOREIGN = "10000000-0000-4000-8000-000000000002";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const ACCOUNT = "30000000-0000-4000-8000-000000000001";
const REVIEWER = "40000000-0000-4000-8000-000000000001";
const HASH_A = `sha256:${"a".repeat(64)}`;

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function currentDraftState() {
  const stableKey = "outreach-draft:policy-fixture";
  const createdAt = "2026-08-30T15:00:00.000Z";
  const contentHash = sha256({ subject: "Possible fit", body: "Evidence-backed draft text." });
  const validationHash = HASH_A;
  const evidenceDigest = `sha256:${"b".repeat(64)}`;
  const versionHash = sha256({ tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT, stableKey,
    revision: 1, supersedesVersionId: null, createdAt, contentHash, evidenceDigest });
  const versionId = `outreach-draft-version:${versionHash.slice("sha256:".length)}`;
  const actor = Object.freeze({ kind: "human" as const, actorId: REVIEWER });
  const events = Object.freeze([
    Object.freeze({ from: "draft" as const, to: "in_review" as const, actor,
      at: "2026-08-30T15:01:00.000Z", reason: "Human outreach decision: in review." }),
    Object.freeze({ from: "in_review" as const, to: "approved" as const, actor,
      at: "2026-08-30T15:02:00.000Z", reason: "Human outreach decision: approved." }),
  ]);
  const reviewPayload = Object.freeze({ reviewVersion: 1 as const, versionId, versionHash, tenantId: TENANT,
    workspaceId: WORKSPACE, accountId: ACCOUNT, stableKey, revision: 1, supersedesVersionId: null,
    contentHash, validationHash, evidenceDigest, createdAt, status: "approved" as const, events,
    eligibleActions: Object.freeze(["copy", "export"] as const) });
  const review = Object.freeze({ ...reviewPayload, reviewHash: sha256(reviewPayload) });
  const binding = Object.freeze({ tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT, versionId,
    versionHash, stableKey, revision: 1, supersedesVersionId: null, contentHash, validationHash, evidenceDigest,
    reviewHash: review.reviewHash, status: "approved" as const,
    eligibleActions: Object.freeze(["copy", "export"] as const), review });
  const currentEvent = Object.freeze({ fromVersionId: null, to: binding, actor,
    at: "2026-08-30T15:03:00.000Z", reason: "Register exact approved draft as current." });
  const payload = Object.freeze({ stateVersion: 1 as const, tenantId: TENANT, workspaceId: WORKSPACE,
    accountId: ACCOUNT, stableKey, current: binding, events: Object.freeze([currentEvent]) });
  return Object.freeze({ ...payload, stateHash: sha256(payload) });
}

function contactInput(overrides: Record<string, unknown> = {}) {
  const receiptPayload = { receiptVersion: 1, tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT,
    sourceId: "customer-list:policy-fixture", sourceVersionId: "customer-list-version:policy-v1",
    sourceContentHash: HASH_A, connectorKey: "customer-list", locator: "row=1",
    observedAt: "2026-08-30T16:00:00.000Z" };
  const sourceReceipt = { ...receiptPayload, receiptHash: sha256(receiptPayload) };
  return { version: 1, tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT,
    stableKey: "contact:policy-fixture", revision: 1, predecessor: null,
    createdAt: "2026-08-30T17:00:00.000Z",
    identity: { kind: "person_candidate", displayName: "Synthetic Buyer",
      contactPointClass: "named_business_email", contactPoint: "buyer@example.test", verification: "source_observed" },
    roleHypothesis: null, sourceReceipt,
    freshness: { state: "KNOWN", observedAt: sourceReceipt.observedAt, expiresAt: "2026-09-30T16:00:00.000Z" },
    permittedUse: { policyVersion: "policy:outreach-v1", purpose: "outreach_copy_export",
      sourcePolicy: "KNOWN", jurisdiction: "KNOWN", attestation: "KNOWN", identity: "KNOWN",
      channelAuthorization: "KNOWN", legalBasis: "KNOWN", consentSignal: "KNOWN" },
    suppressionDisposition: "clear", ...overrides };
}

function approvedContact(overrides: Record<string, unknown> = {}): ContactRecord {
  const built = buildContactRecord(contactInput(overrides));
  if (!built.ok) throw new Error(built.code);
  const move = (current: ContactRecord, to: "in_review" | "approved", at: string) =>
    transitionContactRecordReview({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT,
      current, expectedVersionId: current.versionId, expectedContentHash: current.contentHash,
      expectedReviewHash: current.review.reviewHash, to, actor: { kind: "human", actorId: REVIEWER }, at,
      reason: `Human contact decision: ${to}.` });
  const reviewing = move(built.record, "in_review", "2026-08-30T17:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const approved = move(reviewing.record, "approved", "2026-08-30T17:02:00.000Z");
  if (!approved.ok) throw new Error(approved.code);
  return approved.record;
}

function input(overrides: Record<string, unknown> = {}) {
  const state = currentDraftState();
  const contact = approvedContact();
  return { version: 1, tenantId: TENANT, workspaceId: WORKSPACE, accountId: ACCOUNT, action: "copy",
    currentDraftState: state, expectedDraftStateHash: state.stateHash,
    expectedDraftVersionId: state.current.versionId, expectedDraftReviewHash: state.current.reviewHash,
    contact, expectedContactVersionId: contact.versionId, expectedContactContentHash: contact.contentHash,
    expectedContactReviewHash: contact.review.reviewHash,
    policy: { policyVersion: "policy:outreach-v1", purpose: "outreach_copy_export",
      allowedActions: ["copy", "export"] }, actor: { kind: "human", actorId: REVIEWER },
    decidedAt: "2026-08-30T18:00:00.000Z", ...overrides };
}

afterEach(() => vi.restoreAllMocks());

describe("outreach copy/export policy gate", () => {
  it("deterministically allows an exact current approved draft and governed contact without acting", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const source = input();
    const first = evaluateOutreachPolicyGate(source);
    expect(first).toEqual(evaluateOutreachPolicyGate(source));
    expect(first).toMatchObject({ ok: true, code: "OUTREACH_POLICY_DECIDED", decision: {
      result: "allow", reasons: [], action: "copy", policyVersion: "policy:outreach-v1",
      draft: { versionId: source.expectedDraftVersionId, reviewHash: source.expectedDraftReviewHash },
      contact: { versionId: source.expectedContactVersionId, reviewHash: source.expectedContactReviewHash },
    } });
    if (!first.ok) return;
    expect(first.decision.decisionHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(Object.isFrozen(first.decision)).toBe(true);
    expect(Object.isFrozen(first.decision.reasons)).toBe(true);
    expect(JSON.stringify(first.decision)).not.toMatch(/buyer@example|body|send|deliver|provider/iu);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns deterministic deny reasons for stale, suppressed, unconsented, or disallowed use", () => {
    const stale = approvedContact({ freshness: { ...contactInput().freshness,
      expiresAt: "2026-08-30T17:30:00.000Z" } });
    const suppressed = approvedContact({ suppressionDisposition: "opt_out" });
    const unconsented = approvedContact({ permittedUse: { ...contactInput().permittedUse, consentSignal: "UNKNOWN" } });
    const cases = [
      [stale, {}, ["CONTACT_STALE"]],
      [suppressed, {}, ["SUPPRESSED", "CONTACT_USE_BLOCKED"]],
      [unconsented, {}, ["CONTACT_USE_BLOCKED"]],
      [approvedContact(), { policy: { policyVersion: "policy:outreach-v2", purpose: "outreach_copy_export",
        allowedActions: ["copy"] } }, ["POLICY_MISMATCH"]],
      [approvedContact(), { action: "export", policy: { policyVersion: "policy:outreach-v1",
        purpose: "outreach_copy_export", allowedActions: ["copy"] } }, ["ACTION_NOT_PERMITTED"]],
    ] as const;
    for (const [contact, overrides, reasons] of cases) {
      const result = evaluateOutreachPolicyGate(input({ contact, expectedContactVersionId: contact.versionId,
        expectedContactContentHash: contact.contentHash, expectedContactReviewHash: contact.review.reviewHash,
        ...overrides }));
      expect(result).toMatchObject({ ok: true, decision: { result: "deny", reasons } });
    }
  });

  it("fails closed on stale bindings, scope, and chronology", () => {
    const baseline = input();
    expect(evaluateOutreachPolicyGate({ ...baseline, expectedDraftStateHash: HASH_A }))
      .toEqual({ ok: false, code: "STALE_BINDING" });
    expect(evaluateOutreachPolicyGate({ ...baseline, expectedContactReviewHash: HASH_A }))
      .toEqual({ ok: false, code: "STALE_BINDING" });
    expect(evaluateOutreachPolicyGate({ ...baseline, tenantId: FOREIGN }))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(evaluateOutreachPolicyGate({ ...baseline, decidedAt: "2026-08-30T17:01:30.000Z" }))
      .toEqual({ ok: false, code: "INVALID_CHRONOLOGY" });
  });

  it("rejects extra fields, non-human actors, Unicode ambiguity, accessors, and proxies without traps", () => {
    const baseline = input();
    expect(evaluateOutreachPolicyGate({ ...baseline, send: true })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(evaluateOutreachPolicyGate({ ...baseline, actor: { kind: "agent", actorId: REVIEWER } }))
      .toEqual({ ok: false, code: "HUMAN_ACTOR_REQUIRED" });
    expect(evaluateOutreachPolicyGate({ ...baseline,
      policy: { ...baseline.policy, purpose: "outreach\u200b_copy_export" } }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    let traps = 0;
    const trap = (): never => { traps += 1; throw new Error("must not execute"); };
    const accessor = input();
    Object.defineProperty(accessor.policy, "policyVersion", { enumerable: true, get: trap });
    const proxied = new Proxy(input(), { getPrototypeOf: trap });
    for (const hostile of [accessor, proxied]) {
      expect(evaluateOutreachPolicyGate(hostile)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }
    expect(traps).toBe(0);
  });
});
