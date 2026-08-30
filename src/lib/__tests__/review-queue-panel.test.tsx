import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReviewQueuePanel } from "@/components/review/review-queue-panel";
import type { ReviewQueue, ReviewQueueItem } from "@/lib/review/review-queue";

const ACTOR = "30000000-0000-4000-8000-000000000001";
const OTHER_ACTOR = "30000000-0000-4000-8000-000000000002";
const HASH = `sha256:${"a".repeat(64)}`;
const NOW = "2026-08-30T12:10:00.000Z";

function queue(items: readonly ReviewQueueItem[]): ReviewQueue {
  return {
    queueVersion: 1,
    queueId: `review-queue:${"b".repeat(64)}`,
    tenantId: "10000000-0000-4000-8000-000000000001",
    workspaceId: "20000000-0000-4000-8000-000000000001",
    createdAt: "2026-08-30T12:00:00.000Z",
    items,
    events: [],
    queueHash: HASH,
  };
}

function fixtureItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    itemVersion: 1,
    itemId: `review-item:${"c".repeat(64)}`,
    kind: "ambiguous_account_resolution",
    subject: {
      subjectId: "account-candidate:acme",
      versionId: "account-resolution-version:acme-v1",
      contentHash: HASH,
    },
    priority: "high",
    reason: "Multiple candidate accounts require a human decision.",
    uncertaintyIds: ["uncertainty:domain-match"],
    status: "queued",
    claimedBy: null,
    leaseExpiresAt: null,
    resolution: null,
    enqueuedAt: "2026-08-30T12:01:00.000Z",
    updatedAt: "2026-08-30T12:01:00.000Z",
    ...overrides,
  };
}

function readyQueue(): ReviewQueue {
  return queue([
    fixtureItem(),
    fixtureItem({
      itemId: `review-item:${"d".repeat(64)}`,
      kind: "qualification_review",
      subject: { subjectId: "account:qualified-candidate", versionId: "qualification-version:v2", contentHash: HASH },
      priority: "urgent",
      reason: "High uncertainty requires a human qualification decision.",
      uncertaintyIds: ["uncertainty:market-fit", "uncertainty:timing"],
      status: "claimed",
      claimedBy: ACTOR,
      leaseExpiresAt: "2026-08-30T13:00:00.000Z",
      updatedAt: "2026-08-30T12:05:00.000Z",
    }),
    fixtureItem({
      itemId: `review-item:${"e".repeat(64)}`,
      kind: "buying_center_review",
      subject: { subjectId: "buying-center:acme", versionId: "buying-center-version:v3", contentHash: HASH },
      priority: "normal",
      reason: "Role hypotheses need explicit human confirmation.",
      uncertaintyIds: [],
      status: "resolved",
      claimedBy: OTHER_ACTOR,
      leaseExpiresAt: null,
      resolution: {
        decision: "changes_requested",
        note: "Verify the economic buyer before outreach use.",
        resolvedBy: OTHER_ACTOR,
        resolvedAt: "2026-08-30T12:06:00.000Z",
      },
      updatedAt: "2026-08-30T12:06:00.000Z",
    }),
  ]);
}

