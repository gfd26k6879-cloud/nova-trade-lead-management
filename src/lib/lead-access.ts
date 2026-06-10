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
    assigned: "me",
    assignedToUserId: session.userId,
    includeExcluded: false,
    visibleToUserId: session.userId,
  };
}

export function constrainExploreFiltersForSession(session: LeadAccessSession, filters: LeadFilters): LeadFilters {
  if (session.role === "admin") return filters;

  return {
    ...filters,
    assigned: "unassigned",
    assignedToUserId: undefined,
    includeExcluded: false,
    visibleToUserId: session.userId,
  };
}

export function shouldRedirectResearcherLeadList(session: LeadAccessSession, params: LeadListRouteParams): boolean {
  if (session.role === "admin") return false;
  return params.view === "kanban" || params.assigned !== "me" || Boolean(params.owner);
}

export async function canReadLeadForSession(session: LeadAccessSession, lead: Pick<Lead, "market_id">): Promise<boolean> {
  if (session.role === "admin") return true;
  return userCanAccessMarket(session.userId, lead.market_id);
}
