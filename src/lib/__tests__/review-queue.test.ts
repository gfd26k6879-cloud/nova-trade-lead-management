import { describe, expect, it } from "vitest";

import {
  createReviewQueue,
  enqueueReviewQueueItem,
  transitionReviewQueueItem,
  type ReviewQueue,
} from "@/lib/review/review-queue";

const TENANT = "10000000-0000-4000-8000-000000000001";
const FOREIGN = "10000000-0000-4000-8000-000000000002";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const HUMAN_A = "30000000-0000-4000-8000-000000000001";
const HUMAN_B = "30000000-0000-4000-8000-000000000002";
const HASH_A = `sha256:${"a".repeat(64)}`;

function created(): ReviewQueue {
  const result = createReviewQueue({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
    createdAt: "2026-08-30T12:00:00.000Z" });
  if (!result.ok) throw new Error(result.code);
  return result.queue;
}

function item(overrides: Record<string, unknown> = {}) {
  return { itemVersion: 1, kind: "ambiguous_account_resolution", subject: {
    subjectId: "account-candidate:acme", versionId: "account-resolution-version:acme-v1", contentHash: HASH_A,
  }, priority: "high", reason: "Multiple candidate accounts require a human decision.",
  uncertaintyIds: ["uncertainty:domain-match"], ...overrides };
}

function enqueued(): ReviewQueue {
  const current = created();
  const result = enqueueReviewQueueItem({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
    current, expectedQueueHash: current.queueHash, item: item(), at: "2026-08-30T12:01:00.000Z" });
  if (!result.ok) throw new Error(result.code);
  return result.queue;
}

function transitionInput(current: ReviewQueue, overrides: Record<string, unknown> = {}) {
  return { version: 1, tenantId: TENANT, workspaceId: WORKSPACE, current,
    expectedQueueHash: current.queueHash, itemId: current.items[0]?.itemId, action: "claim",
    actor: { kind: "human", actorId: HUMAN_A }, at: "2026-08-30T12:02:00.000Z",
    reason: "Claim this review item for a bounded human review.",
    leaseExpiresAt: "2026-08-30T13:02:00.000Z", resolution: null, ...overrides };
}

