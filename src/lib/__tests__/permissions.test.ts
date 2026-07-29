import { describe, expect, it } from "vitest";

import { LAUNCH_ROLES } from "@/lib/tenancy/types";
import {
  FUTURE_PERMISSIONS,
  FUTURE_ROLES,
  LEGACY_APP_ROLES,
  LEGACY_PERMISSIONS,
  TENANT_ROLES,
  TENANT_PERMISSION_MATRIX,
  TENANT_PERMISSION_ROWS,
  TENANT_ROLE_COLUMNS,
  getTenantPermissionDecision,
  hasPermission,
  hasTenantPermission,
  isAppRole,
  isTenantPermission,
  isTenantRoleCapable,
  isTenantRole,
} from "@/lib/permissions";
import * as permissionModule from "@/lib/permissions";

const D002_ROLES = [
  "owner",
  "admin",
  "strategist_manager",
  "researcher",
  "reviewer",
  "outreach_operator",
  "analyst_read_only",
] as const;

const D002_MATRIX_ROWS = [
  ["tenant:read", "A", "A", "A", "A", "A", "A", "A"],
  ["tenant:manage", "C", "C", "D", "D", "D", "D", "D"],
  ["tenant:lifecycle", "C", "C", "D", "D", "D", "D", "D"],
  ["workspace:read", "A", "A", "A", "A", "A", "A", "A"],
  ["workspace:manage", "C", "C", "C", "D", "D", "D", "D"],
  ["membership:read", "A", "A", "D", "D", "D", "D", "D"],
  ["membership:invite", "C", "C", "D", "D", "D", "D", "D"],
  ["membership:manage", "C", "C", "D", "D", "D", "D", "D"],
  ["role:assign", "C", "C", "D", "D", "D", "D", "D"],
  ["support:grant", "C", "C", "D", "D", "D", "D", "D"],
  ["knowledge:read", "A", "A", "A", "A", "A", "C", "C"],
  ["knowledge:upload", "A", "A", "A", "C", "D", "D", "D"],
  ["knowledge:manage", "C", "C", "C", "C", "D", "D", "D"],
  ["knowledge:review", "C", "C", "C", "D", "A", "D", "D"],
  ["knowledge:export", "C", "C", "D", "D", "D", "D", "D"],
  ["knowledge:delete", "C", "C", "D", "D", "D", "D", "D"],
  ["understanding:read", "A", "A", "A", "A", "A", "C", "C"],
  ["understanding:edit", "C", "C", "A", "C", "C", "D", "D"],
  ["understanding:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["question:manage", "C", "C", "A", "C", "C", "D", "D"],
  ["question:answer", "A", "A", "A", "A", "A", "C", "D"],
  ["icp:read", "A", "A", "A", "A", "A", "C", "C"],
  ["icp:edit", "C", "C", "A", "C", "C", "D", "D"],
  ["icp:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["play:read", "A", "A", "A", "A", "A", "C", "C"],
  ["play:edit", "C", "C", "A", "C", "C", "D", "D"],
  ["play:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["play:activate", "C", "C", "C", "D", "C", "D", "D"],
  ["play:archive", "C", "C", "C", "D", "C", "D", "D"],
  ["connector:read", "A", "A", "A", "C", "C", "C", "D"],
  ["connector:manage", "C", "C", "D", "D", "D", "D", "D"],
  ["connector:use", "C", "C", "A", "C", "D", "D", "D"],
  ["source:plan", "C", "C", "A", "C", "C", "D", "D"],
  ["source:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["source:execute", "C", "C", "A", "C", "D", "D", "D"],
  ["source:review", "C", "C", "C", "C", "A", "C", "C"],
  ["account:read", "A", "A", "A", "A", "A", "A", "C"],
  ["account:edit", "C", "C", "A", "C", "C", "C", "D"],
  ["account:merge", "C", "C", "C", "D", "C", "D", "D"],
  ["account:archive", "C", "C", "C", "C", "C", "C", "D"],
  ["contact:read", "A", "A", "A", "A", "A", "A", "C"],
  ["contact:research", "C", "C", "A", "C", "C", "C", "D"],
  ["contact:edit", "C", "C", "A", "C", "C", "C", "D"],
  ["contact:use", "C", "C", "C", "D", "C", "C", "D"],
  ["contact:approve", "C", "C", "C", "D", "C", "C", "D"],
  ["buying_center:read", "A", "A", "A", "A", "A", "A", "C"],
  ["buying_center:edit", "C", "C", "A", "C", "C", "C", "D"],
  ["buying_center:approve", "C", "C", "C", "D", "C", "C", "D"],
  ["qualification:read", "A", "A", "A", "A", "A", "A", "C"],
  ["qualification:edit", "C", "C", "A", "C", "C", "C", "D"],
  ["qualification:approve", "C", "C", "C", "D", "C", "D", "D"],
  ["score:read", "A", "A", "A", "A", "A", "A", "A"],
  ["score:recompute", "C", "C", "A", "C", "D", "D", "D"],
  ["score:override", "C", "C", "C", "D", "C", "D", "D"],
  ["review:read", "A", "A", "A", "A", "A", "C", "C"],
  ["review:decide", "C", "C", "C", "D", "A", "D", "D"],
  ["audit:read", "C", "C", "C", "D", "C", "D", "D"],
  ["audit:export", "C", "C", "D", "D", "D", "D", "D"],
  ["outreach:read", "A", "A", "A", "A", "A", "A", "C"],
  ["outreach:draft", "C", "C", "A", "C", "D", "A", "D"],
  ["outreach:edit", "C", "C", "A", "C", "D", "A", "D"],
  ["outreach:approve", "C", "C", "C", "D", "C", "C", "D"],
  ["outreach:copy_export", "C", "C", "C", "C", "C", "A", "D"],
  ["suppression:read", "A", "A", "A", "C", "C", "A", "D"],
  ["suppression:manage", "C", "C", "A", "D", "C", "C", "D"],
  ["outcome:write", "C", "C", "A", "C", "C", "A", "D"],
  ["report:read", "A", "A", "A", "C", "C", "C", "A"],
  ["report:manage", "C", "C", "A", "D", "C", "D", "D"],
  ["usage:read", "C", "C", "C", "D", "C", "D", "C"],
  ["budget:manage", "C", "C", "C", "D", "D", "D", "D"],
  ["queue:read", "A", "A", "A", "A", "C", "C", "C"],
  ["queue:operate", "C", "C", "A", "C", "C", "D", "D"],
  ["feature:manage", "C", "C", "D", "D", "D", "D", "D"],
  ["data:export", "C", "C", "D", "D", "D", "D", "D"],
  ["data:delete", "C", "C", "D", "D", "D", "D", "D"],
] as const;

const D002_LEGACY_ROLE_PERMISSIONS = {
  admin: [...LEGACY_PERMISSIONS],
  researcher: [
    "view:workspace",
    "lead:update",
    "lead:assign",
    "outreach:create",
    "admin_request:create",
    "ai:researcher_tools",
  ],
} as const;

describe("D-002 tenant permission matrix", () => {
  it("has the independently specified seven roles, 75 permissions, and 525 cells", () => {
    const expectedPermissionIds = D002_MATRIX_ROWS.map(([permission]) => permission);

    expect(D002_ROLES).toHaveLength(7);
    expect(expectedPermissionIds).toHaveLength(75);
    expect(D002_ROLES.length * expectedPermissionIds.length).toBe(525);
    expect(TENANT_ROLES).toBe(LAUNCH_ROLES);
    expect(FUTURE_ROLES).toBe(LAUNCH_ROLES);
    expect(FUTURE_ROLES).toEqual(D002_ROLES);
    expect(FUTURE_PERMISSIONS).toEqual(expectedPermissionIds);
    expect(TENANT_PERMISSION_ROWS).toHaveLength(75);
    expect(TENANT_PERMISSION_ROWS.every((row) => row.length === 8)).toBe(true);

    expect(new Set(FUTURE_ROLES).size).toBe(7);
    expect(new Set(FUTURE_PERMISSIONS).size).toBe(75);
    expect(new Set(TENANT_PERMISSION_ROWS.map(([permission]) => permission)).size).toBe(75);
    expect(Object.keys(TENANT_ROLE_COLUMNS)).toHaveLength(7);
  });

  it.each(D002_MATRIX_ROWS)("matches D-002 for %s across every role", (permission, ...expected) => {
    D002_ROLES.forEach((role, index) => {
      const decision = expected[index];
      const evaluation = getTenantPermissionDecision(role, permission);

      expect(TENANT_PERMISSION_MATRIX[role][permission]).toBe(decision);
      expect(evaluation).toEqual({
        decision,
        allowed: decision === "A" || decision === "C",
      });
      expect(hasTenantPermission(role, permission)).toBe(decision !== "D");
    });
  });

  it("preserves all 19 legacy permissions without mapping them to tenant permissions", () => {
    expect(LEGACY_APP_ROLES).toEqual(["admin", "researcher"]);
    expect(LEGACY_PERMISSIONS).toHaveLength(19);
    expect(new Set(LEGACY_PERMISSIONS).size).toBe(19);

    for (const role of LEGACY_APP_ROLES) {
      for (const permission of LEGACY_PERMISSIONS) {
        const expected = (D002_LEGACY_ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
        expect(hasPermission(role, permission)).toBe(expected);
      }
    }
  });

  it("keeps matrix state frozen and legacy capability state private", () => {
    expect(Object.isFrozen(TENANT_PERMISSION_MATRIX)).toBe(true);
    for (const role of D002_ROLES) {
      expect(Object.isFrozen(TENANT_PERMISSION_MATRIX[role])).toBe(true);
    }
    expect("LEGACY_PERMISSION_SETS" in permissionModule).toBe(false);

    const mutableMatrix = TENANT_PERMISSION_MATRIX as unknown as {
      admin: Record<string, string>;
      unknown?: unknown;
    };
    try {
      mutableMatrix.admin["tenant:read"] = "D";
      mutableMatrix.admin.unknown = "A";
      mutableMatrix.unknown = {};
    } catch {
      // Frozen objects may reject mutation in strict mode; either way state stays unchanged.
    }

    expect(getTenantPermissionDecision("admin", "tenant:read")).toEqual({
      decision: "A",
      allowed: true,
    });
    expect("unknown" in TENANT_PERMISSION_MATRIX.admin).toBe(false);
    expect("unknown" in TENANT_PERMISSION_MATRIX).toBe(false);

    const mutableLegacyPermissions = LEGACY_PERMISSIONS as unknown as string[];
    try {
      mutableLegacyPermissions.push("tenant:read");
    } catch {
      // LEGACY_PERMISSIONS is frozen; private Sets also never consume consumer mutations.
    }
    expect(hasPermission("admin", "tenant:read")).toBe(false);
    expect(hasPermission("admin", "view:workspace")).toBe(true);
  });

  it("exposes conditional role capability without treating it as final authorization", () => {
    expect(getTenantPermissionDecision("admin", "tenant:manage")).toEqual({
      decision: "C",
      allowed: true,
    });
    expect(isTenantRoleCapable("admin", "tenant:manage")).toBe(true);
    expect(hasTenantPermission("admin", "tenant:manage")).toBe(true);
  });

  it("denies unknown values without throwing", () => {
    expect(() => hasPermission("unknown-role", "view:workspace")).not.toThrow();
    expect(() => hasTenantPermission("unknown-role", "tenant:read")).not.toThrow();
    expect(hasPermission("unknown-role", "view:workspace")).toBe(false);
    expect(hasPermission("admin", "unknown-permission")).toBe(false);
    expect(hasTenantPermission("unknown-role", "tenant:read")).toBe(false);
    expect(hasTenantPermission("admin", "unknown-permission")).toBe(false);
    expect(getTenantPermissionDecision("unknown-role", "tenant:read")).toEqual({
      decision: "D",
      allowed: false,
    });
    expect(getTenantPermissionDecision("admin", "unknown-permission")).toEqual({
      decision: "D",
      allowed: false,
    });
  });

  it("keeps overlapping role and permission strings family-scoped", () => {
    expect(isAppRole("admin")).toBe(true);
    expect(isTenantRole("admin")).toBe(true);
    expect(isAppRole("researcher")).toBe(true);
    expect(isTenantRole("researcher")).toBe(true);
    expect(isTenantPermission("view:workspace")).toBe(false);
    expect(isTenantPermission("tenant:read")).toBe(true);

    expect(hasPermission("admin", "tenant:read")).toBe(false);
    expect(hasPermission("researcher", "tenant:read")).toBe(false);
    expect(hasTenantPermission("admin", "view:workspace")).toBe(false);
    expect(hasTenantPermission("researcher", "lead:update")).toBe(false);
    expect(hasPermission("admin", "view:workspace")).toBe(true);
    expect(hasTenantPermission("admin", "tenant:read")).toBe(true);
  });
});
