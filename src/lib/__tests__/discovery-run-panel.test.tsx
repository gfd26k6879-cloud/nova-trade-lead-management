import { createHash } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DiscoveryRunPanel } from "@/components/discovery/discovery-run-panel";
import {
  appendDiscoveryObservationBatch,
  createDiscoveryRun,
  transitionDiscoveryRun,
  type DiscoveryRun,
} from "@/lib/discovery/discovery-run";
import type { DiscoveryPlan, DiscoveryTask } from "@/lib/discovery/discovery-plan";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const PLAY_CONTENT_HASH = `sha256:${"a".repeat(64)}`;
const PLAY_REVIEW_HASH = `sha256:${"c".repeat(64)}`;
const ACTIVATION_HASH = `sha256:${"d".repeat(64)}`;
const PLAY_VERSION = `lead-play-version:${"b".repeat(64)}`;

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function plan(): DiscoveryPlan {
  const rationaleRefs = Object.freeze([
    Object.freeze({ claimId: "claim:buyers", evidenceId: "evidence:catalog" }),
  ]);
  const uncertaintyIds = Object.freeze(["uncertainty:timing"]);
  const caps = Object.freeze({ maxAccounts: 3, maxProviderRequests: 3, maxSpendCents: 300 });
  const taskPayload = Object.freeze({
    taskVersion: 1 as const,
    playVersionId: PLAY_VERSION,
    sourceKey: "google-places",
    hypothesisId: "hypothesis:change",
    queryFamily: "industrial-change",
    statement: "Find accounts with current formulation-change evidence.",
    rationaleRefs,
    uncertaintyIds,
    caps,
  });
  const taskHash = sha256(taskPayload);
  const task: DiscoveryTask = Object.freeze({
    taskVersion: 1,
    taskId: `discovery-task:${taskHash.slice("sha256:".length)}`,
    sourceKey: taskPayload.sourceKey,
    hypothesisId: taskPayload.hypothesisId,
    queryFamily: taskPayload.queryFamily,
    statement: taskPayload.statement,
    rationaleRefs,
    uncertaintyIds,
    caps,
  });
  const play = Object.freeze({
    stableKey: "lead-play:discovery",
    versionId: PLAY_VERSION,
    contentHash: PLAY_CONTENT_HASH,
    reviewHash: PLAY_REVIEW_HASH,
    revision: 1,
  });
  const payload = Object.freeze({
    planVersion: 1 as const,
    status: "plan_only" as const,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    activationStateHash: ACTIVATION_HASH,
    play,
    limits: caps,
    tasks: Object.freeze([task]),
  });
  const planHash = sha256(payload);
  return Object.freeze({
    ...payload,
    planId: `discovery-plan:${planHash.slice("sha256:".length)}`,
    planHash,
  });
}

function createdRun(): DiscoveryRun {
  const result = createDiscoveryRun({
    version: 1,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    plan: plan(),
    createdAt: "2026-08-30T17:00:00.000Z",
  });
  if (!result.ok) throw new Error(result.code);
  return result.run;
}

function runningRun(): DiscoveryRun {
  const current = createdRun();
  const result = transitionDiscoveryRun({
    version: 1,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    current,
    expectedRunHash: current.runHash,
    action: "start",
    at: "2026-08-30T17:01:00.000Z",
    reason: "Begin caller-controlled bounded collection.",
  });
  if (!result.ok) throw new Error(result.code);
  return result.run;
}

function runWithZeroResultPage(complete = false): DiscoveryRun {
  const current = runningRun();
  const result = appendDiscoveryObservationBatch({
    version: 1,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    current,
    expectedRunHash: current.runHash,
    batch: {
      batchVersion: 1,
      batchId: "batch:empty-page",
      taskId: current.tasks[0]?.taskId,
      cursor: null,
      nextCursor: complete ? null : "page:2",
      complete,
      appendedAt: "2026-08-30T17:02:00.000Z",
      providerRequests: 1,
      spendCents: 25,
      observations: [],
    },
  });
  if (!result.ok) throw new Error(result.code);
  return result.run;
}

