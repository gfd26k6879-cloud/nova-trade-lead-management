import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { isDbStatementTimeoutError, withDbStatementTimeout } from "@/lib/db/index";
import { authorizeInternalWorkerRequest } from "@/lib/internal-worker-auth";
import {
  completeWorkerRun,
  ensureDbReady,
  getSettings,
  isSchedulerWorkerEnabled,
  markStaleWorkerRunsInterrupted,
  startWorkerRun,
  type SchedulerRunStatus,
  type SchedulerWorkerName,
} from "@/lib/db/queries";
import type { Permission } from "@/lib/permissions";
import { startRouteTiming } from "@/lib/route-timing";

type WorkerTaskResult = Record<string, unknown> & { status?: string; error?: string };

const DEFAULT_WORKER_DB_TIMEOUT_MS = 20_000;
const DEFAULT_SCORE_WORKER_DB_TIMEOUT_MS = 30_000;
const DEFAULT_WORKER_ROUTE_TIMEOUT_MS = 45_000;
const WORKER_ROUTE_TIMEOUT_MESSAGE = "Worker exceeded internal timeout before Vercel runtime limit.";

class WorkerRouteTimeoutError extends Error {
  constructor() {
    super(WORKER_ROUTE_TIMEOUT_MESSAGE);
    this.name = "WorkerRouteTimeoutError";
  }
}

export async function runInternalWorkerRoute(
  request: NextRequest,
  workerName: SchedulerWorkerName,
  fallbackPermission: Permission,
  task: () => Promise<unknown>,
) {
  const logRouteTiming = startRouteTiming(request.nextUrl.pathname);
  try {
    await withWorkerDbTimeout(workerName, async () => {
      await ensureDbReady();
      if (shouldRunStaleWorkerCleanupOnRoute()) {
        await markStaleWorkerRunsInterrupted();
      }
    });
    const auth = await authorizeInternalWorkerRequest(request, fallbackPermission);

    const settings = await withWorkerDbTimeout(workerName, getSettings);
    if (auth.source === "cron" && !isSchedulerWorkerEnabled(settings, workerName)) {
      const run = await withWorkerDbTimeout(workerName, () => startWorkerRun(workerName, auth.source));
      const result = { status: "disabled", reason: "Scheduler toggle is paused." };
      await withWorkerDbTimeout(workerName, () => completeWorkerRun(run.id, "disabled", result, 200));
      logRouteTiming(200, { workerName, result: "disabled" });
      return NextResponse.json(result);
    }

    const run = await withWorkerDbTimeout(workerName, () => startWorkerRun(workerName, auth.source));
    try {
      const taskResult = await withWorkerRouteDeadline(() => withWorkerDbTimeout(workerName, task));
      const result = normalizeTaskResult(taskResult);
      const status = classifyWorkerStatus(result);
      await withWorkerDbTimeout(workerName, () => completeWorkerRun(run.id, status, result, 200, result.error ?? null));
      logRouteTiming(200, { workerName, workerStatus: status });
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const httpStatus = classifyWorkerHttpStatus(err);
      await withWorkerDbTimeout(workerName, () => completeWorkerRun(run.id, "error", { status: "error", error: message }, httpStatus, message));
      logRouteTiming(httpStatus, { workerName, reason: classifyWorkerFailureReason(err), error: message });
      return NextResponse.json({ status: "error", error: message }, { status: httpStatus });
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await recordWorkerRouteFailure(request, workerName, "error", err.status, buildAuthFailureMessage(request, err.message));
      logRouteTiming(err.status, { workerName, reason: "unauthorized" });
      return NextResponse.json({ status: "error", error: err.message }, { status: err.status });
    }
    if (err instanceof ForbiddenError) {
      await recordWorkerRouteFailure(request, workerName, "error", err.status, err.message);
      logRouteTiming(err.status, { workerName, reason: "forbidden" });
      return NextResponse.json({ status: "error", error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    const httpStatus = classifyWorkerHttpStatus(err);
    logRouteTiming(httpStatus, { workerName, reason: classifyWorkerFailureReason(err), error: message });
    return NextResponse.json({ status: "error", error: message }, { status: httpStatus });
  }
}

function normalizeTaskResult(result: unknown): WorkerTaskResult {
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return result as WorkerTaskResult;
  }
  return { status: "processed", result };
}

function classifyWorkerStatus(result: WorkerTaskResult): SchedulerRunStatus {
  if (result.status === "idle" || result.status === "done" || result.status === "ok") return "idle";
  if (result.status === "disabled") return "disabled";
  if (result.status === "budget_limit") return "budget_limit";
  if (result.status === "error") return "error";
  return "processed";
}

function classifyWorkerHttpStatus(error: unknown): number {
  if (error instanceof WorkerRouteTimeoutError) return 504;
  if (isDbStatementTimeoutError(error)) return 504;
  return 500;
}

function classifyWorkerFailureReason(error: unknown): string {
  if (error instanceof WorkerRouteTimeoutError) return "worker_route_timeout";
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  return "worker_error";
}

function getWorkerRouteTimeoutMs(): number {
  const configured = Number(process.env.WORKER_ROUTE_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return Math.min(Math.floor(configured), 295_000);
  return DEFAULT_WORKER_ROUTE_TIMEOUT_MS;
}

function withWorkerRouteDeadline<T>(fn: () => Promise<T>): Promise<T> {
  const timeoutMs = getWorkerRouteTimeoutMs();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new WorkerRouteTimeoutError()), timeoutMs);
  });

  return Promise.race([fn(), deadline]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function getWorkerDbTimeoutMs(workerName: SchedulerWorkerName): number {
  const configured = Number(process.env.WORKER_DB_TIMEOUT_MS);
  if (Number.isFinite(configured) && configured > 0) return Math.min(Math.floor(configured), 60_000);
  return workerName === "score_recompute" ? DEFAULT_SCORE_WORKER_DB_TIMEOUT_MS : DEFAULT_WORKER_DB_TIMEOUT_MS;
}

function withWorkerDbTimeout<T>(workerName: SchedulerWorkerName, fn: () => Promise<T>): Promise<T> {
  return withDbStatementTimeout(getWorkerDbTimeoutMs(workerName), fn);
}

function shouldRunStaleWorkerCleanupOnRoute(): boolean {
  return process.env.WORKER_STALE_CLEANUP_ON_ROUTE === "1";
}

async function recordWorkerRouteFailure(
  request: NextRequest,
  workerName: SchedulerWorkerName,
  status: SchedulerRunStatus,
  httpStatus: number,
  error: string,
): Promise<void> {
  try {
    const triggerSource = request.headers.get("authorization")?.trim() ? "cron" : "session";
    const run = await startWorkerRun(workerName, triggerSource);
    await completeWorkerRun(run.id, status, { status: "error", error, authFailure: true }, httpStatus, error);
  } catch (recordError) {
    console.error("Failed to record worker route failure", recordError);
  }
}

function buildAuthFailureMessage(request: NextRequest, fallback: string): string {
  const hasBearer = /^Bearer\s+.+/i.test(request.headers.get("authorization") ?? "");
  if (!hasBearer) return fallback;
  return "Worker cron authentication failed. Check WORKER_CRON_SECRET or CRON_SECRET in Vercel and the Supabase Vault worker_cron_secret value.";
}
