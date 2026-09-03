import { createHash } from "node:crypto";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DiscoveryPlanPanel } from "@/components/discovery/discovery-plan-panel";
import type { DiscoveryPlan, DiscoveryTask } from "@/lib/discovery/discovery-plan";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const PLAY_CONTENT_HASH = `sha256:${"a".repeat(64)}`;
const PLAY_REVIEW_HASH = `sha256:${"c".repeat(64)}`;
const ACTIVATION_HASH = `sha256:${"d".repeat(64)}`;
const PLAY_VERSION = `lead-play-version:${"a".repeat(64)}`;

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

function task(
  hypothesisId: string,
  statement: string,
  caps: Readonly<{ maxAccounts: number; maxProviderRequests: number; maxSpendCents: number }>,
): DiscoveryTask {
  const rationaleRefs = Object.freeze([
    Object.freeze({ claimId: "claim:buyers", evidenceId: "evidence:catalog" }),
  ]);
  const uncertaintyIds = Object.freeze(["uncertainty:timing"]);
  const payload = Object.freeze({
    taskVersion: 1 as const,
    playVersionId: PLAY_VERSION,
    sourceKey: "google-places",
    hypothesisId,
    queryFamily: "industrial-change",
    statement,
    rationaleRefs,
    uncertaintyIds,
    caps,
  });
  const taskHash = sha256(payload);
  return Object.freeze({
    taskVersion: 1,
    taskId: `discovery-task:${taskHash.slice("sha256:".length)}`,
    sourceKey: payload.sourceKey,
    hypothesisId: payload.hypothesisId,
    queryFamily: payload.queryFamily,
    statement: payload.statement,
    rationaleRefs,
    uncertaintyIds,
    caps,
  });
}

function plan(): DiscoveryPlan {
  const limits = Object.freeze({ maxAccounts: 5, maxProviderRequests: 7, maxSpendCents: 501 });
  const tasks = Object.freeze([
    task("hypothesis:change", "Find accounts with current formulation-change evidence.",
      Object.freeze({ maxAccounts: 3, maxProviderRequests: 4, maxSpendCents: 251 })),
    task("hypothesis:expansion", "Find accounts with a recent industrial expansion signal.",
      Object.freeze({ maxAccounts: 2, maxProviderRequests: 3, maxSpendCents: 250 })),
  ]);
  const play = Object.freeze({
    stableKey: "lead-play:discovery",
    versionId: PLAY_VERSION,
    contentHash: PLAY_CONTENT_HASH,
    reviewHash: PLAY_REVIEW_HASH,
    revision: 2,
  });
  const payload = Object.freeze({
    planVersion: 1 as const,
    status: "plan_only" as const,
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    activationStateHash: ACTIVATION_HASH,
    play,
    limits,
    tasks,
  });
  const planHash = sha256(payload);
  return Object.freeze({
    ...payload,
    planId: `discovery-plan:${planHash.slice("sha256:".length)}`,
    planHash,
  });
}