describe("DiscoveryRunPanel", () => {
  it("renders the exact approved binding and exposes start only for a pristine planned run", () => {
    const run = createdRun();
    const html = renderToStaticMarkup(
      <DiscoveryRunPanel state="ready" run={run} onStart={vi.fn()} onResume={vi.fn()} />,
    );

    expect(html).toContain('data-surface="discovery-run-panel"');
    expect(html).toContain('data-discovery-state="planned"');
    expect(html).toContain('aria-label="Run status: Ready to start"');
    expect(html).toContain("Exact plan and play binding");
    expect(html).toContain("Approved lead play · revision 1");
    expect(html).toContain("lead-play:discovery");
    expect(html).toContain(PLAY_VERSION);
    expect(html).toContain(PLAY_CONTENT_HASH);
    expect(html).toContain(PLAY_REVIEW_HASH);
    expect(html).toContain(ACTIVATION_HASH);
    expect(html).toContain(run.plan.planId);
    expect(html).toContain(run.plan.planHash);
    expect(html).toContain('aria-label="Accounts used"');
    expect(html).toContain('aria-valuemax="3"');
    expect(html).toContain('data-discovery-action="start"');
    expect(html).toContain("Start bounded discovery");
    expect(html).not.toContain('data-discovery-action="resume"');
    expect(html.match(/<button\b/g)).toHaveLength(1);
  });

  it("shows page progress, cursor, and zero-result accounting with one bounded resume action", () => {
    const run = runWithZeroResultPage();
    const html = renderToStaticMarkup(
      <DiscoveryRunPanel state="ready" run={run} onStart={vi.fn()} onResume={vi.fn()} />,
    );

    expect(html).toContain('data-discovery-state="running"');
    expect(html).toContain('aria-label="Run status: In progress"');
    expect(html).toContain("Resume from saved cursor");
    expect(html).toContain("page:2");
    expect(html).toContain("Page 1 · batch:empty-page");
    expect(html).toContain("0 results · 1 req · $0.25");
    expect(html).toContain("1 zero-result");
    expect(html).toContain('data-discovery-action="resume"');
    expect(html).toContain("Resume next bounded page");
    expect(html).not.toContain('data-discovery-action="start"');
    expect(html.match(/<button\b/g)).toHaveLength(1);

    const capped = {
      ...run,
      totals: { ...run.totals, spendCents: run.plan.limits.maxSpendCents },
      tasks: [{ ...run.tasks[0], spendCents: run.plan.tasks[0]?.caps.maxSpendCents ?? 0 }],
    } as DiscoveryRun;
    const cappedHtml = renderToStaticMarkup(
      <DiscoveryRunPanel state="ready" run={capped} onResume={vi.fn()} />,
    );
    expect(cappedHtml).not.toContain('data-discovery-action="resume"');
  });

  it("shows terminal completion and failure truthfully without retry, start, or resume controls", () => {
    const completedPage = runWithZeroResultPage(true);
    const completedResult = transitionDiscoveryRun({
      version: 1,
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      current: completedPage,
      expectedRunHash: completedPage.runHash,
      action: "complete",
      at: "2026-08-30T17:03:00.000Z",
      reason: "Complete after the provider closed the final page.",
    });
    if (!completedResult.ok) throw new Error(completedResult.code);
    const completed = renderToStaticMarkup(
      <DiscoveryRunPanel state="ready" run={completedResult.run} onStart={vi.fn()} onResume={vi.fn()} />,
    );
    expect(completed).toContain('data-discovery-state="completed"');
    expect(completed).toContain("Closed — provider reported completion");
    expect(completed).not.toMatch(/<button\b/u);

    const current = runningRun();
    const failedResult = transitionDiscoveryRun({
      version: 1,
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      current,
      expectedRunHash: current.runHash,
      action: "fail",
      at: "2026-08-30T17:02:00.000Z",
      reason: "Provider declined the caller-controlled request.",
    });
    if (!failedResult.ok) throw new Error(failedResult.code);
    const failed = renderToStaticMarkup(
      <DiscoveryRunPanel state="ready" run={failedResult.run} onStart={vi.fn()} onResume={vi.fn()} />,
    );
    expect(failed).toContain('data-discovery-state="failed"');
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Discovery failed without an automatic retry");
    expect(failed).toContain("Provider declined the caller-controlled request.");
    expect(failed).not.toMatch(/<button\b/u);
    expect(failed).not.toContain("Retry");
  });

  it("renders accessible loading, error, and empty states without actions", () => {
    const loading = renderToStaticMarkup(<DiscoveryRunPanel state="loading" />);
    expect(loading).toContain('data-discovery-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading discovery run");

    const error = renderToStaticMarkup(<DiscoveryRunPanel state="error" error="Run ledger unavailable." />);
    expect(error).toContain('data-discovery-state="error"');
    expect(error).toContain('role="alert"');
    expect(error).toContain("Run ledger unavailable.");

    const empty = renderToStaticMarkup(<DiscoveryRunPanel state="ready" run={null} />);
    expect(empty).toContain('data-discovery-state="empty"');
    expect(empty).toContain("No discovery run is planned");
    expect(`${loading}${error}${empty}`).not.toMatch(/<button\b/u);
  });
});
