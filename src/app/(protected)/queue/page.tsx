import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth";
import { ensureDbReady, getResearcherWorkbench, getScoreBandThresholds } from "@/lib/db/queries";
import { QueueClient } from "./queue-client";

export const metadata: Metadata = { title: "Workbench | NoSite Leads" };

export default async function QueuePage() {
  const session = await requirePermission("view:workspace");
  await ensureDbReady();
  const [workbench, scoreThresholds] = await Promise.all([
    getResearcherWorkbench(session.userId),
    getScoreBandThresholds(),
  ]);
  return (
    <QueueClient
      workbench={workbench}
      scoreThresholds={scoreThresholds}
      currentUser={{ userId: session.userId, email: session.email, role: session.role }}
    />
  );
}
