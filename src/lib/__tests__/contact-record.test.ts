import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildContactRecord,
  transitionContactRecordReview,
  type ContactRecord,
} from "@/lib/contacts/contact-record";

const TENANT_A = "10000000-0000-4000-8000-000000000001";
const TENANT_B = "10000000-0000-4000-8000-000000000002";
const WORKSPACE_A = "20000000-0000-4000-8000-000000000001";
const ACCOUNT_A = "30000000-0000-4000-8000-000000000001";
const REVIEWER = "40000000-0000-4000-8000-000000000001";

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex")}`;
}

function sourceReceipt(version = 1) {
  const payload = {
    receiptVersion: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    sourceId: "customer-list:fixture",
    sourceVersionId: `customer-list-version:fixture-v${version}`,
    sourceContentHash: sha256(`synthetic customer list v${version}`),
    connectorKey: "customer-list",
    locator: `row=${version}`,
    observedAt: `2026-08-30T12:0${version}:00.000Z`,
  };
  return { ...payload, receiptHash: sha256(payload) };
}

function input(overrides: Record<string, unknown> = {}) {
  const receipt = sourceReceipt();
  return {
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    stableKey: "contact:synthetic-procurement",
    revision: 1,
    predecessor: null,
    createdAt: "2026-08-30T13:00:00.000Z",
    identity: {
      kind: "person_candidate",
      displayName: "Synthetic Buyer",
      contactPointClass: "named_business_email",
      contactPoint: "buyer@example.test",
      verification: "source_observed",
    },
    roleHypothesis: {
      status: "hypothesis",
      roleKey: "procurement",
      statement: "The source labels this synthetic contact as procurement.",
      confidenceBasisPoints: 7_500,
      evidenceReceiptHash: receipt.receiptHash,
    },
    sourceReceipt: receipt,
    freshness: {
      state: "KNOWN",
      observedAt: receipt.observedAt,
      expiresAt: "2027-08-30T12:01:00.000Z",
    },
    permittedUse: {
      policyVersion: "d012_v2026_07_27_02",
      purpose: "qualification",
      sourcePolicy: "KNOWN",
      jurisdiction: "KNOWN",
      attestation: "KNOWN",
      identity: "KNOWN",
      channelAuthorization: "KNOWN",
      legalBasis: "KNOWN",
      consentSignal: "KNOWN",
    },
    suppressionDisposition: "clear",
    ...overrides,
  };
}

function created(value = input()): ContactRecord {
  const result = buildContactRecord(value);
  if (!result.ok) throw new Error(result.code);
  return result.record;
}

function transition(current: ContactRecord, to: "in_review" | "approved" | "rejected", at: string) {
  return transitionContactRecordReview({
    version: 1,
    tenantId: TENANT_A,
    workspaceId: WORKSPACE_A,
    accountId: ACCOUNT_A,
    current,
    expectedVersionId: current.versionId,
    expectedContentHash: current.contentHash,
    expectedReviewHash: current.review.reviewHash,
    to,
    actor: { kind: "human", actorId: REVIEWER },
    at,
    reason: `Human contact decision: ${to}.`,
  });
}

function approved(): ContactRecord {
  const draft = created();
  const reviewing = transition(draft, "in_review", "2026-08-30T13:01:00.000Z");
  if (!reviewing.ok) throw new Error(reviewing.code);
  const result = transition(reviewing.record, "approved", "2026-08-30T13:02:00.000Z");
  if (!result.ok) throw new Error(result.code);
  return result.record;
}

