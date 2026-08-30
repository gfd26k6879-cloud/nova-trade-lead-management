import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AccountMergeHistoryPanel } from "@/components/accounts/account-merge-history-panel";
import {
  createAccountMergeSnapshot,
  transitionAccountMerge,
  type AccountMergeSnapshot,
} from "@/lib/discovery/account-resolution";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "30000000-0000-4000-8000-000000000001";

function initialSnapshot(): AccountMergeSnapshot {
  const result = createAccountMergeSnapshot({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    members: [
      { accountId: "account:apex-a", version: 1, status: "active", redirectToAccountId: null, observationRefs: ["observation:one"] },
      { accountId: "account:apex-b", version: 1, status: "active", redirectToAccountId: null, observationRefs: ["observation:one"] },
    ],
  });
  if (!result.ok) throw new Error(result.code);
  return result.snapshot;
}

function merge(snapshot: AccountMergeSnapshot, at = "2026-08-30T16:01:00.000Z"): AccountMergeSnapshot {
  const result = transitionAccountMerge({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    current: snapshot,
    expectedStateHash: snapshot.stateHash,
    action: "merge",
    survivorAccountId: "account:apex-a",
    retiredAccountId: "account:apex-b",
    evidenceObservationIds: ["observation:one"],
    actor: { kind: "human", actorId: REVIEWER_ID },
    at,
    reason: "Human verified that both records identify the same operating company.",
  });
  if (!result.ok) throw new Error(result.code);
  return result.snapshot;
}

function unmerge(snapshot: AccountMergeSnapshot): AccountMergeSnapshot {
  const result = transitionAccountMerge({
    version: 1,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    current: snapshot,
    expectedStateHash: snapshot.stateHash,
    action: "unmerge",
    survivorAccountId: "account:apex-a",
    retiredAccountId: "account:apex-b",
    evidenceObservationIds: ["observation:one"],
    actor: { kind: "human", actorId: REVIEWER_ID },
    at: "2026-08-30T16:02:00.000Z",
    reason: "New source evidence established that the records represent separate companies.",
  });
  if (!result.ok) throw new Error(result.code);
  return result.snapshot;
}

