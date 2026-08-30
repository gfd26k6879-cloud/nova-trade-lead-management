"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  ensureDbReady,
  getLeads as queryLeads,
  getLeadById as queryLeadById,
  updateLeadStatus as dbUpdateStatus,
  updateLeadNotes as dbUpdateNotes,
  updateLeadFacts as dbUpdateLeadFacts,
  updateLeadReminder as dbUpdateReminder,
  createLeadNote as dbCreateLeadNote,
  getLeadNotes as dbGetLeadNotes,
  assignLeadToUser as dbAssignLeadToUser,
  claimLeadForUser as dbClaimLeadForUser,
  setLeadExclusion as dbSetLeadExclusion,
  clearLeadExclusion as dbClearLeadExclusion,
  archiveLead as dbArchiveLead,
  restoreArchivedLead as dbRestoreArchivedLead,
  bulkArchiveLeads as dbBulkArchiveLeads,
  bulkRestoreArchivedLeads as dbBulkRestoreArchivedLeads,
  createManualLead as dbCreateManualLead,
  updateLeadTimestamp,
  createOutreachEvent,
  getOutreachEvents as dbGetOutreachEvents,
  createDemoForLead as dbCreateDemoForLead,
  getDemoByLeadId as dbGetDemoByLeadId,
  publishDemoForLead as dbPublishDemoForLead,
  revokeDemoForLead as dbRevokeDemoForLead,
  unpublishDemoForLead as dbUnpublishDemoForLead,
  getAllLeadsForRecompute,
  batchUpdateScores,
  bulkUpdateLeadStatus as dbBulkUpdateStatus,
  updateLeadVerification as dbUpdateVerification,
  getLatestAiVerification,
  getAiUsageForActor,
  getAiVerificationById,
  getAiVerificationCandidates,
  getQualityActionCandidateIds,
  getQualityAiVerificationCandidates,
  getAiWebsiteViabilityRepairLeads,
  applyManualWebsiteCorrection as dbApplyManualWebsiteCorrection,
  applyAiFoundWebsite,
  markLeadBrokenSiteOpportunity,
  markLeadManualReview,
  recomputeAllLeadQualityScores,
  setLeadQualityBucket,
  updateLeadPhoneVerificationStatus,
  updateLeadAiFeedback,
  createAiFeedbackEvent,
  markLeadAiVerified,
  queueLeadsForEnrichment,
  createAuditLog,
  getSettings,
  refreshStaleUnits as dbRefreshStale,
  updateCrawlRunStatus,
  type LeadFilters,
  type QualityFilters,
} from "@/lib/db/queries";
import { requirePermission, type AppSession, type TenantSession } from "@/lib/auth";
import type { LegacyPermission } from "@/lib/permissions";
import type { TenantSessionSelector } from "@/lib/app-users";
import { canClaimLeadForSession, canReadLeadForSession, constrainLeadFiltersForSession } from "@/lib/lead-access";
import { parseMinReviewsFilter } from "@/lib/lead-filter-parsing";
import type { PhoneVerificationStatus, QualityBucket } from "@/lib/lead-quality";
import { generateOutreachPackage } from "@/lib/outreach-package";
import { computeScoreWithBreakdown } from "@/lib/scoring";
import { classifyWebsite, type WebsiteStatus } from "@/lib/classify-website";
import {
  computeLeadWinProbability,
  enqueueAiVerificationForLead,
  isWeakWebsiteOpportunity,
  performAiVerification,
  queueMissingAiVerifications,
  repairLeadAiWebsiteViability,
} from "@/lib/ai/verification-worker";
import { processLeadArtifactJobById, queueLeadAiArtifact, queueLeadPitchPack } from "@/lib/ai/artifact-worker";
import type { LeadAiArtifactType } from "@/lib/db/queries";
import {
  assertTenantResourceOwnership,
  requireTenantPermission,
  TenantAuthorizationError,
} from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { withTenantDbContext } from "@/lib/db";

const statusSchema = z.enum(["new", "verified", "contacted", "preview_sent", "meeting_set", "closed_won", "closed_lost"]);
const channelSchema = z.enum(["call", "text", "email", "walkin", "other"]);
const outreachOutcomeSchema = z.enum([
  "not_reached",
  "left_voicemail",
  "contacted",
  "decision_maker_reached",
  "demo_sent",
  "meeting_set",
  "follow_up_needed",
  "not_interested",
  "quoted",
  "closed_won",
  "closed_lost",
]);
const structuredOutreachSchema = z.object({
  channel: channelSchema,
  note: z.string().trim().max(2000).optional().default(""),
  contactPersonName: z.string().trim().max(120).optional().or(z.literal("")),
  contactPersonRole: z.string().trim().max(120).optional().or(z.literal("")),
  decisionMakerReached: z.boolean().optional().default(false),
  outcome: outreachOutcomeSchema.optional().default("contacted"),
  objectionReason: z.string().trim().max(500).optional().or(z.literal("")),
  quotedAmount: z.coerce.number().min(0).max(1000000).optional().default(0),
  closeValue: z.coerce.number().min(0).max(1000000).optional().default(0),
  followUpAt: z.string().trim().max(40).optional().or(z.literal("")),
  nextStep: z.string().trim().max(500).optional().or(z.literal("")),
});
const exclusionReasonSchema = z.string().trim().min(5).max(500);
const aiApplySchema = z.enum(["update_website", "exclude_has_website", "mark_broken_site_opportunity", "mark_manual_review"]);
const leadNoteSchema = z.string().trim().min(1).max(4000);
const phoneVerificationStatusSchema = z.enum(["unknown", "works", "bad", "no_phone"]);
const qualityBucketSchema = z.enum(["ready_to_call", "needs_ai_verify", "needs_manual_review", "broken_site_opportunity", "not_a_fit"]);
const archiveReasonSchema = z.string().trim().min(5).max(500);
const manualLeadSchema = z.object({
  name: z.string().trim().min(2).max(200),
  businessType: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(80).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  mapsUri: z.string().trim().max(500).optional().or(z.literal("")),
  source: z.string().trim().max(160).optional().or(z.literal("")),
  contactPersonName: z.string().trim().max(160).optional().or(z.literal("")),
  websiteStatus: z.enum(["none", "social", "basic", "custom"]).optional().default("none"),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
}).refine((data) => Boolean(data.phone?.trim() || data.address?.trim()), {
  message: "Add either a phone number or an address.",
  path: ["phone"],
});
const leadAiArtifactTypeSchema = z.enum(["business_detail", "competitive_report"]);
const aiFeedbackSchema = z.object({
  status: z.enum(["correct", "incorrect", "uncertain"]),
  correctedWebsiteUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  falsePositiveReason: z.string().trim().max(500).optional(),
  reviewerNotes: z.string().trim().max(1000).optional(),
});
const researcherAiFeedbackSchema = z.object({
  feedbackKind: z.enum(["verification", "pitch"]),
  verdict: z.enum(["correct", "incorrect", "uncertain", "useful", "not_useful"]),
  correctedWebsiteUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
  verificationId: z.string().trim().max(120).optional().or(z.literal("")),
  artifactId: z.string().trim().max(120).optional().or(z.literal("")),
}).superRefine((value, ctx) => {
  if (value.feedbackKind === "verification" && (value.verdict === "useful" || value.verdict === "not_useful")) {
    ctx.addIssue({ code: "custom", path: ["verdict"], message: "Verification feedback must be correct, incorrect, or uncertain." });
  }
  if (value.feedbackKind === "pitch" && (value.verdict === "correct" || value.verdict === "incorrect" || value.verdict === "uncertain")) {
    ctx.addIssue({ code: "custom", path: ["verdict"], message: "Pitch feedback must be useful or not useful." });
  }
});
const manualWebsiteCorrectionSchema = z.object({
  websiteUrl: z.string().trim().max(500).optional().or(z.literal("")),
  resolution: z.enum(["official_website_found", "weak_or_basic_site", "candidate_website_needs_review", "social_or_directory_only", "remove_website"]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});
const updateLeadFactsSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  phone: z.string().trim().max(80).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  websiteUrl: z.string().trim().max(500).optional().or(z.literal("")),
  businessType: z.string().trim().max(80).optional().or(z.literal("")),
  primaryType: z.string().trim().max(120).optional().or(z.literal("")),
  status: statusSchema.optional(),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
});
const workUpdateSchema = z.object({
  note: z.string().trim().max(4000).optional().or(z.literal("")),
  action: z.enum(["research_note", "called", "left_voicemail", "follow_up", "not_interested", "done"]),
  followUpAt: z.string().trim().max(40).optional().or(z.literal("")),
  nextStep: z.string().trim().max(500).optional().or(z.literal("")),
});
const qualityAiBatchSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  businessType: z.string().trim().min(1).max(80).optional(),
  recommendedOffer: z.string().trim().min(1).max(80).optional(),
  phoneVerificationStatus: z.string().trim().min(1).max(80).optional(),
  aiVerificationStatus: z.string().trim().min(1).max(80).optional(),
  enrichmentStatus: z.string().trim().min(1).max(80).optional(),
  qualityBucket: z.string().trim().min(1).max(80).optional(),
  countryCode: z.string().trim().min(2).max(8).optional(),
  marketId: z.string().trim().min(1).max(120).optional(),
  locationCellId: z.string().trim().min(1).max(120).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  zip: z.string().trim().min(1).max(40).optional(),
  denverOnly: z.boolean().optional(),
  ids: z.array(z.string().uuid()).max(100).optional(),
});

