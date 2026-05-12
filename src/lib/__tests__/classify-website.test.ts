import { describe, it, expect } from "vitest";
import { classifyWebsite } from "../classify-website";

describe("classifyWebsite", () => {
  it("returns 'none' for null or undefined input", async () => {
    expect(classifyWebsite(null)).toBe("none");
    expect(classifyWebsite(undefined)).toBe("none");
  });

  it("returns 'none' for empty string", async () => {
    expect(classifyWebsite("")).toBe("none");
    expect(classifyWebsite("   ")).toBe("none");
  });

  it("returns 'none' for invalid URL", async () => {
    expect(classifyWebsite("not-a-url")).toBe("none");
  });

  it("returns 'social' for Facebook URLs", async () => {
    expect(classifyWebsite("https://www.facebook.com/mybusiness")).toBe("social");
    expect(classifyWebsite("https://facebook.com/page")).toBe("social");
  });

  it("returns 'social' for Instagram URLs", async () => {
    expect(classifyWebsite("https://www.instagram.com/mybiz")).toBe("social");
    expect(classifyWebsite("https://instagram.com/mybiz")).toBe("social");
  });

  it("returns 'social' for other social platforms", async () => {
    expect(classifyWebsite("https://linktr.ee/mybiz")).toBe("social");
    expect(classifyWebsite("https://www.tiktok.com/@mybiz")).toBe("social");
    expect(classifyWebsite("https://www.yelp.com/biz/something")).toBe("social");
    expect(classifyWebsite("https://www.linkedin.com/company/test")).toBe("social");
  });

  it("returns 'basic' for Google business sites", async () => {
    expect(classifyWebsite("https://mybusiness.business.site")).toBe("basic");
    expect(classifyWebsite("https://sites.google.com/view/mybiz")).toBe("basic");
  });

  it("returns 'basic' for Wix, Squarespace, etc.", () => {
    expect(classifyWebsite("https://mysite.wix.com/home")).toBe("basic");
    expect(classifyWebsite("https://mysite.squarespace.com")).toBe("basic");
    expect(classifyWebsite("https://mysite.weebly.com")).toBe("basic");
  });

  it("returns 'custom' for regular domains", async () => {
    expect(classifyWebsite("https://www.mybusiness.com")).toBe("custom");
    expect(classifyWebsite("https://dentist-office.net")).toBe("custom");
    expect(classifyWebsite("https://example.org/page")).toBe("custom");
  });

  it("accepts custom host lists", async () => {
    expect(classifyWebsite("https://myplatform.com/biz", ["myplatform.com"])).toBe("social");
    expect(classifyWebsite("https://mybuilder.io/site", undefined, ["mybuilder.io"])).toBe("basic");
  });

  it("handles subdomains of social hosts", async () => {
    expect(classifyWebsite("https://m.facebook.com/page")).toBe("social");
  });
});
