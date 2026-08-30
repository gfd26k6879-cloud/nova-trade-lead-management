import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ConnectorGovernancePanel } from "@/components/admin/connector-governance-panel";
import type { ConnectorSourcePolicyDecision } from "@/lib/connectors/source-policy-registry";
import type { ConnectorSourceRunAuthoritySnapshot } from "@/lib/connectors/source-run-authority";

const TENANT = "00000000-0000-4000-8000-000000000091";
const WORKSPACE = "10000000-0000-4000-8000-000000000091";
const NOW = "2026-08-29T12:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function authority(overrides: Partial<ConnectorSourceRunAuthoritySnapshot> = {}): ConnectorSourceRunAuthoritySnapshot {
  return {
    registryVersion: {
      sourceCardId: "google_places_legacy", version: 1, executionMode: "fixture", transport: "none",
      operations: ["search_text"], outputFields: ["place_id", "business_name"], adapterSha256: HASH_A,
    },
    account: {
      id: "account-a", tenantId: TENANT, workspaceId: WORKSPACE, sourceCardId: "google_places_legacy",
      connectorVersion: 1, status: "fixture_only", credentialRefHash: null,
    },
    policy: {
      id: "policy-a", tenantId: TENANT, workspaceId: WORKSPACE, sourceCardId: "google_places_legacy",
      connectorVersion: 1, connectorAccountId: "account-a", policyKey: "fixture-policy", version: 1,
      state: "active", executionMode: "fixture", termsState: "approved", allowedOperations: ["search_text"],
      allowedFields: ["place_id", "business_name"], hardCapUnits: 5, attestationExpiresAt: null,
      attestationRevoked: false, policySha256: HASH_B,
    },
    activation: {
      id: "activation-a", tenantId: TENANT, workspaceId: WORKSPACE, policyKey: "fixture-policy",
      policyVersion: 1, sourcePolicyId: "policy-a", activatedAt: "2026-08-29T11:00:00.000Z", revokedAt: null,
    },
    run: {
      id: "run-a", tenantId: TENANT, workspaceId: WORKSPACE, sourceCardId: "google_places_legacy",
      connectorVersion: 1, connectorAccountId: "account-a", sourcePolicyId: "policy-a", inputHash: HASH_C,
      operation: "search_text", status: "running", hardCapUnits: 5, maxAttempts: 3, cancelRequestedAt: null,
    },
    unit: {
      id: "unit-a", tenantId: TENANT, workspaceId: WORKSPACE, runId: "run-a", checkpointKey: "run-a:unit-a:page-1",
      inputHash: HASH_C, cursor: null, status: "running", attemptCount: 1, maxAttempts: 3, reservedUnits: 1,
      leaseGeneration: 1, leaseTokenHash: HASH_A, leaseWorkerHash: HASH_B, leaseExpiresAt: "2026-08-29T12:05:00.000Z",
    },
    ...overrides,
  };
}

function decision(overrides: Partial<ConnectorSourcePolicyDecision> = {}): ConnectorSourcePolicyDecision {
  return {
    decision: "allow", code: "D015_PASS", sourceCardId: "google_places_legacy", connectorVersion: 1,
    connectorAccountId: "account-a", sourcePolicyId: "policy-a", sourcePolicyVersion: 1, ...overrides,
  };
}

const AUDIT = { state: "recorded", eventId: "audit-event-a", recordedAt: "2026-08-29T11:30:00.000Z", actorId: "admin-a" } as const;

