import { describe, expect, it } from "vitest";
import { ADMIN_NAV_ITEMS, PRIMARY_NAV_ITEMS } from "@/lib/navigation";

describe("primary navigation", () => {
  it("puts explore before workbench", () => {
    expect(PRIMARY_NAV_ITEMS.slice(0, 2).map((item) => item.label)).toEqual(["Explore", "Workbench"]);
  });

  it("keeps admin navigation focused on core operator routes", () => {
    expect(ADMIN_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Admin Home",
      "Discovery",
      "Monitor",
      "Fulfillment",
      "All Leads",
      "Quality",
      "Scheduler",
      "Statistics",
      "Settings",
      "Users",
    ]);
    expect(ADMIN_NAV_ITEMS.find((item) => item.label === "Discovery")?.href).toBe("/dashboard#discovery");
  });
});
