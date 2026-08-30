import { NextResponse } from "next/server";
import { ForbiddenError, requirePermission, UnauthorizedError } from "@/lib/auth";
import { isDbStatementTimeoutError, isTransientDbError, withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, getStaleClientReadQueries } from "@/lib/db/queries";
import { applyNoStoreHeaders } from "@/lib/http-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePermission("settings:manage");
    const staleClientReads = await withDbStatementTimeout(8_000, async () => {
      await ensureDbReady();
      return getStaleClientReadQueries(60);
    });
    const safeStaleClientReads = staleClientReads.map((activity) => ({
      pid: activity.pid,
      state: activity.state,
      waitEventType: activity.waitEventType,
      waitEvent: activity.waitEvent,
      ageSeconds: activity.ageSeconds,
    }));
    return applyNoStoreHeaders(NextResponse.json({
      status: safeStaleClientReads.length > 0 ? "warning" : "ok",
      checkedAt: new Date().toISOString(),
      staleClientReads: safeStaleClientReads,
    }));
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      const message = error instanceof UnauthorizedError
        ? "Authentication required"
        : "You do not have permission to perform this action";
      return applyNoStoreHeaders(NextResponse.json({ status: "error", error: message }, { status: error.status }));
    }
    if (isDbStatementTimeoutError(error)) {
      return applyNoStoreHeaders(NextResponse.json({ status: "error", error: "db_statement_timeout" }, { status: 503 }));
    }
    if (isTransientDbError(error)) {
      return applyNoStoreHeaders(NextResponse.json({ status: "error", error: "transient_db_error" }, { status: 503 }));
    }
    return applyNoStoreHeaders(NextResponse.json({ status: "error", error: "db_activity_unavailable" }, { status: 500 }));
  }
}
