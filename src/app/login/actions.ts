"use server";

import { redirect } from "next/navigation";

import { isAuthConfigured } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loginAction(formData: FormData) {
  if (!(await isAuthConfigured())) {
    redirect("/login?error=missing_config");
  }

  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    redirect("/login?error=invalid_credentials");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    redirect("/login?error=invalid_credentials");
  }

  redirect("/queue");
}

export async function logoutAction() {
  if (await isAuthConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