function revalidateLeadViews(): void {
  revalidatePath("/leads");
  revalidatePath("/explore");
  revalidatePath("/queue");
  revalidatePath("/team");
  revalidatePath("/quality");
  revalidatePath("/statistics");
  revalidatePath("/dashboard");
}

function leadOwnerLabel(lead: { assigned_user_display_name?: string | null; assigned_user_email?: string | null; assigned_to_user_id?: string | null }): string {
  return lead.assigned_user_display_name || lead.assigned_user_email || lead.assigned_to_user_id || "another researcher";
}

function auditActorOptions(session: AppSession) {
  return {
    actor: {
      userId: session.userId,
      email: session.email,
      role: session.role,
    },
  };
}

async function requireLeadOwnershipForMutation(
  id: string,
  session: { userId: string; role: string },
  knownLead?: Awaited<ReturnType<typeof queryLeadById>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (session.role === "admin") return { ok: true };
  const lead = knownLead ?? await queryLeadById(id);
  if (!lead) return { ok: false, error: "Lead not found" };
  if (!await canReadLeadForSession(session, lead)) {
    if (await canClaimLeadForSession(session, lead)) {
      return { ok: false, error: "Claim this lead before updating it." };
    }
    return { ok: false, error: "Lead not found" };
  }
  if (!lead.assigned_to_user_id) return { ok: false, error: "Claim this lead before updating it." };
  if (lead.assigned_to_user_id !== session.userId) return { ok: false, error: `Taken by ${leadOwnerLabel(lead)}.` };
  return { ok: true };
}

type LeadActionClass = "read" | "researcher-mutation" | "manager-mutation";

const CANONICAL_LEAD_MANAGER_ROLES: ReadonlySet<TenantSession["role"]> = new Set([
  "owner",
  "admin",
  "strategist_manager",
]);

function bindCanonicalLeadActor(
  tenantSession: TenantSession,
  legacySession: AppSession,
  actionClass: LeadActionClass,
): AppSession {
  if (CANONICAL_LEAD_MANAGER_ROLES.has(tenantSession.role)) {
    return { ...legacySession, role: "admin" };
  }
  if (actionClass === "read") {
    return { ...legacySession, role: "researcher" };
  }
  if (actionClass === "researcher-mutation" && tenantSession.role === "researcher") {
    return { ...legacySession, role: "researcher" };
  }
  throw new TenantAuthorizationError(403, "PERMISSION_DENIED");
}

async function withTenantWideLeadActor<T>(
  selector: TenantSessionSelector,
  legacyPermission: LegacyPermission,
  action: string,
  actionClass: LeadActionClass,
  callback: (tenantSession: TenantSession, legacySession: AppSession) => Promise<T>,
): Promise<T> {
  const tenantSession = await requireTenantPermission(selector, "account:read", { action });
  const legacySession = await requirePermission(legacyPermission);
  if (legacySession.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }
  if (tenantSession.workspaceId !== null) {
    throw new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID");
  }
  const actorSession = bindCanonicalLeadActor(tenantSession, legacySession, actionClass);

  return runWithTenantContext(tenantSession, `${action}:${randomUUID()}`, () =>
    withTenantDbContext(async () => {
      await ensureDbReady();
      return callback(tenantSession, actorSession);
    }));
}

function tenantOwnedLeadOrNull(
  tenantSession: TenantSession,
  lead: Awaited<ReturnType<typeof queryLeadById>>,
): NonNullable<Awaited<ReturnType<typeof queryLeadById>>> | null {
  if (!lead) return null;
  const scopedLead = lead as typeof lead & { tenant_id?: unknown; workspace_id?: unknown };
  try {
    assertTenantResourceOwnership(tenantSession, {
      tenantId: scopedLead.tenant_id,
      workspaceId: scopedLead.workspace_id ?? null,
      resourceId: scopedLead.id,
      resourceType: "lead",
    }, "workspace-optional");
    return lead;
  } catch (error) {
    if (error instanceof TenantAuthorizationError) return null;
    throw error;
  }
}

async function getTenantOwnedLead(
  tenantSession: TenantSession,
  id: string,
): Promise<NonNullable<Awaited<ReturnType<typeof queryLeadById>>> | null> {
  return tenantOwnedLeadOrNull(tenantSession, await queryLeadById(id));
}

async function allLeadIdsBelongToTenant(tenantSession: TenantSession, ids: readonly string[]): Promise<boolean> {
  for (const id of ids) {
    if (!await getTenantOwnedLead(tenantSession, id)) return false;
  }
  return true;
}

const RESEARCHER_AI_CLAIM_REQUIRED_MESSAGE = "Claim this lead before running AI tools.";
const RESEARCHER_AI_REQUEST_SOURCES = ["researcher_ai_check", "researcher_pitch_pack"];

