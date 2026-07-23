import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, getStatisticsSummary, type StatisticsSummary } from "@/lib/db/queries";
import { PageShell } from "@/components/page-shell";
import { startRouteTiming } from "@/lib/route-timing";
import { StatisticsClient } from "./statistics-client";

export const metadata: Metadata = { title: "Statistics | Nova Trade Lead Management" };

interface Props {
  searchParams: Promise<{
    range?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function StatisticsPage({ searchParams }: Props) {
  const logRouteTiming = startRouteTiming("/statistics");
  await requirePermission("crawl:manage");
  const params = await searchParams;
  let summary: StatisticsSummary;
  try {
    summary = await withDbStatementTimeout(10_000, async () => {
      await ensureDbReady();
      return getStatisticsSummary({
        range: params.range,
        from: params.from,
        to: params.to,
      });
    });
    logRouteTiming(200);
  } catch (error) {
    const reason = routeFailureReason(error);
    logRouteTiming(503, { reason });
    return <StatisticsUnavailable reason={reason} />;
  }

  return <StatisticsClient summary={summary} />;
}

function routeFailureReason(error: unknown): string {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "statistics_load_error";
}

function StatisticsUnavailable({ reason }: { reason: string }) {
  return (
    <PageShell
      title="Statistics"
      description="Lead quality, funnel performance, business types, data coverage, and crawl economics."
      stats={[
        { label: "Range", value: "Unavailable" },
        { label: "Discovered", value: "0" },
        { label: "Qualified", value: "0" },
        { label: "Pipeline", value: "$0" },
      ]}
    >
      <section className="glass rounded-2xl p-6">
        <p className="section-label">Statistics are taking too long to load.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          Analytics reads are bounded so this page does not hang during database pressure.
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>Diagnostic: {reason}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/statistics" className="btn-primary text-sm">Retry Statistics</Link>
          <Link href="/dashboard" className="btn-glass text-sm">Open Dashboard</Link>
        </div>
      </section>
    </PageShell>
  );
}
