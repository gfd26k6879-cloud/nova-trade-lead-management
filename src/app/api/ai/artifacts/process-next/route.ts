import { NextRequest } from "next/server";
import { processNextLeadArtifactJob } from "@/lib/ai/artifact-worker";
import { runInternalWorkerRoute } from "@/lib/internal-worker-route";

export async function POST(request: NextRequest) {
  return runInternalWorkerRoute(request, "artifact", "ai:verify", processNextLeadArtifactJob);
}

export async function GET(request: NextRequest) {
  return runInternalWorkerRoute(request, "artifact", "ai:verify", processNextLeadArtifactJob);
}
