import { NextRequest, NextResponse } from "next/server";
import { recomputeAllLeadQualityScores, repairAiWebsiteFindingConsistency } from "@/lib/db/queries";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { runTenantInternalWorkerRoute } from "@/lib/internal-worker-route";
import { throwIfWorkerAborted } from "@/lib/worker-abort";

const DEFAULT_SCORE_RECOMPUTE_BATCH_SIZE = 100;
const denyUnconfiguredWorkerLease = () => Promise.resolve(null);

export async function POST(request: NextRequest) {
  const response = await runTenantInternalWorkerRoute(
    request,
    "score_recompute",
    "score:recompute",
    async (_context, signal) => {
      throwIfWorkerAborted(signal);
      const batchSize = getScoreRecomputeBatchSize();
      const repaired = await repairAiWebsiteFindingConsistency(batchSize, signal);
      throwIfWorkerAborted(signal);
      const count = await recomputeAllLeadQualityScores(batchSize, signal);
      throwIfWorkerAborted(signal);
      return { status: repaired + count > 0 ? "processed" : "idle", count, repaired };
    },
    {
      resolveLease: denyUnconfiguredWorkerLease,
      sessionPermission: "score:recompute",
      action: "score_recompute:recompute",
    },
  );
  return applyNoStoreHeaders(response);
}

export async function GET() {
  return applyNoStoreHeaders(NextResponse.json(
    { status: "error", error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  ));
}

function getScoreRecomputeBatchSize(): number {
  const configured = Number(process.env.SCORE_RECOMPUTE_BATCH_SIZE);
  if (Number.isFinite(configured) && configured > 0) return Math.min(Math.floor(configured), 500);
  return DEFAULT_SCORE_RECOMPUTE_BATCH_SIZE;
}
