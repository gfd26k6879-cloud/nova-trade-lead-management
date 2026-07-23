import "server-only";

import { createHash } from "node:crypto";

import type { AppRole } from "@/lib/permissions";
import { createAuditLog } from "@/lib/db/queries";
import { getRuntimeLogContext } from "@/lib/runtime-log-context";

export type OperationalLogCategory = "auth" | "user" | "lead" | "server" | "worker" | "build";
export type OperationalLogSeverity = "info" | "warn" | "error";

export interface OperationalLogEvent {
  action: string;
  category: OperationalLogCategory;
  severity?: OperationalLogSeverity;
  entityType?: string;
  entityId?: string | null;
  actor?: { userId?: string | null; email?: string | null; role?: AppRole | null } | null;
  metadata?: Record<string, unknown>;
  persist?: boolean;
}

export async function recordOperationalEvent(event: OperationalLogEvent): Promise<void> {
  const severity = event.severity ?? "info";
  const metadata = redactSensitiveMetadata({
    category: event.category,
    severity,
    runtime: getRuntimeLogContext(),
    ...(event.metadata ?? {}),
  });

  const payload = {
    action: event.action,
    category: event.category,
    severity,
    entityType: event.entityType ?? event.category,
    entityId: event.entityId ?? null,
    actorUserId: event.actor?.userId ?? null,
    actorEmail: event.actor?.email ? fingerprintEmail(event.actor.email) : null,
    metadata: sanitizeForConsole(metadata),
  };

  const writer = severity === "error" ? console.error : severity === "warn" ? console.warn : console.info;
  writer("operational_event", payload);

  if (event.persist === false) return;

  try {
    const auditOptions = "actor" in event ? { actor: event.actor ?? null } : {};
    await createAuditLog(
      event.action,
      event.entityType ?? event.category,
      event.entityId ?? undefined,
      metadata,
      auditOptions,
    );
  } catch (error) {
    console.warn("operational_event_persist_failed", {
      action: event.action,
      category: event.category,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function buildErrorMetadata(error: unknown): Record<string, unknown> {
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}

function redactSensitiveMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [key, redactSensitiveValue(key, value)]),
  );
}

function redactSensitiveValue(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (/password|token|secret|api[_-]?key|cookie|authorization/i.test(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => redactSensitiveValue(key, item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => [
        nestedKey,
        redactSensitiveValue(nestedKey, nestedValue),
      ]),
    );
  }
  return value;
}

function sanitizeForConsole(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeForConsole);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
      if (/email/i.test(key) && typeof nested === "string") {
        return [key, fingerprintEmail(nested)];
      }
      return [key, sanitizeForConsole(nested)];
    }),
  );
}

function fingerprintEmail(email: string): { domain: string | null; hash: string } {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.includes("@") ? normalized.split("@").pop() || null : null;
  return {
    domain,
    hash: createHash("sha256").update(normalized).digest("hex").slice(0, 16),
  };
}
