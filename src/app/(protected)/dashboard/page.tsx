import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getDashboardStatsAction } from "@/lib/crawl/actions";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Dashboard | NoSite Leads" };

export default async function DashboardPage() {
  await requirePermission("crawl:manage");
  const stats = await getDashboardStatsAction();
  return <DashboardClient initialStats={stats} />;
}
