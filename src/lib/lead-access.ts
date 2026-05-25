import type { Lead, LeadFilters } from "@/lib/db/queries";
import type { AppRole } from "@/lib/permissions";

export interface LeadAccessSession {
  userId: string;
  role: AppRole;
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
  };
}

export function shouldRedirectResearcherLeadList(session: LeadAccessSession, params: LeadListRouteParams): boolean {
  if (session.role === "admin") return false;
  return params.view === "kanban" || params.assigned !== "me" || Boolean(params.owner);
}

export function canReadLeadForSession(session: LeadAccessSession, lead: Pick<Lead, "assigned_to_user_id">): boolean {
  if (session.role === "admin") return true;
  return !lead.assigned_to_user_id || lead.assigned_to_user_id === session.userId;
}
