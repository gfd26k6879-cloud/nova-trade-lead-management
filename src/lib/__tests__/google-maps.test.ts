import { describe, expect, it } from "vitest";
import { buildGoogleMapsScriptUrl, hasGoogleMapsBrowserKey } from "@/lib/google-maps";

describe("google maps browser loader config", () => {
  it("requires an explicit browser-restricted maps key", () => {
    expect(hasGoogleMapsBrowserKey(undefined)).toBe(false);
    expect(hasGoogleMapsBrowserKey("")).toBe(false);
    expect(hasGoogleMapsBrowserKey("   ")).toBe(false);
    expect(hasGoogleMapsBrowserKey("AIza-browser-key")).toBe(true);
  });

  it("builds a Maps JS URL with only the marker library and without paid Places, Routes, or Geocoding libraries", () => {
    const url = new URL(buildGoogleMapsScriptUrl("AIza-browser-key", "__nositeGoogleMapsReady"));

    expect(url.origin).toBe("https://maps.googleapis.com");
    expect(url.pathname).toBe("/maps/api/js");
    expect(url.searchParams.get("key")).toBe("AIza-browser-key");
    expect(url.searchParams.get("callback")).toBe("__nositeGoogleMapsReady");
    expect(url.searchParams.get("loading")).toBe("async");
    expect(url.searchParams.get("auth_referrer_policy")).toBe("origin");
    expect(url.searchParams.get("libraries")).toBe("marker");
    expect(url.search).not.toMatch(/places|geocod|routes|directions/i);
  });
});
