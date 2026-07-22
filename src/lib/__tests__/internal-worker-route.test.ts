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

import { runInternalWorkerRoute } from "@/lib/internal-worker-route";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth";

function request(path = "/api/crawl/process-next") {
  return new NextRequest(`https://example.test${path}`);
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

  it.each([
    [new UnauthorizedError(), 401],
    [new ForbiddenError(), 403],
  ])("rejects unauthorized requests before database initialization without recording a run", async (error, status) => {
    authMocks.authorizeInternalWorkerRequest.mockRejectedValue(error);
    const task = vi.fn();

    const response = await runInternalWorkerRoute(
      request(),
      "crawl",
      "crawl:manage",
      task,
    );

    expect(response.status).toBe(status);
    expect(queryMocks.ensureDbReady).not.toHaveBeenCalled();
    expect(queryMocks.markStaleWorkerRunsInterrupted).not.toHaveBeenCalled();
    expect(queryMocks.startWorkerRun).not.toHaveBeenCalled();
    expect(queryMocks.completeWorkerRun).not.toHaveBeenCalled();
    expect(task).not.toHaveBeenCalled();
  });
});
