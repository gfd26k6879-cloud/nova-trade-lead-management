import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { authorizeInternalWorkerRequest } from "@/lib/internal-worker-auth";
import {
  completeWorkerRun,
  ensureDbReady,
  getSettings,
  isSchedulerWorkerEnabled,
  startWorkerRun,
  type SchedulerRunStatus,
  type SchedulerWorkerName,
} from "@/lib/db/queries";
import type { Permission } from "@/lib/permissions";

type WorkerTaskResult = Record<string, unknown> & { status?: string; error?: string };

export async function runInternalWorkerRoute(
  request: NextRequest,
  workerName: SchedulerWorkerName,
  fallbackPermission: Permission,
  task: () => Promise<unknown>,
) {
  try {
    await ensureDbReady();
    const auth = await authorizeInternalWorkerRequest(request, fallbackPermission);

    const settings = await getSettings();
    if (auth.source === "cron" && !isSchedulerWorkerEnabled(settings, workerName)) {
      const run = await startWorkerRun(workerName, auth.source);
      const result = { status: "disabled", reason: "Scheduler toggle is paused." };
      await completeWorkerRun(run.id, "disabled", result, 200);
      return NextResponse.json(result);
    }

    const run = await startWorkerRun(workerName, auth.source);
    try {
      const taskResult = await task();
      const result = normalizeTaskResult(taskResult);
      const status = classifyWorkerStatus(result);
      await completeWorkerRun(run.id, status, result, 200, result.error ?? null);
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await completeWorkerRun(run.id, "error", { status: "error", error: message }, 500, message);
      return NextResponse.json({ status: "error", error: message }, { status: 500 });
    }
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      await recordWorkerRouteFailure(request, workerName, "error", err.status, buildAuthFailureMessage(request, err.message));
      return NextResponse.json({ status: "error", error: err.message }, { status: err.status });
    }
    if (err instanceof ForbiddenError) {
      await recordWorkerRouteFailure(request, workerName, "error", err.status, err.message);
      return NextResponse.json({ status: "error", error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
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
