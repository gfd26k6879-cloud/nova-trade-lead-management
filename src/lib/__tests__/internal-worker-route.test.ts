import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authMocks = vi.hoisted(() => ({
  authorizeInternalWorkerRequest: vi.fn(),
}));

const dbIndexMocks = vi.hoisted(() => ({
  withDbStatementTimeout: vi.fn((_timeoutMs: number, fn: () => Promise<unknown>) => fn()),
  isDbStatementTimeoutError: vi.fn((error: unknown) => (error as { code?: string }).code === "57014"),
}));

const queryMocks = vi.hoisted(() => ({
  completeWorkerRun: vi.fn(),
  ensureDbReady: vi.fn(),
  getSettings: vi.fn(),
  isSchedulerWorkerEnabled: vi.fn(),
  markStaleWorkerRunsInterrupted: vi.fn(),
  startWorkerRun: vi.fn(),
}));

vi.mock("@/lib/internal-worker-auth", () => authMocks);
vi.mock("@/lib/db/index", () => dbIndexMocks);
vi.mock("@/lib/db/queries", () => queryMocks);

import { runInternalWorkerRoute, runTenantInternalWorkerRoute } from "@/lib/internal-worker-route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { getWorkerTenantContext } from "@/lib/tenancy/worker-context";

function request(path = "/api/crawl/process-next") {
  return new NextRequest(`https://example.test${path}`);
}

function tenantAuthorization(tenantId: string, source: "cron" | "session" = "cron") {
  return {
    source,
    context: Object.freeze({
      tenantId,
      workspaceId: null,
      jobId: "20000000-0000-4000-8000-000000000001",
      runId: "30000000-0000-4000-8000-000000000001",
      leaseId: "40000000-0000-4000-8000-000000000001",
      leaseGeneration: 2,
      workerName: "crawl" as const,
      action: "crawl:process" as const,
      sourcePrincipalKind: source,
      correlationId: `corr-${tenantId.slice(-1)}`,
    }),
  };
}

