export const GOOGLE_MAPS_SCRIPT_ID = "nosite-google-maps-js";

export function hasGoogleMapsBrowserKey(apiKey: string | null | undefined): apiKey is string {
  return Boolean(apiKey?.trim());
}

export function buildGoogleMapsScriptUrl(apiKey: string, callbackName: string): string {
  const url = new URL("https://maps.googleapis.com/maps/api/js");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("v", "weekly");
  url.searchParams.set("loading", "async");
  url.searchParams.set("callback", callbackName);
  url.searchParams.set("auth_referrer_policy", "origin");
  url.searchParams.set("libraries", "marker");
  return url.toString();
}