describe("contact record and review lifecycle", () => {
  it("builds a deterministic immutable evidence-preserving candidate that is blocked pending review", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const first = buildContactRecord(input());
    const replay = buildContactRecord(input());
    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      ok: true,
      code: "CONTACT_RECORD_CREATED",
      record: {
        tenantId: TENANT_A,
        workspaceId: WORKSPACE_A,
        accountId: ACCOUNT_A,
        revision: 1,
        identity: { kind: "person_candidate", verification: "source_observed" },
        roleHypothesis: { status: "hypothesis", roleKey: "procurement" },
        sourceReceipt: { sourceVersionId: "customer-list-version:fixture-v1" },
        review: {
          status: "draft",
          eligibility: { research: "blocked", contactUse: "blocked", reasons: ["REVIEW_REQUIRED"] },
        },
      },
    });
    if (!first.ok) return;
    expect(first.record.versionId).toBe(`contact-version:${first.record.versionHash.slice(7)}`);
    expect(first.record.roleHypothesis?.evidenceReceiptHash).toBe(first.record.sourceReceipt.receiptHash);
    expect(Object.isFrozen(first.record)).toBe(true);
    expect(Object.isFrozen(first.record.sourceReceipt)).toBe(true);
    expect(Object.isFrozen(first.record.review.events)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows only ordered human review and derives research/use eligibility without granting outreach", () => {
    const draft = created();
    expect(transition(draft, "in_review", draft.createdAt)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(transition(draft, "approved", "2026-08-30T13:01:00.000Z"))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    const reviewing = transition(draft, "in_review", "2026-08-30T13:01:00.000Z");
    if (!reviewing.ok) throw new Error(reviewing.code);
    const approvedResult = transition(reviewing.record, "approved", "2026-08-30T13:02:00.000Z");
    expect(approvedResult).toMatchObject({
      ok: true,
      code: "CONTACT_REVIEW_TRANSITIONED",
      record: {
        review: { status: "approved", eligibility: { research: "allowed", contactUse: "allowed", reasons: [] } },
      },
    });
    if (!approvedResult.ok) return;
    expect(JSON.stringify(approvedResult.record)).not.toMatch(/send|deliver|outreach/iu);
    expect(transitionContactRecordReview({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      accountId: ACCOUNT_A,
      current: draft,
      expectedVersionId: draft.versionId,
      expectedContentHash: draft.contentHash,
      expectedReviewHash: draft.review.reviewHash,
      to: "in_review",
      actor: { kind: "agent", actorId: REVIEWER },
      at: "2026-08-30T13:01:00.000Z",
      reason: "An agent cannot satisfy human review.",
    })).toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
  });

  it("fails closed for unknown, stale, suppressed, and personal contact states", () => {
    const cases = [
      [input({ permittedUse: { ...input().permittedUse, sourcePolicy: "UNKNOWN" } }), "SOURCE_POLICY_NOT_KNOWN"],
      [input({ freshness: { ...input().freshness, state: "STALE" } }), "FRESHNESS_NOT_KNOWN"],
      [input({ freshness: { ...input().freshness, expiresAt: "2026-08-30T13:01:30.000Z" } }), "FRESHNESS_NOT_KNOWN"],
      [input({ suppressionDisposition: "opt_out" }), "SUPPRESSED"],
      [input({ identity: { ...input().identity, contactPointClass: "personal_email" } }), "CONTACT_POINT_BLOCKED"],
    ] as const;
    for (const [value, reason] of cases) {
      const built = buildContactRecord(value);
      expect(built.ok).toBe(true);
      if (!built.ok) continue;
      const reviewing = transition(built.record, "in_review", "2026-08-30T13:01:00.000Z");
      if (!reviewing.ok) throw new Error(reviewing.code);
      const approvedResult = transition(reviewing.record, "approved", "2026-08-30T13:02:00.000Z");
      expect(approvedResult).toMatchObject({
        ok: true,
        record: { review: { eligibility: { research: "blocked", contactUse: "blocked", reasons: [reason] } } },
      });
    }
  });

  it("creates an exact +1 correction with new evidence and invalidates prior eligibility", () => {
    const original = approved();
    const receipt = sourceReceipt(2);
    const correction = buildContactRecord(input({
      revision: 2,
      predecessor: {
        predecessorVersion: 1,
        stableKey: original.stableKey,
        revision: original.revision,
        supersedesVersionId: original.supersedesVersionId,
        record: original,
      },
      createdAt: "2026-08-30T13:03:00.000Z",
      identity: { ...input().identity, contactPoint: "corrected@example.test", verification: "human_corrected" },
      sourceReceipt: receipt,
      roleHypothesis: null,
      freshness: { state: "KNOWN", observedAt: receipt.observedAt, expiresAt: "2027-08-30T12:02:00.000Z" },
    }));
    expect(correction).toMatchObject({
      ok: true,
      code: "CONTACT_RECORD_VERSION_CREATED",
      record: {
        revision: 2,
        supersedesVersionId: original.versionId,
        sourceReceipt: { sourceVersionId: "customer-list-version:fixture-v2" },
        roleHypothesis: null,
        review: { status: "draft", eligibility: { research: "blocked", contactUse: "blocked" } },
      },
    });
    if (!correction.ok) return;
    expect(correction.record.versionId).not.toBe(original.versionId);
    expect(correction.record.contentHash).not.toBe(original.contentHash);
    expect(transitionContactRecordReview({
      version: 1,
      tenantId: TENANT_A,
      workspaceId: WORKSPACE_A,
      accountId: ACCOUNT_A,
      current: correction.record,
      expectedVersionId: original.versionId,
      expectedContentHash: original.contentHash,
      expectedReviewHash: original.review.reviewHash,
      to: "in_review",
      actor: { kind: "human", actorId: REVIEWER },
      at: "2026-08-30T13:04:00.000Z",
      reason: "Old approval cannot authorize a correction.",
    })).toEqual({ ok: false, code: "STALE_VERSION" });
  });

  it("rejects scope, lineage, Unicode, delivery fields, proxies, and accessors without executing traps", () => {
    const original = approved();
    expect(buildContactRecord(input({ tenantId: TENANT_B }))).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(buildContactRecord(input({
      revision: 2,
      predecessor: {
        predecessorVersion: 1,
        stableKey: original.stableKey,
        revision: original.revision,
        supersedesVersionId: original.supersedesVersionId,
        record: original,
      },
      tenantId: TENANT_B,
      createdAt: "2026-08-30T13:03:00.000Z",
    }))).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(buildContactRecord(input({ identity: { ...input().identity, displayName: "Buyer\u200b" } })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildContactRecord(input({ identity: { ...input().identity, displayName: "Ｓynthetic Buyer" } })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildContactRecord(input({ identity: { ...input().identity, displayName: "Buyer\ud800" } })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(buildContactRecord({ ...input(), send: true })).toEqual({ ok: false, code: "MALFORMED_INPUT" });

    let traps = 0;
    const trap = (): never => {
      traps += 1;
      throw new Error("must not execute");
    };
    expect(buildContactRecord(new Proxy(input(), { getPrototypeOf: trap })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const accessor = input();
    Object.defineProperty(accessor.identity, "contactPoint", { enumerable: true, get: trap });
    expect(buildContactRecord(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(traps).toBe(0);
  });
});
