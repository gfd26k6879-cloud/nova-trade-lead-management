import { NextResponse, type NextRequest } from "next/server";
import {
  createAuditLog,
  ensureDbReady,
  getCanonicalPlacesForExport,
  getLeadsForExport,
} from "@/lib/db/queries";
import { ForbiddenError, requirePermission, UnauthorizedError } from "@/lib/auth";
import { csvEscape } from "@/lib/csv";
import type { QualificationStatus } from "@/lib/qualification";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("export:csv");
    await ensureDbReady();
    const params = request.nextUrl.searchParams;
    const dataset = params.get("dataset") ?? "leads";
    const maxRows = Math.min(100000, Math.max(1, parseInt(params.get("limit") ?? "50000", 10) || 50000));

    if (dataset === "canonical") {
      const canonical = await getCanonicalPlacesForExport(maxRows);
      await createAuditLog("csv_exported", "places_master", undefined, {
        dataset,
        rowCount: canonical.length,
        requestedBy: session.email,
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
        },
      });
    }

    const leads = await getLeadsForExport({
      search: params.get("search") ?? undefined,
      status: params.get("status") ?? undefined,
      websiteStatus: params.get("websiteStatus") ?? undefined,
      enrichment: params.get("enrichment") ?? undefined,
      minReviews: params.get("minReviews") ? parseInt(params.get("minReviews")!) : undefined,
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
      requestedBy: session.email,
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
        "Content-Disposition": `attachment; filename="nosite-leads-${date}.csv"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
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
