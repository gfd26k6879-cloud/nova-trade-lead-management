# Deterministic multitenant fixtures

The browser-safe canonical fixture catalog uses fixed synthetic IDs only. It creates two tenants, two active workspaces per tenant, every launch role, and pending, suspended, and disabled membership cases. Setup is transactional; callers use the fixture transaction coordinator and rollback wrapper so callback rows are removed too. The sibling workspaces and same labels/slugs provide deterministic cross-tenant and sibling-workspace negative selectors without external authentication or production data.
