import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTenantSession, requirePermission, type AppSession, type TenantSession } from "@/lib/auth";
import { withTenantDbContext } from "@/lib/db";
import { ensureDbReady, getAdminRequests, getDemoByLeadId, getLatestAiVerification, getLeadAiArtifacts, getLeadById, getLeadNotes, getOutreachEvents, getScoreBandThresholds, getSettings } from "@/lib/db/queries";
import { canReadLeadForSession } from "@/lib/lead-access";
import { computeScoreWithBreakdown } from "@/lib/scoring";
import { computeDensityByAddress } from "@/lib/competitive-density";
import type { WebsiteStatus } from "@/lib/classify-website";
import { assertTenantPermission, assertTenantResourceOwnership } from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";
import { LeadDetailClient } from "./lead-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const session = await requirePermission("view:workspace");
  const { id } = await params;
  const tenantSession = await resolveBoundTenantSession(session, "lead.detail.metadata");
  if (!tenantSession) return genericMetadata();

  const lead = await runWithTenantContext(tenantSession, `lead-detail-metadata:${randomUUID()}`, () =>
    withTenantDbContext(async () => {
      await ensureDbReady();
      return getAuthorizedLead(id, session, tenantSession);
    }));

  return { title: `${lead?.name ?? "Lead"} | Nova Trade Lead Management` };
}

export default async function LeadDetailPage({ params }: Props) {
  const session = await requirePermission("view:workspace");
  const { id } = await params;
  const tenantSession = await resolveBoundTenantSession(session, "lead.detail.page");
  if (!tenantSession) notFound();

  const loaded = await runWithTenantContext(tenantSession, `lead-detail-page:${randomUUID()}`, () =>
    withTenantDbContext(async () => {
      await ensureDbReady();
      const lead = await getAuthorizedLead(id, session, tenantSession);
      if (!lead) return null;

      // The authoritative lead scope is checked above before any child or
      // aggregate read can fan out from this tenant-owned record.
      const events = await getOutreachEvents(id);
      const adminRequests = await getAdminRequests({ leadId: id, status: "open" });
      const leadNotes = await getLeadNotes(id);
      const demo = await getDemoByLeadId(id);
      const latestAiVerification = await getLatestAiVerification(id);
      const aiArtifacts = await getLeadAiArtifacts(id);
      const density = await computeDensityByAddress(lead.address, lead.primary_type);
      const scoreThresholds = await getScoreBandThresholds();

      // Settings remain platform configuration used by the legacy score
      // calculator. This read does not grant or represent tenant policy.
      const settings = await getSettings();
      const breakdown = computeScoreWithBreakdown(
        {
          reviewCount: lead.review_count, rating: lead.rating,
          categories: lead.categories, websiteStatus: lead.website_status as WebsiteStatus,
          photoCount: lead.photo_count, hasOpeningHours: lead.has_opening_hours,
          businessStatus: lead.business_status,
          websiteHealth: lead.website_health as Record<string, unknown> | null,
          competitiveDensity: density.count,
        },
        Object.keys(settings.niche_weights).length > 0 ? settings.niche_weights : undefined,
      );

      return {
        lead, events, adminRequests, leadNotes, demo, latestAiVerification,
        aiArtifacts, density, scoreThresholds, breakdown,
      };
    }));

  if (!loaded) notFound();

  return (
    <LeadDetailClient
      lead={loaded.lead}
      initialEvents={loaded.events}
      initialAdminRequests={loaded.adminRequests}
      initialLeadNotes={loaded.leadNotes}
      initialDemo={loaded.demo}
      initialAiVerification={loaded.latestAiVerification}
      initialAiArtifacts={loaded.aiArtifacts}
      scoreBreakdown={loaded.breakdown}
      density={loaded.density}
      scoreThresholds={loaded.scoreThresholds}
      currentUser={{ userId: session.userId, email: session.email, role: session.role }}
    />
  );
}

function genericMetadata(): Metadata {
  return { title: "Lead | Nova Trade Lead Management" };
}

async function resolveBoundTenantSession(
  legacySession: AppSession,
  action: string,
): Promise<TenantSession | null> {
  try {
    const tenantSession = await getTenantSession({});
    if (!tenantSession || tenantSession.userId !== legacySession.userId) return null;
    await assertTenantPermission(tenantSession, "account:read", { action });
    return tenantSession;
  } catch {
    return null;
  }
}

async function getAuthorizedLead(
  id: string,
  legacySession: AppSession,
  tenantSession: TenantSession,
) {
  const lead = await getLeadById(id);
  if (!lead || !leadBelongsToTenantScope(lead, tenantSession)) return null;
  return await canReadLeadForSession(legacySession, lead) ? lead : null;
}

function leadBelongsToTenantScope(
  lead: NonNullable<Awaited<ReturnType<typeof getLeadById>>>,
  tenantSession: TenantSession,
): boolean {
  const scoped = lead as typeof lead & { tenant_id?: unknown; workspace_id?: unknown };
  const workspaceId = scoped.workspace_id ?? null;
  const scopeClass = workspaceId === null ? "tenant-wide" : "workspace-optional";

  try {
    assertTenantResourceOwnership(tenantSession, {
      tenantId: scoped.tenant_id,
      workspaceId,
      resourceId: lead.id,
      resourceType: "lead",
    }, scopeClass);
    return true;
  } catch {
    return false;
  }
}
