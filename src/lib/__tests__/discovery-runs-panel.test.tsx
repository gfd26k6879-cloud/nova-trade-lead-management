import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DiscoveryRunsPanel, type DiscoveryRunSummary } from "@/components/discovery/discovery-runs-panel";

const TENANT = "10000000-0000-4000-8000-000000000001";
const WORKSPACE = "20000000-0000-4000-8000-000000000001";
const SCOPE = { tenantId: TENANT, workspaceId: WORKSPACE } as const;

function summary(overrides: Partial<DiscoveryRunSummary> = {}): DiscoveryRunSummary {
  return {
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    runId: "discovery-run:portfolio-one",
    status: "running",
    binding: {
      planId: "discovery-plan:approved-one",
      playStableKey: "lead-play:industrial-change",
      playVersionId: "lead-play-version:approved-one",
      sourceKeys: ["google-places", "trade-directory"],
    },
    budget: { usedCents: 725, capCents: 2_000 },
    tasks: { completed: 2, total: 5 },
    lease: { state: "active", expiresAt: "2026-08-30T18:15:00.000Z" },
    recoveryNeeded: false,
    allowedActions: { open: true, recover: false, cancel: true },
    updatedAt: "2026-08-30T18:00:00.000Z",
    ...overrides,
  };
}

describe("DiscoveryRunsPanel", () => {
  it("renders loading, error, and empty states", () => {
    expect(renderToStaticMarkup(<DiscoveryRunsPanel state="loading" />)).toContain('data-discovery-runs-state="loading"');
    expect(renderToStaticMarkup(<DiscoveryRunsPanel state="error" error="Run index is unavailable." />)).toContain("Run index is unavailable.");
    expect(renderToStaticMarkup(<DiscoveryRunsPanel state="ready" scope={SCOPE} runs={[]} />)).toContain('data-discovery-runs-state="empty"');
  });

  it("shows canonical scope, bindings, budget, task progress, and lease state", () => {
    const html = renderToStaticMarkup(<DiscoveryRunsPanel state="ready" scope={SCOPE} runs={[summary()]} onOpen={vi.fn()} onCancel={vi.fn()} />);

    expect(html).toContain('data-surface="discovery-runs-panel"');
    expect(html).toContain('class="grid gap-4 xl:grid-cols-2"');
    expect(html).toContain(TENANT);
    expect(html).toContain(WORKSPACE);
    expect(html).toContain("discovery-plan:approved-one");
    expect(html).toContain("lead-play:industrial-change");
    expect(html).toContain("lead-play-version:approved-one");
    expect(html).toContain("google-places, trade-directory");
    expect(html).toContain("$7.25");
    expect(html).toContain("$20.00");
    expect(html).toContain('aria-label="Budget used"');
    expect(html).toContain('aria-valuenow="725"');
    expect(html).toContain('aria-label="Tasks completed"');
    expect(html).toContain("2/5");
    expect(html).toContain('data-lease-state="active"');
    expect(html).toContain("Active lease");
    expect(html).not.toMatch(/leaseId|leaseToken|leaseOwner|credential/i);
  });

  it("renders only caller-supplied actions that are also valid for current state", () => {
    const running = summary();
    const runningHtml = renderToStaticMarkup(
      <DiscoveryRunsPanel state="ready" scope={SCOPE} runs={[running]} onOpen={vi.fn()} onRecover={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(runningHtml).toContain('data-discovery-runs-action="open"');
    expect(runningHtml).toContain('data-discovery-runs-action="cancel"');
    expect(runningHtml).not.toContain('data-discovery-runs-action="recover"');

    const recovery = summary({
      status: "failed",
      lease: { state: "expired", expiresAt: "2026-08-30T17:55:00.000Z" },
      recoveryNeeded: true,
      allowedActions: { open: true, recover: true, cancel: true },
    });
    const recoveryHtml = renderToStaticMarkup(
      <DiscoveryRunsPanel state="ready" scope={SCOPE} runs={[recovery]} onOpen={vi.fn()} onRecover={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(recoveryHtml).toContain('data-recovery-needed="true"');
    expect(recoveryHtml).toContain("Recovery needed");
    expect(recoveryHtml).toContain('data-discovery-runs-action="recover"');
    expect(recoveryHtml).not.toContain('data-discovery-runs-action="cancel"');

    const noCallbacks = renderToStaticMarkup(<DiscoveryRunsPanel state="ready" scope={SCOPE} runs={[running]} />);
    expect(noCallbacks).not.toContain("<button");
  });

  it("does not offer recovery while a lease is active even when inconsistent input requests it", () => {
    const inconsistent = summary({
      recoveryNeeded: true,
      lease: { state: "active", expiresAt: "2026-08-30T18:15:00.000Z" },
      allowedActions: { open: false, recover: true, cancel: false },
    });
    const html = renderToStaticMarkup(<DiscoveryRunsPanel state="ready" scope={SCOPE} runs={[inconsistent]} onRecover={vi.fn()} />);
    expect(html).toContain('data-recovery-needed="true"');
    expect(html).not.toContain('data-discovery-runs-action="recover"');
    expect(html).not.toContain("<button");
  });

  it("fails closed without enumerating runs from a mismatched scope", () => {
    const html = renderToStaticMarkup(
      <DiscoveryRunsPanel
        state="ready"
        scope={SCOPE}
        runs={[summary({ tenantId: "10000000-0000-4000-8000-000000000099" })]}
        onOpen={vi.fn()}
      />,
    );

    expect(html).toContain("The discovery-run portfolio scope could not be verified.");
    expect(html).not.toContain("discovery-run:portfolio-one");
    expect(html).not.toContain("<button");
  });
});
