import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { requirePermission, UnauthorizedError } from "@/lib/auth";
import { getDb } from "@/lib/db/index";
import type { Permission } from "@/lib/permissions";

const WORKER_SECRET_ENV_KEYS = ["WORKER_CRON_SECRET", "CRON_SECRET"] as const;

export type InternalWorkerAuthResult = { source: "cron" | "session" };

export function getConfiguredWorkerCronSecrets(): string[] {
  return WORKER_SECRET_ENV_KEYS.map((key) => process.env[key]?.trim()).filter((secret): secret is string => Boolean(secret));
}

export function hasValidWorkerCronSecret(request: NextRequest, secrets = getConfiguredWorkerCronSecrets()): boolean {
  if (secrets.length === 0) return false;

  const header = request.headers.get("authorization") ?? "";
  const token = parseBearerToken(header);
  if (!token) return false;

  return secrets.some((secret) => timingSafeStringEqual(token, secret));
}

export async function authorizeInternalWorkerRequest(
  request: NextRequest,
  fallbackPermission: Permission,
): Promise<InternalWorkerAuthResult> {
  if (hasValidWorkerCronSecret(request) || await hasValidVaultWorkerCronSecret(request)) {
    return { source: "cron" };
  }

  await requirePermission(fallbackPermission);
  return { source: "session" };
}

async function hasValidVaultWorkerCronSecret(request: NextRequest): Promise<boolean> {
  const token = parseBearerToken(request.headers.get("authorization") ?? "");
  if (!token || !process.env.DATABASE_URL?.trim()) return false;

  try {
    const db = await getDb();
    const row = await db.prepare(
      "SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = ? LIMIT 1",
    ).get<{ decrypted_secret: string | null }>("worker_cron_secret");
    const secret = row?.decrypted_secret?.trim();
    return Boolean(secret && timingSafeStringEqual(token, secret));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UnauthorizedError(`Supabase Vault worker_cron_secret could not be verified: ${message}`);
  }
}

function parseBearerToken(header: string): string | null {
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function timingSafeStringEqual(value: string, expected: string): boolean {
  const valueBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  if (valueBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(valueBuffer, expectedBuffer);
}
