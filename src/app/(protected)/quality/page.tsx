import type { Metadata } from "next";
import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import {
  ensureDbReady,
  getBusinessTypeCounts,
  getLocationCells,
  listLocationMarkets,
  getQualityLeads,
  getQualitySummary,
  type QualityFilters,
} from "@/lib/db/queries";
import { PageShell } from "@/components/page-shell";
import { startRouteTiming } from "@/lib/route-timing";
import { QualityClient } from "./quality-client";

export const metadata: Metadata = { title: "Quality | Nova Trade Lead Management" };

interface Props {
  searchParams: Promise<{
    search?: string;
    qualityBucket?: string;
    businessType?: string;
    recommendedOffer?: string;
    phoneVerificationStatus?: string;
    aiVerificationStatus?: string;
    enrichmentStatus?: string;
    countryCode?: string;
    marketId?: string;
    locationCellId?: string;
    city?: string;
    zip?: string;
    denverOnly?: string;
    page?: string;
  }>;
}

export default async function QualityPage({ searchParams }: Props) {
  const logRouteTiming = startRouteTiming("/quality");
  await requirePermission("crawl:manage");
  const params = await searchParams;
  const filters: QualityFilters = {
    search: params.search,
    qualityBucket: params.qualityBucket,
    businessType: params.businessType,
    recommendedOffer: params.recommendedOffer,
    phoneVerificationStatus: params.phoneVerificationStatus,
    aiVerificationStatus: params.aiVerificationStatus,
    enrichmentStatus: params.enrichmentStatus,
    countryCode: params.countryCode,
    marketId: params.marketId,
    locationCellId: params.locationCellId,
    city: params.city,
    zip: params.zip,
    denverOnly: params.denverOnly === "1",
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 50,
  };

  let loaded: Awaited<ReturnType<typeof loadQualityData>>;
  try {
    loaded = await loadQualityData(filters);
    logRouteTiming(200);
  } catch (error) {
    const reason = routeFailureReason(error);
    logRouteTiming(503, { reason });
    return <QualityUnavailable reason={reason} />;
  }

  return (
    <QualityClient
      summary={loaded.summary}
      leads={loaded.result.leads}
      total={loaded.result.total}
      filters={filters}
      businessTypeCounts={loaded.businessTypeCounts}
      locationMarkets={loaded.locationMarkets}
      locationCells={loaded.locationCells}
    />
  );
}

function loadQualityData(filters: QualityFilters) {
  return withDbStatementTimeout(10_000, async () => {
      await ensureDbReady();
      const [loadedSummary, loadedResult, loadedBusinessTypeCounts] = await Promise.all([
        getQualitySummary(filters),
        getQualityLeads(filters),
        getBusinessTypeCounts(),
      ]);
      const [loadedLocationMarkets, loadedLocationCells] = await Promise.all([
        listLocationMarkets(),
        filters.marketId ? getLocationCells(filters.marketId) : Promise.resolve([]),
      ]);
      return {
        summary: loadedSummary,
        result: loadedResult,
        businessTypeCounts: loadedBusinessTypeCounts,
        locationMarkets: loadedLocationMarkets,
        locationCells: loadedLocationCells,
      };
  });
}

function routeFailureReason(error: unknown): string {
  if (isDbStatementTimeoutError(error)) return "db_statement_timeout";
  if (isTransientDbError(error)) return "transient_db_error";
  return "quality_load_error";
}

function QualityUnavailable({ reason }: { reason: string }) {
  return (
    <PageShell
      title="Lead Quality"
      description="Researcher workspace for the fastest no-website opportunities to call today."
      stats={[
        { label: "Ready to Call", value: "0" },
        { label: "No Website", value: "0" },
        { label: "Broken Sites", value: "0" },
        { label: "Pipeline", value: "$0" },
      ]}
    >
      <section className="glass rounded-2xl p-6">
        <p className="section-label">Quality is taking too long to load.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
          The quality workspace hit a bounded database read. Retry in a moment or use another workspace while the database catches up.
        </p>
        <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>Diagnostic: {reason}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/quality" className="btn-primary text-sm">Retry Quality</Link>
          <Link href="/dashboard" className="btn-glass text-sm">Open Dashboard</Link>
          <Link href="/queue" className="btn-glass text-sm">Open Workbench</Link>
        </div>
      </section>
    </PageShell>
  );
}
