import { describe, expect, it, vi } from "vitest";

import {
  evaluateConnectorSourcePolicy,
  type ConnectorSourcePolicyInput,
} from "@/lib/connectors/source-policy-registry";

const TENANT = "00000000-0000-4000-8000-000000000091";
const WORKSPACE = "10000000-0000-4000-8000-000000000091";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function input(overrides: Partial<ConnectorSourcePolicyInput> = {}): ConnectorSourcePolicyInput {
  return {
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    authorizedTenantId: TENANT,
    authorizedWorkspaceId: WORKSPACE,
    sourceCardId: "google_places_legacy",
    connectorVersion: 1,
    connectorAccountId: "account-a",
    sourcePolicyId: "policy-a",
    executionMode: "fixture",
    operation: "search_text",
    fields: ["place_id", "business_name"],
    requestedUnits: 1,
    now: "2026-08-29T12:00:00.000Z",
    registryVersion: {
      sourceCardId: "google_places_legacy",
      version: 1,
      executionMode: "fixture",
      transport: "none",
      operations: ["search_text", "place_details"],
      outputFields: ["place_id", "business_name"],
      adapterSha256: HASH_A,
    },
    account: {
      id: "account-a",
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      sourceCardId: "google_places_legacy",
      connectorVersion: 1,
      status: "fixture_only",
      credentialRefHash: null,
    },
    policy: {
      id: "policy-a",
      tenantId: TENANT,
      workspaceId: WORKSPACE,
      sourceCardId: "google_places_legacy",
      connectorVersion: 1,
      connectorAccountId: "account-a",
      version: 1,
      state: "active",
      executionMode: "fixture",
      termsState: "approved",
      allowedOperations: ["search_text"],
      allowedFields: ["place_id", "business_name"],
      hardCapUnits: 3,
      attestationExpiresAt: null,
      attestationRevoked: false,
      policySha256: HASH_B,
    },
    ...overrides,
  };
}

