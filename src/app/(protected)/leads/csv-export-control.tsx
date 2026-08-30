"use client";

export type LeadExportScope = Readonly<{
  tenantId: string;
  workspaceId: string | null;
}>;

const EXPORT_FILTERS = [
  "search",
  "status",
  "websiteStatus",
  "enrichment",
  "minReviews",
  "minRating",
  "minScore",
  "category",
  "businessType",
  "sellingNiche",
  "qualificationStatus",
  "sortBy",
  "sortDir",
] as const;

export function buildLeadCsvExportHref(
  scope: LeadExportScope,
  currentSearchParams: Pick<URLSearchParams, "get">,
): string | null {
  if (!scope.tenantId || scope.workspaceId !== null) return null;

  const params = new URLSearchParams();
  for (const filter of EXPORT_FILTERS) {
    const value = currentSearchParams.get(filter);
    if (value !== null) params.set(filter, value);
  }
  params.set("tenantId", scope.tenantId);
  params.set("exportPurpose", "lead_inventory");
  params.set("confirmExport", "true");
  return `/api/export/csv?${params.toString()}`;
}

export function confirmAndStartLeadCsvExport(
  href: string,
  confirmExport: (message: string) => boolean,
  startDownload: (href: string) => void,
): boolean {
  const confirmed = confirmExport(
    "Download the filtered tenant-wide lead inventory as CSV? This action is recorded in the audit log.",
  );
  if (!confirmed) return false;
  startDownload(href);
  return true;
}

export function CsvExportControl({
  canExport,
  exportScope,
  searchParams,
  className = "",
}: Readonly<{
  canExport: boolean;
  exportScope: LeadExportScope | null;
  searchParams: Pick<URLSearchParams, "get">;
  className?: string;
}>) {
  const href = exportScope ? buildLeadCsvExportHref(exportScope, searchParams) : null;
  if (!href) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button type="button" className="btn-glass text-xs" disabled aria-describedby="csv-export-scope-status">
          Export CSV
        </button>
        <span id="csv-export-scope-status" role="status" className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Tenant-wide scope required
        </span>
      </div>
    );
  }
  if (!canExport) return null;

  return (
    <button
      type="button"
      className={`btn-glass text-xs ${className}`}
      onClick={() => confirmAndStartLeadCsvExport(
        href,
        (message) => window.confirm(message),
        (downloadHref) => window.location.assign(downloadHref),
      )}
    >
      Export CSV
    </button>
  );
}
