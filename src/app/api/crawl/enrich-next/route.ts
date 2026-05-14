import { NextRequest } from "next/server";
import { enrichNextLead } from "@/lib/crawl/enrichment";
import { runInternalWorkerRoute } from "@/lib/internal-worker-route";

export async function POST(request: NextRequest) {
  return runInternalWorkerRoute(request, "enrichment", "crawl:manage", enrichNextLead);
}

export async function GET(request: NextRequest) {
  return runInternalWorkerRoute(request, "enrichment", "crawl:manage", enrichNextLead);
}
