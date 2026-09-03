import { describe, expect, it } from "vitest";

import {
  createAuthorizedFixtureConnectorRunner,
  type ConnectorSourceRunAuthoritySnapshot,
} from "@/lib/connectors/source-run-authority";

const TENANT_ID = "00000000-0000-4000-8000-000000000091";
const WORKSPACE_ID = "10000000-0000-4000-8000-000000000091";
const NOW = "2026-08-29T12:00:00.000Z";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);

function authority(
  overrides: Partial<ConnectorSourceRunAuthoritySnapshot> = {},
): ConnectorSourceRunAuthoritySnapshot {
  return {
    registryVersion: {
      sourceCardId: "google_places_legacy",
      version: 1,
      executionMode: "fixture",
      transport: "none",
      operations: ["search_text"],
      outputFields: ["place_id", "business_name"],
      adapterSha256: HASH_A,
    },
    account: {
      id: "account-a",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      sourceCardId: "google_places_legacy",
      connectorVersion: 1,
      status: "fixture_only",
      credentialRefHash: null,
    },
    policy: {
      id: "policy-a",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      sourceCardId: "google_places_legacy",
      connectorVersion: 1,
      connectorAccountId: "account-a",
      policyKey: "fixture-policy",
      version: 1,
      state: "active",
      executionMode: "fixture",
      termsState: "approved",
      allowedOperations: ["search_text"],
      allowedFields: ["place_id", "business_name"],
      hardCapUnits: 5,
      attestationExpiresAt: null,
      attestationRevoked: false,
      policySha256: HASH_B,
    },
    activation: {
      id: "activation-a",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      policyKey: "fixture-policy",
      policyVersion: 1,
      sourcePolicyId: "policy-a",
      activatedAt: "2026-08-29T11:00:00.000Z",
      revokedAt: null,
    },
    run: {
      id: "run-a",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      sourceCardId: "google_places_legacy",
      connectorVersion: 1,
      connectorAccountId: "account-a",
      sourcePolicyId: "policy-a",
      inputHash: HASH_C,
      operation: "search_text",
      status: "running",
      hardCapUnits: 5,
      maxAttempts: 3,
      cancelRequestedAt: null,
    },
    unit: {
      id: "unit-a",
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      runId: "run-a",
      checkpointKey: "run-a:unit-a:page-1",
      inputHash: HASH_C,
      cursor: null,
      status: "running",
      attemptCount: 1,
      maxAttempts: 3,
      reservedUnits: 1,
      leaseGeneration: 1,
      leaseTokenHash: HASH_A,
      leaseWorkerHash: HASH_B,
      leaseExpiresAt: "2026-08-29T12:05:00.000Z",
    },
    ...overrides,
  };
}

function invocation(execute = async () => ({
  observation: {
    sourceCardId: "google_places_legacy",
    operation: "search_text",
    tenantId: TENANT_ID,
    runId: "run-a",
    observedAt: "2026-08-29T12:00:01.000Z",
    fields: { place_id: "places/example", business_name: "Example Industrial" },
  },
  nextCursor: "page-2",
  complete: false,
  actualUnits: 1,
})) {
  return {
    authorizedTenantId: TENANT_ID,
    authorizedWorkspaceId: WORKSPACE_ID,
    runId: "run-a",
    unitId: "unit-a",
    fields: ["place_id", "business_name"],
    execute,
  };
}

function service(snapshot: unknown = authority()) {
  return createAuthorizedFixtureConnectorRunner({
    clock: () => new Date(NOW),
    loadAuthority: async () => snapshot,
  });
}

