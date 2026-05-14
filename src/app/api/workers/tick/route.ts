import { NextRequest, NextResponse } from "next/server";
import { processNextAiVerificationJob } from "@/lib/ai/verification-worker";
import { processNextLeadArtifactJob } from "@/lib/ai/artifact-worker";
import { enrichNextLead } from "@/lib/crawl/enrichment";
import { processNextUnit } from "@/lib/crawl/worker";
import { ensureDbReady, recomputeAllLeadQualityScores } from "@/lib/db/queries";
import { ForbiddenError, requirePermission, UnauthorizedError } from "@/lib/auth";

export async function POST(request: NextRequest) {
  return runWorkerTick(request);
}

export async function GET(request: NextRequest) {
  return runWorkerTick(request);
}

async function runWorkerTick(request: NextRequest) {
  try {
    await authorizeWorkerTick(request);
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

async function authorizeWorkerTick(request: NextRequest): Promise<void> {
  const secrets = [
    process.env.WORKER_CRON_SECRET?.trim(),
    process.env.CRON_SECRET?.trim(),
  ].filter(Boolean);
  if (secrets.length > 0) {
    const header = request.headers.get("authorization") ?? "";
    if (secrets.some((secret) => header === `Bearer ${secret}`)) return;
  }
  await requirePermission("crawl:manage");
}
