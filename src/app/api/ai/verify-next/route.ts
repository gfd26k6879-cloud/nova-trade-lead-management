import { NextRequest, NextResponse } from "next/server";
import { processNextAiVerificationJob } from "@/lib/ai/verification-worker";
import { runInternalWorkerRoute } from "@/lib/internal-worker-route";

export async function POST(request: NextRequest) {
  return runAiVerificationWorker(request);
}

export async function GET() {
  return NextResponse.json(
    { status: "error", error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}

async function runAiVerificationWorker(request: NextRequest) {
  return runInternalWorkerRoute(request, "ai_verification", "ai:verify", processNextAiVerificationJob);
}
