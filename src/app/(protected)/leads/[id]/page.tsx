import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { ensureDbReady, getAdminRequests, getDemoByLeadId, getLatestAiVerification, getLeadAiArtifacts, getLeadById, getLeadNotes, getOutreachEvents, getScoreBandThresholds, getSettings } from "@/lib/db/queries";
import { canReadLeadForSession } from "@/lib/lead-access";
import { computeScoreWithBreakdown } from "@/lib/scoring";
import { computeDensityByAddress } from "@/lib/competitive-density";
import type { WebsiteStatus } from "@/lib/classify-website";
import { LeadDetailClient } from "./lead-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  await ensureDbReady();
  const lead = await getLeadById(id);
  return { title: `${lead?.name ?? "Lead"} | Nova Trade Lead Management` };
}

export default async function LeadDetailPage({ params }: Props) {
  const session = await requirePermission("view:workspace");
  const { id } = await params;
  await ensureDbReady();
  const lead = await getLeadById(id);

  if (!lead) {
    notFound();
  }
  if (!await canReadLeadForSession(session, lead)) {
    notFound();
  }

  const events = await getOutreachEvents(id);
  const adminRequests = await getAdminRequests({ leadId: id, status: "open" });
  const leadNotes = await getLeadNotes(id);
  const demo = await getDemoByLeadId(id);
  const latestAiVerification = await getLatestAiVerification(id);
  const aiArtifacts = await getLeadAiArtifacts(id);
  const density = await computeDensityByAddress(lead.address, lead.primary_type);
  const scoreThresholds = await getScoreBandThresholds();

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

  return (
    <LeadDetailClient
      lead={lead}
      initialEvents={events}
      initialAdminRequests={adminRequests}
      initialLeadNotes={leadNotes}
      initialDemo={demo}
      initialAiVerification={latestAiVerification}
      initialAiArtifacts={aiArtifacts}
      scoreBreakdown={breakdown}
      density={density}
      scoreThresholds={scoreThresholds}
      currentUser={{ userId: session.userId, email: session.email, role: session.role }}
    />
  );
}