describe("ReviewQueuePanel", () => {
  it("renders every review kind with reasons, statuses, uncertainty, lease, assignee, and resolution", () => {
    const html = renderToStaticMarkup(
      <ReviewQueuePanel state="ready" queue={readyQueue()} actorId={ACTOR} now={NOW} />,
    );

    expect(html).toContain('data-surface="review-queue-panel"');
    expect(html).toContain('data-review-kind="ambiguous_account_resolution"');
    expect(html).toContain('data-review-kind="qualification_review"');
    expect(html).toContain('data-review-kind="buying_center_review"');
    expect(html).toContain("Ambiguous account resolution");
    expect(html).toContain("Qualification review");
    expect(html).toContain("Buying-center review");
    expect(html).toContain("Multiple candidate accounts require a human decision.");
    expect(html).toContain("High uncertainty requires a human qualification decision.");
    expect(html).toContain("Role hypotheses need explicit human confirmation.");
    expect(html).toContain('aria-label="Status: Queued"');
    expect(html).toContain('aria-label="Status: Claimed"');
    expect(html).toContain('aria-label="Status: Resolved"');
    expect(html).toContain(`Assignee ${ACTOR}`);
    expect(html).toContain('dateTime="2026-08-30T13:00:00.000Z"');
    expect(html).toContain("uncertainty:market-fit");
    expect(html).toContain("No uncertainty references supplied.");
    expect(html).toContain("Verify the economic buyer before outreach use.");
  });

  it("shows only contract-valid human actions for queued and actively owned items", () => {
    const html = renderToStaticMarkup(
      <ReviewQueuePanel
        state="ready"
        queue={readyQueue()}
        actorId={ACTOR}
        now={NOW}
        onClaim={vi.fn()}
        onRelease={vi.fn()}
        onResolve={vi.fn()}
      />,
    );

    expect(html.match(/<button\b/g)).toHaveLength(3);
    expect(html.match(/data-review-action="claim"/g)).toHaveLength(1);
    expect(html.match(/data-review-action="release"/g)).toHaveLength(1);
    expect(html.match(/data-review-action="resolve"/g)).toHaveLength(1);
    expect(html).toContain("Claim item");
    expect(html).toContain("Release item");
    expect(html).toContain("Resolve item");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*min-h-11[^>]*focus-visible:outline-2/u);
    expect(html).not.toMatch(/<(?:form|input|textarea|select)\b/u);
  });

  it("offers reclaim only after expiry and hides actions for foreign, malformed, or stale actor context", () => {
    const expired = queue([fixtureItem({
      status: "claimed",
      claimedBy: OTHER_ACTOR,
      leaseExpiresAt: "2026-08-30T12:09:00.000Z",
      updatedAt: "2026-08-30T12:05:00.000Z",
    })]);
    const callbacks = { onClaim: vi.fn(), onRelease: vi.fn(), onResolve: vi.fn() };
    const reclaim = renderToStaticMarkup(
      <ReviewQueuePanel state="ready" queue={expired} actorId={ACTOR} now={NOW} {...callbacks} />,
    );
    expect(reclaim.match(/<button\b/g)).toHaveLength(1);
    expect(reclaim).toContain("Reclaim expired item");
    expect(reclaim).toContain('aria-label="Status: Claimed, lease expired"');

    const activeForeign = queue([fixtureItem({
      status: "claimed",
      claimedBy: OTHER_ACTOR,
      leaseExpiresAt: "2026-08-30T13:00:00.000Z",
      updatedAt: "2026-08-30T12:05:00.000Z",
    })]);
    for (const [actorId, now] of [
      [ACTOR, NOW],
      ["not-a-human-uuid", NOW],
      [ACTOR, "not-a-canonical-time"],
      [ACTOR, "2026-08-30T11:59:00.000Z"],
    ] as const) {
      const html = renderToStaticMarkup(
        <ReviewQueuePanel state="ready" queue={activeForeign} actorId={actorId} now={now} {...callbacks} />,
      );
      expect(html).not.toMatch(/<button\b/u);
    }
  });

  it("renders responsive loading, error, empty, and ready landmarks", () => {
    const loading = renderToStaticMarkup(<ReviewQueuePanel state="loading" />);
    expect(loading).toContain('data-queue-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading review queue");

    const error = renderToStaticMarkup(<ReviewQueuePanel state="error" error="Fixture queue unavailable." />);
    expect(error).toContain('data-queue-state="error"');
    expect(error).toContain('role="alert"');
    expect(error).toContain("Fixture queue unavailable.");

    const empty = renderToStaticMarkup(
      <ReviewQueuePanel state="ready" queue={queue([])} actorId={ACTOR} now={NOW} />,
    );
    expect(empty).toContain('data-queue-state="empty"');
    expect(empty).toContain("No human reviews are waiting");

    const ready = renderToStaticMarkup(
      <ReviewQueuePanel state="ready" queue={readyQueue()} actorId={ACTOR} now={NOW} />,
    );
    expect(ready).toContain("grid grid-cols-1 gap-2 sm:grid-cols-3");
    expect(ready).toContain("grid gap-4 xl:grid-cols-2");
    expect(ready).toContain('aria-labelledby="review-queue-title"');
    expect(ready).toContain('aria-labelledby="review-queue-items-title"');
  });
});
