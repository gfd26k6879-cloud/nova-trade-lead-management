"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { isAuthConfigured } from "@/lib/auth";
import { recordOperationalEvent } from "@/lib/operational-logging";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const updatePasswordSchema = z.object({
  password: z.string().min(12, "Password must be at least 12 characters."),
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.",
});

export async function updatePasswordAction(formData: FormData) {
  if (!(await isAuthConfigured())) {
    await recordOperationalEvent({
      action: "auth_password_update_failed",
      category: "auth",
      severity: "error",
      entityType: "auth",
      metadata: { reason: "missing_auth_config" },
    });
    redirect("/reset-password?error=missing_config");
  }

  const parsed = updatePasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    await recordOperationalEvent({
      action: "auth_password_update_failed",
      category: "auth",
      severity: "warn",
      entityType: "auth",
      metadata: { reason: "invalid_password_form" },
    });
    redirect(`/reset-password?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid password.")}`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: userError } = await supabase.auth.getUser();

  if (userError || !data.user) {
    await recordOperationalEvent({
      action: "auth_password_update_failed",
      category: "auth",
      severity: "warn",
      entityType: "auth",
      metadata: { reason: "expired_or_missing_session", error: userError?.message ?? null },
    });
    redirect("/forgot-password?error=expired_link");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    await recordOperationalEvent({
      action: "auth_password_update_failed",
      category: "auth",
      severity: "warn",
      entityType: "auth",
      entityId: data.user.id,
      actor: { userId: data.user.id, email: data.user.email ?? null },
      metadata: { email: data.user.email ?? null, reason: "supabase_update_error", error: error.message },
    });
    redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
  }

  await recordOperationalEvent({
    action: "auth_password_updated",
    category: "auth",
    severity: "info",
    entityType: "auth",
    entityId: data.user.id,
    actor: { userId: data.user.id, email: data.user.email ?? null },
    metadata: { email: data.user.email ?? null },
  });
  await supabase.auth.signOut({ scope: "global" });

  redirect("/login?reset=success");
}
