import { NextResponse } from "next/server";
import { getDb, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, getSettings } from "@/lib/db/queries";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { getConfiguredWorkerCronSecrets } from "@/lib/internal-worker-auth";
import { startRouteTiming } from "@/lib/route-timing";
import { CANONICAL_APP_URL } from "@/lib/app-url";
import { getRuntimeLogContext } from "@/lib/runtime-log-context";

export const dynamic = "force-dynamic";

const HEALTH_DB_TIMEOUT_MS = 5_000;
const HEALTH_CHECK_DEADLINE_MS = 6_000;

type HealthStatus = "ok" | "degraded" | "error";
type HealthCheck = {
  status: HealthStatus;
  message?: string;
};

export async function GET() {
  const startedAt = Date.now();
  const logRouteTiming = startRouteTiming("/api/health");
  const checks: Record<string, HealthCheck> = {};

  checks.database = await runCheck(async () => {
    await withDbStatementTimeout(HEALTH_DB_TIMEOUT_MS, async () => {
      await ensureDbReady();
      const db = await getDb();
      const row = await db.prepare("SELECT 1 AS ok").get<{ ok?: number | string }>();
      if (String(row?.ok) !== "1") throw new Error("Database probe did not return ok.");
    });
  }, "error", true);

  checks.settings = await runCheck(async () => {
    const settings = await withDbStatementTimeout(HEALTH_DB_TIMEOUT_MS, getSettings);
    if (!settings.ai_model) throw new Error("Settings row is missing ai_model.");
  }, "error", true);

  checks.supabaseAuth = checkRequiredEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  checks.appUrl = checkAppUrlEnv(process.env.NEXT_PUBLIC_APP_URL);
  checks.databaseUrl = checkRequiredEnv({ DATABASE_URL: process.env.DATABASE_URL });
  checks.supabaseAdmin = checkRequiredEnv({ SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
  checks.workerCronSecret = await checkWorkerCronSecret();

  checks.openai = await runCheck(async () => {
    const settings = await withDbStatementTimeout(HEALTH_DB_TIMEOUT_MS, getSettings);
    if (!settings.openai_api_key_configured) throw new Error("OpenAI key is not configured in env or settings.");
  }, "degraded", true);

  checks.googlePlaces = await runCheck(async () => {
    const settings = await withDbStatementTimeout(HEALTH_DB_TIMEOUT_MS, getSettings);
    if (!settings.google_places_api_key_configured) throw new Error("Google Places key is not configured in env or settings.");
  }, "degraded", true);

  const criticalKeys = ["database", "settings", "supabaseAuth", "databaseUrl", "supabaseAdmin", "workerCronSecret"];
  const ready = criticalKeys.every((key) => checks[key]?.status === "ok");
  const degraded = ready && Object.values(checks).some((check) => check.status !== "ok");
  const status: HealthStatus = ready ? (degraded ? "degraded" : "ok") : "error";
  logRouteTiming(ready ? 200 : 503, { healthStatus: status });

  return applyNoStoreHeaders(NextResponse.json(
    {
      status,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      runtime: getRuntimeLogContext(),
      checks,
    },
    { status: ready ? 200 : 503 },
  ));
}

async function runCheck(fn: () => Promise<void>, failureStatus: HealthStatus = "error", retryTransient = false): Promise<HealthCheck> {
  try {
    await runWithDeadline(fn, HEALTH_CHECK_DEADLINE_MS);
    return { status: "ok" };
  } catch (error) {
    if (retryTransient && isTransientDbError(error)) {
      try {
        await runWithDeadline(fn, HEALTH_CHECK_DEADLINE_MS);
        return { status: "ok" };
      } catch (retryError) {
        return {
          status: failureStatus,
          message: retryError instanceof Error ? retryError.message : String(retryError),
        };
      }
    }
    return {
      status: failureStatus,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function checkRequiredEnv(env: Record<string, string | undefined>): HealthCheck {
  const missing = Object.entries(env)
    .filter(([, value]) => !value?.trim())
    .map(([key]) => key);
  return missing.length === 0
    ? { status: "ok" }
    : { status: "error", message: `Missing required env: ${missing.join(", ")}` };
}

function checkAppUrlEnv(value: string | undefined): HealthCheck {
  const configured = value?.trim().replace(/\/+$/, "");
  if (!configured) {
    return { status: "degraded", message: `NEXT_PUBLIC_APP_URL is missing; auth emails fall back to ${CANONICAL_APP_URL}.` };
  }
  if (configured !== CANONICAL_APP_URL) {
    return { status: "degraded", message: `NEXT_PUBLIC_APP_URL is ${configured}; expected ${CANONICAL_APP_URL}.` };
  }
  return { status: "ok" };
}

async function checkWorkerCronSecret(): Promise<HealthCheck> {
  if (getConfiguredWorkerCronSecrets().length > 0) return { status: "ok" };
  if (!process.env.DATABASE_URL?.trim()) {
    return { status: "error", message: "Missing worker cron secret env and DATABASE_URL is unavailable for Supabase Vault fallback." };
  }

  return runCheck(async () => {
    await withDbStatementTimeout(HEALTH_DB_TIMEOUT_MS, async () => {
      const db = await getDb();
      const row = await db.prepare(
        "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ? LIMIT 1",
      ).get<{ decrypted_secret?: string | null }>("worker_cron_secret");
      if (!row?.decrypted_secret?.trim()) throw new Error("worker_cron_secret is not configured in Supabase Vault.");
    });
  }, "error", true);
}

async function runWithDeadline<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let deadlineWon = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const operation = fn();
  const guardedOperation = operation.catch((error) => {
    // If the deadline wins the race, the underlying database check may still
    // reject later. Mark it as observed so a controlled health timeout does not
    // become an unhandled rejection that kills the serverless process.
    if (deadlineWon) return new Promise<never>(() => {});
    throw error;
  });
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      deadlineWon = true;
      reject(new Error(`Health check exceeded ${timeoutMs}ms.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([guardedOperation, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
