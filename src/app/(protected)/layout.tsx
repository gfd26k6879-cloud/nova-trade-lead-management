import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { logoutAction } from "@/app/login/actions";
import { getSession, getTenantSession } from "@/lib/auth";
import { NavHeader } from "@/components/nav-header";
import { withTenantDbContext } from "@/lib/db";
import { getAdminFulfillmentSummary } from "@/lib/db/queries";
import { assertTenantPermission } from "@/lib/tenancy/authorize";
import { runWithTenantContext } from "@/lib/tenancy/context";

export const dynamic = "force-dynamic";

const LEGACY_PREVIEW_SHELL_SCOPE = {
  tenantLabel: "Legacy compatibility",
  workspaceLabel: "Legacy website leads",
  roleLabel: "Tenant role unavailable",
  preview: true,
};

export default async function ProtectedLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getSession({ allowInactive: true });

  if (!session) {
    redirect("/login");
  }

  if ("status" in session) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <main className="glass-lg w-full max-w-md rounded-3xl p-10 text-center">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            {session.status === "disabled" ? "Access Disabled" : "Access Pending"}
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            {session.status === "disabled"
              ? "Your workspace access is disabled. Ask an admin to re-enable your account."
              : "You are signed in, but an admin has not granted workspace access yet."}
          </p>
          <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
            {session.email}
          </p>
          <form action={logoutAction} className="mt-6">
            <button type="submit" className="btn-primary">
              Log out
            </button>
          </form>
        </main>
      </div>
    );
  }

  let tenantSession = null;
  try {
    tenantSession = await getTenantSession({});
  } catch {
    // Scope resolution is deliberately non-enumerating. The legacy preview is
    // informational only and never grants tenant authority.
    tenantSession = null;
  }

  const shellScope = tenantSession?.userId === session.userId
    ? {
        tenantLabel: `Tenant ID · ${tenantSession.tenantId}`,
        workspaceLabel: tenantSession.workspaceId
          ? `Workspace ID · ${tenantSession.workspaceId}`
          : null,
        roleLabel: tenantSession.role,
        preview: false,
      }
    : LEGACY_PREVIEW_SHELL_SCOPE;

  let fulfillmentCount = 0;
  if (
    session.role === "admin"
    && tenantSession?.userId === session.userId
    && tenantSession.workspaceId === null
  ) {
    try {
      await assertTenantPermission(tenantSession, "account:read", { action: "layout.fulfillment.badge" });
      fulfillmentCount = await runWithTenantContext(
        tenantSession,
        `protected-layout:${randomUUID()}`,
        () => withTenantDbContext(async () => (await getAdminFulfillmentSummary()).openTotal),
      );
    } catch {
      fulfillmentCount = 0;
    }
  }

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-[var(--surface-card)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] shadow-lg transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>
      <NavHeader
        email={session.email}
        role={session.role}
        scope={shellScope}
        fulfillmentCount={fulfillmentCount}
        logoutAction={logoutAction}
      />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1360px] px-4 py-5 sm:px-6 sm:py-7">{children}</main>
    </div>
  );
}
