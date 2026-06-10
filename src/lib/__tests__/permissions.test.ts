import { describe, expect, it } from "vitest";

import { hasPermission } from "@/lib/permissions";

describe("role permission matrix", () => {
  it("lets admins manage crawl, settings, exports, users, and closing", () => {
    expect(hasPermission("admin", "crawl:manage")).toBe(true);
    expect(hasPermission("admin", "settings:manage")).toBe(true);
    expect(hasPermission("admin", "export:csv")).toBe(true);
    expect(hasPermission("admin", "users:manage")).toBe(true);
    expect(hasPermission("admin", "lead:close")).toBe(true);
    expect(hasPermission("admin", "admin_request:manage")).toBe(true);
    expect(hasPermission("admin", "ai:researcher_tools")).toBe(true);
  });

  it("lets researchers work claimed leads and use safe AI tools without admin AI, demo, or billing-sensitive controls", () => {
    expect(hasPermission("researcher", "view:workspace")).toBe(true);
    expect(hasPermission("researcher", "lead:update")).toBe(true);
    expect(hasPermission("researcher", "outreach:create")).toBe(true);
    expect(hasPermission("researcher", "admin_request:create")).toBe(true);
    expect(hasPermission("researcher", "ai:researcher_tools")).toBe(true);
    expect(hasPermission("researcher", "admin_request:manage")).toBe(false);
    expect(hasPermission("researcher", "demo:create")).toBe(false);
    expect(hasPermission("researcher", "ai:verify")).toBe(false);
    expect(hasPermission("researcher", "lead:apply_ai_opportunity")).toBe(false);
    expect(hasPermission("researcher", "crawl:manage")).toBe(false);
    expect(hasPermission("researcher", "settings:manage")).toBe(false);
    expect(hasPermission("researcher", "export:csv")).toBe(false);
    expect(hasPermission("researcher", "users:manage")).toBe(false);
    expect(hasPermission("researcher", "lead:close")).toBe(false);
    expect(hasPermission("researcher", "lead:exclude")).toBe(false);
  });
});
