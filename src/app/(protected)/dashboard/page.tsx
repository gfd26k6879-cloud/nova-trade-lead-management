import type { Metadata } from "next";
import { getDashboardStatsAction } from "@/lib/crawl/actions";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Dashboard | NoSite Leads" };

export default async function DashboardPage() {
  const stats = await getDashboardStatsAction();
  return <DashboardClient initialStats={stats} />;
}
