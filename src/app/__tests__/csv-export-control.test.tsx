import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildLeadCsvExportHref,
  confirmAndStartLeadCsvExport,
  CsvExportControl,
} from "@/app/(protected)/leads/csv-export-control";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WORKSPACE_ID = "20000000-0000-4000-8000-000000000001";

describe("CSV export control", () => {
  it("builds only the tenant-wide lead inventory contract from trusted scope", () => {
    const href = buildLeadCsvExportHref(
      { tenantId: TENANT_ID, workspaceId: null },
      new URLSearchParams(
        `search=roofing&status=verified&tenantId=forged&workspaceId=${WORKSPACE_ID}&dataset=canonical&confirmExport=false`,
      ),
    );

    expect(href).not.toBeNull();
    const url = new URL(href!, "https://example.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      search: "roofing",
      status: "verified",
      tenantId: TENANT_ID,
      exportPurpose: "lead_inventory",
      confirmExport: "true",
    });
  });

  it("fails closed outside tenant-wide scope", () => {
    expect(buildLeadCsvExportHref(
      { tenantId: TENANT_ID, workspaceId: WORKSPACE_ID },
      new URLSearchParams(),
    )).toBeNull();

    const html = renderToStaticMarkup(
      <CsvExportControl
        canExport
        exportScope={{ tenantId: TENANT_ID, workspaceId: WORKSPACE_ID }}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("Tenant-wide scope required");

    const missingScopeHtml = renderToStaticMarkup(
      <CsvExportControl canExport={false} exportScope={null} searchParams={new URLSearchParams()} />,
    );
    expect(missingScopeHtml).toContain("disabled");
    expect(missingScopeHtml).toContain("Tenant-wide scope required");
  });

  it("does not start a download until the human confirms", () => {
    const startDownload = vi.fn();
    expect(confirmAndStartLeadCsvExport("/api/export/csv", () => false, startDownload)).toBe(false);
    expect(startDownload).not.toHaveBeenCalled();

    expect(confirmAndStartLeadCsvExport("/api/export/csv", () => true, startDownload)).toBe(true);
    expect(startDownload).toHaveBeenCalledOnce();
    expect(startDownload).toHaveBeenCalledWith("/api/export/csv");
  });

  it("does not render for a matrix-denied role", () => {
    const html = renderToStaticMarkup(
      <CsvExportControl
        canExport={false}
        exportScope={{ tenantId: TENANT_ID, workspaceId: null }}
        searchParams={new URLSearchParams()}
      />,
    );
    expect(html).toBe("");
  });
});
