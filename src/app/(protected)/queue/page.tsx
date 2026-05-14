import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ensureDbReady, getNowQueue, getQualityLeads, getScoreBandThresholds } from "@/lib/db/queries";
import { QueueClient } from "./queue-client";

export const metadata: Metadata = { title: "Queue | NoSite Leads" };

export default async function QueuePage() {
  await requirePermission("view:workspace");
  await ensureDbReady();
  const queue = await getNowQueue(100);
  const manualReview = await getQualityLeads({ qualityBucket: "needs_manual_review", pageSize: 50 });
  const scoreThresholds = await getScoreBandThresholds();
  return <QueueClient initialQueue={queue} manualReviewQueue={manualReview.leads} scoreThresholds={scoreThresholds} />;
}