describe("connector governance panel", () => {
  it("shows an accessible exact-scope, fixture-only approval with bounded run authority", () => {
    const html = renderToStaticMarkup(
      <ConnectorGovernancePanel state="ready" authority={authority()} decision={decision()} audit={AUDIT} asOf={NOW} />,
    );

    expect(html).toContain('aria-labelledby="connector-governance-title"');
    expect(html).toContain('data-state="launch-allowed"');
    expect(html).toContain('data-policy-decision="allow"');
    expect(html).toContain("Approved for this exact fixture run");
    expect(html).toContain("Exact authority references align");
    expect(html).toContain("Fixture only · no network");
    expect(html).toContain("Policy hard cap");
    expect(html).toContain("Current reservation");
    expect(html).toContain('data-run-authority="current"');
    expect(html).toContain('dateTime="2026-08-29T12:00:00.000Z"');
    expect(html).not.toMatch(/credentialRefHash|leaseTokenHash|leaseWorkerHash/);
  });

  it("fails closed when a claimed allow decision does not match current authority", () => {
    const mismatched = authority({
      activation: { ...authority().activation, sourcePolicyId: "policy-b" },
    });
    const html = renderToStaticMarkup(
      <ConnectorGovernancePanel state="ready" authority={mismatched} decision={decision()} audit={AUDIT} asOf={NOW} />,
    );

    expect(html).toContain('data-state="launch-denied"');
    expect(html).toContain('data-policy-decision="block"');
    expect(html).toContain("Blocked — no launch authority");
    expect(html).toContain("Authority scope or references do not align");
  });

  it("renders only human controls permitted by the current canonical state", () => {
    const disable = vi.fn();
    const allowed = renderToStaticMarkup(
      <ConnectorGovernancePanel state="ready" authority={authority()} decision={decision()} audit={AUDIT} asOf={NOW} onEnable={vi.fn()} onDisable={disable} onReview={vi.fn()} />,
    );
    expect(allowed).toContain("Disable connector account");
    expect(allowed).not.toContain("Enable fixture account");
    expect(allowed).not.toContain("Review policy");

    const disabledAuthority = authority({ account: { ...authority().account, status: "disabled" } });
    const disabled = renderToStaticMarkup(
      <ConnectorGovernancePanel state="ready" authority={disabledAuthority} decision={decision({ decision: "block", code: "D015_SOURCE_POLICY_FAIL" })} audit={AUDIT} asOf={NOW} onEnable={vi.fn()} onDisable={vi.fn()} onReview={vi.fn()} />,
    );
    expect(disabled).toContain("Enable fixture account");
    expect(disabled).toContain("Review policy");
    expect(disabled).not.toContain("Disable connector account");

    const noAudit = renderToStaticMarkup(
      <ConnectorGovernancePanel state="ready" authority={disabledAuthority} decision={decision({ decision: "block", code: "D015_SOURCE_POLICY_FAIL" })} audit={{ state: "missing" }} asOf={NOW} onEnable={vi.fn()} onDisable={vi.fn()} onReview={vi.fn()} />,
    );
    expect(noAudit).not.toContain("Enable fixture account");
    expect(noAudit).not.toContain("Review policy");
    expect(noAudit).not.toContain("Disable connector account");
  });

  it("uses responsive, break-safe cards and native full-width mobile buttons", () => {
    const html = renderToStaticMarkup(
      <ConnectorGovernancePanel state="ready" authority={authority()} decision={decision()} audit={AUDIT} asOf={NOW} onDisable={vi.fn()} />,
    );
    expect(html).toContain("grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,.65fr)]");
    expect(html).toContain("grid gap-3 sm:grid-cols-2 lg:grid-cols-3");
    expect(html).toMatch(/class="[^"]*break-all[^"]*"[^>]*>10000000-/);
    expect(html).toContain('type="button"');
    expect(html).toContain("min-h-11 w-full");
    expect(html).toContain('aria-describedby="connector-actions-help"');
  });

  it("renders explicit loading, error, and empty states", () => {
    const loading = renderToStaticMarkup(<ConnectorGovernancePanel state="loading" />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Loading connector authority");

    const error = renderToStaticMarkup(<ConnectorGovernancePanel state="error" error="Authority fixture unavailable." />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Authority fixture unavailable.");

    const empty = renderToStaticMarkup(<ConnectorGovernancePanel state="empty" />);
    expect(empty).toContain('data-connector-state="empty"');
    expect(empty).toContain("No connector authority selected");
  });
});
