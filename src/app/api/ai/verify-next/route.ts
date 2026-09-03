import { NextRequest, NextResponse } from "next/server";
import { processNextAiVerificationJob } from "@/lib/ai/verification-worker";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { runTenantInternalWorkerRoute } from "@/lib/internal-worker-route";
import { createFailClosedWorkerLeaseResolverRuntime } from "@/lib/tenancy/worker-lease-runtime";

export async function POST(request: NextRequest) {
  return applyNoStoreHeaders(await runAiVerificationWorker(request));
}

export async function GET() {
  return applyNoStoreHeaders(NextResponse.json(
    { status: "error", error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  ));
}

async function runAiVerificationWorker(request: NextRequest) {
  return runTenantInternalWorkerRoute(
    request,
    "ai_verification",
    "queue:operate",
    (_context, signal) => processNextAiVerificationJob(signal),
    {
      resolveLease: createFailClosedWorkerLeaseResolverRuntime({
        workerName: "ai_verification",
        action: "ai_verification:process",
      }),
      sessionPermission: "queue:operate",
      action: "ai_verification:process",
    },
  );
}
