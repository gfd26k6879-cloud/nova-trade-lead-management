import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/http-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  // Database activity is platform-wide. Keep this endpoint closed until a
  // named platform-operations authority can be resolved without falling back
  // to an ordinary tenant or legacy application role.
  return applyNoStoreHeaders(NextResponse.json(
    { status: "error", error: "Permission denied" },
    { status: 403 },
  ));
}
