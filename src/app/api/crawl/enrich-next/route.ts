import { NextResponse } from "next/server";
import { ensureDbReady } from "@/lib/db/queries";
import { enrichNextLead } from "@/lib/crawl/enrichment";
import { requireSession, UnauthorizedError } from "@/lib/auth";

export async function POST() {
  try {
    await requireSession();
    ensureDbReady();
    const result = await enrichNextLead();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ status: "error", error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
