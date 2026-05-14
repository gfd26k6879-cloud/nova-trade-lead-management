import { NextRequest, NextResponse } from "next/server";
import { processNextAiVerificationJob } from "@/lib/ai/verification-worker";
import { ensureDbReady } from "@/lib/db/queries";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth";
import { authorizeInternalWorkerRequest } from "@/lib/internal-worker-auth";

export async function POST(request: NextRequest) {
  return runAiVerificationWorker(request);
}

export async function GET(request: NextRequest) {
  return runAiVerificationWorker(request);
}

async function runAiVerificationWorker(request: NextRequest) {
  try {
    await authorizeInternalWorkerRequest(request, "ai:verify");
    await ensureDbReady();
    const result = await processNextAiVerificationJob();
    return NextResponse.json(result);
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
