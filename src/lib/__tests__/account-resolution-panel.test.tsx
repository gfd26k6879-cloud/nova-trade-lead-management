import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AccountResolutionPanel } from "@/components/accounts/account-resolution-panel";
import {
  createAccountMergeSnapshot,
  resolveAccountObservations,
  transitionAccountMerge,
  type AccountMergeSnapshot,
  type AccountResolution,
} from "@/lib/discovery/account-resolution";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "30000000-0000-4000-8000-000000000001";
const HASH_A = `sha256:${"a".repeat(64)}`;
const HASH_B = `sha256:${"b".repeat(64)}`;

function observation(id = "observation:one", externalId = "ChIJ-one") {
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
  };
}

function candidate(accountId: string) {
  return {
    accountId,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    version: 1,
    status: "active" as const,
    exactKeys: [{ sourceKey: "google-places", namespace: "us:place-id", externalId: "ChIJ-one" }],
    observationRefs: ["observation:one"],
  };
}

function resolution(candidateIds: readonly string[]): AccountResolution {
  const result = resolveAccountObservations({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    observations: [observation()],
    candidates: candidateIds.map(candidate),
  });
  if (!result.ok) throw new Error(result.code);
  return result.resolution;
}

function canonicalCandidate(): AccountResolution {
  const result = resolveAccountObservations({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    observations: [observation()],
    candidates: [],
  });
  if (!result.ok) throw new Error(result.code);
  return result.resolution;
}

function mergeSnapshot(): AccountMergeSnapshot {
  const created = createAccountMergeSnapshot({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    members: [
      { accountId: "account:apex-a", version: 1, status: "active", redirectToAccountId: null, observationRefs: ["observation:one"] },
      { accountId: "account:apex-b", version: 1, status: "active", redirectToAccountId: null, observationRefs: ["observation:one"] },
    ],
  });
  if (!created.ok) throw new Error(created.code);
  return created.snapshot;
}

function mergedSnapshot(): AccountMergeSnapshot {
  const initial = mergeSnapshot();
  const merged = transitionAccountMerge({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    current: initial,
    expectedStateHash: initial.stateHash,
    action: "merge",
    survivorAccountId: "account:apex-a",
    retiredAccountId: "account:apex-b",
    evidenceObservationIds: ["observation:one"],
    actor: { kind: "human", actorId: REVIEWER_ID },
    at: "2026-08-30T16:01:00.000Z",
    reason: "Human verified that both records describe the same operating account.",
  });
  if (!merged.ok) throw new Error(merged.code);
  return merged.snapshot;
}

