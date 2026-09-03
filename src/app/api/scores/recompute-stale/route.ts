import { NextRequest, NextResponse } from "next/server";
import {
  getTenantScoreRecomputeSettings,
  recomputeAllLeadQualityScores,
  repairAiWebsiteFindingConsistency,
} from "@/lib/db/queries";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { runTenantInternalWorkerRoute } from "@/lib/internal-worker-route";
import { throwIfWorkerAborted } from "@/lib/worker-abort";
import { withTenantDbContext } from "@/lib/db";
import { createFailClosedWorkerLeaseResolverRuntime } from "@/lib/tenancy/worker-lease-runtime";

const DEFAULT_SCORE_RECOMPUTE_BATCH_SIZE = 100;
const resolveLease = createFailClosedWorkerLeaseResolverRuntime({
  workerName: "score_recompute",
  action: "score_recompute:recompute",
});

export async function POST(request: NextRequest) {
  const response = await runTenantInternalWorkerRoute(
    request,
    "score_recompute",
    "score:recompute",
    async (_context, signal) => withTenantDbContext(async () => {
      throwIfWorkerAborted(signal);
      const settings = await getTenantScoreRecomputeSettings();
      if (!settings.scheduler_score_recompute_enabled) {
        return { status: "disabled", reason: "Scheduler toggle is paused." };
      }
      const batchSize = getScoreRecomputeBatchSize();
      const repaired = await repairAiWebsiteFindingConsistency(batchSize, signal);
      throwIfWorkerAborted(signal);
      const count = await recomputeAllLeadQualityScores(batchSize, signal);
      throwIfWorkerAborted(signal);
      return { status: repaired + count > 0 ? "processed" : "idle", count, repaired };
    }),
    {
      resolveLease,
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
