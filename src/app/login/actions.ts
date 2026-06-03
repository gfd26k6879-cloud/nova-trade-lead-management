"use server";

import { redirect } from "next/navigation";

import { isAuthConfigured } from "@/lib/auth";
import { startRouteTiming } from "@/lib/route-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loginAction(formData: FormData) {
  const logRouteTiming = startRouteTiming("/login");
  if (!(await isAuthConfigured())) {
    logRouteTiming(500, { reason: "missing_auth_config" });
    redirect("/login?error=missing_config");
  }

  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    logRouteTiming(400, { reason: "invalid_form" });
    redirect("/login?error=invalid_credentials");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    logRouteTiming(401, { reason: "invalid_credentials" });
    redirect("/login?error=invalid_credentials");
  }

  logRouteTiming(307, { result: "success" });
  redirect("/queue");
}

export async function logoutAction() {
  if (await isAuthConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
