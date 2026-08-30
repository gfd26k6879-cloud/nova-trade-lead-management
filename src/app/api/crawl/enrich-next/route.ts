import { NextRequest, NextResponse } from "next/server";
import { enrichNextLead } from "@/lib/crawl/enrichment";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { runTenantInternalWorkerRoute } from "@/lib/internal-worker-route";

const denyUnconfiguredWorkerLease = () => Promise.resolve(null);

export async function POST(request: NextRequest) {
  return runTenantInternalWorkerRoute(
    request,
    "enrichment",
    "queue:operate",
    (_context, signal) => enrichNextLead(signal),
    {
      resolveLease: denyUnconfiguredWorkerLease,
      sessionPermission: "queue:operate",
      action: "enrichment:process",
    },
  );
}

export async function GET() {
  return applyNoStoreHeaders(NextResponse.json(
    { status: "error", error: "Method Not Allowed" },
    { status: 405, headers: { Allow: "POST" } },
  ));
}