async function requireLeadOwnershipForResearcherAi(
  id: string,
  session: { userId: string; role: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ownership = await requireLeadOwnershipForMutation(id, session);
  if (ownership.ok) return ownership;
  if (ownership.error === "Lead not found") return ownership;
  return { ok: false, error: RESEARCHER_AI_CLAIM_REQUIRED_MESSAGE };
}

async function requireResearcherAiBudget(
  session: { userId: string; role: string },
  settings: Awaited<ReturnType<typeof getSettings>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (session.role === "admin") return { ok: true };

  const dailyUsage = await getAiUsageForActor(session.userId, startOfUtcDayIso(), RESEARCHER_AI_REQUEST_SOURCES);
  const monthlyUsage = await getAiUsageForActor(session.userId, startOfUtcMonthIso(), RESEARCHER_AI_REQUEST_SOURCES);
  if (dailyUsage.calls >= settings.researcher_ai_daily_run_cap) {
    return {
      ok: false,
      error: `Researcher AI daily run cap reached (${dailyUsage.calls}/${settings.researcher_ai_daily_run_cap}). Ask an admin to raise the cap or try tomorrow.`,
    };
  }
  if (dailyUsage.cost >= settings.researcher_ai_daily_budget_usd) {
    return {
      ok: false,
      error: `Researcher AI daily budget reached (${formatUsd(dailyUsage.cost)}/${formatUsd(settings.researcher_ai_daily_budget_usd)}). Ask an admin to raise the cap or try tomorrow.`,
    };
  }
  if (monthlyUsage.cost >= settings.researcher_ai_monthly_budget_usd) {
    return {
      ok: false,
      error: `Researcher AI monthly budget reached (${formatUsd(monthlyUsage.cost)}/${formatUsd(settings.researcher_ai_monthly_budget_usd)}). Ask an admin to raise the cap.`,
    };
  }
  return { ok: true };
}

function startOfUtcDayIso(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function startOfUtcMonthIso(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString();
}

function formatUsd(value: number): string {
  return `$${Math.max(0, value).toFixed(2)}`;
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeWebsiteUrl(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function getLeadsAction(
  filters: LeadFilters = {},
  selector: TenantSessionSelector = {},
) {
  const tenantSession = await requireTenantPermission(selector, "account:read", {
    action: "lead.list",
  });
  const session = await requirePermission("view:workspace");
  if (session.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }
  if (tenantSession.workspaceId !== null) {
    throw new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID");
  }

  return runWithTenantContext(tenantSession, `lead-list:${randomUUID()}`, () =>
    withTenantDbContext(async () => {
      await ensureDbReady();
      return queryLeads(constrainLeadFiltersForSession(session, {
        ...filters,
        minReviews: parseMinReviewsFilter(filters.minReviews),
      }));
    }));
}

export async function getLeadByIdAction(id: string, selector: TenantSessionSelector) {
  const tenantSession = await requireTenantPermission(selector, "account:read", {
    action: "lead.read",
  });
  const session = await requirePermission("view:workspace");
  if (session.userId !== tenantSession.userId) {
    throw new TenantAuthorizationError(403, "TENANT_SCOPE_MISMATCH");
  }

  const lead = await runWithTenantContext(
    tenantSession,
    `lead-read:${randomUUID()}`,
    () => withTenantDbContext(async () => {
      await ensureDbReady();
      return queryLeadById(id);
    }),
  );

  const scopedLead = lead as (typeof lead & { tenant_id?: unknown; workspace_id?: unknown }) | null;
  try {
    assertTenantResourceOwnership(tenantSession, scopedLead && {
      tenantId: scopedLead.tenant_id,
      workspaceId: scopedLead.workspace_id ?? null,
      resourceId: scopedLead.id,
      resourceType: "lead",
    }, "workspace-optional");
  } catch (error) {
    if (
      error instanceof TenantAuthorizationError &&
      (error.code === "RESOURCE_NOT_FOUND_OR_FORBIDDEN" || error.code === "WORKSPACE_SCOPE_INVALID")
    ) {
      return null;
    }
    throw error;
  }

  if (!scopedLead) return null;
  return await canReadLeadForSession(session, scopedLead) ? scopedLead : null;
}

export async function updateLeadStatusAction(id: string, status: string, selector: TenantSessionSelector = {}) {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status value" };
  return withTenantWideLeadActor(
    selector,
    parsed.data === "closed_won" || parsed.data === "closed_lost" ? "lead:close" : "lead:update",
    "lead.status.update",
    "researcher-mutation",
    async (tenantSession, session) => {
      const lead = await getTenantOwnedLead(tenantSession, id);
      if (!lead) return { error: "Lead not found" };
      const ownership = await requireLeadOwnershipForMutation(id, session, lead);
      if (!ownership.ok) return { error: ownership.error };
      await dbUpdateStatus(id, parsed.data);
      await createAuditLog("lead_status_change", "lead", id, { status: parsed.data });
      revalidateLeadViews();
      return { success: true };
    },
  );
}

export async function updateLeadNotesAction(id: string, notes: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:update", "lead.notes.update", "researcher-mutation", async (tenantSession, session) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };
    const ownership = await requireLeadOwnershipForMutation(id, session, lead);
    if (!ownership.ok) return { error: ownership.error };
    await dbUpdateNotes(id, notes);
    await createAuditLog("lead_notes_updated", "lead", id, {
      length: notes.length,
      hasNotes: notes.trim().length > 0,
    });
    revalidatePath(`/leads/${id}`);
    return { success: true };
  });
}

export async function addLeadNoteAction(id: string, body: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:update", "lead.note.create", "researcher-mutation", async (tenantSession, session) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };
    const ownership = await requireLeadOwnershipForMutation(id, session, lead);
    if (!ownership.ok) return { error: ownership.error };
    const parsed = leadNoteSchema.safeParse(body);
    if (!parsed.success) return { error: "Note must be between 1 and 4000 characters." };
    const note = await dbCreateLeadNote(id, session.userId, parsed.data);
    await createAuditLog("lead_note_created", "lead", id, { noteId: note.id });
    revalidatePath(`/leads/${id}`);
    return { success: true, note };
  });
}

export async function getLeadNotesAction(id: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "view:workspace", "lead.notes.read", "read", async (tenantSession, session) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead || !await canReadLeadForSession(session, lead)) return [];
    return dbGetLeadNotes(id);
  });
}

export async function claimLeadAction(id: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:assign", "lead.claim", "researcher-mutation", async (tenantSession, session) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };
    if (!await canClaimLeadForSession(session, lead)) return { error: "Lead not found" };
    const changes = session.role === "admin"
      ? await dbClaimLeadForUser(id, session.userId, { preserveAdminSemantics: true })
      : await dbClaimLeadForUser(id, session.userId);
    if (changes === 0) {
      if (session.role !== "admin") return { error: "Lead not found" };
      const current = await getTenantOwnedLead(tenantSession, id);
      return { error: current ? `Taken by ${leadOwnerLabel(current)}.` : "Lead not found" };
    }
    await createAuditLog("lead_claimed", "lead", id, undefined, auditActorOptions(session));
    revalidateLeadViews();
    revalidatePath(`/leads/${id}`);
    return { success: true };
  });
}

export async function unclaimLeadAction(id: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:assign", "lead.unclaim", "researcher-mutation", async (tenantSession, session) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };
    if (!await canReadLeadForSession(session, lead)) return { error: "Lead not found" };
    if (lead.assigned_to_user_id && lead.assigned_to_user_id !== session.userId && session.role !== "admin") {
      return { error: "Only the assigned researcher or an admin can unclaim this lead." };
    }
    await dbAssignLeadToUser(id, null);
    await createAuditLog("lead_unclaimed", "lead", id, undefined, auditActorOptions(session));
    revalidateLeadViews();
    revalidatePath(`/leads/${id}`);
    return { success: true };
  });
}

export async function assignLeadAction(id: string, userId: string | null, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:admin_assign", "lead.assign", "manager-mutation", async (tenantSession) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };
    await dbAssignLeadToUser(id, userId);
    await createAuditLog("lead_assigned", "lead", id, { assignedTo: userId });
    revalidateLeadViews();
    revalidatePath(`/leads/${id}`);
    return { success: true };
  });
}

export async function updateLeadReminderAction(id: string, date: string | null, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:update", "lead.reminder.update", "researcher-mutation", async (tenantSession, session) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };
    const ownership = await requireLeadOwnershipForMutation(id, session, lead);
    if (!ownership.ok) return { error: ownership.error };
    await dbUpdateReminder(id, date);
    await createAuditLog("lead_reminder_updated", "lead", id, { reminderDate: date });
    revalidateLeadViews();
    revalidatePath(`/leads/${id}`);
    return { success: true };
  });
}

export async function excludeLeadAction(id: string, reason: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:exclude", "lead.exclude", "manager-mutation", async (tenantSession) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };

    const parsedReason = exclusionReasonSchema.safeParse(reason);
    if (!parsedReason.success) {
      return { error: "Please provide a clear reason (at least 5 characters)." };
    }

    const changes = await dbSetLeadExclusion(id, parsedReason.data);
    if (changes === 0) return { error: "Lead was not updated. Refresh and try again." };
    await createAuditLog("lead_excluded", "lead", id, { reason: parsedReason.data });
    revalidateLeadViews();
    revalidatePath(`/leads/${id}`);
    return { success: true };
  });
}

export async function restoreExcludedLeadAction(id: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:exclude", "lead.exclusion.restore", "manager-mutation", async (tenantSession) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };

    const changes = await dbClearLeadExclusion(id);
    if (changes === 0) return { error: "Lead was not updated. Refresh and try again." };
    await createAuditLog("lead_exclusion_cleared", "lead", id, {});
    revalidateLeadViews();
    revalidatePath(`/leads/${id}`);
    return { success: true };
  });
}

