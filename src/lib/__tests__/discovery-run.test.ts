import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  appendDiscoveryObservationBatch,
  createDiscoveryRun,
  transitionDiscoveryRun,
  type DiscoveryRun,
} from "@/lib/discovery/discovery-run";
import type { DiscoveryPlan, DiscoveryTask } from "@/lib/discovery/discovery-plan";

const TENANT = "10000000-0000-4000-8000-000000000001";
const FOREIGN = "10000000-0000-4000-8000-000000000002";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const HASH_A = `sha256:${"a".repeat(64)}`;
const VERSION = `lead-play-version:${"b".repeat(64)}`;

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function plan(): DiscoveryPlan {
  const rationaleRefs = Object.freeze([Object.freeze({ claimId: "claim:buyers", evidenceId: "evidence:catalog" })]);
  const uncertaintyIds = Object.freeze(["uncertainty:timing"]);
  const caps = Object.freeze({ maxAccounts: 2, maxProviderRequests: 2, maxSpendCents: 100 });
  const taskPayload = Object.freeze({ taskVersion: 1 as const, playVersionId: VERSION,
    sourceKey: "google-places", hypothesisId: "hypothesis:change", queryFamily: "industrial-change",
    statement: "Find accounts with current formulation-change evidence.", rationaleRefs, uncertaintyIds, caps });
  const taskHash = sha256(taskPayload);
  const task: DiscoveryTask = Object.freeze({ taskVersion: 1,
    taskId: `discovery-task:${taskHash.slice("sha256:".length)}`, sourceKey: taskPayload.sourceKey,
    hypothesisId: taskPayload.hypothesisId, queryFamily: taskPayload.queryFamily,
    statement: taskPayload.statement, rationaleRefs, uncertaintyIds, caps });
  const limits = Object.freeze({ maxAccounts: 2, maxProviderRequests: 2, maxSpendCents: 100 });
  const play = Object.freeze({ stableKey: "lead-play:discovery", versionId: VERSION,
    contentHash: HASH_A, reviewHash: `sha256:${"c".repeat(64)}`, revision: 1 });
  const payload = Object.freeze({ planVersion: 1 as const, status: "plan_only" as const,
    tenantId: TENANT, workspaceId: WORKSPACE, activationStateHash: `sha256:${"d".repeat(64)}`,
    play, limits, tasks: Object.freeze([task]) });
  const planHash = sha256(payload);
  return Object.freeze({ ...payload, planId: `discovery-plan:${planHash.slice("sha256:".length)}`, planHash });
}

function created(): DiscoveryRun {
  const result = createDiscoveryRun({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
    plan: plan(), createdAt: "2026-08-30T17:00:00.000Z" });
  if (!result.ok) throw new Error(result.code);
  return result.run;
}

function running(): DiscoveryRun {
  const current = created();
  const result = transitionDiscoveryRun({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
    current, expectedRunHash: current.runHash, action: "start", at: "2026-08-30T17:01:00.000Z",
    reason: "Begin caller-controlled connector collection." });
  if (!result.ok) throw new Error(result.code);
  return result.run;
}

function batch(overrides: Record<string, unknown> = {}) {
  return { batchVersion: 1, batchId: "batch:page-1", taskId: plan().tasks[0]?.taskId,
    cursor: null, nextCursor: "page:2", complete: false, appendedAt: "2026-08-30T17:02:00.000Z",
    providerRequests: 1, spendCents: 40, observations: [{ observationVersion: 1,
      observationId: "observation:account-a", accountRef: "account:a", sourceKey: "google-places",
      observedAt: "2026-08-30T17:01:30.000Z", fields: { name: "Acme", score: 0.8 } }], ...overrides };
}

