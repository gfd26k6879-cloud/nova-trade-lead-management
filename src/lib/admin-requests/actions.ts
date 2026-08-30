"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { TenantSessionSelector } from "@/lib/app-users";
import { requirePermission, type AppSession, type TenantSession } from "@/lib/auth";
import { withTenantDbContext } from "@/lib/db";
import { canReadLeadForSession } from "@/lib/lead-access";
import {
  createAdminRequest as dbCreateAdminRequest,
  createAuditLog,
  ensureDbReady,
  getLeadById,
  updateAdminRequestStatus as dbUpdateAdminRequestStatus,
  type AdminRequestStatus,
  type AdminRequestType,
} from "@/lib/db/queries";
import { requireTenantPermission, TenantAuthorizationError } from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";

const createAdminRequestSchema = z.object({
  requestType: z.enum(["website_request", "quote_request"]),
  priority: z.enum(["urgent", "normal", "low"]).default("normal"),
  summary: z.string().trim().max(1200).optional(),
  contactPersonName: z.string().trim().max(160).optional(),
  budgetHint: z.string().trim().max(160).optional(),
  dueAt: z.string().trim().max(80).optional(),
  nextStep: z.string().trim().max(500).optional(),
});

const updateAdminRequestStatusSchema = z.enum(["new", "seen", "in_progress", "waiting_on_researcher", "done", "cancelled"]);

export async function createAdminRequestAction(
  leadId: string,
  input: unknown,
  selector: TenantSessionSelector = {},
) {
  const { tenantSession, legacySession } = await requireBoundAdminRequestActor(
    selector,
    "admin_request:create",
    "admin_request.create",
  );
  const parsed = createAdminRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "Please choose website or quote and add a short summary." };

  return runWithTenantContext(tenantSession, `admin-request-create:${randomUUID()}`, () =>
    withTenantDbContext(async () => {
      await ensureDbReady();
      const lead = await getLeadById(leadId);
      if (!leadBelongsToTenantScope(lead, tenantSession)) return { error: "Lead not found." };
      if (legacySession.role !== "admin") {
        if (!await canReadLeadForSession(legacySession, lead)) return { error: "Lead not found." };
        if (!lead.assigned_to_user_id) return { error: "Claim this lead before sending it to Steve." };
        if (lead.assigned_to_user_id !== legacySession.userId) return { error: `Taken by ${leadOwnerLabel(lead)}.` };
      }

      const requestType = parsed.data.requestType as AdminRequestType;
      const result = await dbCreateAdminRequest({
        leadId,
        createdByUserId: legacySession.userId,
        createdByEmail: legacySession.email,
        assignedAdminUserId: legacySession.role === "admin" ? legacySession.userId : null,
        requestType,
        priority: parsed.data.priority,
        summary: normalizeOptionalText(parsed.data.summary) ?? defaultSummary(requestType, lead.name),
        contactPersonName: normalizeOptionalText(parsed.data.contactPersonName),
        budgetHint: normalizeOptionalText(parsed.data.budgetHint),
        dueAt: normalizeOptionalText(parsed.data.dueAt),
        nextStep: normalizeOptionalText(parsed.data.nextStep) ?? defaultNextStep(requestType),
      });

      await createAuditLog(result.alreadyExists ? "admin_request_duplicate_open" : "admin_request_created", "lead", leadId, {
        requestId: result.request.id,
        requestType,
        alreadyExists: result.alreadyExists,
      });
      revalidateAdminRequestViews(leadId);
      return { success: true, request: result.request, alreadyExists: result.alreadyExists };
    }));
}

export async function updateAdminRequestStatusAction(
  requestId: string,
  status: AdminRequestStatus,
  selector: TenantSessionSelector = {},
) {
  const { tenantSession } = await requireBoundAdminRequestActor(
    selector,
    "admin_request:manage",
    "admin_request.status.update",
  );
  const parsed = updateAdminRequestStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid request status." };

  return runWithTenantContext(tenantSession, `admin-request-status:${randomUUID()}`, () =>
    withTenantDbContext(async () => {
      await ensureDbReady();
      const request = await dbUpdateAdminRequestStatus(requestId, parsed.data);
      if (!request) return { error: "Admin request not found." };
      await createAuditLog("admin_request_status_updated", "admin_request", requestId, { status: parsed.data, leadId: request.lead_id });
      revalidateAdminRequestViews(request.lead_id);
      return { success: true, request };
    }));
}

async function requireBoundAdminRequestActor(
  selector: TenantSessionSelector,
  legacyPermission: "admin_request:create" | "admin_request:manage",
  action: string,
): Promise<{ tenantSession: TenantSession; legacySession: AppSession }> {
  const tenantSession = await requireTenantPermission(selector, "workspace:read", { action });
  if (tenantSession.workspaceId !== null) {
    throw new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID");
  }
  const legacySession = await requirePermission(legacyPermission);
  if (legacySession.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }
  return { tenantSession, legacySession };
}

function leadBelongsToTenantScope(
  lead: Awaited<ReturnType<typeof getLeadById>>,
  tenantSession: TenantSession,
): lead is NonNullable<Awaited<ReturnType<typeof getLeadById>>> {
  if (!lead) return false;
  const scope = lead as typeof lead & { tenant_id?: unknown; workspace_id?: unknown };
  if (scope.tenant_id !== tenantSession.tenantId) return false;
  if (scope.workspace_id !== null && typeof scope.workspace_id !== "string") return false;
  return tenantSession.workspaceId === null
    || scope.workspace_id === null
    || scope.workspace_id === tenantSession.workspaceId;
}

function revalidateAdminRequestViews(leadId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/fulfillment");
  revalidatePath("/team");
  revalidatePath("/queue");
  revalidatePath(`/leads/${leadId}`);
}

function leadOwnerLabel(lead: { assigned_user_display_name?: string | null; assigned_user_email?: string | null; assigned_to_user_id?: string | null }): string {
  return lead.assigned_user_display_name || lead.assigned_user_email || lead.assigned_to_user_id || "another researcher";
}

function normalizeOptionalText(value: string | undefined | null): string | null {
  const clean = (value ?? "").trim();
  return clean.length > 0 ? clean : null;
}

function defaultSummary(requestType: AdminRequestType, leadName: string | null): string {
  const name = leadName ?? "This business";
  return requestType === "website_request"
    ? `${name} needs website help.`
    : `${name} requested pricing or a quote.`;
}

function defaultNextStep(requestType: AdminRequestType): string {
  return requestType === "website_request"
    ? "Steve should review the lead and prepare a website/demo direction."
    : "Steve should review the lead and prepare pricing.";
}
