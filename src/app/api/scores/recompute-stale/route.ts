import { NextResponse } from "next/server";
import { ensureDbReady, recomputeAllLeadQualityScores } from "@/lib/db/queries";
import { ForbiddenError, requirePermission, UnauthorizedError } from "@/lib/auth";

export async function POST() {
  try {
    await requirePermission("scores:recompute");
    await ensureDbReady();
    const count = await recomputeAllLeadQualityScores(500);
    return NextResponse.json({ status: "ok", count });
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