describe("connector source-policy registry conformance", () => {
  it("allows one exact fixture-only launch source without network or provider work", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = evaluateConnectorSourcePolicy(input());

    expect(result).toEqual({
      decision: "allow",
      code: "D015_PASS",
      sourceCardId: "google_places_legacy",
      connectorVersion: 1,
      connectorAccountId: "account-a",
      sourcePolicyId: "policy-a",
      sourcePolicyVersion: 1,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("accepts an exactly authorized tenant-wide null workspace allowed by durable schema", () => {
    expect(evaluateConnectorSourcePolicy(input({
      workspaceId: null,
      authorizedWorkspaceId: null,
      account: { ...input().account, workspaceId: null },
      policy: { ...input().policy, workspaceId: null },
    }))).toMatchObject({ decision: "allow", code: "D015_PASS" });
  });

  it("allows an attested implementation source only before its exact expiry", () => {
    const base = input({
      sourceCardId: "tenant_upload_document",
      operation: "parse",
      fields: ["text_chunk", "checksum"],
      registryVersion: {
        sourceCardId: "tenant_upload_document", version: 2, executionMode: "fixture", transport: "none",
        operations: ["parse"], outputFields: ["text_chunk", "checksum"], adapterSha256: HASH_A,
      },
      connectorVersion: 2,
      account: {
        id: "account-a", tenantId: TENANT, workspaceId: WORKSPACE,
        sourceCardId: "tenant_upload_document", connectorVersion: 2,
        status: "fixture_only", credentialRefHash: null,
      },
      policy: {
        id: "policy-a", tenantId: TENANT, workspaceId: WORKSPACE,
        sourceCardId: "tenant_upload_document", connectorVersion: 2, connectorAccountId: "account-a",
        version: 4, state: "active", executionMode: "fixture", termsState: "approved",
        allowedOperations: ["parse"], allowedFields: ["text_chunk", "checksum"], hardCapUnits: 3,
        attestationExpiresAt: "2026-08-30T12:00:00.000Z", attestationRevoked: false, policySha256: HASH_B,
      },
    });

    expect(evaluateConnectorSourcePolicy(base)).toMatchObject({ decision: "allow", code: "D015_PASS" });
    expect(evaluateConnectorSourcePolicy({
      ...base,
      now: "2026-08-30T12:00:00.000Z",
    })).toMatchObject({ decision: "block", code: "D015_SOURCE_POLICY_FAIL" });
  });

  it.each([
    ["request tenant", { tenantId: "00000000-0000-4000-8000-000000000092" }],
    ["request workspace", { workspaceId: "10000000-0000-4000-8000-000000000092" }],
    ["account tenant", { account: { ...input().account, tenantId: "00000000-0000-4000-8000-000000000092" } }],
    ["account workspace", { account: { ...input().account, workspaceId: "10000000-0000-4000-8000-000000000092" } }],
    ["policy tenant", { policy: { ...input().policy, tenantId: "00000000-0000-4000-8000-000000000092" } }],
    ["policy workspace", { policy: { ...input().policy, workspaceId: "10000000-0000-4000-8000-000000000092" } }],
  ])("blocks exact-scope mismatch: %s", (_label, overrides) => {
    expect(evaluateConnectorSourcePolicy(input(overrides as Partial<ConnectorSourcePolicyInput>)))
      .toMatchObject({ decision: "block", code: "D015_ISOLATION_FAIL" });
  });

  it("distinguishes unknown and launch-deferred sources without falling through", () => {
    expect(evaluateConnectorSourcePolicy(input({ sourceCardId: "unregistered_source" })))
      .toMatchObject({ decision: "block", code: "D015_PROVIDER_UNKNOWN" });
    expect(evaluateConnectorSourcePolicy(input({ sourceCardId: "directories" })))
      .toMatchObject({ decision: "block", code: "D015_SOURCE_POLICY_FAIL" });
    expect(evaluateConnectorSourcePolicy(input({ sourceCardId: "bypass_scraping" })))
      .toMatchObject({ decision: "block", code: "D015_SOURCE_POLICY_FAIL" });
  });

  it.each([
    ["live request", { executionMode: "live" }],
    ["network registry", { registryVersion: { ...input().registryVersion, transport: "network" } }],
    ["ready account", { account: { ...input().account, status: "ready" } }],
    ["credential reference", { account: { ...input().account, credentialRefHash: HASH_A } }],
    ["draft policy", { policy: { ...input().policy, state: "draft" } }],
    ["pending terms", { policy: { ...input().policy, termsState: "pending" } }],
    ["unknown operation", { operation: "scrape" }],
    ["extra field", { fields: ["place_id", "reviews"] }],
    ["registry version mismatch", { connectorVersion: 2 }],
    ["account reference mismatch", { connectorAccountId: "account-b" }],
    ["policy reference mismatch", { sourcePolicyId: "policy-b" }],
  ])("denies policy/registry divergence: %s", (_label, overrides) => {
    expect(evaluateConnectorSourcePolicy(input(overrides as Partial<ConnectorSourcePolicyInput>)))
      .toMatchObject({ decision: "block", code: "D015_SOURCE_POLICY_FAIL" });
  });

  it("returns a deterministic cost failure without widening any other gate", () => {
    expect(evaluateConnectorSourcePolicy(input({ requestedUnits: 4 })))
      .toMatchObject({ decision: "block", code: "D015_COST_FAIL" });
    expect(evaluateConnectorSourcePolicy(input({ requestedUnits: -1 })))
      .toMatchObject({ decision: "block", code: "D015_MALFORMED" });
  });

  it("fails closed on accessor, proxy, extra-field, and duplicate-array inputs", () => {
    let reads = 0;
    const accessor = {
      ...input(),
      get operation() { reads += 1; throw new Error("must not execute"); },
    };
    expect(evaluateConnectorSourcePolicy(accessor)).toMatchObject({ code: "D015_MALFORMED" });
    expect(reads).toBe(0);
    expect(evaluateConnectorSourcePolicy(new Proxy(input(), {}))).toMatchObject({ code: "D015_MALFORMED" });
    expect(evaluateConnectorSourcePolicy({ ...input(), unexpected: true })).toMatchObject({ code: "D015_MALFORMED" });
    expect(evaluateConnectorSourcePolicy(input({ fields: ["place_id", "place_id"] })))
      .toMatchObject({ code: "D015_MALFORMED" });
    class FieldsSubclass extends Array<string> {}
    expect(evaluateConnectorSourcePolicy(input({ fields: new FieldsSubclass("place_id") })))
      .toMatchObject({ code: "D015_MALFORMED" });
    expect(evaluateConnectorSourcePolicy(input({ now: `${"2".repeat(1_000)}Z` })))
      .toMatchObject({ code: "D015_MALFORMED", sourceCardId: "google_places_legacy" });
    expect(evaluateConnectorSourcePolicy({ ...input(), sourceCardId: "x".repeat(1_000) }))
      .toEqual({
        decision: "block",
        code: "D015_MALFORMED",
        sourceCardId: "unknown",
        connectorVersion: 0,
        connectorAccountId: "unknown",
        sourcePolicyId: "unknown",
        sourcePolicyVersion: 0,
      });
  });
});
