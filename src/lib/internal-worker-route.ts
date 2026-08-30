import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { isDbStatementTimeoutError, withDbStatementTimeout } from "@/lib/db/index";
import {
  authorizeInternalWorkerRequest,
  createTenantWorkerAuthorizationService,
  type InternalWorkerAction,
  type TenantWorkerAuthorizationOptions,
  type TenantWorkerAuthorizationService,
} from "@/lib/internal-worker-auth";
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
import type { Permission, TenantPermission } from "@/lib/permissions";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import {
  assertWorkerTenantContext,
  runWithWorkerTenantContext,
  type WorkerTenantContext,
} from "@/lib/tenancy/worker-context";
import { startRouteTiming } from "@/lib/route-timing";

type WorkerTaskResult = Record<string, unknown> & { status?: string; error?: string };
export type LegacyWorkerTask = (signal?: AbortSignal) => Promise<unknown>;
export type TenantWorkerTask = (context: WorkerTenantContext, signal?: AbortSignal) => Promise<unknown>;

const DEFAULT_WORKER_DB_TIMEOUT_MS = 20_000;
const DEFAULT_SCORE_WORKER_DB_TIMEOUT_MS = 30_000;
const DEFAULT_WORKER_ROUTE_TIMEOUT_MS = 45_000;
const WORKER_ROUTE_TIMEOUT_MESSAGE = "Worker exceeded internal timeout before Vercel runtime limit.";
const WORKER_FAILED_MESSAGE = "Worker failed.";
const WORKER_AUTHORIZATION_FAILED_MESSAGE = "Worker authorization failed";
const WORKER_AUTHENTICATION_REQUIRED_MESSAGE = "Authentication required";
const WORKER_FORBIDDEN_MESSAGE = "You do not have permission to perform this action";

class WorkerRouteTimeoutError extends Error {
  constructor() {
    super(WORKER_ROUTE_TIMEOUT_MESSAGE);
    this.name = "WorkerRouteTimeoutError";
  }
}

export type TenantWorkerRouteOptions =
  | {
      readonly authorization: TenantWorkerAuthorizationService;
      readonly action?: InternalWorkerAction;
    }
  | (TenantWorkerAuthorizationOptions & { readonly action?: InternalWorkerAction });

/**
 * Compatibility runner for legacy_unscoped routes. Its authentication result
 * is intentionally never converted into a tenant context.
 */
export async function runInternalWorkerRoute(
  request: NextRequest,
  workerName: SchedulerWorkerName,
  fallbackPermission: Permission,
  task: LegacyWorkerTask,
) {
  const logRouteTiming = startRouteTiming(request.nextUrl.pathname);
  try {
    const auth = await authorizeInternalWorkerRequest(request, fallbackPermission);
    return await runWorkerRouteBody(workerName, auth.source, task, undefined, logRouteTiming, false);
  } catch (err) {
    return handleWorkerRouteError(err, workerName, logRouteTiming, false);
  }
}

/**
 * Tenant-authorized runner. The resolver is required to be injected directly
 * or through a prebuilt authorization service; no default DB/network lookup
 * exists. Tenant context is installed only after lease and session authority
 * have both passed.
 */
export async function runTenantInternalWorkerRoute(
  request: NextRequest,
  workerName: SchedulerWorkerName,
  sessionPermission: TenantPermission,
  task: TenantWorkerTask,
  options: TenantWorkerRouteOptions,
) {
  const logRouteTiming = startRouteTiming(request.nextUrl.pathname);
  try {
    const authorization = "authorization" in options
      ? options.authorization
      : createTenantWorkerAuthorizationService({ ...options, sessionPermission });
    const auth = await authorization.authorize(request, workerName, options.action);
    return await runWithWorkerTenantContext(auth, () =>
      runWorkerRouteBody(workerName, auth.source, task, auth.context, logRouteTiming, true),
    );
  } catch (err) {
    return handleWorkerRouteError(err, workerName, logRouteTiming, true);
  }
}