describe("AccountResolutionPanel", () => {
  it("shows an exact canonical identity with the governing reason and immutable source evidence", () => {
    const current = resolution(["account:apex"]);
    const html = renderToStaticMarkup(<AccountResolutionPanel state="ready" resolution={current} />);

    expect(html).toContain('data-account-resolution-state="ready"');
    expect(html).toContain('data-resolution-kind="auto_resolved"');
    expect(html).toContain('aria-label="Resolution status: Exact match"');
    expect(html).toContain("account:apex");
    expect(html).toContain("Exact source key, namespace, and external ID matched one active account");
    expect(html).toContain('aria-label="Account identity observations"');
    expect(html).toContain("google-places");
    expect(html).toContain("us:place-id");
    expect(html).toContain("ChIJ-one");
    expect(html).toContain(`Payload: ${HASH_A}`);
    expect(html).toContain(`Provenance: ${HASH_B}`);
    expect(html).toContain(current.resolutionId);
    expect(html).not.toMatch(/<button\b/u);
  });

  it("makes ambiguity explicit and exposes only eligible human review and reversible merge requests", () => {
    const current = resolution(["account:apex-a", "account:apex-b"]);
    const onReview = vi.fn();
    const onMerge = vi.fn();
    const html = renderToStaticMarkup(
      <AccountResolutionPanel
        state="ready"
        resolution={current}
        mergeSnapshot={mergeSnapshot()}
        onRequestReview={onReview}
        onRequestMerge={onMerge}
        onRequestUnmerge={() => undefined}
      />,
    );

    expect(html).toContain('data-resolution-kind="human_review"');
    expect(html).toContain('aria-label="Resolution status: Human review required"');
    expect(html).toContain("No canonical account selected");
    expect(html).toContain("No identity change has been made.");
    expect(html).toContain("Review ambiguous identity");
    expect(html).toContain("Merge account:apex-b into account:apex-a");
    expect(html).toContain("Merge account:apex-a into account:apex-b");
    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).toContain("This panel never changes records directly.");
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
  });

  it("shows merge provenance and offers unmerge only while the exact reversible relationship is current", () => {
    const html = renderToStaticMarkup(
      <AccountResolutionPanel
        state="ready"
        resolution={resolution(["account:apex-a", "account:apex-b"])}
        mergeSnapshot={mergedSnapshot()}
        onRequestMerge={() => undefined}
        onRequestUnmerge={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="Account merge and unmerge history"');
    expect(html).toContain("Merged accounts");
    expect(html).toContain("Human verified that both records describe the same operating account.");
    expect(html).toContain(`Human actor: ${REVIEWER_ID}`);
    expect(html).toContain('data-member-status="merged"');
    expect(html).toContain("Redirects to account:apex-a");
    expect(html).toContain("Unmerge account:apex-b from account:apex-a");
    expect(html).not.toMatch(/>Merge account:/u);
    expect(html.match(/<button\b/g)).toHaveLength(1);
  });

  it("distinguishes a derived canonical candidate from an existing exact account", () => {
    const current = canonicalCandidate();
    const html = renderToStaticMarkup(
      <AccountResolutionPanel state="ready" resolution={current} onRequestReview={() => undefined} />,
    );

    expect(html).toContain('data-resolution-kind="canonical_candidate"');
    expect(html).toContain('aria-label="Resolution status: Canonical candidate"');
    expect(html).toContain("A candidate was derived without creating an account.");
    expect(html).toContain(current.canonicalCandidateId ?? "missing candidate");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("fails closed on inconsistent resolution or merge state and withholds every transition control", () => {
    const exact = resolution(["account:apex"]);
    const forged = { ...exact, targetAccountId: null } as AccountResolution;
    const invalidResolution = renderToStaticMarkup(
      <AccountResolutionPanel state="ready" resolution={forged} onRequestReview={() => undefined} />,
    );
    expect(invalidResolution).toContain('data-account-resolution-state="invalid"');
    expect(invalidResolution).toContain('role="alert"');
    expect(invalidResolution).toContain("Resolution withheld");
    expect(invalidResolution).not.toMatch(/<button\b/u);

    const ambiguous = resolution(["account:apex-a", "account:apex-b"]);
    const foreignSnapshot = { ...mergeSnapshot(), workspaceId: "20000000-0000-4000-8000-000000000099" };
    const invalidMerge = renderToStaticMarkup(
      <AccountResolutionPanel
        state="ready"
        resolution={ambiguous}
        mergeSnapshot={foreignSnapshot}
        onRequestMerge={() => undefined}
        onRequestUnmerge={() => undefined}
      />,
    );
    expect(invalidMerge).toContain("Merge state could not be verified in this workspace.");
    expect(invalidMerge).not.toMatch(/<button\b/u);
  });

  it("renders accessible loading, error, empty, and responsive ready landmarks", () => {
    const loading = renderToStaticMarkup(<AccountResolutionPanel state="loading" />);
    expect(loading).toContain('data-account-resolution-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading account resolution");

    const error = renderToStaticMarkup(<AccountResolutionPanel state="error" error="Exact identity record unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Exact identity record unavailable.");

    const empty = renderToStaticMarkup(<AccountResolutionPanel state="empty" />);
    expect(empty).toContain('data-account-resolution-state="empty"');
    expect(empty).toContain("No account resolution yet");

    const ready = renderToStaticMarkup(<AccountResolutionPanel state="ready" resolution={resolution(["account:apex"])} />);
    expect(ready).toContain('aria-labelledby="account-resolution-title"');
    expect(ready).toContain('aria-labelledby="account-resolution-evidence-title"');
    expect(ready).toContain('aria-labelledby="account-merge-history-title"');
    expect(ready).toContain('aria-label="Canonical identity and human controls"');
    expect(ready).toContain("xl:grid-cols-[minmax(0,1.3fr)_minmax(19rem,.7fr)]");
    expect(ready).toContain("grid grid-cols-1 gap-2 sm:grid-cols-3");
    expect(ready).toMatch(/class="[^"]*break-all[^"]*"[^>]*>account:apex</u);
  });
});
