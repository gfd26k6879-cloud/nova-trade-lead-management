"use server";

import { redirect } from "next/navigation";

import { getSession, isAuthConfigured } from "@/lib/auth";
import { recordOperationalEvent } from "@/lib/operational-logging";
import { startRouteTiming } from "@/lib/route-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loginAction(formData: FormData) {
  const logRouteTiming = startRouteTiming("/login");
  if (!(await isAuthConfigured())) {
    logRouteTiming(500, { reason: "missing_auth_config" });
    await recordOperationalEvent({
      action: "auth_login_failed",
      category: "auth",
      severity: "error",
      entityType: "auth",
      metadata: { reason: "missing_auth_config" },
    });
    redirect("/login?error=missing_config");
  }

  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    logRouteTiming(400, { reason: "invalid_form" });
    await recordOperationalEvent({
      action: "auth_login_failed",
      category: "auth",
      severity: "warn",
      entityType: "auth",
      metadata: { reason: "invalid_form" },
    });
    redirect("/login?error=invalid_credentials");
  }

  const normalizedEmail = email.trim().toLowerCase();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (error) {
    logRouteTiming(401, { reason: "invalid_credentials" });
    await recordOperationalEvent({
      action: "auth_login_failed",
      category: "auth",
      severity: "warn",
      entityType: "auth",
      actor: { email: normalizedEmail },
      metadata: { email: normalizedEmail, reason: "invalid_credentials" },
    });
    redirect("/login?error=invalid_credentials");
  }

  await recordOperationalEvent({
    action: "auth_login_succeeded",
    category: "auth",
    severity: "info",
    entityType: "auth",
    entityId: data.user?.id ?? null,
    actor: { userId: data.user?.id ?? null, email: data.user?.email ?? normalizedEmail },
    metadata: { email: data.user?.email ?? normalizedEmail },
  });
  logRouteTiming(307, { result: "success" });
  redirect("/queue");
}

export async function logoutAction() {
  const session = await getSession({ allowInactive: true }).catch(() => null);
  if (await isAuthConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  await recordOperationalEvent({
    action: "auth_logout",
    category: "auth",
    severity: "info",
    entityType: "auth",
    entityId: session?.userId ?? null,
    actor: session
      ? { userId: session.userId, email: session.email, role: session.role ?? null }
      : null,
    metadata: { email: session?.email ?? null },
  });
  redirect("/login");
}
