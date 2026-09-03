import { describe, expect, it } from "vitest";

import { GOOGLE_PLACES_FIXTURE_ADAPTER } from "@/lib/connectors/adapter-contract";
import {
  ConnectorRetryableError,
  createFixtureConnectorRunner,
  type ConnectorFixturePage,
  type ConnectorRunPageRequest,
} from "@/lib/connectors/runner";

function request(
  overrides: Partial<ConnectorRunPageRequest> = {},
): ConnectorRunPageRequest {
  return {
    runId: "run-a",
    unitId: "unit-a",
    checkpointKey: "run-a:unit-a:page-1",
    inputHash: "a".repeat(64),
    cursor: null,
    maxAttempts: 3,
    hardCapUnits: 5,
    policy: {
      sourceCardId: "google_places_legacy",
      executionMode: "fixture",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      authorizedTenantId: "tenant-a",
      operation: "search_text",
      fields: ["place_id", "business_name"],
      termsState: "approved",
      budget: { requestedUnits: 1, remainingUnits: 5 },
      now: "2026-08-29T12:00:00.000Z",
    },
    descriptor: GOOGLE_PLACES_FIXTURE_ADAPTER,
    execute: async () => ({
      observation: {
        sourceCardId: "google_places_legacy",
        operation: "search_text",
        tenantId: "tenant-a",
        runId: "run-a",
        observedAt: "2026-08-29T18:00:00.000Z",
        fields: {
          place_id: "places/example",
          business_name: "Example Industrial",
        },
      },
      nextCursor: "page-2",
      complete: false,
      actualUnits: 1,
    }),
    ...overrides,
  };
}

