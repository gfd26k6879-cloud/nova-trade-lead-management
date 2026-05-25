import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import {
  ensureDbReady,
  getBusinessTypeCounts,
  getQualityLeads,
  getQualitySummary,
  type QualityFilters,
} from "@/lib/db/queries";
import { QualityClient } from "./quality-client";

export const metadata: Metadata = { title: "Quality | NoSite Leads" };

interface Props {
  searchParams: Promise<{
    search?: string;
    qualityBucket?: string;
    businessType?: string;
    recommendedOffer?: string;
    phoneVerificationStatus?: string;
    aiVerificationStatus?: string;
    denverOnly?: string;
    page?: string;
  }>;
}

export default async function QualityPage({ searchParams }: Props) {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const params = await searchParams;
  const filters: QualityFilters = {
    search: params.search,
    qualityBucket: params.qualityBucket,
    businessType: params.businessType,
    recommendedOffer: params.recommendedOffer,
    phoneVerificationStatus: params.phoneVerificationStatus,
    aiVerificationStatus: params.aiVerificationStatus,
    denverOnly: params.denverOnly !== "0",
    page: params.page ? parseInt(params.page, 10) : 1,
    pageSize: 50,
  };

  const [summary, result, businessTypeCounts] = await Promise.all([
    getQualitySummary({ denverOnly: filters.denverOnly, businessType: filters.businessType }),
    getQualityLeads(filters),
    getBusinessTypeCounts(),
  ]);

  return (
    <QualityClient
      summary={summary}
      leads={result.leads}
      total={result.total}
      filters={filters}
      businessTypeCounts={businessTypeCounts}
    />
  );
}
