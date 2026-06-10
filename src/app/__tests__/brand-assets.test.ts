import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const brandAssetPaths = [
  "public/icons/nosite-logo.svg",
  "public/icons/favicon-16x16.png",
  "public/icons/favicon-32x32.png",
  "public/icons/favicon-48x48.png",
  "public/icons/apple-touch-icon.png",
  "public/icons/web-app-192x192.png",
  "public/icons/web-app-512x512.png",
  "public/site.webmanifest",
  "src/app/favicon.ico",
  "src/app/icon.png",
  "src/app/apple-icon.png",
];

describe("brand assets", () => {
  it("ships generated favicon and web app icon variants", () => {
    for (const assetPath of brandAssetPaths) {
      const absolutePath = join(process.cwd(), assetPath);

      expect(existsSync(absolutePath), `${assetPath} should exist`).toBe(true);
      expect(statSync(absolutePath).size, `${assetPath} should not be empty`).toBeGreaterThan(0);
    }
  });

  it("wires the generated logo into app metadata and primary brand surfaces", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    const navHeader = readFileSync(join(process.cwd(), "src/components/nav-header.tsx"), "utf8");
    const loginPage = readFileSync(join(process.cwd(), "src/app/login/page.tsx"), "utf8");
    const brandMark = readFileSync(join(process.cwd(), "src/components/brand-mark.tsx"), "utf8");

    expect(layout).toContain('manifest: "/site.webmanifest"');
    expect(layout).toContain('url: "/icons/nosite-logo.svg"');
    expect(layout).toContain('url: "/icons/apple-touch-icon.png"');
    expect(brandMark).toContain('src="/icons/nosite-logo.svg"');
    expect(navHeader).toContain("<BrandMark />");
    expect(loginPage).toContain('<BrandMark size="login"');
    expect(navHeader).not.toContain('<path d="M12 2L2 7l10 5 10-5-10-5z"');
    expect(loginPage).not.toContain('<path d="M12 2L2 7l10 5 10-5-10-5z"');
  });
});