describe("bounded discovery run lifecycle", () => {
  it("preserves immutable observations and completes through deterministic checkpoints", () => {
    const initial = created();
    expect(initial).toMatchObject({ status: "planned", totals: { accounts: 0, providerRequests: 0, spendCents: 0 } });
    const active = running();
    const first = appendDiscoveryObservationBatch({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: active, expectedRunHash: active.runHash, batch: batch() });
    expect(first).toMatchObject({ ok: true, code: "DISCOVERY_BATCH_APPENDED", run: {
      status: "running", totals: { accounts: 1, providerRequests: 1, spendCents: 40 },
      tasks: [{ cursor: "page:2", complete: false, observations: [{ observationId: "observation:account-a" }] }],
    } });
    if (!first.ok) return;
    const secondBatch = batch({ batchId: "batch:page-2", cursor: "page:2", nextCursor: null, complete: true,
      appendedAt: "2026-08-30T17:03:00.000Z", spendCents: 60,
      observations: [{ observationVersion: 1, observationId: "observation:account-b", accountRef: "account:b",
        sourceKey: "google-places", observedAt: "2026-08-30T17:02:30.000Z", fields: { name: "Beta" } }] });
    const second = appendDiscoveryObservationBatch({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: first.run, expectedRunHash: first.run.runHash, batch: secondBatch });
    if (!second.ok) throw new Error(second.code);
    const completed = transitionDiscoveryRun({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: second.run, expectedRunHash: second.run.runHash, action: "complete",
      at: "2026-08-30T17:04:00.000Z", reason: "All planned discovery tasks reached completion." });
    expect(completed).toMatchObject({ ok: true, code: "DISCOVERY_RUN_COMPLETED", run: {
      status: "completed", totals: { accounts: 2, providerRequests: 2, spendCents: 100 } } });
    if (!completed.ok) return;
    expect(Object.isFrozen(completed.run.tasks[0]?.observations[0]?.fields)).toBe(true);
    expect(() => (completed.run.tasks[0]!.observations[0]!.fields as Record<string, unknown>).name = "changed").toThrow();
    expect(completed.run).not.toHaveProperty("providerAuthority");
  });

  it("replays an identical batch but rejects stale hashes, duplicate observations, cursors, and chronology", () => {
    const active = running();
    const input = { version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: active, expectedRunHash: active.runHash, batch: batch() };
    const first = appendDiscoveryObservationBatch(input);
    if (!first.ok) throw new Error(first.code);
    expect(appendDiscoveryObservationBatch({ ...input, current: first.run, expectedRunHash: first.run.runHash }))
      .toEqual({ ok: true, code: "DISCOVERY_BATCH_REPLAYED", run: first.run });
    expect(appendDiscoveryObservationBatch({ ...input, current: first.run }))
      .toEqual({ ok: false, code: "STALE_RUN" });
    expect(appendDiscoveryObservationBatch({ ...input, current: first.run, expectedRunHash: first.run.runHash,
      batch: batch({ batchId: "batch:other", cursor: "page:2", nextCursor: "page:3",
        appendedAt: "2026-08-30T17:03:00.000Z" }) }))
      .toEqual({ ok: false, code: "DUPLICATE_OBSERVATION" });
    expect(appendDiscoveryObservationBatch({ ...input,
      batch: batch({ cursor: "wrong" }) })).toEqual({ ok: false, code: "CHECKPOINT_MISMATCH" });
    expect(appendDiscoveryObservationBatch({ ...input,
      batch: batch({ appendedAt: "2026-08-30T17:00:30.000Z" }) })).toEqual({ ok: false, code: "INVALID_CHRONOLOGY" });
  });

  it("enforces task and plan caps before append and requires all tasks before completion", () => {
    const active = running();
    const oversized = batch({ providerRequests: 3 });
    expect(appendDiscoveryObservationBatch({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: active, expectedRunHash: active.runHash, batch: oversized }))
      .toEqual({ ok: false, code: "BOUNDS_EXCEEDED" });
    expect(active.totals).toEqual({ accounts: 0, providerRequests: 0, spendCents: 0 });
    expect(transitionDiscoveryRun({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: active, expectedRunHash: active.runHash, action: "complete", at: "2026-08-30T17:02:00.000Z",
      reason: "Attempt completion before task checkpoint." })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  it("records request and spend accounting when a completed page has zero results", () => {
    const active = running();
    const empty = appendDiscoveryObservationBatch({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: active, expectedRunHash: active.runHash, batch: batch({ batchId: "batch:empty", nextCursor: null,
        complete: true, providerRequests: 1, spendCents: 25, observations: [] }) });
    expect(empty).toMatchObject({ ok: true, code: "DISCOVERY_BATCH_APPENDED", run: {
      status: "running", totals: { accounts: 0, providerRequests: 1, spendCents: 25 },
      tasks: [{ cursor: null, complete: true, accounts: 0, observations: [],
        batches: [{ batchId: "batch:empty", observationIds: [] }] }],
    } });
    if (!empty.ok) return;
    expect(appendDiscoveryObservationBatch({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: empty.run, expectedRunHash: empty.run.runHash, batch: batch({ batchId: "batch:empty",
        nextCursor: null, complete: true, providerRequests: 1, spendCents: 25, observations: [] }) }))
      .toEqual({ ok: true, code: "DISCOVERY_BATCH_REPLAYED", run: empty.run });
    expect(transitionDiscoveryRun({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: empty.run, expectedRunHash: empty.run.runHash, action: "complete", at: "2026-08-30T17:03:00.000Z",
      reason: "Complete discovery after a valid zero-result page." })).toMatchObject({
      ok: true, code: "DISCOVERY_RUN_COMPLETED", run: { totals: { accounts: 0, providerRequests: 1, spendCents: 25 } },
    });
  });

  it("rejects foreign, forged, accessor, and proxy inputs without invoking hostile code", () => {
    const current = running();
    expect(appendDiscoveryObservationBatch({ version: 1, tenantId: FOREIGN, workspaceId: WORKSPACE,
      current, expectedRunHash: current.runHash, batch: batch() })).toEqual({ ok: false, code: "SCOPE_MISMATCH" });
    expect(appendDiscoveryObservationBatch({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current: { ...current, runHash: HASH_A }, expectedRunHash: HASH_A, batch: batch() }))
      .toEqual({ ok: false, code: "MALFORMED_INPUT" });
    let traps = 0;
    const trap = (): never => { traps += 1; throw new Error("must not execute"); };
    const hostileBatch = batch();
    Object.defineProperty(hostileBatch, "spendCents", { enumerable: true, get: trap });
    const proxiedPlan = new Proxy(plan(), { getPrototypeOf: trap });
    expect(appendDiscoveryObservationBatch({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      current, expectedRunHash: current.runHash, batch: hostileBatch })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(createDiscoveryRun({ version: 1, tenantId: TENANT, workspaceId: WORKSPACE,
      plan: proxiedPlan, createdAt: "2026-08-30T17:00:00.000Z" })).toEqual({ ok: false, code: "MALFORMED_INPUT" });
    expect(traps).toBe(0);
  });
});
