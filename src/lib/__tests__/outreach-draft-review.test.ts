import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildOutreachDraft,
  createOutreachDraftCurrentVersionState,
  outreachDraftEligibleActionsForVersion,
  refreshOutreachDraftCurrentReview,
  supersedeOutreachDraftCurrentVersion,
  transitionOutreachDraftReview,
  type OutreachDraft,
  type OutreachDraftReviewSnapshot,
} from "@/lib/outreach/draft-review";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const ACCOUNT_ID = "30000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "40000000-0000-4000-8000-000000000001";
const SUBJECT = "A possible fit";
const BODY = "Your public catalog lists epoxy systems for industrial flooring.";
const CLAIM_TEXT = "epoxy systems for industrial flooring";

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function canonicalHash(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function sourceReceipt() {
  const quote = "Industrial flooring epoxy systems";
  const payload = {
    receiptVersion: 1,
    evidenceId: "evidence:fixture-001",
    citationId: "citation:fixture-001",
    sourceVersionId: "account-source-version:fixture-001-v1",
    sourceContentHash: sha256("fixture source version bytes"),
    sourceKind: "account",
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    locator: "catalog.pdf#page=4",
    quote,
    quoteHash: sha256(quote),
  };
  return { ...payload, receiptHash: sha256(JSON.stringify(payload)) };
}

function source(overrides: Record<string, unknown> = {}) {
  const textHash = sha256(CLAIM_TEXT);
  const quoteHash = sha256("Industrial flooring epoxy systems");
  const start = BODY.indexOf(CLAIM_TEXT);
  return {
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    stableKey: "outreach-draft:fixture-001",
    revision: 1,
    predecessor: null,
    createdAt: "2026-08-30T15:00:00.000Z",
    subject: SUBJECT,
    body: BODY,
    claims: [{
      claimId: "draft-claim:fixture-001",
      field: "body",
      start,
      end: start + CLAIM_TEXT.length,
      text: CLAIM_TEXT,
      textHash,
      claimClass: "compatibility_application",
      material: true,
      citationIds: ["citation:fixture-001"],
      uncertainty: "Application fit requires human confirmation.",
    }],
    citations: [{
      citationVersion: 1,
      citationId: "citation:fixture-001",
      evidenceId: "evidence:fixture-001",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      state: "resolved",
      quoteHash,
      locator: "catalog.pdf#page=4",
    }],
    evidence: [{
      evidenceVersion: 1,
      evidenceId: "evidence:fixture-001",
      sourceKind: "account",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      approvalState: "approved",
      support: "direct",
      freshness: "current",
      conflict: "none",
      revokedAt: null,
      claimTextHash: textHash,
      citationId: "citation:fixture-001",
      sourceReceipt: sourceReceipt(),
    }],
    ...overrides,
  };
}

function created(value = source()): OutreachDraft {
  const result = buildOutreachDraft(value);
  if (!result.ok) throw new Error(result.code);
  return result.draft;
}

function transition(
  current: OutreachDraftReviewSnapshot,
  to: "in_review" | "approved" | "rejected",
  at: string,
) {
  return transitionOutreachDraftReview({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    accountId: ACCOUNT_ID,
    current,
    expectedVersionId: current.versionId,
    expectedContentHash: current.contentHash,
    expectedValidationHash: current.validationHash,
    expectedReviewHash: current.reviewHash,
    to,
    actor: { kind: "human", actorId: REVIEWER_ID },
    at,
    reason: `Human outreach decision: ${to}.`,
  });
}

describe("outreach draft review lifecycle", () => {
  it("creates a deterministic immutable draft with an exact citation-validation receipt", () => {
    const first = buildOutreachDraft(source());
    const replay = buildOutreachDraft(source());

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      ok: true,
      code: "OUTREACH_DRAFT_CREATED",
      draft: {
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        accountId: ACCOUNT_ID,
        stableKey: "outreach-draft:fixture-001",
        revision: 1,
        supersedesVersionId: null,
        subject: SUBJECT,
        body: BODY,
        validation: {
          tenantId: TENANT_ID,
          workspaceId: WORKSPACE_ID,
          accountId: ACCOUNT_ID,
          draftId: "outreach-draft:fixture-001",
          claims: [{ claimId: "draft-claim:fixture-001" }],
        },
        review: { status: "draft", events: [], eligibleActions: [] },
      },
    });
    if (!first.ok) return;
    expect(first.draft.contentHash)
      .toBe("sha256:849672e99602d6de9ad159a2a74f9a1cbe57cd5af90899113b462a57d7daf29d");
    expect(first.draft.evidenceDigest).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(first.draft.versionId).toBe(`outreach-draft-version:${first.draft.versionHash.slice(7)}`);
    expect(first.draft.review.versionId).toBe(first.draft.versionId);
    expect(first.draft.review.contentHash).toBe(first.draft.contentHash);
    expect(first.draft.review.validationHash).toBe(first.draft.validationHash);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.draft)).toBe(true);
    expect(Object.isFrozen(first.draft.validation)).toBe(true);
    expect(Object.isFrozen(first.draft.validation.claims)).toBe(true);
    expect(Object.isFrozen(first.draft.review)).toBe(true);
    expect(Object.isFrozen(first.draft.review.eligibleActions)).toBe(true);
  });

  it("allows only a human to review and approve the exact validated version for copy or export", () => {
    const draft = created();
    const reviewing = transition(draft.review, "in_review", "2026-08-30T15:01:00.000Z");
    expect(reviewing).toMatchObject({
      ok: true,
      review: { status: "in_review", eligibleActions: [], events: [{ from: "draft", to: "in_review" }] },
    });
    if (!reviewing.ok) return;

    const approved = transition(reviewing.review, "approved", "2026-08-30T15:02:00.000Z");
    expect(approved).toMatchObject({
      ok: true,
      code: "OUTREACH_DRAFT_REVIEW_TRANSITIONED",
      review: { status: "approved", eligibleActions: ["copy", "export"] },
    });
    if (!approved.ok) return;
    expect(Object.isFrozen(approved.review.events)).toBe(true);
    expect(Object.isFrozen(approved.review.events[0]?.actor)).toBe(true);
    expect(JSON.stringify(approved.review)).not.toMatch(/send|deliver|recipient|transport/iu);

    expect(transition(draft.review, "approved", "2026-08-30T15:01:00.000Z"))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(transitionOutreachDraftReview({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: draft.review,
      expectedVersionId: draft.versionId,
      expectedContentHash: draft.contentHash,
      expectedValidationHash: draft.validationHash,
      expectedReviewHash: draft.review.reviewHash,
      to: "in_review",
      actor: { kind: "agent", actorId: REVIEWER_ID },
      at: "2026-08-30T15:01:00.000Z",
      reason: "An agent cannot satisfy human review.",
    })).toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
  });

  it("rejects a recomputed current-state hash when registration predates its embedded review", () => {
    const draft = created();
    const reviewing = transition(draft.review, "in_review", "2026-08-30T15:01:00.000Z");
    if (!reviewing.ok) throw new Error(reviewing.code);
    const approved = transition(reviewing.review, "approved", "2026-08-30T15:02:00.000Z");
    if (!approved.ok) throw new Error(approved.code);
    const current = createOutreachDraftCurrentVersionState({ version: 1, tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID, accountId: ACCOUNT_ID, review: approved.review,
      actor: { kind: "human", actorId: REVIEWER_ID }, at: "2026-08-30T15:02:30.000Z",
      reason: "Register the exact approved draft as current." });
    if (!current.ok) throw new Error(current.code);
    const events = [{ ...current.state.events[0], at: "2026-08-30T15:01:30.000Z" }];
    const payload = { stateVersion: current.state.stateVersion, tenantId: current.state.tenantId,
      workspaceId: current.state.workspaceId, accountId: current.state.accountId,
      stableKey: current.state.stableKey, current: current.state.current, events };
    const forged = { ...payload, stateHash: canonicalHash(payload) };
    expect(outreachDraftEligibleActionsForVersion(forged, draft.versionId)).toEqual([]);
  });

  it("turns an edit into a new draft version that cannot reuse prior validation or approval", () => {
    const original = created();
    const reviewing = transition(original.review, "in_review", "2026-08-30T15:01:00.000Z");
    if (!reviewing.ok) throw new Error(reviewing.code);
    const approved = transition(reviewing.review, "approved", "2026-08-30T15:02:00.000Z");
    if (!approved.ok) throw new Error(approved.code);

    const replacement = buildOutreachDraft(source({
      revision: 2,
      predecessor: {
        predecessorVersion: 1,
        stableKey: original.stableKey,
        revision: original.revision,
        supersedesVersionId: original.supersedesVersionId,
        review: approved.review,
      },
      createdAt: "2026-08-30T15:03:00.000Z",
      body: `${BODY} Updated.`,
    }));
    expect(replacement).toMatchObject({
      ok: true,
      code: "OUTREACH_DRAFT_VERSION_CREATED",
      draft: {
        revision: 2,
        supersedesVersionId: original.versionId,
        review: { status: "draft", events: [], eligibleActions: [] },
      },
    });
    if (!replacement.ok) return;
    expect(replacement.draft.versionId).not.toBe(original.versionId);
    expect(replacement.draft.contentHash).not.toBe(original.contentHash);
    expect(replacement.draft.validationHash).not.toBe(original.validationHash);
    expect(replacement.draft.review.reviewHash).not.toBe(approved.review.reviewHash);

    expect(transitionOutreachDraftReview({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: replacement.draft.review,
      expectedVersionId: original.versionId,
      expectedContentHash: original.contentHash,
      expectedValidationHash: original.validationHash,
      expectedReviewHash: approved.review.reviewHash,
      to: "in_review",
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:04:00.000Z",
      reason: "Old approval must not carry forward.",
    })).toEqual({ ok: false, code: "STALE_VERSION" });
  });

  it("binds versioned review authority to exact citation and source receipt inputs", () => {
    const baseline = buildOutreachDraft(source());
    const changed = structuredClone(source());
    const quote = "Industrial coatings source, revised";
    const quoteHash = sha256(quote);
    changed.citations[0].locator = "catalog-v2.pdf#page=9";
    changed.citations[0].quoteHash = quoteHash;
    changed.evidence[0].sourceReceipt.sourceVersionId = "account-source-version:fixture-001-v2";
    changed.evidence[0].sourceReceipt.sourceContentHash = sha256("fixture source version two bytes");
    changed.evidence[0].sourceReceipt.locator = "catalog-v2.pdf#page=9";
    changed.evidence[0].sourceReceipt.quote = quote;
    changed.evidence[0].sourceReceipt.quoteHash = quoteHash;
    const receiptPayload = Object.fromEntries(
      Object.entries(changed.evidence[0].sourceReceipt).filter(([key]) => key !== "receiptHash"),
    );
    changed.evidence[0].sourceReceipt.receiptHash = sha256(JSON.stringify(receiptPayload));
    const replacement = buildOutreachDraft(changed);
    expect(baseline.ok).toBe(true);
    expect(replacement.ok).toBe(true);
    if (!baseline.ok || !replacement.ok) return;
    expect(replacement.draft.contentHash).toBe(baseline.draft.contentHash);
    expect(replacement.draft.validationHash).not.toBe(baseline.draft.validationHash);
    expect(replacement.draft.evidenceDigest).not.toBe(baseline.draft.evidenceDigest);
    expect(replacement.draft.versionId).not.toBe(baseline.draft.versionId);
    expect(replacement.draft.review.reviewHash).not.toBe(baseline.draft.review.reviewHash);
  });

  it("makes an approved predecessor ineligible when a replacement becomes current", () => {
    const original = created();
    const reviewing = transition(original.review, "in_review", "2026-08-30T15:01:00.000Z");
    if (!reviewing.ok) throw new Error(reviewing.code);
    const approved = transition(reviewing.review, "approved", "2026-08-30T15:02:00.000Z");
    if (!approved.ok) throw new Error(approved.code);
    const current = createOutreachDraftCurrentVersionState({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      review: approved.review,
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:02:30.000Z",
      reason: "Register the exact approved draft as current.",
    });
    if (!current.ok) throw new Error(current.code);
    expect(outreachDraftEligibleActionsForVersion(current.state, original.versionId)).toEqual(["copy", "export"]);

    const replacement = buildOutreachDraft(source({
      revision: 2,
      predecessor: {
        predecessorVersion: 1,
        stableKey: original.stableKey,
        revision: original.revision,
        supersedesVersionId: original.supersedesVersionId,
        review: approved.review,
      },
      createdAt: "2026-08-30T15:03:00.000Z",
      body: `${BODY} Updated.`,
    }));
    if (!replacement.ok) throw new Error(replacement.code);
    const superseded = supersedeOutreachDraftCurrentVersion({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: current.state,
      expectedStateHash: current.state.stateHash,
      predecessorReview: approved.review,
      replacementReview: replacement.draft.review,
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:04:00.000Z",
      reason: "Register the edited draft and retire predecessor eligibility.",
    });
    expect(superseded).toMatchObject({
      ok: true,
      code: "OUTREACH_DRAFT_CURRENT_VERSION_SUPERSEDED",
      state: { current: { versionId: replacement.draft.versionId, eligibleActions: [] } },
    });
    if (!superseded.ok) return;
    expect(outreachDraftEligibleActionsForVersion(superseded.state, original.versionId)).toEqual([]);
    expect(outreachDraftEligibleActionsForVersion(superseded.state, replacement.draft.versionId)).toEqual([]);
    const forgedCurrent = {
      ...superseded.state.current,
      status: "approved",
      eligibleActions: ["copy", "export"],
    };
    const forgedEvents = [
      ...superseded.state.events.slice(0, -1),
      { ...superseded.state.events.at(-1), to: forgedCurrent },
    ];
    const forgedPayload = {
      stateVersion: superseded.state.stateVersion,
      tenantId: superseded.state.tenantId,
      workspaceId: superseded.state.workspaceId,
      accountId: superseded.state.accountId,
      stableKey: superseded.state.stableKey,
      current: forgedCurrent,
      events: forgedEvents,
    };
    const forgedState = { ...forgedPayload, stateHash: canonicalHash(forgedPayload) };
    expect(outreachDraftEligibleActionsForVersion(forgedState, replacement.draft.versionId)).toEqual([]);
    const replacementReviewing = transition(
      replacement.draft.review,
      "in_review",
      "2026-08-30T15:05:00.000Z",
    );
    if (!replacementReviewing.ok) throw new Error(replacementReviewing.code);
    const replacementApproved = transition(replacementReviewing.review, "approved", "2026-08-30T15:06:00.000Z");
    if (!replacementApproved.ok) throw new Error(replacementApproved.code);
    expect(createOutreachDraftCurrentVersionState({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      review: replacementApproved.review,
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:07:00.000Z",
      reason: "A replacement cannot fabricate a new current-state ledger.",
    })).toEqual({ ok: false, code: "VERSION_CONFLICT" });
    const refreshed = refreshOutreachDraftCurrentReview({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: superseded.state,
      expectedStateHash: superseded.state.stateHash,
      review: replacementApproved.review,
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:07:00.000Z",
      reason: "Refresh the current binding after approval.",
    });
    if (!refreshed.ok) throw new Error(refreshed.code);
    expect(refreshed.state.events.slice(0, -1)).toEqual(superseded.state.events);
    expect(refreshed.state.events.at(-1)).toMatchObject({
      fromVersionId: replacement.draft.versionId,
      to: { versionId: replacement.draft.versionId, status: "approved" },
    });
    expect(outreachDraftEligibleActionsForVersion(refreshed.state, original.versionId)).toEqual([]);
    expect(outreachDraftEligibleActionsForVersion(refreshed.state, replacement.draft.versionId))
      .toEqual(["copy", "export"]);
    const earlyRefreshEvents = [...refreshed.state.events.slice(0, -1),
      { ...refreshed.state.events.at(-1), at: "2026-08-30T15:05:30.000Z" }];
    const earlyRefreshPayload = { stateVersion: refreshed.state.stateVersion, tenantId: refreshed.state.tenantId,
      workspaceId: refreshed.state.workspaceId, accountId: refreshed.state.accountId,
      stableKey: refreshed.state.stableKey, current: refreshed.state.current, events: earlyRefreshEvents };
    expect(outreachDraftEligibleActionsForVersion(
      { ...earlyRefreshPayload, stateHash: canonicalHash(earlyRefreshPayload) },
      replacement.draft.versionId,
    )).toEqual([]);
    expect(refreshOutreachDraftCurrentReview({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: superseded.state,
      expectedStateHash: sha256("stale current state"),
      review: replacementApproved.review,
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:07:00.000Z",
      reason: "A stale refresh must fail closed.",
    })).toEqual({ ok: false, code: "STALE_VERSION" });
    expect(supersedeOutreachDraftCurrentVersion({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: current.state,
      expectedStateHash: sha256("stale current state"),
      predecessorReview: approved.review,
      replacementReview: replacement.draft.review,
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:04:00.000Z",
      reason: "A stale registration must fail closed.",
    })).toEqual({ ok: false, code: "STALE_VERSION" });
    expect(supersedeOutreachDraftCurrentVersion({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: current.state,
      expectedStateHash: current.state.stateHash,
      predecessorReview: approved.review,
      replacementReview: replacement.draft.review,
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: replacement.draft.createdAt,
      reason: "Registration cannot predate the replacement.",
    })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  it("fails closed on stale bindings, cross-scope review, hostile structure, and delivery fields", () => {
    const draft = created();
    const stale = {
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      accountId: ACCOUNT_ID,
      current: draft.review,
      expectedVersionId: draft.versionId,
      expectedContentHash: draft.contentHash,
      expectedValidationHash: sha256("stale validation"),
      expectedReviewHash: draft.review.reviewHash,
      to: "in_review",
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T15:01:00.000Z",
      reason: "Review the exact validation receipt.",
    };
    expect(transitionOutreachDraftReview(stale)).toEqual({ ok: false, code: "STALE_VERSION" });
    expect(transitionOutreachDraftReview({ ...stale, tenantId: "10000000-0000-4000-8000-000000000099" }))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });

    let traps = 0;
    const trap = (): never => {
      traps += 1;
      throw new Error("must not execute");
    };
    expect(buildOutreachDraft(new Proxy(source(), { ownKeys: trap })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const accessor = source();
    Object.defineProperty(accessor, "body", { enumerable: true, get: trap });
    expect(buildOutreachDraft(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const nestedProxy = source({ claims: new Proxy([], { ownKeys: trap }) });
    expect(buildOutreachDraft(nestedProxy)).toEqual({ ok: false, code: "CITATION_VALIDATION_FAILED" });
    expect(traps).toBe(0);

    const foreignCitation = structuredClone(source());
    foreignCitation.citations[0].tenantId = "10000000-0000-4000-8000-000000000099";
    expect(buildOutreachDraft(foreignCitation)).toEqual({ ok: false, code: "CITATION_VALIDATION_FAILED" });

    for (const forbidden of [
      { recipientEmail: "person@example.test" },
      { send: true },
      { deliveredAt: "2026-08-30T16:00:00.000Z" },
    ]) {
      expect(buildOutreachDraft({ ...source(), ...forbidden }))
        .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    }
    expect(buildOutreachDraft(source({ body: `${BODY}\u200b` })))
      .toEqual({ ok: false, code: "CITATION_VALIDATION_FAILED" });
  });

  it("records rejection immutably without making the version action eligible", () => {
    const draft = created();
    const reviewing = transition(draft.review, "in_review", "2026-08-30T15:01:00.000Z");
    if (!reviewing.ok) throw new Error(reviewing.code);
    const rejected = transition(reviewing.review, "rejected", "2026-08-30T15:02:00.000Z");
    expect(rejected).toMatchObject({
      ok: true,
      review: { status: "rejected", eligibleActions: [], events: [{}, { to: "rejected" }] },
    });
    if (!rejected.ok) return;
    expect(Object.isFrozen(rejected.review)).toBe(true);
    expect(Object.isFrozen(rejected.review.events)).toBe(true);
    expect(transition(rejected.review, "in_review", "2026-08-30T15:03:00.000Z"))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});