describe("AccountMergeHistoryPanel", () => {
  it("shows exact immutable evidence, reason, human actor, time, and current binding", () => {
    const snapshot = merge(initialSnapshot());
    const binding = snapshot.members.find((member) => member.accountId === "account:apex-b");
    if (!binding) throw new Error("missing binding");

    const html = renderToStaticMarkup(
      <AccountMergeHistoryPanel
        state="ready"
        tenantId={TENANT_ID}
        workspaceId={WORKSPACE_ID}
        currentBinding={binding}
        events={snapshot.events}
        unmergeAuthorized={false}
      />,
    );

    expect(html).toContain('data-account-merge-history-state="ready"');
    expect(html).toContain('data-binding-status="merged"');
    expect(html).toContain('aria-label="Current binding status: Merged · redirected"');
    expect(html).toContain("Human verified that both records identify the same operating company.");
    expect(html).toContain(REVIEWER_ID);
    expect(html).toContain("observation:one");
    expect(html).toContain(snapshot.events[0]?.eventId);
    expect(html).toContain("Current relationship");
    expect(html).toContain("account:apex-b");
    expect(html).toContain("account:apex-a");
    expect(html).toContain("Aug 30, 2026");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("offers only the supplied final-authorized request for the exact current merge", () => {
    const snapshot = merge(initialSnapshot());
    const binding = snapshot.members.find((member) => member.accountId === "account:apex-b");
    if (!binding) throw new Error("missing binding");
    const onRequestUnmerge = vi.fn();

    const html = renderToStaticMarkup(
      <AccountMergeHistoryPanel
        state="ready"
        tenantId={TENANT_ID}
        workspaceId={WORKSPACE_ID}
        currentBinding={binding}
        events={snapshot.events}
        unmergeAuthorized
        onRequestUnmerge={onRequestUnmerge}
      />,
    );

    expect(html).toContain("Request unmerge from account:apex-a");
    expect(html.match(/<button\b/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*focus-visible:outline-2/u);
    expect(html).toContain("This panel submits a request only.");
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
  });

  it("shows reversed history without exposing an unmerge request", () => {
    const snapshot = unmerge(merge(initialSnapshot()));
    const binding = snapshot.members.find((member) => member.accountId === "account:apex-b");
    if (!binding) throw new Error("missing binding");

    const html = renderToStaticMarkup(
      <AccountMergeHistoryPanel
        state="ready"
        tenantId={TENANT_ID}
        workspaceId={WORKSPACE_ID}
        currentBinding={binding}
        events={snapshot.events}
        unmergeAuthorized
        onRequestUnmerge={() => undefined}
      />,
    );

    expect(html).toContain('data-binding-status="active"');
    expect(html).toContain("Historical");
    expect(html).toContain("Reversed");
    expect(html).toContain("New source evidence established that the records represent separate companies.");
    expect(html).toContain("No current merge relationship is eligible for reversal.");
    expect(html).not.toMatch(/<button\b/u);
  });

  it("fails closed for cross-scope, out-of-order, or inconsistent current data", () => {
    const snapshot = merge(initialSnapshot());
    const binding = snapshot.members.find((member) => member.accountId === "account:apex-b");
    if (!binding) throw new Error("missing binding");
    const forgedEvent = { ...snapshot.events[0], workspaceId: "20000000-0000-4000-8000-000000000099" };

    const crossScope = renderToStaticMarkup(
      <AccountMergeHistoryPanel
        state="ready"
        tenantId={TENANT_ID}
        workspaceId={WORKSPACE_ID}
        currentBinding={binding}
        events={[forgedEvent]}
        unmergeAuthorized
        onRequestUnmerge={() => undefined}
      />,
    );
    expect(crossScope).toContain('data-account-merge-history-state="invalid"');
    expect(crossScope).toContain('role="alert"');
    expect(crossScope).not.toMatch(/<button\b/u);

    const inconsistent = renderToStaticMarkup(
      <AccountMergeHistoryPanel
        state="ready"
        tenantId={TENANT_ID}
        workspaceId={WORKSPACE_ID}
        currentBinding={{ ...binding, redirectToAccountId: "account:other" }}
        events={snapshot.events}
        unmergeAuthorized
        onRequestUnmerge={() => undefined}
      />,
    );
    expect(inconsistent).toContain('data-account-merge-history-state="invalid"');
    expect(inconsistent).not.toMatch(/<button\b/u);

    const staleActive = renderToStaticMarkup(
      <AccountMergeHistoryPanel
        state="ready"
        tenantId={TENANT_ID}
        workspaceId={WORKSPACE_ID}
        currentBinding={{ ...binding, status: "active", redirectToAccountId: null }}
        events={snapshot.events}
        unmergeAuthorized
        onRequestUnmerge={() => undefined}
      />,
    );
    expect(staleActive).toContain('data-account-merge-history-state="invalid"');
    expect(staleActive).not.toMatch(/<button\b/u);
  });

  it("renders accessible loading, error, empty, and responsive ready states", () => {
    const loading = renderToStaticMarkup(<AccountMergeHistoryPanel state="loading" />);
    expect(loading).toContain('data-account-merge-history-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');

    const error = renderToStaticMarkup(<AccountMergeHistoryPanel state="error" error="Merge events unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Merge events unavailable.");

    const empty = renderToStaticMarkup(<AccountMergeHistoryPanel state="empty" />);
    expect(empty).toContain("No merge history selected");

    const snapshot = initialSnapshot();
    const binding = snapshot.members[0];
    if (!binding) throw new Error("missing binding");
    const ready = renderToStaticMarkup(
      <AccountMergeHistoryPanel
        state="ready"
        tenantId={TENANT_ID}
        workspaceId={WORKSPACE_ID}
        currentBinding={binding}
        events={[]}
        unmergeAuthorized={false}
      />,
    );
    expect(ready).toContain('aria-labelledby="account-merge-history-title"');
    expect(ready).toContain('aria-labelledby="account-merge-events-title"');
    expect(ready).toContain('aria-label="Current account binding and unmerge request"');
    expect(ready).toContain("xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]");
    expect(ready).toContain("No merge or unmerge event has been recorded for this account.");
  });
});
