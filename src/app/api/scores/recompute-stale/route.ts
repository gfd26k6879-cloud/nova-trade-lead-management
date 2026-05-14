import { NextRequest } from "next/server";
import { recomputeAllLeadQualityScores } from "@/lib/db/queries";
import { runInternalWorkerRoute } from "@/lib/internal-worker-route";

export async function POST(request: NextRequest) {
  return runInternalWorkerRoute(request, "score_recompute", "scores:recompute", async () => {
    const count = await recomputeAllLeadQualityScores(500);
    return { status: count > 0 ? "processed" : "idle", count };
  });
}

export async function GET(request: NextRequest) {
  return POST(request);
}
