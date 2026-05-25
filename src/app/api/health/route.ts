import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { ensureDbReady, getSettings } from "@/lib/db/queries";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { getConfiguredWorkerCronSecrets } from "@/lib/internal-worker-auth";

export const dynamic = "force-dynamic";

type HealthStatus = "ok" | "degraded" | "error";
type HealthCheck = {
  status: HealthStatus;
  message?: string;
};

export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, HealthCheck> = {};

  checks.database = await runCheck(async () => {
    await ensureDbReady();
    const db = await getDb();
    const row = await db.prepare("SELECT 1 AS ok").get<{ ok?: number | string }>();
    if (String(row?.ok) !== "1") throw new Error("Database probe did not return ok.");
  });

  checks.settings = await runCheck(async () => {
    const settings = await getSettings();
    if (!settings.ai_model) throw new Error("Settings row is missing ai_model.");
  });

  checks.supabaseAuth = checkRequiredEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  checks.databaseUrl = checkRequiredEnv({ DATABASE_URL: process.env.DATABASE_URL });
  checks.supabaseAdmin = checkRequiredEnv({ SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
  checks.workerCronSecret = await checkWorkerCronSecret();

  checks.openai = await runCheck(async () => {
    const settings = await getSettings();
    if (!settings.openai_api_key_configured) throw new Error("OpenAI key is not configured in env or settings.");
  }, "degraded");

  checks.googlePlaces = await runCheck(async () => {
    const settings = await getSettings();
    if (!settings.google_places_api_key_configured) throw new Error("Google Places key is not configured in env or settings.");
  }, "degraded");

  const criticalKeys = ["database", "settings", "supabaseAuth", "databaseUrl", "supabaseAdmin", "workerCronSecret"];
  const ready = criticalKeys.every((key) => checks[key]?.status === "ok");
  const degraded = ready && Object.values(checks).some((check) => check.status !== "ok");
  const status: HealthStatus = ready ? (degraded ? "degraded" : "ok") : "error";

  return applyNoStoreHeaders(NextResponse.json(
    {
      status,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      checks,
    },
    { status: ready ? 200 : 503 },
  ));
}

async function runCheck(fn: () => Promise<void>, failureStatus: HealthStatus = "error"): Promise<HealthCheck> {
  try {
    await fn();
    return { status: "ok" };
  } catch (error) {
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

async function checkWorkerCronSecret(): Promise<HealthCheck> {
  if (getConfiguredWorkerCronSecrets().length > 0) return { status: "ok" };
  if (!process.env.DATABASE_URL?.trim()) {
    return { status: "error", message: "Missing worker cron secret env and DATABASE_URL is unavailable for Supabase Vault fallback." };
  }

  return runCheck(async () => {
    const db = await getDb();
    const row = await db.prepare(
      "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ? LIMIT 1",
    ).get<{ decrypted_secret?: string | null }>("worker_cron_secret");
    if (!row?.decrypted_secret?.trim()) throw new Error("worker_cron_secret is not configured in Supabase Vault.");
  });
}
