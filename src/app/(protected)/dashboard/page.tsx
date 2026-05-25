import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getDashboardStatsAction } from "@/lib/crawl/actions";
import { ensureDbReady, getAdminFulfillmentSummary, getStatisticsSummary, getTeamBoardSummary } from "@/lib/db/queries";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Revenue Dashboard | NoSite Leads" };

export default async function DashboardPage() {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const [stats, teamSummary, weeklyStats, fulfillmentSummary] = await Promise.all([
    getDashboardStatsAction(),
    getTeamBoardSummary(),
    getStatisticsSummary({ range: "7d" }),
    getAdminFulfillmentSummary(),
  ]);
  return <DashboardClient initialStats={stats} teamSummary={teamSummary} weeklyStats={weeklyStats} fulfillmentSummary={fulfillmentSummary} />;
}
