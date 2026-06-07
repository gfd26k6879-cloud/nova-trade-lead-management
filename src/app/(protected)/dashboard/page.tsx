import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import {
  emptyAdminFulfillmentSummary,
  emptyDashboardStats,
  emptyStatisticsSummary,
  emptyTeamBoardSummary,
} from "@/lib/dashboard-fallbacks";
import { startRouteTiming } from "@/lib/route-timing";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Admin Command Center | NoSite Leads" };

export default async function DashboardPage() {
  const logRouteTiming = startRouteTiming("/dashboard");
  await requirePermission("crawl:manage");
  logRouteTiming(200, { mode: "fast_shell" });

  return (
    <DashboardClient
      initialStats={emptyDashboardStats("Dashboard data is loading.")}
      teamSummary={emptyTeamBoardSummary()}
      weeklyStats={emptyStatisticsSummary()}
      fulfillmentSummary={emptyAdminFulfillmentSummary()}
    />
  );
}
