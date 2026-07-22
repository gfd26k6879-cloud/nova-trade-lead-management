import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("global theme tokens", () => {
  it("defines light and dark themes globally", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain("color-scheme: light");
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("color-scheme: dark");
    expect(css).toContain("--background: #f0eae4");
    expect(css).toContain("--background: #141412");
  });

  it("bootstraps the theme on the root document before render", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

    expect(layout).toContain('window.localStorage.getItem("nosite-theme")');
    expect(layout).toContain("prefers-color-scheme: dark");
    expect(layout).toContain("document.documentElement.dataset.theme = theme");
    expect(layout).toContain('classList.toggle("dark", theme === "dark")');
    expect(layout).toContain('headers()).get("x-nonce")');
    expect(layout).toContain("<script nonce={nonce}");
  });

  it("exposes a header control that changes the same persisted theme contract", () => {
    const navHeader = readFileSync(join(process.cwd(), "src/components/nav-header.tsx"), "utf8");
    const themeToggle = readFileSync(join(process.cwd(), "src/components/theme-toggle.tsx"), "utf8");

    expect(navHeader).toContain("ThemeToggle");
    expect(themeToggle).toContain('const STORAGE_KEY = "nosite-theme"');
    expect(themeToggle).toContain("document.documentElement.dataset.theme = theme");
    expect(themeToggle).toContain('classList.toggle("dark", theme === "dark")');
    expect(themeToggle).toContain("window.localStorage.setItem(STORAGE_KEY, theme)");
    expect(themeToggle).toContain("Switch to");
    expect(themeToggle).toContain("btn-icon");
    expect(themeToggle).not.toContain('nextTheme === "dark" ? "Dark" : "Light"');
  });

  it("keeps critical workflow states on semantic light/dark tokens", () => {
    const quality = readFileSync(join(process.cwd(), "src/app/(protected)/quality/quality-client.tsx"), "utf8");
    const settings = readFileSync(join(process.cwd(), "src/app/(protected)/settings/settings-client.tsx"), "utf8");
    const kanban = readFileSync(join(process.cwd(), "src/app/(protected)/leads/kanban-client.tsx"), "utf8");

    expect(quality).toContain('getStatusToneStyle');
    expect(quality).not.toMatch(/badge\("#[0-9a-f]/i);
    expect(settings).toContain('getStatusToneStyle');
    expect(settings).not.toMatch(/color:\s*settings\.[^?]+\?\s*"#[0-9a-f]/i);
    expect(kanban).toContain('var(--surface-card)');
    expect(kanban).not.toContain("window.prompt");
    expect(kanban).not.toContain("STATUS_COLORS");
  });

  it("keeps protected operational surfaces on theme-aware tokens", () => {
    const operationalSurfaces = [
      "src/app/(protected)/leads/[id]/lead-detail-client.tsx",
      "src/app/(protected)/dashboard/dashboard-client.tsx",
      "src/app/(protected)/scheduler/scheduler-client.tsx",
      "src/app/(protected)/coverage/coverage-client.tsx",
      "src/app/(protected)/fulfillment/fulfillment-client.tsx",
      "src/app/(protected)/team/page.tsx",
      "src/components/manual-lead-modal.tsx",
    ];

    for (const path of operationalSurfaces) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      expect(source).toContain("var(--surface");
      expect(source).not.toMatch(/rgba\(\s*255\s*,\s*255\s*,\s*255/i);
      expect(source).not.toMatch(/text-(?:red|orange|amber|yellow|green|emerald|blue|cyan|indigo|violet)-\d+/i);
      expect(source).not.toMatch(/color:\s*[^,\n}]*["']#[0-9a-f]{3,8}["']/i);
    }
  });
});