export async function archiveLeadAction(id: string, reason: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:exclude", "lead.archive", "manager-mutation", async (tenantSession, session) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };
    const parsedReason = archiveReasonSchema.safeParse(reason);
    if (!parsedReason.success) return { error: "Please provide an archive reason of at least 5 characters." };
    const changes = await dbArchiveLead(id, session.userId, parsedReason.data);
    if (changes === 0) return { error: "Lead is already archived or was not found." };
    await createAuditLog("lead_archived", "lead", id, { reason: parsedReason.data });
    revalidateLeadViews();
    revalidatePath(`/leads/${id}`);
    return { success: true };
  });
}

export async function restoreArchivedLeadAction(id: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:exclude", "lead.archive.restore", "manager-mutation", async (tenantSession) => {
    const lead = await getTenantOwnedLead(tenantSession, id);
    if (!lead) return { error: "Lead not found" };
    const changes = await dbRestoreArchivedLead(id);
    if (changes === 0) return { error: "Lead is not archived or was not found." };
    await createAuditLog("lead_restored", "lead", id, {});
    revalidateLeadViews();
    revalidatePath(`/leads/${id}`);
    return { success: true };
  });
}

export async function bulkArchiveLeadsAction(ids: string[], reason: string, selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:exclude", "lead.archive.bulk", "manager-mutation", async (tenantSession, session) => {
    const parsedReason = archiveReasonSchema.safeParse(reason);
    if (!parsedReason.success) return { error: "Please provide an archive reason of at least 5 characters." };
    if (ids.length === 0) return { error: "No leads selected" };
    if (!await allLeadIdsBelongToTenant(tenantSession, ids)) return { error: "Lead not found" };
    const count = await dbBulkArchiveLeads(ids, session.userId, parsedReason.data);
    await createAuditLog("lead_archived", "leads", undefined, { reason: parsedReason.data, count });
    revalidateLeadViews();
    return { success: true, count };
  });
}

export async function bulkRestoreArchivedLeadsAction(ids: string[], selector: TenantSessionSelector = {}) {
  return withTenantWideLeadActor(selector, "lead:exclude", "lead.archive.bulk_restore", "manager-mutation", async (tenantSession) => {
    if (ids.length === 0) return { error: "No leads selected" };
    if (!await allLeadIdsBelongToTenant(tenantSession, ids)) return { error: "Lead not found" };
    const count = await dbBulkRestoreArchivedLeads(ids);
    await createAuditLog("lead_restored", "leads", undefined, { count });
    revalidateLeadViews();
    return { success: true, count };
  });
}

export async function createManualLeadAction(input: unknown) {
  const session = await requirePermission("lead:exclude");
  await ensureDbReady();
  const parsed = manualLeadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please complete the required lead fields." };
  }
  const lead = await dbCreateManualLead({
    name: parsed.data.name,
    businessType: parsed.data.businessType,
    phone: normalizeOptionalText(parsed.data.phone),
    address: normalizeOptionalText(parsed.data.address),
    mapsUri: normalizeOptionalText(parsed.data.mapsUri),
    source: normalizeOptionalText(parsed.data.source),
    contactPersonName: normalizeOptionalText(parsed.data.contactPersonName),
    websiteStatus: parsed.data.websiteStatus,
    notes: normalizeOptionalText(parsed.data.notes),
  });
  await createAuditLog("manual_lead_created", "lead", lead.id, {
    businessType: parsed.data.businessType,
    websiteStatus: parsed.data.websiteStatus,
    source: normalizeOptionalText(parsed.data.source),
    contactPersonName: normalizeOptionalText(parsed.data.contactPersonName),
    actorUserId: session.userId,
  });
  revalidateLeadViews();
  revalidatePath(`/leads/${lead.id}`);
  return { success: true, lead };
}

export async function logOutreachEventAction(
  leadId: string,
  inputOrChannel: string | Record<string, unknown>,
  note = "",
) {
  const session = await requirePermission("outreach:create");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(leadId, session);
  if (!ownership.ok) return { error: ownership.error };

  const rawInput = typeof inputOrChannel === "string"
    ? { channel: inputOrChannel, note }
    : inputOrChannel;
  const parsed = structuredOutreachSchema.safeParse(rawInput);
  if (!parsed.success) return { error: "Please complete the contact outcome fields." };
  if ((parsed.data.outcome === "closed_won" || parsed.data.outcome === "closed_lost") && session.role !== "admin") {
    return { error: "Only admins can mark leads closed won or closed lost." };
  }

  const event = await createOutreachEvent({
    leadId,
    channel: parsed.data.channel,
    note: normalizeOptionalText(parsed.data.note),
    actorUserId: session.userId,
    actorEmail: session.email,
    contactPersonName: normalizeOptionalText(parsed.data.contactPersonName),
    contactPersonRole: normalizeOptionalText(parsed.data.contactPersonRole),
    decisionMakerReached: parsed.data.decisionMakerReached,
    outcome: parsed.data.outcome,
    objectionReason: normalizeOptionalText(parsed.data.objectionReason),
    quotedAmount: parsed.data.quotedAmount,
    closeValue: parsed.data.closeValue,
    followUpAt: normalizeOptionalText(parsed.data.followUpAt),
    nextStep: normalizeOptionalText(parsed.data.nextStep),
  });
  await createAuditLog("outreach_logged", "lead", leadId, {
    eventId: event.id,
    channel: parsed.data.channel,
    outcome: parsed.data.outcome,
    contactPersonName: normalizeOptionalText(parsed.data.contactPersonName),
    contactPersonRole: normalizeOptionalText(parsed.data.contactPersonRole),
    decisionMakerReached: parsed.data.decisionMakerReached,
    objectionReason: normalizeOptionalText(parsed.data.objectionReason),
    quotedAmount: parsed.data.quotedAmount,
    closeValue: parsed.data.closeValue,
    followUpAt: normalizeOptionalText(parsed.data.followUpAt),
    nextStep: normalizeOptionalText(parsed.data.nextStep),
    hasNote: Boolean(normalizeOptionalText(parsed.data.note)),
  });
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  return { success: true, event };
}

export async function getOutreachEventsAction(leadId: string) {
  const session = await requirePermission("view:workspace");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead || !await canReadLeadForSession(session, lead)) return [];
  return dbGetOutreachEvents(leadId);
}

