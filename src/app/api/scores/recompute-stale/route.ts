import { NextRequest } from "next/server";
import { recomputeAllLeadQualityScores, repairAiWebsiteFindingConsistency } from "@/lib/db/queries";
import { runInternalWorkerRoute } from "@/lib/internal-worker-route";

const DEFAULT_SCORE_RECOMPUTE_BATCH_SIZE = 100;

export async function POST(request: NextRequest) {
  return runInternalWorkerRoute(request, "score_recompute", "scores:recompute", async () => {
    const batchSize = getScoreRecomputeBatchSize();
    const repaired = await repairAiWebsiteFindingConsistency(batchSize);
    const count = await recomputeAllLeadQualityScores(batchSize);
    return { status: repaired + count > 0 ? "processed" : "idle", count, repaired };
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}

function getScoreRecomputeBatchSize(): number {
  const configured = Number(process.env.SCORE_RECOMPUTE_BATCH_SIZE);
  if (Number.isFinite(configured) && configured > 0) return Math.min(Math.floor(configured), 500);
  return DEFAULT_SCORE_RECOMPUTE_BATCH_SIZE;
}
