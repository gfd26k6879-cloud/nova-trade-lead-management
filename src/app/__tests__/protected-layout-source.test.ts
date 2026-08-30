import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("protected layout fulfillment badge", () => {
  it("queries fulfillment pressure for admins only and fails closed", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(protected)/layout.tsx"), "utf8");

    expect(source).toContain('session.role === "admin"');
    expect(source).toContain("getAdminFulfillmentSummary");
    expect(source).toContain("fulfillmentCount = (await getAdminFulfillmentSummary()).openTotal");
    expect(source).toContain("catch");
    expect(source).toContain("fulfillmentCount = 0");
    expect(source).toContain("fulfillmentCount={fulfillmentCount}");
  });

  it("uses canonical tenant-session scope with one non-enumerating legacy preview fallback", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(protected)/layout.tsx"), "utf8");
    const styles = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(source).toContain("getTenantSession({})");
    expect(source).toContain("tenantSession.tenantId");
    expect(source).toContain("tenantSession.workspaceId");
    expect(source).toContain("tenantSession?.userId === session.userId");
    expect(source).toContain("roleLabel: tenantSession.role");
    expect(source).toContain("LEGACY_PREVIEW_SHELL_SCOPE");
    expect(source).toContain('roleLabel: "Tenant role unavailable"');
    expect(source).toContain("preview: true");
    expect(source).toContain("preview: false");
    expect(source).not.toContain("roleLabel: session.role");
    expect(source).toContain('href="#main-content"');
    expect(source).toContain('id="main-content"');
    expect(styles).toContain(".btn-primary:focus-visible");
    expect(styles).toContain(".nav-link:focus-visible");
  });
});
