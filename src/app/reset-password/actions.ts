"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isAuthConfigured } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const updatePasswordSchema = z.object({
  password: z.string().min(12, "Password must be at least 12 characters."),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
});

export async function updatePasswordAction(formData: FormData) {
  if (!(await isAuthConfigured())) {
    redirect("/reset-password?error=missing_config");
  }

  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    redirect(`/reset-password?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid password.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/forgot-password?error=expired_link");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?reset=success");
}
