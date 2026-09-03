import { describe, expect, it } from "vitest";

import {
  createAccountMergeSnapshot,
  resolveAccountObservations,
  transitionAccountMerge,
  type AccountMergeSnapshot,
} from "@/lib/discovery/account-resolution";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "30000000-0000-4000-8000-000000000001";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function observation(id: string, externalId: string, overrides: Record<string, unknown> = {}) {
  return {
    observationId: id,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    sourceKey: "google-places",
    namespace: "us:place-id",
    externalId,
    observedAt: "2026-08-30T16:00:00.000Z",
    payloadHash: HASH_A,
    provenanceHash: HASH_B,
    ...overrides,
  };
}

function account(accountId: string, externalId: string, observationRefs: string[] = []) {
  return {
    accountId,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    version: 1,
    status: "active",
    exactKeys: [{ sourceKey: "google-places", namespace: "us:place-id", externalId }],
    observationRefs,
  };
}

function resolutionInput(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    observations: [observation("observation:one", "ChIJ-one")],
    candidates: [account("account:apex", "ChIJ-one", ["observation:historic"])],
    ...overrides,
  };
}

function mergeSnapshot(): AccountMergeSnapshot {
  const result = createAccountMergeSnapshot({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    members: [
      {
        accountId: "account:survivor",
        version: 3,
        status: "active",
        redirectToAccountId: null,
        observationRefs: ["observation:one"],
      },
      {
        accountId: "account:retired",
        version: 2,
        status: "active",
        redirectToAccountId: null,
        observationRefs: ["observation:two"],
      },
    ],
  });
  if (!result.ok) throw new Error(result.code);
  return result.snapshot;
}

