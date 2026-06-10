import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("NavHeader source contract", () => {
  it("uses one admin-only operations menu on desktop", () => {
    const source = readFileSync(join(process.cwd(), "src/components/nav-header.tsx"), "utf8");

    expect(source).toContain('aria-label="Admin menu"');
    expect(source).toContain('className="relative hidden md:block"');
    expect(source).toContain("{isAdmin && (");
    expect(source).toContain("ADMIN_NAV_ITEMS.map");
    expect(source).toContain("item.description");
    expect(source).not.toContain('activeAdminItem ? activeAdminItem.label : "Admin"');
  });

  it("keeps the mobile menu for primary navigation and gates admin links", () => {
    const source = readFileSync(join(process.cwd(), "src/components/nav-header.tsx"), "utf8");

    expect(source).toContain('aria-label="Toggle menu"');
    expect(source).toContain('className="md:hidden"');
    expect(source).toContain("PRIMARY_NAV_ITEMS.map");
    expect(source).toContain("<p className=\"section-label px-3 pt-3\">Admin</p>");
  });

  it("does not mix custom glass button display with responsive hidden utilities", () => {
    const source = readFileSync(join(process.cwd(), "src/components/nav-header.tsx"), "utf8");

    expect(source).not.toMatch(/className="[^"]*btn-glass[^"]*(?:hidden|md:hidden|md:inline|md:flex)/);
    expect(source).not.toMatch(/className="[^"]*(?:hidden|md:hidden|md:inline|md:flex)[^"]*btn-glass/);
  });
});
