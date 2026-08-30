import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { getTenantSession, requirePermission } from "@/lib/auth";
import { getSchedulerOperationsAction } from "@/lib/crawl/actions";
import { withTenantDbContext } from "@/lib/db";
import { buildSchedulerOperationsFallback } from "@/lib/db/queries";
import { startRouteTiming } from "@/lib/route-timing";
import { assertTenantPermission } from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { SchedulerClient } from "./scheduler-client";

export const metadata: Metadata = { title: "Scheduler | Nova Trade Lead Management" };

export default async function SchedulerPage() {
  const logRouteTiming = startRouteTiming("/scheduler");
  const legacySession = await requirePermission("crawl:manage");
  let tenantSession: Awaited<ReturnType<typeof getTenantSession>>;
  try {
    tenantSession = await getTenantSession({});
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <SchedulerUnavailable />;
  }
  if (
    !tenantSession
    || tenantSession.userId !== legacySession.userId
    || tenantSession.workspaceId !== null
  ) {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <SchedulerUnavailable />;
  }

  try {
    await assertTenantPermission(tenantSession, "queue:read", { action: "scheduler.page.read" });
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <SchedulerUnavailable />;
  }

  let operations: Awaited<ReturnType<typeof getSchedulerOperationsAction>>;
  let status = 200;
  let reason: string | null = null;
  try {
    operations = await withRouteDeadline(
      runWithTenantContext(
        tenantSession,
        `scheduler-page:${randomUUID()}`,
        () => withTenantDbContext(() => getSchedulerOperationsAction()),
      ),
      12_000,
    );
  } catch (error) {
    status = 503;
    reason = error instanceof RouteDeadlineError ? "route_deadline_timeout" : "scheduler_load_error";
    operations = buildSchedulerOperationsFallback(reason);
  }
  const degraded = operations.activeDiscovery.status === "unavailable";
  logRouteTiming(degraded ? 503 : status, degraded ? { reason: operations.activeDiscovery.lastError ?? reason ?? "scheduler_load_error" } : undefined);
  return <SchedulerClient initialOperations={operations} />;
}

function SchedulerUnavailable() {
  return (
    <section className="glass rounded-3xl p-8" role="alert">
      <div className="max-w-2xl">
        <p className="section-label">Scheduler temporarily unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Scheduler access could not be established.
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          No worker or queue data was requested. Retry after your tenant access is available.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/scheduler" className="btn-primary text-sm">Retry Scheduler</Link>
          <Link href="/dashboard" className="btn-glass text-sm">Open Dashboard</Link>
        </div>
      </div>
    </section>
  );
}

class RouteDeadlineError extends Error {
  constructor() {
    super("Scheduler route exceeded its internal response deadline.");
  }
}

function withRouteDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new RouteDeadlineError()), timeoutMs);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timeout));
}