describe("DiscoveryPlanPanel", () => {
  it("renders the exact approved activation binding, rationale, uncertainty, sources, and aggregate caps", () => {
    const value = plan();
    const html = renderToStaticMarkup(
      <DiscoveryPlanPanel state="ready" plan={value} onCreateRun={vi.fn()} />,
    );

    expect(html).toContain('data-surface="discovery-plan-panel"');
    expect(html).toContain('data-discovery-plan-state="plan_only"');
    expect(html).toContain('aria-label="Plan status: Ready for run creation"');
    expect(html).toContain("Exact active play and activation binding");
    expect(html).toContain("Approved lead play · revision 2");
    expect(html).toContain("lead-play:discovery");
    expect(html).toContain(PLAY_VERSION);
    expect(html).toContain(PLAY_CONTENT_HASH);
    expect(html).toContain(PLAY_REVIEW_HASH);
    expect(html).toContain(ACTIVATION_HASH);
    expect(html).toContain(value.planId);
    expect(html).toContain(value.planHash);
    expect(html).toContain("google-places · industrial-change");
    expect(html).toContain("hypothesis:change");
    expect(html).toContain("claim:buyers → evidence:catalog");
    expect(html).toContain("? uncertainty:timing");
    expect(html).toContain("Overall accounts");
    expect(html).toContain("Overall provider requests");
    expect(html).toContain("$5.01");
    expect(html).toContain("$2.51");
    expect(html).toContain("$2.50");
    expect(html.match(/<article\b/g)).toHaveLength(2);
  });

  it("offers only the caller-controlled create-run handoff for a consistent canonical plan", () => {
    const value = plan();
    const withCallback = renderToStaticMarkup(
      <DiscoveryPlanPanel state="ready" plan={value} onCreateRun={vi.fn()} />,
    );
    expect(withCallback).toContain('data-discovery-plan-action="create-run"');
    expect(withCallback).toContain("Create bounded run");
    expect(withCallback).toContain("does not contact a provider or start collection");
    expect(withCallback.match(/<button\b/g)).toHaveLength(1);
    expect(withCallback).not.toContain("Send outreach");
    expect(withCallback).not.toContain("Retry");

    const withoutCallback = renderToStaticMarkup(<DiscoveryPlanPanel state="ready" plan={value} />);
    expect(withoutCallback).not.toMatch(/<button\b/u);
  });

  it("fails closed when task identities or aggregate caps are internally inconsistent", () => {
    const value = plan();
    const duplicateTask = { ...value.tasks[1], taskId: value.tasks[0]?.taskId } as DiscoveryTask;
    const duplicate = { ...value, tasks: [value.tasks[0], duplicateTask] } as DiscoveryPlan;
    const duplicateHtml = renderToStaticMarkup(
      <DiscoveryPlanPanel state="ready" plan={duplicate} onCreateRun={vi.fn()} />,
    );
    expect(duplicateHtml).toContain('data-discovery-plan-state="invalid"');
    expect(duplicateHtml).toContain('aria-label="Plan status: Inconsistent and blocked"');
    expect(duplicateHtml).toContain('role="alert"');
    expect(duplicateHtml).toContain("Run creation is blocked");
    expect(duplicateHtml).not.toMatch(/<button\b/u);

    const wrongCaps = {
      ...value,
      limits: { ...value.limits, maxAccounts: value.limits.maxAccounts + 1 },
    } as DiscoveryPlan;
    const capHtml = renderToStaticMarkup(
      <DiscoveryPlanPanel state="ready" plan={wrongCaps} onCreateRun={vi.fn()} />,
    );
    expect(capHtml).toContain('data-discovery-plan-state="invalid"');
    expect(capHtml).not.toMatch(/<button\b/u);

    const foreignShape = { ...value, tenantId: "not-a-tenant" } as DiscoveryPlan;
    const foreignHtml = renderToStaticMarkup(
      <DiscoveryPlanPanel state="ready" plan={foreignShape} onCreateRun={vi.fn()} />,
    );
    expect(foreignHtml).toContain('data-discovery-plan-state="invalid"');
    expect(foreignHtml).not.toMatch(/<button\b/u);
  });

  it("renders accessible loading, error, and empty states without actions", () => {
    const loading = renderToStaticMarkup(<DiscoveryPlanPanel state="loading" />);
    expect(loading).toContain('data-discovery-plan-state="loading"');
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading discovery plan");

    const error = renderToStaticMarkup(<DiscoveryPlanPanel state="error" error="Plan ledger unavailable." />);
    expect(error).toContain('data-discovery-plan-state="error"');
    expect(error).toContain('role="alert"');
    expect(error).toContain("Plan ledger unavailable.");

    const empty = renderToStaticMarkup(<DiscoveryPlanPanel state="ready" plan={null} />);
    expect(empty).toContain('data-discovery-plan-state="empty"');
    expect(empty).toContain("No discovery plan is ready");
    expect(`${loading}${error}${empty}`).not.toMatch(/<button\b/u);
  });
});