describe("fixture connector durable-authority bridge", () => {
  it("derives a fixture request only from the loaded current run authority", async () => {
    let loadedSelector: unknown;
    const bridge = createAuthorizedFixtureConnectorRunner({
      clock: () => new Date(NOW),
      loadAuthority: async (selector) => {
        loadedSelector = selector;
        return authority();
      },
    });

    const result = await bridge.runPage(invocation());

    expect(result).toMatchObject({
      status: "page_complete",
      code: "D015_PASS",
      checkpoint: {
        runId: "run-a",
        unitId: "unit-a",
        checkpointKey: "run-a:unit-a:page-1",
        inputHash: HASH_C,
        maxAttempts: 3,
        hardCapUnits: 5,
        reservedUnits: 1,
      },
    });
    expect(loadedSelector).toEqual({
      authorizedTenantId: TENANT_ID,
      authorizedWorkspaceId: WORKSPACE_ID,
      runId: "run-a",
      unitId: "unit-a",
    });
    expect(Object.isFrozen(loadedSelector)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/policy-a|activation-a|leaseTokenHash|credential/i);
  });

  it("replays the same authorized checkpoint without executing or charging twice", async () => {
    let loads = 0;
    let executions = 0;
    const bridge = createAuthorizedFixtureConnectorRunner({
      clock: () => new Date(NOW),
      loadAuthority: async () => {
        loads += 1;
        return authority();
      },
    });
    const input = invocation(async () => {
      executions += 1;
      return invocation().execute();
    });

    expect(await bridge.runPage(input)).toMatchObject({ status: "page_complete", code: "D015_PASS" });
    expect(await bridge.runPage(input)).toMatchObject({ status: "replay", code: "D015_REPLAY_SAME_INPUT" });
    expect({ loads, executions }).toEqual({ loads: 2, executions: 1 });
  });

  it("rechecks current policy on replay and conflicts changed durable page identity", async () => {
    let current = authority();
    let executions = 0;
    const bridge = createAuthorizedFixtureConnectorRunner({
      clock: () => new Date(NOW),
      loadAuthority: async () => current,
    });
    const input = invocation(async () => {
      executions += 1;
      return invocation().execute();
    });

    expect(await bridge.runPage(input)).toMatchObject({ status: "page_complete" });
    current = authority({ activation: { ...authority().activation, revokedAt: NOW } });
    expect(await bridge.runPage(input)).toEqual({ status: "blocked", code: "D015_SOURCE_POLICY_FAIL" });
    current = authority({ unit: { ...authority().unit, inputHash: HASH_A } });
    expect(await bridge.runPage(input)).toEqual({ status: "blocked", code: "D015_CONFLICT" });
    expect(executions).toBe(1);
  });

  it.each([
    ["revoked current activation", () => authority({ activation: { ...authority().activation, revokedAt: NOW } })],
    ["wrong current policy", () => authority({ activation: { ...authority().activation, sourcePolicyId: "policy-b" } })],
    ["wrong current version", () => authority({ activation: { ...authority().activation, policyVersion: 2 } })],
    ["future activation", () => authority({ activation: { ...authority().activation, activatedAt: "2026-08-29T12:00:01.000Z" } })],
    ["policy account drift", () => authority({ policy: { ...authority().policy, connectorAccountId: "account-b" } })],
    ["live registry", () => authority({ registryVersion: { ...authority().registryVersion, executionMode: "live", transport: "network" } })],
    ["credential-bearing account", () => authority({ account: { ...authority().account, status: "ready", credentialRefHash: HASH_C } })],
    ["run policy drift", () => authority({ run: { ...authority().run, sourcePolicyId: "policy-b" } })],
    ["unit run drift", () => authority({ unit: { ...authority().unit, runId: "run-b" } })],
    ["unit selector drift", () => authority({ unit: { ...authority().unit, id: "unit-b" } })],
    ["unit input identity drift", () => authority({ unit: { ...authority().unit, inputHash: HASH_D } })],
    ["unit attempt policy drift", () => authority({ unit: { ...authority().unit, maxAttempts: 2 } })],
    ["expired lease", () => authority({ unit: { ...authority().unit, leaseExpiresAt: NOW } })],
    ["missing lease generation", () => authority({ unit: { ...authority().unit, leaseGeneration: 0 } })],
    ["lease attempt drift", () => authority({ unit: { ...authority().unit, leaseGeneration: 2 } })],
    ["non-running unit", () => authority({ unit: { ...authority().unit, status: "retry_wait", leaseTokenHash: null, leaseWorkerHash: null, leaseExpiresAt: null } })],
    ["unit over run cap", () => authority({ unit: { ...authority().unit, reservedUnits: 6 } })],
  ])("blocks %s before fixture execution", async (_name, snapshot) => {
    let executions = 0;
    const result = await service(snapshot()).runPage(invocation(async () => {
      executions += 1;
      return invocation().execute();
    }));

    expect(result.status).toBe("blocked");
    expect(executions).toBe(0);
  });

  it("preserves explicit paused and cancelled durable run states", async () => {
    let executions = 0;
    const execute = async () => {
      executions += 1;
      return invocation().execute();
    };

    expect(await service(authority({ run: { ...authority().run, status: "paused" } }))
      .runPage(invocation(execute))).toEqual({ status: "paused", code: "D015_PAUSED" });
    expect(await service(authority({ run: { ...authority().run, cancelRequestedAt: NOW } }))
      .runPage(invocation(execute))).toEqual({ status: "cancelled", code: "D015_CANCELLED" });
    expect(await service(authority({ run: { ...authority().run, status: "cancelled", cancelRequestedAt: NOW } }))
      .runPage(invocation(execute))).toEqual({ status: "cancelled", code: "D015_CANCELLED" });
    expect(executions).toBe(0);
  });

  it("exact-binds scope and requested fields before executing", async () => {
    let executions = 0;
    const execute = async () => {
      executions += 1;
      return invocation().execute();
    };
    const crossTenant = { ...invocation(execute), authorizedTenantId: "00000000-0000-4000-8000-000000000092" };
    const crossWorkspace = { ...invocation(execute), authorizedWorkspaceId: "10000000-0000-4000-8000-000000000092" };
    const excessField = { ...invocation(execute), fields: ["place_id", "rating"] };

    expect(await service().runPage(crossTenant)).toEqual({ status: "blocked", code: "D015_ISOLATION_FAIL" });
    expect(await service().runPage(crossWorkspace)).toEqual({ status: "blocked", code: "D015_ISOLATION_FAIL" });
    expect(await service().runPage(excessField)).toEqual({ status: "blocked", code: "D015_SOURCE_POLICY_FAIL" });
    expect(executions).toBe(0);
  });

  it("rejects caller authority overrides before loading or executing", async () => {
    let loads = 0;
    let executions = 0;
    const bridge = createAuthorizedFixtureConnectorRunner({
      clock: () => new Date(NOW),
      loadAuthority: async () => {
        loads += 1;
        return authority();
      },
    });
    const hostile = {
      ...invocation(async () => {
        executions += 1;
        return invocation().execute();
      }),
      hardCapUnits: 10_000,
      policy: authority().policy,
      descriptor: authority().registryVersion,
    };

    expect(await bridge.runPage(hostile as never)).toEqual({ status: "blocked", code: "D015_MALFORMED" });
    expect({ loads, executions }).toEqual({ loads: 0, executions: 0 });
  });

  it("fails closed for unavailable, accessor, and proxy authority without observing traps", async () => {
    let executions = 0;
    const execute = async () => {
      executions += 1;
      return invocation().execute();
    };
    const unavailable = createAuthorizedFixtureConnectorRunner({
      clock: () => new Date(NOW),
      loadAuthority: async () => { throw new Error("database unavailable"); },
    });
    expect(await unavailable.runPage(invocation(execute))).toEqual({
      status: "blocked",
      code: "D015_AUTHORITY_UNAVAILABLE",
    });

    let reads = 0;
    const accessor = authority() as Record<string, unknown>;
    Object.defineProperty(accessor, "run", {
      enumerable: true,
      get() {
        reads += 1;
        return authority().run;
      },
    });
    expect(await service(accessor).runPage(invocation(execute))).toEqual({
      status: "blocked",
      code: "D015_MALFORMED",
    });
    expect(reads).toBe(0);

    const proxy = new Proxy(authority(), { ownKeys() { throw new Error("authority trap"); } });
    await expect(service(proxy).runPage(invocation(execute))).resolves.toEqual({
      status: "blocked",
      code: "D015_MALFORMED",
    });

    const nestedProxy = authority({
      unit: new Proxy(authority().unit, { ownKeys() { throw new Error("nested authority trap"); } }),
    });
    await expect(service(nestedProxy).runPage(invocation(execute))).resolves.toEqual({
      status: "blocked",
      code: "D015_MALFORMED",
    });

    const nestedAccessor = authority();
    Object.defineProperty(nestedAccessor.policy, "state", {
      enumerable: true,
      get() {
        reads += 1;
        return "active";
      },
    });
    expect(await service(nestedAccessor).runPage(invocation(execute))).toEqual({
      status: "blocked",
      code: "D015_MALFORMED",
    });
    expect(reads).toBe(0);
    expect(executions).toBe(0);
  });

  it("snapshots mutable authority before the loader can later change it", async () => {
    const loaded = authority();
    let executions = 0;
    const bridge = createAuthorizedFixtureConnectorRunner({
      clock: () => new Date(NOW),
      loadAuthority: async () => loaded,
    });

    const result = await bridge.runPage(invocation(async () => {
      executions += 1;
      (loaded.activation as { revokedAt: string | null }).revokedAt = NOW;
      (loaded.run as { hardCapUnits: number }).hardCapUnits = 0;
      return invocation().execute();
    }));

    expect(result).toMatchObject({ status: "page_complete", code: "D015_PASS" });
    expect(executions).toBe(1);
  });

  it("uses post-load time so authority that expires during a slow load cannot execute", async () => {
    let release!: () => void;
    let markLoading!: () => void;
    const loading = new Promise<void>((resolve) => { markLoading = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let currentTime = NOW;
    let executions = 0;
    const expiring = authority({
      unit: { ...authority().unit, leaseExpiresAt: "2026-08-29T12:00:01.000Z" },
    });
    const bridge = createAuthorizedFixtureConnectorRunner({
      clock: () => new Date(currentTime),
      loadAuthority: async () => {
        markLoading();
        await gate;
        return expiring;
      },
    });

    const pending = bridge.runPage(invocation(async () => {
      executions += 1;
      return invocation().execute();
    }));
    await loading;
    currentTime = "2026-08-29T12:00:02.000Z";
    release();

    await expect(pending).resolves.toEqual({ status: "blocked", code: "D015_LEASE_STALE" });
    expect(executions).toBe(0);
  });

  it("uses post-load time so required attestation expiry during load blocks execution", async () => {
    let release!: () => void;
    let markLoading!: () => void;
    const loading = new Promise<void>((resolve) => { markLoading = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let currentTime = NOW;
    let executions = 0;
    const base = authority();
    const expiring = authority({
      registryVersion: {
        ...base.registryVersion,
        sourceCardId: "customer_list_csv_upload",
        operations: ["upload"],
        outputFields: ["account_name"],
      },
      account: { ...base.account, sourceCardId: "customer_list_csv_upload" },
      policy: {
        ...base.policy,
        sourceCardId: "customer_list_csv_upload",
        allowedOperations: ["upload"],
        allowedFields: ["account_name"],
        attestationExpiresAt: "2026-08-29T12:00:01.000Z",
      },
      run: { ...base.run, sourceCardId: "customer_list_csv_upload", operation: "upload" },
    });
    const bridge = createAuthorizedFixtureConnectorRunner({
      clock: () => new Date(currentTime),
      loadAuthority: async () => {
        markLoading();
        await gate;
        return expiring;
      },
    });
    const pending = bridge.runPage({
      ...invocation(async () => {
        executions += 1;
        return invocation().execute();
      }),
      fields: ["account_name"],
    });

    await loading;
    currentTime = "2026-08-29T12:00:02.000Z";
    release();

    await expect(pending).resolves.toEqual({ status: "blocked", code: "D015_SOURCE_POLICY_FAIL" });
    expect(executions).toBe(0);
  });
});
