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
});
