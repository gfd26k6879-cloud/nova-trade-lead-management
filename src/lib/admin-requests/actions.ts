"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth";
import {
  createAdminRequest as dbCreateAdminRequest,
  createAuditLog,
  ensureDbReady,
  getLeadById,
  updateAdminRequestStatus as dbUpdateAdminRequestStatus,
  type AdminRequestStatus,
  type AdminRequestType,
} from "@/lib/db/queries";

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

export async function createAdminRequestAction(leadId: string, input: unknown) {
  const session = await requirePermission("admin_request:create");
  await ensureDbReady();
  const parsed = createAdminRequestSchema.safeParse(input);
  if (!parsed.success) return { error: "Please choose website or quote and add a short summary." };

  const lead = await getLeadById(leadId);
  if (!lead) return { error: "Lead not found." };
  if (session.role !== "admin") {
    if (!lead.assigned_to_user_id) return { error: "Claim this lead before sending it to Steve." };
    if (lead.assigned_to_user_id !== session.userId) return { error: `Taken by ${leadOwnerLabel(lead)}.` };
  }

  const requestType = parsed.data.requestType as AdminRequestType;
  const result = await dbCreateAdminRequest({
    leadId,
    createdByUserId: session.userId,
    createdByEmail: session.email,
    assignedAdminUserId: session.role === "admin" ? session.userId : null,
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
}

export async function updateAdminRequestStatusAction(requestId: string, status: AdminRequestStatus) {
  await requirePermission("admin_request:manage");
  await ensureDbReady();
  const parsed = updateAdminRequestStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid request status." };

  const request = await dbUpdateAdminRequestStatus(requestId, parsed.data);
  if (!request) return { error: "Admin request not found." };
  await createAuditLog("admin_request_status_updated", "admin_request", requestId, { status: parsed.data, leadId: request.lead_id });
  revalidateAdminRequestViews(request.lead_id);
  return { success: true, request };
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
