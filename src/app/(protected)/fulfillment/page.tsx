import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import {
  ensureDbReady,
  getAdminFulfillmentSummary,
  getAdminRequests,
  type AdminFulfillmentSummary,
  type AdminRequest,
  type AdminRequestStatus,
  type AdminRequestType,
} from "@/lib/db/queries";
import { PageShell } from "@/components/page-shell";
import { startRouteTiming } from "@/lib/route-timing";
import { FulfillmentClient } from "./fulfillment-client";

export const metadata: Metadata = { title: "Fulfillment | NoSite Leads" };

interface Props {
  searchParams: Promise<{
    type?: string;
    status?: string;
  }>;
}

export default async function FulfillmentPage({ searchParams }: Props) {
  const logRouteTiming = startRouteTiming("/fulfillment");
  await requirePermission("admin_request:manage");
  const params = await searchParams;
  const requestType = params.type === "website_request" || params.type === "quote_request" ? params.type as AdminRequestType : undefined;
  const status: AdminRequestStatus | "open" | "all" = isAdminRequestStatus(params.status) ? params.status : params.status === "all" ? "all" : "open";
  let summary: AdminFulfillmentSummary;
  let requests: AdminRequest[];
  try {
    [summary, requests] = await withDbStatementTimeout(10_000, async () => {
      await ensureDbReady();
      return Promise.all([
        getAdminFulfillmentSummary(),
        getAdminRequests({ requestType, status, limit: 100 }),
      ]);
    });
    logRouteTiming(200);
  } catch (error) {
    const reason = routeFailureReason(error);
    logRouteTiming(503, { reason });
    return (
      <PageShell
        title="Fulfillment"
        description="Website and quote requests sent to Steve from claimed leads."
        stats={[
          { label: "Open", value: "0" },
          { label: "Website", value: "0" },
          { label: "Quotes", value: "0" },
          { label: "Waiting", value: "0" },
          { label: "Overdue", value: "0" },
          { label: "New", value: "0" },
        ]}
      >
        <section className="glass rounded-2xl p-6">
          <p className="section-label">Fulfillment is taking too long to load.</p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Request data hit a bounded database read. Retry in a moment; no request data was modified.
          </p>
          <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>Diagnostic: {reason}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/fulfillment" className="btn-primary text-sm">Retry Fulfillment</Link>
            <Link href="/dashboard" className="btn-glass text-sm">Open Dashboard</Link>
          </div>
        </section>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Fulfillment"
      description="Website and quote requests sent to Steve from claimed leads."
      stats={[
        { label: "Open", value: String(summary.openTotal) },
        { label: "Website", value: String(summary.openWebsiteRequests) },
        { label: "Quotes", value: String(summary.openQuoteRequests) },
        { label: "Waiting", value: String(summary.waitingOnResearcher) },
        { label: "Overdue", value: String(summary.overdueRequests) },
        { label: "New", value: String(summary.newRequests) },
      ]}
    >
      <FulfillmentClient initialRequests={requests} activeType={requestType ?? "all"} activeStatus={status} />
    </PageShell>
  );
}

function routeFailureReason(error: unknown): string {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "fulfillment_load_error";
}

function isAdminRequestStatus(value: string | undefined): value is AdminRequestStatus {
  return value === "new"
    || value === "seen"
    || value === "in_progress"
    || value === "waiting_on_researcher"
    || value === "done"
    || value === "cancelled";
}
