import { NextResponse } from "next/server";
import { processNextLeadArtifactJob } from "@/lib/ai/artifact-worker";
import { ensureDbReady } from "@/lib/db/queries";
import { ForbiddenError, requirePermission, UnauthorizedError } from "@/lib/auth";

export async function POST() {
  try {
    await requirePermission("ai:verify");
    await ensureDbReady();
    const result = await processNextLeadArtifactJob();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ status: "error", error: err.message }, { status: err.status });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ status: "error", error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
