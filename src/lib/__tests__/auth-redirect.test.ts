import { describe, expect, it } from "vitest";

import { normalizeAuthNextPath } from "@/lib/auth-redirect";

describe("normalizeAuthNextPath", () => {
  it.each([
    ["missing value", null],
    ["empty value", ""],
    ["absolute URL", "https://attacker.example/collect"],
    ["network path", "//attacker.example/collect"],
    ["backslash authority", "/\\attacker.example/collect"],
    ["mixed slash authority", "/\\/attacker.example/collect"],
    ["tab parser ambiguity", "/\t/attacker.example/collect"],
    ["newline parser ambiguity", "/\n/attacker.example/collect"],
    ["delete control character", "/\u007fattacker.example/collect"],
  ])("falls back for %s", (_label, next) => {
    expect(normalizeAuthNextPath(next)).toBe("/reset-password");
  });

  it.each([
    "/reset-password",
    "/queue?view=mine",
    "/leads/lead-1#notes",
    "/search?q=https%3A%2F%2Fexample.test",
    "/search?q=C:\\temp#result",
    "/notes#folder\\item",
  ])("preserves the legitimate application-local path %s", (next) => {
    expect(normalizeAuthNextPath(next)).toBe(next);
  });
});
