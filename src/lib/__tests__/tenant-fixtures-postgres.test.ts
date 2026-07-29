import { describe, expect, it } from "vitest";
import { CANONICAL_TENANT_FIXTURE_CATALOG, CANONICAL_TENANT_FIXTURE_COUNTS } from "@/test/tenants";

describe("canonical tenant fixture PostgreSQL contract", () => {
  it("is browser-safe, deterministic, and includes sibling workspaces", () => {
    expect(CANONICAL_TENANT_FIXTURE_CATALOG.workspaces).toHaveLength(CANONICAL_TENANT_FIXTURE_COUNTS.workspaces);
    expect(CANONICAL_TENANT_FIXTURE_CATALOG.workspaces.filter((workspace) => workspace.tenantKey === "A")).toHaveLength(2);
    expect(CANONICAL_TENANT_FIXTURE_CATALOG.workspaces.filter((workspace) => workspace.tenantKey === "B")).toHaveLength(2);
  });
});
