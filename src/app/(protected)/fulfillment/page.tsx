import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ensureDbReady, getAdminFulfillmentSummary, getAdminRequests, type AdminRequestStatus, type AdminRequestType } from "@/lib/db/queries";
import { PageShell } from "@/components/page-shell";
import { FulfillmentClient } from "./fulfillment-client";

export const metadata: Metadata = { title: "Fulfillment | NoSite Leads" };

interface Props {
  searchParams: Promise<{
    type?: string;
    status?: string;
  }>;
}

export default async function FulfillmentPage({ searchParams }: Props) {
  await requirePermission("admin_request:manage");
  await ensureDbReady();
  const params = await searchParams;
  const requestType = params.type === "website_request" || params.type === "quote_request" ? params.type as AdminRequestType : undefined;
  const status: AdminRequestStatus | "open" | "all" = isAdminRequestStatus(params.status) ? params.status : params.status === "all" ? "all" : "open";
  const [summary, requests] = await Promise.all([
    getAdminFulfillmentSummary(),
    getAdminRequests({ requestType, status, limit: 100 }),
  ]);

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

function isAdminRequestStatus(value: string | undefined): value is AdminRequestStatus {
  return value === "new"
    || value === "seen"
    || value === "in_progress"
    || value === "waiting_on_researcher"
    || value === "done"
    || value === "cancelled";
}
