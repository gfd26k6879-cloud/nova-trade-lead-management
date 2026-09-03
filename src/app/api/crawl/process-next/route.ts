import { NextRequest, NextResponse } from "next/server";
import { processNextUnit } from "@/lib/crawl/worker";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { runTenantInternalWorkerRoute } from "@/lib/internal-worker-route";
import { createFailClosedWorkerLeaseResolverRuntime } from "@/lib/tenancy/worker-lease-runtime";

const resolveLease = createFailClosedWorkerLeaseResolverRuntime({
  workerName: "crawl",
  action: "crawl:process",
});

export async function POST(request: NextRequest) {
  return runTenantInternalWorkerRoute(
    request,
    "crawl",
    "queue:operate",
    (_context, signal) => processNextUnit(signal),
    {
      resolveLease,
      sessionPermission: "queue:operate",
      action: "crawl:process",
    },
  );
}

export async function GET() {
  return applyNoStoreHeaders(NextResponse.json(
    { status: "error", error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  ));
}
