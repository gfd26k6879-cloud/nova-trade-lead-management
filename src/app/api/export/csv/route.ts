import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  createAuditLog,
  ensureDbReady,
  getCanonicalPlacesForExport,
  getLeadsForExport,
} from "@/lib/db/queries";
import { withTenantDbContext } from "@/lib/db";
import { csvEscape } from "@/lib/csv";
import type { QualificationStatus } from "@/lib/qualification";
import { parseMinReviewsFilter } from "@/lib/lead-filter-parsing";
import {
  requireTenantPermission,
  TenantAuthorizationError,
  type TenantPolicyContext,
  type TenantPolicyEvaluationResult,
} from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
} as const;

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const session = await requireTenantPermission(
      {
        tenantId: params.get("tenantId") ?? undefined,
        workspaceId: params.has("workspaceId") ? params.get("workspaceId") : undefined,
      },
      "data:export",
      {
        action: "data:export",
        policyEvaluator: (context) => evaluateCsvExportPolicy(params, context),
      },
    );
    await ensureDbReady();

    return await runWithTenantContext(session, randomUUID(), () =>
      withTenantDbContext(() => createCsvExport(params, session.email)),
    );
  } catch (err) {
    if (err instanceof TenantAuthorizationError) {
      return privateJsonError(
        err.status === 401 ? "Authentication required" : "Permission denied",
        err.status,
      );
    }
    return privateJsonError("CSV export failed.", 500);
  }
}

function evaluateCsvExportPolicy(
  params: URLSearchParams,
  context: TenantPolicyContext,
): TenantPolicyEvaluationResult {
  const allowed = context.workspaceId === null &&
    context.permission === "data:export" &&
    context.action === "data:export" &&
    context.resource === null &&
    params.get("exportPurpose") === "lead_inventory" &&
    params.get("confirmExport") === "true";
  return { allowed, context };
}

async function createCsvExport(params: URLSearchParams, requestedBy: string): Promise<NextResponse> {
  const dataset = params.get("dataset") ?? "leads";
  const maxRows = Math.min(100000, Math.max(1, parseInt(params.get("limit") ?? "50000", 10) || 50000));

  if (dataset === "canonical") {
    const canonical = await getCanonicalPlacesForExport(maxRows);
    await createAuditLog("csv_exported", "places_master", undefined, {
      dataset,
      rowCount: canonical.length,
      requestedBy,
    });
    const headers = [
        "place_id", "name", "phone", "address", "categories", "rating", "user_rating_count",
        "website_uri", "maps_uri", "business_status", "primary_type", "lat", "lng",
        "completeness_score", "freshness_score", "verification_coverage", "last_seen_at",
        "lead_score", "lead_status", "lead_is_excluded",
    ];

    const rows = canonical.map((row) => [
        row.place_id?.toString() ?? "",
        csvEscape((row.name as string | null) ?? null),
        csvEscape((row.phone as string | null) ?? null),
        csvEscape((row.address as string | null) ?? null),
        csvEscape(parseStringArray(row.categories).join("; ")),
        row.rating?.toString() ?? "",
        row.user_rating_count?.toString() ?? "",
        csvEscape((row.website_uri as string | null) ?? null),
        csvEscape((row.maps_uri as string | null) ?? null),
        row.business_status?.toString() ?? "",
        row.primary_type?.toString() ?? "",
        row.lat?.toString() ?? "",
        row.lng?.toString() ?? "",
        row.completeness_score?.toString() ?? "",
        row.freshness_score?.toString() ?? "",
        row.verification_coverage?.toString() ?? "",
        row.last_seen_at?.toString() ?? "",
        row.lead_score?.toString() ?? "",
        row.lead_status?.toString() ?? "",
        row.lead_is_excluded?.toString() ?? "0",
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="nosite-canonical-${date}.csv"`,
        ...PRIVATE_NO_STORE_HEADERS,
      },
    });
  }

  const leads = await getLeadsForExport({
      search: params.get("search") ?? undefined,
      status: params.get("status") ?? undefined,
      websiteStatus: params.get("websiteStatus") ?? undefined,
      enrichment: params.get("enrichment") ?? undefined,
      minReviews: parseMinReviewsFilter(params.get("minReviews") ?? undefined),
      minRating: params.get("minRating") ? parseFloat(params.get("minRating")!) : undefined,
      minScore: params.get("minScore") ? parseFloat(params.get("minScore")!) : undefined,
      category: params.get("category") ?? undefined,
      businessType: params.get("businessType") ?? undefined,
      sellingNiche: params.get("sellingNiche") ?? undefined,
      qualificationStatus: (params.get("qualificationStatus") as QualificationStatus | null) ?? undefined,
      sortBy: params.get("sortBy") ?? "score",
      sortDir: (params.get("sortDir") ?? "desc") as "asc" | "desc",
  }, maxRows);
  await createAuditLog("csv_exported", "leads", undefined, {
    dataset,
    rowCount: leads.length,
    requestedBy,
    filters: Object.fromEntries(params.entries()),
  });

  const headers = [
      "name", "phone", "address", "category", "business_type", "rating", "review_count",
      "website_status", "website_uri", "maps_url", "score", "status",
      "qualification_status", "selling_niche", "contactability_score", "estimated_deal_value",
      "last_contacted", "discovered_at",
  ];

  const rows = leads.map((l) => [
      csvEscape(l.name),
      csvEscape(l.phone),
      csvEscape(l.address),
      csvEscape(l.categories.join("; ")),
      l.business_type,
      l.rating?.toString() ?? "",
      l.review_count?.toString() ?? "",
      l.website_status,
      csvEscape(l.website_uri),
      csvEscape(l.maps_uri),
      l.score.toFixed(2),
      l.is_excluded ? "excluded" : l.status,
      l.qualification_status,
      csvEscape(l.selling_niche),
      l.contactability_score.toFixed(2),
      l.estimated_deal_value.toFixed(0),
      l.last_contacted_at ?? "",
      l.discovered_at ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nova-trade-leads-${date}.csv"`,
      ...PRIVATE_NO_STORE_HEADERS,
    },
  });
}

function privateJsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, {
    status,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((entry) => String(entry));
  if (raw == null || raw === "") return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
}