describe("fixture connector source-run page runner", () => {
  it("commits one bounded observation page, cursor, and usage atomically", async () => {
    const runner = createFixtureConnectorRunner();

    const result = await runner.runPage(request());

    expect(result).toMatchObject({
      status: "page_complete",
      code: "D015_PASS",
      checkpoint: {
        status: "page_complete",
        attempts: 1,
        cursor: null,
        nextCursor: "page-2",
        reservedUnits: 1,
        actualUnits: 1,
        complete: false,
      },
    });
    expect(runner.getRunUsage("run-a")).toEqual({ reservedUnits: 1, actualUnits: 1 });
    expect(runner.getObservations("run-a")).toHaveLength(1);
  });

  it("replays a committed checkpoint without executing or charging twice", async () => {
    const runner = createFixtureConnectorRunner();
    let calls = 0;
    const input = request({
      execute: async (context) => {
        calls += 1;
        return request().execute(context);
      },
    });

    await runner.runPage(input);
    const replay = await runner.runPage(input);

    expect(replay).toMatchObject({ status: "replay", code: "D015_REPLAY_SAME_INPUT" });
    expect(calls).toBe(1);
    expect(runner.getRunUsage("run-a")).toEqual({ reservedUnits: 1, actualUnits: 1 });
    expect(runner.getObservations("run-a")).toHaveLength(1);
  });

  it("blocks an idempotency-key conflict before connector execution", async () => {
    const runner = createFixtureConnectorRunner();
    let calls = 0;
    const first = request();
    await runner.runPage(first);

    const result = await runner.runPage(request({
      inputHash: "b".repeat(64),
      execute: async () => {
        calls += 1;
        return first.execute({ cursor: null, signal: new AbortController().signal });
      },
    }));

    expect(result).toEqual({ status: "blocked", code: "D015_CONFLICT" });
    expect(calls).toBe(0);
  });

  it("allows only one concurrent claimant for a page", async () => {
    const runner = createFixtureConnectorRunner();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const input = request({
      execute: async (context) => {
        calls += 1;
        await gate;
        return request().execute(context);
      },
    });

    const first = runner.runPage(input);
    const second = await runner.runPage(input);
    release();
    await first;

    expect(second).toEqual({ status: "busy", code: "D015_ALREADY_IN_PROGRESS" });
    expect(calls).toBe(1);
  });

  it("retries one page only on a later invocation and stops at the attempt cap", async () => {
    const runner = createFixtureConnectorRunner();
    let calls = 0;
    const input = request({
      maxAttempts: 2,
      execute: async () => {
        calls += 1;
        throw new ConnectorRetryableError("timeout");
      },
    });

    const first = await runner.runPage(input);
    const second = await runner.runPage(input);
    const replay = await runner.runPage(input);

    expect(first).toMatchObject({ status: "retry_wait", code: "D015_RETRYABLE", checkpoint: { attempts: 1 } });
    expect(second).toMatchObject({ status: "failed", code: "D015_RETRY_EXHAUSTED", checkpoint: { attempts: 2 } });
    expect(replay).toMatchObject({ status: "replay", checkpoint: { status: "failed", attempts: 2 } });
    expect(calls).toBe(2);
  });

  it("resumes from retry wait and commits the successful second attempt once", async () => {
    const runner = createFixtureConnectorRunner();
    let calls = 0;
    const success = request().execute;
    const input = request({
      execute: async (context) => {
        calls += 1;
        if (calls === 1) throw new ConnectorRetryableError("rate_limited", 2_000);
        return success(context);
      },
    });

    expect(await runner.runPage(input)).toMatchObject({ status: "retry_wait", checkpoint: { retryAfterMs: 2_000 } });
    expect(await runner.runPage(input)).toMatchObject({ status: "page_complete", checkpoint: { attempts: 2 } });
    expect(runner.getObservations("run-a")).toHaveLength(1);
    expect(runner.getRunUsage("run-a")).toEqual({ reservedUnits: 1, actualUnits: 1 });
  });

  it("honors pause, resume, cancellation, and kill before fixture execution", async () => {
    const runner = createFixtureConnectorRunner();
    let calls = 0;
    const input = request({
      execute: async (context) => {
        calls += 1;
        return request().execute(context);
      },
    });

    runner.pauseRun("run-a");
    expect(await runner.runPage(input)).toEqual({ status: "paused", code: "D015_PAUSED" });
    runner.resumeRun("run-a");
    runner.cancelRun("run-a");
    expect(await runner.runPage(input)).toEqual({ status: "cancelled", code: "D015_CANCELLED" });

    const killed = createFixtureConnectorRunner();
    killed.killRun("run-a");
    expect(await killed.runPage(input)).toEqual({ status: "blocked", code: "D015_KILLED" });
    expect(calls).toBe(0);
  });

  it("aborts an active page and does not commit its observation or usage", async () => {
    const runner = createFixtureConnectorRunner();
    const input = request({
      execute: ({ signal }) => new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(new ConnectorRetryableError("transport")), { once: true });
      }),
    });

    const pending = runner.runPage(input);
    runner.cancelRun("run-a");
    const result = await pending;

    expect(result).toMatchObject({ status: "cancelled", code: "D015_CANCELLED" });
    expect(runner.getObservations("run-a")).toEqual([]);
    expect(runner.getRunUsage("run-a")).toEqual({ reservedUnits: 1, actualUnits: 0 });
  });

  it("does not call the adapter when policy or budget blocks", async () => {
    const runner = createFixtureConnectorRunner();
    let calls = 0;
    const execute = async () => {
      calls += 1;
      return request().execute({ cursor: null, signal: new AbortController().signal });
    };

    expect(await runner.runPage(request({
      policy: { ...request().policy, termsState: "expired" },
      execute,
    }))).toMatchObject({ status: "blocked", code: "D015_SOURCE_POLICY_FAIL" });
    expect(await runner.runPage(request({
      checkpointKey: "run-a:unit-a:page-2",
      inputHash: "c".repeat(64),
      hardCapUnits: 0,
      execute,
    }))).toMatchObject({ status: "blocked", code: "D015_COST_FAIL" });
    expect(calls).toBe(0);
  });

  it("fails closed without checkpoint side effects for malformed input", async () => {
    const runner = createFixtureConnectorRunner();

    expect(await runner.runPage(request({ maxAttempts: 0 }))).toEqual({ status: "blocked", code: "D015_MALFORMED" });
    expect(await runner.runPage(request({ inputHash: "not-a-hash" }))).toEqual({ status: "blocked", code: "D015_MALFORMED" });
    expect(runner.getObservations("run-a")).toEqual([]);
    expect(runner.getRunUsage("run-a")).toEqual({ reservedUnits: 0, actualUnits: 0 });
  });

  it("keeps direct runPage an exact fixture harness without accepting authority-shaped extras", async () => {
    const runner = createFixtureConnectorRunner();
    let calls = 0;
    const input = {
      ...request({ execute: async () => {
        calls += 1;
        return request().execute({ cursor: null, signal: new AbortController().signal });
      } }),
      sourcePolicyId: "caller-policy",
      leaseGeneration: 99,
    };

    expect(await runner.runPage(input as never)).toEqual({ status: "blocked", code: "D015_MALFORMED" });
    expect(calls).toBe(0);
  });

  it("rejects malformed, over-budget, or non-advancing page output without committing", async () => {
    const cases = [
      { actualUnits: 2 },
      { nextCursor: null, complete: false },
      { nextCursor: "", complete: false },
      { nextCursor: "cursor-a", complete: true },
      { nextCursor: null, complete: true, actualUnits: Number.NaN },
    ];

    for (const [index, page] of cases.entries()) {
      const runner = createFixtureConnectorRunner();
      const base = await request().execute({ cursor: null, signal: new AbortController().signal });
      const result = await runner.runPage(request({
        checkpointKey: `malformed-${index}`,
        inputHash: String(index).padStart(64, "0"),
        execute: async () => ({ ...base, ...page }),
      }));
      expect(result).toMatchObject({ status: "failed", code: "D015_MALFORMED" });
      expect(runner.getObservations("run-a")).toEqual([]);
      expect(runner.getRunUsage("run-a").actualUnits).toBe(0);
    }
  });

  it("binds committed observations to the exact run, operation, and requested fields", async () => {
    const base = await request().execute({ cursor: null, signal: new AbortController().signal });
    const cases = [
      { observation: { ...base.observation, runId: "run-b" } },
      { observation: { ...base.observation, operation: "place_details" } },
      {
        observation: {
          ...base.observation,
          fields: { ...base.observation.fields, rating: 4.8 },
        },
      },
    ];

    for (const [index, page] of cases.entries()) {
      const runner = createFixtureConnectorRunner();
      const result = await runner.runPage(request({
        checkpointKey: `scope-${index}`,
        inputHash: `f${String(index).padStart(63, "0")}`,
        execute: async () => ({ ...base, ...page }),
      }));

      expect(result).toMatchObject({ status: "failed", code: "D015_SOURCE_POLICY_FAIL" });
      expect(runner.getObservations("run-a")).toEqual([]);
    }
  });

  it("prevents distinct concurrent pages from reserving beyond the run hard cap", async () => {
    const runner = createFixtureConnectorRunner();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = runner.runPage(request({
      hardCapUnits: 1,
      execute: async (context) => {
        await gate;
        return request().execute(context);
      },
    }));

    const second = await runner.runPage(request({
      unitId: "unit-b",
      checkpointKey: "run-a:unit-b:page-1",
      inputHash: "d".repeat(64),
      hardCapUnits: 1,
    }));
    release();
    await first;

    expect(second).toEqual({ status: "blocked", code: "D015_COST_FAIL" });
    expect(runner.getRunUsage("run-a").reservedUnits).toBe(1);
  });

  it("marks a final page completed only when it has no continuation cursor", async () => {
    const runner = createFixtureConnectorRunner();
    const base = await request().execute({ cursor: null, signal: new AbortController().signal });

    expect(await runner.runPage(request({
      execute: async () => ({ ...base, complete: true, nextCursor: null }),
    }))).toMatchObject({
      status: "completed",
      code: "D015_PASS",
      checkpoint: { complete: true, nextCursor: null },
    });
  });

  it("rejects accessor and throwing-proxy input without invoking the connector or accessor", async () => {
    const runner = createFixtureConnectorRunner();
    let getterCalls = 0;
    let connectorCalls = 0;
    const accessorRequest = { ...request(), execute: async () => {
      connectorCalls += 1;
      return request().execute({ cursor: null, signal: new AbortController().signal });
    } };
    Object.defineProperty(accessorRequest, "runId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "run-a";
      },
    });

    expect(await runner.runPage(accessorRequest)).toEqual({ status: "blocked", code: "D015_MALFORMED" });
    expect(getterCalls).toBe(0);

    const policy = { ...request().policy };
    Object.defineProperty(policy, "sourceCardId", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "google_places_legacy";
      },
    });
    expect(await runner.runPage(request({ policy }))).toEqual({ status: "blocked", code: "D015_MALFORMED" });
    expect(getterCalls).toBe(0);

    const descriptor = { ...GOOGLE_PLACES_FIXTURE_ADAPTER };
    Object.defineProperty(descriptor, "transport", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "none";
      },
    });
    expect(await runner.runPage(request({ descriptor }))).toEqual({ status: "blocked", code: "D015_MALFORMED" });
    expect(getterCalls).toBe(0);

    const hostile = new Proxy(request(), {
      ownKeys() { throw new Error("proxy trap"); },
    });
    await expect(runner.runPage(hostile)).resolves.toEqual({ status: "blocked", code: "D015_MALFORMED" });
    const hostileDescriptor = new Proxy(GOOGLE_PLACES_FIXTURE_ADAPTER, {
      ownKeys() { throw new Error("nested proxy trap"); },
    });
    await expect(runner.runPage(request({ descriptor: hostileDescriptor }))).resolves.toEqual({
      status: "blocked",
      code: "D015_MALFORMED",
    });
    expect(connectorCalls).toBe(0);
  });

  it("settles unused reservation units before reserving the next page", async () => {
    const runner = createFixtureConnectorRunner();
    const firstBase = request();
    const first = await runner.runPage(request({
      hardCapUnits: 4,
      policy: { ...firstBase.policy, budget: { requestedUnits: 3, remainingUnits: 4 } },
      execute: async (context) => ({ ...(await firstBase.execute(context)), actualUnits: 1 }),
    }));
    expect(first).toMatchObject({ status: "page_complete", checkpoint: { reservedUnits: 3, actualUnits: 1 } });

    const secondBase = request();
    const second = await runner.runPage(request({
      checkpointKey: "run-a:unit-a:page-2",
      inputHash: "e".repeat(64),
      cursor: "page-2",
      hardCapUnits: 4,
      policy: { ...secondBase.policy, budget: { requestedUnits: 3, remainingUnits: 3 } },
      execute: async (context) => ({
        ...(await secondBase.execute(context)),
        nextCursor: null,
        complete: true,
        actualUnits: 3,
      }),
    }));

    expect(second).toMatchObject({ status: "completed", code: "D015_PASS" });
    expect(runner.getRunUsage("run-a")).toEqual({ reservedUnits: 4, actualUnits: 4 });
  });

  it("requires each new checkpoint to continue from the saved cursor for its run unit", async () => {
    const runner = createFixtureConnectorRunner();
    await runner.runPage(request());
    let calls = 0;

    expect(await runner.runPage(request({
      checkpointKey: "run-a:unit-a:wrong-page",
      inputHash: "1".repeat(64),
      cursor: "arbitrary-page",
      execute: async (context) => {
        calls += 1;
        return request().execute(context);
      },
    }))).toEqual({ status: "blocked", code: "D015_CONFLICT" });

    const base = request();
    expect(await runner.runPage(request({
      checkpointKey: "run-a:unit-a:page-2",
      inputHash: "2".repeat(64),
      cursor: "page-2",
      execute: async (context) => ({
        ...(await base.execute(context)),
        nextCursor: null,
        complete: true,
      }),
    }))).toMatchObject({ status: "completed", code: "D015_PASS" });
    expect(calls).toBe(0);
  });

  it("does not allow a retry-wait page to fork under a new checkpoint key", async () => {
    const runner = createFixtureConnectorRunner();
    const retrying = request({ execute: async () => { throw new ConnectorRetryableError("timeout"); } });
    expect(await runner.runPage(retrying)).toMatchObject({ status: "retry_wait" });

    expect(await runner.runPage(request({
      checkpointKey: "run-a:unit-a:fork",
      inputHash: "3".repeat(64),
    }))).toEqual({ status: "blocked", code: "D015_CONFLICT" });
  });

  it("rejects page and observation accessors without reading them", async () => {
    const base = await request().execute({ cursor: null, signal: new AbortController().signal });
    for (const key of ["observation", "nextCursor", "complete", "actualUnits"] as const) {
      const runner = createFixtureConnectorRunner();
      let reads = 0;
      const page = { ...base };
      Object.defineProperty(page, key, {
        enumerable: true,
        get() {
          reads += 1;
          return base[key];
        },
      });

      expect(await runner.runPage(request({ execute: async () => page }))).toMatchObject({
        status: "failed",
        code: "D015_MALFORMED",
      });
      expect(reads).toBe(0);
    }

    const runner = createFixtureConnectorRunner();
    let observationReads = 0;
    const observation = { ...base.observation };
    Object.defineProperty(observation, "runId", {
      enumerable: true,
      get() {
        observationReads += 1;
        return "run-a";
      },
    });
    expect(await runner.runPage(request({
      execute: async () => ({ ...base, observation }),
    }))).toMatchObject({ status: "failed", code: "D015_MALFORMED" });
    expect(observationReads).toBe(0);
  });

  it("turns throwing page, observation, and field proxies into D015_MALFORMED", async () => {
    const base = await request().execute({ cursor: null, signal: new AbortController().signal });
    const hostile = (value: object) => new Proxy(value, {
      ownKeys() { throw new Error("output proxy trap"); },
    });
    const pages: ConnectorFixturePage[] = [
      hostile(base) as ConnectorFixturePage,
      { ...base, observation: hostile(base.observation) as typeof base.observation },
      { ...base, observation: { ...base.observation, fields: hostile(base.observation.fields) as typeof base.observation.fields } },
    ];

    for (const page of pages) {
      const runner = createFixtureConnectorRunner();
      await expect(runner.runPage(request({ execute: async () => page }))).resolves.toMatchObject({
        status: "failed",
        code: "D015_MALFORMED",
      });
    }
  });

  it("returns immutable checkpoint and observation snapshots", async () => {
    const runner = createFixtureConnectorRunner();
    const result = await runner.runPage(request());
    if (!("checkpoint" in result) || !result.checkpoint) throw new Error("missing checkpoint");

    expect(Object.isFrozen(result.checkpoint)).toBe(true);
    expect(Object.isFrozen(result.checkpoint.observation)).toBe(true);
    expect(Object.isFrozen(result.checkpoint.observation?.fields)).toBe(true);
    expect(Object.isFrozen(runner.getObservations("run-a"))).toBe(true);
  });
});
