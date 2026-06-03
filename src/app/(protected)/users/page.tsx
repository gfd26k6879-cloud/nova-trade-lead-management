import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { listAppUsers, type AppUser } from "@/lib/app-users";
import { requirePermission } from "@/lib/auth";
import { withDbStatementTimeout } from "@/lib/db/index";
import { ensureDbReady, listLocationMarkets, listUserMarketAccessForUsers, type LocationMarket, type UserMarketAccess } from "@/lib/db/queries";
import { startRouteTiming } from "@/lib/route-timing";
import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Users | NoSite Leads" };

export default async function UsersPage() {
  const logRouteTiming = startRouteTiming("/users");
  await requirePermission("users:manage");

  let users: AppUser[] = [];
  let markets: LocationMarket[] = [];
  let accessByUser: Record<string, UserMarketAccess[]> = {};
  let degradedReason: string | null = null;

  try {
    const loaded = await withDbStatementTimeout(10_000, async () => {
      await ensureDbReady();
      const loadedUsers = await listAppUsers();
      const loadedMarkets = await listLocationMarkets();
      const loadedAccess = await listUserMarketAccessForUsers(loadedUsers.map((user) => user.user_id));
      return { users: loadedUsers, markets: loadedMarkets, accessByUser: loadedAccess };
    });
    users = loaded.users;
    markets = loaded.markets;
    accessByUser = loaded.accessByUser;
    logRouteTiming(200);
  } catch (error) {
    degradedReason = error instanceof Error ? error.message : "Users could not be loaded before the page timeout.";
    logRouteTiming(503, { reason: "users_load_error" });
  }

  const active = users.filter((user) => user.status === "active").length;
  const researchers = users.filter((user) => user.role === "researcher").length;

  return (
    <PageShell
      title="Users"
      description={degradedReason
        ? "User and territory data is taking too long to load. Retry in a moment; the rest of the workspace remains available."
        : "Manage who can work leads and who can control crawls, settings, exports, and billing-sensitive actions."}
      stats={[
        { label: "Active Users", value: String(active) },
        { label: "Admins", value: String(users.filter((user) => user.role === "admin").length) },
        { label: "Researchers", value: String(researchers) },
        { label: "Disabled", value: String(users.length - active) },
      ]}
    >
      {degradedReason && (
        <section className="glass rounded-2xl p-5">
          <p className="section-label">Users temporarily unavailable</p>
          <p className="mt-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            Territory assignment data did not finish loading fast enough. Use refresh to retry.
          </p>
        </section>
      )}
      <UsersClient initialUsers={users} markets={markets} initialMarketAccess={accessByUser} />
    </PageShell>
  );
}
