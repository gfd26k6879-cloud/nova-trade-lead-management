import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getSchedulerOperationsAction } from "@/lib/crawl/actions";
import { buildSchedulerOperationsFallback } from "@/lib/db/queries";
import { startRouteTiming } from "@/lib/route-timing";
import { SchedulerClient } from "./scheduler-client";

export const metadata: Metadata = { title: "Scheduler | NoSite Leads" };

export default async function SchedulerPage() {
  const logRouteTiming = startRouteTiming("/scheduler");
  await requirePermission("crawl:manage");
  let operations: Awaited<ReturnType<typeof getSchedulerOperationsAction>>;
  let status = 200;
  let reason: string | null = null;
  try {
    operations = await withRouteDeadline(getSchedulerOperationsAction(), 12_000);
  } catch (error) {
    status = 503;
    reason = error instanceof RouteDeadlineError ? "route_deadline_timeout" : "scheduler_load_error";
    operations = buildSchedulerOperationsFallback(reason);
  }
  const degraded = operations.activeDiscovery.status === "unavailable";
  logRouteTiming(degraded ? 503 : status, degraded ? { reason: operations.activeDiscovery.lastError ?? reason ?? "scheduler_load_error" } : undefined);
  return <SchedulerClient initialOperations={operations} />;
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
