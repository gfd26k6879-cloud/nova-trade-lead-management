import type { Metadata } from "next";
import { getTenantSession, requirePermission } from "@/lib/auth";
import {
  emptyAdminFulfillmentSummary,
  emptyDashboardStats,
  emptyStatisticsSummary,
  emptyTeamBoardSummary,
} from "@/lib/dashboard-fallbacks";
import { startRouteTiming } from "@/lib/route-timing";
import { assertTenantPermission } from "@/lib/tenancy/authorize";
import { listCrawlWorkspaceOptions } from "@/lib/crawl/workspace-scope";
import type { CrawlWorkspaceOption } from "@/lib/crawl/workspace-scope";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Admin Command Center | Nova Trade Lead Management" };

export default async function DashboardPage() {
  const logRouteTiming = startRouteTiming("/dashboard");
  const legacySession = await requirePermission("crawl:manage");
  let tenantSession: Awaited<ReturnType<typeof getTenantSession>>;
  try {
    tenantSession = await getTenantSession({});
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <DashboardUnavailable />;
  }

  if (
    !tenantSession
    || tenantSession.userId !== legacySession.userId
    || tenantSession.workspaceId !== null
  ) {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <DashboardUnavailable />;
  }

  try {
    await assertTenantPermission(tenantSession, "report:read", { action: "dashboard.page" });
  } catch {
    logRouteTiming(403, { reason: "tenant_scope_unavailable" });
    return <DashboardUnavailable />;
  }

  let crawlWorkspaces: CrawlWorkspaceOption[] = [];
  try {
    crawlWorkspaces = await listCrawlWorkspaceOptions(tenantSession);
  } catch {
    crawlWorkspaces = [];
  }

  logRouteTiming(200, { mode: "fast_shell" });

  return (
    <DashboardClient
      initialStats={emptyDashboardStats("Dashboard data is loading.")}
      teamSummary={emptyTeamBoardSummary()}
      weeklyStats={emptyStatisticsSummary()}
      fulfillmentSummary={emptyAdminFulfillmentSummary()}
      crawlWorkspaces={crawlWorkspaces}
    />
  );
}

function DashboardUnavailable() {
  return (
    <section className="glass rounded-3xl p-8" role="alert">
      <div className="max-w-2xl">
        <p className="section-label">Dashboard temporarily unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          The dashboard could not be loaded.
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          No dashboard data was requested. Reload the workspace to try again.
        </p>
      </div>
    </section>
  );
}
