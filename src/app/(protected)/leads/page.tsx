import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantSession, requirePermission } from "@/lib/auth";
import { withTenantDbContext } from "@/lib/db";
import { ensureDbReady, getBusinessTypeCounts, getKanbanLeads, getLeads, getScoreBandThresholds, type LeadFilters } from "@/lib/db/queries";
import { constrainLeadFiltersForSession, shouldRedirectResearcherLeadList } from "@/lib/lead-access";
import { parseMinReviewsFilter } from "@/lib/lead-filter-parsing";
import { getTenantPermissionDecision } from "@/lib/permissions";
import { assertTenantPermission } from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";
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
  const params = await searchParams;

  if (shouldRedirectResearcherLeadList(session, params)) {
    redirect("/leads?assigned=me");
  }

  if (!tenantSession || tenantSession.userId !== session.userId || tenantSession.workspaceId !== null) {
    return <LeadsUnavailable />;
  }

  try {
    await assertTenantPermission(tenantSession, "account:read", { action: "lead.list.page" });
  } catch {
    return <LeadsUnavailable />;
  }

  const exportScope = { tenantId: tenantSession.tenantId, workspaceId: null };
  const canExport = getTenantPermissionDecision(tenantSession.role, "data:export").allowed;

  const isKanban = params.view === "kanban";
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
  const loaded = await runWithTenantContext(tenantSession, `lead-list-page:${randomUUID()}`, () =>
    withTenantDbContext(async () => {
      await ensureDbReady();
      const scoreThresholds = await getScoreBandThresholds();
      const businessTypeCounts = await getBusinessTypeCounts(filters);
      if (isKanban) {
        const result = await getKanbanLeads(filters);
        return { kind: "kanban" as const, scoreThresholds, businessTypeCounts, result };
      }
      const result = await getLeads(filters);
      return { kind: "list" as const, scoreThresholds, businessTypeCounts, result };
    }));

  if (loaded.kind === "kanban") {
    return (
      <KanbanClient
        leads={loaded.result.leads}
        total={loaded.result.total}
        displayLimit={KANBAN_PAGE_SIZE}
        scoreThresholds={loaded.scoreThresholds}
        businessTypeCounts={loaded.businessTypeCounts}
        canExport={canExport}
        exportScope={exportScope}
        canClose={session.role === "admin"}
      />
    );
  }

  return (
    <LeadsClient
      leads={loaded.result.leads}
      total={loaded.result.total}
      filters={filters}
      scoreThresholds={loaded.scoreThresholds}
      businessTypeCounts={loaded.businessTypeCounts}
      canExport={canExport}
      exportScope={exportScope}
      canClose={session.role === "admin"}
      canArchive={session.role === "admin"}
    />
  );
}

function LeadsUnavailable() {
  return (
    <section className="glass rounded-3xl p-8" role="alert">
      <div className="max-w-2xl">
        <p className="section-label">Leads temporarily unavailable</p>
        <h1 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          The lead list could not be loaded.
        </h1>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
          No lead data was requested. Reload the workspace to try again.
        </p>
      </div>
    </section>
  );
}
