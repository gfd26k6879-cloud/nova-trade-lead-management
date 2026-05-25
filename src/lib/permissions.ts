export type AppRole = "admin" | "researcher";

export type Permission =
  | "view:workspace"
  | "lead:update"
  | "lead:close"
  | "lead:exclude"
  | "lead:apply_ai_usable_website"
  | "lead:apply_ai_opportunity"
  | "lead:assign"
  | "lead:admin_assign"
  | "outreach:create"
  | "admin_request:create"
  | "admin_request:manage"
  | "demo:create"
  | "ai:verify"
  | "crawl:manage"
  | "settings:manage"
  | "export:csv"
  | "users:manage"
  | "scores:recompute";

const ADMIN_PERMISSIONS = new Set<Permission>([
  "view:workspace",
  "lead:update",
  "lead:close",
  "lead:exclude",
  "lead:apply_ai_usable_website",
  "lead:apply_ai_opportunity",
  "lead:assign",
  "lead:admin_assign",
  "outreach:create",
  "admin_request:create",
  "admin_request:manage",
  "demo:create",
  "ai:verify",
  "crawl:manage",
  "settings:manage",
  "export:csv",
  "users:manage",
  "scores:recompute",
]);

const RESEARCHER_PERMISSIONS = new Set<Permission>([
  "view:workspace",
  "lead:update",
  "lead:assign",
  "outreach:create",
  "admin_request:create",
]);

export function hasPermission(role: AppRole, permission: Permission): boolean {
  return role === "admin"
    ? ADMIN_PERMISSIONS.has(permission)
    : RESEARCHER_PERMISSIONS.has(permission);
}

export function isAppRole(value: unknown): value is AppRole {
  return value === "admin" || value === "researcher";
}
