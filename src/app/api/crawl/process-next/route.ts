import { NextRequest } from "next/server";
import { processNextUnit } from "@/lib/crawl/worker";
import { runInternalWorkerRoute } from "@/lib/internal-worker-route";

export async function POST(request: NextRequest) {
  return runInternalWorkerRoute(request, "crawl", "crawl:manage", processNextUnit);
}

export async function GET(request: NextRequest) {
  return runInternalWorkerRoute(request, "crawl", "crawl:manage", processNextUnit);
}
