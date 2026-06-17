import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("protected layout fulfillment badge", () => {
  it("queries fulfillment pressure for admins only and fails closed", () => {
    const source = readFileSync(join(process.cwd(), "src/app/(protected)/layout.tsx"), "utf8");

    expect(source).toContain('session.role === "admin"');
    expect(source).toContain("getAdminFulfillmentSummary");
    expect(source).toContain("fulfillmentCount = (await getAdminFulfillmentSummary()).openTotal");
    expect(source).toContain("catch");
    expect(source).toContain("fulfillmentCount = 0");
    expect(source).toContain("fulfillmentCount={fulfillmentCount}");
  });
});
