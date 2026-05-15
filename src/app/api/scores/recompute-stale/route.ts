import { NextRequest } from "next/server";
import { recomputeAllLeadQualityScores, repairAiWebsiteFindingConsistency } from "@/lib/db/queries";
import { runInternalWorkerRoute } from "@/lib/internal-worker-route";

export async function POST(request: NextRequest) {
  return runInternalWorkerRoute(request, "score_recompute", "scores:recompute", async () => {
    const repaired = await repairAiWebsiteFindingConsistency(500);
    const count = await recomputeAllLeadQualityScores(500);
    return { status: repaired + count > 0 ? "processed" : "idle", count, repaired };
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
