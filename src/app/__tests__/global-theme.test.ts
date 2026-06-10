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
  });
});
