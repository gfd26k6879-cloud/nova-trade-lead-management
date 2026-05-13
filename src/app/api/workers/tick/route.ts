import { NextRequest, NextResponse } from "next/server";
import { processNextAiVerificationJob } from "@/lib/ai/verification-worker";
import { enrichNextLead } from "@/lib/crawl/enrichment";
import { processNextUnit } from "@/lib/crawl/worker";
import { ensureDbReady, recomputeAllLeadQualityScores } from "@/lib/db/queries";
import { ForbiddenError, requirePermission, UnauthorizedError } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    await authorizeWorkerTick(request);
    await ensureDbReady();

    const crawl = await processNextUnit();
    const enrichment = await enrichNextLead();
    const aiVerification = await processNextAiVerificationJob();
    const recomputedScores = await recomputeAllLeadQualityScores(25);

    return NextResponse.json({ status: "ok", crawl, enrichment, aiVerification, recomputedScores });
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
  const secret = process.env.WORKER_CRON_SECRET?.trim();
  if (secret) {
    const header = request.headers.get("authorization") ?? "";
    if (header === `Bearer ${secret}`) return;
  }
  await requirePermission("crawl:manage");
}
