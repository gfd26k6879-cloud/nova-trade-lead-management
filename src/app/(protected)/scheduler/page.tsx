import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { getSchedulerOperationsAction } from "@/lib/crawl/actions";
import { SchedulerClient } from "./scheduler-client";

export const metadata: Metadata = { title: "Scheduler | NoSite Leads" };

export default async function SchedulerPage() {
  await requirePermission("crawl:manage");
  const operations = await getSchedulerOperationsAction();
  return <SchedulerClient initialOperations={operations} />;
}
