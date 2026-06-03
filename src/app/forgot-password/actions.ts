"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { buildPasswordRecoveryUrl, resolveCanonicalAppUrl } from "@/lib/app-url";
import { isAuthConfigured } from "@/lib/auth";
import { startRouteTiming } from "@/lib/route-timing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const resetRequestSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
});

export async function requestPasswordResetAction(formData: FormData) {
  const logRouteTiming = startRouteTiming("/forgot-password");
  if (!(await isAuthConfigured())) {
    logRouteTiming(500, { reason: "missing_auth_config" });
    redirect("/forgot-password?error=missing_config");
  }

  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    logRouteTiming(400, { reason: "invalid_email" });
    redirect("/forgot-password?error=invalid_email");
  }

  const headerStore = await headers();
  const origin = resolveCanonicalAppUrl(headerStore.get("origin"));

  if (!origin) {
    logRouteTiming(500, { reason: "missing_origin" });
    redirect("/forgot-password?error=missing_origin");
  }

  const redirectTo = buildPasswordRecoveryUrl("/reset-password", origin);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo,
  });

  if (error) {
    logRouteTiming(400, { reason: "supabase_reset_error", error: error.message });
    redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
  }

  logRouteTiming(200, { result: "sent" });
  redirect("/forgot-password?sent=1");
}
