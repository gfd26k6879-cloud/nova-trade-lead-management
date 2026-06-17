import { NextRequest, NextResponse } from "next/server";
import { processNextUnit } from "@/lib/crawl/worker";
import { runInternalWorkerRoute } from "@/lib/internal-worker-route";

export async function POST(request: NextRequest) {
  return runInternalWorkerRoute(request, "crawl", "crawl:manage", processNextUnit);
}

export async function GET() {
  return NextResponse.json(
    { status: "error", error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  );
}