describe("tenant-scoped account resolution", () => {
  it("auto-resolves one exact tenant/source namespace match and preserves immutable provenance", () => {
    const first = resolveAccountObservations(resolutionInput());
    const replay = resolveAccountObservations(resolutionInput());

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      ok: true,
      code: "ACCOUNT_RESOLUTION_COMPLETED",
      resolution: {
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        state: "auto_resolved",
        ruleId: "EXACT_SOURCE_ID_SAME_TENANT_NAMESPACE",
        targetAccountId: "account:apex",
        candidateAccountIds: ["account:apex"],
        observations: [{
          observationId: "observation:one",
          sourceKey: "google-places",
          namespace: "us:place-id",
          externalId: "ChIJ-one",
          payloadHash: HASH_A,
          provenanceHash: HASH_B,
        }],
      },
    });
    if (!first.ok) return;
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.resolution)).toBe(true);
    expect(Object.isFrozen(first.resolution.observations)).toBe(true);
    expect(Object.isFrozen(first.resolution.observations[0])).toBe(true);
  });

  it("routes conflicting exact candidates to human review and creates an unmatched canonical candidate", () => {
    const ambiguous = resolveAccountObservations(resolutionInput({
      candidates: [
        account("account:apex-a", "ChIJ-one"),
        account("account:apex-b", "ChIJ-one"),
      ],
    }));
    expect(ambiguous).toMatchObject({
      ok: true,
      resolution: {
        state: "human_review",
        ruleId: "CONFLICTING_EXACT_IDENTITY",
        targetAccountId: null,
        canonicalCandidateId: null,
        candidateAccountIds: ["account:apex-a", "account:apex-b"],
      },
    });

    const unmatched = resolveAccountObservations(resolutionInput({ candidates: [] }));
    expect(unmatched).toMatchObject({
      ok: true,
      resolution: {
        state: "canonical_candidate",
        ruleId: "NO_MATCH_OR_INSUFFICIENT_EVIDENCE",
        targetAccountId: null,
        candidateAccountIds: [],
      },
    });
    if (!unmatched.ok) return;
    expect(unmatched.resolution.canonicalCandidateId).toMatch(/^account-candidate:[0-9a-f]{64}$/u);

    const ungrouped = resolveAccountObservations(resolutionInput({
      observations: [
        observation("observation:first", "external:first"),
        observation("observation:second", "external:second"),
      ],
      candidates: [],
    }));
    expect(ungrouped).toMatchObject({
      ok: true,
      resolution: { state: "human_review", ruleId: "CONFLICTING_EXACT_IDENTITY", canonicalCandidateId: null },
    });

    const mergedCandidate = account("account:retired", "ChIJ-one");
    mergedCandidate.status = "merged";
    expect(resolveAccountObservations(resolutionInput({ candidates: [mergedCandidate] }))).toMatchObject({
      ok: true,
      resolution: { state: "human_review", targetAccountId: null, candidateAccountIds: ["account:retired"] },
    });
  });

  it("records a human-only reversible merge without losing either account's observation provenance", () => {
    const initial = mergeSnapshot();
    const merged = transitionAccountMerge({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      current: initial,
      expectedStateHash: initial.stateHash,
      action: "merge",
      survivorAccountId: "account:survivor",
      retiredAccountId: "account:retired",
      evidenceObservationIds: ["observation:one", "observation:two"],
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T16:01:00.000Z",
      reason: "Human verified both records represent the same operating account.",
    });
    expect(merged).toMatchObject({
      ok: true,
      code: "ACCOUNT_MERGE_TRANSITIONED",
      snapshot: {
        members: [
          { accountId: "account:retired", version: 3, status: "merged", redirectToAccountId: "account:survivor", observationRefs: ["observation:two"] },
          { accountId: "account:survivor", version: 4, status: "active", redirectToAccountId: null, observationRefs: ["observation:one"] },
        ],
        events: [{ action: "merge", evidenceObservationIds: ["observation:one", "observation:two"] }],
      },
    });
    if (!merged.ok) return;
    expect(Object.isFrozen(merged.snapshot)).toBe(true);
    expect(Object.isFrozen(merged.snapshot.members)).toBe(true);
    expect(Object.isFrozen(merged.snapshot.events[0]?.actor)).toBe(true);

    const unmerged = transitionAccountMerge({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      current: merged.snapshot,
      expectedStateHash: merged.snapshot.stateHash,
      action: "unmerge",
      survivorAccountId: "account:survivor",
      retiredAccountId: "account:retired",
      evidenceObservationIds: ["observation:one", "observation:two"],
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T16:02:00.000Z",
      reason: "Human reversed the identity merge while retaining its history.",
    });
    expect(unmerged).toMatchObject({
      ok: true,
      snapshot: {
        members: [
          { accountId: "account:retired", version: 4, status: "active", redirectToAccountId: null, observationRefs: ["observation:two"] },
          { accountId: "account:survivor", version: 5, status: "active", redirectToAccountId: null, observationRefs: ["observation:one"] },
        ],
        events: [{ action: "merge" }, { action: "unmerge" }],
      },
    });
  });

  it("fails closed on cross-scope, caps, duplicates, sparse arrays, proxies, and accessors", () => {
    const foreign = resolutionInput();
    foreign.observations[0].tenantId = "10000000-0000-4000-8000-000000000099";
    expect(resolveAccountObservations(foreign)).toEqual({ ok: false, code: "SCOPE_MISMATCH" });

    const capped = Array.from({ length: 65 }, (_, index) => observation(`observation:${index}`, `external:${index}`));
    expect(resolveAccountObservations(resolutionInput({ observations: capped })))
      .toEqual({ ok: false, code: "CAP_EXCEEDED" });
    const duplicate = observation("observation:duplicate", "external:duplicate");
    expect(resolveAccountObservations(resolutionInput({ observations: [duplicate, { ...duplicate }] })))
      .toEqual({ ok: false, code: "DUPLICATE_ITEM" });

    const sparse = Array(2);
    sparse[1] = observation("observation:sparse", "external:sparse");
    expect(resolveAccountObservations(resolutionInput({ observations: sparse })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });

    let traps = 0;
    const trap = (): never => {
      traps += 1;
      throw new Error("must not execute");
    };
    expect(resolveAccountObservations(new Proxy(resolutionInput(), { ownKeys: trap })))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    const accessor = resolutionInput();
    Object.defineProperty(accessor.observations[0], "externalId", { enumerable: true, get: trap });
    expect(resolveAccountObservations(accessor)).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(traps).toBe(0);

    expect(resolveAccountObservations(resolutionInput({
      observations: [observation("observation:unsafe", "external\u200b:unsafe")],
    }))).toEqual({ ok: false, code: "MALFORMED_INPUT" });
  });

  it("rejects forged or stale merge state, non-human actors, cross-scope requests, and invalid chronology", () => {
    const initial = mergeSnapshot();
    const base = {
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      current: initial,
      expectedStateHash: initial.stateHash,
      action: "merge",
      survivorAccountId: "account:survivor",
      retiredAccountId: "account:retired",
      evidenceObservationIds: ["observation:one", "observation:two"],
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T16:01:00.000Z",
      reason: "Human verified exact identity evidence.",
    };
    expect(transitionAccountMerge({ ...base, expectedStateHash: HASH_A }))
      .toEqual({ ok: false, code: "STALE_STATE" });
    expect(transitionAccountMerge({ ...base, tenantId: "10000000-0000-4000-8000-000000000099" }))
      .toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(transitionAccountMerge({ ...base, actor: { kind: "agent", actorId: REVIEWER_ID } }))
      .toEqual({ ok: false, code: "HUMAN_REVIEW_REQUIRED" });
    expect(transitionAccountMerge({ ...base, evidenceObservationIds: ["observation:one"] }))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(transitionAccountMerge({
      ...base,
      current: { ...initial, stateHash: HASH_A },
      expectedStateHash: HASH_A,
    })).toEqual({ ok: false, code: "MALFORMED_INPUT" });

    const merged = transitionAccountMerge(base);
    if (!merged.ok) throw new Error(merged.code);
    expect(transitionAccountMerge({
      ...base,
      current: merged.snapshot,
      expectedStateHash: merged.snapshot.stateHash,
      action: "unmerge",
    })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  it("refuses to append beyond the bounded merge history", () => {
    let current = mergeSnapshot();
    for (let index = 0; index < 100; index += 1) {
      const result = transitionAccountMerge({
        version: 1,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        current,
        expectedStateHash: current.stateHash,
        action: index % 2 === 0 ? "merge" : "unmerge",
        survivorAccountId: "account:survivor",
        retiredAccountId: "account:retired",
        evidenceObservationIds: ["observation:one", "observation:two"],
        actor: { kind: "human", actorId: REVIEWER_ID },
        at: new Date(Date.parse("2026-08-30T16:01:00.000Z") + index * 1_000).toISOString(),
        reason: "Human exercised the reversible merge history boundary.",
      });
      if (!result.ok) throw new Error(result.code);
      current = result.snapshot;
    }
    expect(transitionAccountMerge({
      version: 1,
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      current,
      expectedStateHash: current.stateHash,
      action: "merge",
      survivorAccountId: "account:survivor",
      retiredAccountId: "account:retired",
      evidenceObservationIds: ["observation:one", "observation:two"],
      actor: { kind: "human", actorId: REVIEWER_ID },
      at: "2026-08-30T17:00:00.000Z",
      reason: "Human must not create an unparseable 101st event.",
    })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});
