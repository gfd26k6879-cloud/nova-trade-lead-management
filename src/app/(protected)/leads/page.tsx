import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantSession, requirePermission } from "@/lib/auth";
import { ensureDbReady, getBusinessTypeCounts, getKanbanLeads, getLeads, getScoreBandThresholds, type LeadFilters } from "@/lib/db/queries";
import { constrainLeadFiltersForSession, shouldRedirectResearcherLeadList } from "@/lib/lead-access";
import { parseMinReviewsFilter } from "@/lib/lead-filter-parsing";
import { getTenantPermissionDecision } from "@/lib/permissions";
import { LeadsClient } from "./leads-client";
import { KanbanClient } from "./kanban-client";

export const metadata: Metadata = { title: "Leads | Nova Trade Lead Management" };
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
    assigned?: string;
    owner?: string;
    sortBy?: string;
    sortDir?: string;
    page?: string;
    view?: string;
    archived?: string;
  }>;
}

export default async function LeadsPage({ searchParams }: Props) {
  const session = await requirePermission("view:workspace");
  const tenantSession = await getTenantSession({});
  const exportScope = tenantSession?.userId === session.userId
    ? { tenantId: tenantSession.tenantId, workspaceId: tenantSession.workspaceId }
    : null;
  const canExport = tenantSession?.userId === session.userId &&
    getTenantPermissionDecision(tenantSession.role, "data:export").allowed;
  await ensureDbReady();
  const params = await searchParams;

  if (shouldRedirectResearcherLeadList(session, params)) {
    redirect("/leads?assigned=me");
  }

  const isKanban = params.view === "kanban";
  const scoreThresholds = await getScoreBandThresholds();
  const assignedFilter: "me" | "unassigned" | undefined = params.assigned === "me" || params.assigned === "unassigned" ? params.assigned : undefined;

  const filters: LeadFilters = constrainLeadFiltersForSession(session, {
    search: params.search,
    status: isKanban ? undefined : params.status,
    includeExcluded: isKanban,
    websiteStatus: params.websiteStatus,
    enrichment: params.enrichment,
    minReviews: parseMinReviewsFilter(params.minReviews),
    minRating: params.minRating ? parseFloat(params.minRating) : undefined,
    minScore: params.minScore ? parseFloat(params.minScore) : undefined,
    category: params.category,
    businessType: params.businessType,
    assigned: assignedFilter,
    assignedToUserId: params.assigned === "me" ? session.userId : params.owner,
    archived: params.archived === "archived" || params.archived === "all" ? params.archived : "active",
    sortBy: params.sortBy ?? "score",
    sortDir: (params.sortDir ?? "desc") as "asc" | "desc",
    page: params.page ? parseInt(params.page) : 1,
    pageSize: isKanban ? KANBAN_PAGE_SIZE : 25,
  });
  const businessTypeCounts = await getBusinessTypeCounts(filters);

  if (isKanban) {
    const { leads, total } = await getKanbanLeads(filters);
    return (
      <KanbanClient
        leads={leads}
        total={total}
        displayLimit={KANBAN_PAGE_SIZE}
        scoreThresholds={scoreThresholds}
        businessTypeCounts={businessTypeCounts}
        canExport={canExport}
        exportScope={exportScope}
        canClose={session.role === "admin"}
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
      canExport={canExport}
      exportScope={exportScope}
      canClose={session.role === "admin"}
      canArchive={session.role === "admin"}
    />
  );
}
