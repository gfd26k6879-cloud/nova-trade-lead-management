import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withDbStatementTimeout, withTenantDbContext } from "@/lib/db/index";
import {
  ensureDbReady,
  getConfiguredGoogleMapsBrowserApiKey,
  getLeadMapPoints,
  getLeadMapZipCoverage,
} from "@/lib/db/queries";
import { buildExploreQueryState, parseMapPointLimit, type ExploreParams } from "@/lib/explore-filters";
import { applyNoStoreHeaders } from "@/lib/http-cache";
import { constrainExploreFiltersForSession } from "@/lib/lead-access";
import { requireTenantPermission, TenantAuthorizationError } from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";

export const dynamic = "force-dynamic";

function privateNoStore<T extends { headers: Headers }>(response: T): T {
  const secured = applyNoStoreHeaders(response);
  secured.headers.set("Vary", "Cookie");
  return secured;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const generatedAt = new Date().toISOString();
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries()) as ExploreParams;
  const limit = parseMapPointLimit(url.searchParams.get("limit"));
  const includeTotal = url.searchParams.get("includeTotal") === "true" || url.searchParams.get("includeTotal") === "1";

  try {
    const session = await requireTenantPermission(
      {
        tenantId: url.searchParams.get("tenantId") ?? undefined,
        workspaceId: url.searchParams.has("workspaceId") ? url.searchParams.get("workspaceId") : undefined,
      },
      "account:read",
      { action: "explore.map.read" },
    );
    if (session.workspaceId !== null) {
      throw new TenantAuthorizationError(403, "WORKSPACE_SCOPE_INVALID");
    }
    await ensureDbReady();
    const { filters: rawFilters } = buildExploreQueryState(params);
    const filters = constrainExploreFiltersForSession(session, rawFilters);

    const [mapResult, zipCoverage, googleMapsApiKey] = await runWithTenantContext(
      session,
      randomUUID(),
      () => withTenantDbContext(() => withDbStatementTimeout(8_000, async () => {
        const pointsResult = await getLeadMapPoints(filters, limit, { includeTotal, fastOrder: true });
        const coverage = await getLeadMapZipCoverage();
        const apiKey = await getConfiguredGoogleMapsBrowserApiKey();
        return [pointsResult, coverage, apiKey] as const;
      })),
    );

    const durationMs = Date.now() - startedAt;
    console.info("route_timing", {
      route: "/api/explore/map",
      durationMs,
      status: 200,
      mapPointLimit: limit,
      includeTotal,
    });

    return privateNoStore(NextResponse.json({
      points: mapResult.points,
      totalMapped: mapResult.totalMapped,
      zipCoverage,
      mapPointLimit: limit,
      googleMapsConfigured: Boolean(googleMapsApiKey),
      googleMapsApiKey: googleMapsApiKey || null,
      generatedAt,
    }));
  } catch (error) {
    if (error instanceof TenantAuthorizationError) {
      console.warn("route_timing", {
        route: "/api/explore/map",
        durationMs: Date.now() - startedAt,
        status: error.status,
        reason: error.name,
      });
      return privateNoStore(NextResponse.json({
        points: [],
        totalMapped: 0,
        zipCoverage: [],
        mapPointLimit: limit,
        googleMapsConfigured: false,
        googleMapsApiKey: null,
        generatedAt,
        error: error.status === 401 ? "Authentication required" : "Permission denied",
      }, { status: error.status }));
    }

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
    return privateNoStore(NextResponse.json({
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
