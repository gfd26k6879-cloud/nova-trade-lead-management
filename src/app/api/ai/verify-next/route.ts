import { NextRequest } from "next/server";
import { processNextAiVerificationJob } from "@/lib/ai/verification-worker";
import { runInternalWorkerRoute } from "@/lib/internal-worker-route";

export async function POST(request: NextRequest) {
  return runAiVerificationWorker(request);
}

export async function GET(request: NextRequest) {
  return runAiVerificationWorker(request);
}

async function runAiVerificationWorker(request: NextRequest) {
  return runInternalWorkerRoute(request, "ai_verification", "ai:verify", processNextAiVerificationJob);
}