async function runWorkerRouteBody(
  workerName: SchedulerWorkerName,
  source: "cron" | "session",
  task: LegacyWorkerTask | TenantWorkerTask,
  context: WorkerTenantContext | undefined,
  logRouteTiming: ReturnType<typeof startRouteTiming>,
  safeInternalErrors: boolean,
): Promise<NextResponse> {
  await withWorkerDbTimeout(workerName, async () => {
    await ensureDbReady();
    if (shouldRunStaleWorkerCleanupOnRoute()) await markStaleWorkerRunsInterrupted();
  });

  const settings = await withWorkerDbTimeout(workerName, getSettings);
  if (source === "cron" && !isSchedulerWorkerEnabled(settings, workerName)) {
    const run = await withWorkerDbTimeout(workerName, () => startWorkerRun(workerName, source));
    const result = { status: "disabled", reason: "Scheduler toggle is paused." };
    await withWorkerDbTimeout(workerName, () => completeWorkerRun(run.id, "disabled", result, 200));
    logRouteTiming(200, { workerName, result: "disabled" });
    return workerJsonResponse(result);
  }

  const run = await withWorkerDbTimeout(workerName, () => startWorkerRun(workerName, source));
  try {
    const taskResult = await withWorkerRouteDeadline((signal) => withWorkerDbTimeout(workerName, () => {
      if (context) {
        assertWorkerTenantContext(context);
        return (task as TenantWorkerTask)(context, signal);
      }
      return (task as LegacyWorkerTask)(signal);
    }));
    if (context) assertWorkerTenantContext(context);
    const result = normalizeTaskResult(taskResult);
    const status = classifyWorkerStatus(result);
    // Preserve full operator diagnostics in the run record; redact only the HTTP representation.
    await withWorkerDbTimeout(workerName, () => completeWorkerRun(run.id, status, result, 200, result.error ?? null));
    logRouteTiming(200, { workerName, workerStatus: status });
    return workerJsonResponse(safeWorkerTaskResult(result));
  } catch (err) {
    const message = safeInternalErrors ? safeWorkerErrorMessage(err) : err instanceof Error ? err.message : String(err);
    const publicMessage = safeWorkerErrorMessage(err);
    const httpStatus = classifyWorkerHttpStatus(err);
    await withWorkerDbTimeout(workerName, () => completeWorkerRun(run.id, "error", { status: "error", error: message }, httpStatus, message));
    logRouteTiming(httpStatus, { workerName, reason: classifyWorkerFailureReason(err), error: message });
    return workerJsonResponse({ status: "error", error: publicMessage }, { status: httpStatus });
  }
}

function handleWorkerRouteError(
  err: unknown,
  workerName: SchedulerWorkerName,
  logRouteTiming: ReturnType<typeof startRouteTiming>,
  safeInternalErrors: boolean,
): NextResponse {
  if (isTenantWorkerAuthorizationError(err)) {
    logRouteTiming(err.status, { workerName, reason: "worker_authorization_failed" });
    return workerJsonResponse({ status: "error", error: WORKER_AUTHORIZATION_FAILED_MESSAGE }, { status: err.status });
  }
  if (err instanceof UnauthorizedError) {
    logRouteTiming(err.status, { workerName, reason: "unauthorized", error: err.message });
    return workerJsonResponse({ status: "error", error: WORKER_AUTHENTICATION_REQUIRED_MESSAGE }, { status: err.status });
  }
  if (err instanceof ForbiddenError) {
    logRouteTiming(err.status, { workerName, reason: "forbidden", error: err.message });
    return workerJsonResponse({ status: "error", error: WORKER_FORBIDDEN_MESSAGE }, { status: err.status });
  }
  const message = safeInternalErrors ? safeWorkerErrorMessage(err) : err instanceof Error ? err.message : String(err);
  const publicMessage = safeWorkerErrorMessage(err);
  const httpStatus = classifyWorkerHttpStatus(err);
  logRouteTiming(httpStatus, { workerName, reason: classifyWorkerFailureReason(err), error: message });
  return workerJsonResponse({ status: "error", error: publicMessage }, { status: httpStatus });
}

function workerJsonResponse(body: unknown, init?: ResponseInit): NextResponse {
  return applyNoStoreHeaders(NextResponse.json(body, init));
}

function safeWorkerErrorMessage(error: unknown): string {
  if (error instanceof WorkerRouteTimeoutError) return WORKER_ROUTE_TIMEOUT_MESSAGE;
  if (isDbStatementTimeoutError(error)) return "Worker database operation timed out.";
  return WORKER_FAILED_MESSAGE;
}

function isTenantWorkerAuthorizationError(error: unknown): error is { status: 401; message: string; code: "WORKER_AUTHORIZATION_FAILED" } {
  return Boolean(
    error &&
    typeof error === "object" &&
    "status" in error && error.status === 401 &&
    "code" in error && error.code === "WORKER_AUTHORIZATION_FAILED" &&
    "message" in error && typeof error.message === "string",
  );
}

function normalizeTaskResult(result: unknown): WorkerTaskResult {
  if (result && typeof result === "object" && !Array.isArray(result)) return result as WorkerTaskResult;
  return { status: "processed", result };
}

function safeWorkerTaskResult(result: WorkerTaskResult): WorkerTaskResult {
  if (!Object.prototype.hasOwnProperty.call(result, "error")) return result;

  const safeResult = Object.create(null) as WorkerTaskResult;
  for (const key of Object.keys(result)) {
    safeResult[key] = key === "error" ? WORKER_FAILED_MESSAGE : result[key];
  }
  if (!Object.prototype.propertyIsEnumerable.call(result, "error")) {
    safeResult.error = WORKER_FAILED_MESSAGE;
  }
  return safeResult;
}

function classifyWorkerStatus(result: WorkerTaskResult): SchedulerRunStatus {
  if (result.status === "idle" || result.status === "done" || result.status === "ok") return "idle";
  if (result.status === "disabled") return "disabled";
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

function withWorkerRouteDeadline<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const timeoutMs = getWorkerRouteTimeoutMs();
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new WorkerRouteTimeoutError();
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });

  const task = Promise.resolve().then(() => fn(controller.signal));
  return Promise.race([task, deadline]).finally(() => {
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
