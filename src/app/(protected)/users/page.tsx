import type { Metadata } from "next";

import { PageShell } from "@/components/page-shell";
import { listUsersAction } from "@/lib/users/actions";
import { UsersClient } from "./users-client";

export const metadata: Metadata = { title: "Users | NoSite Leads" };

export default async function UsersPage() {
  const users = await listUsersAction();
  const active = users.filter((user) => user.status === "active").length;
  const researchers = users.filter((user) => user.role === "researcher").length;

  return (
    <PageShell
      title="Users"
      description="Manage who can work leads and who can control crawls, settings, exports, and billing-sensitive actions."
      stats={[
        { label: "Active Users", value: String(active) },
        { label: "Admins", value: String(users.filter((user) => user.role === "admin").length) },
        { label: "Researchers", value: String(researchers) },
        { label: "Disabled", value: String(users.length - active) },
      ]}
    >
      <UsersClient initialUsers={users} />
    </PageShell>
  );
}
