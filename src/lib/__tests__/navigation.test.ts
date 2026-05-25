import { describe, expect, it } from "vitest";
import { PRIMARY_NAV_ITEMS } from "@/lib/navigation";

describe("primary navigation", () => {
  it("puts explore before workbench", () => {
    expect(PRIMARY_NAV_ITEMS.slice(0, 2).map((item) => item.label)).toEqual(["Explore", "Workbench"]);
  });
});
