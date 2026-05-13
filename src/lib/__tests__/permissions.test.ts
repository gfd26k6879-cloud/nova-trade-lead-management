import { describe, expect, it } from "vitest";

import { hasPermission } from "@/lib/permissions";

describe("role permission matrix", () => {
  it("lets admins manage crawl, settings, exports, users, and closing", () => {
    expect(hasPermission("admin", "crawl:manage")).toBe(true);
    expect(hasPermission("admin", "settings:manage")).toBe(true);
    expect(hasPermission("admin", "export:csv")).toBe(true);
    expect(hasPermission("admin", "users:manage")).toBe(true);
    expect(hasPermission("admin", "lead:close")).toBe(true);
  });

  it("lets researchers work leads and AI without billing-sensitive controls", () => {
    expect(hasPermission("researcher", "view:workspace")).toBe(true);
    expect(hasPermission("researcher", "lead:update")).toBe(true);
    expect(hasPermission("researcher", "outreach:create")).toBe(true);
    expect(hasPermission("researcher", "demo:create")).toBe(true);
    expect(hasPermission("researcher", "ai:verify")).toBe(true);
    expect(hasPermission("researcher", "crawl:manage")).toBe(false);
    expect(hasPermission("researcher", "settings:manage")).toBe(false);
    expect(hasPermission("researcher", "export:csv")).toBe(false);
    expect(hasPermission("researcher", "users:manage")).toBe(false);
    expect(hasPermission("researcher", "lead:close")).toBe(false);
    expect(hasPermission("researcher", "lead:exclude")).toBe(false);
  });
});