export async function markLeadRepliedAction(id: string) {
  const session = await requirePermission("outreach:create");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(id, session);
  if (!ownership.ok) return { error: ownership.error };
  if (lead.first_reply_at) return { error: "Already marked as replied" };
  await updateLeadTimestamp(id, "first_reply_at", null);
  await createAuditLog("lead_reply_marked", "lead", id);
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function markMeetingBookedAction(id: string) {
  const session = await requirePermission("outreach:create");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(id, session);
  if (!ownership.ok) return { error: ownership.error };
  if (lead.meeting_booked_at) return { error: "Already marked as meeting booked" };
  await updateLeadTimestamp(id, "meeting_booked_at", null);
  if (lead.status !== "meeting_set" && lead.status !== "closed_won") {
    await dbUpdateStatus(id, "meeting_set");
  }
  await createAuditLog("lead_meeting_booked", "lead", id);
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function generateOutreachPackageAction(leadId: string) {
  const session = await requirePermission("view:workspace");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  if (!await canReadLeadForSession(session, lead)) return { error: "Lead not found" };
  return generateOutreachPackage(lead);
}

export async function createDemoForLeadAction(leadId: string) {
  const session = await requirePermission("demo:create");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(leadId, session);
  if (!ownership.ok) return { error: ownership.error };
  const demo = await dbCreateDemoForLead(leadId);
  if (!demo) return { error: "Unable to create demo" };
  await createAuditLog("demo_created", "lead", leadId, { demoId: demo.id, slug: demo.slug });
  revalidatePath(`/leads/${leadId}`);
  return { success: true, demo };
}

export async function publishDemoForLeadAction(leadId: string) {
  const session = await requirePermission("demo:create");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(leadId, session);
  if (!ownership.ok) return { error: ownership.error };
  const demo = await dbPublishDemoForLead(leadId, session.userId);
  if (!demo) return { error: "Unable to publish demo" };
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/demo/${demo.slug}`);
  return { success: true, demo };
}

export async function unpublishDemoForLeadAction(leadId: string) {
  const session = await requirePermission("demo:create");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(leadId, session);
  if (!ownership.ok) return { error: ownership.error };
  const demo = await dbUnpublishDemoForLead(leadId, session.userId);
  if (!demo) return { error: "Demo not found" };
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/demo/${demo.slug}`);
  return { success: true, demo };
}

export async function revokeDemoForLeadAction(leadId: string, reason?: string) {
  const session = await requirePermission("demo:create");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(leadId, session);
  if (!ownership.ok) return { error: ownership.error };
  const demo = await dbRevokeDemoForLead(leadId, session.userId, reason?.trim() || null);
  if (!demo) return { error: "Demo not found" };
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/demo/${demo.slug}`);
  return { success: true, demo };
}

export async function getDemoByLeadIdAction(leadId: string) {
  const session = await requirePermission("view:workspace");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead || !await canReadLeadForSession(session, lead)) return null;
  return dbGetDemoByLeadId(leadId);
}

export async function getScoreBreakdownAction(leadId: string) {
  const session = await requirePermission("view:workspace");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return null;
  if (!await canReadLeadForSession(session, lead)) return null;
  const settings = await getSettings();
  const breakdown = computeScoreWithBreakdown(
    {
      reviewCount: lead.review_count, rating: lead.rating,
      categories: lead.categories, websiteStatus: lead.website_status as WebsiteStatus,
      photoCount: lead.photo_count, hasOpeningHours: lead.has_opening_hours,
      businessStatus: lead.business_status,
      websiteHealth: lead.website_health as Record<string, unknown> | null,
    },
    Object.keys(settings.niche_weights).length > 0 ? settings.niche_weights : undefined,
  );
  return breakdown;
}

export async function recomputeAllScoresAction(): Promise<{ count: number }> {
  await requirePermission("scores:recompute");
  await ensureDbReady();
  const settings = await getSettings();
  const leads = await getAllLeadsForRecompute();
  const nicheWeights = Object.keys(settings.niche_weights).length > 0 ? settings.niche_weights : undefined;
  const updates: Array<{ id: string; score: number }> = [];

  for (const lead of leads) {
    const categories: string[] = JSON.parse(lead.categories || "[]");
    const wh = lead.website_health ? JSON.parse(lead.website_health) : null;
    const score = computeScoreWithBreakdown(
      {
        reviewCount: lead.review_count, rating: lead.rating, categories,
        websiteStatus: lead.website_status as WebsiteStatus,
        photoCount: lead.photo_count ?? 0,
        hasOpeningHours: lead.has_opening_hours === 1,
        businessStatus: lead.business_status,
        websiteHealth: wh,
        contactabilityScore: lead.contactability_score,
        estimatedDealValue: lead.estimated_deal_value,
      },
      nicheWeights,
    ).final;
    updates.push({ id: lead.id, score });
  }

  await batchUpdateScores(updates);
  await createAuditLog("scores_recomputed", "leads", undefined, { count: updates.length });
  return { count: updates.length };
}

export async function recomputeLeadQualityScoresAction(): Promise<{ count: number }> {
  await requirePermission("scores:recompute");
  await ensureDbReady();
  const count = await recomputeAllLeadQualityScores();
  await createAuditLog("lead_quality_scores_recomputed", "leads", undefined, { count });
  revalidateLeadViews();
  return { count };
}

export async function updateLeadPhoneVerificationStatusAction(id: string, status: string) {
  const parsed = phoneVerificationStatusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid phone verification status" };
  const session = await requirePermission("lead:update");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(id, session);
  if (!ownership.ok) return { error: ownership.error };
  const changes = await updateLeadPhoneVerificationStatus(id, parsed.data as PhoneVerificationStatus, session.userId);
  if (changes === 0) return { error: "Lead was not updated. Refresh and try again." };
  await createAuditLog("lead_phone_verification_updated", "lead", id, { status: parsed.data });
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function markLeadQualityBucketAction(id: string, bucket: string) {
  const parsed = qualityBucketSchema.safeParse(bucket);
  if (!parsed.success) return { error: "Invalid quality bucket" };
  if (parsed.data === "not_a_fit") {
    return { error: "Use admin exclusion for not-a-fit leads so the reason is audited." };
  }
  const session = await requirePermission("lead:update");
  await ensureDbReady();
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(id, session);
  if (!ownership.ok) return { error: ownership.error };
  const changes = await setLeadQualityBucket(id, parsed.data as QualityBucket, session.userId);
  if (changes === 0) return { error: "Lead was not updated. Refresh and try again." };
  await createAuditLog("lead_quality_bucket_updated", "lead", id, { bucket: parsed.data });
  revalidateLeadViews();
  revalidatePath(`/leads/${id}`);
  return { success: true };
}

export async function refreshStaleUnitsAction(runId: string, olderThanDays: number) {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  if (olderThanDays < 1) return { error: "Days must be at least 1" };
  const count = await dbRefreshStale(runId, olderThanDays);
  if (count > 0) {
    await updateCrawlRunStatus(runId, "running");
    await createAuditLog("refresh_stale_units", "crawl_run", runId, { olderThanDays, count });
  }
  return { success: true, count };
}

export async function bulkUpdateLeadStatusAction(ids: string[], status: string, selector: TenantSessionSelector = {}) {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Invalid status" };
  return withTenantWideLeadActor(
    selector,
    parsed.data === "closed_won" || parsed.data === "closed_lost" ? "lead:close" : "lead:update",
    "lead.status.bulk_update",
    "researcher-mutation",
    async (tenantSession, session) => {
      if (ids.length === 0) return { error: "No leads selected" };
      const leads: NonNullable<Awaited<ReturnType<typeof queryLeadById>>>[] = [];
      for (const id of ids) {
        const lead = await getTenantOwnedLead(tenantSession, id);
        if (!lead) return { error: "Lead not found" };
        leads.push(lead);
      }
      if (session.role !== "admin") {
        for (let index = 0; index < ids.length; index += 1) {
          const ownership = await requireLeadOwnershipForMutation(ids[index]!, session, leads[index]);
          if (!ownership.ok) return { error: ownership.error };
        }
      }
      const count = await dbBulkUpdateStatus(ids, parsed.data);
      await createAuditLog("bulk_status_update", "leads", undefined, { status: parsed.data, count });
      revalidateLeadViews();
      return { success: true, count };
    },
  );
}

export async function runAiVerificationAction(leadId: string, options: { force?: boolean } = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };

  const result = await performAiVerification(lead, options.force ?? false);
  if ("success" in result && result.success && result.verification.input_hash) {
    await markLeadAiVerified(leadId, result.verification.input_hash);
  }
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/statistics");
  return result;
}

export async function runResearcherAiCheckAction(leadId: string) {
  const session = await requirePermission("ai:researcher_tools");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };

  const ownership = await requireLeadOwnershipForResearcherAi(leadId, session);
  if (!ownership.ok) return { error: ownership.error };

  const settings = await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };
  const budget = await requireResearcherAiBudget(session, settings);
  if (!budget.ok) return { error: budget.error };

  await createAuditLog("researcher_ai_check_requested", "lead", leadId, {
    actorUserId: session.userId,
    actorRole: session.role,
  });
  const result = await performAiVerification(lead, false, settings, {
    applyToLead: false,
    actorUserId: session.userId,
    requestSource: "researcher_ai_check",
  });
  await createAuditLog("researcher_ai_check_completed", "lead", leadId, {
    actorUserId: session.userId,
    actorRole: session.role,
    success: !("error" in result),
    verificationId: "verification" in result ? result.verification?.id ?? null : null,
    error: "error" in result ? result.error : null,
  });
  revalidatePath(`/leads/${leadId}`);
  return result;
}

export async function queueMissingAiVerificationsAction() {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const result = await queueMissingAiVerifications();
  revalidateLeadViews();
  return result;
}

export async function queueLeadAiArtifactAction(
  leadId: string,
  artifactType: LeadAiArtifactType,
  options: { force?: boolean } = {},
) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const parsed = leadAiArtifactTypeSchema.safeParse(artifactType);
  if (!parsed.success) return { error: "Invalid artifact type." };
  const result = await queueLeadAiArtifact(leadId, parsed.data, options);
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  return result;
}

export async function queueLeadPitchPackAction(leadId: string, options: { force?: boolean } = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const result = await queueLeadPitchPack(leadId, options);
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  return result;
}

export async function generateResearcherPitchPackAction(leadId: string) {
  const session = await requirePermission("ai:researcher_tools");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };

  const ownership = await requireLeadOwnershipForResearcherAi(leadId, session);
  if (!ownership.ok) return { error: ownership.error };

  const settings = await getSettings();
  if (!settings.ai_enabled) return { error: "AI is disabled in Settings." };
  const budget = await requireResearcherAiBudget(session, settings);
  if (!budget.ok) return { error: budget.error };

  await createAuditLog("researcher_pitch_pack_requested", "lead", leadId, {
    actorUserId: session.userId,
    actorRole: session.role,
  });
  const queued = await queueLeadPitchPack(leadId, {
    force: false,
    settings,
    actorUserId: session.userId,
    requestSource: "researcher_pitch_pack",
  });
  const businessDetail = await processResearcherArtifactResult(queued.businessDetail, session);
  const competitiveReport = await processResearcherArtifactResult(queued.competitiveReport, session);
  const hasError = businessDetail.status === "error" || competitiveReport.status === "error";
  await createAuditLog(hasError ? "researcher_pitch_pack_failed" : "researcher_pitch_pack_completed", "lead", leadId, {
    actorUserId: session.userId,
    actorRole: session.role,
    businessDetail,
    competitiveReport,
  });
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  return { businessDetail, competitiveReport };
}

export async function submitResearcherAiFeedbackAction(leadId: string, input: unknown) {
  const session = await requirePermission("ai:researcher_tools");
  await ensureDbReady();
  const parsed = researcherAiFeedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid AI feedback." };
  }

  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForResearcherAi(leadId, session);
  if (!ownership.ok) return { error: ownership.error };

  const feedback = await createAiFeedbackEvent({
    lead_id: leadId,
    verification_id: parsed.data.verificationId?.trim() || null,
    artifact_id: parsed.data.artifactId?.trim() || null,
    actor_user_id: session.userId,
    feedback_kind: parsed.data.feedbackKind,
    verdict: parsed.data.verdict,
    corrected_website_url: parsed.data.correctedWebsiteUrl?.trim() || null,
    reason: parsed.data.reason?.trim() || null,
    metadata_json: {
      actorRole: session.role,
      source: "lead_detail",
    },
  });
  await createAuditLog("researcher_ai_feedback_submitted", "lead", leadId, {
    actorUserId: session.userId,
    actorRole: session.role,
    feedbackKind: parsed.data.feedbackKind,
    verdict: parsed.data.verdict,
    feedbackId: feedback.id,
  });
  revalidatePath(`/leads/${leadId}`);
  return { success: true, feedback };
}

async function processResearcherArtifactResult(
  result: Awaited<ReturnType<typeof queueLeadAiArtifact>>,
  session: { userId: string },
): Promise<Awaited<ReturnType<typeof queueLeadAiArtifact>>> {
  if (result.status !== "queued") return result;
  return processLeadArtifactJobById(result.artifactId, {
    actorUserId: session.userId,
    requestSource: "researcher_pitch_pack",
  });
}

export async function manualWebsiteCorrectionAction(leadId: string, input: unknown) {
  const session = await requirePermission("lead:update");
  await ensureDbReady();
  const parsed = manualWebsiteCorrectionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid website correction" };
  }

  const ownership = await requireLeadOwnershipForMutation(leadId, session);
  if (!ownership.ok) {
    return { error: ownership.error };
  }

  const normalizedUrl = normalizeWebsiteUrl(parsed.data.websiteUrl);
  if (parsed.data.resolution !== "remove_website" && !normalizedUrl) {
    return { error: "Enter a valid website URL." };
  }

  const websiteStatus: WebsiteStatus =
    parsed.data.resolution === "remove_website"
      ? "none"
      : parsed.data.resolution === "weak_or_basic_site"
        ? "basic"
        : parsed.data.resolution === "social_or_directory_only"
          ? "social"
          : classifyWebsite(normalizedUrl ?? "");

  const before = await queryLeadById(leadId);
  if (!before) {
    return { error: "Lead not found" };
  }

  const lead = await dbApplyManualWebsiteCorrection(leadId, {
    websiteUrl: normalizedUrl,
    websiteStatus,
    resolution: parsed.data.resolution,
    notes: normalizeOptionalText(parsed.data.notes),
    actorUserId: session.userId,
  });

  if (!lead) {
    return { error: "Lead not found" };
  }

  await createAuditLog("manual_website_corrected", "lead", leadId, {
    actorUserId: session.userId,
    resolution: parsed.data.resolution,
    before: {
      website_uri: before.website_uri,
      website_status: before.website_status,
      qualification_status: before.qualification_status,
      is_excluded: before.is_excluded,
    },
    after: {
      website_uri: lead.website_uri,
      website_status: lead.website_status,
      qualification_status: lead.qualification_status,
      is_excluded: lead.is_excluded,
    },
    notes: normalizeOptionalText(parsed.data.notes),
  });

  if (parsed.data.resolution === "official_website_found") {
    await createAuditLog("ai_false_positive_corrected", "lead", leadId, {
      actorUserId: session.userId,
      correctedWebsiteUrl: normalizedUrl,
      previousAiStatus: before.ai_verification_status,
    });
    await createAuditLog("lead_excluded", "lead", leadId, {
      actorUserId: session.userId,
      reason: "Manual correction: official website found",
    });
  }

  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  return { success: true, lead };
}

export async function updateLeadFactsAction(leadId: string, input: unknown) {
  const session = await requirePermission("lead:update");
  await ensureDbReady();
  const parsed = updateLeadFactsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid lead facts" };
  }

  const ownership = await requireLeadOwnershipForMutation(leadId, session);
  if (!ownership.ok) {
    return { error: ownership.error };
  }
  if ((parsed.data.status === "closed_won" || parsed.data.status === "closed_lost") && session.role !== "admin") {
    return { error: "Only admins can mark leads closed won or closed lost." };
  }

  const normalizedUrl =
    parsed.data.websiteUrl === undefined ? undefined : normalizeWebsiteUrl(parsed.data.websiteUrl);
  if (parsed.data.websiteUrl && !normalizedUrl) {
    return { error: "Enter a valid website URL." };
  }

  const before = await queryLeadById(leadId);
  if (!before) {
    return { error: "Lead not found" };
  }

  const lead = await dbUpdateLeadFacts(leadId, {
    name: parsed.data.name,
    phone: parsed.data.phone === undefined ? undefined : normalizeOptionalText(parsed.data.phone),
    address: parsed.data.address === undefined ? undefined : normalizeOptionalText(parsed.data.address),
    websiteUrl: normalizedUrl,
    websiteStatus: normalizedUrl ? classifyWebsite(normalizedUrl) : parsed.data.websiteUrl === "" ? "none" : undefined,
    businessType: parsed.data.businessType === undefined ? undefined : (normalizeOptionalText(parsed.data.businessType) ?? undefined),
    primaryType: parsed.data.primaryType === undefined ? undefined : (normalizeOptionalText(parsed.data.primaryType) ?? undefined),
    status: parsed.data.status,
    notes: parsed.data.notes === undefined ? undefined : normalizeOptionalText(parsed.data.notes),
    actorUserId: session.userId,
  });

  if (!lead) {
    return { error: "Lead not found" };
  }

  await createAuditLog("lead_facts_updated", "lead", leadId, {
    actorUserId: session.userId,
    before: {
      name: before.name,
      phone: before.phone,
      address: before.address,
      website_uri: before.website_uri,
      business_type: before.business_type,
      primary_type: before.primary_type,
      status: before.status,
    },
    after: {
      name: lead.name,
      phone: lead.phone,
      address: lead.address,
      website_uri: lead.website_uri,
      business_type: lead.business_type,
      primary_type: lead.primary_type,
      status: lead.status,
    },
  });

  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  return { success: true, lead };
}

export async function saveLeadWorkUpdateAction(leadId: string, input: unknown) {
  const session = await requirePermission("lead:update");
  await ensureDbReady();
  const parsed = workUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid work update" };
  }

  const ownership = await requireLeadOwnershipForMutation(leadId, session);
  if (!ownership.ok) {
    return { error: ownership.error };
  }

  const note = normalizeOptionalText(parsed.data.note);
  const followUpAt = normalizeOptionalText(parsed.data.followUpAt);
  const nextStep = normalizeOptionalText(parsed.data.nextStep);
  if (!note && !followUpAt && !nextStep && parsed.data.action === "research_note") {
    return { error: "Add a note or choose a work action." };
  }

  if (note && ["research_note", "done"].includes(parsed.data.action)) {
    await dbCreateLeadNote(leadId, session.userId, note);
  }

  if (parsed.data.action === "called") {
    await createOutreachEvent({
      leadId,
      channel: "call",
      actorUserId: session.userId,
      actorEmail: session.email,
      outcome: "contacted",
      note,
      followUpAt,
      nextStep,
    });
  } else if (parsed.data.action === "left_voicemail") {
    await createOutreachEvent({
      leadId,
      channel: "call",
      actorUserId: session.userId,
      actorEmail: session.email,
      outcome: "left_voicemail",
      note,
      followUpAt,
      nextStep,
    });
  } else if (parsed.data.action === "follow_up") {
    await createOutreachEvent({
      leadId,
      channel: "other",
      actorUserId: session.userId,
      actorEmail: session.email,
      outcome: "follow_up_needed",
      note,
      followUpAt,
      nextStep,
    });
    if (followUpAt) {
      await dbUpdateReminder(leadId, followUpAt);
    }
  } else if (parsed.data.action === "not_interested") {
    await createOutreachEvent({
      leadId,
      channel: "other",
      actorUserId: session.userId,
      actorEmail: session.email,
      outcome: "not_interested",
      note,
      followUpAt,
      nextStep,
    });
  } else if (parsed.data.action === "done") {
    await dbUpdateStatus(leadId, "verified");
    await dbUpdateReminder(leadId, null);
  }

  if (followUpAt && parsed.data.action !== "follow_up" && parsed.data.action !== "done") {
    await dbUpdateReminder(leadId, followUpAt);
  }

  await createAuditLog("lead_work_update_saved", "lead", leadId, {
    actorUserId: session.userId,
    action: parsed.data.action,
    hasNote: Boolean(note),
    followUpAt,
    nextStep,
  });

  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  return { success: true };
}

export async function updateLeadAiFeedbackAction(leadId: string, input: unknown) {
  const session = await requirePermission("ai:verify");
  await ensureDbReady();
  const parsed = aiFeedbackSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid AI feedback." };
  const changes = await updateLeadAiFeedback(leadId, parsed.data, session.userId);
  await createAuditLog("lead_ai_feedback_updated", "lead", leadId, parsed.data);
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  return { success: true, changes };
}

export async function runAiVerificationBatchAction(input: { limit?: number; businessType?: string } = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const settings = await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };

  const requestedLimit = Math.max(1, Math.floor(input.limit ?? 10));
  const safeLimit = Math.min(requestedLimit, settings.ai_batch_limit);
  const leads = await getAiVerificationCandidates(safeLimit, input.businessType);
  const results: Array<{ leadId: string; success: boolean; cached?: boolean; error?: string }> = [];

  for (const lead of leads) {
    const result = await performAiVerification(lead, false, settings);
    if ("success" in result && result.success && result.verification.input_hash) {
      await markLeadAiVerified(lead.id, result.verification.input_hash);
    }
    results.push({
      leadId: lead.id,
      success: !("error" in result),
      cached: "cached" in result ? result.cached : false,
      error: "error" in result ? result.error : undefined,
    });
  }

  await createAuditLog("ai_batch_verification", "leads", undefined, {
    requestedLimit,
    processed: results.length,
    businessType: input.businessType ?? null,
  });
  revalidateLeadViews();
  revalidatePath("/statistics");
  return {
    success: true,
    processed: results.length,
    verified: results.filter((row) => row.success && !row.cached).length,
    cached: results.filter((row) => row.cached).length,
    errors: results.filter((row) => row.error).length,
    results,
  };
}

export async function runQualityAiVerificationBatchAction(input: {
  limit?: number;
  businessType?: string;
  recommendedOffer?: string;
  phoneVerificationStatus?: string;
  aiVerificationStatus?: string;
  enrichmentStatus?: string;
  qualityBucket?: string;
  countryCode?: string;
  marketId?: string;
  locationCellId?: string;
  city?: string;
  zip?: string;
  denverOnly?: boolean;
  ids?: string[];
} = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const parsed = qualityAiBatchSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid quality AI batch request." };

  const settings = await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };

  const requestedLimit = Math.max(1, Math.floor(parsed.data.limit ?? parsed.data.ids?.length ?? 10));
  const safeLimit = Math.min(requestedLimit, settings.ai_batch_limit, parsed.data.ids?.length ?? requestedLimit);
  const leads = await getQualityAiVerificationCandidates({
    limit: safeLimit,
    businessType: parsed.data.businessType,
    recommendedOffer: parsed.data.recommendedOffer,
    qualityBucket: parsed.data.qualityBucket,
    phoneVerificationStatus: parsed.data.phoneVerificationStatus,
    aiVerificationStatus: parsed.data.aiVerificationStatus,
    enrichmentStatus: parsed.data.enrichmentStatus,
    countryCode: parsed.data.countryCode,
    marketId: parsed.data.marketId,
    locationCellId: parsed.data.locationCellId,
    city: parsed.data.city,
    zip: parsed.data.zip,
    denverOnly: parsed.data.denverOnly,
    ids: parsed.data.ids,
  });
  const results: Array<{ leadId: string; success: boolean; cached?: boolean; error?: string }> = [];

  for (const lead of leads) {
    const result = await performAiVerification(lead, false, settings);
    if ("success" in result && result.success && result.verification.input_hash) {
      await markLeadAiVerified(lead.id, result.verification.input_hash);
    }
    results.push({
      leadId: lead.id,
      success: !("error" in result),
      cached: "cached" in result ? result.cached : false,
      error: "error" in result ? result.error : undefined,
    });
  }

  await createAuditLog("quality_ai_batch_verification", "leads", undefined, {
    requestedLimit,
    processed: results.length,
    businessType: parsed.data.businessType ?? null,
    countryCode: parsed.data.countryCode ?? null,
    marketId: parsed.data.marketId ?? null,
    locationCellId: parsed.data.locationCellId ?? null,
    denverOnly: parsed.data.denverOnly ?? false,
    selectedCount: parsed.data.ids?.length ?? 0,
  });
  revalidateLeadViews();
  return {
    success: true,
    processed: results.length,
    verified: results.filter((row) => row.success && !row.cached).length,
    cached: results.filter((row) => row.cached).length,
    errors: results.filter((row) => row.error).length,
    results,
  };
}

export async function queueQualityAiVerificationBatchAction(input: {
  limit?: number;
  businessType?: string;
  recommendedOffer?: string;
  phoneVerificationStatus?: string;
  aiVerificationStatus?: string;
  enrichmentStatus?: string;
  qualityBucket?: string;
  countryCode?: string;
  marketId?: string;
  locationCellId?: string;
  city?: string;
  zip?: string;
  denverOnly?: boolean;
  ids?: string[];
} = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const parsed = qualityAiBatchSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid quality AI queue request." };

  const settings = await getSettings();
  if (!settings.ai_enabled) return { error: "AI verification is disabled in Settings." };

  const requestedLimit = Math.max(1, Math.floor(parsed.data.limit ?? parsed.data.ids?.length ?? 25));
  const safeLimit = Math.min(requestedLimit, settings.ai_batch_limit, parsed.data.ids?.length ?? requestedLimit);
  const leads = await getQualityAiVerificationCandidates({
    limit: safeLimit,
    businessType: parsed.data.businessType,
    recommendedOffer: parsed.data.recommendedOffer,
    qualityBucket: parsed.data.qualityBucket,
    phoneVerificationStatus: parsed.data.phoneVerificationStatus,
    aiVerificationStatus: parsed.data.aiVerificationStatus,
    enrichmentStatus: parsed.data.enrichmentStatus,
    countryCode: parsed.data.countryCode,
    marketId: parsed.data.marketId,
    locationCellId: parsed.data.locationCellId,
    city: parsed.data.city,
    zip: parsed.data.zip,
    denverOnly: parsed.data.denverOnly,
    ids: parsed.data.ids,
  });
  const results = [];
  for (const lead of leads) {
    results.push(await enqueueAiVerificationForLead(lead.id, "quality_workspace", { force: true, settings }));
  }

  await createAuditLog("quality_ai_batch_queued", "leads", undefined, {
    requestedLimit,
    processed: results.length,
    businessType: parsed.data.businessType ?? null,
    countryCode: parsed.data.countryCode ?? null,
    marketId: parsed.data.marketId ?? null,
    locationCellId: parsed.data.locationCellId ?? null,
    denverOnly: parsed.data.denverOnly ?? false,
    selectedCount: parsed.data.ids?.length ?? 0,
  });
  revalidateLeadViews();
  return {
    success: true,
    processed: results.length,
    queued: results.filter((row) => row.status === "queued").length,
    skipped: results.filter((row) => row.status === "skipped").length,
    cached: results.filter((row) => row.status === "cached").length,
    disabled: results.filter((row) => row.status === "disabled").length,
    results,
  };
}

export async function queueQualityEnrichmentBatchAction(input: {
  limit?: number;
  businessType?: string;
  recommendedOffer?: string;
  phoneVerificationStatus?: string;
  aiVerificationStatus?: string;
  enrichmentStatus?: string;
  qualityBucket?: string;
  countryCode?: string;
  marketId?: string;
  locationCellId?: string;
  city?: string;
  zip?: string;
  denverOnly?: boolean;
  ids?: string[];
} = {}) {
  await requirePermission("crawl:manage");
  await ensureDbReady();
  const parsed = qualityAiBatchSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid quality enrichment queue request." };

  const requestedLimit = Math.max(1, Math.floor(parsed.data.limit ?? parsed.data.ids?.length ?? 25));
  const safeLimit = Math.min(requestedLimit, parsed.data.ids?.length ?? requestedLimit, 100);
  const ids = await getQualityActionCandidateIds({
    ...(parsed.data as QualityFilters),
    ids: parsed.data.ids,
    limit: safeLimit,
  });
  const queued = await queueLeadsForEnrichment(ids);
  await createAuditLog("quality_enrichment_batch_queued", "leads", undefined, {
    requestedLimit,
    queued,
    selectedCount: parsed.data.ids?.length ?? 0,
    businessType: parsed.data.businessType ?? null,
    countryCode: parsed.data.countryCode ?? null,
    marketId: parsed.data.marketId ?? null,
    locationCellId: parsed.data.locationCellId ?? null,
    denverOnly: parsed.data.denverOnly ?? false,
  });
  revalidateLeadViews();
  return { success: true, processed: ids.length, queued };
}

export async function applyAiRecommendationAction(verificationId: string, action: string) {
  const parsedAction = aiApplySchema.safeParse(action);
  if (!parsedAction.success) return { error: "Invalid AI recommendation action" };
  await requirePermission(
    parsedAction.data === "update_website" || parsedAction.data === "exclude_has_website"
      ? "lead:apply_ai_usable_website"
      : "lead:apply_ai_opportunity",
  );
  await ensureDbReady();

  const verification = await getAiVerificationById(verificationId);
  if (!verification) return { error: "AI verification not found" };
  const lead = await queryLeadById(verification.lead_id);
  if (!lead) return { error: "Lead not found" };
  const hasUsableWebsite = verification.status === "site_found" && verification.website_viability_status === "usable";

  if (parsedAction.data === "update_website") {
    if (!verification.found_website_url) return { error: "No found website URL to apply." };
    if (!hasUsableWebsite) return { error: "Only a usable, business-matched website can be applied." };
    await applyAiFoundWebsite(lead.id, verification.found_website_url);
    await createAuditLog("ai_found_website_applied", "lead", lead.id, { verificationId, websiteUrl: verification.found_website_url });
  }

  if (parsedAction.data === "exclude_has_website") {
    if (!hasUsableWebsite) return { error: "Only a usable, business-matched website can exclude a lead as having a website." };
    if (verification.found_website_url) {
      await applyAiFoundWebsite(lead.id, verification.found_website_url);
    }
    await dbSetLeadExclusion(lead.id, `AI found existing website${verification.found_website_url ? `: ${verification.found_website_url}` : ""}`);
    await createAuditLog("ai_exclusion_applied", "lead", lead.id, { verificationId, websiteUrl: verification.found_website_url });
  }

  if (parsedAction.data === "mark_broken_site_opportunity") {
    if (!isWeakWebsiteOpportunity(verification.website_viability_status)) {
      return { error: "Only broken, parked, or placeholder website findings can be marked as a broken-site opportunity." };
    }
    const winProbabilityScore = computeLeadWinProbability(lead, {
      status: "weak_site_found",
      confidence: verification.confidence,
      foundWebsiteUrl: verification.found_website_url,
    }, verification.website_viability_status);
    await markLeadBrokenSiteOpportunity(
      lead.id,
      verification.website_viability_reason || verification.reason || "AI found a broken or weak website opportunity.",
      winProbabilityScore,
    );
    await createAuditLog("ai_broken_site_opportunity_applied", "lead", lead.id, { verificationId, websiteUrl: verification.found_website_url, viability: verification.website_viability_status });
  }

  if (parsedAction.data === "mark_manual_review") {
    await markLeadManualReview(lead.id, verification.reason || "AI marked this lead for manual review.");
    await createAuditLog("ai_manual_review_applied", "lead", lead.id, { verificationId });
  }

  revalidateLeadViews();
  revalidatePath(`/leads/${lead.id}`);
  revalidatePath("/statistics");
  return { success: true };
}

export async function repairLeadAiWebsiteViabilityAction(leadId: string) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const lead = await queryLeadById(leadId);
  if (!lead) return { error: "Lead not found" };
  const latest = await getLatestAiVerification(leadId);
  if (!latest) return { error: "No AI verification exists for this lead." };
  if (!latest.found_website_url) return { error: "Latest AI verification has no website URL to re-check." };

  const result = await repairLeadAiWebsiteViability(lead, latest);
  revalidateLeadViews();
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/statistics");
  return result;
}

export async function repairAiWebsiteViabilityBatchAction(input: { limit?: number } = {}) {
  await requirePermission("ai:verify");
  await ensureDbReady();
  const leads = await getAiWebsiteViabilityRepairLeads(input.limit ?? 50);
  const results: Array<{ leadId: string; success: boolean; error?: string }> = [];

  for (const lead of leads) {
    const latest = await getLatestAiVerification(lead.id);
    if (!latest?.found_website_url) continue;
    const result = await repairLeadAiWebsiteViability(lead, latest);
    results.push({
      leadId: lead.id,
      success: !("error" in result),
      error: "error" in result ? result.error : undefined,
    });
  }

  await createAuditLog("ai_website_viability_repair_batch", "leads", undefined, { processed: results.length });
  revalidateLeadViews();
  revalidatePath("/statistics");
  return {
    success: true,
    processed: results.length,
    repaired: results.filter((row) => row.success).length,
    errors: results.filter((row) => row.error).length,
    results,
  };
}

const VERIFICATION_KEYS = new Set(["phone_works", "no_real_website", "address_verified", "business_active", "ready_for_outreach"]);

export async function updateLeadVerificationAction(id: string, key: string, value: boolean) {
  const session = await requirePermission("lead:update");
  await ensureDbReady();
  if (!VERIFICATION_KEYS.has(key)) return { error: "Invalid verification key" };
  const lead = await queryLeadById(id);
  if (!lead) return { error: "Lead not found" };
  const ownership = await requireLeadOwnershipForMutation(id, session);
  if (!ownership.ok) return { error: ownership.error };
  const verification = { ...lead.verification, [key]: value };
  await dbUpdateVerification(id, verification);
  revalidatePath(`/leads/${id}`);
  return { success: true, verification };
}
