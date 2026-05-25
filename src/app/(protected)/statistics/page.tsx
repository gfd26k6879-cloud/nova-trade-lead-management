import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ensureDbReady, getStatisticsSummary } from "@/lib/db/queries";
import { StatisticsClient } from "./statistics-client";

export const metadata: Metadata = { title: "Statistics | NoSite Leads" };

interface Props {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function StatisticsPage({ searchParams }: Props) {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const params = await searchParams;
  const summary = await getStatisticsSummary({
    range: params.range,
    from: params.from,
    to: params.to,
  });

  return <StatisticsClient summary={summary} />;
}
