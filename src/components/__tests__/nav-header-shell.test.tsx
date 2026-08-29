import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/onboarding",
  useSearchParams: () => ({ get: () => null }),
}));

import { NavHeader } from "@/components/nav-header";

describe("authenticated NavHeader shell", () => {
  it("names the active tenant, workspace, and role while preserving legacy routes", () => {
    const html = renderToStaticMarkup(
      <NavHeader
        email="owner@aster.example"
        role="admin"
        scope={{ tenantName: "Aster Materials", workspaceName: "North America", roleLabel: "Owner", preview: true }}
        logoutAction={async () => undefined}
      />,
    );

    expect(html).toContain('aria-label="Preview tenant and workspace"');
    expect(html).toContain("Preview fixture");
    expect(html).toContain("Aster Materials");
    expect(html).toContain("North America");
    expect(html).toContain("Owner");
    expect(html).toContain('href="/onboarding"');
    expect(html).toContain('href="/knowledge"');
    expect(html).toContain('href="/explore"');
    expect(html).toContain('href="/queue"');
    expect(html).toContain('href="/leads?assigned=me"');
    expect(html).toContain('href="/team"');
  });

  it("keeps compact scope visible until the full scope takes over", () => {
    const source = readFileSync(join(process.cwd(), "src/components/nav-header.tsx"), "utf8");

    expect(source).toContain('<ScopeContext scope={scope} compact className="flex lg:hidden" />');
    expect(source).toContain('<ScopeContext scope={scope} className="hidden lg:flex" />');
  });
});
