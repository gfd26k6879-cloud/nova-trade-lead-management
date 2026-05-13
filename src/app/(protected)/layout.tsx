import { redirect } from "next/navigation";

import { logoutAction } from "@/app/login/actions";
import { getSession } from "@/lib/auth";
import { NavHeader } from "@/components/nav-header";

export const dynamic = "force-dynamic";

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

  return (
    <div className="min-h-screen">
      <NavHeader email={session.email} role={session.role} logoutAction={logoutAction} />
      <main className="mx-auto w-full max-w-7xl px-6 py-7">{children}</main>
    </div>
  );
}
