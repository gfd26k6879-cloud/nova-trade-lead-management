import { NextRequest, NextResponse } from "next/server";
import { processNextLeadArtifactJob } from "@/lib/ai/artifact-worker";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { runTenantInternalWorkerRoute } from "@/lib/internal-worker-route";

const denyUnconfiguredWorkerLease = () => Promise.resolve(null);

export async function POST(request: NextRequest) {
  const response = await runTenantInternalWorkerRoute(
    request,
    "artifact",
    "queue:operate",
    (_context, signal) => processNextLeadArtifactJob(signal),
    {
      resolveLease: denyUnconfiguredWorkerLease,
      sessionPermission: "queue:operate",
      action: "artifact:process",
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
