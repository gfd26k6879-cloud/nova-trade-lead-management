import { NextRequest, NextResponse } from "next/server";
import { processNextAiVerificationJob } from "@/lib/ai/verification-worker";
import { processNextLeadArtifactJob } from "@/lib/ai/artifact-worker";
import { enrichNextLead } from "@/lib/crawl/enrichment";
import { processNextUnit } from "@/lib/crawl/worker";
import { ensureDbReady, recomputeAllLeadQualityScores } from "@/lib/db/queries";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { authorizeInternalWorkerRequest } from "@/lib/internal-worker-auth";

export async function POST(request: NextRequest) {
  return runWorkerTick(request);
}

export async function GET(request: NextRequest) {
  return runWorkerTick(request);
}

async function runWorkerTick(request: NextRequest) {
  try {
    await authorizeInternalWorkerRequest(request, "crawl:manage");
    await ensureDbReady();

    const crawl = await processNextUnit();
    const enrichment = await enrichNextLead();
    const aiVerification = await processNextAiVerificationJob();
    const leadArtifact = await processNextLeadArtifactJob();
    const recomputedScores = await recomputeAllLeadQualityScores(25);

    return NextResponse.json({ status: "ok", crawl, enrichment, aiVerification, leadArtifact, recomputedScores });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ status: "error", error: err.message }, { status: err.status });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ status: "error", error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
