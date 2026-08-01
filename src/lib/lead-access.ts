import type { Lead, LeadFilters } from "@/lib/db/queries";
import { userCanAccessMarket } from "@/lib/db/queries";

export interface LeadAccessSession {
  userId: string;
  role: string;
}

export interface LeadListRouteParams {
  assigned?: string;
  owner?: string;
  view?: string;
}

export function constrainLeadFiltersForSession(session: LeadAccessSession, filters: LeadFilters): LeadFilters {
  if (session.role === "admin") return filters;

  return {
    ...filters,
    archived: "active",
    assigned: "me",
    assignedToUserId: session.userId,
    includeExcluded: false,
    status: filters.status === "excluded" ? undefined : filters.status,
    visibleToUserId: session.userId,
  };
}

export function constrainExploreFiltersForSession(session: LeadAccessSession, filters: LeadFilters): LeadFilters {
  if (session.role === "admin") return filters;

  return {
    ...filters,
    archived: "active",
    assigned: "unassigned",
    assignedToUserId: undefined,
    includeExcluded: false,
    status: filters.status === "excluded" ? undefined : filters.status,
    visibleToUserId: session.userId,
  };
}

export function shouldRedirectResearcherLeadList(session: LeadAccessSession, params: LeadListRouteParams): boolean {
  if (session.role === "admin") return false;
  return params.view === "kanban" || params.assigned !== "me" || Boolean(params.owner);
}

type ResearcherAccessibleLead = Pick<
  Lead,
  "archived_at" | "assigned_to_user_id" | "is_excluded" | "market_id"
>;

function isActiveNonexcludedLead(lead: Pick<ResearcherAccessibleLead, "archived_at" | "is_excluded">): boolean {
  return lead.archived_at == null && !lead.is_excluded;
}

export async function canReadLeadForSession(
  session: LeadAccessSession,
  lead: ResearcherAccessibleLead,
): Promise<boolean> {
  if (session.role === "admin") return true;
  if (!isActiveNonexcludedLead(lead) || lead.assigned_to_user_id !== session.userId) return false;
  return userCanAccessMarket(session.userId, lead.market_id);
}

export async function canClaimLeadForSession(
  session: LeadAccessSession,
  lead: ResearcherAccessibleLead,
): Promise<boolean> {
  if (session.role === "admin") return true;
  if (!isActiveNonexcludedLead(lead) || Boolean(lead.assigned_to_user_id)) return false;
  return userCanAccessMarket(session.userId, lead.market_id);
}