describe("runInternalWorkerRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    process.env.WORKER_ROUTE_TIMEOUT_MS = "";
    queryMocks.ensureDbReady.mockResolvedValue(undefined);
    queryMocks.markStaleWorkerRunsInterrupted.mockResolvedValue(0);
    authMocks.authorizeInternalWorkerRequest.mockResolvedValue({ source: "cron" });
    queryMocks.getSettings.mockResolvedValue({});
    queryMocks.isSchedulerWorkerEnabled.mockReturnValue(true);
    queryMocks.startWorkerRun.mockResolvedValue({ id: "run-1" });
    queryMocks.completeWorkerRun.mockResolvedValue(undefined);
    dbIndexMocks.withDbStatementTimeout.mockImplementation((_timeoutMs: number, fn: () => Promise<unknown>) => fn());
    dbIndexMocks.isDbStatementTimeoutError.mockImplementation((error: unknown) => (error as { code?: string }).code === "57014");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.WORKER_ROUTE_TIMEOUT_MS;
  });

  it("records a controlled 504 when the worker exceeds the internal deadline", async () => {
    process.env.WORKER_ROUTE_TIMEOUT_MS = "1";

    const response = await runInternalWorkerRoute(
      request(),
      "crawl",
      "crawl:manage",
      () => new Promise(() => undefined),
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      error: "Worker exceeded internal timeout before Vercel runtime limit.",
    });
    expect(queryMocks.completeWorkerRun).toHaveBeenCalledWith(
      "run-1",
      "error",
      expect.objectContaining({
        status: "error",
        error: "Worker exceeded internal timeout before Vercel runtime limit.",
      }),
      504,
      "Worker exceeded internal timeout before Vercel runtime limit.",
    );
  });

  it("aborts the worker task signal when the internal deadline expires", async () => {
    process.env.WORKER_ROUTE_TIMEOUT_MS = "1";
    let taskSignal: AbortSignal | undefined;

    const response = await runInternalWorkerRoute(
      request(),
      "crawl",
      "crawl:manage",
      (signal) => {
        taskSignal = signal;
        return new Promise(() => undefined);
      },
    );

    expect(response.status).toBe(504);
    expect(taskSignal).toBeDefined();
    expect(taskSignal?.aborted).toBe(true);
    expect(taskSignal?.reason).toMatchObject({
      name: "WorkerRouteTimeoutError",
      message: "Worker exceeded internal timeout before Vercel runtime limit.",
    });
  });

  it("records database statement timeouts as controlled 504 worker errors", async () => {
    const error = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
    const failingTask = async () => {
      throw error;
    };

    const response = await runInternalWorkerRoute(
      request("/api/scores/recompute-stale"),
      "score_recompute",
      "scores:recompute",
      failingTask,
    );

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      error: "Worker database operation timed out.",
    });
    expect(queryMocks.completeWorkerRun).toHaveBeenCalledWith(
      "run-1",
      "error",
      expect.objectContaining({
        status: "error",
        error: "canceling statement due to statement timeout",
      }),
      504,
      "canceling statement due to statement timeout",
    );
  });

  it("redacts credential details from pre-run setup failures", async () => {
    const diagnostic = "setup failed for api_key=private-worker-key";
    queryMocks.ensureDbReady.mockRejectedValue(new Error(diagnostic));
    const task = vi.fn();

    const response = await runInternalWorkerRoute(
      request(),
      "crawl",
      "crawl:manage",
      task,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: "error", error: "Worker failed." });
    expect(queryMocks.startWorkerRun).not.toHaveBeenCalled();
    expect(queryMocks.completeWorkerRun).not.toHaveBeenCalled();
    expect(task).not.toHaveBeenCalled();
  });

  it("keeps legacy task failure details internal while returning a stable public error", async () => {
    const diagnostic = "connect failed: postgres://db_user:db_password@db.internal/nova";
    const response = await runInternalWorkerRoute(
      request(),
      "crawl",
      "crawl:manage",
      async () => {
        throw new Error(diagnostic);
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: "error", error: "Worker failed." });
    expect(queryMocks.completeWorkerRun).toHaveBeenCalledWith(
      "run-1",
      "error",
      { status: "error", error: diagnostic },
      500,
      diagnostic,
    );
  });

  it.each([
    ["error", "error"],
    ["retrying", "processed"],
  ] as const)("redacts resolved %s task errors without changing persisted diagnostics", async (taskStatus, runStatus) => {
    const diagnostic = "provider rejected credential sk-live-private";
    const taskResult = {
      status: taskStatus,
      error: diagnostic,
      leadId: "lead-1",
      nextRetryAt: taskStatus === "retrying" ? "2026-08-23T12:00:00.000Z" : null,
    };

    const response = await runInternalWorkerRoute(
      request(),
      "crawl",
      "crawl:manage",
      async () => taskResult,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ...taskResult, error: "Worker failed." });
    expect(queryMocks.completeWorkerRun).toHaveBeenCalledWith(
      "run-1",
      runStatus,
      taskResult,
      200,
      diagnostic,
    );
  });

  it("redacts non-string resolved task errors without changing persisted diagnostics", async () => {
    const secret = "sk-live-nested-private";
    const diagnostic = {
      message: "provider rejected credentials",
      credentials: [secret],
    };
    const taskResult = {
      status: "error",
      error: diagnostic,
      leadId: "lead-1",
      nextRetryAt: null,
    };

    const response = await runInternalWorkerRoute(
      request(),
      "crawl",
      "crawl:manage",
      async () => taskResult,
    );
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ...taskResult, error: "Worker failed." });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(queryMocks.completeWorkerRun).toHaveBeenCalledWith(
      "run-1",
      "error",
      taskResult,
      200,
      diagnostic,
    );
  });

  it("ignores JSON-irrelevant symbol getters while redacting resolved task errors", async () => {
    const diagnostic = "provider rejected credential sk-live-private";
    const ignoredSymbol = Symbol("json-ignored");
    const taskResult = {
      status: "error",
      error: diagnostic,
      leadId: "lead-1",
    };
    Object.defineProperty(taskResult, ignoredSymbol, {
      enumerable: true,
      get() {
        throw new Error("JSON-ignored symbol getter must not run");
      },
    });

    const response = await runInternalWorkerRoute(
      request(),
      "crawl",
      "crawl:manage",
      async () => taskResult,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      error: "Worker failed.",
      leadId: "lead-1",
    });
    expect(queryMocks.completeWorkerRun).toHaveBeenCalledTimes(1);
    expect(queryMocks.completeWorkerRun.mock.calls[0]?.[2]).toBe(taskResult);
    expect(taskResult.error).toBe(diagnostic);
  });

  it.each([
    [new UnauthorizedError(), 401, "Authentication required"],
    [new ForbiddenError(), 403, "You do not have permission to perform this action"],
  ])("rejects unauthorized requests before database initialization without recording a run", async (error, status, message) => {
    authMocks.authorizeInternalWorkerRequest.mockRejectedValue(error);
    const task = vi.fn();

    const response = await runInternalWorkerRoute(
      request(),
      "crawl",
      "crawl:manage",
      task,
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ status: "error", error: message });
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.markStaleWorkerRunsInterrupted).not.toHaveBeenCalled();
    expect(queryMocks.startWorkerRun).not.toHaveBeenCalled();
    expect(queryMocks.completeWorkerRun).not.toHaveBeenCalled();
    expect(task).not.toHaveBeenCalled();
  });

  it("authorizes the tenant lease before DB startup, then passes exact context and signal to the task", async () => {
    const authorize = vi.fn().mockResolvedValue(tenantAuthorization("00000000-0000-4000-8000-000000000001"));
    const task = vi.fn(async (context, signal) => ({
      status: "ok",
      tenantId: context.tenantId,
      contextTenantId: getWorkerTenantContext()?.tenantId,
      aborted: signal?.aborted,
    }));
    const response = await runTenantInternalWorkerRoute(
      request(),
      "crawl",
      "queue:operate",
      task,
      { authorization: { authorize }, action: "crawl:process" },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      tenantId: "00000000-0000-4000-8000-000000000001",
      contextTenantId: "00000000-0000-4000-8000-000000000001",
      aborted: false,
    });
    expect(authorize).toHaveBeenCalledBefore(queryMocks.ensureDbReady);
    expect(task).toHaveBeenCalledTimes(1);
    expect(queryMocks.startWorkerRun).toHaveBeenCalledTimes(1);
    expect(getWorkerTenantContext()).toBeNull();
  });

  it("does not initialize DB, start a worker run, or call the task when tenant auth denies", async () => {
    const secret = "lease-secret-private";
    const authorize = vi.fn().mockRejectedValue({
      status: 401,
      code: "WORKER_AUTHORIZATION_FAILED",
      message: `Worker authorization failed for bearer ${secret}`,
    });
    const task = vi.fn();
    const response = await runTenantInternalWorkerRoute(
      request(),
      "crawl",
      "queue:operate",
      task,
      { authorization: { authorize } },
    );

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toEqual({ status: "error", error: "Worker authorization failed" });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.startWorkerRun).not.toHaveBeenCalled();
    expect(task).not.toHaveBeenCalled();
  });

  it("preserves session source and cleans the worker context when the task rejects", async () => {
    const authorize = vi.fn().mockResolvedValue(tenantAuthorization("00000000-0000-4000-8000-000000000002", "session"));
    const task = vi.fn(async (context) => {
      expect(context.sourcePrincipalKind).toBe("session");
      expect(getWorkerTenantContext()?.tenantId).toBe("00000000-0000-4000-8000-000000000002");
      throw new Error("synthetic task failure");
    });

    const response = await runTenantInternalWorkerRoute(
      request(),
      "crawl",
      "queue:operate",
      task,
      { authorization: { authorize } },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: "error", error: "Worker failed." });
    expect(getWorkerTenantContext()).toBeNull();
    expect(queryMocks.completeWorkerRun).toHaveBeenCalledWith(
      "run-1",
      "error",
      { status: "error", error: "Worker failed." },
      500,
      "Worker failed.",
    );
  });

  it("keeps tenant A and tenant B worker callbacks isolated", async () => {
    const authorizeA = vi.fn().mockResolvedValue(tenantAuthorization("00000000-0000-4000-8000-000000000001"));
    const authorizeB = vi.fn().mockResolvedValue(tenantAuthorization("00000000-0000-4000-8000-000000000002"));
    const taskA = vi.fn(async (context) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { status: "ok", tenantId: context.tenantId, activeTenant: getWorkerTenantContext()?.tenantId };
    });
    const taskB = vi.fn(async (context) => ({ status: "ok", tenantId: context.tenantId, activeTenant: getWorkerTenantContext()?.tenantId }));

    const [responseA, responseB] = await Promise.all([
      runTenantInternalWorkerRoute(request(), "crawl", "queue:operate", taskA, { authorization: { authorize: authorizeA } }),
      runTenantInternalWorkerRoute(request(), "crawl", "queue:operate", taskB, { authorization: { authorize: authorizeB } }),
    ]);

    await expect(responseA.json()).resolves.toMatchObject({ tenantId: "00000000-0000-4000-8000-000000000001", activeTenant: "00000000-0000-4000-8000-000000000001" });
    await expect(responseB.json()).resolves.toMatchObject({ tenantId: "00000000-0000-4000-8000-000000000002", activeTenant: "00000000-0000-4000-8000-000000000002" });
    expect(getWorkerTenantContext()).toBeNull();
  });
});