describe("tenant review queue", () => {
  it("enqueues exact subject versions idempotently into an immutable deterministic queue", () => {
    const current = created();
    const request = { version: 1, tenantId: TENANT, workspaceId: WORKSPACE, current,
      expectedQueueHash: current.queueHash, item: item(), at: "2026-08-30T12:01:00.000Z" };
    const first = enqueueReviewQueueItem(request);
    expect(first).toMatchObject({ ok: true, code: "REVIEW_ITEM_ENQUEUED", queue: { items: [{
      kind: "ambiguous_account_resolution", status: "queued", priority: "high",
      subject: { versionId: "account-resolution-version:acme-v1", contentHash: HASH_A },
    }] } });
    if (!first.ok) return;
    expect(enqueueReviewQueueItem({ ...request, current: first.queue, expectedQueueHash: first.queue.queueHash }))
      .toEqual({ ok: true, code: "REVIEW_ITEM_REPLAYED", queue: first.queue });
    expect(enqueueReviewQueueItem({ ...request, current: first.queue, expectedQueueHash: first.queue.queueHash,
      at: "2026-08-30T12:02:00.000Z" })).toEqual({ ok: true, code: "REVIEW_ITEM_REPLAYED", queue: first.queue });
    expect(Object.isFrozen(first.queue.items[0]?.subject)).toBe(true);
    expect(Object.isFrozen(first.queue.events)).toBe(true);
  });

  it("supports human claim, expired-lease takeover, release, and resolution", () => {
    const queued = enqueued();
    const claimed = transitionReviewQueueItem(transitionInput(queued));
    expect(claimed).toMatchObject({ ok: true, code: "REVIEW_ITEM_CLAIMED", queue: { items: [{
      status: "claimed", claimedBy: HUMAN_A, leaseExpiresAt: "2026-08-30T13:02:00.000Z",
    }] } });
    if (!claimed.ok) return;
    expect(transitionReviewQueueItem(transitionInput(claimed.queue, { actor: { kind: "human", actorId: HUMAN_B },
      at: "2026-08-30T12:30:00.000Z", leaseExpiresAt: "2026-08-30T13:30:00.000Z" })))
      .toEqual({ ok: false, code: "INVALID_TRANSITION" });
    const takeover = transitionReviewQueueItem(transitionInput(claimed.queue, {
      actor: { kind: "human", actorId: HUMAN_B }, at: "2026-08-30T13:02:00.000Z",
      leaseExpiresAt: "2026-08-30T14:02:00.000Z" }));
    if (!takeover.ok) throw new Error(takeover.code);
    const released = transitionReviewQueueItem(transitionInput(takeover.queue, { action: "release",
      actor: { kind: "human", actorId: HUMAN_B }, at: "2026-08-30T13:03:00.000Z",
      reason: "Release the item back to the shared human queue.", leaseExpiresAt: null }));
    expect(released).toMatchObject({ ok: true, code: "REVIEW_ITEM_RELEASED", queue: {
      items: [{ status: "queued", claimedBy: null, leaseExpiresAt: null }] } });
    if (!released.ok) return;
    const reclaimed = transitionReviewQueueItem(transitionInput(released.queue, { at: "2026-08-30T13:04:00.000Z",
      leaseExpiresAt: "2026-08-30T14:04:00.000Z" }));
    if (!reclaimed.ok) throw new Error(reclaimed.code);
    const resolved = transitionReviewQueueItem(transitionInput(reclaimed.queue, { action: "resolve",
      at: "2026-08-30T13:05:00.000Z", reason: "Resolve ambiguity after reviewing source evidence.",
      leaseExpiresAt: null, resolution: { decision: "confirmed", note: "Matched the canonical account." } }));
    expect(resolved).toMatchObject({ ok: true, code: "REVIEW_ITEM_RESOLVED", queue: { items: [{
      status: "resolved", resolution: { decision: "confirmed", resolvedBy: HUMAN_A },
    }] } });
  });

  it("fails closed on non-enumerating scope, stale hashes, chronology, and lease caps", () => {
    const current = enqueued();
    expect(transitionReviewQueueItem(transitionInput(current, { tenantId: FOREIGN })))
      .toEqual({ ok: false, code: "NOT_FOUND_OR_STALE" });
    expect(transitionReviewQueueItem(transitionInput(current, { itemId: `review-item:${"f".repeat(64)}` })))
      .toEqual({ ok: false, code: "NOT_FOUND_OR_STALE" });
    expect(transitionReviewQueueItem(transitionInput(current, { expectedQueueHash: HASH_A })))
      .toEqual({ ok: false, code: "STALE_QUEUE" });
    expect(transitionReviewQueueItem(transitionInput(current, { at: "2026-08-30T12:00:30.000Z" })))
      .toEqual({ ok: false, code: "INVALID_CHRONOLOGY" });
    expect(transitionReviewQueueItem(transitionInput(current, {
      leaseExpiresAt: "2026-09-01T12:02:00.000Z" }))).toEqual({ ok: false, code: "BOUNDS_EXCEEDED" });
  });

  it("rejects duplicate/ambiguous Unicode and hostile structures without invoking traps", () => {
    const current = created();
    for (const hostileItem of [
      item({ uncertaintyIds: ["uncertainty:one", "uncertainty:one"] }),
      item({ reason: "Ambiguous\u200b review reason." }),
      item({ reason: "Ａmbiguous normalized review reason." }),
      item({ reason: "Malformed \ud800 review reason." }),
    ]) expect(enqueueReviewQueueItem({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current, expectedQueueHash: current.queueHash, item: hostileItem,
      at: "2026-08-30T12:01:00.000Z" })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    let traps = 0;
    const trap = (): never => { traps += 1; throw new Error("must not execute"); };
    const accessor = item();
    Object.defineProperty(accessor.subject, "versionId", { enumerable: true, get: trap });
    const proxied = new Proxy(item(), { getPrototypeOf: trap });
    for (const hostileItem of [accessor, proxied]) expect(enqueueReviewQueueItem({ version: 1,
      tenantId: TENANT, workspaceId: WORKSPACE, current, expectedQueueHash: current.queueHash,
      item: hostileItem, at: "2026-08-30T12:01:00.000Z" })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(traps).toBe(0);
  });
});
