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
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <NavHeader email={session.email} logoutAction={logoutAction} />
      <main className="mx-auto w-full max-w-7xl px-6 py-7">{children}</main>
    </div>
  );
}
