import type { Metadata } from "next";
import { ensureDbReady, getBusinessTypeCounts, getKanbanLeads, getLeads, getScoreBandThresholds } from "@/lib/db/queries";
import { LeadsClient } from "./leads-client";
import { KanbanClient } from "./kanban-client";

export const metadata: Metadata = { title: "Leads | NoSite Leads" };
const KANBAN_PAGE_SIZE = 100;

interface Props {
  searchParams: Promise<{
    search?: string;
    status?: string;
    websiteStatus?: string;
    enrichment?: string;
    minReviews?: string;
    minRating?: string;
    minScore?: string;
    category?: string;
    businessType?: string;
    sortBy?: string;
    sortDir?: string;
    page?: string;
    view?: string;
  }>;
}

export default async function LeadsPage({ searchParams }: Props) {
  await ensureDbReady();
  const params = await searchParams;

  const isKanban = params.view === "kanban";
  const scoreThresholds = await getScoreBandThresholds();

  const filters = {
    search: params.search,
    status: isKanban ? undefined : params.status,
    includeExcluded: isKanban,
    websiteStatus: params.websiteStatus,
    enrichment: params.enrichment,
    minReviews: params.minReviews ? parseInt(params.minReviews) : undefined,
    minRating: params.minRating ? parseFloat(params.minRating) : undefined,
    minScore: params.minScore ? parseFloat(params.minScore) : undefined,
    category: params.category,
    businessType: params.businessType,
    sortBy: params.sortBy ?? "score",
    sortDir: (params.sortDir ?? "desc") as "asc" | "desc",
    page: params.page ? parseInt(params.page) : 1,
    pageSize: isKanban ? KANBAN_PAGE_SIZE : 25,
  };
  const businessTypeCounts = await getBusinessTypeCounts();

  if (isKanban) {
    const { leads, total } = await getKanbanLeads(filters);
    return (
      <KanbanClient
        leads={leads}
        total={total}
        displayLimit={KANBAN_PAGE_SIZE}
        scoreThresholds={scoreThresholds}
        businessTypeCounts={businessTypeCounts}
      />
    );
  }

  const { leads, total } = await getLeads(filters);

  return (
    <LeadsClient
      leads={leads}
      total={total}
      filters={filters}
      scoreThresholds={scoreThresholds}
      businessTypeCounts={businessTypeCounts}
    />
  );
}
