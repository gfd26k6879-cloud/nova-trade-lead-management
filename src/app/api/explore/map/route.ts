import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { withDbStatementTimeout } from "@/lib/db/index";
import {
  ensureDbReady,
  getConfiguredGoogleMapsBrowserApiKey,
  getLeadMapPoints,
  getLeadMapZipCoverage,
} from "@/lib/db/queries";
import { buildExploreQueryState, parseMapPointLimit, type ExploreParams } from "@/lib/explore-filters";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { constrainExploreFiltersForSession } from "@/lib/lead-access";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const generatedAt = new Date().toISOString();
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries()) as ExploreParams;
  const limit = parseMapPointLimit(url.searchParams.get("limit"));
  const includeTotal = url.searchParams.get("includeTotal") === "true" || url.searchParams.get("includeTotal") === "1";

  try {
    const session = await requirePermission("view:workspace");
    await ensureDbReady();
    const { filters: rawFilters } = buildExploreQueryState(params, session.userId);
    const filters = constrainExploreFiltersForSession(session, rawFilters);

    const [mapResult, zipCoverage, googleMapsApiKey] = await withDbStatementTimeout(8_000, async () => {
      const pointsResult = await getLeadMapPoints(filters, limit, { includeTotal, fastOrder: true });
      const coverage = await getLeadMapZipCoverage();
      const apiKey = await getConfiguredGoogleMapsBrowserApiKey();
      return [pointsResult, coverage, apiKey] as const;
    });

    const durationMs = Date.now() - startedAt;
    console.info("route_timing", {
      route: "/api/explore/map",
      durationMs,
      status: 200,
      mapPointLimit: limit,
      includeTotal,
    });

    return applyNoStoreHeaders(NextResponse.json({
      points: mapResult.points,
      totalMapped: mapResult.totalMapped,
      zipCoverage,
      mapPointLimit: limit,
      googleMapsConfigured: Boolean(googleMapsApiKey),
      googleMapsApiKey: googleMapsApiKey || null,
      generatedAt,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /statement timeout|canceling statement|timeout|timed out/i.test(message);
    const status = timedOut ? 504 : 500;
    console.error("route_timing", {
      route: "/api/explore/map",
      durationMs: Date.now() - startedAt,
      status,
      reason: timedOut ? "timeout" : "error",
      error: message,
    });
    return applyNoStoreHeaders(NextResponse.json({
      points: [],
      totalMapped: 0,
      zipCoverage: [],
      mapPointLimit: limit,
      googleMapsConfigured: false,
      googleMapsApiKey: null,
      generatedAt,
      error: timedOut ? "Map data is taking too long. Try again." : "Map data is temporarily unavailable. Try again.",
    }, { status }));
  }
}
