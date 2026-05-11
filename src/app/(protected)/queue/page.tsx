import type { Metadata } from "next";
import { ensureDbReady, getNowQueue, getScoreBandThresholds } from "@/lib/db/queries";
import { QueueClient } from "./queue-client";

export const metadata: Metadata = { title: "Queue | NoSite Leads" };

export default async function QueuePage() {
  await ensureDbReady();
  const queue = await getNowQueue(25);
  const scoreThresholds = await getScoreBandThresholds();
  return <QueueClient initialQueue={queue} scoreThresholds={scoreThresholds} />;
}
